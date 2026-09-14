// SPDX-License-Identifier: GPL-3.0-only
const KEY = 'nuvio-fork.webos.v1';
export const initial = () => ({ addons: [], settings: { avoidDvOnly: true, autoPlay: false, preferences: {} }, progress: {}, library: {}, watched: {} });
export function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(KEY));
    if (!parsed || !Array.isArray(parsed.addons) || typeof parsed.progress !== 'object' || !parsed.progress) return initial();
    return { ...initial(), ...parsed, library: parsed.library && typeof parsed.library === 'object' ? parsed.library : {}, watched: parsed.watched && typeof parsed.watched === 'object' ? parsed.watched : {}, settings: { ...initial().settings, ...parsed.settings }, addons: parsed.addons.filter(a => a?.url && a?.manifest?.id && Array.isArray(a.manifest.resources)).slice(0, 30) };
  } catch { return initial(); }
}
export function saveState(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export const progressKey = (type, id) => JSON.stringify([type, id]);
export function recordProgress(state, { type, id, meta, episode, time, duration }) {
  if (!Number.isFinite(time) || time < 1 || !Number.isFinite(duration) || duration <= 0) return;
  state.progress[progressKey(type, id)] = { type, id, meta: { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background }, episode, time, duration, updated: Date.now(), complete: time / duration >= 0.95 };
  // No stream URLs or credentials in history. Retain a bounded 100 titles/episodes.
  const keep = Object.entries(state.progress).sort((a, b) => b[1].updated - a[1].updated).slice(0, 100);
  state.progress = Object.fromEntries(keep);
}
