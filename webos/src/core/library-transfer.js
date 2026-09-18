// SPDX-License-Identifier: GPL-3.0-only
// data/repository/LibraryTransfer.kt at the fork's 45e0984: the dry-run heart of the library
// transfer flow. It is pure and side-effect free — it decides WHAT a copy or a move would do,
// and the screen shows that plan before anything is written. Matching uses one canonical id
// (IMDb preferred, then tmdb:{n}), entries without one are counted as unmatched instead of
// being written blind, duplicates collapse, and entries already in the destination are skipped.
export const transferModes = Object.freeze({ copy: 'Copiar', move: 'Mover' });
export const transferSourceIds = Object.freeze(['tv', 'account']);
export const transferSourceLabels = Object.freeze({ tv: 'Biblioteca desta TV', account: 'Conta Nuvio' });
// normalizeContentId: the same title compares equal no matter which id form each side stored.
export function normalizeContentId(value) {
  const text = String(value ?? '').trim();
  const imdb = /(tt\d+)/i.exec(text);
  if (imdb) return imdb[1].toLowerCase();
  const tmdb = /^tmdb:(\d{1,9})$/.exec(text) || /^(\d{1,9})$/.exec(text);
  if (tmdb) return `tmdb:${Number(tmdb[1])}`;
  return '';
}
export function transferKey(entry) {
  const candidates = [entry?.id, entry?.imdb_id, entry?.imdbId, entry?.tmdbId != null ? `tmdb:${entry.tmdbId}` : ''];
  for (const candidate of candidates) { const normalized = normalizeContentId(candidate); if (normalized) return normalized; }
  return String(entry?.id ?? '').trim();
}
export function hasResolvableId(entry) {
  const candidates = [entry?.id, entry?.imdb_id, entry?.imdbId, entry?.tmdbId != null ? `tmdb:${entry.tmdbId}` : ''];
  return candidates.some(candidate => normalizeContentId(candidate) !== '');
}
// planTransfer(): dedupes the source, skips what the destination already has, and counts the
// entries no destination can resolve. Nothing is written here.
export function planTransfer({ source = [], destination = [], mode = 'copy' } = {}) {
  const destinationKeys = new Set(destination.map(entry => transferKey(entry)));
  const seen = new Set();
  const toWrite = [];
  let alreadyPresent = 0, unmatched = 0, duplicates = 0;
  for (const entry of source) {
    const key = transferKey(entry);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    if (!hasResolvableId(entry)) { unmatched++; continue; }
    if (destinationKeys.has(key)) { alreadyPresent++; continue; }
    toWrite.push(entry);
  }
  return { mode: transferModes[mode] ? mode : 'copy', toWrite, alreadyPresent, unmatched, duplicates, sourceTotal: source.length };
}
export const planIsEmpty = plan => !plan || !plan.toWrite.length;
export function planSummary(plan) {
  if (!plan) return 'Nenhum plano.';
  const mode = transferModes[plan.mode] || plan.mode;
  if (planIsEmpty(plan)) return `${mode}: nada a escrever — ${plan.alreadyPresent} já presente(s), ${plan.unmatched} sem id.`;
  return `${mode}: ${plan.toWrite.length} entrada(s) a escrever · ${plan.alreadyPresent} já presente(s) · ${plan.unmatched} sem id · ${plan.duplicates} duplicada(s) · origem com ${plan.sourceTotal}.`;
}
// entriesForLibrary(): the entries the destination store receives, normalised to the shape the
// port stores (type, id, name, poster and the moment it entered the library).
export function entriesForLibrary(plan, now = Date.now()) {
  return (plan?.toWrite || []).map(entry => ({
    id: entry.id, type: entry.type, name: entry.name,
    poster: entry.poster ?? null, background: entry.background ?? null,
    addedAt: Number.isFinite(entry.addedAt) ? entry.addedAt : now,
    origin: entry.origin || 'local'
  }));
}
// removeKeysForMove(): a MOVE is a copy followed by a removal at the source; only the entries
// that were actually written are removed, never the ones that were skipped.
export function removeKeysForMove(plan) {
  if (!plan || plan.mode !== 'move') return [];
  return plan.toWrite.map(entry => JSON.stringify([entry.type, entry.id]));
}
