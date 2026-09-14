// SPDX-License-Identifier: GPL-3.0-only
import { loadAddon, getJSON, resourceURL, supports, normalCatalogs, extraOptions, mapLimit } from './core/addons.js';
import { defaults, enums, rankStreams, filterAndSort, factsFor, playbackIssue, sizeBytes } from './core/ranking.js';
import { readState, saveState, progressKey, recordProgress } from './core/storage.js';
import { installRemote } from './remote.js';
import { createAccountClient } from './core/account.js';
import { importAccountAddons, detachAccountAddons } from './core/account-sync.js';
import { readLayout, homeGeometry, catalogTitle, runtimeText, releaseText, episodeList, nextEpisode, castMembers } from './core/presentation.js';
import { installTrackControls } from './player-tracks.js';
import qrcode from 'qrcode-generator';
import searchIcon from '../public/assets/icons/sidebar_search.svg';
import libraryIcon from '../public/assets/icons/sidebar_library.svg';
import settingsIcon from '../public/assets/icons/sidebar_settings.svg';
import './style.css';

const root = document.querySelector('#app');
const state = readState(localStorage);
state.settings.layout = readLayout(state.settings.layout);
const layout = state.settings.layout;
const account = createAccountClient({ storage: localStorage });
// Do not display another account's imported add-ons after local session loss.
state.addons = state.addons.filter(a => !a.accountOwner || a.accountOwner === account.user?.id);
if (state.accountSync?.userId !== account.user?.id) delete state.accountSync;
let route = { name: 'home' }, stack = [], request = null, player = null, cleanupPlayer = null;
let toastTimer, persistWarning = false, heroTimer, heroRequest, pillTimer, drawerOpen = false, contentFocus = null;
let pointerFocus = false;
document.addEventListener('pointerdown', () => { pointerFocus = true; }, true);
document.addEventListener('pointerup', () => { pointerFocus = false; }, true);
document.addEventListener('pointercancel', () => { pointerFocus = false; }, true);
document.addEventListener('keydown', () => { pointerFocus = false; }, true);
// Compose TV uses a 960 × 540 dp canvas. Preserve the fork's dp/sp geometry
// at webOS's 1920 × 1080 app resolution instead of inventing responsive layouts.
function fitCanvas() {
  const scale = Math.min(innerWidth / 960, innerHeight / 540);
  root.style.transform = `scale(${scale})`;
  root.style.left = `${(innerWidth - 960 * scale) / 2}px`;
  root.style.top = `${(innerHeight - 540 * scale) / 2}px`;
}
window.addEventListener('resize', fitCanvas); fitCanvas();
const sourceIcons = { search: searchIcon, library: libraryIcon, settings: settingsIcon };
const iconTemplates = new Map();
function icon(name) {
  const box = el('span', { class: `icon icon-${name}`, 'aria-hidden': true });
  if (sourceIcons[name]) {
    if (!iconTemplates.has(name)) {
      // Compile-time local assets only, never add-on markup. Match Compose tint.
      const svg = new DOMParser().parseFromString(sourceIcons[name], 'image/svg+xml').documentElement;
      svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
      for (const node of svg.querySelectorAll('[fill], [stroke]')) for (const attr of ['fill', 'stroke']) {
        if (node.hasAttribute(attr) && node.getAttribute(attr) !== 'none') node.setAttribute(attr, 'currentColor');
      }
      iconTemplates.set(name, svg);
    }
    box.append(iconTemplates.get(name).cloneNode(true));
  }
  return box;
}
const metadataCache = new Map();
const labels = Object.fromEntries(Object.values(enums).flatMap(e => e.entries.map(x => [x.id, x.label])));
const text = v => String(v ?? '');
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : text(v));
  }
  for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(text(child)));
  return node;
}
const button = (label, onclick, attrs = {}) => el('button', { type: 'button', onclick, ...attrs }, label);
function safeImage(url) { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
function poster(url, name, cls = '') {
  const src = safeImage(url);
  const box = el('div', { class: `art ${cls}` });
  if (src) box.append(el('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }));
  box.append(el('span', { class: 'art-fallback' }, text(name).slice(0, 1).toUpperCase() || 'N'));
  return box;
}
function toast(message) {
  const node = document.querySelector('#toast'); node.textContent = message; node.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 6000);
}
function persist() {
  if (!saveState(localStorage, state) && !persistWarning) { persistWarning = true; toast('Armazenamento indisponível. Alterações valem somente nesta sessão.'); }
}
function focusFirst() { const expectedRoute = route, expectedRequest = request; requestAnimationFrame(() => {
  if (drawerOpen || route !== expectedRoute || request !== expectedRequest) return;
  const restored = route.restoreFocus && [...root.querySelectorAll('[data-focus]')].find(e => e.dataset.focus === route.restoreFocus);
  delete route.restoreFocus;
  (restored || root.querySelector('main [data-initial-focus]') || root.querySelector('main input, main button:not(:disabled)') || root.querySelector('main'))?.focus({ preventScroll: true });
  if (restored?.classList.contains('source')) restored.scrollIntoView({ block: 'nearest' });
}); }
function navigate(next, replace = false) {
  if (!replace) stack.push({ route, focus: document.activeElement?.dataset.focus });
  route = next; render();
}
function back() {
  const dialog = root.querySelector('[role=dialog]');
  if (dialog) { (dialog.querySelector('[data-dismiss]') || dialog.querySelector('button'))?.click(); return; }
  if (root.querySelector('.sidebar') && !stack.length) {
    if (!drawerOpen) { setDrawer(true); return; }
    if (window.webOSSystem?.platformBack) window.webOSSystem.platformBack();
    else if (window.PalmSystem?.platformBack) window.PalmSystem.platformBack();
    else { setDrawer(false); toast('Você está no início.'); }
    return;
  }
  if (stack.length) {
    const prior = stack.pop(); route = { ...prior.route, restoreFocus: prior.focus }; render();
  } else if (route.name !== 'home') navigate({ name: 'home' }, true);
  else if (window.webOSSystem?.platformBack) window.webOSSystem.platformBack();
  else if (window.PalmSystem?.platformBack) window.PalmSystem.platformBack();
  else toast('Você está no início.');
}
function setDrawer(open) {
  const nav = root.querySelector('.sidebar'); if (!nav) return;
  if (open && !drawerOpen && !nav.contains(document.activeElement)) contentFocus = document.activeElement;
  drawerOpen = open; root.classList.toggle('drawer-open', open);
  root.querySelector('main')?.toggleAttribute('inert', open);
  nav.querySelectorAll('button').forEach(b => b.tabIndex = open ? 0 : -1);
  if (open) (nav.querySelector('.active') || nav.querySelector('button'))?.focus({ preventScroll: true });
  else if (contentFocus?.isConnected) contentFocus.focus({ preventScroll: true });
  else focusFirst();
}
function applyLayout() {
  for (const [name, enabled] of Object.entries({ 'modern-sidebar': layout.modernSidebar, 'hidden-sidebar': layout.hideSidebar, 'sidebar-blur': layout.sidebarBlur,
    'landscape-posters': layout.landscapePosters, 'full-backdrop': layout.fullBackdrop, 'hide-poster-labels': !layout.posterLabels })) root.classList.toggle(name, enabled);
  const g = homeGeometry(layout);
  for (const [key, value] of Object.entries(g)) root.style.setProperty(`--${key}`, `${value}px`);
  syncSidebarPill();
}
function syncSidebarPill() {
  const old = root.querySelector('.sidebar-pill');
  if (!layout.modernSidebar || layout.hideSidebar || !root.querySelector('.sidebar') || route.name === 'search') { old?.remove(); return; }
  if (old) return;
  const title = { home: 'Início', library: 'Biblioteca', settings: 'Ajustes' }[route.name];
  root.append(button([icon(route.name), el('span', {}, title)], () => setDrawer(true), { class: 'sidebar-pill', tabindex: -1, 'aria-label': 'Abrir menu lateral' }));
  revealPill();
}
function revealPill() {
  const pill = root.querySelector('.sidebar-pill'); if (!pill) return;
  clearTimeout(pillTimer); pill.classList.remove('icon-only');
  pillTimer = setTimeout(() => pill.classList.add('icon-only'), 3000);
}
function shell(active = '') {
  root.replaceChildren(); root.classList.remove('drawer-open'); drawerOpen = false; applyLayout();
  const hasSidebar = ['home', 'search', 'library', 'settings'].includes(active);
  if (hasSidebar) {
    const nav = el('nav', { 'aria-label': 'Navegação principal', class: 'sidebar' },
      el('img', { class: 'brand', src: 'assets/wordmark.png', alt: 'Nuvio' }),
      el('div', { class: 'nav-items' }, ...[['home', 'Início'], ['search', 'Busca'], ['library', 'Biblioteca'], ['settings', 'Ajustes']].map(([name, title]) => button([icon(name), el('span', { class: 'nav-label' }, title)], () => {
        if (!drawerOpen) { setDrawer(true); return; }
        stack = []; navigate({ name }, true);
      }, { class: active === name ? 'nav-item active' : 'nav-item', 'aria-label': title, tabindex: -1, 'aria-current': active === name ? 'page' : null, 'data-focus': `nav-${name}` }))));
    root.append(el('div', { class: 'drawer-scrim', onclick: () => setDrawer(false), 'aria-hidden': true }), nav);
    syncSidebarPill();
  }
  const main = el('main', { class: `screen-${active}${hasSidebar ? ' with-sidebar' : ''}`, tabindex: -1 }); root.append(main); return main;
}
function heading(main, kicker, title, subtitle) { main.append(el('div', { class: 'heading' }, el('h1', {}, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null)); }
function notice(main, message) { main.append(el('p', { class: 'notice', role: 'status' }, message)); }
function failure(main, error, retry) { main.append(el('div', { class: 'empty' }, el('h2', {}, 'Não foi possível carregar'), el('p', {}, error.message), button('Tentar novamente', retry))); }
const current = signal => !signal.aborted;
async function render() {
  clearTimeout(heroTimer); clearTimeout(pillTimer); heroRequest?.abort(); request?.abort(); request = new AbortController(); const signal = request.signal;
  if (cleanupPlayer) { cleanupPlayer(); cleanupPlayer = null; player = null; }
  try {
    if (route.name === 'player') { showPlayer(route); return; }
    const main = shell(route.name);
    const screens = { home: showHome, addons: showAddons, search: showSearch, settings: showSettings, library: showLibrary, preferences: showPreferences, catalog: showCatalog, detail: showDetail, streams: showStreams, welcome: showWelcome, 'account-login': showAccountLogin };
    await (screens[route.name] ?? showHome)(main, signal);
    if (current(signal)) focusFirst();
  } catch (error) {
    if (current(signal)) { const main = root.querySelector('main'); if (main) failure(main, error, render); focusFirst(); }
  }
}
function card(meta, addon, progress, rowKey = '') {
  const id = text(meta.id), type = text(meta.type || 'movie');
  const wide = progress ? layout.continueStyle !== 'poster' : layout.landscapePosters;
  const image = wide ? meta.background || meta.fanart || meta.poster : meta.poster;
  const node = button([poster(image, meta.name), el('strong', {}, meta.name || id), el('span', { class: 'muted' }, progress ? [progress.episode ? `T${progress.episode.season}:E${progress.episode.episode}` : '', `Retomar em ${clock(progress.time)}`].filter(Boolean).join(' · ') : meta.releaseInfo || '')], () => navigate(progress ? { name: 'streams', meta: { ...meta, type }, addon, type: progress.type, id: progress.id, episode: progress.episode } : { name: 'detail', meta: { ...meta, type }, addon }), { class: `card${progress ? ' continue-card' : ''}`, 'aria-label': meta.name || id, 'data-focus': `card-${rowKey}-${type}-${progress?.id || id}` });
  node.addEventListener('focus', () => {
    const section = node.closest('.home-rows .catalog-section');
    if (section) {
      const viewport = section.parentElement;
      if (!pointerFocus) {
        viewport.scrollTop = Math.max(0, section.offsetTop - 40);
        node.parentElement.scrollLeft = Math.max(0, node.offsetLeft - 52);
      }
      clearTimeout(heroTimer);
      heroRequest?.abort();
      section.dataset.lastFocus = node.dataset.focus;
      heroTimer = setTimeout(() => { if (route.name === 'home') enrichHomeHero(meta, addon); }, 450);
    }
  });
  if (progress) node.querySelector('.art').append(el('progress', { max: progress.duration, value: progress.time, 'aria-label': 'Progresso assistido' }));
  return node;
}
function catalogSection(main, title, metas, addon, more, rowKey = title) {
  const section = el('section', { class: 'catalog-section' }, el('div', { class: 'section-head' }, el('h2', {}, title), layout.catalogAddonName && addon ? el('span', { class: 'catalog-addon muted' }, addon.manifest.name) : null), el('div', { class: 'rail' }, metas.slice(0, 16).map(m => card(m, addon, null, rowKey))));
  if (more) {
    const all = button([icon('next'), el('strong', {}, 'Ver todos')], more, { class: 'card more-card', 'aria-label': `Ver todos: ${title}`, 'data-focus': `more-${rowKey}` });
    all.addEventListener('focus', () => {
      if (!section.parentElement?.classList.contains('home-rows')) return;
      section.dataset.lastFocus = all.dataset.focus;
      clearTimeout(heroTimer); heroRequest?.abort();
      if (!pointerFocus) { section.parentElement.scrollTop = Math.max(0, section.offsetTop - 40); all.parentElement.scrollLeft = Math.max(0, all.offsetLeft - 52); }
    });
    section.querySelector('.rail').append(all);
  }
  main.append(section);
}
function titleArt(meta, className = 'hero-title') {
  const title = el('h1', { class: className }, meta.name || meta.id);
  const src = safeImage(meta.logo);
  if (src) {
    const img = el('img', { src, alt: meta.name || '', class: 'title-logo', onerror: () => img.replaceWith(el('span', {}, meta.name || meta.id)) });
    title.replaceChildren(img);
  }
  return title;
}
function metaLine(meta, detail = false) {
  return el('div', { class: 'hero-meta' },
    el('span', {}, (Array.isArray(meta.genres) ? meta.genres.slice(0, detail ? 3 : 2) : []).join(' • ') || (meta.type === 'series' ? 'Série' : 'Filme')),
    ...[runtimeText(meta.runtime), releaseText(meta)].filter(Boolean).map(value => el('span', { class: 'meta-divider' }, value)),
    meta.imdbRating ? el('span', { class: 'imdb-rating' }, el('b', {}, 'IMDb'), text(meta.imdbRating)) : null);
}
async function loadMeta(meta, addon, signal) {
  const urls = new Set();
  const providers = [addon, ...state.addons].filter(a => a && !urls.has(a.url) && urls.add(a.url) && supports(a, 'meta', meta.type, meta.id));
  for (const a of providers.slice(0, 3)) {
    try {
      const result = await cachedMetaJSON(resourceURL(a, 'meta', meta.type, meta.id), signal);
      if (signal.aborted) return null;
      if (result.meta?.id === meta.id) return { meta: { ...meta, ...result.meta, type: meta.type }, addon: a };
    } catch (error) { if (signal.aborted) return null; }
  }
  return { meta, addon };
}
async function enrichHomeHero(meta, addon) {
  updateHomeHero(meta);
  if (document.hidden) return;
  heroRequest?.abort(); const controller = heroRequest = new AbortController();
  const enriched = await loadMeta(meta, addon, controller.signal);
  if (!controller.signal.aborted && route.name === 'home' && enriched) updateHomeHero(enriched.meta);
}
function updateHomeHero(meta) {
  const hero = root.querySelector('.home-hero'); if (!hero) return;
  const src = safeImage(meta.background || meta.fanart);
  const previous = hero.querySelector('.hero-backdrop');
  if (src && previous?.getAttribute('src') !== src) {
    const img = el('img', { class: 'hero-backdrop', src, alt: '', decoding: 'async', onerror: e => e.target.remove() });
    previous?.remove(); hero.prepend(img);
  } else if (!src) previous?.remove();
  hero.querySelector('.hero-copy').replaceChildren(titleArt(meta), metaLine(meta), el('p', { class: 'hero-description' }, meta.description || ''));
}
async function cachedMetaJSON(url, signal) {
  const cached = metadataCache.get(url);
  if (cached && Date.now() - cached.time < 120000) return cached.value;
  const value = await getJSON(url, { signal });
  if (signal.aborted) return value;
  const weight = JSON.stringify(value).length * 2;
  if (weight <= 2 * 1024 * 1024) {
    metadataCache.delete(url); metadataCache.set(url, { time: Date.now(), value, weight });
    while (metadataCache.size > 8 || [...metadataCache.values()].reduce((n, entry) => n + entry.weight, 0) > 2 * 1024 * 1024) metadataCache.delete(metadataCache.keys().next().value);
  }
  return value;
}
async function showHome(main, signal) {
  if (!state.addons.length) {
    main.append(el('p', { class: 'home-empty', role: 'status' }, 'Nenhum addon instalado. Adicione um para começar.')); return;
  }
  const catalogs = state.addons.flatMap(addon => normalCatalogs(addon).map(catalog => ({ addon, catalog }))).slice(0, 6);
  const recent = layout.continueWatching ? Object.values(state.progress).filter(x => !x.complete).sort((a, b) => b.updated - a.updated).slice(0, 12) : [];
  if (!catalogs.length && !recent.length) {
    main.append(el('p', { class: 'home-empty', role: 'status' }, 'Nenhum addon de catálogo instalado. Instale um para ver conteúdos.')); return;
  }
  main.append(el('section', { class: 'home-hero', 'aria-label': 'Título em destaque' }, el('div', { class: 'hero-fade' }), el('div', { class: 'hero-copy' })));
  const rows = el('div', { class: 'home-rows' }); main.append(rows);
  if (recent.length) {
    rows.append(el('section', { class: 'catalog-section continue-section' }, el('div', { class: 'section-head' }, el('h2', {}, 'Continuar assistindo')), el('div', { class: 'rail' }, recent.map(p => card(p.meta, null, p, 'continue')))));
    updateHomeHero(recent[0].meta);
  }
  const loading = el('p', { class: 'loading', role: 'status' }, 'Carregando…'); rows.append(loading);
  const results = await mapLimit(catalogs, async ({ addon, catalog }) => {
    const response = await cachedMetaJSON(resourceURL(addon, 'catalog', catalog.type, catalog.id), signal);
    return { addon, catalog, metas: Array.isArray(response.metas) ? response.metas.map(m => ({ ...m, type: m.type || catalog.type })) : [] };
  }, signal);
  if (!current(signal)) return; loading.remove();
  let first = recent[0]?.meta;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.value?.metas.length) {
      first ||= r.value.metas[0];
      catalogSection(rows, catalogTitle(r.value.catalog, layout), r.value.metas, r.value.addon, () => navigate({ name: 'catalog', addon: r.value.addon, catalog: r.value.catalog }), `home-${i}`);
    } else if (r.error) notice(rows, `${catalogs[i].addon.manifest.name}: ${r.error.message}`);
  }
  if (first) updateHomeHero(first);
  else notice(rows, 'Nenhum conteúdo encontrado.');
}
function showLibrary(main) {
  heading(main, '', 'Biblioteca');
  const rows = el('div', { class: 'library-content' });
  const draw = type => {
    const saved = Object.values(state.library).filter(m => m.type === type);
    rows.replaceChildren(saved.length ? el('div', { class: 'grid' }, saved.map(m => card(m, null))) : el('div', { class: 'library-empty' }, icon('library'), el('h2', {}, `Nenhum ${type === 'movie' ? 'filme' : 'série'} ainda`), el('p', { class: 'muted' }, 'Comece a salvar seus favoritos para vê-los aqui')));
    main.querySelectorAll('.library-tabs button').forEach(b => b.classList.toggle('selected', b.dataset.type === type));
  };
  main.append(el('div', { class: 'library-tabs toolbar' }, ...[['movie', 'Filmes'], ['series', 'Séries']].map(([type, name]) => button(name, () => draw(type), { 'data-type': type }))), rows); draw('movie');
}
function showAddons(main) {
  heading(main, '', 'Addons');
  const input = el('input', { type: 'url', placeholder: 'https://seu-addon/manifest.json', 'aria-label': 'URL do manifesto', autocomplete: 'off', spellcheck: 'false' });
  const submit = button('Instalar add-on', null, { type: 'submit', class: 'primary' });
  const form = el('form', { class: 'inline-form', onsubmit: async e => {
    e.preventDefault(); if (!input.value.trim() || submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Verificando…';
    const signal = request.signal;
    try {
      const addon = await loadAddon(input.value, { signal }); if (!current(signal)) return;
      if (state.addons.length >= 30 && !state.addons.some(a => a.url === addon.url)) throw Error('Limite de 30 add-ons nesta TV.');
      state.addons = [...state.addons.filter(a => a.url !== addon.url), addon]; persist(); metadataCache.clear(); await render(); toast(`${addon.manifest.name} instalado.`);
    } catch (e) { if (current(signal)) toast(e.message); }
    finally { submit.disabled = false; submit.textContent = 'Instalar add-on'; }
  } }, input, submit);
  main.append(el('section', { class: 'addon-install' }, el('h2', {}, 'Instalar addon'), form));
  if (!state.addons.length) notice(main, 'Você ainda não instalou nenhum add-on.');
  for (const a of state.addons) main.append(el('article', { class: 'addon-row' }, poster(a.manifest.logo, a.manifest.name, 'addon-icon'), el('div', { class: 'grow' }, el('h2', {}, a.manifest.name), el('p', { class: 'muted' }, `${a.manifest.version || ''} · ${new URL(a.url).hostname}`), el('p', {}, text(a.manifest.description).slice(0, 250))), button('Remover', () => { state.addons = state.addons.filter(x => x.url !== a.url); persist(); metadataCache.clear(); render(); })));
}
async function showCatalog(main, signal) {
  const { addon, catalog } = route;
  heading(main, addon.manifest.name, catalog.name || catalog.id);
  const grid = el('div', { class: 'grid' }); main.append(grid);
  let skip = 0, loading = false; const seen = new Set();
  const more = button('Carregar mais', loadMore, { class: 'load-more' });
  async function loadMore() {
    if (loading) return; loading = true; more.disabled = true; more.textContent = 'Carregando…';
    try {
      const response = await cachedMetaJSON(resourceURL(addon, 'catalog', catalog.type, catalog.id, skip ? { skip } : {}), signal);
      if (!current(signal)) return;
      const metas = Array.isArray(response.metas) ? response.metas : [];
      let added = 0;
      for (const m of metas.slice(0, 100)) if (!seen.has(m.id)) { seen.add(m.id); grid.append(card({ ...m, type: m.type || catalog.type }, addon)); added++; }
      skip += metas.length;
      const canPage = extraOptions(catalog).some(e => e.name === 'skip');
      more.hidden = !canPage || !added || seen.size >= 200;
      if (!seen.size) notice(main, 'Nenhum título encontrado neste catálogo.');
    } catch (e) { if (current(signal)) toast(e.message); }
    finally { loading = false; more.disabled = false; more.textContent = 'Carregar mais'; }
  }
  main.append(more); await loadMore();
}
function showSearch(main, signal) {
  main.classList.add('search-content');
  const input = el('input', { type: 'search', 'aria-label': 'Buscar título', placeholder: 'Buscar filmes e séries', autocomplete: 'off' });
  const results = el('div'); let searchController;
  signal.addEventListener('abort', () => searchController?.abort());
  const form = el('form', { class: 'inline-form search-form', onsubmit: async e => {
    e.preventDefault(); const query = input.value.trim(); if (!query) return;
    searchController?.abort(); const controller = searchController = new AbortController();
    results.replaceChildren(el('p', { class: 'loading' }, 'Buscando…'));
    const catalogs = state.addons.flatMap(addon => (addon.manifest.catalogs ?? []).filter(c => extraOptions(c).some(e => e.name === 'search') && !extraOptions(c).some(e => e.isRequired && e.name !== 'search')).map(catalog => ({ addon, catalog })));
    const rows = await mapLimit(catalogs, async ({ addon, catalog }) => {
      const data = await getJSON(resourceURL(addon, 'catalog', catalog.type, catalog.id, { search: query }), { signal: controller.signal });
      return { addon, catalog, metas: (Array.isArray(data.metas) ? data.metas : []).map(m => ({ ...m, type: m.type || catalog.type })) };
    }, controller.signal);
    if (!current(signal) || controller.signal.aborted) return; results.replaceChildren();
    for (const r of rows) if (r.value?.metas.length) catalogSection(results, r.value.addon.manifest.name, r.value.metas, r.value.addon);
    if (!results.childElementCount) notice(results, catalogs.length ? 'Nenhum resultado. Verifique também se seus add-ons responderam.' : 'Instale um add-on com catálogo de busca.');
    const failed = rows.filter(r => r.error).length; if (failed) notice(results, `${failed} catálogo(s) não responderam.`);
  } }, input, button('Buscar', null, { type: 'submit', class: 'primary' }));
  main.append(form, results);
}
function textDialog(title, body) {
  const previous = document.activeElement;
  const dialog = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title },
    el('section', { class: 'dialog-panel' }, el('h2', {}, title), el('p', { class: 'dialog-copy', tabindex: 0, 'data-focusable': true }, body)));
  const close = button('Fechar', () => { dialog.remove(); previous?.focus({ preventScroll: true }); }, { 'data-dismiss': true });
  dialog.firstChild.append(close); root.append(dialog); close.focus();
}
async function showDetail(main, signal) {
  let { meta, addon } = route;
  heading(main, meta.type === 'series' ? 'SÉRIE' : 'FILME', meta.name || meta.id);
  const enriched = await loadMeta(meta, addon, signal);
  if (!current(signal) || !enriched) return;
  ({ meta, addon } = enriched);
  main.replaceChildren();
  const backdrop = safeImage(meta.background || meta.fanart);
  main.append(el('div', { class: 'detail-scene' }, backdrop ? el('img', { class: 'detail-backdrop', src: backdrop, alt: '', decoding: 'async', onerror: e => e.target.remove() }) : null, el('div', { class: 'detail-fade' })));
  const go = (id = meta.id, episode) => navigate({ name: 'streams', meta, addon, id, type: meta.type, episode });
  const key = progressKey(meta.type, meta.id);
  const toggleLibrary = button(icon(state.library[key] ? 'check' : 'add'), () => {
    if (state.library[key]) delete state.library[key];
    else {
      state.library[key] = { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background, releaseInfo: meta.releaseInfo };
      const entries = Object.entries(state.library); if (entries.length > 500) delete state.library[entries[0][0]];
    }
    persist(); toggleLibrary.replaceChildren(icon(state.library[key] ? 'check' : 'add'));
    toggleLibrary.setAttribute('aria-label', state.library[key] ? 'Remover da biblioteca' : 'Adicionar à biblioteca');
  }, { class: 'round-button', 'aria-label': state.library[key] ? 'Remover da biblioteca' : 'Adicionar à biblioteca' });
  const next = meta.type === 'series' ? nextEpisode(meta, state.progress) : null;
  const resume = meta.type === 'movie' && state.progress[key] && !state.progress[key].complete;
  const watchText = next ? `${next.resume ? 'Retomar' : 'Assistir'}: T${next.video.season}:E${next.video.episode}` : resume ? 'Retomar' : 'Assistir';
  const watch = button([icon('play'), watchText], () => {
    if (next) go(next.video.id, { title: next.video.title, season: next.video.season, episode: next.video.episode });
    else if (meta.type === 'movie') go();
  }, { class: 'primary play-button', disabled: meta.type === 'series' && !next, 'data-initial-focus': meta.type !== 'series' || Boolean(next), 'data-focus': 'detail-play' });
  const watched = button(icon(state.watched[key] ? 'eye' : 'eye-off'), () => {
    state.watched[key] = !state.watched[key]; persist();
    watched.replaceChildren(icon(state.watched[key] ? 'eye' : 'eye-off'));
    watched.setAttribute('aria-label', state.watched[key] ? 'Marcar como não assistido' : 'Marcar como assistido');
  }, { class: 'round-button', 'aria-label': state.watched[key] ? 'Marcar como não assistido' : 'Marcar como assistido' });
  const credits = [['Direção', meta.director], ['Roteiro', meta.writer]].filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([label, v]) => `${label}: ${[].concat(v).join(', ')}`).join(' • ');
  const synopsis = meta.description ? button(meta.description, () => textDialog(meta.name || 'Sinopse', meta.description), { class: 'synopsis', 'aria-label': 'Ler sinopse completa', 'data-focus': 'detail-synopsis' }) : null;
  const detail = el('section', { class: 'detail-hero' }, titleArt(meta, 'detail-title'),
    el('div', { class: 'detail-actions toolbar' }, watch, toggleLibrary, meta.type === 'movie' ? watched : null),
    el('div', { class: 'detail-credit muted' }, credits),
    el('div', { class: 'detail-source-space' }),
    synopsis, metaLine(meta, true));
  main.append(detail);
  if (meta.type === 'series') {
    const videos = episodeList(meta);
    if (!videos.length) notice(main, 'Nenhum episódio foi retornado pelo catálogo.');
    const seasons = [...new Set(videos.map(v => v.season))];
    const group = el('section', { class: 'episode-section' }, el('h2', {}, 'Episódios'));
    const tabs = el('div', { class: 'season-tabs', role: 'tablist', 'aria-label': 'Temporada' });
    const list = el('div', { class: 'episodes', role: 'tabpanel', 'aria-label': 'Episódios da temporada' });
    let seasonTimer;
    signal.addEventListener('abort', () => clearTimeout(seasonTimer), { once: true });
    const draw = season => {
      clearTimeout(seasonTimer); route.season = season;
      tabs.querySelectorAll('button').forEach(b => { const selected = Number(b.dataset.season) === season; b.classList.toggle('selected', selected); b.setAttribute('aria-selected', String(selected)); });
      list.replaceChildren(...videos.filter(v => v.season === season).slice(0, 150).map(v => {
        const p = state.progress[progressKey(meta.type, v.id)];
        const future = Number.isFinite(Date.parse(v.released)) && Date.parse(v.released) > Date.now();
        const status = future ? 'Ainda não lançado' : p?.complete ? 'Assistido' : p ? `Retomar em ${clock(p.time)}` : '';
        const card = button([poster(v.thumbnail || meta.background || meta.poster, v.title, 'episode-art'), el('span', { class: 'episode-fade' }),
          el('span', { class: 'episode-copy' }, el('span', { class: 'episode-code' }, `T${v.season}:E${v.episode}`), el('strong', {}, v.title || `Episódio ${v.episode}`), el('p', {}, v.overview || v.description || ''),
            el('small', { class: 'muted' }, [runtimeText(v.runtime), v.released ? releaseText({ type: 'movie', released: v.released }) : ''].filter(Boolean).join(' • '))),
          status ? el('small', { class: 'episode-status' }, status) : null,
          p ? el('progress', { max: p.duration, value: p.time, 'aria-label': 'Progresso assistido' }) : null], () => future ? toast('Este episódio ainda não foi lançado.') : go(v.id, { title: v.title, season: v.season, episode: v.episode }), { class: 'episode', 'aria-disabled': future ? 'true' : null, 'data-focus': `episode-${v.id}` });
        card.addEventListener('focus', () => { list.dataset.lastFocus = card.dataset.focus; if (!pointerFocus) { main.scrollTop = group.offsetTop - 24; card.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } });
        return card;
      }));
      list.scrollLeft = 0;
    };
    for (const season of seasons) {
      const tab = button(season === 0 ? 'Especiais' : `Temporada ${season}`, () => { draw(season); list.querySelector('.episode')?.focus(); }, { role: 'tab', 'data-season': season, 'data-focus': `season-${season}` });
      tab.addEventListener('focus', () => { clearTimeout(seasonTimer); if (!pointerFocus) main.scrollTop = group.offsetTop - 24; if (route.season !== season) seasonTimer = setTimeout(() => draw(season), 150); });
      tabs.append(tab);
    }
    if (seasons.length) { group.append(tabs, list); main.append(group); draw(seasons.includes(route.season) ? route.season : next?.video.season ?? seasons[0]); }
  }
  const cast = castMembers(meta);
  if (cast.length) {
    const roles = { Creator: 'Criação', Director: 'Direção', Writer: 'Roteiro' };
    main.append(el('section', { class: 'cast-section' }, el('h2', {}, 'Elenco'), el('div', { class: 'cast-rail' }, cast.map((member, i) => button([
      poster(member.photo, member.name, 'cast-photo'), el('strong', {}, member.name), el('small', { class: 'muted' }, roles[member.character] || member.character || '')],
      () => textDialog(member.name, roles[member.character] || member.character || 'Integrante do elenco.'), { class: 'cast-card', 'data-focus': `cast-${i}` })))));
  }
  main.querySelectorAll('.detail-actions button, .synopsis').forEach(b => b.addEventListener('focus', () => { if (!pointerFocus) main.scrollTop = 0; }));
}
async function showStreams(main, signal) {
  // Ephemeral route state preserves selection on Back; signed source URLs are not persisted.
  route.sourceView ||= { showAll: false, provider: null };
  const context = { ...route }, view = context.sourceView;
  const backdrop = safeImage(context.meta.background);
  if (backdrop) main.append(el('img', { class: 'stream-backdrop', src: backdrop, alt: '' }));
  main.append(el('div', { class: 'stream-fade' }));
  const identity = el('aside', { class: 'stream-identity' }, el('div', {}, titleArt(context.meta, 'stream-title'),
    el('p', { class: 'muted' }, context.episode ? `Temporada ${context.episode.season} · Episódio ${context.episode.episode}` : [context.meta.genres?.join(', '), context.meta.releaseInfo].filter(Boolean).join(' • ')),
    context.episode?.title ? el('p', {}, context.episode.title) : null));
  const pane = el('div', { class: 'stream-pane' }); main.append(identity, pane); main = pane;
  const providers = state.addons.filter(a => supports(a, 'stream', context.type, context.id)).slice(0, 30);
  if (!view.rows || Date.now() - view.loadedAt > 120000) {
    const loading = el('p', { class: 'loading' }, 'Buscando fontes nos seus add-ons…'); main.append(loading);
    const responses = await mapLimit(providers, async (addon, provider) => {
      const result = await getJSON(resourceURL(addon, 'stream', context.type, context.id), { signal });
      if (!Array.isArray(result.streams)) throw Error('Resposta de fontes inválida.');
      return result.streams.slice(0, 300).filter(s => s && typeof s === 'object').map((s, index) => ({ ...s, addonName: addon.manifest.name, sourceProvider: provider, sourceKey: `source-${provider}-${index}` }));
    }, signal);
    if (!current(signal)) return; loading.remove();
    view.rows = responses.flatMap(r => r.value ?? []);
    view.failed = responses.filter(r => r.error).length; view.loadedAt = Date.now();
  }
  const all = view.rows;
  const chooseBest = rows => rankStreams(rows.filter(s => !playbackIssue(s, state.settings.avoidDvOnly)), state.settings.preferences)[0];
  if (state.settings.autoPlay && !view.visited) {
    view.visited = true; const best = chooseBest(all);
    if (best) { navigate({ ...context, name: 'player', stream: best }); return; }
  }
  view.visited = true;
  const list = el('div', { class: 'streams' });
  const count = el('p', { class: 'stream-count', role: 'status' });
  const subset = () => all.filter(s => view.provider === null || s.sourceProvider === view.provider);
  const display = () => {
    // Manual list uses strict filters. Auto-pick retains the fork's exclusion fallback.
    const rows = subset();
    const visible = view.showAll ? rankStreams(rows, { ...state.settings.preferences, excludedResolutions: [], excludedQualities: [], excludedVisualTags: [], excludedAudioTags: [], excludedAudioChannels: [], excludedEncodes: [], excludedLanguages: [], excludedReleaseGroups: [] }) : filterAndSort(rows, state.settings.preferences);
    list.replaceChildren();
    count.textContent = `${Math.min(100, visible.length)} de ${rows.length} fonte(s)${view.failed ? ` · ${view.failed} addon(s) não responderam` : ''}`;
    if (!visible.length) notice(list, !providers.length ? 'Nenhum add-on instalado fornece fontes para este título.' : !rows.length ? 'Nenhuma fonte encontrada. Tente atualizar ou escolher outro addon.' : 'Nenhuma fonte passou pelos filtros. Use “Mostrar todas” para revisar.');
    for (const s of visible.slice(0, 100)) {
      const f = factsFor(s, state.settings.preferences), issue = playbackIssue(s, state.settings.avoidDvOnly);
      const badges = [labels[f.resolution], labels[f.quality], labels[f.encode], ...(f.visualTags || []).map(v => labels[v]), ...(f.audioTags || []).map(v => labels[v]), ...(f.audioChannels || []).map(v => labels[v]), f.releaseGroup, bytes(sizeBytes(s))].filter(v => v && !/unknown|desconhecid|not available/i.test(v));
      const sourceIcon = providers[s.sourceProvider]?.manifest.logo;
      list.append(button([el('div', { class: 'source-heading' }, el('div', { class: 'grow' }, el('strong', {}, s.name || s.title || 'Fonte'), el('span', { class: 'source-addon' }, s.addonName)), sourceIcon ? poster(sourceIcon, s.addonName, 'source-icon') : null),
        el('p', {}, s.description || s.title || ''), el('div', { class: 'source-badges' }, [...new Set(badges)].map(value => el('span', {}, value))),
        issue ? el('small', { class: 'warning' }, issue) : null],
      () => issue ? toast(issue) : navigate({ ...context, name: 'player', stream: s }),
      { class: `source ${issue ? 'unavailable' : ''}`, 'aria-disabled': issue ? 'true' : null, 'data-focus': s.sourceKey, 'data-initial-focus': !list.childElementCount }));
    }
  };
  const toggle = button(view.showAll ? 'Aplicar filtros do fork' : 'Mostrar todas', () => { view.showAll = !view.showAll; toggle.textContent = view.showAll ? 'Aplicar filtros do fork' : 'Mostrar todas'; display(); }, { 'data-focus': 'source-filters' });
  const chips = el('div', { class: 'stream-chips' }, button('Atualizar', () => { view.rows = null; route.restoreFocus = 'source-refresh'; render(); }, { 'data-focus': 'source-refresh', 'aria-label': 'Atualizar fontes' }));
  for (const provider of [null, ...providers.map((_, i) => i)]) chips.append(button(provider === null ? 'Todos' : providers[provider].manifest.name, () => {
    view.provider = provider; [...chips.querySelectorAll('[data-provider]')].forEach(b => b.classList.toggle('selected', b.dataset.provider === String(provider))); display();
  }, { class: provider === view.provider ? 'selected' : '', 'data-provider': String(provider), 'data-focus': `source-addon-${provider}` }));
  const actions = el('div', { class: 'stream-actions' }, button('Reproduzir melhor fonte', () => {
    const best = chooseBest(subset()); best ? navigate({ ...context, name: 'player', stream: best }) : toast('Não há fonte HTTP(S) elegível nesta seleção.');
  }, { 'data-focus': 'source-best' }), toggle);
  main.append(chips, count, list, actions); display();
}
function syncSummary(result) {
  if (result.failed) return `${result.imported} addon(s) carregado(s); ${result.failed} não responderam. Tente sincronizar novamente.`;
  return result.imported ? `${result.imported} addon(s) da conta carregado(s).` : 'Nenhum addon habilitado no perfil principal da conta.';
}
async function syncAccount(signal) {
  const result = await importAccountAddons(account, state, { signal });
  persist(); metadataCache.clear(); return result;
}
function authBrand() {
  return el('div', { class: 'auth-brand-panel' }, el('img', { src: 'assets/wordmark.png', alt: 'Nuvio', class: 'auth-brand' }), el('h1', {}, 'Sua conta Nuvio.\nAgora na sua TV.'), el('p', {}, 'Conecte a conta que você já usa para carregar seus addons do perfil principal.'), el('small', {}, 'Você autoriza a vinculação no site do Nuvio, pelo celular.'));
}
function showWelcome(main) {
  main.append(authBrand(), el('div', { class: 'auth-pane welcome-pane' }, el('h2', {}, 'Bem-vindo ao Nuvio'), el('p', { class: 'muted' }, 'Entre na sua conta para começar.'),
    button('Entrar com Nuvio', () => navigate({ name: 'account-login', onboarding: true }), { class: 'primary', 'data-initial-focus': true }),
    button('Continuar sem conta', () => { state.guestMode = true; persist(); stack = []; navigate({ name: 'home' }, true); })));
}
function showAccountLogin(main, signal) {
  main.append(authBrand());
  const pane = el('div', { class: 'auth-pane' }); main.append(pane);
  const code = el('strong', { class: 'auth-code', 'aria-label': 'Código de vinculação' });
  const qr = el('div', { class: 'auth-qr', 'aria-label': 'QR code para vincular a TV' });
  const message = el('p', { class: 'auth-status', role: 'status' }, 'Gerando código seguro…');
  const countdown = el('small', { class: 'muted auth-countdown' });
  const regenerate = button('Gerar novo código', () => navigate({ name: 'account-login', onboarding: route.onboarding }, true), { hidden: true });
  const cancel = button('Cancelar', back);
  pane.append(el('h2', {}, 'Entrar com Nuvio'), el('p', { class: 'muted' }, 'Escaneie o QR code ou abra nuvio.tv/link no celular e informe o código.'), qr, code, message, countdown, el('div', { class: 'toolbar' }, regenerate, cancel));
  let timer, ticker, pairing;
  const stop = () => { clearTimeout(timer); clearInterval(ticker); };
  signal.addEventListener('abort', stop, { once: true });
  function expire(text) {
    stop(); qr.replaceChildren(); code.textContent = ''; countdown.textContent = ''; message.textContent = text; regenerate.hidden = false; regenerate.focus();
  }
  async function poll() {
    if (signal.aborted || document.hidden) { if (!signal.aborted) timer = setTimeout(poll, 3000); return; }
    if (Date.now() >= pairing.expiresAt) { expire('O código expirou. Gere um novo código.'); return; }
    try {
      const result = await account.poll(pairing, signal);
      if (signal.aborted) return;
      if (result.status === 'approved') {
        stop(); message.textContent = 'Conectando à sua conta…';
        await account.exchange(pairing, signal);
        if (signal.aborted) return;
        qr.replaceChildren(); code.textContent = ''; countdown.textContent = ''; message.textContent = 'Conta conectada. Carregando seus addons…';
        try {
          const summary = await syncAccount(signal);
          if (signal.aborted) return;
          state.guestMode = false; persist(); stack = [];
          navigate(summary.failed ? { name: 'settings', category: 'account' } : { name: 'home' }, true); toast(syncSummary(summary));
        } catch (error) {
          if (signal.aborted) return;
          message.textContent = `Conta conectada. ${error.message}`;
          cancel.remove();
          const open = button('Abrir conta e tentar sincronizar', () => { stack = []; navigate({ name: 'settings', category: 'account' }, true); }, { class: 'primary' });
          pane.append(open); open.focus();
        }
      } else if (['expired', 'used', 'cancelled', 'denied'].includes(result.status)) {
        expire(result.status === 'expired' ? 'O código expirou. Gere um novo código.' : 'A vinculação foi encerrada. Gere um novo código para tentar novamente.');
      } else if (result.status === 'pending') timer = setTimeout(poll, result.interval * 1000);
      else expire('O serviço retornou um estado de vinculação inesperado. Gere outro código.');
    } catch (error) { if (!signal.aborted) expire(error.message); }
  }
  (async () => {
    try {
      pairing = await account.start(signal); if (signal.aborted) return;
      const matrix = qrcode(0, 'M'); matrix.addData(pairing.url); matrix.make();
      const modules = matrix.getModuleCount(), quiet = 4, px = 4;
      const canvas = el('canvas', { width: (modules + quiet * 2) * px, height: (modules + quiet * 2) * px, role: 'img', 'aria-label': 'QR code do Nuvio' });
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#000';
      for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (matrix.isDark(row, col)) ctx.fillRect((col + quiet) * px, (row + quiet) * px, px, px);
      qr.replaceChildren(canvas); code.textContent = pairing.userCode; message.textContent = 'Aguardando sua autorização no Nuvio…';
      const tick = () => { const left = Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000)); countdown.textContent = `Código válido por ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (!left) expire('O código expirou. Gere um novo código.'); };
      tick(); if (Date.now() < pairing.expiresAt) { ticker = setInterval(tick, 1000); timer = setTimeout(poll, pairing.interval * 1000); }
    } catch (error) { if (!signal.aborted) expire(error.message); }
  })();
}
function showSettings(main, signal) {
  const content = el('div', { class: 'settings-content' });
  const categories = [
    ['account', 'Conta', 'Conta e status de sincronização', 'profile'],
    ['profiles', 'Perfis', 'Gerenciar perfis de usuário', 'profile'],
    ['appearance', 'Aparência', 'Tema e personalização visual', 'appearance'],
    ['layout', 'Layout', 'Estrutura da página inicial e estilos de pôster', 'library'],
    ['discovery', 'Conteúdo e Descoberta', 'Add-ons, plugins, catálogos e fontes de descoberta', 'search'],
    ['integration', 'Integrações', '', 'link'],
    ['playback', 'Reprodução', 'Player, legendas e reprodução automática', 'play'],
    ['tracking', 'Rastreamento', '', 'sync'],
    ['about', 'Sobre', '', 'info'],
    ['advanced', 'Avançado', 'Desempenho, navegação, cache e diagnósticos', 'settings']
  ];
  function select(category) {
    route.category = category[0];
    main.querySelectorAll('.settings-tab').forEach(b => b.classList.toggle('selected', b.dataset.category === category[0]));
    content.replaceChildren(el('h1', {}, category[1]));
    if (category[2]) content.append(el('p', { class: 'muted settings-subtitle' }, category[2]));
    const row = (title, subtitle, action) => button([el('span', { class: 'grow' }, el('strong', {}, title), el('small', { class: 'muted' }, subtitle)), icon('next')], action, { class: 'settings-row' });
    switch (category[0]) {
      case 'account':
        if (account.user) {
          content.append(el('p', { class: 'account-email' }, account.user.email), el('p', { class: 'muted' }, 'Conta conectada · Addons do perfil principal'));
          const syncStatus = el('p', { class: 'account-sync-status', role: 'status' }, state.accountSync?.at ? syncSummary(state.accountSync) : 'Sincronize para carregar os addons da sua conta.');
          const sync = row('Sincronizar addons', 'Carregar os addons da conta nesta TV', async () => {
            if (sync.disabled) return; sync.disabled = true; syncStatus.textContent = 'Carregando addons da conta…';
            try { const result = await syncAccount(signal); if (!signal.aborted) syncStatus.textContent = syncSummary(result); }
            catch (error) { if (!signal.aborted) syncStatus.textContent = error.message; }
            finally { sync.disabled = false; }
          });
          const logout = row('Sair da conta', 'Desconectar somente esta TV', () => {
            const dialog = el('div', { class: 'account-confirm', role: 'dialog', 'aria-label': 'Sair da conta' }, el('h2', {}, 'Sair da conta?'), el('p', {}, 'Os addons importados da conta serão removidos desta TV. Seus outros dispositivos continuam conectados.'));
            const stay = button('Cancelar', () => { dialog.remove(); logout.focus(); });
            const leave = button('Sair desta TV', async () => {
              leave.disabled = true;
              const revoked = await account.signOut();
              detachAccountAddons(state); state.guestMode = true; persist(); metadataCache.clear(); stack = [];
              navigate({ name: 'settings', category: 'account' }, true);
              if (!revoked) toast('Login removido desta TV. Não foi possível confirmar a revogação no servidor; gerencie dispositivos na conta Nuvio.');
            }, { class: 'primary' });
            dialog.append(el('div', { class: 'toolbar' }, stay, leave)); main.append(dialog); stay.focus();
          });
          content.append(syncStatus, sync, logout);
        } else content.append(row('Entrar com Nuvio', 'Vincular a TV pelo celular e carregar seus addons', () => navigate({ name: 'account-login' })));
        break;
      case 'discovery':
        content.append(row('Addons', 'Gerenciar add-ons, ordem dos catálogos e coleções', () => navigate({ name: 'addons' })));
        break;
      case 'playback': case 'integration':
        content.append(row('Preferências de fontes', 'Filtros, grupos de release e reprodução automática', () => navigate({ name: 'preferences' })));
        break;
      case 'appearance':
        content.append(row('Tema', 'Branco', () => toast('Tema Branco do fork.')), row('Fonte', 'Inter', () => toast('Fonte Inter original incluída no aplicativo.')));
        break;
      case 'layout':
        content.append(el('p', { class: 'muted' }, 'Página inicial Modern'));
        for (const [key, title, description] of [
          ['modernSidebar', 'Barra lateral moderna', 'Ative a navegação lateral flutuante.'],
          ['hideSidebar', 'Recolher barra lateral', 'Esconda o menu; exiba-o apenas ao focar.'],
          ['sidebarBlur', 'Desfoque no menu lateral', 'Ative o efeito de desfoque no menu moderno.'],
          ['landscapePosters', 'Pôsteres Horizontais', 'Alterne os pôsteres para o formato horizontal.'],
          ['fullBackdrop', 'Fundo em tela cheia', 'Expanda o fundo do modo Moderno por toda a tela.'],
          ['posterLabels', 'Títulos nos pôsteres', 'Exiba os títulos abaixo das imagens e grades.'],
          ['catalogAddonName', 'Nome do addon', 'Exiba o nome do addon ao lado do catálogo.'],
          ['catalogType', 'Tipo de conteúdo', 'Indique se é Filme ou Série ao lado do subtítulo.'],
          ['continueWatching', 'Continuar Assistindo', 'Exiba os títulos que você começou a assistir nesta TV.'],
        ]) {
          const toggle = button([el('span', { class: 'grow' }, el('strong', {}, title), el('small', { class: 'muted' }, description)), el('span', { class: 'switch-track', 'aria-hidden': true })], () => {
            layout[key] = !layout[key]; persist(); applyLayout(); toggle.setAttribute('aria-checked', String(layout[key]));
          }, { class: 'settings-row', role: 'switch', 'aria-label': title, 'aria-checked': String(layout[key]) });
          content.append(toggle);
        }
        {
          const styles = { card: 'Cartão', poster: 'Pôster', wide: 'Amplo' };
          const value = el('small', { class: 'muted' }, styles[layout.continueStyle]);
          content.append(button([el('span', { class: 'grow' }, el('strong', {}, 'Estilo de Continuar Assistindo'), value), icon('next')], () => {
            const keys = Object.keys(styles); layout.continueStyle = keys[(keys.indexOf(layout.continueStyle) + 1) % keys.length];
            persist(); applyLayout(); value.textContent = styles[layout.continueStyle];
          }, { class: 'settings-row' }));
        }
        break;
      case 'advanced':
        content.append(row('Limpar cache', 'Limpar metadados carregados nesta sessão', () => { metadataCache.clear(); toast('Cache limpo.'); }));
        break;
      case 'about':
        content.append(el('img', { class: 'about-brand', src: 'assets/wordmark.png', alt: 'Nuvio' }), el('p', {}, 'Nuvio Fork · webOS 0.5.0'), el('p', { class: 'muted' }, 'Base: ysosrs123/NuvioTV-Fork · 45e0984'), el('p', { class: 'notice' }, 'Port em desenvolvimento. Login Nuvio, addons do perfil principal e opções de layout disponíveis. Outros perfis, plugins Android e debrid direto ainda estão em adaptação.'));
        break;
      default:
        content.append(el('p', { class: 'notice' }, 'Esta integração do fork ainda não está disponível no port para webOS.'));
    }
  }
  const rail = el('div', { class: 'settings-rail', 'aria-label': 'Categorias de ajustes' }, ...categories.map(c => button([icon(c[3]), el('span', {}, c[1])], () => select(c), { class: 'settings-tab', 'data-category': c[0] })));
  main.append(el('div', { class: 'settings-workspace' }, rail, content));
  select(categories.find(c => c[0] === route.category) || categories[0]);
}
function showPreferences(main) {
  heading(main, '', 'Reprodução', 'Preferências de fontes e compatibilidade com a LG.');
  const option = (title, description, checked, change) => {
    const input = el('input', { type: 'checkbox', checked, onchange: e => { change(e.target.checked); persist(); } });
    return el('label', { class: 'setting' }, el('span', { class: 'grow' }, el('strong', {}, title), el('small', { class: 'muted' }, description)), input);
  };
  main.append(option('Evitar fontes anunciadas como somente Dolby Vision', 'Perfil LG UT8050: HDR10 e HLG. A classificação usa as informações fornecidas pelo add-on.', state.settings.avoidDvOnly, v => state.settings.avoidDvOnly = v), option('Reproduzir automaticamente a melhor fonte', 'Usa a ordem de qualidade e a regra de fallback do fork entre fontes elegíveis.', state.settings.autoPlay, v => state.settings.autoPlay = v));
  main.append(el('h2', { class: 'section-title' }, 'Filtros e ordem de qualidade'));
  const fields = [['excludedReleaseGroups', 'Grupos excluídos'], ['preferredReleaseGroups', 'Ordem dos grupos preferidos']];
  for (const [key, label] of fields) {
    const area = el('textarea', { 'aria-label': label, rows: 3, spellcheck: 'false' }, (state.settings.preferences[key] ?? defaults[key]).join(', '));
    main.append(el('label', { class: 'field' }, label, area), button('Salvar ' + label.toLowerCase(), () => { state.settings.preferences[key] = area.value.split(',').map(x => x.trim()).filter(Boolean); persist(); toast('Preferência salva.'); }));
  }
  for (const [key, label, enumKey] of [['excludedEncodes', 'Codecs excluídos', 'DebridStreamEncode'], ['excludedQualities', 'Qualidades excluídas', 'DebridStreamQuality']]) {
    const options = el('fieldset', { class: 'chips' }, el('legend', {}, label));
    for (const entry of enums[enumKey].entries) options.append(el('label', {}, el('input', { type: 'checkbox', checked: (state.settings.preferences[key] ?? defaults[key]).includes(entry.id), onchange: e => { const list = new Set(state.settings.preferences[key] ?? defaults[key]); e.target.checked ? list.add(entry.id) : list.delete(entry.id); state.settings.preferences[key] = [...list]; persist(); } }), entry.label));
    main.append(options);
  }
  const max = el('input', { type: 'number', min: 0, max: 100, value: state.settings.preferences.maxResults ?? defaults.maxResults, 'aria-label': 'Máximo de fontes', onchange: e => { state.settings.preferences.maxResults = Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))); persist(); } });
  main.append(el('label', { class: 'setting' }, el('span', {}, 'Máximo de fontes filtradas (0 = sem limite)'), max), button('Restaurar preferências do fork', () => { state.settings.preferences = {}; persist(); render(); toast('Preferências originais restauradas.'); }));
  main.append(el('h2', { class: 'section-title' }, 'Sobre esta prévia'), el('p', { class: 'notice' }, 'Base: ysosrs123/NuvioTV-Fork · 45e0984. Interface em 1080p; vídeo em resolução original. Downloads paralelos, debrid direto, torrents, sincronização de contas e áudio avançado ainda estão em adaptação.'));
}
function clock(value) { const s = Math.max(0, Math.floor(value || 0)); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function bytes(n) { return Number.isFinite(n) && n > 0 ? `${(n / 1024 ** 3).toFixed(2)} GB` : ''; }
function showPlayer(context) {
  root.replaceChildren();
  const video = el('video', { autoplay: true, playsinline: true, preload: 'metadata' });
  const title = context.episode ? `${context.meta.name} · T${context.episode.season} E${context.episode.episode}` : context.meta.name;
  const status = el('p', { class: 'player-status', role: 'status' }, 'Abrindo vídeo…');
  const timeline = el('input', { type: 'range', class: 'player-timeline', min: 0, max: 1, value: 0, step: 5, disabled: true, 'aria-label': 'Posição do vídeo', onchange: e => seekTo(Number(e.target.value)) });
  const time = el('span', { class: 'player-time' }, '00:00');
  const stats = el('pre', { class: 'stats', hidden: true });
  const pause = button('Pausar', toggle);
  const controls = el('div', { class: 'player-controls' }, el('div', { class: 'section-head' }, el('h1', {}, title), time), timeline, el('div', { class: 'toolbar' }, button('Voltar às fontes', back), button('−30 s', () => seek(-30)), pause, button('+30 s', () => seek(30)), button('Áudio', () => tracks.openAudio()), button('Legendas', () => tracks.openSubtitles()), button('Diagnóstico', () => { stats.hidden = !stats.hidden; updateStats(); })));
  const screen = el('div', { class: 'player-screen controls-visible' }, video, status, stats, controls); root.append(screen);
  let disposed = false, hideTimer, savedAt = 0, resumeApplied = false;
  const listeners = [];
  const on = (event, fn) => { video.addEventListener(event, fn); listeners.push([event, fn]); };
  const resume = state.progress[progressKey(context.type, context.id)];
  const tracks = installTrackControls({ screen, video, context, addons: state.addons, settings: state.settings, persist, el, button,
    onOpen: () => { clearTimeout(hideTimer); controls.classList.add('faded'); screen.classList.remove('controls-visible'); }, onClose: reveal });
  function save() { recordProgress(state, { ...context, time: video.currentTime, duration: video.duration }); persist(); }
  function reveal() { if (tracks.isOpen()) { clearTimeout(hideTimer); controls.classList.add('faded'); screen.classList.remove('controls-visible'); return; } controls.classList.remove('faded'); screen.classList.add('controls-visible'); clearTimeout(hideTimer); if (!video.paused && !tracks.isOpen()) hideTimer = setTimeout(() => { controls.classList.add('faded'); screen.classList.remove('controls-visible'); }, 4500); }
  function seekTo(target) { if (Number.isFinite(target) && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.max(0, Math.min(video.duration - 0.1, target)); reveal(); }
  function seek(delta) { seekTo(video.currentTime + delta); }
  async function play() { try { await video.play(); } catch { if (!disposed) { status.hidden = false; status.textContent = 'Pressione Reproduzir para iniciar.'; pause.textContent = 'Reproduzir'; } } }
  function toggle() { video.paused ? play() : video.pause(); reveal(); }
  function updateStats() {
    if (stats.hidden) return;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) buffered = video.buffered.end(i) - video.currentTime;
    const q = video.getVideoPlaybackQuality?.();
    stats.textContent = `Resolução decodificada: ${video.videoWidth || '—'} × ${video.videoHeight || '—'}\nBuffer disponível: ${buffered.toFixed(1)} s\nFrames perdidos: ${q?.droppedVideoFrames ?? 'indisponível'}\nFonte: ${context.stream.addonName || 'direta'}\nHDR e saída de áudio: não medidos\nTransporte: player nativo / HTTP(S)`;
  }
  on('loadedmetadata', () => { timeline.disabled = !Number.isFinite(video.duration) || video.duration <= 0; timeline.max = timeline.disabled ? 1 : video.duration; if (!resumeApplied && resume && !resume.complete && resume.time < video.duration - 10) { video.currentTime = resume.time; toast(`Retomando em ${clock(resume.time)}.`); } resumeApplied = true; });
  on('playing', () => { status.hidden = true; pause.textContent = 'Pausar'; reveal(); });
  on('waiting', () => { status.hidden = false; status.textContent = 'Carregando vídeo…'; });
  on('pause', () => { pause.textContent = 'Reproduzir'; reveal(); save(); });
  on('timeupdate', () => { timeline.disabled = !Number.isFinite(video.duration) || video.duration <= 0; timeline.max = Number.isFinite(video.duration) ? video.duration : 1; timeline.value = video.currentTime; timeline.setAttribute('aria-valuetext', clock(video.currentTime)); time.textContent = `${clock(video.currentTime)} / ${Number.isFinite(video.duration) ? clock(video.duration) : 'Ao vivo'}`; updateStats(); if (Date.now() - savedAt > 10000) { save(); savedAt = Date.now(); } });
  on('ended', () => { save(); status.hidden = false; status.textContent = 'Reprodução concluída.'; reveal(); });
  on('error', () => { status.hidden = false; status.textContent = 'Não foi possível reproduzir esta fonte. O link pode ter expirado ou o formato não ser compatível. Volte e escolha outra fonte.'; controls.classList.remove('faded'); clearTimeout(hideTimer); });
  const visibility = () => { if (document.hidden) { video.pause(); save(); } };
  document.addEventListener('visibilitychange', visibility);
  screen.addEventListener('mousemove', reveal); screen.addEventListener('focusin', reveal);
  const issue = playbackIssue(context.stream, state.settings.avoidDvOnly);
  if (issue) status.textContent = issue;
  else { video.src = context.stream.url; play(); }
  player = { key(key, e) {
    if (tracks.isOpen()) return false;
    if (['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', ' '].includes(key)) {
      e.preventDefault(); if (key === 'MediaPlay') play(); else if (key === 'MediaPause') video.pause(); else if (key === 'MediaStop') back(); else if (key === 'MediaRewind') seek(-30); else if (key === 'MediaFastForward') seek(30); else toggle(); return true;
    }
    if (controls.classList.contains('faded') && ['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) { e.preventDefault(); reveal(); pause.focus(); return true; }
    if (document.activeElement === timeline && ['ArrowLeft', 'ArrowRight'].includes(key)) { e.preventDefault(); seek(key === 'ArrowLeft' ? -10 : 10); return true; }
    reveal(); return false;
  } };
  cleanupPlayer = () => { disposed = true; save(); tracks.dispose(); for (const [event, fn] of listeners) video.removeEventListener(event, fn); video.pause(); video.removeAttribute('src'); video.load(); clearTimeout(hideTimer); document.removeEventListener('visibilitychange', visibility); };
  pause.focus();
}
function layoutKey(key, event) {
  const active = document.activeElement;
  if (root.querySelector('[role=dialog]')) {
    if (active?.classList.contains('dialog-copy') && ['ArrowUp', 'ArrowDown'].includes(key)) {
      const direction = key === 'ArrowUp' ? -1 : 1;
      if (direction < 0 ? active.scrollTop > 0 : active.scrollTop + active.clientHeight < active.scrollHeight - 1) {
        active.scrollTop += direction * 72; event.preventDefault(); return true;
      }
    }
    return false;
  }
  if (drawerOpen) {
    if (key === 'ArrowRight') { event.preventDefault(); setDrawer(false); return true; }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault(); const buttons = [...root.querySelectorAll('.nav-item')];
      const next = buttons[Math.max(0, Math.min(buttons.length - 1, buttons.indexOf(active) + (key === 'ArrowDown' ? 1 : -1)))]; next?.focus(); return true;
    }
    if (key === 'ArrowLeft') { event.preventDefault(); return true; }
  }
  const card = active?.closest('.home-rows .card');
  if (card && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    const cards = [...card.parentElement.querySelectorAll('.card')]; const index = cards.indexOf(card);
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const next = cards[index + (key === 'ArrowLeft' ? -1 : 1)];
      if (next) next.focus({ preventScroll: true }); else if (key === 'ArrowLeft') setDrawer(true);
    } else {
      const section = card.closest('.catalog-section');
      const sections = [...section.parentElement.querySelectorAll('.catalog-section')];
      const target = sections[sections.indexOf(section) + (key === 'ArrowDown' ? 1 : -1)];
      const nextCards = [...(target?.querySelectorAll('.card') || [])];
      const remembered = target?.dataset.lastFocus && nextCards.find(c => c.dataset.focus === target.dataset.lastFocus);
      (remembered || nextCards[Math.min(index, nextCards.length - 1)])?.focus({ preventScroll: true });
      if (key === 'ArrowUp') revealPill();
      else root.querySelector('.sidebar-pill')?.classList.add('icon-only');
    }
    event.preventDefault(); return true;
  }
  if (key === 'ArrowLeft' && root.querySelector('.sidebar') && !/INPUT|TEXTAREA|SELECT/.test(active?.tagName)) {
    if (active?.tagName === 'MAIN' || active?.closest('.settings-rail') || !root.querySelector('main button,main input')) { event.preventDefault(); setDrawer(true); return true; }
  }
  return false;
}
installRemote({ root, back, playerKey: (key, event) => (player?.key(key, event) ?? false) || layoutKey(key, event), boundaryLeft: () => setDrawer(true) });
window.addEventListener('pagehide', () => cleanupPlayer?.());
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(heroTimer); heroRequest?.abort(); } });
async function boot() {
  if (account.hasSession) {
    const controller = new AbortController();
    try { await account.restore(controller.signal); }
    catch (error) {
      if (!account.hasSession) { detachAccountAddons(state); persist(); }
      toast(error.message);
    }
  }
  if (!account.hasSession && !state.guestMode && !state.addons.length) route = { name: 'welcome' };
  await render();
}
boot();
