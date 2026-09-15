// SPDX-License-Identifier: GPL-3.0-only
// PostPlayRecommendationOverlay.kt / PostPlayRecommendationController.kt: the end of
// playback offers a recommendation, with previous/next, play and return to player.
// Candidates come from the same TMDB detail call the player already makes for artwork.
import { postPlayMax, postPlayReason, shouldShowPostPlay, stepRecommendation } from './core/post-play.js';
import { readPlayback } from './core/playback.js';
import { postPlayCountdown, postPlayTrailerCountdown, shouldCountTrailer } from './core/trailer.js';
// PostPlayRecommendationController: with "Trailer automático" on, the last five
// seconds show a countdown and the trailer starts when playback ends. The fork plays
// it in a second player instance; the TV opens the same trailer the detail screen
// offers, and the window stays put if there is no trailer or the launch fails.
export function installPostPlay({ screen, video, context, settings, el, button, poster, recommendations, open, trailer, blocked, defer, restoreFocus, onOpen }) {
  const art = el('div', { class: 'post-play-art', 'aria-hidden': true });
  const reason = el('p', { class: 'post-play-reason' });
  const title = el('h2', {});
  const facts = el('p', { class: 'post-play-facts muted' });
  const description = el('p', { class: 'post-play-description' });
  const counter = el('span', { class: 'post-play-counter muted', role: 'status' });
  const countdown = el('p', { class: 'post-play-countdown muted', role: 'status', hidden: true });
  const play = button([el('span', { class: 'player-icon player-icon-play', 'aria-hidden': true }), el('span', {}, 'Assistir')], choose, { class: 'primary post-play-play', 'aria-label': 'Assistir' });
  const previous = button('Recomendação anterior', () => step(-1), { class: 'post-play-previous', 'aria-label': 'Recomendação anterior' });
  const next = button('Próxima recomendação', () => step(1), { class: 'post-play-next', 'aria-label': 'Próxima recomendação' });
  const leave = button('Voltar para o player', () => close(true), { class: 'post-play-back', 'aria-label': 'Voltar para o player' });
  const overlay = el('section', { class: 'post-play', hidden: true },
    el('div', { class: 'post-play-panel' },
      art,
      el('div', { class: 'post-play-copy' }, reason, title, facts, description, countdown),
      el('div', { class: 'post-play-actions' }, play, el('div', { class: 'post-play-steps' }, previous, counter, next), leave)));
  screen.append(overlay);
  let index = 0, openState = false, dismissed = false, disposed = false, trailerLaunched = false, countdownTimer;
  const trailerEnabled = () => Boolean(trailer?.enabled?.());
  function list() {
    return (Array.isArray(recommendations()) ? recommendations() : []).filter(item => item && item.name).slice(0, postPlayMax);
  }
  function current() { return list()[index]; }
  function paintCountdown(value) {
    const next = Number.isFinite(value) && value > 0 ? `Trailer em ${value}s` : '';
    countdown.hidden = !next;
    if (next) countdown.textContent = next;
  }
  function stopCountdown() { clearInterval(countdownTimer); countdownTimer = null; }
  // The trailer only starts once, and only when nothing else took the screen.
  async function startTrailer() {
    stopCountdown();
    const item = current();
    trailerLaunched = true;
    paintCountdown(null);
    if (!item || disposed || !openState || blocked()) return;
    let ytId = '';
    try { ytId = await trailer?.resolve?.(item) || ''; } catch { ytId = ''; }
    if (!ytId || disposed || !openState || dismissed) return;
    try { await trailer?.launch?.(ytId); } catch { /* the window stays for the user */ }
  }
  function startEndCountdown() {
    if (countdownTimer || trailerLaunched) return;
    if (!shouldCountTrailer({ enabled: trailerEnabled(), open: openState, launched: trailerLaunched, hasTrailer: Boolean(current()) })) return;
    let seconds = postPlayTrailerCountdown;
    paintCountdown(seconds);
    countdownTimer = setInterval(() => {
      seconds -= 1;
      if (seconds > 0) { paintCountdown(seconds); return; }
      startTrailer();
    }, 1000);
  }
  function updateTrailerCountdown() {
    if (!openState || trailerLaunched) { stopCountdown(); paintCountdown(null); return; }
    if (!trailerEnabled() || !current()) { stopCountdown(); paintCountdown(null); return; }
    // Before the end this is the fork's informational countdown; the trailer starts
    // only after playback ends, never earlier.
    if (!video.ended) { stopCountdown(); paintCountdown(postPlayCountdown(video.currentTime, video.duration)); return; }
    startEndCountdown();
  }
  function paint() {
    const item = current();
    if (!item) { dismiss(); return; }
    art.replaceChildren(poster(item.backdrop || item.poster, item.name));
    reason.textContent = postPlayReason(context.meta?.name);
    title.textContent = item.name;
    facts.textContent = [item.releaseInfo, item.rating ? `TMDB ${Number(item.rating).toFixed(1)}` : ''].filter(Boolean).join(' · ');
    description.textContent = item.description || '';
    description.hidden = !item.description;
    counter.textContent = `${index + 1} de ${list().length}`;
    previous.hidden = next.hidden = list().length < 2;
  }
  function step(offset) {
    const total = list().length;
    if (!openState || total < 2) return;
    index = stepRecommendation(index, offset, total);
    paint();
    play.focus({ preventScroll: true });
  }
  function choose() {
    const item = current();
    if (!item) return;
    close(true);
    open(item);
  }
  function close(permanent) {
    if (!openState) return;
    openState = false; dismissed = dismissed || permanent;
    stopCountdown(); paintCountdown(null);
    hideVisual();
    restoreFocus();
  }
  // Dismissals are final for this playback, like the fork's window; panels only pause it.
  const dismiss = () => close(true);
  function hideVisual() {
    overlay.hidden = true; overlay.classList.remove('visible');
    overlay.removeAttribute('role'); overlay.removeAttribute('aria-modal'); overlay.removeAttribute('aria-label');
    screen.classList.remove('post-play-open');
  }
  function showVisual() {
    overlay.hidden = false;
    // The window is a dialog only while it is on screen, so Back cannot reach it hidden.
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Recomendações após assistir');
    screen.classList.add('post-play-open');
    requestAnimationFrame(() => { if (!disposed && openState) overlay.classList.add('visible'); });
  }
  function update() {
    if (disposed) return;
    if (!readPlayback(settings.playback).postPlayRecommendations) return;
    // While it is open it only steps aside for panels, and comes back when they close.
    if (openState) {
      if (blocked()) { hideVisual(); stopCountdown(); }
      else if (overlay.hidden) { showVisual(); updateTrailerCountdown(); }
      else updateTrailerCountdown();
      return;
    }
    if (dismissed) return;
    if (!list().length) return;
    if (defer?.()) return;
    if (!shouldShowPostPlay(settings.playback, { type: context.type, position: video.currentTime, duration: video.duration, skipIntervals: context.skipIntervals })) return;
    // A paused viewer is not interrupted, but the end of a video is exactly when this matters.
    if (document.hidden || video.seeking || (video.paused && !video.ended) || blocked()) return;
    index = 0; openState = true; paint(); showVisual();
    onOpen?.();
    play.focus({ preventScroll: true });
    updateTrailerCountdown();
  }
  const events = { timeupdate: update, seeked: update, ended: update, playing: update, pause: update };
  for (const [event, fn] of Object.entries(events)) video.addEventListener(event, fn);
  const visibility = () => update();
  document.addEventListener('visibilitychange', visibility);
  return {
    isOpen: () => openState,
    refresh: update,
    dismiss: () => close(true),
    key(key, event) {
      if (!openState) return false;
      if (key === 'ArrowLeft') { event.preventDefault(); step(-1); return true; }
      if (key === 'ArrowRight') { event.preventDefault(); step(1); return true; }
      if (key === 'ArrowUp' || key === 'ArrowDown') { event.preventDefault(); (key === 'ArrowUp' ? play : leave).focus({ preventScroll: true }); return true; }
      if (['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', ' '].includes(key)) { event.preventDefault(); return true; }
      return false;
    },
    dispose() {
      disposed = true;
      stopCountdown();
      for (const [event, fn] of Object.entries(events)) video.removeEventListener(event, fn);
      document.removeEventListener('visibilitychange', visibility);
      overlay.remove();
    }
  };
}