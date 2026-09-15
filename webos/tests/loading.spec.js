import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const movie = { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = (catalogs) => ({ url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['tt'], catalogs } });
function boot(page, { catalogs = [{ id: 'first', name: 'Primeira fileira', type: 'movie' }, { id: 'second', name: 'Segunda fileira', type: 'movie' }], gates = {}, metaGate = null, streamGate = null, requests = [] } = {}) {
  const script = addon(catalogs);
  page.addInitScript(({ script }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [script], progress: {}, library: {}, watched: {}, settings: {} }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
  }, { script });
  return page.route(origin + '/**', async route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(script.manifest);
    if (p.includes('/catalog/')) {
      requests.push(p);
      const gate = gates[p.includes('/second') ? 'second' : 'first'];
      if (gate) await gate;
      return json({ metas: [{ ...movie, name: p.includes('/second') ? 'Filme da segunda' : 'Filme da primeira' }] });
    }
    if (p.includes('/meta/')) { if (metaGate) await metaGate; return json({ meta: movie }); }
    if (p.includes('/stream/')) { if (streamGate) await streamGate; return json({ streams: [{ name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4' }] }); }
    if (p.endsWith('.mp4')) return route.fulfill({ contentType: 'video/mp4', body: fs.readFileSync('tests/fixtures/clip.mp4'), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' } });
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"/>' });
    return route.abort();
  });
}
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
test('the boot splash holds the screen until the first render', async ({ page }) => {
  // The script arrives late on purpose: that is the window the splash exists for.
  await page.route('**/app.js', async route => { await new Promise(resolve => setTimeout(resolve, 900)); await route.continue(); });
  await boot(page);
  await page.goto('/', { waitUntil: 'commit' });
  const splash = page.locator('.boot-splash');
  await expect(splash).toBeVisible();
  await expect(splash.locator('.boot-wordmark')).toBeVisible();
  await expect(splash.locator('.boot-spinner')).toBeVisible();
  await expect(splash).toContainText('Iniciando');
  await expect.poll(() => splash.locator('.boot-wordmark').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(splash).toHaveCount(0);
  await drawer(page, 'Início');
  await expect(page.locator('.home-rows')).toBeVisible();
});
test('the Home shows the skeleton of each rail and fills them as the add-ons answer', async ({ page }) => {
  let releaseFirst, releaseSecond;
  const first = new Promise(resolve => releaseFirst = resolve), second = new Promise(resolve => releaseSecond = resolve);
  await boot(page, { gates: { first, second } });
  await page.goto('/');
  await expect(page.locator('.home-rows')).toBeVisible();
  // Both rails are drawn as skeletons first: the Home never waits for the last add-on to draw
  // the first row.
  await expect(page.locator('.skeleton-section')).toHaveCount(2);
  await expect(page.locator('.skeleton-section .skeleton-card')).toHaveCount(12);
  await expect(page.locator('.skeleton-section h2').first()).toHaveText('Primeira fileira - Filme');
  // The first rail becomes real while the second one is still loading.
  releaseFirst();
  await expect(page.locator('.catalog-section:not(.skeleton-section)')).toHaveCount(1);
  await expect(page.locator('.catalog-section:not(.skeleton-section) h2')).toHaveText('Primeira fileira - Filme');
  await expect(page.locator('.skeleton-section')).toHaveCount(1);
  releaseSecond();
  await expect(page.locator('.skeleton-section')).toHaveCount(0);
  await expect(page.locator('.catalog-section h2')).toHaveText(['Primeira fileira - Filme', 'Segunda fileira - Filme']);
});
test('choosing a title and opening the sources show the fork skeletons while loading', async ({ page }) => {
  let releaseMeta, releaseStream;
  const metaGate = new Promise(resolve => releaseMeta = resolve), streamGate = new Promise(resolve => releaseStream = resolve);
  await boot(page, { metaGate, streamGate });
  await page.goto('/');
  await drawer(page, 'Início');
  await page.getByRole('button', { name: /Filme da primeira/ }).click();
  const detail = page.locator('.detail-skeleton');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.skeleton-backdrop')).toBeVisible();
  await expect(detail.locator('.skeleton-logo')).toBeVisible();
  await expect(detail.locator('.skeleton-button')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Horizonte de teste' })).toHaveCount(0);
  releaseMeta();
  await expect(page.locator('.detail-skeleton')).toHaveCount(0);
  await expect(page.locator('.detail-title')).toHaveText('Horizonte de teste');
  // The source list uses the same language while the add-ons answer.
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.skeleton-streams .skeleton-source')).toHaveCount(6);
  releaseStream();
  await expect(page.locator('.skeleton-streams')).toHaveCount(0);
  await expect(page.locator('.source')).toHaveCount(1);
});
test('revisiting the Home inside the cache window does not ask the add-ons again', async ({ page }) => {
  const requests = [];
  await boot(page, { requests });
  await page.goto('/');
  await drawer(page, 'Início');
  await expect(page.locator('.catalog-section h2')).toHaveText(['Primeira fileira - Filme', 'Segunda fileira - Filme']);
  const first = requests.length;
  expect(first).toBeGreaterThanOrEqual(2);
  // Leave and come back: the rails are cached for five minutes, so nothing is fetched again.
  await drawer(page, 'Ajustes');
  await drawer(page, 'Início');
  await expect(page.locator('.catalog-section h2')).toHaveText(['Primeira fileira - Filme', 'Segunda fileira - Filme']);
  expect(requests.length).toBe(first);
});

