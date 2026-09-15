import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const user = { id: 'account-fixture-user', email: 'fixture@example.test' };
const token = { access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_in: 3600, user };
async function mockAccount(page, { status = 'approved', startError = false, addonError = false } = {}) {
  const requests = [];
  await page.route('https://api.nuvio.tv/**', async route => {
    const req = route.request(), u = new URL(req.url()); requests.push({ path: u.pathname, body: req.postDataJSON(), query: u.search, headers: req.headers() });
    const json = value => route.fulfill({ json: value, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.pathname.endsWith('start_device_login_session')) return startError ? route.fulfill({ status: 503, json: {} }) : json([{ device_code: 'device-fixture', user_code: 'ABCD-EFGH', verification_uri: 'https://nuvio.tv/link', verification_uri_complete: 'https://nuvio.tv/link?code=ABCD-EFGH', expires_at: new Date(Date.now() + 600000).toISOString(), poll_interval_seconds: 2 }]);
    if (u.pathname.endsWith('poll_tv_login_session')) return json([{ status, poll_interval_seconds: 2 }]);
    if (u.pathname.endsWith('tv-logins-exchange')) return json(token);
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname === '/auth/v1/token') return json({ ...token, access_token: 'fixture-renewed-access', refresh_token: 'fixture-renewed-refresh' });
    if (u.pathname.endsWith('sync_pull_profiles')) return json([{profile_index:1,name:'Principal'}]);
    if (u.pathname.endsWith('sync_pull_profile_locks')) return json([{profile_index:1,pin_enabled:false}]);
    if(u.pathname.endsWith('sync_pull_profile_settings_blob'))return json([{profile_id:req.postDataJSON()?.p_profile_id,settings_json:{features:{trakt_settings:{watch_progress_source:{type:'string',value:'NUVIO_SYNC'}}}}}]);
    if(u.pathname.endsWith('sync_pull_watch_progress') || u.pathname.endsWith('sync_pull_watched_items'))return json([]);
    if (u.pathname.endsWith('sync_pull_library')) return json([]);
    if (u.pathname.endsWith('sync_pull_collections')) return json([]);
    if (u.pathname.endsWith('get_sync_owner')) return json('fixture-sync-owner');
    if (u.pathname === '/rest/v1/addons') return json([{ url: 'https://account-addon.fixture/configuration/manifest.json', name: 'Addon da conta', sort_order: 0, enabled: true, profile_id: 1 }, { url: 'https://disabled.fixture/manifest.json', enabled: false }]);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    return route.abort();
  });
  await page.route('https://account-addon.fixture/**', async route => {
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers().apikey).toBeUndefined();
    if (addonError) return route.abort();
    const json = value => route.fulfill({ json: value, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (route.request().url().endsWith('manifest.json')) return json({ id: 'account.fixture', name: 'Addon original', resources: ['catalog'], catalogs: [{ id: 'account', type: 'movie', name: 'Minha coleção' }] });
    return json({ metas: [{ id: 'fixture-movie', type: 'movie', name: 'Filme da conta', releaseInfo: '2026' }] });
  });
  return requests;
}
async function accountSettings(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
}
test('first launch → QR approval → account addons → restored login → sign out only this TV', async ({ page }) => {
  const requests = await mockAccount(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Nuvio' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  await expect(page.getByLabel('Código de vinculação')).toHaveText('ABCD-EFGH');
  await expect(page.locator('.auth-qr canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/account-qr-1920.png' });
  await expect(page.getByRole('heading', { name: 'Minha coleção' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Filme da conta', exact: true })).toBeVisible();
  expect(requests.some(r => r.path.includes('sync_push'))).toBe(false);
  expect(requests.find(r => r.path.endsWith('/addons')).query).toContain('profile_id=eq.1');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minha coleção' })).toBeVisible();
  await accountSettings(page);
  await expect(page.getByText('fixture@example.test', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sincronizar addons/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/account-connected-1920.png' });
  await page.getByRole('button', { name: /^Sair da conta/ }).click();
  await page.getByRole('button', { name: 'Sair desta TV', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Entrar com Nuvio/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nuvio-fork.webos.account.v1'))).toBeNull();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));
  expect(state.addons).toEqual([]);
  expect(requests.find(r => r.path.endsWith('/logout')).query).toBe('?scope=local');
  expect(errors).toEqual([]);
});
test('code expiration allows regeneration and back cancels polling', async ({ page }) => {
  const requests = await mockAccount(page, { status: 'expired' });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  await expect(page.getByText('O código expirou. Gere um novo código.')).toBeVisible({ timeout: 7000 });
  await expect(page.locator('.auth-qr canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerar novo código' }).click();
  await expect(page.getByLabel('Código de vinculação')).toHaveText('ABCD-EFGH');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Nuvio' })).toBeVisible();
  const polls = requests.filter(r => r.path.endsWith('poll_tv_login_session')).length;
  await page.waitForTimeout(2500); // Must exceed the advertised poll interval to detect leaked polling.
  expect(requests.filter(r => r.path.endsWith('poll_tv_login_session'))).toHaveLength(polls);
  expect(requests.filter(r => r.path.endsWith('tv-logins-exchange'))).toHaveLength(0);
});
test('service failure is actionable and guest path remains usable', async ({ page }) => {
  await mockAccount(page, { startError: true });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  await expect(page.getByText(/serviço Nuvio está temporariamente indisponível/)).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Continuar sem conta' }).click();
  await expect(page.getByText('Nenhum addon instalado. Adicione um para começar.')).toBeVisible();
  await accountSettings(page); await expect(page.getByRole('button', { name: /^Entrar com Nuvio/ })).toBeVisible();
});
test('addon failure preserves login, lands on Home and exposes the retry in Ajustes', async ({ page }) => {
  await mockAccount(page, { addonError: true });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  // Entering the account lands on the Home; a failed import is a message, not a detour.
  await expect(page.getByText('Nenhum addon instalado. Adicione um para começar.')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#toast')).toContainText('não responderam');
  await accountSettings(page);
  await expect(page.locator('.account-sync-status')).toContainText('1 não responderam');
  await expect(page.getByRole('button', { name: /^Sincronizar addons/ })).toBeVisible();
});
test('expired saved session renews on boot and packaged file entry can display QR', async ({ page }) => {
  const requests = await mockAccount(page, { status: 'pending' });
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  await expect(page.locator('.auth-qr canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/account-qr-packaged-1920.png' });
  await page.evaluate(({ token }) => localStorage.setItem('nuvio-fork.webos.account.v1', JSON.stringify({ ...token, expires_at: 0 })), { token });
  await page.reload();
  await expect(page.locator('.sidebar')).toBeVisible();
  expect(requests.some(r => r.query === '?grant_type=refresh_token')).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.account.v1')).refresh_token)).toBe('fixture-renewed-refresh');
});
