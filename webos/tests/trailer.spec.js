import { test, expect } from '@playwright/test';
const origin = 'https://fixture.example';
const movie = { id: 'tt100', type: 'movie', name: 'Horizonte de teste', releaseInfo: '2026', poster: origin + '/poster.svg', background: origin + '/backdrop.svg', trailers: [{ source: 'abcdefghijk', name: 'Trailer do addon' }] };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta'], types: ['movie'], idPrefixes: ['tt'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
// A stand-in for https://www.youtube.com/iframe_api: it runs inside the proxy page (scripts keep
// the embedding document's context), so the whole postMessage protocol is exercised for real.
const fakeApi = `
window.__ytCalls = [];
window.__ytState = 1;
window.__endTrailer = () => { window.__ytState = 0; window.__ytPlayer.events.onStateChange(); };
window.YT = {
  Player: function (id, options) {
    this.events = options.events || {};
    this.state = 1;
    window.__ytPlayer = this;
    const self = this;
    setTimeout(() => { self.events.onReady && self.events.onReady(); }, 30);
  },
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
};
window.YT.Player.prototype.getPlayerState = function () { return window.__ytState; };
window.YT.Player.prototype.getCurrentTime = function () { return 12; };
window.YT.Player.prototype.getDuration = function () { return 90; };
window.YT.Player.prototype.isMuted = function () { return window.__ytCalls.includes('mute') && !window.__ytCalls.includes('unmute'); };
window.YT.Player.prototype.playVideo = function () { window.__ytCalls.push('play'); window.__ytState = 1; };
window.YT.Player.prototype.pauseVideo = function () { window.__ytCalls.push('pause'); window.__ytState = 2; };
window.YT.Player.prototype.mute = function () { window.__ytCalls.push('mute'); };
window.YT.Player.prototype.unMute = function () { window.__ytCalls.push('unmute'); };
window.YT.Player.prototype.seekTo = function (seconds) { window.__ytCalls.push('seek:' + seconds); };
window.YT.Player.prototype.loadModule = function (name) { window.__ytCalls.push('captions:' + name); };
window.YT.Player.prototype.unloadModule = function (name) { window.__ytCalls.push('captions-off:' + name); };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;
async function boot(page, { api = true } = {}) {
  await page.addInitScript(({ addon }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: {} }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: '', language: 'pt-BR' }));
    window.lastLaunch = null;
    class Bridge { call(uri, payload) { window.lastLaunch = { uri, params: JSON.parse(payload) }; queueMicrotask(() => this.onservicecallback(JSON.stringify({ returnValue: true }))); } cancel() {} }
    window.PalmServiceBridge = Bridge;
  }, { addon });
  await page.route(origin + '/**', route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    return route.abort();
  });
  await page.route('**/iframe_api*', route => api
    ? route.fulfill({ contentType: 'text/javascript', body: fakeApi })
    : route.abort());
  await page.route('**/youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>embed</title>' }));
}
async function openTrailer(page) {
  await page.goto('/');
  await page.locator('.home-rows .card').first().click();
  await expect(page.locator('.detail-title')).toBeVisible();
  await page.getByRole('button', { name: 'Trailer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Trailer do addon' });
  await expect(dialog).toBeVisible();
  return dialog;
}
test('the trailer plays inside the port and the remote drives the proxy', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  const dialog = await openTrailer(page);
  const frame = dialog.locator('iframe.trailer-frame');
  await expect(frame).toHaveAttribute('src', /youtube-proxy\.html\?v=abcdefghijk.*muted=1/);
  // The proxy reports ready and playing: the status leaves and the labels follow the player.
  await expect(dialog.locator('.trailer-status')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect(await frame.evaluate(node => node.contentWindow.__ytCalls)).toContain('play');
  // The trailer opens muted (the TV browser only autoplays muted), so the label offers the
  // opposite action; the controls go through postMessage into the packaged page.
  const mute = dialog.getByRole('button', { name: 'Com som', exact: true });
  await expect(mute).toBeVisible();
  await mute.click();
  await expect(dialog.getByRole('button', { name: 'Mudo', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Legendas', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Legendas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Pausar', exact: true }).click();
  // The label comes back from the player, so the command reached the proxy page and the state
  // travelled back through the protocol.
  await expect(dialog.getByRole('button', { name: 'Reproduzir', exact: true })).toBeVisible();
  const calls = await frame.evaluate(node => node.contentWindow.__ytCalls.join(','));
  expect(calls).toContain('play');
  expect(calls).toContain('unmute');
  expect(calls).toContain('captions:captions');
  await page.screenshot({ path: 'test-results/detail-trailer-in-app-1920.png' });
  expect(errors).toEqual([]);
});
test('the trailer ends by itself, closes on Back and returns the focus to the card', async ({ page }) => {
  await boot(page);
  const dialog = await openTrailer(page);
  const frame = dialog.locator('iframe.trailer-frame');
  await expect(dialog.locator('.trailer-status')).toBeHidden();
  // The proxy polls the player: an ended state closes the trailer.
  await frame.evaluate(node => node.contentWindow.__endTrailer());
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Trailer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trailer do addon' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Trailer do addon' })).toHaveCount(0);
  await expect(page.locator('.detail-title')).toBeVisible();
});
test('a TV that cannot run the player keeps the YouTube app and the browser one key away', async ({ page }) => {
  await boot(page, { api: false });
  const dialog = await openTrailer(page);
  // The API script never loads: the proxy reports the fallback and the app offers the exits.
  await expect(dialog.locator('.trailer-fallbacks')).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByRole('button', { name: 'Pausar', exact: true })).toBeDisabled();
  await expect(dialog.locator('.trailer-status')).toContainText('player da TV');
  await dialog.getByRole('button', { name: 'Abrir no YouTube da TV', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.lastLaunch?.params?.id)).toBe('youtube.leanback.v4');
  // The QR dialog stays available as the last resort.
  await dialog.getByRole('button', { name: 'Ver QR code', exact: true }).click();
  const options = page.getByRole('dialog', { name: 'Trailer do addon' }).last();
  await expect(options.getByRole('button', { name: 'Abrir no navegador da TV', exact: true })).toBeVisible();
});

