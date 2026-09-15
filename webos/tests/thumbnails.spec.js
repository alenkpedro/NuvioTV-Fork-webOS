import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
// The clip is served from the app's own origin: the preview decodes it in a second element.
const appOrigin = 'http://127.0.0.1:4173';
const movie = { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['tt'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
async function boot(page, { stream = 'Movie 2160p HDR', playback = { seekThumbnails: true }, extra = {} } = {}) {
  await page.addInitScript(({ addon, playback }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
  }, { addon, playback });
  const requests = [];
  await page.route(origin + '/**', route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.includes('/stream/')) return json({ streams: [{ name: stream, url: appOrigin + '/clip.mp4', ...extra }] });
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    return route.abort();
  });
  await page.route('**/clip.mp4', route => {
    requests.push(route.request().url());
    const body = fs.readFileSync('tests/fixtures/thumbnail.mp4');
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: body.subarray(start, end + 1), headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) } });
  });
  await page.route('**/broken.mp4', route => route.fulfill({ status: 404, body: 'gone' }));
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
  return requests;
}
async function openPlayer(page) {
  await page.goto('/');
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Início', exact: true }).click();
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 30; });
}
const pane = page => page.locator('.seek-thumbnail');
const preview = async (page, steps = 1) => {
  const timeline = page.getByRole('slider', { name: 'Posição do vídeo' });
  await timeline.focus();
  await page.keyboard.down('ArrowLeft');
  for (let i = 1; i < steps; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(120); }
};
test('the preview decodes the frame from the stream in its own element', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await openPlayer(page);
  // Nothing is fetched until the viewer scrubs.
  await expect(pane(page).locator('video')).toHaveCount(0);
  await preview(page);
  await expect(pane(page)).toBeVisible({ timeout: 15000 });
  const frame = pane(page).locator('video.seek-thumbnail-video');
  await expect(frame).toHaveCount(1);
  // 30 s of playback with a 10 s step: the pane holds the frame of the position the remote shows.
  expect(await frame.evaluate(v => v.currentTime)).toBeCloseTo(20, 0);
  // A visible pane always carries a decoded frame — never an empty black box.
  expect(await frame.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await frame.evaluate(v => v.videoWidth)).toBeGreaterThan(0);
  // The playing element keeps its position and the pane holds a single element.
  expect(await page.locator('.player-screen video:not(.seek-thumbnail-video)').evaluate(v => v.currentTime)).toBeCloseTo(30, 0);
  await expect(page.locator('.player-screen video')).toHaveCount(2);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(pane(page)).toBeHidden();
  await page.screenshot({ path: 'test-results/seek-thumbnail-extractor-1920.png' });
  expect(errors).toEqual([]);
});
test('walking the preview further reuses the same decoder and asks only the new position', async ({ page }) => {
  await boot(page);
  await openPlayer(page);
  await preview(page);
  await expect(pane(page)).toBeVisible({ timeout: 15000 });
  const frame = pane(page).locator('video.seek-thumbnail-video');
  expect(await frame.evaluate(v => v.currentTime)).toBeCloseTo(20, 0);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => frame.evaluate(v => Math.round(v.currentTime))).toBe(10);
  await expect(pane(page).locator('video')).toHaveCount(1);
  // Moving one step ahead keeps a frame on screen: the pane never blanks between positions.
  await expect(pane(page)).toBeVisible();
  await page.keyboard.up('ArrowLeft');
});
test('a source the TV cannot decode warns once and never shows an empty pane', async ({ page }) => {
  await boot(page);
  // The second media element (the preview) gets a URL the TV cannot decode: the playing one is
  // untouched, which is exactly the situation the fork's extractor reports.
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    const original = Element.prototype.setAttribute;
    let seen = 0;
    const late = () => { seen += 1; return seen === 2; };
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { return descriptor.set.call(this, late() ? '/broken.mp4' : value); }
    });
    Element.prototype.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === 'src' && this instanceof HTMLMediaElement && late()) value = '/broken.mp4';
      return original.call(this, name, value);
    };
  });
  await openPlayer(page);
  await preview(page);
  await expect(page.locator('#toast')).toContainText('prévia desta fonte', { timeout: 15000 });
  await expect(pane(page)).toBeHidden();
  await page.keyboard.up('ArrowLeft');
});
test('a protected source never opens a second decoder', async ({ page }) => {
  await boot(page, { extra: { drm: { system: 'widevine' } } });
  await openPlayer(page);
  await preview(page);
  await expect(pane(page)).toBeHidden();
  await expect(pane(page).locator('video')).toHaveCount(0);
  await page.keyboard.up('ArrowLeft');
});
test('turning the setting off leaves the player without a preview element', async ({ page }) => {
  await boot(page, { playback: { seekThumbnails: false } });
  await openPlayer(page);
  await preview(page);
  await expect(pane(page)).toHaveCount(0);
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('.player-screen video')).toHaveCount(1);
});

