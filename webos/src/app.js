// SPDX-License-Identifier: GPL-3.0-only
import { loadAddon, getJSON, resourceURL, supports, normalCatalogs, extraOptions, mapLimit } from './core/addons.js';
import { defaults, enums, rankStreams, filterAndSort, factsFor, playbackIssue, sizeBytes } from './core/ranking.js';
import { readState, saveState, progressKey, recordProgress } from './core/storage.js';
import { installRemote } from './remote.js';
import './style.css';

const root = document.querySelector('#app');
const state = readState(localStorage);
let route = { name: 'home' }, stack = [], request = null, player = null, cleanupPlayer = null;
let toastTimer, persistWarning = false;
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
function focusFirst() { requestAnimationFrame(() => root.querySelector('main button:not(:disabled), main input, button')?.focus({ preventScroll: true })); }
function navigate(next, replace = false) {
  if (!replace) stack.push({ route, focus: document.activeElement?.dataset.focus });
  route = next; render();
}
function back() {
  if (stack.length) {
    const prior = stack.pop(); route = prior.route;
    render().then(() => { if (prior.focus) [...root.querySelectorAll('[data-focus]')].find(e => e.dataset.focus === prior.focus)?.focus(); });
  } else if (route.name !== 'home') navigate({ name: 'home' }, true);
  else if (window.webOSSystem?.platformBack) window.webOSSystem.platformBack();
  else if (window.PalmSystem?.platformBack) window.PalmSystem.platformBack();
  else toast('Você está no início.');
}
function shell(active = '') {
  root.replaceChildren();
  const nav = el('nav', { 'aria-label': 'Navegação principal', class: 'sidebar' },
    el('img', { class: 'brand', src: 'assets/wordmark.png', alt: 'Nuvio' }), el('span', { class: 'edition' }, 'FORK / LG'),
    ...[['home', 'Início', '⌂'], ['search', 'Buscar', '⌕'], ['addons', 'Add-ons', '+'], ['settings', 'Ajustes', '⚙']].map(([name, title, icon]) => button([el('span', { class: 'nav-icon' }, icon), title], () => { stack = []; navigate({ name }, true); }, { class: active === name ? 'nav-item active' : 'nav-item', 'aria-current': active === name ? 'page' : null, 'data-focus': `nav-${name}` })),
    el('div', { class: 'sidebar-foot' }, el('span', { class: 'dot' }), 'LG 55UT8050', el('small', {}, 'Prévia 0.1.0')));
  const main = el('main', {}); root.append(nav, main); return main;
}
function heading(main, kicker, title, subtitle) { main.append(el('div', { class: 'heading' }, el('p', { class: 'eyebrow' }, kicker), el('h1', {}, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null)); }
function notice(main, message) { main.append(el('p', { class: 'notice', role: 'status' }, message)); }
function failure(main, error, retry) { main.append(el('div', { class: 'empty' }, el('h2', {}, 'Não foi possível carregar'), el('p', {}, error.message), button('Tentar novamente', retry))); }
const current = signal => !signal.aborted;
async function render() {
  request?.abort(); request = new AbortController(); const signal = request.signal;
  if (cleanupPlayer) { cleanupPlayer(); cleanupPlayer = null; player = null; }
  try {
    if (route.name === 'player') { showPlayer(route); return; }
    const main = shell(route.name);
    const screens = { home: showHome, addons: showAddons, search: showSearch, settings: showSettings, catalog: showCatalog, detail: showDetail, streams: showStreams };
    await (screens[route.name] ?? showHome)(main, signal);
    if (current(signal)) focusFirst();
  } catch (error) {
    if (current(signal)) { const main = root.querySelector('main'); if (main) failure(main, error, render); focusFirst(); }
  }
}
function card(meta, addon, progress) {
  const id = text(meta.id), type = text(meta.type || 'movie');
  const node = button([poster(meta.poster, meta.name), el('strong', {}, meta.name || id), el('span', { class: 'muted' }, progress ? `Retomar em ${clock(progress.time)}` : [meta.releaseInfo, meta.imdbRating && `★ ${meta.imdbRating}`].filter(Boolean).join(' · '))], () => navigate(progress ? { name: 'streams', meta: { ...meta, type }, addon, type: progress.type, id: progress.id, episode: progress.episode } : { name: 'detail', meta: { ...meta, type }, addon }), { class: 'card', 'data-focus': `card-${type}-${progress?.id || id}` });
  if (progress) node.querySelector('.art').append(el('progress', { max: progress.duration, value: progress.time, 'aria-label': 'Progresso assistido' }));
  return node;
}
function catalogSection(main, title, metas, addon, more) {
  const section = el('section', { class: 'catalog-section' }, el('div', { class: 'section-head' }, el('h2', {}, title), more ? button('Ver todos →', more, { class: 'text-button' }) : null), el('div', { class: 'rail' }, metas.slice(0, 16).map(m => card(m, addon))));
  main.append(section);
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
  const hero = el('section', { class: 'hero' }, el('div', { class: 'hero-copy' }, el('p', { class: 'eyebrow' }, 'SUA BIBLIOTECA. DO SEU JEITO.'), el('h1', {}, 'O próximo play\ncomeça aqui.'), el('p', {}, 'Seus catálogos, suas fontes e as preferências do NuvioTV-Fork.'), button(state.addons.length ? 'Explorar catálogos' : 'Adicionar meu primeiro add-on', () => state.addons.length ? main.querySelector('.catalog-section button')?.focus() : navigate({ name: 'addons' }), { class: 'primary' })), el('div', { class: 'hero-mark', 'aria-hidden': true }, 'N'));
  main.append(hero);
  const recent = Object.values(state.progress).filter(x => !x.complete).sort((a, b) => b.updated - a.updated).slice(0, 12);
  if (recent.length) main.append(el('section', { class: 'catalog-section' }, el('h2', {}, 'Continuar assistindo'), el('div', { class: 'rail' }, recent.map(p => card(p.meta, null, p)))));
  if (!state.addons.length) { notice(main, 'Adicione o manifest.json de um add-on para carregar seus catálogos. Nenhuma fonte vem instalada.'); return; }
  const catalogs = state.addons.flatMap(addon => normalCatalogs(addon).map(catalog => ({ addon, catalog }))).slice(0, 6);
  if (!catalogs.length) { notice(main, 'Os add-ons instalados não oferecem catálogos sem filtros obrigatórios. Adicione um catálogo ou use a busca.'); return; }
  const loading = el('p', { class: 'loading', role: 'status' }, 'Carregando catálogos…'); main.append(loading); focusFirst();
  const results = await mapLimit(catalogs, async ({ addon, catalog }) => {
    const response = await cachedMetaJSON(resourceURL(addon, 'catalog', catalog.type, catalog.id), signal);
    return { addon, catalog, metas: Array.isArray(response.metas) ? response.metas.map(m => ({ ...m, type: m.type || catalog.type })) : [] };
  }, signal);
  if (!current(signal)) return; loading.remove();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.value) catalogSection(main, r.value.catalog.name || r.value.catalog.id, r.value.metas, r.value.addon, () => navigate({ name: 'catalog', addon: r.value.addon, catalog: r.value.catalog }));
    else notice(main, `${catalogs[i].addon.manifest.name}: ${r.error.message}`);
  }
}
function showAddons(main) {
  heading(main, 'SUA BIBLIOTECA', 'Add-ons', 'Instale o manifesto do seu add-on. A configuração fica somente nesta TV.');
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
  main.append(form);
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
  heading(main, 'EXPLORAR', 'Buscar', 'A busca usa os catálogos dos seus add-ons instalados.');
  const input = el('input', { type: 'search', 'aria-label': 'Buscar título', placeholder: 'Filme ou série', autocomplete: 'off' });
  const results = el('div'); let searchController;
  signal.addEventListener('abort', () => searchController?.abort());
  const form = el('form', { class: 'inline-form', onsubmit: async e => {
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
  main.querySelector('h1').textContent = meta.name || meta.id;
  const detail = el('div', { class: 'detail' }, poster(meta.poster, meta.name, 'detail-art'), el('div', { class: 'detail-copy' },
    el('p', { class: 'eyebrow' }, [meta.releaseInfo, meta.runtime, meta.imdbRating && `★ ${meta.imdbRating}`].filter(Boolean).join(' · ')),
    el('p', { class: 'synopsis' }, meta.description || 'Este catálogo não forneceu uma sinopse.'),
    el('p', { class: 'muted' }, (meta.genres ?? []).join(' · '))));
  main.append(detail);
  const go = (id = meta.id, episode) => navigate({ name: 'streams', meta, addon, id, type: meta.type, episode });
  if (meta.type !== 'series') detail.querySelector('.detail-copy').append(button('Ver fontes', () => go(), { class: 'primary' }));
  else {
    const videos = (meta.videos ?? []).filter(v => v.id).sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    if (!videos.length) { notice(main, 'Nenhum episódio foi retornado pelo catálogo.'); return; }
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
  heading(main, 'ESCOLHA UMA FONTE', context.meta.name, context.episode ? `Temporada ${context.episode.season} · Episódio ${context.episode.episode}` : 'Preferências e ranking do NuvioTV-Fork');
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
  let showAll = false;
  const list = el('div', { class: 'streams' });
  const display = () => {
    // Manual list uses strict filters. Auto-pick retains the original exclusion fallback.
    const visible = showAll ? [...rankStreams(all, { ...state.settings.preferences, excludedResolutions: [], excludedQualities: [], excludedVisualTags: [], excludedAudioTags: [], excludedAudioChannels: [], excludedEncodes: [], excludedLanguages: [], excludedReleaseGroups: [] })] : filterAndSort(all, state.settings.preferences);
    list.replaceChildren();
    if (!visible.length) notice(list, 'Nenhuma fonte passou pelos filtros. Use “Mostrar todas” para revisar.');
    for (const s of visible.slice(0, 100)) {
      const f = factsFor(s, state.settings.preferences), issue = playbackIssue(s, state.settings.avoidDvOnly);
      const info = [labels[f.resolution], labels[f.quality], f.releaseGroup, bytes(sizeBytes(s))].filter(Boolean).join(' · ');
      list.append(button([el('div', { class: 'source-top' }, el('span', { class: 'source-addon' }, s.addonName), el('span', { class: 'source-quality' }, labels[f.resolution])), el('strong', {}, s.name || s.title || 'Fonte'), el('p', {}, s.description || s.title || info), el('small', { class: issue ? 'warning' : 'muted' }, issue || info)], () => issue ? toast(issue) : navigate({ ...context, name: 'player', stream: s }), { class: `source ${issue ? 'unavailable' : ''}`, 'aria-disabled': issue ? 'true' : null }));
    }
  };
  const toggle = button('Mostrar todas', () => { showAll = !showAll; toggle.textContent = showAll ? 'Aplicar filtros do fork' : 'Mostrar todas'; display(); });
  main.append(el('div', { class: 'toolbar' }, button('Reproduzir melhor fonte', () => ordered.length ? navigate({ ...context, name: 'player', stream: ordered[0] }) : toast('Não há fonte HTTP(S) elegível nesta prévia.'), { class: 'primary' }), toggle, el('span', { class: 'muted' }, `${all.length} fontes · ${playable.length} elegíveis`)), list); display();
}
function showSettings(main) {
  heading(main, 'PERSONALIZAR', 'Ajustes', 'Preferências do fork e compatibilidade com a sua LG.');
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
installRemote({ root, back, playerKey: (key, event) => player?.key(key, event) ?? false });
window.addEventListener('pagehide', () => cleanupPlayer?.());
render();
