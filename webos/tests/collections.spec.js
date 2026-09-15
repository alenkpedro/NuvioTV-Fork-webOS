import { test, expect } from '@playwright/test';
const origin = 'https://fixture.example';
const movie = { id: 'tt1000001', type: 'movie', name: 'Filme do catálogo', releaseInfo: '2024', poster: origin + '/poster.svg' };
const addon = { url: origin + '/manifest.json', manifest: { id: 'local.test', name: 'Catálogo de teste', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb'], catalogs: [{ id: 'test', name: 'Coleção de teste', type: 'movie' }] } };
async function boot(page, { collections = [] } = {}) {
  await page.addInitScript(({ addon, collections }) => {
    if (!localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [addon], progress: {}, library: {}, watched: {}, settings: {}, collections }));
    localStorage.setItem('nuvio-fork.webos.metadata.v1', JSON.stringify({ key: 'a'.repeat(32), language: 'pt-BR' }));
  }, { addon, collections });
  await page.route(origin + '/**', route => {
    const u = new URL(route.request().url()), p = decodeURIComponent(u.pathname);
    const json = body => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (p.endsWith('manifest.json')) return json(addon.manifest);
    if (p.includes('/catalog/')) return json({ metas: [movie] });
    if (p.includes('/meta/')) return json({ meta: movie });
    if (p.includes('/stream/')) return json({ streams: [{ name: 'Movie 1080p WEB-DL-FLUX', url: origin + '/clip.mp4' }] });
    if (p.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#284568"/></svg>' });
    return route.abort();
  });
}
async function tmdb(page) {
  const calls = [];
  await page.route('https://api.themoviedb.org/**', route => {
    const u = new URL(route.request().url()); calls.push(u.pathname + u.search);
    const json = body => route.fulfill({ json: body });
    if (u.pathname === '/3/configuration') return json({ images: {} });
    if (u.pathname === '/3/collection/10') return json({ id: 10, name: 'Coleção do TMDB', parts: [{ id: 501, title: 'Saga Um', release_date: '2001-05-01', overview: 'Primeiro.', poster_path: '/a.jpg' }, { id: 502, title: 'Saga Dois', release_date: '2003-05-01', overview: 'Segundo.', poster_path: '/b.jpg' }] });
    if (u.pathname.includes('/find/')) return json({ movie_results: [{ id: 501 }], tv_results: [] });
    return json({ id: 501, title: 'Saga Um', overview: 'Primeiro.', images: { logos: [] }, credits: { cast: [] }, videos: { results: [] }, recommendations: { results: [] } });
  });
  return calls;
}
async function drawer(page, title) {
  for (let i = 0; i < 6 && !await page.locator('.sidebar').count(); i++) await page.keyboard.press('Escape');
  if (!await page.locator('#app').evaluate(node => node.classList.contains('drawer-open'))) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: title, exact: true }).click();
}
async function discoverySettings(page) {
  await page.goto('/');
  await drawer(page, 'Ajustes');
  await page.getByRole('button', { name: 'Conteúdo e Descoberta', exact: true }).click();
}
async function openCollections(page) {
  await discoverySettings(page);
  await page.getByRole('button', { name: /^Coleções/ }).click();
}
test('Coleções lives in Ajustes, creates collections and keeps them per profile', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await openCollections(page);
  await expect(page.getByRole('heading', { name: 'Coleções' })).toBeVisible();
  await expect(page.getByText('Nenhuma coleção ainda. Crie uma para organizar suas fileiras na Home.')).toBeVisible();
  // Create → rename → pin, all with the fork's own words.
  await page.getByRole('button', { name: 'Nova coleção', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova coleção' });
  await dialog.getByRole('textbox', { name: 'Nome da coleção' }).fill('Sagas');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.collection-row')).toHaveCount(1);
  await expect(page.locator('.collection-row')).toContainText('Sagas');
  await page.getByRole('button', { name: 'Renomear Sagas', exact: true }).click();
  await page.getByRole('dialog', { name: 'Renomear coleção' }).getByRole('textbox').fill('Sagas do cinema');
  await page.getByRole('dialog', { name: 'Renomear coleção' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.collection-row')).toContainText('Sagas do cinema');
  await page.getByRole('button', { name: 'Fixar Sagas do cinema no topo', exact: true }).click();
  await expect(page.locator('.collection-pin')).toHaveText('Fixada');
  await expect(page.locator('#toast')).toContainText('fixada no topo');
  const saved = (await stored(page)).collections;
  expect(saved.length).toBe(1);
  expect(saved[0].title).toBe('Sagas do cinema');
  expect(saved[0].pinToTop).toBe(true);
  await page.screenshot({ path: 'test-results/collections-management-1920.png' });
  // Reload keeps them, and the settings row reports the count.
  await discoverySettings(page);
  await expect(page.getByRole('button', { name: /^Coleções/ })).toContainText('1 coleção(ões)');
  await page.getByRole('button', { name: /^Coleções/ }).click();
  await expect(page.locator('.collection-row')).toContainText('Sagas do cinema');
  expect(errors).toEqual([]);
});
test('a catalog source becomes a Home rail with its own see-all screen', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await openCollections(page);
  await page.getByRole('button', { name: 'Nova coleção', exact: true }).click();
  await page.getByRole('dialog', { name: 'Nova coleção' }).getByRole('textbox').fill('Sagas');
  await page.getByRole('dialog', { name: 'Nova coleção' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.locator('.collection-open').click();
  await expect(page.getByRole('heading', { name: 'Sagas' })).toBeVisible();
  await expect(page.locator('.collections-head .muted')).toHaveText('0 pasta(s) · 0 fonte(s) · na ordem da Home');
  // Folder, then the add-on catalog source: add-on → catalog.
  await page.getByRole('button', { name: 'Nova pasta', exact: true }).click();
  await page.getByRole('dialog', { name: 'Nova pasta' }).getByRole('textbox').fill('Clássicos');
  await page.getByRole('dialog', { name: 'Nova pasta' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.collection-folder')).toContainText('Clássicos');
  // The header follows the edits instead of freezing at the first render.
  await expect(page.locator('.collections-head .muted')).toHaveText('1 pasta(s) · 0 fonte(s) · na ordem da Home');
  await page.getByRole('button', { name: 'Adicionar fonte em Clássicos', exact: true }).click();
  await page.getByRole('dialog', { name: 'Adicionar fonte' }).getByRole('button', { name: 'Catálogo de add-on', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add-on' }).getByRole('button', { name: 'Catálogo de teste', exact: true }).click();
  await page.getByRole('dialog', { name: 'Catálogo de teste' }).getByRole('button', { name: /Coleção de teste/ }).click();
  await expect(page.locator('.collection-source')).toContainText('Catálogo de teste · Coleção de teste');
  await expect(page.locator('.collections-head .muted')).toHaveText('1 pasta(s) · 1 fonte(s) · na ordem da Home');
  await page.getByRole('button', { name: 'Fixar no topo', exact: true }).click();
  await expect(page.locator('.collections-head .muted')).toContainText('fixada no topo da Home');
  await expect(page.getByRole('button', { name: 'Desafixar do topo', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/collections-editor-1920.png' });
  // The Home shows the fork's collection row: one cover card per folder, and the card opens the
  // folder screen, where the titles live.
  await home(page);
  const rail = page.locator('.collection-section', { hasText: 'Sagas' });
  await expect(rail).toBeVisible();
  await expect(rail.locator('.collection-card')).toHaveCount(1);
  await expect(rail.locator('.collection-card')).toContainText('Clássicos');
  await expect(rail.locator('.collection-card')).toContainText('Catálogo de teste · Coleção de teste');
  await rail.locator('.collection-card').click();
  await expect(page.getByRole('heading', { name: 'Clássicos' })).toBeVisible();
  await expect(page.locator('.stream-chips button')).toHaveText(['Catálogo de teste · Coleção de teste']);
  await expect(page.locator('.card').first()).toContainText('Filme do catálogo');
  await page.screenshot({ path: 'test-results/collections-folder-1920.png' });
  expect(errors).toEqual([]);
});
test('a TMDB source is added through the pickers and reaches the Home without an add-on', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const calls = await tmdb(page);
  await boot(page);
  await openCollections(page);
  await page.getByRole('button', { name: 'Nova coleção', exact: true }).click();
  await page.getByRole('dialog', { name: 'Nova coleção' }).getByRole('textbox').fill('Sagas');
  await page.getByRole('dialog', { name: 'Nova coleção' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.locator('.collection-open').click();
  await page.getByRole('button', { name: 'Nova pasta', exact: true }).click();
  await page.getByRole('dialog', { name: 'Nova pasta' }).getByRole('textbox').fill('Saga do TMDB');
  await page.getByRole('dialog', { name: 'Nova pasta' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar fonte em Saga do TMDB', exact: true }).click();
  await page.getByRole('dialog', { name: 'Adicionar fonte' }).getByRole('button', { name: 'TMDB', exact: true }).click();
  await page.getByRole('dialog', { name: 'Fonte do TMDB' }).getByRole('button', { name: 'Coleção do TMDB', exact: true }).click();
  await page.getByRole('dialog', { name: 'ID da Coleção' }).getByRole('textbox').fill('10');
  await page.getByRole('dialog', { name: 'ID da Coleção' }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ordem' }).getByRole('button', { name: 'Mais populares', exact: true }).click();
  await expect(page.locator('.collection-source')).toContainText('TMDB · Coleção do TMDB · 10');
  expect((await stored(page)).collections[0].folders[0].sources[0]).toMatchObject({ kind: 'tmdb', sourceType: 'collection', tmdbId: 10, mediaType: 'movie' });
  await home(page);
  const rail = page.locator('.collection-section', { hasText: 'Sagas' });
  await expect(rail).toBeVisible();
  // The Home draws the folder cover without asking TMDB: the titles are fetched when the
  // folder is opened.
  await expect(rail.locator('.collection-card')).toHaveCount(1);
  expect(calls.some(call => call.startsWith('/3/collection/10'))).toBe(false);
  await rail.locator('.collection-card').click();
  await expect(page.getByRole('heading', { name: 'Saga do TMDB' })).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(2);
  expect(calls.some(call => call.startsWith('/3/collection/10'))).toBe(true);
  // A TMDB-only card opens the detail screen, which then searches the installed add-ons.
  await page.locator('.card').first().click();
  await expect(page.getByRole('heading', { name: 'Saga Um' })).toBeVisible();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await expect(page.locator('.source')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('pinning a collection moves its rail to the top of the Home', async ({ page }) => {
  const collections = [
    { id: 'c1', title: 'Primeira', pinToTop: false, folders: [{ id: 'f1', title: 'Fileira um', sources: [{ kind: 'catalog', addonUrl: addon.url, addonName: addon.manifest.name, type: 'movie', catalogId: 'test', catalogName: 'Coleção de teste' }] }] },
    { id: 'c2', title: 'Segunda', pinToTop: true, folders: [{ id: 'f2', title: 'Fileira dois', sources: [{ kind: 'catalog', addonUrl: addon.url, addonName: addon.manifest.name, type: 'movie', catalogId: 'test', catalogName: 'Coleção de teste' }] }] }
  ];
  await boot(page, { collections });
  await home(page);
  // The user-curated collections lead the Home with the collection name in the header; the
  // pinned one leads them, and the add-on catalog follows the collections, as on the fork.
  await expect(page.locator('.catalog-section h2')).toHaveText(['Segunda', 'Primeira', 'Coleção de teste - Filme']);
  // Unpin in the management screen and the Home order follows.
  await openCollections(page);
  await page.getByRole('button', { name: 'Fixar Segunda no topo', exact: true }).click();
  await home(page);
  await expect(page.locator('.catalog-section h2')).toHaveText(['Primeira', 'Segunda', 'Coleção de teste - Filme']);
});

async function home(page) {
  await page.goto('/');
  await drawer(page, 'Início');
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')));
