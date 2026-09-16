import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const imdb = 'tt1234567';
const movie = { id: imdb, type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local de validação.', releaseInfo: '2026', genres: ['Teste'], poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
const sources = [
  { name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip-1080.mp4' },
  { name: 'Movie 2160p REMUX-FLUX', url: origin + '/clip-2160.mp4' },
  { name: 'Movie 720p WEB-DL-FLUX', url: origin + '/clip-720.mp4' }
];
async function boot(page, { playback = {}, linkCache, bridge = false } = {}) {
  await page.addInitScript(({ playback, addon, linkCache, bridge }) => {
    // Seed once: addInitScript runs again on reload, and a change must survive it.
    if (!localStorage.getItem('nuvio-fork.webos.v1')) {
      const seeded = { guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback } };
      if (linkCache) seeded.linkCache = Object.fromEntries(Object.entries(linkCache).map(([key, entry]) => [key, { ...entry, cachedAt: Date.now() }]));
      localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify(seeded));
    }
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: 'a'.repeat(32), language: 'pt-BR' }));
    if (!bridge) return;
    window.__luna = [];
    class Bridge {
      call(uri, payload) { window.__luna.push([uri, payload]); setTimeout(() => this.onservicecallback?.(JSON.stringify({ returnValue: true })), 0); }
      cancel() {}
    }
    window.PalmServiceBridge = Bridge;
  }, { playback, addon, linkCache, bridge });
  await page.route(origin + '/**', route => {
    const u = new URL(route.request().url()), p = decodeURIComponent(u.pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.includes('/stream/')) return json({ streams: sources });
    if (p.endsWith('.mp4')) {
      const body = fs.readFileSync('tests/fixtures/clip.mp4');
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: body.subarray(start, end + 1), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) } });
    }
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#284568"/></svg>' });
    return route.abort();
  });
}
async function tmdb(page, { recommendations = true, trailer = 'abc12345678' } = {}) {
  await page.route('https://api.themoviedb.org/**', route => {
    const u = new URL(route.request().url());
    const json = body => route.fulfill({ json: body });
    if (u.pathname.includes('/find/')) return json({ movie_results: [{ id: 603 }], tv_results: [] });
    if (u.pathname === '/3/configuration') return json({ images: {} });
    const videos = { results: trailer ? [{ site: 'YouTube', key: trailer, type: 'Trailer', name: 'Trailer oficial', iso_639_1: 'pt' }] : [] };
    const candidate = u.pathname.match(/^\/3\/movie\/(1[12])$/);
    if (candidate) return json({ id: Number(candidate[1]), imdb_id: `tt00000${candidate[1]}`, external_ids: { imdb_id: `tt00000${candidate[1]}` }, title: candidate[1] === '11' ? 'Recomendação um' : 'Recomendação dois', overview: 'Sinopse do TMDB.', runtime: 95, vote_average: 7.1, vote_count: 640, images: { logos: [] }, credits: { cast: [] }, videos, recommendations: { results: [] } });
    return json({ id: 603, title: 'Horizonte de teste', overview: 'Sinopse do TMDB.', runtime: 100, vote_average: 8.4, vote_count: 1200, genres: [{ name: 'Teste' }], images: { logos: [] }, credits: { cast: [] }, videos, recommendations: recommendations ? { results: [{ id: 11, title: 'Recomendação um', overview: 'Primeira sugestão.', poster_path: '/r1.jpg', backdrop_path: '/b1.jpg', release_date: '2024-05-02', vote_average: 7.9 }, { id: 12, title: 'Recomendação dois', overview: 'Segunda sugestão.', poster_path: '/r2.jpg', release_date: '2023-01-10', vote_average: 6.4 }] } : { results: [] } });
  });
}
async function parental(page) {
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
}
async function home(page) {
  await page.goto('/');
  await drawer(page, 'Início');
}
// Same walk as flow.spec.js: leave the player, then open the drawer and the entry.
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
async function openMovie(page) {
  await home(page);
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
}
async function startMovie(page) {
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));
test('Reprodução automática exposes the fork modes, the cache duration and the trailer delay', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [], progress: {}, library: {}, watched: {}, settings: {} })); });
  await page.goto('/');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  const modes = page.locator('[aria-label="Seleção automática de fonte"] button');
  await expect(modes).toHaveText(['Manual (escolher fonte)', 'Primeira fonte', 'Seleção inteligente', 'Palavra-chave (Regex)']);
  await expect(modes.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await modes.nth(3).click(); // Palavra-chave (Regex)
  await expect(page.locator('[data-focus="playback-regex"]')).toContainText('Nenhuma palavra definida');
  await page.locator('[data-focus="playback-regex"]').click();
  const dialog = page.getByRole('dialog', { name: 'Filtro de palavras (Regex)' });
  await dialog.getByRole('textbox', { name: 'Filtro de palavras (Regex)' }).fill('2160p|Remux(?!(cam))');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('[data-focus="playback-regex"]')).toContainText('2160p|Remux');
  // An expression that cannot compile is refused instead of silently never matching.
  await page.locator('[data-focus="playback-regex"]').click();
  const again = page.getByRole('dialog', { name: 'Filtro de palavras (Regex)' });
  await again.getByRole('textbox').fill('(');
  await again.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Expressão inválida; o filtro não foi salvo.');
  expect((await stored(page)).settings.playback.autoPlayRegex).toBe('2160p|Remux(?!(cam))');
  // Reuse last link brings the fork's nine durations and clears the cache when off.
  const reuse = page.getByRole('switch', { name: 'Reutilizar último link', exact: true });
  await expect(reuse).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[aria-label="Duração do cache do link"]')).toHaveCount(0);
  await reuse.click();
  await expect(reuse).toHaveAttribute('aria-checked', 'true');
  const durations = page.locator('[aria-label="Duração do cache do link"] button');
  await expect(durations).toHaveText(['1 hora', '2 horas', '3 horas', '6 horas', '12 horas', '1 dia', '2 dias', '3 dias', '7 dias']);
  await expect(durations.nth(5)).toHaveAttribute('aria-pressed', 'true'); // 24 h is the fork default
  await durations.nth(3).click();
  await expect(durations.nth(3)).toHaveAttribute('aria-pressed', 'true');
  // Trailer automático brings the 3-15 s delay stepper.
  await page.getByRole('switch', { name: 'Trailer automático após assistir', exact: true }).click();
  await expect(page.locator('.settings-threshold-value')).toHaveText('7s');
  const slower = page.getByRole('button', { name: 'Diminuir atraso do trailer', exact: true });
  for (let i = 0; i < 4; i++) await slower.click();
  await expect(page.locator('.settings-threshold-value')).toHaveText('3s');
  await expect(slower).toBeDisabled();
  await page.getByRole('button', { name: 'Aumentar atraso do trailer', exact: true }).click();
  await expect(page.locator('.settings-threshold-value')).toHaveText('4s');
  // The screenshot shows the whole group, not just the top of the pane.
  await page.locator('[aria-label="Seleção automática de fonte"]').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/settings-autoplay-1920.png' });
  const saved = (await stored(page)).settings.playback;
  expect(saved.autoPlayMode).toBe('regex');
  expect(saved.reuseLastLink).toBe(true);
  expect(saved.reuseLastLinkHours).toBe(6);
  expect(saved.trailerAutoPlay).toBe(true);
  expect(saved.trailerDelay).toBe(4);
  await page.reload(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await expect(page.locator('[aria-label="Seleção automática de fonte"] button').nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.settings-threshold-value')).toHaveText('4s');
  expect(errors).toEqual([]);
});
test('Reutilizar último link plays the cached URL without asking the add-on again', async ({ page }) => {
  const calls = [];
  page.on('request', request => { if (request.url().includes('/stream/')) calls.push(request.url()); });
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { reuseLastLink: true, reuseLastLinkHours: 24 }, linkCache: { [`movie|${imdb}`]: { url: origin + '/clip-cached.mp4', streamName: 'Movie 1080p WEB-DL-FLUX', addonName: 'Catálogo de teste' } } });
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  // The cached entry wins: no source list and no stream request for this title.
  await expect(page.locator('video')).toHaveAttribute('src', /clip-cached\.mp4/);
  await expect(page.locator('.source')).toHaveCount(0);
  expect(calls).toEqual([]);
  // The entry ages out after the configured hours, so the same visit falls back to the
  // list. The app persists on unload, so the change is applied before the next boot.
  await page.addInitScript(() => { const key = 'nuvio-fork.webos.v1'; const state = JSON.parse(localStorage.getItem(key)); if (state?.linkCache) for (const entry of Object.values(state.linkCache)) entry.cachedAt -= 25 * 3600 * 1000; localStorage.setItem(key, JSON.stringify(state)); });
  await page.reload(); await page.keyboard.press('Escape');
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(3);
});
test('the chosen source is remembered, bounded and dropped when the setting is turned off', async ({ page }) => {
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { reuseLastLink: true } });
  await startMovie(page);
  const saved = await stored(page);
  // "Reproduzir melhor fonte" ranks the fixture: the 2160p remux wins.
  expect(saved.linkCache[`movie|${imdb}`].url).toBe(origin + '/clip-2160.mp4');
  expect(saved.linkCache[`movie|${imdb}`].streamName).toBe('Movie 2160p REMUX-FLUX');
  expect(Object.keys(saved.linkCache).length).toBe(1);
  // Turning the switch off clears the stored links instead of leaving them behind.
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await page.getByRole('switch', { name: 'Reutilizar último link', exact: true }).click();
  expect(Object.keys((await stored(page)).linkCache).length).toBe(0);
});
test('Seleção automática de fonte plays the matching keyword and never replaces the picker when nothing matches', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { autoPlayMode: 'regex', autoPlayRegex: '2160p' } });
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  // The first matching source plays without showing the list.
  await expect(page.locator('video')).toHaveAttribute('src', /clip-2160\.mp4/);
  await expect(page.locator('.source')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'test-results/player-auto-play-1920.png' });
  expect(errors).toEqual([]);
});
test('Seleção inteligente plays the ranked source without a manual pick', async ({ page }) => {
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { autoPlayMode: 'rank' } });
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('video')).toHaveAttribute('src', /clip-2160\.mp4/);
  await expect(page.locator('.source')).toHaveCount(0);
});
test('Primeira fonte follows the add-on order and an add-on outside the allowed list is skipped', async ({ page }) => {
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { autoPlayMode: 'first' } });
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('video')).toHaveAttribute('src', /clip-1080\.mp4/);
  // "Addons permitidos" restricts the automatic pick to the chosen add-ons.
  await page.addInitScript(() => { const key = 'nuvio-fork.webos.v1'; const state = JSON.parse(localStorage.getItem(key)); state.settings.playback = { ...state.settings.playback, autoPlayAddons: ['Outro addon'] }; localStorage.setItem(key, JSON.stringify(state)); });
  await page.reload(); await page.keyboard.press('Escape');
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(3); // no allowed add-on answered, so the list shows
});
test('a keyword with no match still shows the list and manual mode never auto-plays', async ({ page }) => {
  await tmdb(page);
  await parental(page);
  await boot(page, { playback: { autoPlayMode: 'regex', autoPlayRegex: 'av1' } });
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(3);
  await expect(page.locator('video')).toHaveCount(0);
  // Manual (the fork default) keeps the picker even with a pattern saved.
  await page.addInitScript(() => { const key = 'nuvio-fork.webos.v1'; const state = JSON.parse(localStorage.getItem(key)); state.settings.playback = { ...state.settings.playback, autoPlayMode: 'manual' }; localStorage.setItem(key, JSON.stringify(state)); });
  await page.reload(); await page.keyboard.press('Escape');
  await openMovie(page);
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(3);
});
test('the post-play window counts the last five seconds and starts the trailer at the end', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await tmdb(page);
  await parental(page);
  await boot(page, { bridge: true, playback: { postPlayRecommendations: true, trailerAutoPlay: true, trailerDelay: 3 } });
  await startMovie(page);
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.95; v.play(); });
  const overlay = page.getByRole('dialog', { name: 'Recomendações após assistir' });
  await expect(overlay).toBeVisible();
  // Before the end the countdown is informational: nothing is launched yet.
  await expect(overlay.locator('.post-play-countdown')).toHaveText(/Trailer em \d+s/);
  await page.waitForTimeout(400); // real time: the window fades in
  await page.screenshot({ path: 'test-results/player-post-play-trailer-1920.png' });
  expect(await page.evaluate(() => window.__luna)).toEqual([]);
  // Playback ends: five seconds later the recommendation's trailer opens on the TV.
  await page.locator('video').evaluate(v => { v.pause(); Object.defineProperty(v, 'ended', { configurable: true, get: () => true }); v.dispatchEvent(new Event('ended')); });
  await expect(overlay.locator('.post-play-countdown')).toHaveText('Trailer em 5s');
  await page.clock.runFor(6000);
  // The trailer opens inside the port: the post-play window stays and nothing is launched.
  // The post-play path knows the video id only, so the trailer window is just 'Trailer'.
  const trailerOverlay = page.getByRole('dialog', { name: 'Trailer' });
  await expect(trailerOverlay).toBeVisible();
  await expect(trailerOverlay.locator('iframe.trailer-frame')).toBeVisible();
  expect(await page.evaluate(() => window.__luna)).toEqual([]);
  // The window is still there after the trailer was offered, and it does not fire twice.
  await expect(overlay.locator('.post-play-countdown')).toBeHidden();
  await page.clock.runFor(6000);
  await expect(page.getByRole('dialog', { name: 'Trailer' })).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('with the trailer setting off the post-play window stays silent', async ({ page }) => {
  await page.clock.install();
  await tmdb(page);
  await parental(page);
  await boot(page, { bridge: true, playback: { postPlayRecommendations: true } });
  await startMovie(page);
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.95; v.play(); });
  await expect(page.getByRole('dialog', { name: 'Recomendações após assistir' })).toBeVisible();
  await page.locator('video').evaluate(v => { v.pause(); Object.defineProperty(v, 'ended', { configurable: true, get: () => true }); v.dispatchEvent(new Event('ended')); });
  await page.clock.runFor(10000);
  await expect(page.locator('.post-play-countdown')).toBeHidden();
  expect(await page.evaluate(() => window.__luna)).toEqual([]);
});
test('staying on Assistir opens the trailer of the title after the configured delay', async ({ page }) => {
  await page.clock.install();
  await tmdb(page);
  await parental(page);
  await page.route('**/youtube.com/**', r => r.abort());
  await boot(page, { bridge: true, playback: { trailerAutoPlay: true, trailerDelay: 3 } });
  await openMovie(page);
  const trailerDialog = page.getByRole('dialog', { name: 'Trailer oficial' });
  await expect(trailerDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Assistir', exact: true })).toBeFocused();
  await page.clock.runFor(3000);
  await expect(trailerDialog).toBeVisible();
  await page.screenshot({ path: 'test-results/detail-trailer-idle-1920.png' });
  // The automatic trailer plays inside the port, so the panel offers its own player.
  await expect(trailerDialog.locator('iframe.trailer-frame')).toBeVisible();
  await expect(trailerDialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(trailerDialog).toBeHidden();
  // Once the trailer was offered for this title it is not offered again.
  await expect(page.getByRole('button', { name: 'Assistir', exact: true })).toBeFocused();
  await page.clock.runFor(6000);
  await expect(trailerDialog).toBeHidden();
});
test('a key press before the delay keeps the automatic trailer from interrupting', async ({ page }) => {
  await page.clock.install();
  await tmdb(page);
  await parental(page);
  await boot(page, { bridge: true, playback: { trailerAutoPlay: true, trailerDelay: 3 } });
  await openMovie(page);
  await page.clock.runFor(1500);
  await page.keyboard.press('ArrowDown'); // moves the focus away and cancels the idle timer
  await page.clock.runFor(6000);
  await expect(page.getByRole('dialog', { name: 'Trailer oficial' })).toBeHidden();
});

