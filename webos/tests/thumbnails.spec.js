import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const movie = { id: 'tt1234567', type: 'movie', name: 'Horizonte de teste', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['tt'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
async function boot(page, { stream = 'Movie 2160p HDR', playback = { seekThumbnails: true } } = {}) {
  await page.addInitScript(({ addon, playback }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
  }, { addon, playback });
  await page.route(origin + '/**', route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.includes('/stream/')) return json({ streams: [{ name: stream, url: origin + '/clip.mp4' }] });
    if (p.endsWith('.mp4')) {
      const body = fs.readFileSync('tests/fixtures/thumbnail.mp4');
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: body.subarray(start, end + 1), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) } });
    }
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    return route.abort();
  });
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
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
}
// The rules read the size the TV reports for the decoded frame and the fixtures are small files.
// Declaring width/height on the element exercises them without shipping a 4K clip: the module
// never reads the picture back, it only draws it into the pane.
async function declareSize(page, width, height) {
  await page.locator('video').evaluate((video, size) => {
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => size.width });
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => size.height });
  }, { width, height });
}
// A paused element never captures, so the cadence tests declare the playback state instead of
// depending on the real decoder or on the browser's media timers.
async function pretendPlaying(page, time) {
  await page.locator('video').evaluate((video, value) => {
    if (!video.__pretendPlaying) {
      video.__pretendTime = value;
      Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
      Object.defineProperty(video, 'seeking', { configurable: true, get: () => false });
      Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => video.__pretendTime, set: next => { video.__pretendTime = next; } });
      video.__pretendPlaying = true;
    }
    video.__pretendTime = value;
  }, time);
}
const frame = page => page.locator('video').evaluate(video => video.dispatchEvent(new Event('timeupdate')));
const afterSeek = page => page.locator('video').evaluate(video => video.dispatchEvent(new Event('seeked')));
// Every cached frame is a canvas element, so counting them shows the capture cadence from
// outside the module without reading its private cache.
async function spyCanvases(page) {
  await page.evaluate(() => {
    window.__thumbnailCanvases = 0;
    const create = document.createElement.bind(document);
    document.createElement = (tag, ...rest) => { if (String(tag).toLowerCase() === 'canvas') window.__thumbnailCanvases++; return create(tag, ...rest); };
  });
}
const canvases = page => page.evaluate(() => window.__thumbnailCanvases);

test('a 4K source with an HDR name captures frames and the preview keeps the pane budget', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page, { stream: 'Movie 2160p HDR' });
  await openPlayer(page);
  await declareSize(page, 3840, 2160);
  await page.clock.install();
  const video = page.locator('video');
  for (const time of [10, 20, 30]) {
    await page.clock.runFor(1600);
    await video.evaluate(async (element, value) => {
      element.currentTime = value;
      await new Promise(resolve => element.addEventListener('seeked', resolve, { once: true }));
      await element.play();
      element.dispatchEvent(new Event('timeupdate'));
      element.pause();
    }, time);
  }
  const timeline = page.getByRole('slider', { name: 'Posição do vídeo' });
  await timeline.focus();
  await page.keyboard.down('ArrowLeft');
  const pane = page.locator('.seek-thumbnail');
  await expect(pane).toBeVisible();
  // 3840×2160 lands in the same 320×108 budget as anything else: 192×108, pane 192 px wide.
  expect(await pane.locator('canvas').evaluate(canvas => [canvas.width, canvas.height])).toEqual([192, 108]);
  expect(await pane.evaluate(node => getComputedStyle(node).width)).toBe('192px');
  await expect(video).toHaveCount(1);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(pane).toBeHidden();
  expect(errors).toEqual([]);
});
test('a 1080p source captures again after one second', async ({ page }) => {
  await boot(page);
  await openPlayer(page);
  await declareSize(page, 1920, 1080);
  await spyCanvases(page);
  await page.clock.install();
  await pretendPlaying(page, 10);
  await frame(page);
  expect(await canvases(page)).toBe(1);
  await page.clock.runFor(1200);
  await pretendPlaying(page, 20);
  await frame(page);
  expect(await canvases(page)).toBe(2);
});
test('a 4K source waits for the wider capture window before the next frame', async ({ page }) => {
  await boot(page);
  await openPlayer(page);
  await declareSize(page, 3840, 2160);
  await spyCanvases(page);
  await page.clock.install();
  await pretendPlaying(page, 10);
  await frame(page);
  expect(await canvases(page)).toBe(1);
  // 1.2 s of playback is enough at 1080p and not enough here, because scaling a 4K frame costs
  // more and playback keeps priority.
  await page.clock.runFor(1200);
  await pretendPlaying(page, 20);
  await frame(page);
  expect(await canvases(page)).toBe(1);
  await page.clock.runFor(400);
  await pretendPlaying(page, 30);
  await frame(page);
  expect(await canvases(page)).toBe(2);
});
test('a seek captures the new position without waiting for the periodic update', async ({ page }) => {
  await boot(page);
  await openPlayer(page);
  await declareSize(page, 3840, 2160);
  await spyCanvases(page);
  await page.clock.install();
  await pretendPlaying(page, 15);
  await afterSeek(page);
  expect(await canvases(page)).toBe(1);
  await page.clock.runFor(2000);
  await pretendPlaying(page, 45);
  await afterSeek(page);
  expect(await canvases(page)).toBe(2);
});
test('a source above 4K or without a decoded picture is left alone', async ({ page }) => {
  await boot(page);
  await openPlayer(page);
  await spyCanvases(page);
  await page.clock.install();
  await declareSize(page, 5120, 2880);
  await pretendPlaying(page, 10);
  await frame(page);
  await page.clock.runFor(2000);
  await declareSize(page, 0, 0);
  await pretendPlaying(page, 20);
  await frame(page);
  expect(await canvases(page)).toBe(0);
});

