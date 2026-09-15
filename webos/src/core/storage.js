// SPDX-License-Identifier: GPL-3.0-only
import { markWatched } from './history.js';
import { enqueueKnown } from './outbox.js';
import { captureProfile } from './profiles.js';
import { migrateAutoPlay } from './auto-play.js';
import { readLinkCache } from './link-cache.js';
const KEY = 'nuvio-fork.webos.v1';
export const initial = () => ({ addons: [], settings: { avoidDvOnly: true, autoPlay: false, preferences: {} }, progress: {}, library: {}, watched: {}, linkCache: {}, collections: [] });
export function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(KEY));
    if (!parsed || !Array.isArray(parsed.addons) || typeof parsed.progress !== 'object' || !parsed.progress) return initial();
    // The single auto-play switch became four fork modes; existing installs keep
    // working as "Seleção inteligente" and stop carrying the old flag.
    const settings = migrateAutoPlay({ ...initial().settings, ...parsed.settings });
    return { ...initial(), ...parsed, library: parsed.library && typeof parsed.library === 'object' ? parsed.library : {}, watched: parsed.watched && typeof parsed.watched === 'object' ? parsed.watched : {}, linkCache: readLinkCache(parsed.linkCache), settings, addons: parsed.addons.filter(a => a?.url && a?.manifest?.id && Array.isArray(a.manifest.resources)).slice(0, 30) };
  } catch { return initial(); }
}
export function saveState(storage, state) {
  try {
    captureProfile(state);
    // Active data already lives at the top level; avoid serializing a duplicate copy.
    const packed = state.profileStore ? { ...state, profileStore: { ...state.profileStore, buckets: Object.fromEntries(Object.entries(state.profileStore.buckets).filter(([key]) => key !== state.profileStore.activeKey)) } } : state;
    storage.setItem(KEY, JSON.stringify(packed)); return true;
  }
  catch { return false; }
}
export const progressKey = (type, id) => JSON.stringify([type, id]);
export function recordProgress(state, { type, id, meta, episode, time, duration }) {
  if (!Number.isFinite(time) || time < 1 || !Number.isFinite(duration) || duration <= 0) return;
  const value = { type, id, meta: { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background }, episode, time, duration, updated: Date.now(), complete: time / duration >= 0.90, origin: 'local' };
  enqueueKnown(state,'progress',progressKey(type,id),value);
  const previous=state.progress[progressKey(type,id)];
  state.progress[progressKey(type,id)]=value;
  if(value.complete && !previous?.complete) markWatched(state,{id:meta.id,type,name:meta.name,season:episode?.season ?? null,episode:episode?.episode ?? null},true);
  // No stream URLs or credentials in history. Retain a bounded 100 titles/episodes.
  const keep = Object.entries(state.progress).sort((a, b) => b[1].updated - a[1].updated).slice(0, 100);
  state.progress = Object.fromEntries(keep);
}
