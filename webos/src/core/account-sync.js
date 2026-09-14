// SPDX-License-Identifier: GPL-3.0-only
import { loadAddon, manifestURL, mapLimit } from './addons.js';
export async function importAccountAddons(client, state, { signal, loader = loadAddon, profileId = 1, addonProfileId = profileId } = {}) {
  const userId = client.user?.id;
  if (!userId) throw Error('Entre na conta Nuvio para sincronizar.');
  const rows = await client.addons(signal, addonProfileId);
  const urls = new Set();
  const unique = rows.filter(row => { const url = manifestURL(row.url); if (urls.has(url)) return false; urls.add(url); return true; });
  const results = await mapLimit(unique, async row => {
    const addon = await loader(row.url, { signal });
    if (row.name?.trim()) addon.manifest.name = row.name.trim();
    return { ...addon, accountOwner: userId, accountProfile: profileId };
  }, signal);
  if (signal?.aborted || client.user?.id !== userId || (state.activeProfile && state.activeProfile.id !== profileId)) throw new DOMException('Cancelado', 'AbortError');
  const locals = state.addons.filter(a => !a.accountOwner);
  const resolved = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const addon = result.value || state.addons.find(a => a.accountOwner === userId && a.url === manifestURL(unique[i].url));
    if (addon) resolved.push(addon);
  }
  const merged = new Map(locals.map(a => [a.url, a]));
  // A manually installed URL remains local, so signing out will not erase it.
  for (const addon of resolved) if (!merged.has(addon.url)) merged.set(addon.url, addon);
  if (merged.size > 30) throw Error('A conta e os addons locais ultrapassam o limite de 30. Remova addons locais e tente novamente.');
  state.addons = [...merged.values()];
  state.accountSync = { userId, profileId, addonProfileId, at: Date.now(), imported: resolved.length, failed: results.filter(r => r.error).length };
  return { ...state.accountSync, remote: unique.length };
}
export function detachAccountAddons(state) {
  state.addons = state.addons.filter(a => !a.accountOwner);
  delete state.accountSync;
}
