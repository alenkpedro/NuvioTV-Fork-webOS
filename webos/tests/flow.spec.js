import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const origin = 'https://fixture.example';
const movie = { id: 'ttfixture', type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local de validação. Nenhum serviço externo é consultado.', releaseInfo: '2026', genres: ['Teste'], poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const show = { id: 'ttshow', type: 'series', name: 'Série de teste', poster: origin + '/poster.svg', background: origin + '/backdrop.svg', description: 'Uma série do catálogo de validação.', videos: [{ id: 'ttshow:1:1', title: 'Primeiro episódio', season: 1, episode: 1 }] };
test.beforeEach(async ({ page }) => {
  await page.route('https://fixture.example/**', async route => {
    const u = new URL(route.request().url()); const p = decodeURIComponent(u.pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json({ id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie', extra: [{ name: 'search' }] }] });
    if (p.includes('/catalog/')) return json({ metas: [movie, show] });
    if (p.includes('/meta/')) return json({ meta: p.includes('ttshow') ? show : movie });
    if (p.includes('/stream/')) return json({ streams: [{ name: 'Movie 2160p BluRay-YIFY', url: origin + '/clip.mp4' }, { name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4', title: 'Fonte HTTP de teste' }, { name: 'Movie 2160p DV-FraMeSToR', url: origin + '/clip.mp4' }, { name: 'Torrent de teste', infoHash: 'abc' }] });
    if (p === '/backdrop.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#384752"/><circle cx="960" cy="270" r="140" fill="#b6b3a7"/><path d="M0 720L520 220L970 720M600 720L1100 300L1280 600V720" fill="#17212a"/></svg>' });
    if (p === '/poster.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#284568"/><circle cx="150" cy="190" r="75" fill="#aac9ef"/><path d="M0 400L160 200L300 400Z" fill="#0b1930"/></svg>' });
    if (p === '/clip.mp4') {
      const body = fs.readFileSync('tests/fixtures/clip.mp4');
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: body.subarray(start, end + 1), headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) } });
    }
    return route.abort();
  });
});
async function navigation(page, title) {
  for (let i = 0; i < 5 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(e => e.classList.contains('drawer-open'))) await page.locator('.nav-item').first().click();
  await page.getByRole('button', { name: title, exact: true }).click();
}
async function openAddons(page) {
  await navigation(page, 'Ajustes');
  await page.getByRole('button', { name: 'Conteúdo e Descoberta', exact: true }).click();
  await page.getByRole('button', { name: /^Addons/ }).click();
}
async function install(page) {
  await page.goto('/');
  await openAddons(page);
  await page.getByRole('textbox', { name: 'URL do manifesto' }).fill(origin + '/manifest.json');
  await page.getByRole('button', { name: 'Instalar add-on' }).click();
  await expect(page.getByRole('heading', { name: 'Catálogo de teste' })).toBeVisible();
}
test('install → home → movie → ranked streams → video → resume, using only fixture media', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await install(page);
  await navigation(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/reference-streams-1920.png' }); // FLUX plus DV, latter explicitly unavailable.
  await expect(page.locator('.source').filter({ hasText: 'Dolby Vision' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect(page.locator('video')).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v => { v.currentTime = 25; v.pause(); });
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(24);
  await page.getByRole('button', { name: 'Voltar às fontes' }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(24);
  await page.keyboard.press('Escape');
  await navigation(page, 'Início');
  await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/home-1920.png', fullPage: true });
});
test('series navigation, settings persistence and remote back key 461', async ({ page }) => {
  await install(page);
  await navigation(page, 'Início');
  await page.getByRole('button', { name: 'Série de teste' }).click();
  await page.getByRole('button', { name: /Primeiro episódio/ }).click();
  await expect(page.getByText('Temporada 1 · Episódio 1', { exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true })));
  await expect(page.getByRole('heading', { name: 'Episódios' })).toBeVisible();
  await navigation(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await page.getByRole('button', { name: /Preferências de fontes/ }).click();
  await page.getByLabel('Grupos excluídos', { exact: true }).fill('MyGroup');
  await page.getByRole('button', { name: 'Salvar grupos excluídos' }).click();
  await page.reload();
  await navigation(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await page.getByRole('button', { name: /Preferências de fontes/ }).click();
  await expect(page.getByLabel('Grupos excluídos', { exact: true })).toHaveValue('MyGroup');
});
test('empty-state remote navigation and invalid add-on do not break the app', async ({ page }) => {
  await page.goto('/'); await page.keyboard.press('ArrowLeft');
  await expect(page.locator(':focus')).toHaveClass(/nav-item/);
  await openAddons(page);
  await page.route('https://invalid.example/**', r => r.fulfill({ body: '{bad', contentType: 'application/json' }));
  await page.getByRole('textbox', { name: 'URL do manifesto' }).fill('https://invalid.example/manifest.json');
  await page.getByRole('button', { name: 'Instalar add-on' }).click();
  await expect(page.locator('#toast')).toContainText('JSON válido');
  await expect(page.getByRole('button', { name: 'Instalar add-on' })).toBeEnabled();
});
test('source without direct URL is explicitly unavailable', async ({ page }) => {
  await install(page); await navigation(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click(); await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Mostrar todas' }).click();
  await expect(page.locator('.source').filter({ hasText: 'Torrent de teste' })).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.source').filter({ hasText: 'Torrent de teste' }).click({ force: true });
  await expect(page.locator('video')).toHaveCount(0);
});

test('packaged file entry point boots without a web server or JavaScript modules', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await expect(page.getByText('Nenhum addon instalado. Adicione um para começar.', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true);
  for (const name of ['search', 'library', 'settings']) await expect(page.locator(`.icon-${name} svg path`).first()).toHaveAttribute('fill', 'currentColor');
  await page.screenshot({ path: 'test-results/reference-packaged-1920.png' });
  expect(errors).toEqual([]);
});

test('addon metadata is rendered as text, never executed as HTML', async ({ page }) => {
  await page.route('https://fixture.example/manifest.json', route => route.fulfill({ json: { id: 'hostile.fixture', name: '<img src=x onerror="window.injected=true">', resources: [], catalogs: [] } }));
  await page.goto('/'); await openAddons(page);
  await page.getByRole('textbox', { name: 'URL do manifesto' }).fill(origin + '/manifest.json');
  await page.getByRole('button', { name: 'Instalar add-on' }).click();
  await expect(page.getByRole('heading', { name: '<img src=x onerror="window.injected=true">' })).toBeVisible();
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});


test('reference home geometry, collapsed sidebar, font, and empty state at 1080p', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText('Nenhum addon instalado. Adicione um para começar.', { exact: true })).toBeVisible();
  await expect(page.locator('.brand')).toBeHidden();
  const geometry = await page.evaluate(() => ({
    rail: document.querySelector('.sidebar').getBoundingClientRect().width,
    content: document.querySelector('main').getBoundingClientRect().left,
    color: getComputedStyle(document.querySelector('#app')).backgroundColor,
    font: getComputedStyle(document.querySelector('main')).fontFamily,
    fontLoaded: document.fonts.check('16px Inter'),
    center: document.querySelector('.home-empty').getBoundingClientRect().top + document.querySelector('.home-empty').getBoundingClientRect().height / 2
  }));
  expect(geometry).toEqual({ rail: 144, content: 108, color: 'rgb(13, 13, 13)', font: 'Inter, sans-serif', fontLoaded: true, center: 540 });
  await page.screenshot({ path: 'test-results/reference-empty-1920.png' });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '196px');
  await expect(page.getByRole('button', { name: 'Início', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Biblioteca', exact: true })).toBeFocused();
  await page.screenshot({ path: 'test-results/reference-drawer-1920.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).not.toHaveClass(/drawer-open/);
});

test('poster focus updates reference hero and restores after drawer, library survives restart', async ({ page }) => {
  await install(page); await navigation(page, 'Início');
  const first = page.getByRole('button', { name: 'Horizonte de teste', exact: true });
  await expect(first).toBeFocused();
  const art = await first.locator('.art').boundingBox();
  expect(art.x).toBeCloseTo(212, 0); // Main offset 54 + row padding 52, scaled ×2.
  expect(art.y).toBeCloseTo(594.4, 0); // 48% of 540 + title 24 + gap 14, scaled ×2.
  expect(art.width).toBeCloseTo(228.6144, 0);
  expect(art.height).toBeCloseTo(342.9216, 0);
  await expect(page.locator('.home-hero h1')).toHaveText('Horizonte de teste');
  await page.screenshot({ path: 'test-results/reference-home-1920.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.home-hero h1')).toHaveText('Série de teste');
  await page.keyboard.press('Escape'); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Série de teste', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Adicionar à biblioteca', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remover da biblioteca' })).toBeVisible();
  await page.screenshot({ path: 'test-results/reference-detail-1920.png' });
  await page.reload(); await navigation(page, 'Biblioteca');
  await expect(page.getByRole('button', { name: 'Horizonte de teste', exact: true })).toBeVisible();
  await navigation(page, 'Ajustes');
  await page.getByRole('button', { name: 'Conteúdo e Descoberta', exact: true }).click();
  await page.screenshot({ path: 'test-results/reference-settings-1920.png' });
});
