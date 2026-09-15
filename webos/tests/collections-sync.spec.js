import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const user = { id: 'account-fixture-user', email: 'fixture@example.test' };
const token = { access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_in: 3600, user };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
const movie = { id: 'tt1000001', type: 'movie', name: 'Filme da fileira', releaseInfo: '2024', poster: origin + '/poster.svg' };
// Exactly what the Android CollectionsDataStore writes into the profile blob.
const accountCollections = [{
  id: 'acc1', title: 'Sagas do Xperience', pinToTop: true, viewMode: 'TABBED_GRID', showAllTab: true,
  folders: [{
    id: 'f1', title: 'Star Wars', tileShape: 'POSTER', hideTitle: false,
    sources: [{ provider: 'addon', addonId: 'local.test', type: 'movie', catalogId: 'test' }, { provider: 'trakt', traktListId: 5, title: 'Lista do Trakt' }]
  }]
}];
async function mockAccount(page) {
  const requests = [];
  await page.route('https://api.nuvio.tv/**', async route => {
    const req = route.request(), u = new URL(req.url()); requests.push({ path: u.pathname, body: req.postDataJSON() });
    const json = value => route.fulfill({ json: value, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.pathname.endsWith('start_device_login_session')) return json([{ device_code: 'device-fixture', user_code: 'ABCD-EFGH', verification_uri: 'https://nuvio.tv/link', verification_uri_complete: 'https://nuvio.tv/link?code=ABCD-EFGH', expires_at: new Date(Date.now() + 600000).toISOString(), poll_interval_seconds: 2 }]);
    if (u.pathname.endsWith('poll_tv_login_session')) return json([{ status: 'approved', poll_interval_seconds: 2 }]);
    if (u.pathname.endsWith('tv-logins-exchange')) return json(token);
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname.endsWith('sync_pull_profiles')) return json([{ profile_index: 1, name: 'Principal' }]);
    if (u.pathname.endsWith('sync_pull_profile_locks')) return json([{ profile_index: 1, pin_enabled: false }]);
    if (u.pathname.endsWith('sync_pull_profile_settings_blob')) return json([{ profile_id: 1, settings_json: { features: {} } }]);
    if (u.pathname.endsWith('sync_pull_watch_progress') || u.pathname.endsWith('sync_pull_watched_items') || u.pathname.endsWith('sync_pull_library')) return json([]);
    if (u.pathname.endsWith('get_sync_owner')) return json('fixture-sync-owner');
    if (u.pathname === '/rest/v1/addons') return json([{ url: 'https://account-addon.fixture/configuration/manifest.json', name: 'Addon da conta', sort_order: 0, enabled: true, profile_id: 1 }]);
    if (u.pathname.endsWith('sync_pull_collections')) return json([{ profile_id: 1, collections_json: accountCollections, updated_at: new Date().toISOString() }]);
    if (u.pathname.endsWith('sync_push_collections')) return json(null);
    return route.abort();
  });
  await page.route(origin + '/**', route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.includes('/stream/')) return json({ streams: [{ name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4' }] });
    if (p.endsWith('.mp4')) return route.fulfill({ contentType: 'video/mp4', body: fs.readFileSync('tests/fixtures/clip.mp4'), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' } });
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    return route.abort();
  });
  await page.route('https://account-addon.fixture/**', route => {
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (route.request().url().endsWith('manifest.json')) return json({ id: 'local.test', name: 'Addon da conta', resources: ['catalog', 'meta'], types: ['movie'], idPrefixes: ['tt'], catalogs: [{ id: 'test', type: 'movie', name: 'Coleção de teste' }] });
    return json({ metas: [movie] });
  });
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
  return requests;
}
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
test('collections built in another client arrive with the account and travel back on edit', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const requests = await mockAccount(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar com Nuvio', exact: true }).click();
  // Entering the account pulls collections along with the addons: the row appears on the Home.
  const rail = page.locator('.home-rows .catalog-section', { hasText: 'Star Wars' });
  await expect(rail).toBeVisible({ timeout: 15000 });
  // One folder per collection: the rail carries the folder title, like the fork.
  await expect(rail.locator('h2')).toHaveText('Star Wars');
  await expect(rail.locator('.card').first()).toContainText('Filme da fileira');
  await expect.poll(() => requests.filter(r => r.path.endsWith('sync_pull_collections')).length).toBeGreaterThan(0);
  // The management screen shows the imported collection and its sync state.
  await page.keyboard.press('Escape');
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Conteúdo e Descoberta', exact: true }).click();
  await page.getByRole('button', { name: /^Coleções/ }).click();
  await expect(page.locator('.collection-row')).toContainText('Sagas do Xperience');
  await expect(page.locator('.settings-note')).toContainText('1 coleção(ões) da conta');
  // The folder keeps the Trakt source visibly unsupported instead of losing it.
  await page.locator('.collection-open').click();
  await expect(page.locator('.collection-source').nth(1)).toContainText('Lista do Trakt');
  // An edit here is pushed to the account in the same shape the Android client reads.
  await page.getByRole('button', { name: 'Desafixar do topo' }).click();
  await expect.poll(() => requests.filter(r => r.path.endsWith('sync_push_collections')).length, { timeout: 5000 }).toBeGreaterThan(0);
  const pushed = requests.filter(r => r.path.endsWith('sync_push_collections')).pop();
  expect(pushed.body.p_collections_json[0].pinToTop).toBe(false);
  expect(pushed.body.p_collections_json[0].folders[0].sources[0]).toMatchObject({ provider: 'addon', addonId: 'local.test', type: 'movie', catalogId: 'test' });
  expect(pushed.body.p_collections_json[0].folders[0].sources[1].provider).toBe('trakt');
  expect(errors).toEqual([]);
});


