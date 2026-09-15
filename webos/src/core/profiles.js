// SPDX-License-Identifier: GPL-3.0-only
// ProfileManager (six profiles) + isolated webOS persistence.
import { enqueueKnown, observeSnapshot } from './outbox.js';
const fields = ['subtitleAppearance', 'playbackSpeeds', 'subtitleDelays', 'trackPreferences', 'addons', 'library', 'progress', 'watched', 'libraryOverrides', 'librarySync', 'accountSync', 'historySync', 'historyConflicts', 'historyChoices', 'watchedRecords', 'watchedOverrides', 'historyInitialized', 'outbox', 'outboxInitialized', 'outboxRevision', 'outboxStatus', 'syncBases', 'syncKnown', 'recentSearches', 'discoverSelection', 'catalogOrder', 'hiddenHomeCatalogs'];
const empty = () => ({ addons: [], library: {}, progress: {}, watched: {}, libraryOverrides: {} });
export const profileKey = (userId, id) => JSON.stringify([userId, id]);
function snapshot(state) { return Object.fromEntries(fields.filter(k => state[k] !== undefined).map(k => [k, state[k]])); }
export function initializeProfiles(state) {
  if (state.profileStore?.version === 1 && state.profileStore.buckets && typeof state.profileStore.activeKey === 'string') return;
  // Legacy data has only one account profile. Keep that association when known.
  const owner = state.accountSync?.userId || state.addons.find(a => a.accountOwner)?.accountOwner;
  const activeKey = owner ? profileKey(owner, 1) : 'local';
  state.profileStore = { version: 1, activeKey, buckets: { [activeKey]: snapshot(state) } };
  if (owner) state.profileStore.buckets.local = { ...empty(), addons: state.addons.filter(a => !a.accountOwner) };
}
export function captureProfile(state) {
  if (state.profileStore) state.profileStore.buckets[state.profileStore.activeKey] = snapshot(state);
}
export function activateProfile(state, userId, profile) {
  captureProfile(state);
  const key = userId ? profileKey(userId, profile.id) : 'local';
  const bucket = state.profileStore.buckets[key] || { ...empty(), addons: userId && profile.id === 1 ? [...(state.profileStore.buckets.local?.addons || [])] : [] };
  for (const field of fields) delete state[field];
  Object.assign(state, empty(), bucket);
  state.profileStore.activeKey = key;
  state.activeProfile = userId ? { userId, id: profile.id, name: profile.name, usesPrimaryAddons: profile.usesPrimaryAddons === true } : null;
  captureProfile(state);
}
export function leaveAccountProfiles(state, signedOutUser) {
  // Preserve local edits/history for a future login, but never expose them in guest mode.
  activateProfile(state, null);
  if (signedOutUser) for (const bucket of Object.values(state.profileStore.buckets)) {
    bucket.addons = (bucket.addons || []).filter(addon => addon.accountOwner !== signedOutUser);
    if (bucket.accountSync?.userId === signedOutUser) delete bucket.accountSync;
  }
}
export function parseProfiles(rows, locks) {
  if (!Array.isArray(rows) || rows.length > 6 || !Array.isArray(locks)) throw Error('A conta retornou perfis inválidos.');
  const lockMap = new Map();
  for (const lock of locks) {
    if (!Number.isInteger(lock.profile_index) || typeof lock.pin_enabled !== 'boolean' || lockMap.has(lock.profile_index)) throw Error('Não foi possível confirmar os bloqueios dos perfis.');
    lockMap.set(lock.profile_index, lock);
  }
  const seen = new Set();
  // The Android creates a primary profile locally when the remote list is empty.
  const profiles = rows.length ? rows : [{ profile_index: 1, name: 'Perfil 1' }];
  return profiles.map(p => {
    const id = p.profile_index;
    if (!Number.isInteger(id) || id < 1 || id > 6 || seen.has(id)) throw Error('A conta retornou perfis inválidos.');
    seen.add(id);
    const lock = lockMap.get(id);
    // Missing lock row is not interpreted as an unlocked profile.
    if (!lock) throw Error('Não foi possível confirmar o bloqueio de um perfil. Atualize e tente novamente.');
    return { id, name: String(p.name || `Perfil ${id}`).slice(0, 100), color: /^#[a-f0-9]{6}$/i.test(p.avatar_color_hex || '') ? p.avatar_color_hex : '#1E88E5', avatar: typeof p.avatar_url === 'string' ? p.avatar_url : null,
      usesPrimaryAddons: p.uses_primary_addons === true, locked: lock.pin_enabled, lockedUntil: Math.max(0, Date.parse(lock.pin_locked_until) || 0) };
  });
}
export function parseLibrary(rows, profileId) {
  if (!Array.isArray(rows)) throw Error('A conta retornou uma biblioteca inválida.');
  const out = {};
  for (const row of rows) {
    if (!row || typeof row.content_id !== 'string' || !row.content_id || typeof row.content_type !== 'string' || (row.profile_id !== undefined && row.profile_id !== profileId)) throw Error('A biblioteca retornou dados de perfil inválidos.');
    if (!['movie', 'series'].includes(row.content_type)) continue;
    const id = row.content_id.slice(0, 512), type = row.content_type;
    out[JSON.stringify([type, id])] = { id, type, name: String(row.name || id).slice(0, 300), poster: row.poster, background: row.background, description: String(row.description || '').slice(0, 1000), releaseInfo: row.release_info, genres: Array.isArray(row.genres) ? row.genres.slice(0, 20) : [], addedAt: Number(row.added_at) || 0 };
  }
  return out;
}
export function mergeLibrary(state, cloud, profileId) {
  observeSnapshot(state,'library',cloud);
  // Existing webOS favorites become local overrides on the first import only.
  const overrides = state.librarySync ? (state.libraryOverrides || {}) : { ...state.library, ...state.libraryOverrides };
  const merged = { ...cloud };
  for (const [key, value] of Object.entries(overrides)) { if (value === null) delete merged[key]; else merged[key] = value; }
  state.libraryOverrides = overrides; state.library = merged;
  state.librarySync = { profileId, at: Date.now(), count: Object.keys(cloud).length };
}
export function setLibraryItem(state, key, item) {
  if(item) item={...item,addedAt:item.addedAt || Date.now()};
  enqueueKnown(state,'library',key,item);
  state.libraryOverrides ||= {};
  state.libraryOverrides[key] = item;
  if (item) state.library[key] = item; else delete state.library[key];
}
