import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const movie = { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = (catalogs) => ({ url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['tt'], catalogs } });
function boot(page, { catalogs = [{ id: 'first', name: 'Primeira fileira', type: 'movie' }, { id: 'second', name: 'Segunda fileira', type: 'movie' }], gates = {}, metaGate = null, streamGate = null, clipDelay = 0, requests = [] } = {}) {
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
    if (p.includes('/meta/')) { if (metaGate) await metaGate; return json({ meta: { ...movie, logo: origin + '/title-logo.svg' } }); }
    if (p.endsWith('title-logo.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><text x="0" y="110" font-family="serif" font-size="96" fill="white">HORIZONTE</text></svg>' });
    if (p.includes('/stream/')) { if (streamGate) await streamGate; return json({ streams: [{ name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4' }] }); }
    if (p.endsWith('.mp4')) { if (clipDelay) await new Promise(resolve => setTimeout(resolve, clipDelay)); return route.fulfill({ contentType: 'video/mp4', body: fs.readFileSync('tests/fixtures/clip.mp4'), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' } }); }
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"/>' });
    return route.abort();
  });
}
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
test('the boot splash covers the panel until the first render', async ({ page }) => {
  // The script arrives late on purpose: that is the window the splash exists for.
  await page.route('**/app.js', async route => { await new Promise(resolve => setTimeout(resolve, 900)); await route.continue(); });
  await boot(page);
  await page.goto('/', { waitUntil: 'commit' });
  const splash = page.locator('#splash');
  await expect(splash).toBeVisible();
  await expect(splash.locator('.boot-wordmark')).toBeVisible();
  await expect(splash.locator('.ring-spinner')).toBeVisible();
  await expect(splash).toContainText('Iniciando');
  await expect.poll(() => splash.locator('.boot-wordmark').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  // It sits outside the scaled canvas: it covers the whole panel on any resolution.
  const box = await splash.evaluate(node => { const rect = node.getBoundingClientRect(); return { w: Math.round(rect.width), h: Math.round(rect.height), position: getComputedStyle(node).position }; });
  expect(box.position).toBe('fixed');
  expect(box.w).toBeGreaterThan(960);
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
  // The fixture carries a logo, so the heading is the logo image with the title as its name.
  await expect(page.getByRole('heading', { name: 'Horizonte de teste' })).toBeVisible();
  // The source list uses the same language while the add-ons answer.
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.skeleton-streams .skeleton-source')).toHaveCount(6);
  // The loading list says which add-ons are being asked, like the fork's chip row.
  await expect(page.locator('.stream-loading-addons')).toContainText('Buscando fontes em 1 addon(s): Catálogo de teste');
  releaseStream();
  await expect(page.locator('.skeleton-streams')).toHaveCount(0);
  await expect(page.locator('.source')).toHaveCount(1);
});
test('the focus follows a loading row into its content', async ({ page }) => {
  let release;
  const second = new Promise(resolve => release = resolve);
  await boot(page, { gates: { second } });
  await page.goto('/');
  // The second rail is still a placeholder, and the remote can walk into it (the fork keeps its
  // rows reachable while they load).
  await expect(page.locator('.catalog-section .card').first()).toBeFocused();
  const placeholder = page.locator('.skeleton-section .skeleton-card').first();
  await expect(placeholder).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(placeholder).toBeFocused();
  release();
  // The content lands: the focus follows it to the same place in the row.
  await expect(page.locator('.catalog-section').nth(1).locator('.card').first()).toBeFocused();
  await expect(page.locator('.skeleton-section')).toHaveCount(0);
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
test('opening a source shows the fork loading screen with backdrop, logo and source', async ({ page }) => {
  // The media takes a moment: that is the window the loading screen exists for.
  await boot(page, { clipDelay: 1200 });
  await page.goto('/');
  await drawer(page, 'Início');
  await page.getByRole('button', { name: /Filme da primeira/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  const overlay = page.locator('.player-loading');
  await expect(overlay).toBeVisible();
  // LoadingOverlay.kt: the backdrop behind, the logo in the middle, the message and source line.
  await expect(overlay.locator('.player-loading-backdrop')).toBeVisible();
  await expect(overlay.locator('.player-loading-logo')).toBeVisible();
  await expect(overlay.locator('.player-loading-message')).toContainText('Carregando');
  await expect(overlay.locator('.player-loading-source')).toContainText('Catálogo de teste');
  // The status bar that used to float at the top of the panel is gone.
  await expect(page.locator('.player-status')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/player-loading-1920.png' });
  await expect(overlay).toBeHidden({ timeout: 20000 });
  // A stall after the start is the buffering indicator: the ring only, never the full screen.
  await page.locator('video').evaluate(video => video.dispatchEvent(new Event('waiting')));
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-buffering', 'true');
  await expect(overlay.locator('.player-loading-backdrop')).toBeHidden();
  await expect(overlay.locator('.ring-spinner')).toBeVisible();
  await expect(page.locator('.player-cast,.pause-cast')).toHaveCount(0);
});


