import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'https://fixture.example';
const imdb = 'tt1234567';
const movie = { id: imdb, type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local de validação.', releaseInfo: '2026', genres: ['Teste'], poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
const sources = [
  { name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip-1080.mp4' },
  { name: 'Movie 2160p REMUX-FLUX', url: origin + '/clip-2160.mp4' },
  { name: 'Torrent de teste', infoHash: 'abc123' }
];
async function boot(page, { playback = {} } = {}) {
  await page.addInitScript(({ playback, addon }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: { playback } }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: 'a'.repeat(32), language: 'pt-BR' }));
  }, { playback, addon });
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
async function parental(page) {
  await page.route('https://api.tiffara.com/**', route => route.fulfill({ json: { parentsGuide: [] } }));
}
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
async function settings(page, category) {
  await page.goto('/');
  await drawer(page, 'Ajustes');
  if (category) await page.getByRole('button', { name: category, exact: true }).click();
}
async function openSources(page) {
  await page.goto('/');
  await drawer(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(2);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));
test('Buffer e Rede exposes the two durations the TV honours and keeps Media3 rows pending', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [], progress: {}, library: {}, watched: {}, settings: {} })); });
  await page.goto('/');
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  const custom = page.getByRole('switch', { name: 'Buffer de reprodução personalizado', exact: true });
  await expect(custom).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.settings-threshold')).toHaveCount(0);
  await custom.click();
  await expect(custom).toHaveAttribute('aria-checked', 'true');
  // Fork defaults: 5 s before starting, 3 s before resuming after a stall, 20 s guard.
  await expect(page.locator('.settings-threshold-value')).toHaveText(['5s', '3s', '20s']);
  const slower = page.getByRole('button', { name: 'Diminuir buffer inicial', exact: true });
  for (let i = 0; i < 5; i++) await slower.click();
  await expect(page.locator('.settings-threshold-value')).toHaveText(['0s', '3s', '20s']);
  await expect(slower).toBeDisabled(); // 0 s means "do not wait"
  const faster = page.getByRole('button', { name: 'Aumentar buffer inicial', exact: true });
  for (let i = 0; i < 20; i++) await faster.click(); // 0 → 20 s, exactly the ceiling
  await expect(page.locator('.settings-threshold-value')).toHaveText(['20s', '3s', '20s']);
  await expect(faster).toBeDisabled();
  const rebuffer = page.getByRole('button', { name: 'Aumentar buffer após travamento', exact: true });
  for (let i = 0; i < 2; i++) await rebuffer.click();
  const guard = page.getByRole('button', { name: 'Aumentar tempo limite de espera', exact: true });
  for (let i = 0; i < 8; i++) await guard.click(); // 20 → 60 s, the fork's ceiling
  await expect(page.locator('.settings-threshold-value')).toHaveText(['20s', '5s', '60s']);
  await expect(guard).toBeDisabled();
  await page.locator('.settings-group', { hasText: 'Buffer de reprodução personalizado' }).evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/settings-buffer-1920.png' });
  // The rows that only exist inside Media3 stay visible and marked.
  const escaped = title => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  for (const title of ['Duração mínima e máxima do buffer', 'Gerenciamento de uso de memória', 'Cache em disco', 'Rede personalizada', 'Memória nativa do ExoPlayer', 'Ajuste automático de taxa de quadros (AFR)']) {
    await expect(page.getByRole('button', { name: escaped(title) })).toContainText('Pendente');
  }
  const saved = (await stored(page)).settings.playback;
  expect(saved.customBuffer).toBe(true);
  expect(saved.bufferInitial).toBe(20);
  expect(saved.bufferAfterRebuffer).toBe(5);
  expect(saved.bufferWaitTimeout).toBe(60);
  await page.reload(); await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Buffer de reprodução personalizado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.settings-threshold-value')).toHaveText(['20s', '5s', '60s']);
  expect(errors).toEqual([]);
});
test('the custom buffer does not block playback and the default stays off', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await parental(page);
  await boot(page, { playback: { customBuffer: true, bufferInitial: 20, bufferAfterRebuffer: 5, bufferWaitTimeout: 15 } });
  await openSources(page);
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  // The fixture buffers instantly, so the target is met without waiting; playback runs.
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v => { v.currentTime = v.duration * 0.2; v.play().catch(() => {}); });
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(1);
  await expect(page.locator('.player-screen')).toBeVisible();
  expect(errors).toEqual([]);
});
test('Testar velocidade measures the real source with a ranged request and never reorders the list', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const ranges = [];
  page.on('request', request => { const header = request.headers().range; if (header) ranges.push([new URL(request.url()).pathname, header]); });
  await parental(page);
  await boot(page);
  await openSources(page);
  const note = page.locator('.stream-speed-note');
  await expect(note).toHaveText('A medição usa a fonte real, com um orçamento pequeno de bytes.');
  await page.getByRole('button', { name: 'Testar velocidade das fontes', exact: true }).click();
  // Both HTTP sources answer with a measured rate and latency; the magnet source is skipped.
  await expect(page.locator('.source-speed:not([hidden])')).toHaveCount(2);
  await expect(page.locator('.source-speed').first()).toHaveText(/Mbps · \d+ ms/);
  await expect(note).toContainText('Medição feita sobre a fonte real');
  expect(ranges.length).toBe(2);
  for (const [, header] of ranges) expect(header).toMatch(/^bytes=0-\d+$/);
  // The measurement is information only: the order, the count and the automatic pick stay put.
  await expect(page.locator('.source').first()).toContainText('Movie 2160p REMUX-FLUX');
  await expect(page.locator('.source')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/streams-speed-test-1920.png' });
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect(page.locator('video')).toHaveAttribute('src', /clip-2160\.mp4/);
  expect(errors).toEqual([]);
});
test('a failed measurement is reported per source instead of breaking the list', async ({ page }) => {
  await parental(page);
  await boot(page);
  await page.route(origin + '/clip-1080.mp4', route => route.fulfill({ status: 403, body: '' }));
  await openSources(page);
  await page.getByRole('button', { name: 'Testar velocidade das fontes', exact: true }).click();
  await expect(page.locator('.source-speed:not([hidden])')).toHaveCount(2);
  // The card order is the fork ranking: the 2160p remux first, the refused 1080p second.
  await expect(page.locator('.source', { hasText: '1080p' }).locator('.source-speed')).toHaveText('HTTP 403');
  await expect(page.locator('.source', { hasText: '2160p' }).locator('.source-speed')).toHaveText(/Mbps · \d+ ms/);
});
test('Diagnóstico points the speed test at the source list instead of a dead control', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [], progress: {}, library: {}, watched: {}, settings: {} })); });
  await page.goto('/');
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Avançado', exact: true }).click();
  const row = page.getByRole('button', { name: /^Teste de velocidade/ });
  await expect(row).toContainText('Na lista de fontes');
  await row.click();
  const dialog = page.getByRole('dialog', { name: 'Teste de velocidade' });
  await expect(dialog).toContainText('Testar velocidade');
  await expect(dialog).toContainText('não altera a ordem da lista');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toBeHidden();
});
