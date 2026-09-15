// SPDX-License-Identifier: GPL-3.0-only
// ThemeDataStore / ThemeColors / SupporterThemeColors / SettingsUiStyle.
// The port's baseline look is the fork's White palette, whose tokens are the
// literals this stylesheet already used, so an untouched TV renders as before.
const base = Object.freeze({
  background: '#0d0d0d', backgroundElevated: '#1a1a1a', backgroundCard: '#242424', surface: '#1e1e1e',
  surfaceVariant: '#2d2d2d', panel: '#1a1a1a', field: '#222222', menu: '#1e1e1e', modal: '#1a1a1a',
  secondary: '#f5f5f5', secondaryVariant: '#e0e0e0', onSecondary: '#111111', onSecondaryVariant: '#111111',
  focusRing: '#ffffff', focusBackground: 'rgba(255,255,255,.14)', gradient: ['#f5f5f5']
});
// Every value below is copied from ThemeColors.kt and SupporterThemeColors.kt.
const overrides = {
  gold: { secondary: '#e8a91c', secondaryVariant: '#9a6200', focusRing: '#ffd45c', focusBackground: '#3d2d1a', background: '#0f0e0b', backgroundElevated: '#1d1a14', backgroundCard: '#262116', surface: '#211d16', surfaceVariant: '#302a1d', panel: '#1d1a14', field: '#292318', menu: '#211d16', modal: '#1d1a14', onSecondaryVariant: '#ffffff', gradient: ['#8a5700', '#e8a91c', '#fff1a8', '#ffd45c', '#9a6200'] },
  jade: { secondary: '#22d37c', secondaryVariant: '#0bbf9a', focusRing: '#7bf08d', focusBackground: '#153a2c', background: '#0b0f0d', backgroundElevated: '#141d18', backgroundCard: '#16251d', surface: '#17221c', surfaceVariant: '#203128', panel: '#141d18', field: '#1b2a22', menu: '#17221c', modal: '#141d18', gradient: ['#7bf08d', '#22d37c', '#0bbf9a'] },
  roseGold: { secondary: '#ec70a9', secondaryVariant: '#b75aff', focusRing: '#ffb37a', focusBackground: '#442037', background: '#100c0f', backgroundElevated: '#1f161d', backgroundCard: '#281a24', surface: '#241921', surfaceVariant: '#34242f', panel: '#1f161d', field: '#2c1e28', menu: '#241921', modal: '#1f161d', gradient: ['#b75aff', '#ec70a9', '#ffb37a'] },
  arcticBlue: { secondary: '#3185f5', secondaryVariant: '#4d55e8', focusRing: '#4de3ff', focusBackground: '#172844', background: '#0b0e14', backgroundElevated: '#141a24', backgroundCard: '#161e2a', surface: '#171f2c', surfaceVariant: '#202b3b', panel: '#141a24', field: '#1b2533', menu: '#171f2c', modal: '#141a24', gradient: ['#4de3ff', '#3185f5', '#4d55e8'] },
  graphite: { secondary: '#aab2be', secondaryVariant: '#687381', focusRing: '#f3f5f7', focusBackground: '#30343a', background: '#0c0d0f', backgroundElevated: '#17191d', backgroundCard: '#20242a', surface: '#1c1f23', surfaceVariant: '#292e35', panel: '#17191d', field: '#24282e', menu: '#1c1f23', modal: '#17191d', onSecondaryVariant: '#ffffff', gradient: ['#f3f5f7', '#aab2be', '#687381'] },
  crimson: { secondary: '#e53935', secondaryVariant: '#c62828', focusRing: '#ff5252', focusBackground: '#3d1a1a', background: '#0a0a0e', backgroundCard: '#241a1a' },
  ocean: { secondary: '#1e88e5', secondaryVariant: '#1565c0', focusRing: '#42a5f5', focusBackground: '#1a2d3d', background: '#0d0d0f', backgroundElevated: '#1a1a1e', backgroundCard: '#1a1f24' },
  violet: { secondary: '#8e24aa', secondaryVariant: '#6a1b9a', focusRing: '#ab47bc', focusBackground: '#2d1a3d', background: '#0d0d0f', backgroundElevated: '#1a1a1e', backgroundCard: '#1f1a24' },
  emerald: { secondary: '#43a047', secondaryVariant: '#2e7d32', focusRing: '#66bb6a', focusBackground: '#1a3d1e', backgroundCard: '#1a241a' },
  amber: { secondary: '#fb8c00', secondaryVariant: '#ef6c00', focusRing: '#ffa726', focusBackground: '#3d2d1a', background: '#0f0d0d', backgroundElevated: '#1e1a1a', backgroundCard: '#24201a' },
  rose: { secondary: '#d81b60', secondaryVariant: '#c2185b', focusRing: '#ec407a', focusBackground: '#3d1a2d', backgroundCard: '#241a1f' },
  white: {}
};
// Aparência → Tema de Cores, in the order of AppTheme and its pt-BR labels.
export const themes = Object.freeze([
  ['gold', 'Dourado'], ['jade', 'Jade'], ['roseGold', 'Ouro Rosa'], ['arcticBlue', 'Azul Ártico'],
  ['graphite', 'Grafite'], ['crimson', 'Carmesim'], ['ocean', 'Oceano'], ['violet', 'Violeta'],
  ['emerald', 'Esmeralda'], ['amber', 'Âmbar'], ['rose', 'Rosa'], ['white', 'Branco']
].map(([id, label]) => Object.freeze({ id, label, ...base, ...overrides[id] })));
export const themeIds = Object.freeze(themes.map(theme => theme.id));
export const defaultTheme = 'white';
// SettingsUiStyle.kt: CLASSIC, ZEN, HORIZON.
export const settingsStyles = Object.freeze([
  Object.freeze({ id: 'classic', label: 'Padrão', description: 'Layout tradicional com cartões' }),
  Object.freeze({ id: 'zen', label: 'Minimalista', description: 'Visual simples e direto, sem elementos extras' }),
  Object.freeze({ id: 'horizon', label: 'Barra Superior', description: 'Navegação por abas posicionadas no topo da tela' })
]);
export function themeFor(id) { return themes.find(theme => theme.id === id) || themes.find(theme => theme.id === defaultTheme); }
export function readAppearance(value = {}) {
  return {
    theme: themeIds.includes(value?.theme) ? value.theme : defaultTheme,
    amoled: value?.amoled === true,
    amoledSurfaces: value?.amoledSurfaces === true,
    style: settingsStyles.some(style => style.id === value?.style) ? value.style : 'classic'
  };
}
// The workspace border keeps the literal the port already used for White so no
// untouched screen changes; every other palette follows its own border token.
export function appearanceVars(value) {
  const appearance = readAppearance(value), theme = themeFor(appearance.theme);
  const vars = {
    '--background': appearance.amoled ? '#000000' : theme.background,
    '--background-elevated': theme.backgroundElevated,
    '--background-card': theme.backgroundCard,
    '--surface': theme.surface,
    '--surface-variant': theme.surfaceVariant,
    '--panel': theme.panel,
    '--field': theme.field,
    '--menu': theme.menu,
    '--modal': theme.modal,
    '--line': theme.id === defaultTheme ? '#333333' : theme.surfaceVariant,
    '--focus': theme.focusBackground,
    '--focus-ring': theme.focusRing,
    '--accent': theme.secondary,
    '--accent-strong': theme.secondaryVariant,
    '--accent-on': theme.onSecondary,
    '--accent-gradient': `linear-gradient(90deg,${theme.gradient.join(',')})`
  };
  if (appearance.amoled && appearance.amoledSurfaces) for (const key of ['--surface', '--surface-variant', '--panel', '--field', '--menu', '--modal', '--background-elevated', '--background-card']) vars[key] = '#000000';
  return vars;
}
export function applyAppearance(root, value) {
  const appearance = readAppearance(value);
  for (const [key, css] of Object.entries(appearanceVars(appearance))) root.style.setProperty(key, css);
  for (const id of themeIds) root.classList.toggle(`theme-${id}`, id === appearance.theme);
  root.classList.toggle('amoled', appearance.amoled);
  root.classList.toggle('amoled-surfaces', appearance.amoled && appearance.amoledSurfaces);
  for (const style of settingsStyles) root.classList.toggle(`settings-style-${style.id}`, style.id === appearance.style);
  return appearance;
}