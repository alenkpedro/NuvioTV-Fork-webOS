// SPDX-License-Identifier: GPL-3.0-only
// The TV page cannot drive a cross-origin YouTube player, so the trailer runs in the packaged
// youtube-proxy.html page and the two sides talk with a small postMessage protocol. These helpers
// are pure so the protocol can be tested without a real player.
const proxyPage = 'youtube-proxy.html';
export function youtubeId(value) {
  const raw = String(value || '').trim();
  if (/^[\w-]{6,20}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const id = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
    return /^[\w-]{6,20}$/.test(String(id || '')) ? String(id) : '';
  } catch { return ''; }
}
export function proxyURL(ytId, { muted = true, autoplay = true, captions = false, loop = true, direct = false } = {}) {
  const id = youtubeId(ytId);
  if (!id) return '';
  const query = new URLSearchParams({ v: id });
  if (muted) query.set('muted', '1');
  if (!autoplay) query.set('autoplay', '0');
  if (!loop) query.set('loop', '0');
  if (captions) query.set('cc', '1');
  if (direct) query.set('direct', '1');
  return `${proxyPage}?${query.toString()}`;
}
export const youtubeWatchURL = ytId => `https://www.youtube.com/watch?v=${youtubeId(ytId)}`;
const types = ['ready', 'state', 'firstFrame', 'fallback', 'error'];
const bound = (value, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : min;
// Only the proxy page in the frame may speak, and only with the protocol it declares.
export function readProxyMessage(event, frameWindow = null) {
  if (!event || !event.data || typeof event.data !== 'object') return null;
  if (frameWindow && event.source !== frameWindow) return null;
  const data = event.data;
  if (data.source !== 'nuvio-youtube-proxy') return null;
  const type = String(data.type || '');
  if (!types.includes(type)) return null;
  const message = { type, videoId: String(data.videoId || '') };
  if (type === 'error') message.code = Number(data.code) || 0;
  if (type === 'fallback') message.reason = String(data.reason || '');
  if (type === 'firstFrame') message.currentTime = bound(data.currentTime, 0, 24 * 3600);
  // Only a state message carries the player state: the first-frame notice has no state to apply.
  if (type === 'state') {
    const state = data.state && typeof data.state === 'object' ? data.state : {};
    message.state = {
      playerState: bound(state.playerState, -1, 5),
      ended: state.ended === true,
      paused: state.paused !== false,
      currentTime: bound(state.currentTime, 0, 24 * 3600),
      duration: bound(state.duration, 0, 24 * 3600),
      muted: state.muted === true,
      captionsEnabled: state.captionsEnabled === true,
      loading: state.loading !== false,
      controllable: state.controllable !== false
    };
  }
  return message;
}
