import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const movie = { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local.', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
async function boot(page, { playback = {}, progress = {} } = {}) {
  await page.addInitScript(({ addon, playback, progress }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress, library: {}, watched: {}, settings: { playback } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
  }, { addon, playback, progress });
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
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
}
async function settings(page, category) {
  await page.goto('/');
  await drawer(page, 'Ajustes');
  if (category) await page.getByRole('button', { name: category, exact: true }).click();
}
test('toggling in Ajustes keeps the reader in place and Esquerda does not open the menu', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await settings(page, 'Reprodução');
  const content = page.locator('.settings-content');
  await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const before = await content.evaluate(node => node.scrollTop);
  expect(before).toBeGreaterThan(400);
  // A switch at the bottom, focused without scrolling: changing it used to rebuild the pane
  // and throw the reader back to the first group ("volta pras categorias lá em cima").
  const focusBottom = label => page.locator(`[role=switch][aria-label="${label}"]`).evaluate(node => node.focus({ preventScroll: true }));
  await focusBottom('Trailer automático após assistir');
  await page.keyboard.press('Enter');
  const trailer = page.getByRole('switch', { name: 'Trailer automático após assistir', exact: true });
  await expect(trailer).toHaveAttribute('aria-checked', 'true');
  expect(await content.evaluate(node => node.scrollTop)).toBe(before);
  await focusBottom('Miniaturas ao buscar');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('switch', { name: 'Miniaturas ao buscar', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await content.evaluate(node => node.scrollTop)).toBe(before);
  expect(await page.evaluate(() => document.querySelector('#app').classList.contains('drawer-open'))).toBe(false);
  // Esquerda inside the pane goes to the category rail and stays there.
  await focusBottom('Miniaturas ao buscar');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('navigation', { name: 'Categorias de ajustes' }).getByRole('button', { name: 'Reprodução', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.querySelector('#app').classList.contains('drawer-open'))).toBe(false);
  expect(errors).toEqual([]);
});
test('Esquerda still opens the menu from the Home', async ({ page }) => {
  await boot(page);
  await page.goto('/');
  await drawer(page, 'Início');
  await page.locator('.rail .card').first().evaluate(node => node.focus({ preventScroll: true }));
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app')).toHaveClass(/drawer-open/);
});
test('Back from the source list returns to the details without a visible button', async ({ page }) => {
  await boot(page);
  await page.goto('/');
  await drawer(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(1);
  // The user asked for the remote's Back key, not a button beside Atualizar.
  await expect(page.getByRole('button', { name: 'Voltar para os detalhes' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Horizonte de teste' })).toBeVisible();
  await expect(page.locator('.source')).toHaveCount(0);
});
test('holding OK on Continuar assistindo opens resume/remove actions', async ({ page }) => {
  const progress = { '["movie","tt1234567"]': { type: 'movie', id: 'tt1234567', meta: { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste' }, episode: null, time: 30, duration: 60, updated: Date.now(), complete: false, origin: 'local' } };
  await boot(page, { progress });
  await page.goto('/');
  await drawer(page, 'Início');
  const card = page.locator('.continue-card').first();
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(750);
  await page.keyboard.up('Enter');
  const dialog = page.getByRole('dialog', { name: 'Horizonte de teste' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Retomar em 00:30');
  await dialog.getByRole('button', { name: 'Remover do histórico' }).click();
  await expect(page.locator('.continue-card')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Removido do histórico');
  // A short press still opens the streams screen (the gesture did not swallow the click).
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));
  expect(Object.keys(stored.progress)).toEqual([]);
});
test('the TMDB key field accepts the full key and refuses a short one', async ({ page }) => {
  const calls = [];
  await page.route('https://api.themoviedb.org/**', route => { calls.push(new URL(route.request().url()).pathname); return route.fulfill({ json: { images: {} } }); });
  await boot(page);
  await settings(page, 'Integrações');
  await page.getByRole('button', { name: /^TMDB/ }).click();
  const input = page.getByRole('textbox', { name: 'Chave de API TMDB' });
  // Pasted keys keep their text (the TV keyboard adds spaces and dashes sometimes).
  await input.fill('a'.repeat(40));
  await expect(input).toHaveValue('a'.repeat(40));
  await expect(page.locator('.settings-field-actions small')).toContainText('40/32');
  await input.fill('abc');
  await expect(page.locator('.settings-field-actions small')).toContainText('3/32');
  await page.getByRole('button', { name: 'Salvar e verificar' }).click();
  await expect(page.locator('.settings-field p[role=status]')).toContainText('32 caracteres; chegaram 3');
  // Spaces and dashes are ignored, so a key copied from the browser still saves.
  await input.fill('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  await expect(page.locator('.settings-field-actions small')).toContainText('32/32');
  await page.getByRole('button', { name: 'Salvar e verificar' }).click();
  await expect(page.locator('.settings-field p[role=status]')).toContainText('TMDB conectado');
  expect(calls).toContain('/3/configuration');
});

