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
async function leavePlayer(page) {
  for(let i=0;i<5 && await page.locator('video').count();i++)await page.keyboard.press('Escape');
  await expect(page.locator('video')).toHaveCount(0);
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
  await leavePlayer(page);
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

async function startFixtureVideo(page) {
  await install(page); await navigation(page, 'Início');
  await page.getByRole('button', { name: /Horizonte de teste/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.getByRole('button', { name: 'Reproduzir melhor fonte' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 25; });
}
test('external subtitles render safely, survive errors, seek, adjust and close with LG Back', async ({ page }) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/stream/movie/**', r=>r.fulfill({json:{streams:[{name:'Movie 1080p WEB-DL-FLUX',url:origin+'/clip.mp4',subtitles:[{url:origin+'/por.srt',lang:'por',name:'Português SRT'},{url:origin+'/bad.srt',lang:'eng',name:'Legenda com erro'}]}]}}));
  await page.route('**/por.srt', r=>r.fulfill({body:'1\n00:00:20,000 --> 00:00:30,000\nOlá <i>mundo</i> &lt;img src=x&gt;\n\n2\n00:00:30,000 --> 00:00:40,000\nSegundo trecho',contentType:'text/plain'}));
  await page.route('**/bad.srt',r=>r.fulfill({status:403,body:'expired'}));
  await startFixtureVideo(page);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Legendas'});
  await dialog.getByRole('button',{name:/Português SRT/}).click();
  await expect(page.locator('.subtitle-overlay')).toHaveText('Olá mundo <img src=x>');
  await expect(page.locator('.subtitle-overlay img')).toHaveCount(0);
  await dialog.getByRole('button',{name:/Legenda com erro/}).click();
  await expect(dialog.getByRole('alert')).toContainText('HTTP 403');
  await expect(page.locator('.subtitle-overlay')).toHaveText('Olá mundo <img src=x>');
  await dialog.getByRole('button',{name:/Ajustes de legenda/}).click();
  await expect(dialog.getByRole('button',{name:/Tamanho|Fundo da legenda/})).toHaveCount(0);
  await expect(page.locator('.subtitle-overlay')).toHaveCSS('font-size','19.44px');
  await dialog.getByRole('button',{name:'Atrasar 0,1 s',exact:true}).click();
  await expect(dialog).toContainText('Atraso: +100 ms');
  await page.locator('video').evaluate(v=>v.currentTime=30.05);
  await expect(page.locator('.subtitle-overlay')).toContainText('Olá mundo');
  await dialog.getByRole('button',{name:'Zerar atraso',exact:true}).click();
  await expect(page.locator('.subtitle-overlay')).toHaveText('Segundo trecho');
  await page.screenshot({path:'test-results/player-subtitle-settings-1920.png'});
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));
  await expect(dialog).toHaveCount(0);await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('button',{name:'Legendas',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button',{name:'Desativadas',exact:true}).click();
  await expect(page.locator('.subtitle-overlay')).toBeHidden();
  await page.screenshot({path:'test-results/player-subtitles-1920.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('slider',{name:'Posição do vídeo'}).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeLessThan(21);
  await expect(page.locator('.subtitle-overlay')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});
test('audio menu uses exposed track API, remote selection and modal focus; absent API is explicit', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){return this.fixtureTracks ||= [{label:'Original',language:'eng',enabled:true},{label:'Dublado',language:'por',enabled:false}];}}));
  await startFixtureVideo(page);
  await page.getByRole('button',{name:'Áudio',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Áudio'});
  await expect(dialog.getByRole('button',{name:/Original/})).toBeFocused();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button',{name:/Dublado/})).toHaveAttribute('aria-pressed','true');
  expect(await page.locator('video').evaluate(v=>v.audioTracks.map(t=>t.enabled))).toEqual([false,true]);
  expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);
  await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');
  await page.screenshot({path:'test-results/player-audio-1920.png'});
  for(let i=0;i<5;i++) {await page.keyboard.press('Tab'); expect(await dialog.evaluate(d=>d.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');
  await page.locator('video').evaluate(v=>Object.defineProperty(v,'audioTracks',{value:undefined}));
  await page.getByRole('button',{name:'Áudio',exact:true}).click();
  await expect(dialog).toContainText('não expôs faixas de áudio');
});
test('subtitle addons receive episode ID; pending download is cancelled on panel close', async ({ page }) => {
  let release;const pending=new Promise(r=>release=r);const requests=[];
  await page.route('**/manifest.json',r=>r.fulfill({json:{id:'local.test',name:'Catálogo de teste',version:'1',resources:['catalog','meta','stream','subtitles'],types:['movie','series'],catalogs:[{id:'test',name:'Coleção de teste',type:'movie'}]}}));
  await page.route('**/subtitles/**',r=>{requests.push(decodeURIComponent(r.request().url()));return r.fulfill({json:{subtitles:[{name:'Português addon',lang:'por',url:origin+'/slow.srt'}]}});});
  await page.route('**/slow.srt',async r=>{await pending;await r.fulfill({body:'1\n00:00:00,000 --> 00:01:00,000\nResposta tardia'}).catch(()=>{});});
  await install(page); await navigation(page,'Início');
  await page.getByRole('button',{name:'Série de teste',exact:true}).click();await page.getByRole('button',{name:/Primeiro episódio/}).click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v=>v.pause());await page.getByRole('button',{name:'Legendas',exact:true}).click();
  await page.getByRole('button',{name:/Português addon/}).click();
  await expect(page.getByRole('dialog')).toContainText('Carregando…');
  await page.keyboard.press('Escape');release();
  expect(requests[0]).toContain('/subtitles/series/ttshow:1:1.json');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();
  await expect(page.getByRole('button',{name:'Desativadas',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.subtitle-overlay')).toBeHidden();
});
test('source refresh, addon filter, best-source scope and Back selection are preserved', async ({ page }) => {
  await install(page);
  await page.route('https://second.example/**',r=>r.fulfill({json:r.request().url().endsWith('manifest.json')?{id:'second',name:'Segunda fonte',resources:['stream'],types:['movie'],catalogs:[]}:{streams:[{name:'Segunda 1080p WEB-DL',url:origin+'/clip.mp4'}]}}));
  await page.getByRole('textbox',{name:'URL do manifesto'}).fill('https://second.example/manifest.json');await page.getByRole('button',{name:'Instalar add-on'}).click();
  await expect(page.getByRole('heading',{name:'Segunda fonte'})).toBeVisible();
  await navigation(page,'Início');await page.getByRole('button',{name:/Horizonte de teste/}).click();await page.getByRole('button',{name:'Assistir',exact:true}).click();
  await page.getByRole('button',{name:'Segunda fonte',exact:true}).click();
  await expect(page.locator('.source')).toHaveCount(1);
  await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
  await page.getByRole('button',{name:'Informações de reprodução',exact:true}).click();await expect(page.locator('.stats')).toContainText('Fonte: Segunda fonte');
  await leavePlayer(page);
  await expect(page.getByRole('button',{name:'Segunda fonte',exact:true})).toHaveClass(/selected/);
  await page.locator('.source').click();await leavePlayer(page);
  await expect(page.locator('.source')).toBeFocused();
  await page.getByRole('button',{name:'Atualizar fontes',exact:true}).click();
  await expect(page.locator('.source')).toHaveCount(1);await expect(page.getByRole('button',{name:'Atualizar fontes',exact:true})).toBeFocused();
});

async function playbackPrefs(page, prefs) {
  await page.addInitScript(prefs=>{const key='nuvio-fork.webos.v1';const state=JSON.parse(localStorage.getItem(key));state.settings.playback=prefs;localStorage.setItem(key,JSON.stringify(state));},prefs);
}
test('preferred tracks handle regional languages, late tracks and manual overrides',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await playbackPrefs(page,{audio:'pt-br',secondaryAudio:'en',subtitles:'off'});
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){if(!this.fixtureTracks){const list=[{label:'Original',language:'eng',enabled:true},{label:'Dublado',language:'por',enabled:false}];const events=new EventTarget();list.addEventListener=events.addEventListener.bind(events);list.removeEventListener=events.removeEventListener.bind(events);list.dispatchEvent=events.dispatchEvent.bind(events);this.fixtureTracks=list;}return this.fixtureTracks;}}));
  await startFixtureVideo(page);
  expect(await page.locator('video').evaluate(v=>v.audioTracks.map(t=>t.enabled))).toEqual([false,true]);
  await page.locator('video').evaluate(v=>{v.audioTracks.push({label:'Brasil',language:'pob',enabled:false});v.audioTracks.dispatchEvent(new Event('addtrack'));});
  await expect.poll(()=>page.locator('video').evaluate(v=>v.audioTracks.map(t=>t.enabled))).toEqual([false,false,true]);
  await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.getByRole('button',{name:/Original/}).click();
  await page.locator('video').evaluate(v=>v.audioTracks.dispatchEvent(new Event('change')));
  await expect(page.getByRole('button',{name:/Original/})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});
test('automatic subtitles fall back after HTTP failure and manual Off survives late events',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt-br',secondarySubtitles:'en'});
  const downloads=[];
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{url:origin+'/preferred.srt',lang:'pob'},{url:origin+'/fallback.srt',lang:'eng'}]}]}}));
  await page.route('**/preferred.srt',r=>{downloads.push('preferred');return r.fulfill({status:403,body:'expired'});});
  await page.route('**/fallback.srt',r=>{downloads.push('fallback');return r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nAutomatic fallback'});});
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toHaveText('Automatic fallback');
  expect(downloads).toEqual(['preferred','fallback']);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:'Desativadas',exact:true}).click();await page.keyboard.press('Escape');
  await page.locator('video').evaluate(v=>v.textTracks.dispatchEvent(new Event('change')));
  await expect(page.locator('.subtitle-overlay')).toBeHidden();expect(downloads).toHaveLength(2);
});
test('manual subtitle selection cancels a pending automatic response and addon discovery is opt-in',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt',addonSubtitles:true});
  let release;const gate=new Promise(r=>release=r);let requested=0;
  await page.route('**/manifest.json',r=>r.fulfill({json:{id:'local.test',name:'Catálogo de teste',resources:['catalog','meta','stream','subtitles'],types:['movie','series'],catalogs:[{id:'test',name:'Coleção de teste',type:'movie'}]}}));
  await page.route('**/subtitles/**',r=>{requested++;return r.fulfill({json:{subtitles:[{lang:'por',url:origin+'/automatic-slow.srt'}]}});});
  await page.route('**/automatic-slow.srt',async r=>{await gate;await r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nLate automatic'}).catch(()=>{});});
  await startFixtureVideo(page);await expect.poll(()=>requested).toBe(1);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Carregando…');
  await page.getByRole('button',{name:'Desativadas',exact:true}).click();release();
  await page.keyboard.press('Escape');await expect(page.locator('.subtitle-overlay')).toBeHidden();
});
async function startSeriesForNext(page,prefs={},nextVideo={},videos) {
  await page.clock.install();
  await playbackPrefs(page,prefs);
  await page.route('**/meta/series/**',r=>r.fulfill({json:{meta:{...show,videos:videos || [...show.videos,{id:'ttshow:2:1',title:'Nova temporada',season:2,episode:1,thumbnail:origin+'/backdrop.svg',...nextVideo}]}}}));
  await install(page);await navigation(page,'Início');await page.getByRole('button',{name:'Série de teste',exact:true}).click();await page.getByRole('button',{name:/Primeiro episódio/}).click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=v.duration*.995;});
  await expect.poll(()=>page.locator('video').evaluate(v=>v.seeking)).toBe(false);
}
test('next episode card uses fresh episode sources and Back returns without a playback loop',async({page})=>{
  const ids=[];await page.route('**/stream/series/**',r=>{ids.push(decodeURIComponent(r.request().url()));return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}});});
  await startSeriesForNext(page);
  await expect(page.locator('.next-episode')).toBeVisible();await expect(page.locator('.next-episode')).toContainText('T2 · E1 · Nova temporada');
  await page.locator('#toast').evaluate(e=>e.hidden=true);
  await page.screenshot({path:'test-results/player-next-episode-1920.png'});
  await page.locator('.next-episode-play').focus();await page.keyboard.press('Enter');
  await expect(page.getByText('Temporada 2 · Episódio 1',{exact:true})).toBeVisible();expect(ids.at(-1)).toContain('ttshow:2:1.json');
  await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect(page.locator('video')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Ir para o próximo episódio'})).toHaveCount(0);
  await leavePlayer(page);await expect(page.locator('.source')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.detail-title')).toBeVisible();
});
test('automatic next waits while paused or in track menu, can be cancelled, and survives a backward seek',async({page})=>{
  await startSeriesForNext(page,{autoNext:true});
  await expect(page.locator('.next-episode')).toContainText('pausado');
  await page.clock.runFor(6000);await expect(page.locator('video')).toHaveCount(1);await expect(page.locator('.next-episode')).toContainText('5 s');
  await page.locator('video').evaluate(v=>{v.currentTime=10;});await expect(page.locator('.next-episode')).toBeHidden();
  await page.locator('video').evaluate(v=>{v.currentTime=v.duration*.995;});await expect(page.locator('.next-episode')).toBeVisible();
  await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.clock.runFor(6000);await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Continuar neste episódio'}).click();await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('ended')));await page.clock.runFor(6000);await expect(page.locator('.next-episode')).toBeHidden();
});
test('automatic next resolves the same binge group, advances once, and does not mark next watched',async({page})=>{
  const ids=[];await page.route('**/stream/series/**',r=>{ids.push(decodeURIComponent(r.request().url()));return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',behaviorHints:{bingeGroup:'fixture-binge'}}]}});});
  await startSeriesForNext(page,{autoNext:true});
  await page.locator('video').evaluate(v=>{Object.defineProperty(v,'ended',{get:()=>true});v.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(6500);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T2 E1');
  await page.locator('video').evaluate(v=>v.pause());expect(ids).toHaveLength(2);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));expect(state.progress[JSON.stringify(['series','ttshow:2:1'])]?.complete).not.toBe(true);
  await leavePlayer(page);await expect(page.locator('.source')).toBeVisible();
});
test('playback preferences persist without resetting source preferences',async({page})=>{
  await install(page);await navigation(page,'Ajustes');await page.getByRole('button',{name:'Reprodução',exact:true}).click();await page.getByRole('button',{name:/Idiomas e próximo episódio/}).click();
  await page.getByRole('combobox',{name:'Idioma do áudio',exact:true}).selectOption('pt-br');await page.getByRole('checkbox',{name:'Reproduzir próximo episódio automaticamente'}).check();await page.getByRole('combobox',{name:'Idioma das legendas',exact:true}).selectOption('off');
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).settings);expect(prefs.playback.audio).toBe('pt-br');expect(prefs.playback.autoNext).toBe(true);expect(prefs.preferences).toEqual({});
  await page.locator('main').evaluate(e=>e.scrollTop=0);await page.locator('#toast').evaluate(e=>e.hidden=true);
  await page.screenshot({path:'test-results/player-preferences-1920.png'});
  await page.reload();await navigation(page,'Ajustes');await page.getByRole('button',{name:'Reprodução',exact:true}).click();await page.getByRole('button',{name:/Idiomas e próximo episódio/}).click();await expect(page.getByRole('combobox',{name:'Idioma do áudio',exact:true})).toHaveValue('pt-br');
});
test('unaired successor is visible but cannot start automatically or via the remote',async({page})=>{
  await startSeriesForNext(page,{autoNext:true},{released:'2999-01-01'});
  await expect(page.locator('.next-episode')).toContainText('ainda não foi lançado');await expect(page.locator('.next-episode-play')).toBeDisabled();
  await page.locator('video').evaluate(v=>{Object.defineProperty(v,'ended',{get:()=>true});v.dispatchEvent(new Event('ended'));});await page.clock.runFor(8000);
  await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E1');
});
test('missing binge group with fallback disabled leaves a usable source list without autoplay on Back',async({page})=>{
  await page.route('**/stream/series/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',behaviorHints:{bingeGroup:decodeURIComponent(r.request().url()).includes('ttshow:1:1')?'first':'other'}}]}}));
  await startSeriesForNext(page,{autoNext:true,nextFallback:false});await page.locator('.next-episode-play').click();
  await expect(page.locator('.source')).toBeVisible();await expect(page.locator('video')).toHaveCount(0);await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect(page.locator('video')).toHaveCount(1);
  await leavePlayer(page);await expect(page.locator('.source')).toBeVisible();await expect(page.locator('video')).toHaveCount(0);
});
test('native preferred subtitles select late tracks and Off disables them without a change-event loop',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt-br',secondarySubtitles:'en'});await startFixtureVideo(page);
  await page.locator('video').evaluate(v=>{v.addTextTrack('subtitles','English','eng');v.addTextTrack('subtitles','Brasil','pob');});
  await expect.poll(()=>page.locator('video').evaluate(v=>Array.from(v.textTracks,t=>t.mode))).toEqual(['disabled','showing']);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:'Desativadas',exact:true}).click();
  await page.locator('video').evaluate(v=>v.textTracks.dispatchEvent(new Event('change')));await expect.poll(()=>page.locator('video').evaluate(v=>Array.from(v.textTracks,t=>t.mode))).toEqual(['disabled','disabled']);
});
test('late next-episode source response cannot start a video while the app is hidden',async({page})=>{
  let release;const gate=new Promise(r=>release=r);let requested=false;
  await page.route('**/stream/series/**',async r=>{if(decodeURIComponent(r.request().url()).includes('ttshow:2:1')){requested=true;await gate;}await r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}}).catch(()=>{});});
  await startSeriesForNext(page,{autoNext:true});await page.locator('.next-episode-play').click();await expect.poll(()=>requested).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});release();
  await expect(page.locator('.source')).toBeVisible();await expect(page.locator('video')).toHaveCount(0);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(6000);await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect(page.locator('video')).toHaveCount(1);
});

test('flat subtitle panel sorts preferred languages and keeps the selected nonpreferred language accessible',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt',onlyPreferredSubtitles:false});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Português completo',lang:'por',url:origin+'/pt.srt'},{name:'English SDH',lang:'eng',url:origin+'/en.srt',sdh:true},{name:'Español forced',lang:'spa',url:origin+'/es.forced.srt'}]}]}}));
  await page.route('**/*.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nFixture captions'}));
  await startFixtureVideo(page);await page.getByRole('button',{name:'Legendas',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.locator('.subtitle-language-rail')).toHaveCount(0);
  await expect(dialog.locator('.track-list [data-track-key^="external-"]')).toHaveCount(3);await expect(dialog.locator('.track-list')).toContainText('SDH / CC');
  await dialog.locator('[data-track-key="external-1"]').click();await expect(dialog.locator('[data-track-key="external-1"]')).toHaveAttribute('aria-pressed','true');
  await dialog.locator('[data-track-key="style"]').click();await dialog.locator('[data-track-key="preferred-only"]').click();await dialog.locator('[data-track-key="style"]').click();await expect(dialog.locator('[data-track-key="external-1"]')).toBeVisible();await expect(dialog.locator('[data-track-key="external-2"]')).toHaveCount(0);
  await expect(page.locator('.subtitle-overlay')).toHaveText('Fixture captions');
  await page.locator('#toast').evaluate(e=>e.hidden=true);await page.screenshot({path:'test-results/player-subtitle-languages-1920.png'});
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(d=>d.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Legendas',exact:true})).toBeFocused();
});
test('forced subtitles follow audio changes, while manual subtitle choice overrides the forced policy',async({page})=>{
  await playbackPrefs(page,{audio:'pt',subtitles:'pt',forcedSubtitles:true});
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){return this.fixtureTracks ||= [{language:'eng',label:'Original',enabled:true},{language:'por',label:'Dublado',enabled:false}];}}));
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Completa',lang:'por',url:origin+'/normal.srt'},{name:'Trechos forçados',lang:'por',url:origin+'/forced.srt',forced:true}]}]}}));
  await page.route('**/*.srt',r=>r.fulfill({body:`1\n00:00:00,000 --> 00:02:00,000\n${r.request().url().includes('forced')?'Somente trechos':'Legenda completa'}`}));
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toHaveText('Somente trechos');
  await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.getByRole('button',{name:/Original/}).click();await page.keyboard.press('Escape');await expect(page.locator('.subtitle-overlay')).toHaveText('Legenda completa');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Trechos forçados/}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Somente trechos');await page.keyboard.press('Escape');
});
test('SDH cleanup is reversible and preserves subtitle timing and Off',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt',stripSdh:true});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Português SDH',lang:'por',url:origin+'/sdh.srt'}]}]}}));
  await page.route('**/sdh.srt',r=>r.fulfill({body:'1\n00:00:20,000 --> 00:00:30,000\n>> JOHN: Hello!\n[Door closes]\n\n2\n00:00:30,000 --> 00:00:40,000\n[Music]'}));
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toHaveText('Hello!');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Ajustes de legenda/}).click();await page.getByRole('button',{name:/Remover descrições SDH/}).click();await expect(page.locator('.subtitle-overlay')).toContainText('[Door closes]');
  await page.getByRole('button',{name:/Remover descrições SDH/}).click();await page.locator('video').evaluate(v=>v.currentTime=32);await expect(page.locator('.subtitle-overlay')).toBeHidden();await page.locator('video').evaluate(v=>v.currentTime=25);await expect(page.locator('.subtitle-overlay')).toHaveText('Hello!');
  await page.getByRole('button',{name:'Voltar às faixas',exact:true}).click();await page.getByRole('button',{name:'Desativadas',exact:true}).click();await expect(page.locator('.subtitle-overlay')).toBeHidden();
});
test('manual audio and external subtitle choices survive next episode with reordered tracks, fresh URLs and zero delay',async({page})=>{
  const downloads=[];
  await page.addInitScript(()=>{let count=0;Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){if(!this.fixtureTracks){const tracks=[{language:'eng',label:'Original',enabled:true},{language:'por',label:'Dublado',enabled:false}];this.fixtureTracks=++count===1?tracks:tracks.reverse();}return this.fixtureTracks;}});});
  await page.route('**/stream/series/**',r=>{const next=decodeURIComponent(r.request().url()).includes('ttshow:2:1');return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{lang:'por',name:'Português manual',url:origin+`/episode-${next?2:1}.srt`}]}]}});});
  await page.route('**/episode-*.srt',r=>{downloads.push(r.request().url());return r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nPortuguês lembrado'});});
  await startSeriesForNext(page,{audio:'en',subtitles:'en'});
  await openPlayerSpeed(page);await page.getByRole('button',{name:'1.5×',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.getByRole('button',{name:/Dublado/}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Português manual/}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Português lembrado');
  await page.getByRole('button',{name:/Ajustes de legenda/}).click();await page.getByRole('button',{name:'Atrasar 0,1 s',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Ir para o próximo episódio'}).click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);await page.locator('video').evaluate(v=>v.pause());
  await expect.poll(()=>page.locator('video').evaluate(v=>v.audioTracks.find(t=>t.enabled)?.language)).toBe('por');expect(await page.locator('video').evaluate(v=>v.playbackRate)).toBe(1.5);await expect(page.locator('.subtitle-overlay')).toHaveText('Português lembrado');expect(downloads).toEqual([origin+'/episode-1.srt',origin+'/episode-2.srt']);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Ajustes de legenda/}).click();await expect(page.getByRole('dialog')).toContainText('Atraso: 0 ms');
  const memory=await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).trackPreferences);expect(JSON.stringify(memory)).not.toMatch(/https:|delay|trackId/);
});
test('remembered Off persists across reopening the title and clearing it restores preferred subtitles',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt'});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Português',lang:'por',url:origin+'/remember.srt'}]}]}}));
  let downloads=0;await page.route('**/remember.srt',r=>{downloads++;return r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nPreferred subtitle'});});
  await startFixtureVideo(page);await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:'Desativadas',exact:true}).click();await leavePlayer(page);
  await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);await page.locator('video').evaluate(v=>v.pause());await expect(page.locator('.subtitle-overlay')).toBeHidden();expect(downloads).toBe(1);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Usar idiomas dos ajustes/}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Preferred subtitle');expect(downloads).toBe(2);
});
test('failed or cancelled manual subtitles do not replace the remembered successful choice',async({page})=>{
  await playbackPrefs(page,{subtitles:'en'});let release;const gate=new Promise(r=>release=r);
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Boa',lang:'por',url:origin+'/good.srt'},{name:'Com erro',lang:'spa',url:origin+'/failed.srt'},{name:'Lenta',lang:'fra',url:origin+'/pending.srt'}]}]}}));
  await page.route('**/good.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nBoa'}));await page.route('**/failed.srt',r=>r.fulfill({status:403,body:'expired'}));await page.route('**/pending.srt',async r=>{await gate;await r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nTardia'}).catch(()=>{});});
  await startFixtureVideo(page);await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Boa/}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Boa');await page.getByRole('button',{name:/Com erro/}).click();await expect(page.getByRole('alert')).toContainText('HTTP 403');await page.getByRole('button',{name:/Lenta/}).click();await page.keyboard.press('Escape');release();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).trackPreferences[JSON.stringify(['movie','ttfixture'])]);expect(saved.subtitles.language).toBe('pt');await expect(page.locator('.subtitle-overlay')).toHaveText('Boa');
});
test('late forced subtitle download cannot override the policy after an audio change',async({page})=>{
  await playbackPrefs(page,{audio:'pt',subtitles:'pt',forcedSubtitles:true});let release;const gate=new Promise(r=>release=r);let started=false;
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){return this.fixtureTracks ||= [{language:'por',label:'Dublado',enabled:true},{language:'eng',label:'Original',enabled:false}];}}));
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{lang:'por',url:origin+'/late-forced.srt',forced:true},{lang:'por',url:origin+'/normal-current.srt'}]}]}}));
  await page.route('**/late-forced.srt',async r=>{started=true;await gate;await r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nWrong forced policy'}).catch(()=>{});});
  await page.route('**/normal-current.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nCurrent full subtitle'}));
  await startFixtureVideo(page);await expect.poll(()=>started).toBe(true);
  await page.evaluate(()=>{window.seenSubtitles=[];new MutationObserver(()=>window.seenSubtitles.push(document.querySelector('.subtitle-overlay')?.textContent)).observe(document.querySelector('.subtitle-overlay'),{childList:true,subtree:true,characterData:true});});
  await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.getByRole('button',{name:/Original/}).click();await page.keyboard.press('Escape');release();
  await expect(page.locator('.subtitle-overlay')).toHaveText('Current full subtitle');expect(await page.evaluate(()=>window.seenSubtitles)).not.toContain('Wrong forced policy');
});
test('native forced tracks use exposed labels and never select a full subtitle as a forced fallback',async({page})=>{
  await playbackPrefs(page,{audio:'pt',subtitles:'pt',forcedSubtitles:true});
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){return this.fixtureTracks ||= [{language:'por',enabled:true}];}}));
  await startFixtureVideo(page);await page.locator('video').evaluate(v=>{v.addTextTrack('subtitles','Português completo','por');v.addTextTrack('captions','English SDH','eng');});
  await expect.poll(()=>page.locator('video').evaluate(v=>Array.from(v.textTracks).filter(t=>t.mode==='showing').length)).toBe(0);
  await page.locator('video').evaluate(v=>v.addTextTrack('subtitles','Português forced','por'));
  await expect.poll(()=>page.locator('video').evaluate(v=>Array.from(v.textTracks,t=>t.mode))).toEqual(['disabled','disabled','showing']);
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await expect(page.locator('[data-track-key="native-2"]')).toContainText('Forçada');await expect(page.locator('[data-track-key="native-1"]')).toContainText('SDH / CC');
});

test('Netflix Sans loads locally, subtitle delay survives reopening and reset removes saved timing',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt'});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Português',lang:'por',url:origin+'/font.srt'}]}]}}));
  await page.route('**/font.srt',r=>r.fulfill({body:'1\n00:00:20,000 --> 00:00:30,000\nA próxima história começa aqui.\nVocê ainda está assistindo?'}));
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toContainText('A próxima história');
  expect(await page.evaluate(async()=>{const fonts=await document.fonts.load('500 19.44px "Netflix Sans"');return fonts.length===1 && fonts[0].status==='loaded';})).toBe(true);
  await expect(page.locator('.subtitle-overlay')).toHaveCSS('font-family','"Netflix Sans", Inter, Arial, sans-serif');
  await page.screenshot({animations:'disabled',path:'test-results/player-netflix-sans-1920.png'});
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Ajustes de legenda/}).click();await page.getByRole('button',{name:'Atrasar 0,1 s',exact:true}).click();
  await leavePlayer(page);await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);await page.locator('video').evaluate(v=>{v.pause();v.currentTime=30.05;});
  await expect(page.locator('.subtitle-overlay')).toContainText('A próxima história');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Ajustes de legenda/}).click();await expect(page.getByRole('dialog')).toContainText('Atraso: +100 ms');
  await page.getByRole('button',{name:'Zerar atraso',exact:true}).click();await expect(page.locator('.subtitle-overlay')).toBeHidden();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).subtitleDelays)).toEqual({});
});
test('speed menu uses actual rate, remembers title on reopen and preserves the prior rate on platform rejection',async({page})=>{
  await startFixtureVideo(page);await openPlayerSpeed(page);
  const dialog=page.getByRole('dialog',{name:'Velocidade'});await dialog.getByRole('button',{name:'1.25×',exact:true}).click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.playbackRate)).toBe(1.25);
  await expect(dialog.getByRole('button',{name:'1.25×',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({animations:'disabled',path:'test-results/player-speed-1920.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Velocidade',exact:true})).toBeFocused();await leavePlayer(page);
  await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.playbackRate)).toBe(1.25);
  await page.locator('video').evaluate(v=>{v.pause();const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'playbackRate');Object.defineProperty(v,'playbackRate',{configurable:true,get(){return descriptor.get.call(this);},set(value){if(value===2)return;descriptor.set.call(this,value);}});});
  await openPlayerSpeed(page);await dialog.getByRole('button',{name:'2×',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('não aceitou');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).playbackSpeeds[JSON.stringify(['movie','ttfixture'])])).toBe(1.25);
  await dialog.getByRole('button',{name:'1× Normal',exact:true}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.playbackRate)).toBe(1);
});
async function startBinge(page) {
  const episodes=Array.from({length:7},(_,i)=>({id:`ttshow:1:${i+1}`,title:`Episódio ${i+1}`,season:1,episode:i+1,thumbnail:origin+'/backdrop.svg'}));
  await page.clock.install();await playbackPrefs(page,{autoNext:true,stillWatching:true,stillWatchingThreshold:2});
  await page.route('**/meta/series/**',r=>r.fulfill({json:{meta:{...show,videos:episodes}}}));
  await install(page);await navigation(page,'Início');await page.getByRole('button',{name:'Série de teste',exact:true}).click();await page.getByRole('button',{name:/Episódio 1/}).click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
}
async function endBingeEpisode(page) {
  await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate(v=>{v.pause();Object.defineProperty(v,'ended',{configurable:true,get:()=>true});v.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(6500);
}
test('still watching counts automatic transitions, pauses media keys and confirmation resets the session',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await startBinge(page);
  expect(await page.locator('.player-controls .toolbar').evaluate(bar=>new Set([...bar.children].filter(b=>!b.hidden).map(b=>b.offsetTop)).size)).toBe(1);
  await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E2');
  await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E3');
  await endBingeEpisode(page);const dialog=page.getByRole('dialog',{name:'Ainda assistindo?'});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Continuar assistindo',exact:true})).toBeFocused();expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:415,bubbles:true})));expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);
  await page.screenshot({animations:'disabled',path:'test-results/player-still-watching-1920.png'});
  await dialog.getByRole('button',{name:'Continuar assistindo',exact:true}).click();await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E4');
  await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E5');await expect(dialog).toHaveCount(0);expect(errors).toEqual([]);
});
test('still watching timeout waits while hidden, exits to sources and never restarts by itself',async({page})=>{
  await startBinge(page);await endBingeEpisode(page);await endBingeEpisode(page);await endBingeEpisode(page);
  const dialog=page.getByRole('dialog',{name:'Ainda assistindo?'});await expect(dialog).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(70000);await expect(dialog).toBeVisible();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(65000);
  await expect(page.locator('video')).toHaveCount(0);await expect(page.getByRole('button',{name:'Reproduzir melhor fonte'})).toBeVisible();
  await page.clock.runFor(10000);await expect(page.locator('video')).toHaveCount(0);
});
test('LG Back dismisses still watching by stopping playback and cancels its timers',async({page})=>{
  await startBinge(page);await endBingeEpisode(page);await endBingeEpisode(page);await endBingeEpisode(page);
  await expect(page.getByRole('dialog',{name:'Ainda assistindo?'})).toBeVisible();await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));
  await expect(page.locator('video')).toHaveCount(0);await page.clock.runFor(70000);await expect(page.getByRole('button',{name:'Reproduzir melhor fonte'})).toBeVisible();
});

test('manual next episode resets the binge count even when automatic source selection is enabled',async({page})=>{
  await startBinge(page);await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E2');
  await page.locator('video').evaluate(v=>v.pause());await page.getByRole('button',{name:'Ir para o próximo episódio'}).click();await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E3');
  await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E4');
  await endBingeEpisode(page);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E5');await expect(page.getByRole('dialog',{name:'Ainda assistindo?'})).toHaveCount(0);
  await endBingeEpisode(page);await expect(page.getByRole('dialog',{name:'Ainda assistindo?'})).toBeVisible();
});

async function openPlayerSpeed(page) { await page.getByRole('button',{name:'Mais',exact:true}).click();await page.getByRole('button',{name:'Velocidade',exact:true}).click(); }

test('in-player episodes retain current video, navigate seasons by remote, show watched and return from sources with focus',async({page})=>{
  const ids=[];await page.route('**/stream/series/**',r=>{ids.push(decodeURIComponent(r.request().url()));return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}});});
  await page.addInitScript(()=>{const key='nuvio-fork.webos.v1',s=JSON.parse(localStorage.getItem(key));s.progress={'["series","ttshow:2:1"]':{type:'series',id:'ttshow:2:1',meta:{id:'ttshow',type:'series',name:'Série de teste'},episode:{season:2,episode:1},complete:true,time:60,duration:60,updated:1}};localStorage.setItem(key,JSON.stringify(s));});
  await startSeriesForNext(page,{autoNext:true});
  await page.locator('video').evaluate(v=>v.fixtureOriginal=true);
  await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});
  await expect(dialog.locator('[data-episode-id="ttshow:1:1"]')).toHaveAttribute('aria-current','true');await expect(dialog.locator('[data-episode-id="ttshow:1:1"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');const next=dialog.locator('[data-episode-id="ttshow:2:1"]');await expect(next).toBeFocused();await expect(next).toContainText('Assistido');
  await page.screenshot({animations:'disabled',path:'test-results/player-episodes-1920.png'});
  await page.keyboard.press('Enter');await expect(dialog.locator('.source')).toHaveCount(1);expect(ids.at(-1)).toContain('ttshow:2:1');expect(await page.locator('video').evaluate(v=>v.fixtureOriginal)).toBe(true);
  await page.locator('video').evaluate(v=>{Object.defineProperty(v,'ended',{configurable:true,get:()=>true});v.dispatchEvent(new Event('ended'));});await page.clock.runFor(7000);expect(await page.locator('video').evaluate(v=>v.fixtureOriginal)).toBe(true);
  await expect(dialog.getByRole('button',{name:'Fechar',exact:true})).toBeInViewport();
  expect(await dialog.getByRole('button',{name:'Fechar',exact:true}).evaluate(b=>{const r=b.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return b===top || b.contains(top);})).toBe(true);
  await page.screenshot({animations:'disabled',path:'test-results/player-episode-sources-1920.png'});
  await page.keyboard.press('Escape');await expect(next).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Episódios',exact:true})).toBeFocused();
});
test('selecting an episode source replaces video only on selection, preserves old progress and Back shows selected episode sources',async({page})=>{
  await startSeriesForNext(page);await page.locator('video').evaluate(v=>{v.currentTime=25;v.fixtureOld=true;});
  await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();await dialog.locator('[data-episode-id="ttshow:2:1"]').click();await expect(dialog.locator('.source').first()).toBeVisible();
  await dialog.locator('.source:not([aria-disabled="true"])').first().click();await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T2 E1');expect(await page.locator('video').evaluate(v=>Boolean(v.fixtureOld))).toBe(false);
  const previous=await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).progress['["series","ttshow:1:1"]']);expect(previous.time).toBeCloseTo(25,0);
  await leavePlayer(page);await expect(page.locator('video')).toHaveCount(0);await expect(page.getByRole('button',{name:'Reproduzir melhor fonte'})).toBeVisible();await page.clock.runFor(7000);await expect(page.locator('video')).toHaveCount(0);
});
test('episode source requests cancel on LG Back, late results never navigate and reopening can retry',async({page})=>{
  let release,started=false;const gate=new Promise(r=>release=r);
  await page.route('**/stream/series/**',async r=>{if(decodeURIComponent(r.request().url()).includes('ttshow:2:1')){started=true;await gate;}await r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}}).catch(()=>{});});
  await startSeriesForNext(page);await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();await dialog.locator('[data-episode-id="ttshow:2:1"]').click();await expect.poll(()=>started).toBe(true);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));await expect(dialog.locator('[data-episode-id="ttshow:2:1"]')).toBeFocused();await page.keyboard.press('Escape');release();await page.clock.runFor(1000);await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T1 E1');
  await page.getByRole('button',{name:'Episódios',exact:true}).click();await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();await dialog.locator('[data-episode-id="ttshow:2:1"]').click();await expect(dialog.locator('.source')).toHaveCount(1);
});
test('episode source failures can refresh without replacing the active video',async({page})=>{
  let requests=0;await page.route('**/stream/series/**',r=>{if(decodeURIComponent(r.request().url()).includes('ttshow:2:1') && ++requests===1)return r.fulfill({status:503,body:'down'});return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}});});
  await startSeriesForNext(page);await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();await dialog.locator('[data-episode-id="ttshow:2:1"]').click();await expect(dialog).toContainText('1 addon(s) não responderam');await dialog.getByRole('button',{name:'Atualizar fontes do episódio'}).click();await expect(dialog.locator('.source')).toHaveCount(1);
});
test('future episodes remain visible but cannot query or select sources from the player panel',async({page})=>{
  let futureRequests=0;await page.route('**/stream/series/**',r=>{if(decodeURIComponent(r.request().url()).includes('ttshow:2:1'))futureRequests++;return r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4'}]}});});
  await startSeriesForNext(page,{}, {released:'2999-01-01'});await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();const item=dialog.locator('[data-episode-id="ttshow:2:1"]');await expect(item).toContainText('Ainda não lançado');await item.focus();await page.keyboard.press('Enter');expect(futureRequests).toBe(0);await expect(dialog.getByRole('heading',{name:'Episódios'})).toBeVisible();
});
test('all seven aspect modes affect only video, persist across playback and adapt to a new video size',async({page})=>{
  await startFixtureVideo(page);await expect(page.getByRole('button',{name:'Episódios',exact:true})).toHaveCount(0);
  await page.locator('video').evaluate(v=>{Object.defineProperty(v,'videoWidth',{configurable:true,get:()=>400});Object.defineProperty(v,'videoHeight',{configurable:true,get:()=>300});v.fixtureOriginal=true;v.dispatchEvent(new Event('resize'));});
  await page.getByRole('button',{name:'Mais',exact:true}).click();const option=page.getByRole('button',{name:'Proporção da imagem',exact:true});
  const modes=['FULL_SCREEN','STRETCH','SLIGHT_ZOOM','CINEMA_ZOOM','VERTICAL_STRETCH','HORIZONTAL_STRETCH','ORIGINAL'];
  for(const mode of modes){await option.click();await expect(page.locator('video')).toHaveAttribute('data-aspect-mode',mode);expect(await page.locator('video').evaluate(v=>v.fixtureOriginal)).toBe(true);}
  await option.click();await expect(page.locator('video')).toHaveCSS('transform','matrix(1.33333, 0, 0, 1.33333, 0, 0)');
  await page.locator('video').evaluate(v=>{Object.defineProperty(v,'videoWidth',{configurable:true,get:()=>1920});Object.defineProperty(v,'videoHeight',{configurable:true,get:()=>1080});v.dispatchEvent(new Event('resize'));});await expect(page.locator('video')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('.subtitle-overlay')).toHaveCSS('font-family','"Netflix Sans", Inter, Arial, sans-serif');
  await page.screenshot({animations:'disabled',path:'test-results/player-aspect-1920.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Mais',exact:true})).toBeFocused();await leavePlayer(page);await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect(page.locator('video')).toHaveAttribute('data-aspect-mode','FULL_SCREEN');
});

test('episode panel pages long seasons without dropping late episodes or growing the rendered list',async({page})=>{
  const videos=Array.from({length:125},(_,i)=>({id:`ttshow:1:${i+1}`,season:1,episode:i+1,title:i===0?'Primeiro episódio':`Episódio ${i+1}`}));
  await startSeriesForNext(page,{}, {},videos);await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});
  await expect(dialog.locator('.episode-panel-item')).toHaveCount(50);await dialog.getByRole('button',{name:'Próxima página',exact:true}).click();await expect(dialog.locator('[data-episode-id="ttshow:1:51"]')).toBeFocused();await expect(dialog.locator('.episode-panel-item')).toHaveCount(50);
  await dialog.getByRole('button',{name:'Próxima página',exact:true}).click();await expect(dialog.locator('.episode-panel-item')).toHaveCount(25);await expect(dialog.locator('[data-episode-id="ttshow:1:125"]')).toHaveCount(1);await dialog.getByRole('button',{name:'Anterior',exact:true}).click();await expect(dialog.locator('[data-episode-id="ttshow:1:51"]')).toBeFocused();
});
test('episode source addon filter and best source use only the chosen addon',async({page})=>{
  await page.addInitScript(()=>{const key='nuvio-fork.webos.v1',s=JSON.parse(localStorage.getItem(key));s.addons=[{url:'https://fixture.example/second/manifest.json',manifest:{id:'second.test',name:'Segundo addon',resources:['stream'],types:['series'],catalogs:[]}}];localStorage.setItem(key,JSON.stringify(s));});
  await page.route('**/stream/series/**',r=>r.fulfill({json:{streams:[{name:r.request().url().includes('/second/')?'Segunda opção 1080p WEB-DL':'Primeira opção 1080p WEB-DL',url:origin+'/clip.mp4'}]}}));
  await startSeriesForNext(page);await page.getByRole('button',{name:'Episódios',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Episódios e fontes'});await dialog.getByRole('button',{name:'Temporada 2',exact:true}).click();await dialog.locator('[data-episode-id="ttshow:2:1"]').click();await expect(dialog.locator('.source')).toHaveCount(2);
  await dialog.getByRole('button',{name:'Segundo addon',exact:true}).click();await expect(dialog.locator('.source')).toHaveCount(1);await expect(dialog.locator('.source')).toContainText('Segunda opção');await dialog.getByRole('button',{name:'Reproduzir melhor fonte',exact:true}).click();
  await expect(page.locator('.player-controls h1')).toHaveText('Série de teste');await expect(page.locator('.player-episode-title')).toContainText('T2 E1');await page.getByRole('button',{name:'Informações de reprodução',exact:true}).click();await expect(page.locator('.stats')).toContainText('Fonte: Segundo addon');
});

test('Netflix Sans renders internal text cues, retains selected menu and follows seeking and off',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt'});await startFixtureVideo(page);
  await page.locator('video').evaluate(v=>{const t=v.addTextTrack('subtitles','Português interno','por');t.addCue(new VTTCue(20,30,'<b>A próxima história começa aqui.</b>'));t.addCue(new VTTCue(35,40,'Você ainda está assistindo?'));});
  const overlay=page.locator('.subtitle-overlay');await expect(overlay).toHaveText('A próxima história começa aqui.');
  await expect(overlay).toHaveAttribute('data-renderer','native-text');await expect(overlay).toHaveAttribute('data-font-status','loaded');
  expect(await page.locator('video').evaluate(v=>v.textTracks[0].mode)).toBe('hidden');await expect(overlay).toHaveCSS('font-family','"Netflix Sans", Inter, Arial, sans-serif');
  await page.screenshot({animations:'disabled',path:'test-results/internal-netflix-sans-1920.png'});
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await expect(page.locator('[data-track-key="native-0"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/Ajustes de legenda/}).click();await expect(page.getByRole('dialog')).not.toContainText('Netflix Sans');
  await expect(page.locator('.subtitle-font-preview,.subtitle-font-status')).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'test-results/subtitle-font-settings-1920.png'});
  await page.keyboard.press('Escape');await page.locator('video').evaluate(v=>{v.currentTime=32;});await expect(overlay).toBeHidden();
  await page.locator('video').evaluate(v=>{v.currentTime=36;});await expect(overlay).toHaveText('Você ainda está assistindo?');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:'Desativadas',exact:true}).click();await expect(overlay).toBeHidden();
  expect(await page.locator('video').evaluate(v=>v.textTracks[0].mode)).toBe('disabled');
});
test('native opaque track remains usable without technical information and external selection uses Netflix Sans',async({page})=>{
  await playbackPrefs(page,{subtitles:'pt'});await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p',url:origin+'/clip.mp4',subtitles:[{name:'Externa',lang:'por',url:origin+'/native-fallback.srt'}]}]}}));
  await page.route('**/native-fallback.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nTexto externo'}));
  await startFixtureVideo(page);await page.locator('video').evaluate(v=>v.addTextTrack('subtitles','Interna sem texto','por'));
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.locator('[data-track-key="native-0"]').click();
  await expect(page.getByRole('dialog')).not.toContainText('player da TV');await expect(page.locator('.subtitle-overlay')).toBeHidden();
  await page.getByRole('button',{name:/Externa/}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Texto externo');
  await expect(page.locator('.subtitle-overlay')).toHaveAttribute('data-font-status','loaded');expect(await page.locator('video').evaluate(v=>v.textTracks[0].mode)).toBe('disabled');
});
test('font decoding failure keeps fallback text visible without exposing font diagnostics',async({page})=>{
  await page.route('**/NetflixSans-Medium.otf',r=>r.fulfill({status:404,body:'missing'}));
  await playbackPrefs(page,{subtitles:'pt'});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p',url:origin+'/clip.mp4',subtitles:[{lang:'por',url:origin+'/fallback-font.srt'}]}]}}));
  await page.route('**/fallback-font.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nTexto ainda legível'}));
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toHaveAttribute('data-font-status','error');
  await expect(page.locator('.subtitle-overlay')).toHaveText('Texto ainda legível');await expect(page.locator('.subtitle-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await expect(page.getByRole('dialog')).not.toContainText('Netflix');
});


test('fixed subtitle preset survives old preferences and scales correctly at 1080p, 1440p and 4K',async({page})=>{
  await page.clock.install();
  await page.addInitScript(()=>{const key='nuvio-fork.webos.v1',state=JSON.parse(localStorage.getItem(key)||'{}');state.settings={...state.settings,subtitleStyle:{size:30,background:true}};localStorage.setItem(key,JSON.stringify(state));});
  await playbackPrefs(page,{subtitles:'pt'});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p',url:origin+'/clip.mp4',subtitles:[{lang:'por',url:origin+'/preset.srt'}]}]}}));
  await page.route('**/preset.srt',r=>r.fulfill({body:'1\n00:00:00,000 --> 00:02:00,000\nAlguém deve ter dito alguma coisa\nsobre o garoto morto.'}));
  await startFixtureVideo(page);const overlay=page.locator('.subtitle-overlay');await expect(overlay).toHaveAttribute('data-font-status','loaded');
  // Hide controls through the actual player timer during playback.
  await page.locator('video').evaluate(v=>v.play());await page.clock.runFor(5000);
  await expect(page.locator('.player-screen')).not.toHaveClass(/controls-visible/);
  for (const [width,height] of [[1920,1080],[2560,1440],[3840,2160]]) {
    await page.setViewportSize({width,height});
    await expect.poll(async()=>{await page.clock.runFor(50);return page.locator('#app').evaluate(n=>Math.round(n.getBoundingClientRect().height));}).toBe(height);
    const metrics=await overlay.evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect(),canvas=document.querySelector('#app').getBoundingClientRect();return {family:s.fontFamily,weight:s.fontWeight,bg:s.backgroundColor,size:parseFloat(s.fontSize)*canvas.height/540,line:parseFloat(s.lineHeight)/parseFloat(s.fontSize),spacing:parseFloat(s.letterSpacing)/parseFloat(s.fontSize),bottom:(canvas.bottom-r.bottom)/canvas.height,center:r.x+r.width/2,width:r.width,canvasWidth:canvas.width,shadow:s.textShadow};});
    expect(metrics.family).toBe('"Netflix Sans", Inter, Arial, sans-serif');expect(metrics.weight).toBe('500');expect(metrics.bg).toBe('rgba(0, 0, 0, 0)');
    expect(metrics.size).toBeCloseTo(height*.036,1);expect(metrics.line).toBeCloseTo(1.16,2);expect(metrics.spacing).toBeCloseTo(-.015,3);
    expect(metrics.bottom).toBeCloseTo(.065,3);expect(metrics.center).toBeCloseTo(width/2,1);expect(metrics.width).toBeLessThanOrEqual(metrics.canvasWidth*.78+1);expect(metrics.shadow).not.toBe('none');
    if(width===1920)await page.screenshot({animations:'disabled',path:'test-results/subtitle-medium-preset-1920.png'});
  }
  await page.setViewportSize({width:1920,height:1080});await page.mouse.move(400,300);await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:/Ajustes de legenda/}).click();
  await expect(page.getByRole('dialog')).not.toContainText('Netflix');await expect(page.getByRole('button',{name:/^Tamanho|^Fundo da legenda/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Atrasar 0,1 s',exact:true})).toBeVisible();
});

test('reference player geometry, icon expansion, restart and remote focus follow the fork',async({page})=>{
  await page.clock.install();await startFixtureVideo(page);await page.clock.runFor(6000);
  const controls=page.locator('.player-controls'),timeline=page.getByRole('slider',{name:'Posição do vídeo'});
  const geometry=await controls.evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),bar=node.querySelector('.player-timeline').getBoundingClientRect(),head=node.querySelector('.player-title-actions').getBoundingClientRect(),pills=node.querySelector('.player-pill-actions').getBoundingClientRect();return {padding:s.padding,headBottom:head.bottom,barTop:bar.top,barBottom:bar.bottom,pillsTop:pills.top,bottom:r.bottom,icon:getComputedStyle(node.querySelector('.player-icon-button')).width};});
  expect(geometry.padding).toBe('24px 32px 48px');expect(geometry.icon).toBe('48px');expect(geometry.headBottom).toBeLessThan(geometry.barTop);expect(geometry.barBottom).toBeLessThan(geometry.pillsTop);
  await expect(page.locator('.player-time-row')).toContainText('-');await expect(page.locator('.player-clock')).toContainText('Termina às');
  await expect(page.getByRole('button',{name:'Voltar às fontes',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'−30 s',exact:true})).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'test-results/reference-player-controls-1920.png'});
  await page.getByRole('button',{name:'Reproduzir',exact:true}).focus();await page.keyboard.press('ArrowUp');await expect(timeline).toBeFocused();await page.keyboard.press('ArrowUp');await expect(page.getByRole('button',{name:'Informações de reprodução',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Mais',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Velocidade',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Proporção da imagem',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:'test-results/reference-player-expanded-1920.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Mais',exact:true})).toHaveAttribute('aria-expanded','false');await expect(page.locator('video')).toHaveCount(1);
  await page.getByRole('button',{name:'Reiniciar',exact:true}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeLessThan(3);await expect.poll(()=>page.locator('video').evaluate(v=>v.paused)).toBe(false);
  await page.locator('video').evaluate(v=>v.pause());await expect(page.getByRole('button',{name:'Reproduzir',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.clock.runFor(200);await expect(controls).toHaveCSS('opacity','0');await expect(page.locator('video')).toHaveCount(1);await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Reproduzir',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');await page.clock.runFor(200);await expect(controls).toHaveCSS('opacity','0');await page.keyboard.press('Escape');await expect(page.locator('video')).toHaveCount(0);
});
test('remote seek previews once, accelerates after 3s and Back cancels without moving media',async({page})=>{
  await page.clock.install();await startFixtureVideo(page);const timeline=page.getByRole('slider',{name:'Posição do vídeo'});await timeline.focus();
  await page.keyboard.down('ArrowRight');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);await expect(timeline).toHaveValue('35');
  await page.clock.runFor(3100);await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',repeat:true,bubbles:true})));await expect(timeline).toHaveValue('55');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
  await page.keyboard.up('ArrowRight');await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(55,0);
  await page.keyboard.down('ArrowLeft');await expect(timeline).toHaveValue('45');await page.keyboard.press('Escape');await page.keyboard.up('ArrowLeft');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(55,0);
});
test('current movie sources open inside player, preserve media until selection and restore progress',async({page})=>{
  await startFixtureVideo(page);await page.locator('video').evaluate(v=>v.fixtureRetained=true);
  await page.getByRole('button',{name:'Fontes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes'});
  await expect(dialog.locator('.current-source-panel')).toHaveCSS('width','440px');await expect(dialog.locator('.source')).toHaveCount(2);expect(await page.locator('video').evaluate(v=>v.fixtureRetained)).toBe(true);
  await expect(dialog.getByRole('button',{name:'Voltar aos episódios',exact:true})).toHaveCount(0);await page.screenshot({animations:'disabled',path:'test-results/reference-player-current-sources-1920.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Fontes',exact:true})).toBeFocused();expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
  await page.getByRole('button',{name:'Fontes',exact:true}).click();await dialog.locator('.source:not([aria-disabled="true"])').first().click();await expect(page.locator('video')).toHaveCount(1);await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(24);
  expect(await page.locator('video').evaluate(v=>Boolean(v.fixtureRetained))).toBe(false);await leavePlayer(page);await expect(page.locator('.source')).toHaveCount(2);
});
test('current sources cancel late results and handle retry without replacing playback',async({page})=>{
  await startFixtureVideo(page);let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/stream/movie/**',async r=>{await gate;await r.fulfill({json:{streams:[{name:'Tardia',url:origin+'/clip.mp4'}]}}).catch(()=>{});});
  await page.getByRole('button',{name:'Fontes',exact:true}).click();await page.keyboard.press('Escape');release();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
  await page.route('**/stream/movie/**',r=>r.fulfill({status:503,body:'unavailable'}));await page.getByRole('button',{name:'Fontes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes'});await expect(dialog).toContainText('não responderam');
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'Fonte recuperada 1080p WEB-DL-FLUX',url:origin+'/clip.mp4'}]}}));await dialog.getByRole('button',{name:'Atualizar fontes',exact:true}).click();await expect(dialog.locator('.source')).toContainText('Fonte recuperada');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
});
test('player title uses reference logo bounds and falls back to text when the logo fails',async({page})=>{
  await page.route('**/meta/movie/**',r=>r.fulfill({json:{meta:{...movie,logo:origin+'/player-logo.svg'}}}));
  await page.route('**/player-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="100"><text x="0" y="70" fill="white" font-size="70">Horizonte</text></svg>'}));
  await startFixtureVideo(page);await expect(page.locator('.player-title-logo')).toBeVisible();await expect(page.locator('.player-controls h1')).toBeHidden();
  const bounds=await page.locator('.player-title-logo').evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight}));expect(bounds.w).toBeLessThanOrEqual(340);expect(bounds.h).toBeLessThanOrEqual(72);
  await page.route('**/player-logo.svg?missing',r=>r.fulfill({status:404,body:'missing'}));await page.locator('.player-title-logo').evaluate(n=>{n.src+='?missing';});await expect(page.locator('.player-controls h1')).toBeVisible();await expect(page.locator('.player-title-logo')).toHaveCount(0);
});

test('hidden-control arrows and LG media keys share the fork seek ramp',async({page})=>{
  await startFixtureVideo(page);await page.keyboard.press('Escape');await expect(page.locator('.player-controls')).toHaveClass(/faded/);
  await page.keyboard.down('ArrowRight');await expect(page.getByRole('slider',{name:'Posição do vídeo'})).toHaveValue('35');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);await page.keyboard.up('ArrowRight');
  await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBe(35);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:412,bubbles:true})));expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(35);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keyup',{keyCode:412,bubbles:true})));await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
});

async function syncFixture(page,body='1\n00:00:20,000 --> 00:00:30,000\nA fala que eu ouvi.\n\n2\n00:00:30,000 --> 00:00:40,000\nOutra fala.') {
  await playbackPrefs(page,{subtitles:'pt'});
  await page.route('**/stream/movie/**',r=>r.fulfill({json:{streams:[{name:'1080p WEB-DL',url:origin+'/clip.mp4',subtitles:[{name:'Português',lang:'por',url:origin+'/sync.srt'}]}]}}));
  let downloads=0;await page.route('**/sync.srt',r=>{downloads++;return r.fulfill({body});});
  await startFixtureVideo(page);await expect(page.locator('.subtitle-overlay')).toHaveAttribute('data-renderer','external');
  return ()=>downloads;
}
async function openSync(page) {
  await page.getByRole('button',{name:'Legendas',exact:true}).click();
  await page.getByRole('button',{name:'Ajustes de legenda',exact:true}).click();
  await page.getByRole('button',{name:'Sincronizar por fala',exact:true}).click();
  return page.getByRole('dialog',{name:'Sincronizar por fala',exact:true});
}
test('spoken-line sync uses captured time, preserves playback and persists compensated delay',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const downloads=await syncFixture(page);
  await page.locator('video').evaluate(v=>{v.currentTime=25.3;});const dialog=await openSync(page);
  await expect(dialog.getByRole('button',{name:'Sincronizar',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(dialog).toContainText('Momento marcado: 00:25');
  await page.locator('video').evaluate(v=>{v.currentTime=35;}); // The captured anchor must remain fixed while the user chooses.
  await dialog.getByRole('button',{name:/00:20 A fala/}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator('.subtitle-sync-result')).toHaveText('Legenda sincronizada: +5000 ms');
  expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(35,1);expect(downloads()).toBe(1);
  expect(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).subtitleDelays))).toEqual([5]);
  await page.locator('video').evaluate(v=>{v.currentTime=30;});await expect(page.locator('.subtitle-overlay')).toHaveText('A fala que eu ouvi.');
  await leavePlayer(page);await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);await page.locator('video').evaluate(v=>{v.pause();v.currentTime=30;});
  await expect(page.locator('.subtitle-overlay')).toHaveText('A fala que eu ouvi.');
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await page.getByRole('button',{name:'Ajustes de legenda',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Atraso: +5000 ms');
  await page.getByRole('button',{name:'Zerar atraso',exact:true}).click();await expect(page.locator('.subtitle-overlay')).toHaveText('Outra fala.');expect(errors).toEqual([]);
});
test('spoken-line sync bounds long files, focuses nearest cue and cancels with LG Back or suspension',async({page})=>{
  const stamp=s=>`00:${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')},000`;
  await syncFixture(page,Array.from({length:500},(_,i)=>`${i+1}\n${stamp(i)} --> ${stamp(i+1)}\nFala ${i}`).join('\n\n'));
  let dialog=await openSync(page);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  dialog=await openSync(page);await page.keyboard.press('Enter');await expect(dialog.locator('.sync-cue')).toHaveCount(90);
  await expect(dialog.locator('.sync-cue').filter({hasText:'00:25'})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(dialog.locator('.sync-cue').filter({hasText:'00:26'})).toBeFocused();
  await page.locator('#toast').evaluate(e=>e.hidden=true);await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');await page.screenshot({path:'test-results/player-sync-lines-1920.png'});
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).subtitleDelays||{}))).toEqual([]);
  dialog=await openSync(page);await page.keyboard.press('Enter');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await expect(dialog).toHaveCount(0);expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);
  expect(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).subtitleDelays||{}))).toEqual([]);
});
test('sync prompt resumes playback with one player and no offset on cancel',async({page})=>{
  await syncFixture(page);const dialog=await openSync(page);await page.locator('#toast').evaluate(e=>e.hidden=true);await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');await page.screenshot({path:'test-results/player-sync-prompt-1920.png'});
  await dialog.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.paused)).toBe(false);await expect(dialog.getByRole('button',{name:'Sincronizar',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'Sincronizar',exact:true}).click();await expect(dialog.locator('.sync-cue').first()).toBeVisible();expect(await page.locator('video').evaluate(v=>v.paused)).toBe(false);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('video')).toHaveCount(1);expect(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).subtitleDelays||{}))).toEqual([]);
});
test('track panels follow fork dimensions and focus colors; native subtitles cannot use external timing',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'audioTracks',{configurable:true,get(){return this.fixtureTracks ||= [{label:'Português 5.1',language:'por',enabled:true},{label:'Original',language:'eng',enabled:false}];}}));
  await startFixtureVideo(page);await page.getByRole('button',{name:'Áudio',exact:true}).click();const dialog=page.getByRole('dialog');
  const geometry=await dialog.locator('.track-panel').evaluate(p=>{const r=p.getBoundingClientRect();return {width:p.offsetWidth,right:(innerWidth-r.right)/2,bottom:(innerHeight-r.bottom)/2};});expect(geometry).toEqual({width:320,right:44,bottom:28});
  await expect(dialog.locator('.track-row:focus')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(dialog.locator('.track-row:focus')).toHaveCSS('color','rgb(0, 0, 0)');await expect(dialog.locator('.track-row:focus strong')).toHaveCSS('color','rgb(0, 0, 0)');await expect(dialog.locator('.track-row:focus strong')).toHaveText('Original');await expect(dialog.locator('.track-row:focus strong')).toBeVisible();await page.locator('#toast').evaluate(e=>e.hidden=true);await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');await page.screenshot({path:'test-results/player-audio-panel-1920.png'});
  await dialog.getByRole('button',{name:'Ajustes de áudio',exact:true}).click();await expect(dialog).toContainText('ainda não estão disponíveis');await page.keyboard.press('Escape');
  await page.locator('video').evaluate(v=>{const t=v.addTextTrack('subtitles','Interna','pt');t.mode='showing';t.addCue(new VTTCue(0,100,'Legenda interna'));});
  await page.getByRole('button',{name:'Legendas',exact:true}).click();await dialog.locator('[data-track-key="native-0"]').click();await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');await page.screenshot({path:'test-results/player-subtitle-panel-1920.png'});
  await dialog.getByRole('button',{name:'Ajustes de legenda',exact:true}).click();await expect(dialog.getByRole('button',{name:'Sincronizar por fala',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Atrasar 0,1 s',exact:true})).toBeDisabled();
  await expect(dialog).not.toContainText('Netflix Sans');await expect(page.locator('.subtitle-overlay')).toContainText('Legenda interna');
});

async function pauseFixture(page,{enabled=true,logo=true}={}) {
  await page.addInitScript(enabled=>{if(sessionStorage.getItem('pause-fixture-seeded'))return;const key='nuvio-fork.webos.v1',state=JSON.parse(localStorage.getItem(key)||'{}');state.settings={...state.settings,playback:{...state.settings?.playback,pauseOverlay:enabled}};localStorage.setItem(key,JSON.stringify(state));sessionStorage.setItem('pause-fixture-seeded','1');},enabled);
  const meta={...movie,tmdbId:100,logo:logo?origin+'/title-logo.svg':null,description:'Uma história de amizade e reencontros.',castMembers:Array.from({length:12},(_,i)=>({name:`Pessoa ${i+1}`,character:`Personagem ${i+1}`,photo:origin+'/poster.svg'}))};
  await page.route('**/meta/movie/**',r=>r.fulfill({json:{meta}}));
  await page.route('**/title-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><text x="0" y="110" font-family="serif" font-size="96" fill="white">HORIZONTE</text></svg>'}));
  await startFixtureVideo(page);await page.locator('#toast').evaluate(e=>e.hidden=true);await page.clock.install();
}
test('manual pause opens fork metadata after 5 seconds, browses cast and resumes the same video',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await pauseFixture(page);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(4900);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);await page.clock.runFor(200);
  const dialog=page.getByRole('dialog',{name:'Tela de pausa'});await expect(dialog).toBeVisible();await expect(dialog.locator('.pause-title-logo')).toBeVisible();await expect(dialog.locator('.pause-artwork h2')).toBeHidden();await expect(dialog).toContainText('Uma história de amizade');await expect(dialog.locator('.pause-cast-chip')).toHaveCount(8);
  const geometry=await dialog.locator('.pause-content').evaluate(e=>({left:e.getBoundingClientRect().left/2,bottom:(innerHeight-e.getBoundingClientRect().bottom)/2}));expect(geometry).toEqual({left:56,bottom:120});
  await page.clock.runFor(300);await expect(page.locator('.player-controls')).toHaveCSS('opacity','0');await expect(page.locator('.player-top')).toHaveCSS('opacity','0');
  await page.screenshot({animations:'disabled',path:'test-results/player-pause-1920.png'});
  await page.keyboard.press('ArrowDown');await expect(dialog.locator('.pause-cast-chip').first()).toBeFocused();await page.keyboard.press('Enter');await expect(dialog.locator('.pause-cast-detail')).toContainText('Como Personagem 1');await expect(dialog.locator('.pause-cast-photo')).toBeVisible();
  await page.screenshot({path:'test-results/player-pause-cast-1920.png'});
  await page.keyboard.press('Escape');await expect(dialog.locator('.pause-cast-chip').first()).toBeFocused();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect.poll(()=>page.locator('video').evaluate(v=>v.paused)).toBe(false);await expect(page.locator('video')).toHaveCount(1);expect(errors).toEqual([]);
});
test('pause overlay requires manual intent, waits around track panels and cancels on Back and suspension',async({page})=>{
  await pauseFixture(page,{logo:false});await page.clock.runFor(7000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0); // Fixture pause is programmatic.
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(3000);await page.getByRole('button',{name:'Áudio',exact:true}).click();await page.clock.runFor(7000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape');await page.clock.runFor(5100);await expect(page.locator('.player-pause-overlay')).toBeVisible();await expect(page.locator('.pause-artwork h2')).toHaveText(movie.name);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));await expect(page.locator('.player-pause-overlay')).toHaveCount(0);expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);await page.clock.runFor(8000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(8000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(7000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
});
test('pause timer resets with interaction and playing or leaving cancels it; default is disabled',async({page})=>{
  await pauseFixture(page,{enabled:false});await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(8000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
  await leavePlayer(page);await navigation(page,'Ajustes');await page.getByRole('button',{name:'Reprodução',exact:true}).click();await page.getByRole('switch',{name:'Tela de pausa',exact:true}).click();
  await page.reload();await navigation(page,'Ajustes');await page.getByRole('button',{name:'Reprodução',exact:true}).click();await expect(page.getByRole('switch',{name:'Tela de pausa',exact:true})).toHaveAttribute('aria-checked','true');
  await navigation(page,'Início');await page.locator('.card:not(.continue-card)').filter({hasText:'Horizonte de teste'}).click();await page.getByRole('button',{name:'Retomar',exact:true}).click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(4000);await page.keyboard.press('ArrowUp');await page.clock.runFor(4000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:415,bubbles:true})));await page.clock.runFor(6000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await leavePlayer(page);await page.clock.runFor(6000);await expect(page.locator('.player-pause-overlay')).toHaveCount(0);
});
test('player preserves catalog logo when detail returns null artwork',async({page})=>{
  await page.route('**/catalog/**',r=>r.fulfill({json:{metas:[{...movie,logo:origin+'/catalog-logo.svg'}]}}));
  await page.route('**/meta/movie/**',r=>r.fulfill({json:{meta:{...movie,logo:null}}}));
  await page.route('**/catalog-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="white"/></svg>'}));
  await startFixtureVideo(page);await expect(page.locator('.player-title-logo')).toBeVisible();await expect(page.locator('.player-controls h1')).toBeHidden();await expect(page.locator('.player-title-logo')).toHaveAttribute('src',origin+'/catalog-logo.svg');
});
test('late localized TMDB logo reaches the active player and failed image falls back to addon artwork',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('nuvio-fork.webos.metadata.v1',JSON.stringify({key:'a'.repeat(32),language:'pt-BR'})));
  let release;const gate=new Promise(r=>release=r);let requests=0;
  await page.route('https://api.themoviedb.org/**',async r=>{requests++;await gate;await r.fulfill({json:{id:100,title:'Title',images:{logos:[{file_path:'/en.png',iso_639_1:'en'},{file_path:'/br.png',iso_639_1:'pt',iso_3166_1:'BR'}]}}}).catch(()=>{});});
  await page.route('**/meta/movie/**',r=>r.fulfill({json:{meta:{...movie,tmdbId:100,logo:origin+'/fallback.svg'}}}));
  await page.route('**/fallback.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="white"/></svg>'}));
  const images=[];await page.route('https://image.tmdb.org/**',r=>{images.push(r.request().url());return r.fulfill({status:404,body:''});});
  await startFixtureVideo(page);await expect.poll(()=>requests).toBeGreaterThanOrEqual(2);release();await expect.poll(()=>images).toContain('https://image.tmdb.org/t/p/w500/br.png');
  await expect.poll(()=>page.locator('.player-title-logo').evaluate(i=>i.complete && i.naturalWidth>0)).toBe(true);await expect(page.locator('.player-title-logo')).toHaveAttribute('src',origin+'/fallback.svg');await expect(page.locator('.player-controls h1')).toBeHidden();
  expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);await expect(page.locator('video')).toHaveCount(1);
});

for(const exitEarly of [false,true])test(`localized logo ${exitEarly?'ignores late response after leaving':'updates pause artwork without moving focus'}`,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('nuvio-fork.webos.metadata.v1',JSON.stringify({key:'a'.repeat(32),language:'pt-BR'})));
  let release;const gate=new Promise(r=>release=r);let requests=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.themoviedb.org/**',async r=>{requests++;await gate;await r.fulfill({json:{id:100,title:'Title',images:{logos:[{file_path:'/localized.svg',iso_639_1:'pt',iso_3166_1:'BR'}]}}}).catch(()=>{});});
  await page.route('https://image.tmdb.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="100"><text y="75" fill="white" font-size="70">HORIZONTE</text></svg>'}));
  await pauseFixture(page,{logo:false});await expect.poll(()=>requests).toBeGreaterThanOrEqual(1);
  if(exitEarly){await leavePlayer(page);release();await page.clock.runFor(6000);await expect(page.locator('video,.player-pause-overlay,.player-title-logo')).toHaveCount(0);}
  else {
    await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(5300);await expect(page.locator('.pause-content')).toBeFocused();release();
    await expect(page.locator('.pause-title-logo')).toHaveAttribute('src','https://image.tmdb.org/t/p/w500/localized.svg');await expect(page.locator('.pause-content')).toBeFocused();await expect(page.locator('.pause-artwork h2')).toBeHidden();
    await page.keyboard.press('Escape');await expect(page.locator('.player-title-logo')).toHaveAttribute('src','https://image.tmdb.org/t/p/w500/localized.svg');await expect(page.locator('.player-controls h1')).toBeHidden();expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(25);
  }
  expect(errors).toEqual([]);
});

test('pause series metadata fits the logical canvas with long episode title and synopsis',async({page})=>{
  await playbackPrefs(page,{pauseOverlay:true});const title='Um episódio com um título bastante longo para verificar a quebra em duas linhas na tela de pausa';
  await page.route('**/meta/series/**',r=>r.fulfill({json:{meta:{...show,logo:origin+'/poster.svg',releaseInfo:'2026',videos:[{...show.videos[0],title,overview:'Uma sinopse extensa que explica a história do episódio e apresenta seus personagens. '.repeat(10)}],cast:['Pessoa 1','Pessoa 2']}}}));
  await install(page);await navigation(page,'Início');await page.getByRole('button',{name:'Série de teste',exact:true}).click();await page.locator('.episode').first().click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.clock.install();await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));await page.clock.runFor(5500);await expect(page.locator('.pause-episode')).toHaveText(title);await expect(page.locator('.pause-year')).toContainText('T1 E1');
  for(const width of [1280,1920,3840]){
    await page.setViewportSize({width,height:width*9/16});await page.clock.runFor(100);await expect.poll(()=>page.locator('#app').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a)).toBeCloseTo(width/960,3);const bounds=await page.locator('.pause-metadata').evaluate(e=>{const p=e.getBoundingClientRect(),i=e.querySelector('.pause-title-logo').getBoundingClientRect(),a=e.querySelector('.pause-artwork').getBoundingClientRect();return {top:p.top/(innerWidth/960),bottom:p.bottom/(innerWidth/960),logoBottom:i.bottom,boxBottom:a.bottom};});expect(bounds.top).toBeGreaterThanOrEqual(39);expect(bounds.bottom).toBeLessThanOrEqual(421);expect(bounds.logoBottom).toBeLessThanOrEqual(bounds.boxBottom+1);
  }
});
