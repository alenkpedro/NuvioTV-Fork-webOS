// SPDX-License-Identifier: GPL-3.0-only
import { loadAddon, getJSON, resourceURL, supports, mapLimit, eachLimit } from './core/addons.js';
import { defaults, enums, rankStreams, filterAndSort, factsFor, playbackIssue, sizeBytes } from './core/ranking.js';
import { readState, saveState, progressKey, recordProgress } from './core/storage.js';
import { installLoadingOverlay } from './player-loading.js';
import { installTrailerPlayer } from './trailer-player.js';
import { railSkeleton, detailSkeleton, streamsSkeleton } from './skeletons.js';
import { installRemote } from './remote.js';
import { createAccountClient } from './core/account.js';
import { importAccountAddons, detachAccountAddons } from './core/account-sync.js';
import { readLayout, homeGeometry, catalogTitle, runtimeText, releaseText, episodeList, nextEpisode } from './core/presentation.js';
import { readSubtitleStyle } from './core/subtitle-style.js';
import appinfo from '../public/appinfo.json';
import { nextSource, readPlayback } from './core/playback.js';
import { autoPlayConfigured, autoPlayModeLabel, selectAutoPlayStream } from './core/auto-play.js';
import { cacheDurationLabel, clearLinkCache, linkKey, readLink, writeLink } from './core/link-cache.js';
import { postPlayCountdown, postPlayTrailerCountdown, shouldCountTrailer } from './core/trailer.js';
import { bufferedAhead, bufferStatusText, initialTarget, rebufferTarget, waitForBuffer } from './core/buffer.js';
import { formatMbps, formatSpeed, measureSources, speedBudget } from './core/speed-test.js';
import { directFileURL, localTransportEnabled, measureTransport, readLocalMediaStats, readMediaTransport, startLocalMedia, stopLocalMedia, transportLabel } from './core/media-service.js';
import { mediaTracks } from './core/media-tracks.js';
import { runSweep, stabilityText, sweepTarget } from './core/transport-sweep.js';
import { createStreamPrewarmer } from './core/stream-prewarm.js';
import { createMdbListTracker, readTrackingSettings, saveTrackingSettings } from './core/mdblist-tracking.js';
import { createNetwork } from './core/net-service.js';
import { assessmentPatch, assessmentSources, assessmentSummary, buildAssessment } from './core/device-assessment.js';
import { libraryTransferScreen } from './library-transfer-screen.js';
import { audioCompatIssue } from './core/audio-compat.js';
import { playbackSettingsScreen } from './playback-settings.js';
import { settingsScreen } from './settings-screen.js';
import { readAppearance, applyAppearance } from './core/appearance.js';
import { subtitleStyleEditor } from './subtitle-style-editor.js';
import { installParentalGuide } from './player-parental.js';
import { installPostPlay } from './player-post-play.js';
import { installNextEpisode } from './next-episode.js';
import { installAspect } from './core/aspect.js';
import { installEpisodePanel } from './player-episodes.js';
import {installSegments} from './player-segments.js';
import {installThumbnails} from './player-thumbnails.js';
import { installPauseOverlay } from './player-pause.js';
import { artworkURL, enrichPlayerMetadata } from './core/player-artwork.js';
import { people, trailers } from './core/metadata.js';
import { playerUI } from './player-ui.js';
import { installSeek } from './core/player-seek.js';
import { installTrackControls } from './player-tracks.js';
import { initializeProfiles, activateProfile, leaveAccountProfiles, mergeLibrary, setLibraryItem } from './core/profiles.js';
import { initializeHistory, mergeHistory, markWatched, isWatched, continueHistory, progressWithWatched, historySummary, resolveHistoryConflict } from './core/history.js';
import { initializeOutbox, flushOutbox, syncSummary as outboundSummary, resolveOutbound } from './core/outbox.js';
import { discoverScreen, searchScreen, catalogManager } from './discovery-screen.js';
import { homeCatalogEntries } from './core/discovery.js';
import {createMetadataClient,readMetadataSettings} from './core/metadata.js';
import {createRatingsClient,readRatingsSettings} from './core/ratings.js';
import {ratingsSettingsScreen} from './ratings-screen.js';
import { detailExtras,personScreen,metadataSettingsScreen,launchTrailer} from './metadata-screen.js';
import { collectionsScreen, collectionEditorScreen } from './collections-screen.js';
import { createSettingsKit } from './settings-kit.js';
import { collectionSections, describeSource, folderCover, isPlayableSource, parseAccountCollections, readCollections, sourceTypeLabel, toAccountCollections } from './core/collections.js';
import { parseCatalogPage } from './core/discovery.js';
import { profileScreen } from './profile-screen.js';
import qrcode from 'qrcode-generator';
import searchIcon from '../public/assets/icons/sidebar_search.svg';
import libraryIcon from '../public/assets/icons/sidebar_library.svg';
import settingsIcon from '../public/assets/icons/sidebar_settings.svg';
import './style.css';
import './loading.css';

const root = document.querySelector('#app');
const state = readState(localStorage);
// Início rápido: as fontes do título são buscadas e ranqueadas enquanto você lê os detalhes,
// e a conexão é aberta no toque do botão. É o "faster stream start" do fork na parte que um
// aplicativo web possui; o índice final de MP4 não-faststart pertence ao analisador do
// elemento de mídia e não é prometido aqui.
const prewarmEnabled = () => readPlayback(state.settings.playback).prewarmStreams !== false;
// Um problema de fonte é o do fork (Dolby Vision sem camada utilizável) ou o do áudio que o
// receiver não aceita: os dois desviam a escolha automática e marcam o cartão na lista.
const sourceIssue = stream => playbackIssue(stream, state.settings.avoidDvOnly) || audioCompatIssue(stream, readPlayback(state.settings.playback));
const playbackRanking = rows => rankStreams(rows.filter(stream => !sourceIssue(stream)), state.settings.preferences);
const prewarm = createStreamPrewarmer({
  loadStreams: (context, options) => loadStreamRows(context, options),
  rank: rows => ({ best: playbackRanking(rows)[0] || null })
});
// Stream search shared by the browse-time prewarm and the sources screen, so both see the same
// rows, the same provider order and the same per-addon failure count.
async function loadStreamRows(context, { signal } = {}) {
  const providers = state.addons.filter(addon => supports(addon, 'stream', context.type, context.id)).slice(0, 30);
  const responses = await mapLimit(providers, async (addon, provider) => {
    const result = await getJSON(resourceURL(addon, 'stream', context.type, context.id), { signal });
    if (!Array.isArray(result.streams)) throw Error('Resposta de fontes inválida.');
    return result.streams.slice(0, 300).filter(s => s && typeof s === 'object').map((s, index) => ({ ...s, addonName: addon.manifest.name, sourceProvider: provider, sourceKey: `source-${provider}-${index}` }));
  }, signal);
  return { providers, rows: responses.flatMap(r => r.value ?? []), failed: responses.filter(r => r.error).length };
}
state.collections = readCollections(state.collections);
state.settings.layout = readLayout(state.settings.layout);
state.settings.appearance = readAppearance(state.settings.appearance);
const layout = state.settings.layout;
const appearance = () => applyAppearance(root, state.settings.appearance);
const appVersion = `webOS ${appinfo.version}`;
const account = createAccountClient({ storage: localStorage });
const ratings=createRatingsClient({settings:()=>readRatingsSettings(localStorage)});
// MDBList como fonte de acompanhamento: MDBListScrobbleService.kt do fork. A chave é a mesma
// que já existe em Integrações → Avaliações MDBList; o interruptor de acompanhamento é
// separado (o fork tem "enabled" e "tracking").
const mdblistNetwork = createNetwork();
const mdbListTracker = createMdbListTracker({
  network: mdblistNetwork,
  settings: () => ({ ...readRatingsSettings(localStorage), ...readTrackingSettings(localStorage) }),
  version: appinfo.version,
  onResult: result => { state.mdblistTracking = result; persist(); }
});
const metadata=createMetadataClient({settings:()=>readMetadataSettings(localStorage)});
initializeProfiles(state);
let profileAccess = null;
let syncTimer, syncFlight, syncController, syncDelay=3000, syncNextAt=0;
state.syncClientId ||= `nuvio-webos-${crypto.randomUUID().replaceAll('-','')}`;
if (!account.hasSession) activateProfile(state, null);
// Do not display another account's imported add-ons after local session loss.
state.addons = state.addons.filter(a => !a.accountOwner || a.accountOwner === account.user?.id);
if (state.accountSync?.userId !== account.user?.id) delete state.accountSync;
let route = { name: 'home' }, stack = [], request = null, player = null, cleanupPlayer = null;
let toastTimer, persistWarning = false, heroTimer, heroRequest, pillTimer, drawerOpen = false, contentFocus = null, collectionsPushTimer;
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
// The TV re-enters the Home and the catalog screens all the time; a five-minute window over a
// larger budget keeps those visits instant instead of asking every add-on again. Anything the
// user edits (installing an add-on, syncing the account) clears the cache outright.
const metadataCacheTTL = 300000;
const metadataCacheLimits = { entries: 24, bytes: 6 * 1024 * 1024 };
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
  const saved=saveState(localStorage,state);
  if(!saved && !persistWarning) { persistWarning=true;toast('Armazenamento indisponível. Alterações valem somente nesta sessão; envio pausado.'); }
  if(saved) scheduleSync();
  return saved;
}
function stopSync() { clearTimeout(syncTimer);syncTimer=null;syncController?.abort(); }
function scheduleSync() {
  if(syncTimer || syncFlight || !profileAccess || route.name==='profiles' || document.hidden || navigator.onLine===false || !Object.values(state.outbox || {}).some(op=>!op.conflict))return;
  syncTimer=setTimeout(()=>{syncTimer=null;runSync();},Math.max(syncDelay,syncNextAt-Date.now()));
}
async function runSync() {
  if(syncFlight)return syncFlight;
  if(!profileAccess || document.hidden || navigator.onLine===false)return;
  const access=profileAccess, controller=new AbortController();syncController=controller;
  const isCurrent=()=>access===profileAccess && state.activeProfile?.userId===access.userId && state.activeProfile?.id===access.id;
  clearTimeout(syncTimer);syncTimer=null;
  if(!saveState(localStorage,state)) {toast('Não foi possível salvar a fila. O envio foi pausado.');return;}
  syncFlight=(async()=>{
    try {
      await flushOutbox({state,account,access,signal:controller.signal,persist,isCurrent,clientId:state.syncClientId});
      syncDelay=3000;syncNextAt=Date.now()+30000;if(isCurrent() && state.outboxStatus?.error)delete state.outboxStatus.error;
    } catch(error) {
      if(!controller.signal.aborted && isCurrent()) {state.outboxStatus={...state.outboxStatus,error:error.message};syncDelay=Math.min(300000,Math.max(30000,syncDelay*2));}
    } finally {
      syncFlight=null;
      if(isCurrent()) {persist();root.dispatchEvent(new Event('syncstatus'));}
      scheduleSync();
    }
  })();
  return syncFlight;
}

function focusFirst() { const expectedRoute = route, expectedRequest = request; requestAnimationFrame(() => {
  if (drawerOpen || route !== expectedRoute || request !== expectedRequest) return;
  const restored = route.restoreFocus && [...root.querySelectorAll('[data-focus]')].find(e => e.dataset.focus === route.restoreFocus);
  delete route.restoreFocus;
  (restored || root.querySelector('main [data-initial-focus]') || root.querySelector('main input, main button:not(:disabled)') || root.querySelector('main'))?.focus({ preventScroll: true });
  if (restored?.classList.contains('source') || (restored && ['discover','catalog','search','person','detail'].includes(route.name))) restored.scrollIntoView({ block: 'nearest' });
}); }
function navigate(next, replace = false) {
  if (!replace) stack.push({ route, focus: document.activeElement?.dataset.focus });
  route = next; render();
}
function back(force = false) {
  // The menu the user has open is the first thing Back closes.
  if (drawerOpen) { setDrawer(false); return; }
  // Only a dialog the user can see may consume Back: player overlays stay mounted hidden.
  const dialog = root.querySelector('[role=dialog]:not([hidden])');
  if (dialog) { (dialog.querySelector('[data-dismiss]') || dialog.querySelector('button'))?.click(); return; }
  if(force!==true && player?.back?.())return;
  if(route.name==='discover' && document.activeElement?.closest('.discover-grid')) {root.querySelector('[data-picker]')?.focus();root.querySelector('main').scrollTop=0;return;}
  if(route.name==='search' && document.activeElement?.closest('.search-results')) {root.querySelector('input[type=search]')?.focus();root.querySelector('main').scrollTop=0;return;}
  if (route.name === 'profiles') { toast('Escolha um perfil para continuar.'); return; }
  // A source list without a stack (returning from playback, or after the TV relaunched the
  // app) always leads back to the title, never to the menu.
  if (route.name === 'streams' && !stack.length && route.meta) { route = { name: 'detail', meta: route.meta, addon: route.addon, restoreFocus: 'detail-play' }; render(); return; }
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
  appearance();
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
  if (account.hasSession && (!profileAccess || profileAccess.userId !== account.user?.id) && !['account-login', 'profiles'].includes(route.name)) { route = { name: 'profiles', automatic: true }; stack = []; }
  clearTimeout(heroTimer); clearTimeout(pillTimer); heroRequest?.abort(); request?.abort(); request = new AbortController(); const signal = request.signal;
  if (cleanupPlayer) { cleanupPlayer(); cleanupPlayer = null; player = null; }
  try {
    if (route.name === 'player') { showPlayer(route); return; }
    const main = shell(route.name);
    const screens = { 'subtitle-appearance': showSubtitleAppearance, 'playback-settings': main => playbackSettingsScreen({main,settings:state.settings,persist,el,button,icon,toast}), 'ratings-settings':(main,signal)=>ratingsSettingsScreen(metadataContext(main,signal)), assessment: showAssessment,
    'library-transfer':(main,signal)=>libraryTransferScreen({ main, el, button, icon, toast, state, persist, navigate, profileAccess, requestSync: () => scheduleSync(),
      loadAccountLibrary: async () => { if (!profileAccess) throw Error('Entre na conta Nuvio para usar a conta como origem.'); const cloud = await account.library(profileAccess.id, signal); return Object.values(cloud || {}); },
      applyLibraryEntries: entries => { for (const entry of entries) setLibraryItem(state, progressKey(entry.type, entry.id), entry); },
      removeLibraryKeys: keys => { for (const key of keys) setLibraryItem(state, key, null); } }), person: (main,signal)=>personScreen(metadataContext(main,signal)), 'metadata-settings':(main,signal)=>metadataSettingsScreen(metadataContext(main,signal)), discover: showDiscover, 'catalog-manager': showCatalogManager, collections: showCollections, 'collection-editor': showCollectionEditor, 'collection-source': showCollectionSource, sync: showSync, history: showHistory, profiles: showProfiles, home: showHome, addons: showAddons, search: showSearch, settings: showSettings, library: showLibrary, preferences: showPreferences, catalog: showCatalog, detail: showDetail, streams: showStreams, welcome: showWelcome, 'account-login': showAccountLogin };
    await (screens[route.name] ?? showHome)(main, signal);
    if (current(signal) && route.name !== 'profiles') {focusFirst();scheduleSync();}
  } catch (error) {
    if (current(signal)) { const main = root.querySelector('main'); if (main) failure(main, error, render); focusFirst(); }
  }
}
function card(meta, addon, progress, rowKey = '', {portrait=false} = {}) {
  const id = text(meta.id), type = text(meta.type || 'movie');
  const wide = portrait ? false : progress ? layout.continueStyle !== 'poster' : layout.landscapePosters;
  const image = wide ? meta.background || meta.fanart || meta.poster : meta.poster;
  const node = button([poster(image, meta.name), el('strong', {}, meta.name || id), el('span', { class: 'muted' }, progress ? [progress.episode ? `T${progress.episode.season}:E${progress.episode.episode}` : '', `Retomar em ${clock(progress.time)}`].filter(Boolean).join(' · ') : meta.releaseInfo || '')], () => navigate(progress ? { name: 'streams', meta: { ...meta, type }, addon, type: progress.type, id: progress.id, episode: progress.episode } : { name: 'detail', meta: { ...meta, type }, addon }), { class: `card${progress ? ' continue-card' : ''}`, 'aria-label': meta.name || id, 'data-focus': `card-${rowKey}-${type}-${progress?.id || id}` });
  node.addEventListener('focus', () => {
    // Scrolling the row is the Home's own focusin handler (it also covers the collection cards);
    // here only the hero enrichment lives.
    const section = node.closest('.home-rows .catalog-section');
    if (!section) return;
    clearTimeout(heroTimer);
    heroRequest?.abort();
    section.dataset.lastFocus = node.dataset.focus;
    heroTimer = setTimeout(() => { if (route.name === 'home') enrichHomeHero(meta, addon); }, 450);
  });
  if (progress) node.querySelector('.art').append(el('progress', { max: progress.duration, value: progress.time, 'aria-label': 'Progresso assistido' }));
  // Long press on a Continue Watching card: resume, or take the title out of the row.
  if (progress) {
    node.setAttribute('data-longpress', 'continue');
    node.addEventListener('longpress', () => continueDialog(meta, progress, addon));
  }
  return node;
}
// Not from the Android fork (it declares the gesture but never wires it): holding OK on a
// Continue Watching card offers the two actions the row exists for.
function continueDialog(meta, progress, addon) {
  const previous = document.activeElement;
  const type = text(meta.type || progress.type || 'movie');
  const dialog = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': meta.name || 'Continuar assistindo' });
  const close = () => { dialog.remove(); previous?.focus({ preventScroll: true }); };
  const resume = button('Retomar', () => { close(); navigate({ name: 'streams', meta: { ...meta, type }, addon, type: progress.type, id: progress.id, episode: progress.episode }); }, { class: 'primary' });
  const remove = button('Remover do histórico', () => {
    delete state.progress[progressKey(type, progress.id)];
    try { markWatched(state, { ...meta, type }, false); } catch { /* já não estava marcado */ }
    persist(); close(); render(); toast('Removido do histórico desta TV.');
  });
  dialog.append(el('section', { class: 'dialog-panel' }, el('h2', {}, meta.name || 'Continuar assistindo'),
    el('p', { class: 'dialog-copy' }, `Retomar em ${clock(progress.time)} ou remover este título do histórico desta TV.`),
    el('div', { class: 'toolbar' }, resume, remove, button('Cancelar', close, { 'data-dismiss': true }))));
  root.append(dialog); resume.focus({ preventScroll: true });
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
  return section;
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
      if (result.meta?.id === meta.id) return { meta: { ...meta, ...result.meta, logo:artworkURL(result.meta.logo) || artworkURL(meta.logo), type: meta.type }, addon: a };
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
  if (cached && Date.now() - cached.time < metadataCacheTTL) return cached.value;
  const value = await getJSON(url, { signal });
  if (signal.aborted) return value;
  const weight = JSON.stringify(value).length * 2;
  if (weight <= metadataCacheLimits.bytes) {
    metadataCache.delete(url); metadataCache.set(url, { time: Date.now(), value, weight });
    while (metadataCache.size > metadataCacheLimits.entries || [...metadataCache.values()].reduce((n, entry) => n + entry.weight, 0) > metadataCacheLimits.bytes) metadataCache.delete(metadataCache.keys().next().value);
  }
  return value;
}
async function showHome(main, signal) {
  const recent = layout.continueWatching ? continueHistory(state) : [];
  // Coleções: o fork mostra uma fileira por coleção e um cartão de capa por pasta — a capa que
  // o usuário escolheu no app, com o nome da pasta embaixo. As pastas que a TV não abre entram
  // com o motivo, para nada desaparecer da Home sem explicação.
  const addonOf = source => state.addons.find(addon => (source?.addonId && addon.manifest.id === source.addonId) || (source?.addonUrl && addon.url === source.addonUrl));
  const sections = collectionSections(state.collections || [], { addonInstalled: source => Boolean(addonOf(source)) });
  if (!state.addons.length && !recent.length && !sections.length) {
    main.append(el('p', { class: 'home-empty', role: 'status' }, 'Nenhum addon instalado. Adicione um para começar.')); return;
  }
  const catalogs = homeCatalogEntries(state).slice(0,6);
  if (!catalogs.length && !recent.length && !sections.length) {
    main.append(el('p', { class: 'home-empty', role: 'status' }, 'Nenhum catálogo visível no início. Confira seus addons e a organização dos catálogos.')); return;
  }
  main.append(el('section', { class: 'home-hero', 'aria-label': 'Título em destaque' }, el('div', { class: 'hero-fade' }), el('div', { class: 'hero-copy' })));
  const rows = el('div', { class: 'home-rows' }); main.append(rows);
  // Every rail scrolls the same way, whatever kind of card it holds: the row that received the
  // focus comes to the top of the viewport. The per-card handlers missed the collection cards,
  // which left the Home looking stuck when the focus walked down from the first row.
  rows.addEventListener('focusin', event => {
    if (pointerFocus) return;
    const card = event.target.closest('.card');
    const section = card?.closest('.catalog-section');
    if (!card || !section) return;
    rows.scrollTop = Math.max(0, section.offsetTop - 40);
    card.parentElement.scrollLeft = Math.max(0, card.offsetLeft - 52);
  });
  let first = recent[0]?.meta;
  if (recent.length) {
    rows.append(el('section', { class: 'catalog-section continue-section' }, el('div', { class: 'section-head' }, el('h2', {}, 'Continuar assistindo')), el('div', { class: 'rail' }, recent.map(p => card(p.meta, null, p, 'continue')))));
    updateHomeHero(recent[0].meta);
    enrichRecentCards(recent, main, signal);
  }
  for (const section of sections) {
    if (section.folders.some(folder => folder.sources.length)) collectionSection(rows, section);
    else collectionUnavailable(rows, section.title, section.folders.find(folder => folder.unavailableMessage)?.unavailableMessage || 'Esta coleção ainda não tem fontes.');
  }
  focusHomeIfIdle(main);
  // Catálogos: cada fileira entra assim que chega, com o esqueleto do fork no lugar enquanto
  // isso. Antes a Home esperava todas as respostas para desenhar a primeira fileira.
  const pending = catalogs.map(({ addon, catalog }, index) => {
    const skeleton = railSkeleton(el, { title: catalogTitle(catalog, layout), cards: 6, landscape: layout.landscapePosters, key: `home-${index}` });
    rows.append(skeleton);
    return { addon, catalog, skeleton, key: `home-${index}` };
  });
  await eachLimit(pending, async ({ addon, catalog, skeleton, key }) => {
    let metas = [];
    try {
      const response = await cachedMetaJSON(resourceURL(addon, 'catalog', catalog.type, catalog.id), signal);
      if (!current(signal) || !skeleton.isConnected) return;
      metas = Array.isArray(response.metas) ? response.metas.map(m => ({ ...m, type: m.type || catalog.type })) : [];
      if (!metas.length) { skeleton.replaceWith(el('p', { class: 'notice' }, `${addon.manifest.name}: esta lista não devolveu títulos.`)); return; }
    } catch (error) {
      if (current(signal) && skeleton.isConnected) skeleton.replaceWith(el('p', { class: 'notice' }, `${addon.manifest.name}: ${error.message}`));
      return;
    }
    if (!first) { first = metas[0]; updateHomeHero(first); }
    // The placeholder row was focusable: the focus moves to the real card *before* the skeleton
    // leaves the DOM, at the same place in the row. Removing a focused node makes the browser
    // reset the focus to the body afterwards, which is what made the remote lose its place.
    const held = [...skeleton.querySelectorAll('.skeleton-card')].indexOf(document.activeElement);
    const section = catalogSection(rows, catalogTitle(catalog, layout), metas, addon, () => navigate({ name: 'catalog', addon, catalog }), key);
    if (held >= 0) {
      const cards = [...section.querySelectorAll('.rail .card')];
      (cards[Math.min(held, cards.length - 1)] || cards[0])?.focus({ preventScroll: true });
    }
    skeleton.replaceWith(section);
    focusHomeIfIdle(main);
  }, 3);
  if (!current(signal)) return;
  if (first) updateHomeHero(first);
  else notice(rows, 'Nenhum conteúdo encontrado.');
  focusHomeIfIdle(main);
}
// The Home draws rail by rail: the first card must take the focus as soon as a rail lands, or
// the remote has no starting point on the panel.
function focusHomeIfIdle(main) {
  if (drawerOpen || route.name !== 'home' || pointerFocus) return;
  const active = document.activeElement;
  if (active && active !== document.body && active !== main && main.contains(active)) return;
  main.querySelector('.home-rows .card')?.focus({ preventScroll: true });
}
// CollectionRowSection.kt + CollectionFolderCardMedia.kt: the Home shows the cover the user
// picked for each folder (image first, emoji next), with the folder title underneath. A folder
// the TV cannot open still shows up, marked, instead of vanishing from the Home.
function collectionSection(rows, section) {
  const cards = section.folders.map(folder => {
    const cover = folder.cover || {};
    const art = el('div', { class: 'art collection-cover' });
    const description = folder.sources.length ? describeSource(folder.sources[0]) : folder.unavailableMessage;
    const shape = cover.shape === 'LANDSCAPE' ? ' collection-card-wide' : cover.shape === 'SQUARE' ? ' collection-card-square' : '';
    const card = button([art, cover.hideTitle ? null : el('strong', {}, folder.title), el('small', { class: 'muted' }, description)],
      () => navigate({ name: 'collection-source', collectionId: folder.collectionId, folderId: folder.folderId }),
      { class: `card collection-card${folder.sources.length ? '' : ' unavailable'}${shape}`, 'aria-label': `${folder.title}${folder.sources.length ? '' : ` · ${folder.unavailableMessage}`}`, 'data-focus': folder.key });
    if (cover.image) {
      const image = el('img', { class: 'collection-cover-image', src: cover.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: event => event.target.remove() });
      // A folder that keeps the default square tile but carries a wide cover gets the landscape
      // tile: the size stays the fork's (width × 16/9 by width), only the shape follows the art.
      image.addEventListener('load', () => { if (cover.shape !== 'LANDSCAPE' && image.naturalWidth > image.naturalHeight * 1.15) { card.classList.remove('collection-card-square'); card.classList.add('collection-card-wide'); } }, { once: true });
      art.append(image);
    } else art.append(cover.emoji ? el('span', { class: 'collection-emoji' }, cover.emoji) : icon('sidebar_library'));
    return card;
  });
  rows.append(el('section', { class: 'catalog-section collection-section' }, el('div', { class: 'section-head' }, el('h2', {}, section.title)), el('div', { class: 'rail' }, cards)));
}
// Uma coleção que a TV não consegue abrir continua na Home com o título e o motivo.
function collectionUnavailable(rows, title, message) {
  rows.append(el('section', { class: 'catalog-section collection-unavailable' }, el('div', { class: 'section-head' }, el('h2', {}, title)), el('p', { class: 'notice' }, message)));
}
function enrichRecentCards(recent, main, signal) {
  // Metadata arrives after the usable home; retain the focused button and cancel on exit.
  mapLimit(recent, async p => {
    const saved = state.library[progressKey(p.type,p.meta.id)];
    const result = await loadMeta({...p.meta,...saved}, null, signal);
    if (signal.aborted || !result) return;
    Object.assign(p.meta, {name:result.meta.name,poster:result.meta.poster,background:result.meta.background});
    const node = [...main.querySelectorAll('.continue-card')].find(n => n.dataset.focus === `card-continue-${p.type}-${p.id}`);
    if (node) {
      node.setAttribute('aria-label',p.meta.name); node.querySelector('strong').textContent=p.meta.name;
      const art = poster(layout.continueStyle !== 'poster' ? p.meta.background || p.meta.poster : p.meta.poster,p.meta.name);
      art.append(el('progress',{max:p.duration,value:p.time,'aria-label':'Progresso assistido'})); node.querySelector('.art').replaceWith(art);
      if(document.activeElement===node) updateHomeHero(result.meta);
    }
  },signal,2).then(() => { if(!signal.aborted) persist(); });
}
function showSync(main,signal) {
  heading(main,'','Sincronização Nuvio');
  main.append(el('p',{class:'muted'},'Progresso, assistidos e favoritos deste perfil são enviados ao Nuvio. Trakt, Simkl e MDBList externos continuam pendentes.'));
  const status=el('p',{role:'status','data-sync-status':true});
  const refresh=button('Sincronizar agora',async()=>{refresh.disabled=true;await runSync();if(!signal.aborted){refresh.disabled=false;draw();if(document.activeElement===document.body || document.activeElement===main)refresh.focus();}},{disabled:!profileAccess});
  const content=el('div',{class:'history-content'});main.append(status,el('div',{class:'toolbar'},refresh),content);
  function draw() {
    status.textContent=(navigator.onLine===false?'Sem conexão. ':'')+outboundSummary(state);content.replaceChildren();
    const ops=Object.entries(state.outbox || {}), conflicts=ops.filter(([,op])=>op.conflict);
    if(conflicts.length)content.append(el('h2',{},'Revisar antes de enviar'),el('p',{class:'muted'},'A conta mudou ou esta alteração veio de uma versão anterior. Escolha qual manter.'));
    const describe=(kind,v)=>!v || (kind==='watched' && !v.value)?'Removido / não assistido':kind==='progress'?`${clock(v.time)} / ${clock(v.duration)}`:kind==='watched'?'Assistido':'Na biblioteca';
    for(const [id,op] of conflicts.slice(0,20)) {
      const value=op.value || op.conflict.remote, episode=op.kind==='progress'?value?.episode:value?.season!=null?{season:value.season,episode:value.episode}:null;
      const choose=remote=>{try{resolveOutbound(state,id,remote,op.revision);persist();draw();(content.querySelector('button') || refresh).focus();}catch(error){toast(error.message);}};
      content.append(el('section',{class:'history-conflict','data-sync-conflict':true},el('h3',{},`${value?.meta?.name || value?.name || JSON.parse(op.key)[1]}${episode?` · T${episode.season}:E${episode.episode}`:''}`),el('p',{},`Nesta TV: ${describe(op.kind,op.value)}`),el('p',{},`Na conta: ${describe(op.kind,op.conflict.remote)}`),el('div',{class:'toolbar'},button('Enviar desta TV',()=>choose(false)),button('Usar da conta',()=>choose(true)))));
    }
    if(conflicts.length>20)content.append(el('p',{},`Mostrando 20 de ${conflicts.length}. As próximas escolhas aparecem após resolver estas.`));
    if(!ops.length)content.append(el('p',{},'Nenhuma alteração pendente neste perfil.'));
  }
  root.addEventListener('syncstatus',draw,{signal});draw();
}
function showHistory(main,signal) {
  initializeHistory(state);
  heading(main,'','Histórico e assistidos');
  const status=el('p',{class:'history-summary',role:'status'},profileAccess?historySummary(state):'Histórico salvo nesta TV.');
  const refresh=button('Atualizar histórico',async () => {
    if(refresh.disabled)return; refresh.disabled=true;status.textContent='Carregando histórico da conta…';
    try {await syncHistory(signal);if(!signal.aborted){status.textContent=historySummary(state);draw();}}
    catch(error){if(!signal.aborted)status.textContent=error.message;}
    finally{refresh.disabled=false;}
  },{disabled:!profileAccess,'data-focus':'history-refresh'});
  const content=el('div',{class:'history-content'});main.append(status,el('div',{class:'toolbar'},refresh,button('Sincronização',()=>navigate({name:'sync'}))),content);
  const stamp=value=>value?new Date(value).toLocaleString('pt-BR'):'Data não informada';
  const episodeLabel=p=>{const e=p.kind==='progress'?p.episode:p.season!==null?{season:p.season,episode:p.episode}:null;return e?` · T${e.season}:E${e.episode}`:'';};
  const label=p=>p.kind==='progress'?`${clock(p.time)} / ${clock(p.duration)}`:p.value?'Assistido':'Não assistido';
  const action=(id,remote)=>{try{resolveHistoryConflict(state,id,remote);persist();draw();(content.querySelector('button')||refresh).focus();}catch(error){status.textContent=error.message;}};
  function draw(){
    content.replaceChildren();
    const conflicts=Object.entries(state.historyConflicts || {});
    if(conflicts.length){
      content.append(el('h2',{},'Escolha qual versão manter'),el('p',{class:'muted'},'A versão desta TV foi preservada. Manter desta TV coloca a escolha na fila de envio ao Nuvio.'));
      for(const [id,c] of conflicts) content.append(el('section',{class:'history-conflict'},el('h3',{},(c.local.meta?.name || c.local.name || c.local.id)+episodeLabel({...c.local,kind:c.kind})),el('p',{},`Nesta TV: ${label({...c.local,kind:c.kind})} · ${stamp(c.local.updated)}`),el('p',{},`Na conta: ${label({...c.remote,kind:c.kind})} · ${stamp(c.remote.updated)}`),el('div',{class:'toolbar'},button('Manter desta TV',()=>action(id,false)),button('Usar da conta',()=>action(id,true)))));
    }
    const tabs=el('div',{class:'toolbar history-tabs'}),list=el('div',{class:'history-list'});content.append(tabs,list);
    let page=route.historyPage || 0;
    const show=tab=>{
      route.historyTab=tab;
      const progress=tab!=='watched';
      const all=Object.values(progress?state.progress:state.watchedRecords || {}).filter(p=>progress || p.value).sort((a,b)=>b.updated-a.updated);
      page=Math.min(page,Math.max(0,Math.ceil(all.length/50)-1));route.historyPage=page;
      list.replaceChildren(); tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));
      if(!all.length)notice(list,progress?'Nenhum progresso salvo.':'Nenhum assistido salvo.');
      for(const p of all.slice(page*50,(page+1)*50)){
        const meta=progress?p.meta:state.library[progressKey(p.type,p.id)] || {id:p.id,type:p.type,name:p.name};
        const episode=progress?p.episode:p.season!==null?{season:p.season,episode:p.episode}:null;
        list.append(el('div',{class:'history-row'},button([el('strong',{},meta.name),el('small',{class:'muted'},[episode?`T${episode.season}:E${episode.episode}`:'',progress?`${clock(p.time)} / ${clock(p.duration)}`:'Assistido',stamp(p.updated),p.origin==='nuvio'?'Conta Nuvio':'Nesta TV'].filter(Boolean).join(' · '))],()=>navigate({name:'detail',meta}),{'data-focus':`history-${progress?'progress':'watched'}-${p.type}-${p.id}-${episode?.season}-${episode?.episode}`}),!progress?button('Marcar como não assistido',()=>{try{markWatched(state,p,false);persist();draw();(content.querySelector('button')||refresh).focus();}catch(error){toast(error.message);}}):null));
      }
      if(all.length>50) list.append(el('div',{class:'toolbar'},button('Página anterior',()=>{page--;show(tab);list.querySelector('button')?.focus();},{disabled:page===0}),el('span',{},`${page+1} / ${Math.ceil(all.length/50)}`),button('Próxima página',()=>{page++;show(tab);list.querySelector('button')?.focus();},{disabled:(page+1)*50>=all.length})));
    };
    for(const [tab,name]of [['progress','Progresso'],['watched','Assistidos']])tabs.append(button(name,()=>{page=0;show(tab);},{'data-tab':tab}));
    show(route.historyTab || 'progress');
  }
  draw();
}
function showLibrary(main, signal) {
  heading(main, '', 'Biblioteca');
  const status = el('p', { class: 'library-sync-status muted', role: 'status' }, profileAccess ? `${profileAccess.name} · ${state.librarySync ? `${state.librarySync.count} título(s) da conta` : 'Biblioteca da conta ainda não carregada'}. Alterações nesta TV entram na fila de envio ao Nuvio.` : 'Favoritos salvos nesta TV.');
  let selectedType = route.libraryType || 'movie', pageIndex = route.libraryPage || 0;
  const rows = el('div', { class: 'library-content' });
  const draw = type => {
    selectedType = type; route.libraryType = type;
    const saved = Object.values(state.library).filter(m => m.type === type).sort((a,b) => (b.addedAt || 0) - (a.addedAt || 0));
    pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(saved.length / 100) - 1)); route.libraryPage = pageIndex;
    rows.replaceChildren(saved.length ? el('div', { class: 'grid' }, saved.slice(pageIndex * 100, (pageIndex + 1) * 100).map(m => card(m, null))) : el('div', { class: 'library-empty' }, icon('library'), el('h2', {}, `Nenhum ${type === 'movie' ? 'filme' : 'série'} ainda`), el('p', { class: 'muted' }, 'Comece a salvar seus favoritos para vê-los aqui')));
    if (saved.length > 100) rows.append(el('div', { class: 'toolbar' }, button('Página anterior', () => { pageIndex--; draw(type); rows.querySelector('.card')?.focus(); }, { disabled: pageIndex === 0 }), el('span', { class: 'muted' }, `Página ${pageIndex + 1} de ${Math.ceil(saved.length / 100)}`), button('Próxima página', () => { pageIndex++; draw(type); rows.querySelector('.card')?.focus(); }, { disabled: (pageIndex + 1) * 100 >= saved.length })));
    main.querySelectorAll('.library-tabs button').forEach(b => b.classList.toggle('selected', b.dataset.type === type));
  };
  const tabs = el('div', { class: 'library-tabs toolbar' }, ...[['movie', 'Filmes'], ['series', 'Séries']].map(([type, name]) => button(name, () => { pageIndex = 0; draw(type); }, { 'data-type': type })));
  if (profileAccess) tabs.append(button('Atualizar biblioteca', async event => {
    const target = event.currentTarget; target.disabled = true; status.textContent = 'Carregando biblioteca da conta…';
    try { const result = await syncLibrary(signal); if (!signal.aborted) { status.textContent = `${profileAccess.name} · ${result.count} título(s) da conta. Alterações nesta TV entram na fila de envio ao Nuvio.`; draw(selectedType); } }
    catch (error) { if (!signal.aborted) status.textContent = error.message; }
    finally { target.disabled = false; }
  }));
  tabs.append(button('Histórico e assistidos',()=>navigate({name:'history'})),button('Sincronização',()=>navigate({name:'sync'})));
  main.append(tabs, status, rows); draw(selectedType);
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
  // A ordem desta lista decide a ordem das fontes e dos catálogos na Home (o fork guarda a
  // mesma ordem no perfil; aqui ela vale nesta TV).
  if (state.addons.length > 1) main.append(el('p', { class: 'muted' }, 'A ordem abaixo é a ordem das fontes e dos catálogos na Home. Use as setas para mudar.'));
  state.addons.forEach((a, index) => main.append(el('article', { class: 'addon-row' }, poster(a.manifest.logo, a.manifest.name, 'addon-icon'),
    el('div', { class: 'grow' }, el('h2', {}, a.manifest.name), el('p', { class: 'muted' }, `${a.manifest.version || ''} · ${new URL(a.url).hostname}`), el('p', {}, text(a.manifest.description).slice(0, 250))),
    el('div', { class: 'addon-order' },
      button('↑', () => moveAddon(index, -1), { class: 'addon-move', 'aria-label': `Mover ${a.manifest.name} para cima`, disabled: index === 0 }),
      button('↓', () => moveAddon(index, 1), { class: 'addon-move', 'aria-label': `Mover ${a.manifest.name} para baixo`, disabled: index === state.addons.length - 1 })),
    button('Remover', () => { state.addons = state.addons.filter(x => x.url !== a.url); persist(); metadataCache.clear(); render(); }))));
}
function moveAddon(index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.addons.length) return;
  const next = [...state.addons];
  [next[index], next[target]] = [next[target], next[index]];
  state.addons = next; persist(); metadataCache.clear(); render();
}
function discoveryContext(main,signal) {return {main,signal,el,button,card,state,route,root,persist,navigate};}
function showDiscover(main,signal) {return discoverScreen(discoveryContext(main,signal));}
function showCatalog(main,signal) {return discoverScreen(discoveryContext(main,signal));}
function showSearch(main,signal) {return searchScreen(discoveryContext(main,signal));}
function showCatalogManager(main,signal) {return catalogManager(discoveryContext(main,signal));}
function textDialog(title, body) {
  const previous = document.activeElement;
  const dialog = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title },
    el('section', { class: 'dialog-panel' }, el('h2', {}, title), el('p', { class: 'dialog-copy', tabindex: 0, 'data-focusable': true }, body)));
  const close = button('Fechar', () => { dialog.remove(); previous?.focus({ preventScroll: true }); }, { 'data-dismiss': true });
  dialog.firstChild.append(close); root.append(dialog); close.focus();
}
function metadataContext(main,signal) {return {main,signal,el,button,icon,toast,card,poster,route,root,navigate,textDialog,metadata,ratings,readTrailer:()=>readPlayback(state.settings.playback),qr:url=>{
  const matrix=qrcode(0,'M');matrix.addData(url);matrix.make();const count=matrix.getModuleCount(),canvas=el('canvas',{width:(count+8)*4,height:(count+8)*4,'aria-label':'QR code do trailer',role:'img'}),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(matrix.isDark(r,c))ctx.fillRect((c+4)*4,(r+4)*4,4,4);return canvas;
}};}
async function showDetail(main, signal) {
  let { meta, addon } = route;
  heading(main, meta.type === 'series' ? 'SÉRIE' : 'FILME', meta.name || meta.id);
  // MetaDetailsSkeleton: the fork shows the shape of the screen while the metadata and the
  // add-on response are on the wire, instead of an empty canvas.
  main.append(detailSkeleton(el, { series: meta.type === 'series' }));
  if(meta.id?.startsWith('tmdb:') && metadata.configured()) {
    try {const data=await metadata.detail(meta,signal);if(signal.aborted)return;if(data)meta={...meta,...data.meta};}catch(error){if(signal.aborted)return;}
  }
  const enriched = await loadMeta(meta, addon, signal);
  if (!current(signal) || !enriched) return;
  ({ meta, addon } = enriched);
  main.replaceChildren();
  const backdrop = safeImage(meta.background || meta.fanart);
  main.append(el('div', { class: 'detail-scene' }, backdrop ? el('img', { class: 'detail-backdrop', src: backdrop, alt: '', decoding: 'async', onerror: e => e.target.remove() }) : null, el('div', { class: 'detail-fade' })));
  const go = (id = meta.id, episode) => navigate({ name: 'streams', meta, addon, id, type: meta.type, episode });
  const key = progressKey(meta.type, meta.id);
  const toggleLibrary = button(icon(state.library[key] ? 'check' : 'add'), () => {
    if (!Object.hasOwn(state.libraryOverrides || {}, key) && Object.keys(state.libraryOverrides || {}).length >= 500) { toast('Limite de 500 alterações locais atingido neste perfil.'); return; }
    if (state.library[key]) setLibraryItem(state, key, null);
    else {
      setLibraryItem(state, key, { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background, releaseInfo: meta.releaseInfo });
    }
    persist(); toggleLibrary.replaceChildren(icon(state.library[key] ? 'check' : 'add'));
    toggleLibrary.setAttribute('aria-label', state.library[key] ? 'Remover da biblioteca' : 'Adicionar à biblioteca');
  }, { class: 'round-button', 'aria-label': state.library[key] ? 'Remover da biblioteca' : 'Adicionar à biblioteca' });
  const next = meta.type === 'series' ? nextEpisode(meta, progressWithWatched(state,meta)) : null;
  const resume = meta.type === 'movie' && state.progress[key] && !state.progress[key].complete;
  const watchText = next ? `${next.resume ? 'Retomar' : 'Assistir'}: T${next.video.season}:E${next.video.episode}` : resume ? 'Retomar' : 'Assistir';
  const watch = button([icon('play'), watchText], () => {
    if (next) go(next.video.id, { title: next.video.title, season: next.video.season, episode: next.video.episode });
    else if (meta.type === 'movie') go();
  }, { class: 'primary play-button', disabled: meta.type === 'series' && !next, 'data-initial-focus': meta.type !== 'series' || Boolean(next), 'data-focus': 'detail-play' });
  const watched = button(icon(state.watched[key] ? 'eye' : 'eye-off'), () => {
    try {markWatched(state,meta,!state.watched[key]);persist();} catch(error){toast(error.message);return;}
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
        const status = future ? 'Ainda não lançado' : p?.complete || isWatched(state,{...p,type:meta.type,meta,episode:{season:v.season,episode:v.episode}}) ? 'Assistido' : p ? `Retomar em ${clock(p.time)}` : '';
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
  const extrasReady=detailExtras(metadataContext(main,signal),meta,addon);
  if(route.restoreFocus)await extrasReady;
  main.querySelectorAll('.detail-actions button, .synopsis').forEach(b => b.addEventListener('focus', () => { if (!pointerFocus) main.scrollTop = 0; }));
  // Início rápido: enquanto você lê os detalhes, as fontes já estão sendo buscadas e
  // ranqueadas — a lista abre com o que chegou e o toque em Reproduzir abre a conexão.
  if (prewarmEnabled() && !signal.aborted) prewarm.prepare({ type: meta.type, id: meta.id, episode: route.episode || null, title: meta.name });
}
// One path for every way a source reaches the player, so the link cache sees the
// same choice the fork saves in PlayerRuntimeControllerStreams.
function playStream(context, stream) {
  // Início rápido: a conexão com a fonte é aberta no toque (um Range de 1 byte), antes de o
  // player abrir a URL — é o "opens the network connection at the press" do fork.
  if (prewarmEnabled()) prewarm.warm(stream?.url);
  rememberLink(context, stream);
  navigate({ ...context, name: 'player', stream });
}
// The fork stores the direct URL with the source name; torrents are not reused here
// because this target has no torrent path at all.
function rememberLink(context, stream) {
  if (!stream?.url || !readPlayback(state.settings.playback).reuseLastLink) return;
  const key = linkKey(context.type, context.id);
  if (!key) return;
  state.linkCache = writeLink(state.linkCache, key, { url: stream.url, streamName: stream.name || stream.title, addonName: stream.addonName });
  persist();
}
// CachedStreamLink carries the source name and headers; on webOS the TV plays the
// URL directly, so the entry is rebuilt as a plain HTTP(S) source.
function cachedStream(link) {
  return { name: link.streamName, url: link.url, addonName: link.addonName || 'Link anterior', sourceKey: 'cached-link' };
}
// Avaliação do dispositivo: DeviceAssessmentEngine.kt. Cada linha diz de onde veio (medição,
// hardware, escolha sua ou o que não dá para saber aqui) e o que recomenda; Aplicar escreve o
// patch e Reverter devolve todos os valores anteriores.
function showAssessment(main, signal) {
  heading(main, 'Avançado', 'Avaliação do dispositivo');
  const assessment = state.assessment || buildAssessment({ sweep: state.transportSweep || null, playback: readPlayback(state.settings.playback) });
  const rowsHost = el('div', { class: 'assessment-rows' });
  const patch = assessmentPatch(assessment);
  const status = el('p', { class: 'muted', role: 'status' }, assessmentSummary(assessment));
  rowsHost.replaceChildren(...assessment.rows.map(row => el('div', { class: 'assessment-row' },
    el('div', { class: 'grow' }, el('strong', {}, row.label), el('small', { class: 'muted' }, row.reason)),
    el('span', { class: 'assessment-value' }, row.value),
    el('span', { class: `assessment-source assessment-source-${row.source}` }, assessmentSources[row.source]))));
  const apply = button('Aplicar recomendações', () => {
    // Applier: the snapshot is what makes Revert restore every previous value, even after a restart.
    state.assessmentSnapshot = readPlayback(state.settings.playback);
    state.settings.playback = { ...readPlayback(state.settings.playback), ...patch };
    state.assessment = assessment;
    persist();
    toast(`Aplicado: ${Object.keys(patch).length} ajuste(s). Use Reverter para voltar atrás.`);
    render();
  }, { class: 'primary', disabled: !Object.keys(patch).length });
  const revert = button('Reverter', () => {
    if (!state.assessmentSnapshot) { toast('Nada para reverter.'); return; }
    state.settings.playback = readPlayback(state.assessmentSnapshot);
    delete state.assessmentSnapshot;
    persist(); toast('Valores anteriores restaurados.'); render();
  }, { disabled: !state.assessmentSnapshot });
  main.append(el('section', { class: 'assessment' }, rowsHost, el('div', { class: 'toolbar' }, apply, revert), status,
    el('p', { class: 'muted' }, 'A avaliação usa a última varredura de transporte desta TV (lista de fontes → Varredura de transporte). Linhas marcadas como “não dá para saber aqui” documentam recursos do fork que o webOS não expõe e não são aplicadas.')));
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
  const sourcePrefs = () => readPlayback(state.settings.playback);
  // StreamLinkCacheDataStore: with "Reutilizar último link" on, a valid entry for this
  // content plays straight away. The port reads the cache before asking the add-ons,
  // which is the point of the setting on a TV; the entry is consumed once per visit,
  // so Back from a link that expired on the server always reaches the list.
  if (sourcePrefs().reuseLastLink && !view.visited) {
    const cached = readLink(state.linkCache, linkKey(context.type, context.id), sourcePrefs().reuseLastLinkHours);
    state.linkCache = cached.cache;
    if (cached.link) {
      view.visited = true;
      persist();
      if (!document.hidden) { playStream(context, cachedStream(cached.link)); return; }
    }
  }
  if (view.rows && Date.now() - view.loadedAt > 120000) view.rows = null;
  // Início rápido: o que a tela de detalhes já buscou é usado aqui, sem esqueleto e sem
  // perguntar de novo aos add-ons; se a busca ainda está em voo, esta tela espera a mesma
  // requisição em vez de disparar uma segunda.
  if (!view.rows) {
    const prepared = prewarmEnabled() ? prewarm.take(context) : null;
    if (prepared?.rows?.length) { view.rows = prepared.rows; view.failed = prepared.failed; view.loadedAt = Date.now(); }
  }
  if (!view.rows) {
    const pending = prewarmEnabled() ? prewarm.prepare(context) : null;
    const loading = streamsSkeleton(el, { addons: providers.map(addon => addon.manifest.name) }); main.append(loading);
    const loaded = pending ? await pending.promise : await loadStreamRows(context, { signal });
    if (!current(signal)) return; loading.remove();
    view.rows = loaded.rows ?? [];
    view.failed = loaded.failed ?? 0; view.loadedAt = Date.now();
  }
  const all = view.rows;
  const chooseBest = rows => rankStreams(rows.filter(s => !sourceIssue(s)), state.settings.preferences)[0];
  if ((context.nextPlayback ? context.nextPlayback.auto : autoPlayConfigured(sourcePrefs())) && !view.visited) {
    view.visited = true;
    const prefs = sourcePrefs();
    const best = context.nextPlayback ? nextSource(rankStreams(all.filter(s=>!sourceIssue(s)),state.settings.preferences),context.nextPlayback.bingeGroup,state.settings.playback) : selectAutoPlayStream(all.filter(s=>!sourceIssue(s)), { mode: prefs.autoPlayMode, regex: prefs.autoPlayRegex, preferences: state.settings.preferences, avoidDvOnly: state.settings.avoidDvOnly, allowedAddons: prefs.autoPlayAddons });
    if (best && !document.hidden) { playStream(context, best); return; }
  }
  view.visited = true;
  if (context.nextPlayback) context.nextPlayback = {...context.nextPlayback,count:0};
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
      const node = sourceCard(s,providers,()=>playStream(context, s),!list.childElementCount);
      // The measurement belongs to the card, so a redraw keeps showing it.
      const measured = view.speed?.[s.sourceKey];
      node.append(el('small', { class: 'source-speed', hidden: !measured }, measured ? formatSpeed(measured) : ''));
      list.append(node);
    }
  };
  const toggle = button(view.showAll ? 'Aplicar filtros do fork' : 'Mostrar todas', () => { view.showAll = !view.showAll; toggle.textContent = view.showAll ? 'Aplicar filtros do fork' : 'Mostrar todas'; display(); }, { 'data-focus': 'source-filters' });
  const chips = el('div', { class: 'stream-chips' }, button('Atualizar', () => { view.rows = null; route.restoreFocus = 'source-refresh'; render(); }, { 'data-focus': 'source-refresh', 'aria-label': 'Atualizar fontes' }));
  for (const provider of [null, ...providers.map((_, i) => i)]) chips.append(button(provider === null ? 'Todos' : providers[provider].manifest.name, () => {
    view.provider = provider; [...chips.querySelectorAll('[data-provider]')].forEach(b => b.classList.toggle('selected', b.dataset.provider === String(provider))); display();
  }, { class: provider === view.provider ? 'selected' : '', 'data-provider': String(provider), 'data-focus': `source-addon-${provider}` }));
  const speedNote = el('p', { class: 'stream-speed-note muted', role: 'status' }, 'A medição usa a fonte real, com um orçamento pequeno de bytes.');
  const speedButton = button('Testar velocidade', () => runSpeedTest(), { 'data-focus': 'source-speed', 'aria-label': 'Testar velocidade das fontes' });
  // Varredura de transporte: o StreamSweepEngine do fork, medindo o serviço que o player usa.
  // Cada célula custa bytes reais, então o orçamento, a escada e as paradas são os do fork,
  // reduzidos ao que esta TV pode guardar na memória.
  const sweepPanel = el('div', { class: 'sweep-panel', hidden: true });
  const sweepButton = button('Varredura de transporte', () => runTransportSweep(sweepButton), { 'data-focus': 'source-sweep', 'aria-label': 'Varredura de transporte' });
  const actions = el('div', { class: 'stream-actions' }, button('Reproduzir melhor fonte', () => {
    const best = chooseBest(subset()); best ? playStream(context, best) : toast('Não há fonte HTTP(S) elegível nesta seleção.');
  }, { 'data-focus': 'source-best' }), speedButton, sweepButton, toggle);
  main.append(chips, count, list, speedNote, sweepPanel, actions); display();
  view.speed ||= {};
  // A medição roda sobre a fonte real, pelo mesmo transporte do player. O orçamento é
  // pequeno de propósito: são bytes do usuário (e do debrid), não um benchmark de banda.
  async function runSpeedTest() {
    const candidates = subset().filter(s => /^https?:/i.test(s?.url || '') && !sourceIssue(s)).slice(0, speedBudget.maxSources);
    if (!candidates.length) { toast('Nenhuma fonte HTTP(S) elegível para medir nesta seleção.'); return; }
    speedButton.disabled = true;
    speedNote.textContent = `Medindo ${candidates.length} fonte(s) com até ${Math.round(speedBudget.measureBytes / 1048576)} MB cada…`;
    try {
      await measureSources(candidates.map(s => ({ key: s.sourceKey, url: s.url })), { signal, onResult: (key, result) => { view.speed[key] = result; paintSpeed(); } });
      if (!signal.aborted) speedNote.textContent = `Medição feita sobre a fonte real. Até ${Math.round(speedBudget.measureBytes / 1048576)} MB por fonte; a lista e a escolha automática não mudam.`;
    } catch (error) {
      if (!signal.aborted) speedNote.textContent = `Não foi possível medir: ${error.message}`;
    } finally { if (!disposedButton()) speedButton.disabled = false; }
  }
  const disposedButton = () => !document.body.contains(speedButton);
  function paintSpeed() {
    for (const node of list.querySelectorAll('.source')) {
      const result = view.speed?.[node.dataset.focus];
      const host = node.querySelector('.source-speed');
      if (!host) continue;
      host.textContent = result ? formatSpeed(result) : '';
      host.hidden = !result;
    }
  }
  // StreamSweepEngine.run: as células, as paradas e o veredito vivem em
  // core/transport-sweep.js; aqui a TV mostra as linhas, aplica o vencedor e explica o alvo.
  // O alvo é 2× o bitrate médio do último título — o medido pelo HUD, quando ele já rodou, ou
  // o que a própria fonte informa quando o tamanho e a duração são conhecidos.
  function sourceBitrateMbps(stream, meta) {
    const bytes = sizeBytes(stream);
    const minutes = Number(String(meta?.runtime || '').match(/\d+/)?.[0]);
    if (!(bytes > 0) || !(minutes > 0)) return null;
    return (bytes * 8) / (minutes * 60) / 1e6;
  }
  async function runTransportSweep(trigger) {
    const settings = readMediaTransport(readPlayback(state.settings.playback));
    const candidates = subset().filter(s => directFileURL(s?.url) && !sourceIssue(s));
    const target = rankStreams(candidates, state.settings.preferences)[0];
    if (!target) { toast('Nenhuma fonte HTTP(S) direta nesta seleção. Playlists e torrents não passam pelo serviço.'); return; }
    const bitrate = sourceBitrateMbps(target, context.meta);
    const targetMbps = sweepTarget(bitrate);
    sweepPanel.hidden = false;
    sweepPanel.replaceChildren(
      el('h3', {}, 'Varredura de transporte'),
      el('p', { class: 'muted' }, `Fonte medida: ${target.name || target.title || 'fonte'} · janela de ${settings.windowMb} MB · ${targetMbps ? `alvo 2× o bitrate informado (${(bitrate).toFixed(1).replace('.', ',')} Mbps)` : 'sem bitrate conhecido: a varredura mede o transporte e para no vencedor'}`),
      el('div', { class: 'sweep-rows' }),
      el('p', { class: 'sweep-verdict muted', role: 'status' }, 'Medindo…'));
    trigger.disabled = true;
    const rowHost = sweepPanel.querySelector('.sweep-rows'), verdictHost = sweepPanel.querySelector('.sweep-verdict');
    const renderRow = row => {
      const cell = `${row.connections}:${row.chunkMb}`;
      const existing = rowHost.querySelector(`[data-cell="${cell}"]`);
      const node = existing || el('div', { class: 'sweep-row', 'data-cell': cell });
      const detail = row.measuring ? 'medindo…' : row.skipped ? row.note : row.ok ? [formatMbps(row.mbps), stabilityText(row.stability), row.note].filter(Boolean).join(' · ') : row.note;
      node.replaceChildren(el('strong', {}, row.label), el('span', { class: 'muted' }, detail || ''));
      if (!existing) rowHost.append(node);
    };
    try {
      const outcome = await runSweep({ windowMb: settings.windowMb, targetMbps, signal, onCell: renderRow, measure: cell => measureTransport({ stream: target, ...cell, signal }) });
      if (signal.aborted) return;
      verdictHost.textContent = outcome.verdict.text;
      // A avaliação do dispositivo consome esta medição: só o que foi medido vira recomendação.
      state.transportSweep = {
        at: Date.now(), source: target.name || target.title || 'fonte', targetMbps: outcome.targetMbps ?? null,
        best: outcome.best ? { connections: outcome.best.connections, chunkMb: outcome.best.chunkMb, mbps: outcome.best.mbps, stability: outcome.best.stability } : null,
        rows: outcome.rows.map(row => ({ label: row.label, mbps: row.mbps, note: row.note, skipped: Boolean(row.skipped) }))
      };
      persist();
      const winner = outcome.verdict.apply ? outcome.verdict.settings : null;
      if (winner) sweepPanel.append(el('div', { class: 'toolbar' }, button(`Usar ${winner.connections}× ${winner.chunkMb} MB`, () => {
        const prefs = readPlayback(state.settings.playback);
        state.settings.playback = { ...prefs, localMediaService: true, mediaConnections: winner.connections, mediaChunkMb: winner.chunkMb, mediaWindowMb: Math.max(settings.windowMb, winner.connections * winner.chunkMb) };
        persist();
        toast(`Transporte local: ${winner.connections}× ${winner.chunkMb} MB. Vale para as próximas reproduções.`);
        sweepButton.focus();
      }, { 'data-focus': 'sweep-apply' })));
    } catch (error) {
      if (!signal.aborted) verdictHost.textContent = error?.name === 'AbortError' ? 'Varredura cancelada.' : `Não foi possível medir: ${error.message}`;
    } finally { if (document.body.contains(trigger)) trigger.disabled = false; }
  }
}
function sourceCard(s,providers,choose,initial=false) {
  const f=factsFor(s,state.settings.preferences),issue=sourceIssue(s);
  const badges=[labels[f.resolution],labels[f.quality],labels[f.encode],...(f.visualTags || []).map(v=>labels[v]),...(f.audioTags || []).map(v=>labels[v]),...(f.audioChannels || []).map(v=>labels[v]),f.releaseGroup,bytes(sizeBytes(s))].filter(v=>v && !/unknown|desconhecid|not available/i.test(v));
  const logo=providers[s.sourceProvider]?.manifest.logo;
  return button([el('div',{class:'source-heading'},el('div',{class:'grow'},el('strong',{},s.name || s.title || 'Fonte'),el('span',{class:'source-addon'},s.addonName)),logo?poster(logo,s.addonName,'source-icon'):null),el('p',{},s.description || s.title || ''),el('div',{class:'source-badges'},[...new Set(badges)].map(value=>el('span',{},value))),issue?el('small',{class:'warning'},issue):null],()=>issue?toast(issue):choose(),{class:`source ${issue?'unavailable':''}`,'aria-disabled':issue?'true':null,'data-focus':s.sourceKey,'data-initial-focus':initial});
}
function syncSummary(result) {
  if (result.failed) return `${result.imported} addon(s) carregado(s); ${result.failed} não responderam. Tente sincronizar novamente.`;
  return result.imported ? `${result.imported} addon(s) da conta carregado(s).` : 'Nenhum addon habilitado neste perfil da conta.';
}
async function syncAccount(signal) {
  if (!profileAccess) throw Error('Selecione um perfil antes de sincronizar.');
  const profileId = profileAccess.id;
  const result = await importAccountAddons(account, state, { signal, profileId, addonProfileId: profileAccess.usesPrimaryAddons ? 1 : profileId });
  persist(); metadataCache.clear(); return result;
}
async function syncLibrary(signal) {
  const access = profileAccess;
  if (!access) throw Error('Selecione um perfil antes de carregar a biblioteca.');
  const library = await account.library(access.id, signal);
  if (signal.aborted || access !== profileAccess || account.user?.id !== access.userId) throw new DOMException('Cancelado', 'AbortError');
  mergeLibrary(state, library, access.id); persist(); return state.librarySync;
}
async function syncHistory(signal) {
  const access=profileAccess;
  if(!access)throw Error('Selecione um perfil para carregar o histórico.');
  const snapshot=await account.history(access.id,signal);
  if(signal.aborted || access!==profileAccess || account.user?.id!==access.userId)throw new DOMException('Cancelado','AbortError');
  mergeHistory(state,snapshot,{profileId:access.id,sourcePreference:snapshot.sourcePreference});persist();return state.historySync;
}
// CollectionSyncService.pullFromRemote: collections built in another client (the Android
// app, for example) live in the profile blob, so the TV reads them instead of starting empty.
async function syncCollections(signal) {
  const access = profileAccess;
  if (!access) throw Error('Selecione um perfil para carregar as coleções.');
  const remote = await account.collections(access.id, signal);
  if (signal.aborted || access !== profileAccess || account.user?.id !== access.userId) throw new DOMException('Cancelado', 'AbortError');
  if (!remote.present || !remote.collections.length) return { collections: (state.collections || []).length, imported: 0 };
  const parsed = parseAccountCollections(remote.collections);
  if (!parsed.length) return { collections: (state.collections || []).length, imported: 0 };
  state.collections = parsed;
  state.collectionsSync = { at: Date.now(), collections: parsed.length, source: 'account' };
  persist();
  return { collections: parsed.length, imported: parsed.length };
}
// CollectionSyncService.triggerPush, debounced: edits made here travel back to the account
// so the other client keeps seeing the same collections.
function scheduleCollectionsPush() {
  if (!profileAccess || !account.user) return;
  clearTimeout(collectionsPushTimer);
  collectionsPushTimer = setTimeout(async () => {
    const access = profileAccess;
    if (!access || !account.user) return;
    try {
      await account.pushCollections(access.id, toAccountCollections(state.collections || []), state.syncClientId, undefined);
      state.collectionsSync = { ...(state.collectionsSync || {}), pushedAt: Date.now() };
      persist();
    } catch (error) { toast(`Coleções: ${error.message}`); }
  }, 900);
}

async function signOutProfiles() {
  stopSync();
  const signedOutUser = account.user?.id;
  request?.abort(); profileAccess = null;
  const revoked = await account.signOut();
  leaveAccountProfiles(state, signedOutUser); detachAccountAddons(state); state.guestMode = true; persist(); metadataCache.clear(); stack = [];
  navigate({ name: 'settings', category: 'account' }, true);
  if (!revoked) toast('Login removido desta TV. Não foi possível confirmar a revogação no servidor; gerencie dispositivos na conta Nuvio.');
}
async function showProfiles(main, signal) {
  stopSync();
  profileAccess = null; stack = []; metadataCache.clear();
  await profileScreen(main, signal, { account, el, button, poster, automatic: route.automatic,
    signOut: signOutProfiles,
    choose: async profile => {
      if (signal.aborted || !account.user) return;
      activateProfile(state, account.user.id, profile);
      profileAccess = { ...profile, userId: account.user.id }; state.guestMode = false;
      initializeHistory(state);initializeOutbox(state);persist();
      const results = await Promise.allSettled([syncAccount(signal), syncLibrary(signal), syncHistory(signal), syncCollections(signal)]);
      if (signal.aborted) return;
      if (!account.user) { profileAccess = null; leaveAccountProfiles(state); persist(); navigate({ name: 'welcome' }, true); return; }
      const addonResult = results[0], libraryResult = results[1];
      const messages = [];
      if (addonResult.status === 'rejected') messages.push(addonResult.reason.message);
      if (libraryResult.status === 'rejected') messages.push(`Biblioteca: ${libraryResult.reason.message}`);
      if (results[2].status === 'rejected') messages.push(`Histórico: ${results[2].reason.message}`);
      // A coleção que não carregou fica registrada para a tela de Coleções: o login não
      // vira uma pilha de mensagens por causa de um blob secundário.
      state.collectionsSync = results[3].status === 'rejected'
        ? { ...(state.collectionsSync || {}), error: results[3].reason.message }
        : { ...(state.collectionsSync || {}), error: '' };
      // Entrar na conta leva para a Home. O resumo de addons que não responderam fica em
      // Ajustes → Conta, sem interromper a chegada com uma mensagem: a contagem que o resumo
      // usa já foi gravada pelo sincronismo, e uma falha total continua virando aviso.
      stack = []; navigate({ name: 'home' }, true);
      if (messages.length) toast(messages.join(' '));
      persist();
    }
  });
}
function authBrand() {
  return el('div', { class: 'auth-brand-panel' }, el('img', { src: 'assets/wordmark.png', alt: 'Nuvio', class: 'auth-brand' }), el('h1', {}, 'Sua conta Nuvio.\nAgora na sua TV.'), el('p', {}, 'Conecte a conta que você já usa para carregar os addons do seu perfil.'), el('small', {}, 'Você autoriza a vinculação no site do Nuvio, pelo celular.'));
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
        state.guestMode = false; persist(); stack = []; profileAccess = null;
        navigate({ name: 'profiles', automatic: true }, true);
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
function settingsContext(main, signal) {
  return {
    main, signal, el, button, icon, state, persist, navigate, toast, route, account, layout,
    applyLayout: () => { applyLayout(); appearance(); },
    applyAppearance: () => appearance(),
    signOutProfiles: () => signOutProfiles(),
    syncAccount: () => syncAccount(signal), syncSummary, outboundSummary, historySummary,
    metadata, ratings, clearMetadataCache: () => metadataCache.clear(), textDialog,
    profileName: () => profileAccess?.name || 'Perfil',
    switchProfile: () => { profileAccess = null; stack = []; navigate({ name: 'profiles', automatic: false }, true); },
    version: appVersion, base: 'Base: ysosrs123/NuvioTV-Fork · 45e0984'
  };
}
function showSettings(main, signal) { settingsScreen(settingsContext(main, signal)); }
// CollectionsDataStore + CollectionManagementScreen/CollectionEditorScreen: the extra
// rows of the Home, built from add-on catalogs and TMDB sources, edited on the TV.
function collectionsContext(main, signal) {
  return { main, signal, el, button, icon, state, persist, navigate, toast, route,
    account: account.user ? { email: account.user.email } : null,
    addonInstalled: source => state.addons.some(addon => (source?.addonId && addon.manifest.id === source.addonId) || (source?.addonUrl && addon.url === source.addonUrl)),
    pushCollections: () => scheduleCollectionsPush(),
    syncCollections: () => syncCollections(signal),
    syncStatus: () => state.collectionsSync || null };
}
function showCollections(main, signal) { collectionsScreen(collectionsContext(main, signal)); }
function showCollectionEditor(main, signal) { collectionEditorScreen(collectionsContext(main, signal)); }
// Collection folder detail: FolderDetailScreen — the folder header with its cover, one tab per
// source showing the name and whether it is a movie or a series, and the titles in a grid.
async function showCollectionSource(main, signal) {
  const rail = { collectionId: route.collectionId, folderId: route.folderId };
  const collection = (state.collections || []).find(entry => entry.id === rail.collectionId);
  const folder = collection?.folders.find(entry => entry.id === rail.folderId);
  if (!folder) { heading(main, 'COLEÇÃO', 'Pasta removida'); notice(main, 'Esta pasta não existe mais nesta coleção.'); return; }
  const cover = folderCover(folder);
  const preview = cover.image ? el('img', { class: `collection-heading-cover ${cover.shape === 'LANDSCAPE' ? 'landscape' : cover.shape === 'POSTER' ? 'poster' : ''}`, src: cover.image, alt: '', onerror: event => event.target.remove() }) : null;
  main.append(el('div', { class: 'heading collection-heading' }, preview,
    el('div', { class: 'grow' }, el('h1', {}, folder.title), el('p', { class: 'muted' }, `${collection.title} · ${folder.sources.length} fonte(s)`))));
  const tabs = el('div', { class: 'collection-tabs' });
  const list = el('div', { class: 'collection-grid' });
  const status = el('p', { class: 'muted', role: 'status' });
  main.append(tabs, status, list);
  let selected = 0;
  async function draw() {
    const source = folder.sources[selected];
    for (const [index, node] of [...tabs.children].entries()) { node.classList.toggle('selected', index === selected); node.setAttribute('aria-pressed', String(index === selected)); }
    list.replaceChildren(railSkeleton(el, { cards: 6, landscape: layout.landscapePosters }));
    try {
      const data = await fetchCollectionSource(source, signal);
      if (signal.aborted) return;
      status.textContent = `${data.items.length} título(s) · ${describeSource(source)}`;
      list.replaceChildren(...(data.items.length ? data.items.slice(0, 100).map((meta, index) => card(meta, data.addon, null, `collection-${index}`, { portrait: layout.landscapePosters })) : [el('p', { class: 'notice' }, 'Esta fonte não devolveu títulos.')]));
    } catch (error) { if (!signal.aborted) { status.textContent = error.message; list.replaceChildren(); } }
  }
  // The tab carries the source name and, under it, the type (FolderDetailScreen's type suffix).
  folder.sources.forEach((source, index) => tabs.append(button([el('strong', {}, describeSource(source)), sourceTypeLabel(source) ? el('small', {}, sourceTypeLabel(source)) : null],
    () => { selected = index; draw(); },
    { class: `collection-tab${index === selected ? ' selected' : ''}`, 'aria-label': `Fonte ${describeSource(source)}${sourceTypeLabel(source) ? ` · ${sourceTypeLabel(source)}` : ''}`, 'aria-pressed': String(index === selected), 'data-focus': `collection-source-${index}` })));
  main.append(el('div', { class: 'toolbar' }, button('Voltar para Coleções', () => navigate({ name: 'collections' }), { 'aria-label': 'Voltar para Coleções' })));
  draw();
}
// One fetch for both families: an add-on catalog response or a TMDB source.
async function fetchCollectionSource(source, signal) {
  if (source?.kind === 'tmdb') {
    const data = await metadata.source(source, signal);
    return { title: data.title, items: data.items, addon: null };
  }
  const addon = state.addons.find(entry => (source?.addonId && entry.manifest.id === source.addonId) || (source?.addonUrl && entry.url === source.addonUrl));
  if (!addon) throw Error(source?.addonId ? `O add-on “${source.addonId}” desta coleção não está instalado nesta TV.` : 'O add-on desta coleção não está instalado nesta TV.');
  const data = parseCatalogPage(await cachedMetaJSON(resourceURL(addon, 'catalog', source.type, source.catalogId, source.genre ? { genre: source.genre } : {}), signal), source.type);
  return { title: source.catalogName || source.catalogId, items: data.items.map(item => ({ ...item, type: item.type || source.type })), addon, catalog: { id: source.catalogId, type: source.type, name: source.catalogName }, genre: source.genre };
}
// The fork keeps subtitle appearance inside Reprodução → Legendas. The editor is the
// same component the player panel opens, so both paths write a single setting, and it
// re-renders itself because the player panel used to rebuild it.
function showSubtitleAppearance(main) {
  state.settings.subtitleStyle = readSubtitleStyle(state.settings.subtitleStyle);
  heading(main, '', 'Aparência das legendas', 'Tamanho, cores, contorno e posição salvos nesta TV.');
  const host = el('div', { class: 'subtitle-appearance' });
  const draw = () => host.replaceChildren(subtitleStyleEditor({ el, button, value: state.settings.subtitleStyle, change: value => {
    const control = document.activeElement?.getAttribute('aria-label');
    state.settings.subtitleStyle = readSubtitleStyle(value); persist(); draw();
    if (control) host.querySelector(`button[aria-label="${control}"]`)?.focus({ preventScroll: true });
  } }));
  draw();
  main.append(host, el('p', { class: 'muted' }, 'A família Netflix Sans é fixa; o player usa estes valores na hora e o padrão do fork pode ser restaurado no próprio editor.'));
}
function showPreferences(main) {
  const kit = createSettingsKit({ el, button, icon, toast });
  const pane = el('div', { class: 'settings-pane' });
  const pref = (key) => state.settings.preferences[key] ?? defaults[key];
  const save = (message) => { persist(); draw(); if (message) toast(message); };
  // DirectDebridStreamFilter: the fork splits the list on comma or newline and drops duplicates.
  const listLine = (key, value) => { state.settings.preferences[key] = [...new Set(value.split(/[\n,]/).map(x => x.trim()).filter(Boolean))]; save('Preferência salva.'); };
  function draw() {
    const automation = readPlayback(state.settings.playback);
    const chips = (title, key, entries) => kit.choices(title, ...entries.map(entry => kit.chip(entry.label, pref(key).includes(entry.id), () => {
      const list = new Set(pref(key));
      list.has(entry.id) ? list.delete(entry.id) : list.add(entry.id);
      state.settings.preferences[key] = [...list]; save();
    }, `Manter ${entry.label} na lista`)));
    pane.replaceChildren(
      kit.header('Preferências de fontes', 'Filtros, grupos de release e compatibilidade com a LG.'),
      kit.group('Dispositivo', 'O que esta TV aceita',
        kit.toggle('Evitar fontes anunciadas como somente Dolby Vision', 'Perfil LG UT8050: HDR10 e HLG, segundo o que o add-on informa.', () => state.settings.avoidDvOnly, value => { state.settings.avoidDvOnly = value; save(); })),
      kit.group('Reprodução automática', 'Quem escolhe a fonte', 
        kit.row('Seleção de fonte, último link e trailer', 'Ajustes → Reprodução → Reprodução automática',
          () => navigate({ name: 'settings', category: 'playback' }), { value: autoPlayModeLabel(automation.autoPlayMode), attrs: { 'data-focus': 'preferences-automation' } })),
      kit.group('Filtros e ordem de qualidade', 'Grupos, codecs, qualidades e limite de fontes',
        kit.row('Grupos excluídos', 'Separe por vírgula; o port não mostra fontes destes grupos', () => kit.prompt('Grupos excluídos', 'Separe os nomes por vírgula.', pref('excludedReleaseGroups').join('\n'), value => listLine('excludedReleaseGroups', value)), { value: `${pref('excludedReleaseGroups').length} grupo(s)` }),
        kit.row('Ordem dos grupos preferidos', 'A ordem em que os grupos sobem no ranking', () => kit.prompt('Ordem dos grupos preferidos', 'Separe os nomes por vírgula, do mais preferido para o menos.', pref('preferredReleaseGroups').join('\n'), value => listLine('preferredReleaseGroups', value)), { value: `${pref('preferredReleaseGroups').length} grupo(s)` }),
        chips('Codecs excluídos', 'excludedEncodes', enums.DebridStreamEncode.entries),
        chips('Qualidades excluídas', 'excludedQualities', enums.DebridStreamQuality.entries),
        kit.row('Máximo de fontes filtradas', '0 deixa a lista sem limite', () => kit.prompt('Máximo de fontes filtradas', 'Entre 0 e 100. Zero significa sem limite.', String(pref('maxResults')), value => {
          const parsed = Math.max(0, Math.min(100, Math.floor(Number(String(value).trim()) || 0)));
          state.settings.preferences.maxResults = parsed; save('Limite salvo.');
        }), { value: pref('maxResults') === 0 ? 'Sem limite' : String(pref('maxResults')) }),
        kit.row('Restaurar preferências do fork', 'Volta aos padrões do código de referência', () => { state.settings.preferences = {}; save('Preferências originais restauradas.'); })),
      kit.note('Base: ysosrs123/NuvioTV-Fork · 45e0984. Downloads paralelos, debrid direto, torrents e áudio avançado continuam em adaptação.'));
  }
  main.append(el('div', { class: 'settings-workspace settings-workspace-single' }, pane));
  draw();
}
function clock(value) { const s = Math.max(0, Math.floor(value || 0)); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function bytes(n) { return Number.isFinite(n) && n > 0 ? `${(n / 1024 ** 3).toFixed(2)} GB` : ''; }
function showPlayer(context) {
  root.replaceChildren();
  const video = el('video', { autoplay: true, playsinline: true, preload: 'metadata' });
  // LoadingOverlay.kt + PlayerBufferingIndicator: the loading screen replaces the old status bar
  // that floated at the top of the panel.
  const loading = installLoadingOverlay({ el, context });
  // TrailerPlayer: the post-play trailer plays inside the port, and the TV's YouTube app and the
  // TV browser stay one key away when the proxy cannot present a frame.
  const trailerPlayer = installTrailerPlayer({ root, el, button, signal: request.signal, external: { launch: (id, options) => launchTrailer(id, { signal: request.signal, ...options }) } });
  const stats = el('pre', { class: 'stats', hidden: true });
  const chrome=playerUI({el,button,context,video,toggle,restart:()=>{seekTo(0);play();},audio:()=>tracks.openAudio(),subtitles:()=>tracks.openSubtitles(),sources:()=>episodes.openCurrent(),episodes:()=>episodes.open(),speed:()=>tracks.openSpeed(),aspect:()=>aspect.cycle(),stats:()=>{stats.hidden=!stats.hidden;screen.classList.toggle('stats-visible',!stats.hidden);chrome.info.setAttribute('aria-pressed',String(!stats.hidden));updateStats();}});
  const {controls,timeline,pause}=chrome;
  const screen = el('div', { class: 'player-screen controls-visible' }, video, chrome.top, loading.element, stats, controls); root.append(screen);
  let disposed = false, manuallyHidden=false, hideTimer, savedAt = 0, resumeApplied = false, episodes, seekPreview, pauseOverlay, segments, thumbnails, parental, postPlay, postPlayCandidates = [];
  // Local media transport (ParallelRangeDataSource): when the user turns it on the player reads
  // from 127.0.0.1 and the service pulls the ranges. `localMedia` keeps the handle so it can be
  // reported in the HUD and stopped with the player.
  let localMedia = null, localStats = null, localStatsAt = 0;
  const aspect=installAspect({video,settings:state.settings,persist,notify:toast});
  const listeners = [];
  const on = (event, fn) => { video.addEventListener(event, fn); listeners.push([event, fn]); };
  const resume = state.progress[progressKey(context.type, context.id)];
  const tracks = installTrackControls({ screen, video, context, addons: state.addons, settings: state.settings, memoryState:state, persist, el, button,
    onOpen: () => { clearTimeout(hideTimer); controls.classList.add('faded'); controls.inert=true; screen.classList.remove('controls-visible'); upNext.refresh(); }, onClose: ()=>{reveal();upNext.refresh();} });
  const upNext = installNextEpisode({screen,video,context,settings:state.settings,el,button,
    loadMeta:async()=> (await loadMeta(context.meta,context.addon,request.signal)).meta,
    modalOpen:()=>tracks.isOpen() || Boolean(episodes?.isOpen()) || Boolean(seekPreview?.active()) || Boolean(pauseOverlay?.isOpen()), restoreFocus:()=>{reveal();pause.focus();},
    stopPlayback:()=>back(true),
    advance:(episode,auto,count)=>{
      // Drop earlier episode routes so binge playback cannot grow navigation indefinitely.
      while (['player','streams'].includes(stack.at(-1)?.route.name)) stack.pop();
      navigate({name:'streams',meta:context.meta,addon:context.addon,id:episode.id,type:context.type,
        episode:{title:episode.title,season:episode.season,episode:episode.episode},
        nextPlayback:{auto,count,bingeGroup:context.stream.behaviorHints?.bingeGroup || null}},true);
    }});
  episodes=installEpisodePanel({screen,context,state,el,button,poster,sourceCard,
    playCurrent:stream=>{save();rememberLink(context,stream);navigate({...context,stream,nextPlayback:{...context.nextPlayback,auto:false,count:0}},true);},
    loadMeta:async signal=>(await loadMeta(context.meta,context.addon,signal))?.meta,
    onOpen:()=>{clearTimeout(hideTimer);controls.classList.add('faded');controls.inert=true;screen.classList.remove('controls-visible');upNext.refresh();},
    onClose:()=>{reveal();upNext.refresh();},
    play:(episode,stream,meta)=>{
      while(['player','streams'].includes(stack.at(-1)?.route.name))stack.pop();
      const target={name:'streams',meta,addon:context.addon,id:episode.id,type:context.type,episode:{title:episode.title,season:episode.season,episode:episode.episode},nextPlayback:{auto:false,count:0}};
      rememberLink({type:context.type,id:episode.id},stream);
      stack.push({route:target,focus:stream.sourceKey});navigate({...target,name:'player',stream},true);
    }});
  function save() { try {recordProgress(state, { ...context, time: video.currentTime, duration: video.duration });persist();} catch(error){toast(error.message);} }
  function hideControls(){manuallyHidden=true;clearTimeout(hideTimer);controls.classList.add('faded');controls.inert=true;screen.classList.remove('controls-visible');}
  function reveal() { manuallyHidden=false; pauseOverlay?.interaction(); postPlay?.refresh(); if (pauseOverlay?.isOpen() || postPlay?.isOpen() || tracks.isOpen() || upNext.isOpen() || episodes?.isOpen()) { clearTimeout(hideTimer); controls.classList.add('faded'); controls.inert=true; screen.classList.remove('controls-visible'); return; } controls.classList.remove('faded'); controls.inert=false; screen.classList.add('controls-visible'); clearTimeout(hideTimer); if (!video.paused && !tracks.isOpen() && !seekPreview.active()) hideTimer = setTimeout(() => { controls.classList.add('faded'); controls.inert=true; screen.classList.remove('controls-visible'); }, 4500); }
  const overlayBlocked=()=>tracks.isOpen() || upNext.isOpen() || episodes.isOpen() || Boolean(pauseOverlay?.isOpen()) || !stats.hidden;
  thumbnails=installThumbnails({screen,video,context,settings:state.settings,el,blocked:overlayBlocked,onUnavailable:message=>toast(message)});
  seekPreview=installSeek({video,timeline,update:updateTimeline,reveal,thumbnails});
  segments=installSegments({screen,video,context,settings:state.settings,el,button,blocked:()=>overlayBlocked() || seekPreview.active() || upNext.focused(),onIntervals:items=>{context.skipIntervals=items;upNext.refresh();},seek:seekTo,restore:()=>{if(screen.classList.contains('controls-visible'))pause.focus();else document.activeElement?.blur();}});
  pauseOverlay=installPauseOverlay({screen,video,context,settings:state.settings,el,button,blocked:()=>tracks.isOpen() || upNext.isOpen() || episodes.isOpen() || seekPreview.active() || !stats.hidden || chrome.more.getAttribute('aria-expanded')==='true',onOpen:()=>{hideControls();upNext.refresh();},onClose:()=>{reveal();pause.focus();upNext.refresh();},resume:play});
  // Ajustes → Reprodução → Avisos de conteúdo: fetched from the profile IMDb id and
  // shown once per playback, exactly like ParentalGuideOverlay.
  parental=installParentalGuide({screen,video,context,settings:state.settings,el,request:getJSON,signal:request.signal,
    blocked:()=>tracks.isOpen() || upNext.isOpen() || episodes.isOpen() || seekPreview.active() || pauseOverlay.isOpen() || postPlay?.isOpen() || !stats.hidden});
  // Pós-reprodução: the fork's recommendation overlay. Series keep the Up Next card
  // while a following episode is offerable, so only one prompt is on screen.
  postPlay=installPostPlay({screen,video,context,settings:state.settings,el,button,poster,
    recommendations:()=>postPlayCandidates,
    // TrailerSettingsDataStore + PostPlayRecommendationController: "Trailer automático"
    // plays the recommendation's trailer at the end of a movie. The fork resolves the
    // candidate's trailer with the rest of its details; the port asks TMDB once, when
    // the countdown reaches the trailer, and opens it the same way the detail screen does.
    trailer:{
      enabled:()=>readPlayback(state.settings.playback).trailerAutoPlay,
      resolve:async item=>{ if(!metadata.configured())return ''; const data=await metadata.detail({...item,id:item.id,type:item.type},request.signal); const list=data?trailers(data.meta):[]; return list[0]?.ytId || ''; },
      launch:ytId=>{ if(!trailerPlayer.open({ytId},{})) throw Error('Trailer indisponível.'); }
    },
    // The fork resolves the candidate through the addons before playing it. The port
    // asks TMDB for the same title so the detail screen gets the IMDb id addons route by.
    open:async item=>{
      while(['player','streams'].includes(stack.at(-1)?.route.name))stack.pop();
      let target=item;
      if(metadata.configured()){
        try {const data=await metadata.detail(item,request.signal);if(data?.meta)target={...item,...data.meta,tmdbId:item.tmdbId};}catch {}
      }
      navigate({name:'detail',meta:target,addon:context.addon},true);
    },
    blocked:()=>tracks.isOpen() || upNext.isOpen() || episodes.isOpen() || seekPreview.active() || !stats.hidden || pauseOverlay.isOpen() || chrome.more.getAttribute('aria-expanded')==='true',
    defer:()=>context.type==='series' && upNext.hasNext(),
    onOpen:()=>hideControls(),
    restoreFocus:()=>{reveal();pause.focus();}});
  const clockTimer=setInterval(()=>{if(!document.hidden && screen.classList.contains('controls-visible'))chrome.updateClock();},1000);
  chrome.updateClock();
  function seekTo(target) { if (Number.isFinite(target) && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.max(0, Math.min(video.duration - 0.1, target)); reveal(); }
  async function play() { try { await video.play(); } catch { if (!disposed) { loading.show('Pressione Reproduzir para iniciar.'); chrome.setPlaying(false); } } }
  function toggle() { video.paused ? play() : pauseOverlay.manualPause(); reveal(); }
  // Stats for nerds: only what the TV can be measured to do. The decoded byte counters are
  // the only honest bitrate source in a web player, so they are labelled as an average of
  // what was decoded, not as a header value; what the platform does not expose stays
  // "não medido" instead of being invented.
  function decodedMbps(bytes) {
    const seconds = video.currentTime;
    if (!Number.isFinite(bytes) || bytes <= 0 || !(seconds > 1)) return null;
    return (bytes * 8) / seconds / 1000;
  }
  function refreshLocalStats() {
    if (!localMedia) return Promise.resolve(null);
    if (localStats && Date.now() - localStatsAt < 2000) return Promise.resolve(localStats);
    return readLocalMediaStats(localMedia.token).then(result => {
      if (result && !disposed) { localStats = result; localStatsAt = Date.now(); }
      return localStats;
    });
  }
  function transportText() {
    if (!localMedia) return 'Transporte: player nativo / HTTP(S)';
    const measured = transportLabel(localMedia.settings);
    if (!localStats) return `Transporte: local · ${measured}`;
    const rows = [measured];
    if (localStats.mbps > 0) rows.push(`${formatSpeed({ mbps: localStats.mbps, latencyMs: null }).split(' · ')[0]} medidos`);
    rows.push(`${formatBytes(localStats.bytesFetched)} buscados`, `${formatBytes(localStats.bytesServed)} entregues`);
    if (localStats.discardedBytes > 0) rows.push(`${formatBytes(localStats.discardedBytes)} descartados`);
    if (localStats.failed > 0) rows.push(`${localStats.failed} bloco(s) com falha`);
    return `Transporte: local · ${rows.join(' · ')}`;
  }
  function updateStats() {
    refreshLocalStats();
    if (stats.hidden) return;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) buffered = video.buffered.end(i) - video.currentTime;
    const q = video.getVideoPlaybackQuality?.();
    const videoMbps = decodedMbps(Number(video.webkitVideoDecodedByteCount));
    const audioMbps = decodedMbps(Number(video.webkitAudioDecodedByteCount));
    const audio = mediaTracks(video, 'audio').find(track => track.selected);
    const lines = [
      `Resolução decodificada: ${video.videoWidth || '—'} × ${video.videoHeight || '—'}`,
      videoMbps ? `Bitrate de vídeo (média medida): ≈ ${videoMbps.toFixed(videoMbps >= 10 ? 0 : 1).replace('.', ',')} Mbps` : 'Bitrate de vídeo: a TV não expõe os bytes decodificados',
      audioMbps ? `Bitrate de áudio (média medida): ≈ ${audioMbps.toFixed(1).replace('.', ',')} Mbps` : 'Bitrate de áudio: a TV não expõe os bytes decodificados',
      `Buffer disponível: ${buffered.toFixed(1)} s${playbackPrefs().customBuffer ? ` (alvo ${initialTarget(playbackPrefs())} s / ${rebufferTarget(playbackPrefs())} s)` : ''}`,
      q ? `Frames: ${q.droppedVideoFrames} perdidos de ${q.totalVideoFrames}` : 'Frames: indisponível nesta TV',
      `Faixa de áudio: ${audio ? `${audio.name} · ${audio.language}` : 'a TV não expõe a lista de faixas'}`,
      `Fonte: ${context.stream.addonName || 'direta'}`,
      transportText(),
      'HDR e saída de áudio: não medidos pela TV'
    ];
    stats.textContent = lines.join('\n');
  }
  on('loadedmetadata', () => { timeline.disabled = !Number.isFinite(video.duration) || video.duration <= 0; timeline.max = timeline.disabled ? 1 : video.duration; if (!resumeApplied && resume && !resume.complete && resume.time < video.duration - 10) { video.currentTime = resume.time; toast(`Retomando em ${clock(resume.time)}.`); } resumeApplied = true; if (pendingStart) { const target = pendingStart; pendingStart = 0; (async () => { try { await waitBuffer(target); } catch { return; } if (!disposed) await beginPlayback(); })(); } });
  // Buffer e Rede: the visual series needs the initial play, not a stall before it started.
  on('playing', () => { hasStarted = true; loading.ready(); chrome.setPlaying(true); reveal(); trackingStart(); });
  // Buffer e Rede: with the custom buffer on, the TV waits for the configured amount of
  // loaded media before starting, and holds the resume after a stall until the same
  // target is back. Values come from PlayerSettings' bufferForPlayback(AfterRebuffer)Ms.
  const playbackPrefs = () => readPlayback(state.settings.playback);
  // MDBList (MDBListScrobbleService.kt): start ao começar, stop ao pausar, sair ou concluir. O
  // servidor marca assistido quando o stop chega com 80% ou mais; abaixo disso guarda a sessão
  // pausada. Sem ids (IMDb/TMDB) nada é enviado, e a janela de dedup evita repetir a mesma ação.
  const trackingContext = () => ({ type: context.type, meta: context.meta, episode: context.episode, profileId: profileAccess?.id ?? null });
  const progressPercent = () => Number.isFinite(video.duration) && video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
  let trackingStarted = false, trackingStopped = false;
  function trackingStart() { if (trackingStarted || disposed) return; trackingStarted = true; trackingStopped = false; mdbListTracker.start(trackingContext(), progressPercent()); }
  function trackingStop() { if (!trackingStarted || trackingStopped) return; trackingStopped = true; mdbListTracker.stop(trackingContext(), progressPercent()); }
  let pendingStart = 0, bufferHold = false, hasStarted = false;
  async function waitBuffer(target) {
    if (!(target > 0)) return 'ready';
    loading.show(bufferStatusText(target));
    const outcome = await waitForBuffer({ target, read: () => bufferedAhead(video.buffered, video.currentTime), timeout: playbackPrefs().bufferWaitTimeout * 1000, signal: request.signal });
    if (!disposed && !hasStarted) loading.show('Carregando vídeo…');
    return outcome;
  }
  on('waiting', async () => {
    // Before the first frame this is the loading screen; after it, the buffering ring only.
    if (hasStarted) loading.buffer(true, 'Carregando vídeo…'); else loading.show('Carregando vídeo…');
    const target = rebufferTarget(playbackPrefs());
    // The hold is for a rebuffer: before the first frame the element keeps its own policy.
    if (disposed || bufferHold || !hasStarted || !(target > 0) || video.ended || pauseOverlay?.isOpen()) return;
    bufferHold = true;
    try {
      video.pause();
      const outcome = await waitBuffer(target);
      if (disposed || outcome !== 'ready' || video.ended || pauseOverlay?.isOpen()) return;
      play();
    } catch { /* o controle remoto ou a navegação cancelaram a espera */ }
    finally { bufferHold = false; loading.buffer(false); }
  });
  on('pause', () => { chrome.setPlaying(false); if(!manuallyHidden)reveal(); save(); if (!bufferHold) trackingStop(); });
  function updateTimeline() {
    const duration=video.duration,position=seekPreview.position();
    timeline.disabled=!Number.isFinite(duration)||duration<=0;timeline.max=timeline.disabled?1:duration;timeline.value=position;
    const elapsed=clock(position),remaining=timeline.disabled?'Ao vivo':`-${clock(Math.max(0,duration-position))}`;timeline.setAttribute('aria-valuetext',elapsed);if(chrome.elapsed.textContent!==elapsed)chrome.elapsed.textContent=elapsed;if(chrome.remaining.textContent!==remaining)chrome.remaining.textContent=remaining;
    let buffered=0;for(let i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=video.currentTime && video.buffered.end(i)>=video.currentTime)buffered=video.buffered.end(i);
    timeline.style.setProperty('--played',`${timeline.disabled?0:Math.min(100,position/duration*100)}%`);timeline.style.setProperty('--buffered',`${timeline.disabled?0:Math.min(100,buffered/duration*100)}%`);chrome.updateClock();
  }
  function updateMetadata(){const chips=[];if(video.videoWidth&&video.videoHeight)chips.push(`${video.videoWidth} × ${video.videoHeight}`);const size=sizeBytes(context.stream);if(size>0)chips.push(size>=1024**3?`${(size/1024**3).toFixed(1)} GB`:`${Math.round(size/1024**2)} MB`);chrome.meta.replaceChildren(...chips.map(text=>el('span',{},text)));updateTimeline();}
  on('loadedmetadata',updateMetadata);on('resize',updateMetadata);on('progress',updateTimeline);on('durationchange',updateTimeline);on('ratechange',()=>chrome.updateClock());
  on('timeupdate', () => {updateTimeline();updateStats();if(Date.now()-savedAt>10000){save();savedAt=Date.now();}});
  on('ended', () => { save(); trackingStop(); loading.show('Reprodução concluída.'); reveal(); });
  on('error', () => { loading.show('Não foi possível reproduzir esta fonte. O link pode ter expirado ou o formato não ser compatível. Volte e escolha outra fonte.'); controls.classList.remove('faded'); controls.inert=false; clearTimeout(hideTimer); });
  const visibility = () => { if (document.hidden) { video.pause(); save(); } };
  document.addEventListener('visibilitychange', visibility);
  screen.addEventListener('mousemove', reveal); screen.addEventListener('focusin',()=>{if(!segments.focused())reveal();});
  const issue = playbackIssue(context.stream, state.settings.avoidDvOnly);
  // Playback starts after the subtitle preparation (bounded) and, when the custom buffer
  // is on, after the initial buffer: the first frame already arrives with subtitles ready.
  async function beginPlayback() {
    if (disposed) return;
    if (tracks?.prepareSubtitles) {
      loading.show('Preparando legendas…');
      try { await tracks.prepareSubtitles(); } catch { /* segue sem legenda */ }
      if (disposed) return;
      // The loading screen stays until the first frame: only 'playing' takes it away.
      loading.show('Carregando vídeo…');
    }
    if (!pauseOverlay?.isOpen()) play();
  }
  if (issue) loading.show(issue);
  else prepareSource();
  // Buffer e Rede: com o serviço de mídia local ligado, o player lê de 127.0.0.1 e o serviço
  // busca as faixas em paralelo (com os cabeçalhos da fonte). Sem o serviço, sem suporte a
  // Range na fonte ou sem memória para as faixas, a URL original é usada — nunca tela preta.
  async function prepareSource() {
    const prefs = playbackPrefs();
    if (localTransportEnabled(prefs) && directFileURL(context.stream.url)) {
      loading.show('Abrindo o transporte local…');
      const started = await startLocalMedia({ stream: context.stream, prefs, signal: request.signal }).catch(error => ({ ok: false, reason: error?.message }));
      if (disposed) { if (started?.token) stopLocalMedia(started.token); return; }
      if (started?.ok) { localMedia = started; localStats = null; localStatsAt = 0; }
      else if (!started?.aborted) toast(`Transporte local indisponível: ${started?.reason || 'motivo desconhecido'}. Reproduzindo a fonte direta.`);
    }
    video.src = localMedia ? localMedia.url : context.stream.url;
    pendingStart = initialTarget(playbackPrefs());
    if (pendingStart) { tracks?.prepareSubtitles?.().catch(() => {}); } // prepara junto com a espera de buffer
    else beginPlayback();
  }
  player = { back(){
    if(seekPreview.active()){seekPreview.cancel();return true;}
    if(postPlay.isOpen()){postPlay.dismiss();return true;}
    if(segments.dismiss()){hideControls();return true;}
    if(!stats.hidden){stats.hidden=true;screen.classList.remove('stats-visible');chrome.info.setAttribute('aria-pressed','false');return true;}
    if(chrome.more.getAttribute('aria-expanded')==='true'){chrome.setMore(false);reveal();chrome.more.focus();return true;}
    if(screen.classList.contains('controls-visible')){hideControls();return true;}return false;
  },key(key, e) {
    if(postPlay.isOpen())return postPlay.key(key,e);
    if(pauseOverlay.isOpen())return pauseOverlay.key(key,e);
    pauseOverlay.interaction();
    if (upNext.isOpen()) { if (['MediaPlay','MediaPause','MediaStop','MediaRewind','MediaFastForward',' '].includes(key)) { e.preventDefault(); return true; } return false; }
    if (episodes.isOpen()) { if(episodes.key(key,e))return true; if(['MediaPlay','MediaPause','MediaStop','MediaRewind','MediaFastForward',' '].includes(key)){e.preventDefault();return true;}return false; }
    if (tracks.isOpen()) return tracks.key(key,e);
    if (['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', ' '].includes(key)) {
      e.preventDefault(); if (key === 'MediaPlay') play(); else if (key === 'MediaPause') pauseOverlay.manualPause(); else if (key === 'MediaStop') back(true); else if (key === 'MediaRewind' || key === 'MediaFastForward') seekPreview.key(key==='MediaRewind'?'ArrowLeft':'ArrowRight',e); else toggle(); return true;
    }
    if(segments.focused() && key==='Enter')return false;
    if(!upNext.focused() && controls.classList.contains('faded') && ['ArrowLeft','ArrowRight'].includes(key)){reveal();timeline.focus();return seekPreview.key(key,e);}
    if (!upNext.focused() && controls.classList.contains('faded') && ['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) { e.preventDefault(); reveal(); pause.focus(); return true; }
    if(segments.focused()){if(key==='Enter')return false;if(['ArrowUp','ArrowDown','ArrowRight'].includes(key)){e.preventDefault();reveal();(key==='ArrowUp'?chrome.info:timeline).focus();return true;}}
    if(document.activeElement===timeline && key==='ArrowUp' && segments.focus()){e.preventDefault();return true;}
    if(document.activeElement===timeline && seekPreview.key(key,e))return true;
    if(chrome.key(key,hideControls)){e.preventDefault();return true;}
    reveal(); return false;
  } };
  cleanupPlayer = () => { disposed = true; trackingStop(); if (localMedia) { stopLocalMedia(localMedia.token); localMedia = null; localStats = null; } trailerPlayer.close(); loading.dispose(); segments.dispose(); thumbnails.dispose(); pauseOverlay.dispose(); parental.dispose(); postPlay.dispose(); save(); seekPreview.dispose(); clearInterval(clockTimer); upNext.dispose(); episodes.dispose(); aspect.dispose(); tracks.dispose(); for (const [event, fn] of listeners) video.removeEventListener(event, fn); video.pause(); video.removeAttribute('src'); video.load(); clearTimeout(hideTimer); document.removeEventListener('visibilitychange', visibility); };
  const controlSize=new ResizeObserver(()=>screen.style.setProperty('--subtitle-control-clearance',`${controls.offsetHeight+8}px`));controlSize.observe(controls);
  const disposeBase=cleanupPlayer;cleanupPlayer=()=>{controlSize.disconnect();disposeBase();};
  const artworkSignal=request.signal;
  async function completeArtwork(){
    if(disposed || artworkSignal.aborted || document.hidden)return;
    const update=extra=>{if(disposed || artworkSignal.aborted || document.hidden)return;enrichPlayerMetadata(context.meta,extra);if(!people(context.meta).length && people(extra).length)context.meta.castMembers=people(extra);chrome.updateIdentity();pauseOverlay.update();};
    if(metadata.configured()){
      try {const data=await metadata.detail(context.meta,artworkSignal);if(data){if(data.recommendations?.length)postPlayCandidates=data.recommendations;update(data.meta);}}catch {}
    }
    if(disposed || artworkSignal.aborted || document.hidden || artworkURL(context.meta.logo))return;
    const seen=new Set();
    const providers=[context.addon,...state.addons].filter(a=>a && !seen.has(a.url) && seen.add(a.url) && supports(a,'meta',context.meta.type,context.meta.id)).slice(0,3);
    for(const addon of providers){
      try{const data=await cachedMetaJSON(resourceURL(addon,'meta',context.meta.type,context.meta.id),artworkSignal);if(disposed || artworkSignal.aborted || document.hidden)return;if(data.meta?.id===context.meta.id){update(data.meta);if(artworkURL(context.meta.logo))break;}}catch {if(artworkSignal.aborted)return;}
    }
  }
  video.addEventListener('loadeddata',completeArtwork,{once:true});
  const priorCleanup=cleanupPlayer;cleanupPlayer=()=>{video.removeEventListener('loadeddata',completeArtwork);priorCleanup();};
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
    // A tela com a própria coluna da esquerda (o rail dos Ajustes) é o fim da linha: o
    // menu abre no Início ou com Voltar, nunca no meio de um ajuste.
    const focusable = root.querySelector('main button:not(:disabled), main input, main select, main textarea, main [data-focusable]');
    if (active?.tagName === 'MAIN' || !focusable) { event.preventDefault(); setDrawer(true); return true; }
  }
  return false;
}
installRemote({ root, back, playerKey: (key, event) => (player?.key(key, event) ?? false) || layoutKey(key, event),
  onLeftColumn: active => {
    // Settings: the pane's leftmost column steps to the selected category, and the rail
    // itself is the end of the line (no menu popping open in the middle of an edit).
    const pane = active?.closest?.('.settings-content');
    if (route.name !== 'settings' || !pane) return null;
    const paneLeft = pane.getBoundingClientRect().left + 8;
    if (active.getBoundingClientRect().left > paneLeft + 40) return null;
    return root.querySelector('.settings-rail .settings-tab.selected');
  },
  boundaryLeft: () => {
  // Esquerda abre o menu somente no Início. Dentro de uma tela, a coluna da esquerda
  // pertence à própria tela (o rail dos Ajustes, por exemplo).
  if (drawerOpen || route.name !== 'home') return;
  setDrawer(true);
} });
window.addEventListener('online',()=>{syncDelay=3000;scheduleSync();});
window.addEventListener('offline',stopSync);
window.addEventListener('pagehide', () => {cleanupPlayer?.();stopSync();});
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(heroTimer); heroRequest?.abort();stopSync(); } else scheduleSync(); });
async function boot() {
  if (account.hasSession) {
    const controller = new AbortController();
    try { await account.restore(controller.signal); }
    catch (error) {
      if (!account.hasSession) { activateProfile(state, null); detachAccountAddons(state); persist(); }
      toast(error.message);
    }
  }
  if (account.hasSession) route = { name: 'profiles', automatic: true };
  if (!account.hasSession && !state.guestMode && !state.addons.length) route = { name: 'welcome' };
  await render();
  // The splash covers the panel until the first screen is actually painted, then it leaves for
  // good (the first render is the slow one: account restore included).
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('#splash')?.remove()));
}
boot();
