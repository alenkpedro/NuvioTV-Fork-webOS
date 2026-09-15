import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const imdb = 'tt1234567';
const movie = { id: imdb, type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local de validação.', releaseInfo: '2026', genres: ['Teste'], poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
async function boot(page, { playback = {} } = {}) {
  await page.addInitScript(({ playback, addon }) => {
    localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: 'a'.repeat(32), language: 'pt-BR' }));
  }, { playback, addon });
  await page.route(origin + '/**', route => {
    const u = new URL(route.request().url()), p = decodeURIComponent(u.pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) {
      if (p.includes('tt0000011')) return json({ meta: { ...movie, id: 'tt0000011', imdb_id: 'tt0000011', name: 'Recomendação um' } });
      if (p.includes('tt0000012')) return json({ meta: { ...movie, id: 'tt0000012', imdb_id: 'tt0000012', name: 'Recomendação dois' } });
      return json({ meta: movie });
    }
    if (p.includes('/stream/')) return json({ streams: [{ name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4' }] });
    if (p.endsWith('/clip.mp4')) {
      const body = fs.readFileSync('tests/fixtures/clip.mp4');
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: body.subarray(start, end + 1), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) } });
    }
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#284568"/></svg>' });
    return route.abort();
  });
}
// TMDB answers the same detail call the player already makes for artwork, now with
// recommendations, so the post-play window needs no extra request.
async function tmdb(page, { recommendations = true } = {}) {
  const calls = [];
  await page.route('https://api.themoviedb.org/**', route => {
    const u = new URL(route.request().url()); calls.push(u.pathname);
    const json = body => route.fulfill({ json: body });
    if (u.pathname.includes('/find/')) return json({ movie_results: [{ id: 603 }], tv_results: [] });
    if (u.pathname === '/3/configuration') return json({ images: {} });
    // /movie/11 and /movie/12 are the recommendations: TMDB reports their imdb ids.
    const candidate = u.pathname.match(/^\/3\/movie\/(1[12])$/);
    if (candidate) return json({ id: Number(candidate[1]), imdb_id: `tt00000${candidate[1]}`, external_ids: { imdb_id: `tt00000${candidate[1]}` }, title: candidate[1] === '11' ? 'Recomendação um' : 'Recomendação dois', overview: 'Sinopse do TMDB.', runtime: 95, vote_average: 7.1, vote_count: 640, images: { logos: [] }, credits: { cast: [] }, videos: { results: [] }, recommendations: { results: [] } });
    return json({ id: 603, title: 'Horizonte de teste', overview: 'Sinopse do TMDB.', runtime: 100, vote_average: 8.4, vote_count: 1200, genres: [{ name: 'Teste' }], images: { logos: [] }, credits: { cast: [] }, videos: { results: [] }, recommendations: recommendations ? { results: [{ id: 11, title: 'Recomendação um', overview: 'Primeira sugestão.', poster_path: '/r1.jpg', backdrop_path: '/b1.jpg', release_date: '2024-05-02', vote_average: 7.9 }, { id: 12, title: 'Recomendação dois', overview: 'Segunda sugestão.', poster_path: '/r2.jpg', release_date: '2023-01-10', vote_average: 6.4 }] } : { results: [] } });
  });
  return calls;
}
async function parental(page, { warnings = true } = {}) {
  const calls = [];
  await page.route('https://api.tiffara.com/**', route => {
    calls.push(route.request().url());
    return route.fulfill({ json: warnings ? { parentsGuide: [
      { category: 'SEXUAL_CONTENT', severityBreakdowns: [{ severityLevel: 'none', voteCount: 534 }, { severityLevel: 'mild', voteCount: 576 }] },
      { category: 'VIOLENCE', severityBreakdowns: [{ severityLevel: 'mild', voteCount: 106 }, { severityLevel: 'moderate', voteCount: 416 }] },
      { category: 'PROFANITY', severityBreakdowns: [{ severityLevel: 'severe', voteCount: 385 }, { severityLevel: 'mild', voteCount: 285 }] }
    ] } : { parentsGuide: [] } });
  });
  return calls;
}
async function startMovie(page) {
  await page.goto('/');
  await page.keyboard.press('Escape');
  if (!await page.locator('.sidebar').count()) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Início', exact: true }).click();
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
}
test('parental guide is fetched once, shown at the start of playback and hides after the hold', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const calls = await parental(page);
  await tmdb(page);
  await page.clock.install();
  await boot(page);
  await startMovie(page);
  const guide = page.locator('.parental-guide');
  await expect(guide).toHaveClass(/visible/);
  await expect(guide).toContainText('Violência');
  await expect(guide).toContainText('Moderado');
  await expect(guide).toContainText('Linguagem Imprópria');
  await expect(guide).toContainText('Intenso');
  await expect(guide).toContainText('Nudez');
  await expect(guide).toContainText('Leve');
  // Severity order first: severe, moderate, mild.
  await expect(guide.locator('.parental-row strong')).toHaveText(['Linguagem Imprópria', 'Violência', 'Nudez']);
  await expect(page.locator('.player-screen')).toHaveClass(/controls-visible/); // independent of the player UI
  await page.waitForTimeout(700); // transitions are real time, the page clock is not
  await page.screenshot({ path: 'test-results/player-parental-guide-1920.png' });
  expect(calls).toEqual(['https://api.tiffara.com/titles/tt1234567/parentsGuide']);
  await page.clock.runFor(6000);
  await expect(guide).toBeHidden();
  await expect(guide).not.toHaveClass(/visible/);
  expect(errors).toEqual([]);
});
test('parental guide stays off when disabled and does not interrupt other panels', async ({ page }) => {
  const calls = await parental(page);
  await tmdb(page);
  const state = page;
  await boot(state, { playback: { parentalGuide: false } });
  await startMovie(state);
  await state.locator('video').evaluate(v => { v.pause(); v.currentTime = 5; v.play(); });
  await state.waitForTimeout(150);
  await expect(state.locator('.parental-guide')).toBeHidden();
  expect(calls).toEqual([]);
});
test('post-play offers TMDB recommendations with previous, next, play and return', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await parental(page, { warnings: false });
  await tmdb(page);
  await boot(page, { playback: { postPlayRecommendations: true, postPlayMovieThreshold: 90 } });
  await startMovie(page);
  await expect(page.locator('.post-play')).toBeHidden(); // before the threshold
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.95; v.play(); });
  const overlay = page.getByRole('dialog', { name: 'Recomendações após assistir' });
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.post-play-reason')).toHaveText('Porque você assistiu a Horizonte de teste');
  await expect(overlay.locator('h2')).toHaveText('Recomendação um');
  await expect(overlay.locator('.post-play-facts')).toContainText('2024');
  await expect(overlay.locator('.post-play-description')).toHaveText('Primeira sugestão.');
  await expect(overlay.locator('.post-play-counter')).toHaveText('1 de 2');
  await expect(page.getByRole('button', { name: 'Assistir', exact: true })).toBeFocused();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/player-post-play-1920.png' });
  await page.getByRole('button', { name: 'Próxima recomendação', exact: true }).click();
  await expect(overlay.locator('h2')).toHaveText('Recomendação dois');
  await expect(overlay.locator('.post-play-counter')).toHaveText('2 de 2');
  await page.keyboard.press('ArrowRight');
  await expect(overlay.locator('h2')).toHaveText('Recomendação um'); // the carousel wraps
  await page.getByRole('button', { name: 'Voltar para o player', exact: true }).click();
  await expect(overlay).toBeHidden();
  // Dismissing is final for this playback, even while the credits keep playing.
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.97; v.play(); });
  await page.waitForTimeout(150);
  await expect(overlay).toBeHidden();
  await expect(page.locator('.player-screen')).toHaveClass(/controls-visible/);
  expect(errors).toEqual([]);
});
test('post-play Assistir opens the recommended title and the setting stays opt-in', async ({ page }) => {
  await parental(page, { warnings: false });
  await tmdb(page);
  await boot(page, { playback: { postPlayRecommendations: true } });
  await startMovie(page);
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.96; v.play(); });
  const overlay = page.getByRole('dialog', { name: 'Recomendações após assistir' });
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.post-play-counter')).toHaveText('1 de 2');
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recomendação um' })).toBeVisible();
  // The recommendation is resolved through TMDB, so the addon gets the IMDb id and
  // the source list is reachable, which is what the fork's Assistir achieves.
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(1);
  await expect(page.locator('.source')).toContainText('1080p');
});
test('post-play and parental guide stay silent without the opt-in settings', async ({ page }) => {
  await parental(page);
  await tmdb(page);
  await boot(page);
  await startMovie(page);
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.97; v.play(); });
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog', { name: 'Recomendações após assistir' })).toBeHidden();
});