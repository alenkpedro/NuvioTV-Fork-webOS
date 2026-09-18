import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesForLibrary, hasResolvableId, normalizeContentId, planIsEmpty, planSummary, planTransfer, removeKeysForMove, transferKey, transferModes } from '../src/core/library-transfer.js';
const entry = (id, extra = {}) => ({ id, type: 'movie', name: id, ...extra });
test('one canonical id decides identity: IMDb first, then tmdb, then the raw id', () => {
  assert.equal(normalizeContentId('tt1234567'), 'tt1234567');
  assert.equal(normalizeContentId('tmdb:42'), 'tmdb:42');
  assert.equal(normalizeContentId('42'), 'tmdb:42');
  assert.equal(normalizeContentId('kitsu:9'), '');
  assert.equal(transferKey({ id: 'tt1', tmdbId: 7 }), 'tt1');
  assert.equal(transferKey({ id: 'x', imdb_id: 'tt9' }), 'tt9');
  assert.equal(transferKey({ id: 'x', tmdbId: 12 }), 'tmdb:12');
  assert.equal(transferKey({ id: 'trakt:3' }), 'trakt:3');
  assert.equal(hasResolvableId(entry('tt1')), true);
  assert.equal(hasResolvableId(entry('kitsu:1')), false);
});
test('the plan dedupes, skips what the destination has and counts the unmatched', () => {
  const plan = planTransfer({
    source: [entry('tt1'), entry('tt1', { name: 'repetido' }), entry('tt2'), entry('kitsu:1'), entry('tt3', { tmdbId: 55 })],
    destination: [entry('tt2', { name: 'já na conta' }), entry('kitsu:1')],
    mode: 'copy'
  });
  assert.equal(plan.sourceTotal, 5);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.unmatched, 1);
  assert.equal(plan.alreadyPresent, 1);
  assert.deepEqual(plan.toWrite.map(row => row.id), ['tt1', 'tt3']);
  assert.equal(plan.mode, 'copy');
  assert.equal(planIsEmpty(plan), false);
  assert.match(planSummary(plan), /Copiar: 2 entrada\(s\) a escrever · 1 já presente\(s\) · 1 sem id · 1 duplicada\(s\)/);
});
test('an empty plan says so instead of pretending to transfer', () => {
  const plan = planTransfer({ source: [entry('tt1')], destination: [entry('tt1')], mode: 'move' });
  assert.equal(planIsEmpty(plan), true);
  assert.deepEqual(plan.toWrite, []);
  assert.match(planSummary(plan), /Mover: nada a escrever/);
  assert.deepEqual(removeKeysForMove(plan), []);
  assert.equal(transferModes.move, 'Mover');
});
test('a move only removes what was actually written', () => {
  const plan = planTransfer({ source: [entry('tt1'), entry('tt2'), entry('kitsu:1')], destination: [entry('tt2')], mode: 'move' });
  assert.deepEqual(plan.toWrite.map(row => row.id), ['tt1']);
  assert.deepEqual(removeKeysForMove(plan), [JSON.stringify(['movie', 'tt1'])]);
  assert.deepEqual(removeKeysForMove({ ...plan, mode: 'copy' }), []);
});
test('entries reach the library in the shape the port stores', () => {
  const plan = planTransfer({ source: [entry('tt1', { poster: 'p.jpg', addedAt: 111 })], destination: [] });
  const [row] = entriesForLibrary(plan, 999);
  assert.deepEqual(row, { id: 'tt1', type: 'movie', name: 'tt1', poster: 'p.jpg', background: null, addedAt: 111, origin: 'local' });
  const [fresh] = entriesForLibrary(planTransfer({ source: [entry('tt2')], destination: [] }), 999);
  assert.equal(fresh.addedAt, 999);
});
