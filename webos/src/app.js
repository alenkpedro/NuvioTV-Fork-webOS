// SPDX-License-Identifier: GPL-3.0-only
import { loadAddon, getJSON, resourceURL, supports, normalCatalogs, extraOptions, mapLimit } from './core/addons.js';
import { defaults, enums, rankStreams, filterAndSort, factsFor, playbackIssue, sizeBytes } from './core/ranking.js';
import { readState, saveState, progressKey, recordProgress } from './core/storage.js';
import { installRemote } from './remote.js';
import { createAccountClient } from './core/account.js';
import { importAccountAddons, detachAccountAddons } from './core/account-sync.js';
import qrcode from 'qrcode-generator';
import searchIcon from '../public/assets/icons/sidebar_search.svg';
import libraryIcon from '../public/assets/icons/sidebar_library.svg';
import settingsIcon from '../public/assets/icons/sidebar_settings.svg';
import './style.css';

const root = document.querySelector('#app');
const state = readState(localStorage);
const account = createAccountClient({ storage: localStorage });
// Do not display another account's imported add-ons after local session loss.
state.addons = state.addons.filter(a => !a.accountOwner || a.accountOwner === account.user?.id);
if (state.accountSync?.userId !== account.user?.id) delete state.accountSync;
let route = { name: 'home' }, stack = [], request = null, player = null, cleanupPlayer = null;
let toastTimer, persistWarning = false, heroTimer, drawerOpen = false, contentFocus = null;
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
function focusFirst() { requestAnimationFrame(() => { if (!drawerOpen) (root.querySelector('main [data-initial-focus]') || root.querySelector('main input, main button:not(:disabled)') || root.querySelector('main'))?.focus({ preventScroll: true }); }); }
function navigate(next, replace = false) {
  if (!replace) stack.push({ route, focus: document.activeElement?.dataset.focus });
  route = next; render();
}
function back() {
  const dialog = root.querySelector('.account-confirm');
  if (dialog) { dialog.querySelector('button')?.click(); return; }
  if (root.querySelector('.sidebar') && !stack.length) {
    if (!drawerOpen) { setDrawer(true); return; }
    if (window.webOSSystem?.platformBack) window.webOSSystem.platformBack();
    else if (window.PalmSystem?.platformBack) window.PalmSystem.platformBack();
    else { setDrawer(false); toast('Você está no início.'); }
    return;
  }
  if (stack.length) {
    const prior = stack.pop(); route = prior.route;
    render().then(() => { if (prior.focus) [...root.querySelectorAll('[data-focus]')].find(e => e.dataset.focus === prior.focus)?.focus(); });
  } else if (route.name !== 'home') navigate({ name: 'home' }, true);
  else if (window.webOSSystem?.platformBack) window.webOSSystem.platformBack();
  else if (window.PalmSystem?.platformBack) window.PalmSystem.platformBack();
  else toast('Você está no início.');
}
function setDrawer(open) {
  const nav = root.querySelector('.sidebar'); if (!nav) return;
  if (open && !drawerOpen && !nav.contains(document.activeElement)) contentFocus = document.activeElement;
  drawerOpen = open; root.classList.toggle('drawer-open', open);
  nav.querySelectorAll('button').forEach(b => b.tabIndex = open ? 0 : -1);
  if (open) (nav.querySelector('.active') || nav.querySelector('button'))?.focus({ preventScroll: true });
  else if (contentFocus?.isConnected) contentFocus.focus({ preventScroll: true });
  else focusFirst();
}
function shell(active = '') {
  root.replaceChildren(); root.classList.remove('drawer-open'); drawerOpen = false;
  const hasSidebar = ['home', 'search', 'library', 'settings'].includes(active);
  if (hasSidebar) {
    const nav = el('nav', { 'aria-label': 'Navegação principal', class: 'sidebar' },
      el('img', { class: 'brand', src: 'assets/wordmark.png', alt: 'Nuvio' }),
      el('div', { class: 'nav-items' }, ...[['home', 'Início'], ['search', 'Busca'], ['library', 'Biblioteca'], ['settings', 'Ajustes']].map(([name, title]) => button([icon(name), el('span', { class: 'nav-label' }, title)], () => {
        if (!drawerOpen) { setDrawer(true); return; }
        stack = []; navigate({ name }, true);
      }, { class: active === name ? 'nav-item active' : 'nav-item', 'aria-label': title, tabindex: -1, 'aria-current': active === name ? 'page' : null, 'data-focus': `nav-${name}` }))));
    root.append(el('div', { class: 'drawer-scrim', onclick: () => setDrawer(false), 'aria-hidden': true }), nav);
  }
  const main = el('main', { class: `screen-${active}${hasSidebar ? ' with-sidebar' : ''}`, tabindex: -1 }); root.append(main); return main;
}
function heading(main, kicker, title, subtitle) { main.append(el('div', { class: 'heading' }, el('h1', {}, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null)); }
function notice(main, message) { main.append(el('p', { class: 'notice', role: 'status' }, message)); }
function failure(main, error, retry) { main.append(el('div', { class: 'empty' }, el('h2', {}, 'Não foi possível carregar'), el('p', {}, error.message), button('Tentar novamente', retry))); }
const current = signal => !signal.aborted;
async function render() {
  clearTimeout(heroTimer); request?.abort(); request = new AbortController(); const signal = request.signal;
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
function card(meta, addon, progress) {
  const id = text(meta.id), type = text(meta.type || 'movie');
  const node = button([poster(meta.poster, meta.name), el('strong', {}, meta.name || id), el('span', { class: 'muted' }, progress ? `Retomar em ${clock(progress.time)}` : meta.releaseInfo || '')], () => navigate(progress ? { name: 'streams', meta: { ...meta, type }, addon, type: progress.type, id: progress.id, episode: progress.episode } : { name: 'detail', meta: { ...meta, type }, addon }), { class: 'card', 'aria-label': meta.name || id, 'data-focus': `card-${type}-${progress?.id || id}` });
  node.addEventListener('focus', () => {
    const section = node.closest('.home-rows .catalog-section');
    if (section) {
      const viewport = section.parentElement;
      viewport.scrollTop = Math.max(0, section.offsetTop - 40);
      node.parentElement.scrollLeft = Math.max(0, node.offsetLeft - 52);
      clearTimeout(heroTimer);
      heroTimer = setTimeout(() => { if (route.name === 'home') updateHomeHero(meta); }, 450);
    }
  });
  if (progress) node.querySelector('.art').append(el('progress', { max: progress.duration, value: progress.time, 'aria-label': 'Progresso assistido' }));
  return node;
}
function catalogSection(main, title, metas, addon, more) {
  const section = el('section', { class: 'catalog-section' }, el('div', { class: 'section-head' }, el('h2', {}, title)), el('div', { class: 'rail' }, metas.slice(0, 16).map(m => card(m, addon))));
  if (more) section.querySelector('.rail').append(button([icon('next'), el('strong', {}, 'Ver todos')], more, { class: 'card more-card', 'aria-label': `Ver todos: ${title}` }));
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
function metaLine(meta) {
  return el('div', { class: 'hero-meta' },
    el('span', {}, [meta.type === 'series' ? 'Série' : 'Filme', meta.genres?.[0]].filter(Boolean).join(' • ')),
    ...[meta.runtime, meta.releaseInfo].filter(Boolean).map(value => el('span', { class: 'meta-divider' }, value)),
    meta.imdbRating ? el('span', { class: 'imdb-rating' }, el('b', {}, 'IMDb'), text(meta.imdbRating)) : null);
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
  const recent = Object.values(state.progress).filter(x => !x.complete).sort((a, b) => b.updated - a.updated).slice(0, 12);
  if (!catalogs.length && !recent.length) {
    main.append(el('p', { class: 'home-empty', role: 'status' }, 'Nenhum addon de catálogo instalado. Instale um para ver conteúdos.')); return;
  }
  main.append(el('section', { class: 'home-hero', 'aria-label': 'Título em destaque' }, el('div', { class: 'hero-fade' }), el('div', { class: 'hero-copy' })));
  const rows = el('div', { class: 'home-rows' }); main.append(rows);
  if (recent.length) {
    rows.append(el('section', { class: 'catalog-section' }, el('div', { class: 'section-head' }, el('h2', {}, 'Continuar assistindo')), el('div', { class: 'rail' }, recent.map(p => card(p.meta, null, p)))));
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
      catalogSection(rows, r.value.catalog.name || r.value.catalog.id, r.value.metas, r.value.addon, () => navigate({ name: 'catalog', addon: r.value.addon, catalog: r.value.catalog }));
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
async function showDetail(main, signal) {
  let { meta, addon } = route;
  heading(main, meta.type === 'series' ? 'SÉRIE' : 'FILME', meta.name || meta.id);
  const providers = [...new Set([addon, ...state.addons].filter(Boolean))].filter(a => supports(a, 'meta', meta.type, meta.id));
  for (const a of providers) {
    try { const r = await cachedMetaJSON(resourceURL(a, 'meta', meta.type, meta.id), signal); if (r.meta?.id) { meta = { ...meta, ...r.meta }; addon = a; break; } }
    catch (e) { if (!current(signal)) return; }
  }
  if (!current(signal)) return;
  main.replaceChildren();
  const backdrop = safeImage(meta.background || meta.fanart);
  if (backdrop) main.append(el('img', { class: 'detail-backdrop', src: backdrop, alt: '', decoding: 'async' }));
  main.append(el('div', { class: 'detail-fade' }));
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
  const watch = button([icon('play'), meta.type === 'series' ? 'Assistir: T1:E1' : 'Assistir'], () => {
    if (meta.type === 'series') main.querySelector('.episode')?.click(); else go();
  }, { class: 'primary play-button', 'data-initial-focus': true });
  const watched = button(icon(state.watched[key] ? 'check' : 'eye'), () => {
    state.watched[key] = !state.watched[key]; persist();
    watched.replaceChildren(icon(state.watched[key] ? 'check' : 'eye'));
    watched.setAttribute('aria-label', state.watched[key] ? 'Marcar como não assistido' : 'Marcar como assistido');
  }, { class: 'round-button', 'aria-label': state.watched[key] ? 'Marcar como não assistido' : 'Marcar como assistido' });
  const detail = el('section', { class: 'detail-hero' }, titleArt(meta, 'detail-title'),
    el('div', { class: 'detail-actions toolbar' }, watch, toggleLibrary, meta.type === 'movie' ? watched : null),
    el('div', { class: 'detail-credit muted' }, meta.director ? `Direção: ${[].concat(meta.director).join(', ')}` : ''),
    el('div', { class: 'detail-source-space' }),
    el('p', { class: 'synopsis' }, meta.description || ''), metaLine(meta));
  main.append(detail);
  if (meta.type === 'series') {
    const videos = (meta.videos ?? []).filter(v => v.id).sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    if (!videos.length) { notice(main, 'Nenhum episódio foi retornado pelo catálogo.'); return; }
    watch.replaceChildren(icon('play'), `Assistir: T${videos[0].season ?? 0}:E${videos[0].episode ?? 1}`);
    const seasons = [...new Set(videos.map(v => v.season ?? 0))];
    const list = el('div', { class: 'episodes' });
    const draw = season => {
      list.replaceChildren(...videos.filter(v => (v.season ?? 0) === Number(season)).slice(0, 150).map(v => {
        const p = state.progress[progressKey(meta.type, v.id)];
        return button([el('span', { class: 'episode-number' }, String(v.episode ?? '•').padStart(2, '0')), el('span', { class: 'grow' }, el('strong', {}, v.title || `Episódio ${v.episode}`), el('small', { class: 'muted' }, p ? p.complete ? 'Assistido' : `Retomar em ${clock(p.time)}` : v.released ? text(v.released).slice(0, 10) : '')), el('span', {}, '→')], () => go(v.id, { title: v.title, season: v.season, episode: v.episode }), { class: 'episode', 'data-focus': `episode-${v.id}` });
      }));
    };
    const select = el('select', { 'aria-label': 'Temporada', onchange: e => draw(e.target.value) }, seasons.map(s => el('option', { value: s }, s === 0 ? 'Especiais' : `Temporada ${s}`)));
    main.append(el('div', { class: 'section-head' }, el('h2', {}, 'Episódios'), select), list); draw(seasons[0]);
  }
}
async function showStreams(main, signal) {
  const context = { ...route };
  const backdrop = safeImage(context.meta.background);
  if (backdrop) main.append(el('img', { class: 'stream-backdrop', src: backdrop, alt: '' }));
  main.append(el('div', { class: 'stream-fade' }));
  const identity = el('aside', { class: 'stream-identity' }, el('div', {}, titleArt(context.meta, 'stream-title'),
    el('p', { class: 'muted' }, context.episode ? `Temporada ${context.episode.season} · Episódio ${context.episode.episode}` : [context.meta.genres?.join(', '), context.meta.releaseInfo].filter(Boolean).join(' • ')),
    context.episode?.title ? el('p', {}, context.episode.title) : null));
  const pane = el('div', { class: 'stream-pane' }); main.append(identity, pane); main = pane;
  const loading = el('p', { class: 'loading' }, 'Buscando fontes nos seus add-ons…'); main.append(loading);
  const providers = state.addons.filter(a => supports(a, 'stream', context.type, context.id));
  const responses = await mapLimit(providers, async addon => {
    const result = await getJSON(resourceURL(addon, 'stream', context.type, context.id), { signal });
    return (Array.isArray(result.streams) ? result.streams : []).slice(0, 300).map(s => ({ ...s, addonName: addon.manifest.name }));
  }, signal);
  if (!current(signal)) return; loading.remove();
  const all = responses.flatMap(r => r.value ?? []);
  for (let i = 0; i < responses.length; i++) if (responses[i].error) notice(main, `${providers[i].manifest.name}: ${responses[i].error.message}`);
  if (!all.length) { notice(main, providers.length ? 'Nenhuma fonte encontrada para este título.' : 'Nenhum add-on instalado fornece fontes para este título.'); return; }
  const playable = all.filter(s => !playbackIssue(s, state.settings.avoidDvOnly));
  const ordered = rankStreams(playable, state.settings.preferences);
  if (state.settings.autoPlay && ordered.length) { navigate({ ...context, name: 'player', stream: ordered[0] }, true); return; }
  let showAll = false, selectedAddon = null;
  const list = el('div', { class: 'streams' });
  const display = () => {
    // Manual list uses strict filters. Auto-pick retains the original exclusion fallback.
    const visible = showAll ? [...rankStreams(all, { ...state.settings.preferences, excludedResolutions: [], excludedQualities: [], excludedVisualTags: [], excludedAudioTags: [], excludedAudioChannels: [], excludedEncodes: [], excludedLanguages: [], excludedReleaseGroups: [] })] : filterAndSort(all, state.settings.preferences);
    list.replaceChildren();
    if (!visible.length) notice(list, 'Nenhuma fonte passou pelos filtros. Use “Mostrar todas” para revisar.');
    for (const s of visible.filter(s => !selectedAddon || s.addonName === selectedAddon).slice(0, 100)) {
      const f = factsFor(s, state.settings.preferences), issue = playbackIssue(s, state.settings.avoidDvOnly);
      const info = [labels[f.resolution], labels[f.quality], f.releaseGroup, bytes(sizeBytes(s))].filter(Boolean).join(' · ');
      list.append(button([el('div', { class: 'source-top' }, el('span', { class: 'source-addon' }, s.addonName), el('span', { class: 'source-quality' }, labels[f.resolution])), el('strong', {}, s.name || s.title || 'Fonte'), el('p', {}, s.description || s.title || info), el('small', { class: issue ? 'warning' : 'muted' }, issue || info)], () => issue ? toast(issue) : navigate({ ...context, name: 'player', stream: s }), { class: `source ${issue ? 'unavailable' : ''}`, 'aria-disabled': issue ? 'true' : null, 'data-initial-focus': !list.childElementCount }));
    }
  };
  const toggle = button('Mostrar todas', () => { showAll = !showAll; toggle.textContent = showAll ? 'Aplicar filtros do fork' : 'Mostrar todas'; display(); });
  const chips = el('div', { class: 'stream-chips' });
  for (const name of [null, ...new Set(all.map(s => s.addonName))]) chips.append(button(name || 'Todos', () => {
    selectedAddon = name; [...chips.children].forEach(b => b.classList.toggle('selected', b.textContent === (name || 'Todos'))); display();
  }, { class: name === null ? 'selected' : '' }));
  const actions = el('div', { class: 'stream-actions' }, button('Reproduzir melhor fonte', () => ordered.length ? navigate({ ...context, name: 'player', stream: ordered[0] }) : toast('Não há fonte HTTP(S) elegível nesta prévia.')), toggle);
  main.append(chips, list, actions); display();
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
        content.append(row('Menu lateral', 'Clássico', () => toast('Layout padrão do fork de referência.')), row('Pôsteres', 'Retrato', () => toast('Proporção e espaçamento do fork de referência.')));
        break;
      case 'advanced':
        content.append(row('Limpar cache', 'Limpar metadados carregados nesta sessão', () => { metadataCache.clear(); toast('Cache limpo.'); }));
        break;
      case 'about':
        content.append(el('img', { class: 'about-brand', src: 'assets/wordmark.png', alt: 'Nuvio' }), el('p', {}, 'Nuvio Fork · webOS 0.3.0'), el('p', { class: 'muted' }, 'Base: ysosrs123/NuvioTV-Fork · 45e0984'), el('p', { class: 'notice' }, 'Port em desenvolvimento. Login Nuvio e importação de addons do perfil principal disponíveis. Outros perfis, plugins Android e debrid direto ainda estão em adaptação.'));
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
  const timeline = el('progress', { max: 1, value: 0, 'aria-label': 'Progresso do vídeo' });
  const time = el('span', { class: 'player-time' }, '00:00');
  const stats = el('pre', { class: 'stats', hidden: true });
  const pause = button('Pausar', toggle);
  const controls = el('div', { class: 'player-controls' }, el('div', { class: 'section-head' }, el('h1', {}, title), time), timeline, el('div', { class: 'toolbar' }, button('Voltar às fontes', back), button('−30 s', () => seek(-30)), pause, button('+30 s', () => seek(30)), button('Legendas', cycleSubtitle), button('Diagnóstico', () => { stats.hidden = !stats.hidden; updateStats(); })));
  const screen = el('div', { class: 'player-screen' }, video, status, stats, controls); root.append(screen);
  let disposed = false, hideTimer, savedAt = 0, resumeApplied = false, subtitleIndex = -1;
  const listeners = [];
  const on = (event, fn) => { video.addEventListener(event, fn); listeners.push([event, fn]); };
  const resume = state.progress[progressKey(context.type, context.id)];
  const subtitles = (context.stream.subtitles ?? []).filter(s => safeImage(s.url) && (/\.vtt(?:[?#]|$)/i.test(s.url) || s.format === 'vtt')).slice(0, 20);
  for (const [index, s] of subtitles.entries()) video.append(el('track', { kind: 'subtitles', src: s.url, srclang: s.lang || 'und', label: s.lang || `Legenda ${index + 1}` }));
  function save() { recordProgress(state, { ...context, time: video.currentTime, duration: video.duration }); persist(); }
  function reveal() { controls.classList.remove('faded'); clearTimeout(hideTimer); if (!video.paused) hideTimer = setTimeout(() => controls.classList.add('faded'), 4500); }
  function seek(delta) { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration - 0.1, video.currentTime + delta)); reveal(); }
  async function play() { try { await video.play(); } catch { if (!disposed) { status.hidden = false; status.textContent = 'Pressione Reproduzir para iniciar.'; pause.textContent = 'Reproduzir'; } } }
  function toggle() { video.paused ? play() : video.pause(); reveal(); }
  function cycleSubtitle() {
    const tracks = video.textTracks; subtitleIndex = tracks.length ? (subtitleIndex + 2) % (tracks.length + 1) - 1 : -1;
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = i === subtitleIndex ? 'showing' : 'disabled';
    toast(tracks.length ? subtitleIndex < 0 ? 'Legendas desativadas.' : `Legenda: ${tracks[subtitleIndex].label || tracks[subtitleIndex].language}` : 'Esta fonte não forneceu legendas WebVTT.'); reveal();
  }
  function updateStats() {
    if (stats.hidden) return;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) buffered = video.buffered.end(i) - video.currentTime;
    const q = video.getVideoPlaybackQuality?.();
    stats.textContent = `Resolução decodificada: ${video.videoWidth || '—'} × ${video.videoHeight || '—'}\nBuffer disponível: ${buffered.toFixed(1)} s\nFrames perdidos: ${q?.droppedVideoFrames ?? 'indisponível'}\nFonte: ${context.stream.addonName || 'direta'}\nHDR e saída de áudio: não medidos\nTransporte: player nativo / HTTP(S)`;
  }
  on('loadedmetadata', () => { if (!resumeApplied && resume && !resume.complete && resume.time < video.duration - 10) { video.currentTime = resume.time; toast(`Retomando em ${clock(resume.time)}.`); } resumeApplied = true; });
  on('playing', () => { status.hidden = true; pause.textContent = 'Pausar'; reveal(); });
  on('waiting', () => { status.hidden = false; status.textContent = 'Carregando vídeo…'; });
  on('pause', () => { pause.textContent = 'Reproduzir'; reveal(); save(); });
  on('timeupdate', () => { timeline.max = Number.isFinite(video.duration) ? video.duration : 1; timeline.value = video.currentTime; time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`; updateStats(); if (Date.now() - savedAt > 10000) { save(); savedAt = Date.now(); } });
  on('ended', () => { save(); status.hidden = false; status.textContent = 'Reprodução concluída.'; reveal(); });
  on('error', () => { status.hidden = false; status.textContent = 'Não foi possível reproduzir esta fonte. O link pode ter expirado ou o formato não ser compatível. Volte e escolha outra fonte.'; controls.classList.remove('faded'); clearTimeout(hideTimer); });
  const visibility = () => { if (document.hidden) { video.pause(); save(); } };
  document.addEventListener('visibilitychange', visibility);
  screen.addEventListener('mousemove', reveal); screen.addEventListener('focusin', reveal);
  const issue = playbackIssue(context.stream, state.settings.avoidDvOnly);
  if (issue) status.textContent = issue;
  else { video.src = context.stream.url; play(); }
  player = { key(key, e) {
    if (['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', ' '].includes(key)) {
      e.preventDefault(); if (key === 'MediaPlay') play(); else if (key === 'MediaPause') video.pause(); else if (key === 'MediaStop') back(); else if (key === 'MediaRewind') seek(-30); else if (key === 'MediaFastForward') seek(30); else toggle(); return true;
    }
    if (controls.classList.contains('faded') && ['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) { e.preventDefault(); reveal(); pause.focus(); return true; }
    reveal(); return false;
  } };
  cleanupPlayer = () => { disposed = true; save(); for (const [event, fn] of listeners) video.removeEventListener(event, fn); video.pause(); video.removeAttribute('src'); video.load(); clearTimeout(hideTimer); document.removeEventListener('visibilitychange', visibility); };
  pause.focus();
}
function layoutKey(key, event) {
  const active = document.activeElement;
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
      nextCards[Math.min(index, nextCards.length - 1)]?.focus({ preventScroll: true });
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
