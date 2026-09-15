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
test('probe', async ({ page }) => {
  const log = (...args) => console.log('PROBE', ...args);
  page.on('pageerror', e => log('pageerror', e.message));
  await page.addInitScript(({ addon }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback: {} } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
  }, { addon });
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
  const state = () => page.evaluate(() => ({
    heading: document.querySelector('main h1, .settings-header h1')?.textContent || document.body.textContent.trim().slice(0, 24),
    sources: document.querySelectorAll('.source').length,
    drawer: document.querySelector('#app').classList.contains('drawer-open'),
    focus: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className || document.activeElement?.tagName
  }));
  await page.goto('/');
  await drawer(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  log('detail', JSON.stringify(await state()));
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(1);
  log('streams', JSON.stringify(await state()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  log('back-from-streams', JSON.stringify(await state()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  log('back-again', JSON.stringify(await state()));
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await page.locator('.settings-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
  log('settings-scrolled', JSON.stringify(await page.evaluate(() => ({ scroll: document.querySelector('.settings-content').scrollTop, focus: document.activeElement?.getAttribute('aria-label') }))));
  await page.getByRole('switch', { name: 'Avisos de conteúdo', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  log('after-enter-toggle', JSON.stringify(await page.evaluate(() => ({ scroll: document.querySelector('.settings-content').scrollTop, focus: document.activeElement?.getAttribute('aria-label'), checked: document.querySelector('[role=switch][aria-label="Avisos de conteúdo"]')?.getAttribute('aria-checked') }))));
  await page.getByRole('switch', { name: 'Miniaturas ao buscar', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  log('after-arrowleft-1', JSON.stringify(await state()));
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  log('after-arrowleft-2', JSON.stringify(await state()));
});
