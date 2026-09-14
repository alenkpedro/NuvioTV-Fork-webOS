import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const origin = 'https://fixture.example';
const movie = { id: 'ttfixture', type: 'movie', name: 'Horizonte de teste', description: 'Catálogo local de validação. Nenhum serviço externo é consultado.', releaseInfo: '2026', genres: ['Teste'], poster: origin + '/poster.svg', background: origin + '/backdrop.svg' };
const show = { id: 'ttshow', type: 'series', name: 'Série de teste', poster: origin + '/poster.svg', background: origin + '/backdrop.svg', description: 'Uma série do catálogo de validação.', videos: [{ id: 'ttshow:1:1', title: 'Primeiro episódio', season: 1, episode: 1 }] };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { const key = 'nuvio-fork.webos.v1'; const state = JSON.parse(localStorage.getItem(key) || 'null') || { addons: [], progress: {}, settings: {} }; state.guestMode = true; localStorage.setItem(key, JSON.stringify(state)); });
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
  if (!await page.locator('#app').evaluate(e => e.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
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

test('Modern layout options persist and remote can always recover a hidden sidebar', async ({ page }) => {
  await install(page); await navigation(page, 'Ajustes');
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  for (const title of ['Barra lateral moderna', 'Pôsteres Horizontais', 'Fundo em tela cheia']) {
    const toggle = page.getByRole('switch', { name: title, exact: true });
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
  await page.getByRole('switch', { name: 'Títulos nos pôsteres', exact: true }).click();
  await navigation(page, 'Início');
  const first = page.getByRole('button', { name: 'Horizonte de teste', exact: true });
  await expect(first).toBeFocused();
  const art = await first.locator('.art').boundingBox();
  expect(art.x).toBeCloseTo(104, 0);
  expect(art.width).toBeCloseTo(418.7232, 0); expect(art.height).toBeCloseTo(236.5668, 0);
  await expect(first.locator('strong')).toBeHidden();
  await expect(page.locator('.hero-backdrop')).toHaveCSS('height', '540px');
  await page.locator('#toast').evaluate(e => e.hidden = true);
  await page.screenshot({ path: 'test-results/modern-landscape-full-1920.png' });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '208px');
  await expect(page.locator('.sidebar')).toHaveCSS('opacity', '1');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab'); // Inert content must not receive focus behind the menu.
  await expect(page.locator(':focus')).toHaveClass(/nav-item/);
  await page.screenshot({ path: 'test-results/modern-sidebar-1920.png' });
  await page.keyboard.press('ArrowRight'); await expect(first).toBeFocused();
  await navigation(page, 'Ajustes'); await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByRole('switch', { name: 'Recolher barra lateral', exact: true }).click();
  await page.reload();
  await expect(page.locator('#app')).toHaveClass(/modern-sidebar/);
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.sidebar-pill')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('button', { name: 'Início', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(first).toBeFocused();
});

test('focused hero metadata enriches after settling and ignores a late response for the previous card', async ({ page }) => {
  let releaseOld, requests = 0;
  const gate = new Promise(resolve => releaseOld = resolve);
  await page.route('https://fixture.example/meta/movie/**', async route => {
    requests++; await gate;
    await route.fulfill({ json: { meta: { ...movie, name: 'Resposta antiga' } } }).catch(() => {});
  });
  await page.route('https://fixture.example/meta/series/**', route => route.fulfill({ json: { meta: { ...show, description: 'Sinopse completa do serviço de metadados.', logo: origin + '/poster.svg' } } }));
  await install(page); await navigation(page, 'Início');
  await expect.poll(() => requests).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.hero-description')).toHaveText('Sinopse completa do serviço de metadados.');
  releaseOld();
  await expect(page.locator('.home-hero .title-logo')).toHaveAttribute('alt', 'Série de teste');
  await expect(page.getByRole('button', { name: 'Série de teste', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Assistir: T1:E1', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Série de teste', exact: true })).toBeFocused();
});

test('series uses horizontal episode cards, restores chosen season and resumes independently of visible season', async ({ page }) => {
  const enriched = { ...show, videos: [
    { id: 'ttshow:0:1', title: 'Especial', season: 0, episode: 1 },
    { id: 'ttshow:1:1', title: 'Primeiro episódio', season: 1, episode: 1, overview: 'Descrição do episódio para validar o cartão do fork.', thumbnail: origin + '/backdrop.svg', runtime: '45 min' },
    { id: 'ttshow:2:1', title: 'Segunda temporada', season: 2, episode: 1 },
    { id: 'ttshow:2:2', title: 'Lançamento futuro', season: 2, episode: 2, released: '2099-01-01T00:00:00Z' },
  ] };
  await page.route('https://fixture.example/meta/series/**', route => route.fulfill({ json: { meta: enriched } }));
  await install(page);
  await page.evaluate(() => { const key = 'nuvio-fork.webos.v1'; const s = JSON.parse(localStorage.getItem(key)); s.progress[JSON.stringify(['series', 'ttshow:1:1'])] = { id: 'ttshow:1:1', type: 'series', meta: { id: 'ttshow', name: 'Série de teste', type: 'series' }, time: 90, duration: 2700, complete: false, updated: Date.now() }; localStorage.setItem(key, JSON.stringify(s)); });
  await page.reload();
  await page.locator('.catalog-section:not(.continue-section)').getByRole('button', { name: 'Série de teste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retomar: T1:E1', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Temporada 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Temporada 1', exact: true }).click();
  await expect(page.locator('.episode').first()).toBeFocused();
  const rect = await page.locator('.episode').first().boundingBox();
  expect(rect.width).toBe(640); expect(rect.height).toBe(414);
  await page.locator('#toast').evaluate(e => e.hidden = true);
  await page.screenshot({ path: 'test-results/detail-episodes-1920.png' });
  await page.getByRole('tab', { name: 'Temporada 2', exact: true }).click();
  await page.getByRole('button', { name: /Lançamento futuro/ }).click({ force: true });
  await expect(page.locator('#toast')).toContainText('ainda não foi lançado');
  await expect(page.locator('.screen-streams')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retomar: T1:E1', exact: true }).click();
  await expect(page.getByText('Temporada 1 · Episódio 1', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tab', { name: 'Temporada 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Temporada 2', exact: true }).click();
  await page.getByRole('button', { name: /Segunda temporada/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Segunda temporada/ })).toBeFocused();
});

test('detail full synopsis traps focus and cast metadata never becomes HTML', async ({ page }) => {
  const description = 'Uma descrição longa para leitura completa. '.repeat(40);
  await page.route('https://fixture.example/meta/movie/**', route => route.fulfill({ json: { meta: { ...movie, description, director: ['Diretor de teste'], runtime: '123 min', cast: ['Pessoa de teste', '<img src=x onerror="window.injected=true">'] } } }));
  await install(page); await navigation(page, 'Início');
  await page.getByRole('button', { name: 'Horizonte de teste', exact: true }).click();
  await expect(page.locator('.detail-title')).toHaveCSS('font-weight', '700');
  await page.getByRole('button', { name: 'Ler sinopse completa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(description);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.dialog-copy')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  expect(await page.locator('.dialog-copy').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ler sinopse completa', exact: true })).toBeFocused();
  await page.locator('.cast-card').first().focus();
  await page.locator('.cast-card').first().evaluate(e => e.scrollIntoView({ block: 'nearest' }));
  await expect(page.locator('.cast-card')).toHaveCount(3);
  await expect(page.locator('.cast-card').first()).toContainText('Diretor de teste');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.locator('#toast').evaluate(e => e.hidden = true);
  await page.screenshot({ path: 'test-results/detail-cast-1920.png' });
});

test('duplicate titles in different home catalogs restore focus to their own row', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://fixture.example/manifest.json', route => route.fulfill({ json: { id: 'local.test', name: 'Catálogo de teste', resources: ['catalog', 'meta'], types: ['movie', 'series'], catalogs: [{ id: 'first', name: 'Primeira faixa', type: 'movie' }, { id: 'second', name: 'Segunda faixa', type: 'movie' }] } }));
  await install(page); await navigation(page, 'Início');
  await expect(page.locator('.catalog-section').first().locator('.card').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  expect(errors).toEqual([]);
  const second = page.locator('.catalog-section').nth(1).locator('.card').first();
  await expect(second).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.detail-title')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(second).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(page.locator('.catalog-section').first().locator('.card').first()).toBeFocused();
});
