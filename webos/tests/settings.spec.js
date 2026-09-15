import { test, expect } from '@playwright/test';
const movie = { id: 'tt1', type: 'movie', name: 'Horizonte de teste' };
async function install(page, settings = {}) {
  // Seed once: addInitScript also runs on reload, and a persisted change must survive it.
  await page.addInitScript(value => {
    if (localStorage.getItem('nuvio-fork.webos.v1')) return;
    localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [], progress: {}, watched: {}, library: {}, settings: value }));
  }, settings);
}
async function settings(page, category) {
  await page.goto('/');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  if (category) await page.getByRole('button', { name: category, exact: true }).click();
}
const categories = ['Conta', 'Perfis', 'Aparência', 'Layout', 'Conteúdo e Descoberta', 'Integrações', 'Reprodução', 'Rastreamento', 'Sobre', 'Avançado'];
test('settings rail follows the fork categories, order and subtitles with no page errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await install(page);
  await settings(page);
  const rail = page.getByRole('navigation', { name: 'Categorias de ajustes' });
  await expect(rail.getByRole('button')).toHaveText(categories);
  await expect(rail.getByRole('button', { name: 'Conta', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Conta', exact: true })).toBeVisible();
  await expect(page.getByText('Conta e status de sincronização', { exact: true })).toBeVisible();
  // Every category renders its fork heading, subtitle and groups without a runtime error.
  for (const category of categories) {
    await rail.getByRole('button', { name: category, exact: true }).click();
    await expect(page.locator('.settings-header h1')).toHaveText(category);
    await expect(page.locator('.settings-content .settings-group').first()).toBeVisible();
  }
  await expect(page.locator('.settings-header h1')).toHaveText('Avançado');
  await expect(page.getByText('Desempenho, navegação, cache e diagnósticos', { exact: true })).toBeVisible();
  await expect(page.locator('.settings-content .settings-group-title')).toHaveText(['Desempenho e navegação', 'Diagnóstico', 'Cache']);
  await page.screenshot({ path: 'test-results/settings-advanced-1920.png' });
  expect(errors).toEqual([]);
});
test('appearance theme, AMOLED and settings style apply to the whole app and persist', async ({ page }) => {
  await install(page);
  await settings(page, 'Aparência');
  await expect(page.locator('.theme-chip')).toHaveCount(12);
  await expect(page.locator('.theme-chip[aria-pressed=true]')).toHaveText(/Branco/);
  const white = await page.locator('#app').evaluate(node => getComputedStyle(node).backgroundColor);
  expect(white).toBe('rgb(13, 13, 13)');
  await page.getByRole('button', { name: 'Oceano', exact: true }).click();
  await expect(page.locator('#app')).toHaveClass(/theme-ocean/);
  expect(await page.locator('#app').evaluate(node => getComputedStyle(node).getPropertyValue('--accent').trim())).toBe('#1e88e5');
  await expect(page.locator('.theme-chip[aria-pressed=true]')).toHaveText(/Oceano/);
  const ocean = await page.locator('#app').evaluate(node => getComputedStyle(node).backgroundColor);
  expect(ocean).toBe('rgb(13, 13, 15)');
  await page.getByRole('switch', { name: 'Modo AMOLED', exact: true }).click();
  await expect(page.locator('#app')).toHaveClass(/amoled/);
  expect(await page.locator('#app').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(0, 0, 0)');
  const surfaces = page.getByRole('switch', { name: 'Superfícies em Preto Puro', exact: true });
  await expect(surfaces).toBeVisible();
  await surfaces.click();
  await expect(page.locator('#app')).toHaveClass(/amoled-surfaces/);
  expect(await page.locator('.settings-workspace').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Minimalista', exact: true }).click();
  await expect(page.locator('#app')).toHaveClass(/settings-style-zen/);
  await page.screenshot({ path: 'test-results/settings-appearance-zen-1920.png' });
  await page.reload(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Aparência', exact: true }).click();
  await expect(page.locator('#app')).toHaveClass(/theme-ocean/);
  await expect(page.locator('#app')).toHaveClass(/amoled-surfaces/);
  await expect(page.locator('#app')).toHaveClass(/settings-style-zen/);
  await expect(page.getByRole('button', { name: 'Minimalista', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).settings.appearance);
  expect(stored).toEqual({ theme: 'ocean', amoled: true, amoledSurfaces: true, style: 'zen' });
});
test('settings style Barra Superior keeps every category reachable and restores focus', async ({ page }) => {
  await install(page, { appearance: { style: 'horizon' } });
  await settings(page);
  await expect(page.locator('#app')).toHaveClass(/settings-style-horizon/);
  const rail = page.getByRole('navigation', { name: 'Categorias de ajustes' });
  await expect(rail.getByRole('button', { name: 'Reprodução', exact: true })).toBeVisible();
  await rail.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reprodução', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/settings-horizon-1920.png' });
});
test('playback groups follow the fork, keep the port toggles working and mark Android-only rows', async ({ page }) => {
  await install(page, { playback: { autoSkipTypes: ['intro'] } });
  await settings(page, 'Reprodução');
  await expect(page.locator('.settings-content .settings-group-title')).toHaveText(['Geral', 'Pular automaticamente', 'Player e Seleção de Fontes', 'Legendas', 'Buffer e Rede', 'Reprodução automática']);
  const pause = page.getByRole('switch', { name: 'Informações ao pausar', exact: true });
  await expect(pause).toHaveAttribute('aria-checked', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-checked', 'true');
  // Pular introduções is enabled by default, as in the fork.
  const skip = page.getByRole('switch', { name: 'Pular introduções', exact: true });
  await expect(skip).toHaveAttribute('aria-checked', 'true');
  await skip.click();
  await expect(skip).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Créditos', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Aberturas', exact: true })).toHaveAttribute('aria-checked', 'true');
  // Avisos de conteúdo is a real switch now; the Android-only rows stay marked.
  await expect(page.getByRole('switch', { name: 'Avisos de conteúdo', exact: true })).toHaveAttribute('aria-checked', 'true');
  // Reprodução automática is no longer pending: the fork's four modes are chips,
  // and the link cache and the trailer are switches of their own.
  await expect(page.getByRole('switch', { name: 'Reutilizar último link', exact: true })).toBeVisible();
  const modes = page.locator('[aria-label="Seleção automática de fonte"] button');
  await expect(modes).toHaveText(['Manual (escolher fonte)', 'Primeira fonte', 'Seleção inteligente', 'Palavra-chave (Regex)']);
  await expect(modes.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: 'Trailer automático após assistir', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: 'test-results/settings-playback-1920.png' });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).settings.playback);
  expect(stored.pauseOverlay).toBe(true);
  expect(stored.skipSegments).toBe(false);
  expect(stored.autoSkipTypes.sort()).toEqual(['intro', 'outro']);
  await page.reload(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Informações ao pausar', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Pular introduções', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: 'Créditos', exact: true })).toHaveAttribute('aria-checked', 'true');
  // The fork keeps subtitle appearance inside Reprodução → Legendas.
  await page.getByRole('button', { name: /^Aparência das legendas/ }).click();
  await expect(page.getByRole('heading', { name: 'Aparência das legendas' })).toBeVisible();
  await page.getByRole('button', { name: 'Aumentar tamanho', exact: true }).click();
  await expect(page.locator('.subtitle-style-editor')).toContainText('110%');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).settings.subtitleStyle.size)).toBe(110);
  await page.screenshot({ path: 'test-results/settings-subtitle-appearance-1920.png' });
});
test('parental guide and post-play recommendations are real settings with a bounded threshold', async ({ page }) => {
  await install(page);
  await settings(page, 'Reprodução');
  // PlayerSettings.parentalGuideEnabled defaults to true in the fork.
  const parental = page.getByRole('switch', { name: 'Avisos de conteúdo', exact: true });
  await expect(parental).toHaveAttribute('aria-checked', 'true');
  await parental.click();
  await expect(parental).toHaveAttribute('aria-checked', 'false');
  const postPlay = page.getByRole('switch', { name: 'Recomendações após assistir', exact: true });
  await expect(postPlay).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.settings-threshold')).toHaveCount(0);
  await postPlay.click();
  await expect(postPlay).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.settings-threshold-value')).toHaveText('90%');
  const slower = page.getByRole('button', { name: 'Diminuir limite de recomendações', exact: true });
  const faster = page.getByRole('button', { name: 'Aumentar limite de recomendações', exact: true });
  for (let i = 0; i < 10; i++) await slower.click(); // 90 → 80
  await expect(page.locator('.settings-threshold-value')).toHaveText('80%');
  await expect(slower).toBeDisabled();
  for (let i = 0; i < 20; i++) await faster.click(); // 80 → 100
  await expect(page.locator('.settings-threshold-value')).toHaveText('100%');
  await expect(faster).toBeDisabled();
  // The rebuilt pane keeps focus on the step that is still usable.
  await slower.click();
  await expect(page.locator('.settings-threshold-value')).toHaveText('99%');
  await expect(slower).toBeFocused();
  await page.screenshot({ path: 'test-results/settings-post-play-1920.png' });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).settings.playback);
  expect(stored.parentalGuide).toBe(false);
  expect(stored.postPlayRecommendations).toBe(true);
  expect(stored.postPlayMovieThreshold).toBe(99);
});
test('layout, discovery, integration, tracking and about expose the fork rows without losing reachability', async ({ page }) => {
  await install(page);
  await settings(page, 'Layout');
  await expect(page.locator('.settings-content .settings-group-title')).toHaveText(['Layout da Home', 'Conteúdo da Home', 'Continuar Assistindo']);
  const rail = page.getByRole('navigation', { name: 'Categorias de ajustes' });
  await rail.getByRole('button', { name: 'Conteúdo e Descoberta', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Addons/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Catálogos do início/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Descobrir/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Plugins/ })).toContainText('Pendente');
  await rail.getByRole('button', { name: 'Integrações', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Debrid/ })).toContainText('Pendente');
  await expect(page.getByRole('button', { name: /^TMDB/ })).toContainText('Não configurado');
  await expect(page.getByRole('button', { name: /^Avaliações MDBList/ })).toBeVisible();
  await rail.getByRole('button', { name: 'Rastreamento', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Trakt/ })).toContainText('Não conectado');
  // The fork's watch-progress source arrives read-only from the account profile.
  await expect(page.getByRole('button', { name: /^Progresso de assistidos/ })).toContainText('Nuvio Sync');
  await rail.getByRole('button', { name: 'Sobre', exact: true }).click();
  await expect(page.locator('.settings-about')).toContainText(/Versão webOS \d+\.\d+\.\d+/);
  await page.getByRole('button', { name: /^Licenças e Atribuições/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Licenças e Atribuições' });
  await expect(dialog).toContainText('GPL-3.0');
  await page.screenshot({ path: 'test-results/settings-about-licenses-1920.png' });
});
