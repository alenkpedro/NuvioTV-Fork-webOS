import test from 'node:test';
import assert from 'node:assert/strict';
import { readLayout, layoutDefaults, nextEpisode, episodeList, releaseText, runtimeText, castMembers } from '../src/core/presentation.js';
import { progressKey, readState } from '../src/core/storage.js';

test('layout migration accepts only known values without modifying account/addon/source state', () => {
  assert.deepEqual(readLayout(null), layoutDefaults);
  assert.deepEqual(readLayout({ modernSidebar: 'true', continueStyle: 'unknown', unrelated: true }), layoutDefaults);
  const previous = { addons: [], progress: {}, guestMode: false, settings: { preferences: { excludedReleaseGroups: ['Custom'] }, layout: { landscapePosters: true, continueStyle: 'wide' } } };
  const state = readState({ getItem: () => JSON.stringify(previous) });
  state.settings.layout = readLayout(state.settings.layout);
  assert.equal(state.settings.layout.landscapePosters, true);
  assert.equal(state.settings.layout.continueStyle, 'wide');
  assert.deepEqual(state.settings.preferences, previous.settings.preferences);
  assert.equal(state.guestMode, false);
});
const show = { type: 'series', videos: [
  { id: 's0e1', season: 0, episode: 1 }, { id: 's1e2', season: 1, episode: 2 },
  { id: 's2e1', season: 2, episode: 1 }, { id: 's1e1', season: 1, episode: 1 },
  { id: 'future', season: 2, episode: 2, released: '2099-01-01T00:00:00Z' },
] };
const progress = (id, complete, updated = 1) => ({ [progressKey('series', id)]: { time: 90, duration: 200, complete, updated } });
test('series play starts regular season, resumes latest episode, then advances across seasons', () => {
  assert.equal(nextEpisode(show, {}).video.id, 's1e1');
  assert.deepEqual(nextEpisode(show, progress('s1e2', false)), { video: show.videos[1], resume: true });
  assert.equal(nextEpisode(show, progress('s1e2', true)).video.id, 's2e1');
  const both = { ...progress('s1e2', false, 1), ...progress('s2e1', false, 2) };
  assert.equal(nextEpisode(show, both).video.id, 's2e1');
  assert.equal(nextEpisode({ type: 'series', videos: [show.videos[4]] }, {}), null);
});
test('episode normalization handles empty catalogs, malformed items, duplicate IDs and special-only series', () => {
  assert.deepEqual(episodeList({ videos: 'invalid' }), []);
  assert.deepEqual(episodeList({ videos: [null, {}, { id: 4 }, { id: 'a' }, { id: 'a' }] }), [{ id: 'a', season: 0, episode: 0 }]);
  assert.equal(nextEpisode({ type: 'series', videos: [show.videos[0]] }, {}).video.id, 's0e1');
});
test('date/runtime formatting preserves release day and year ranges without fabricating missing values', () => {
  assert.equal(releaseText({ type: 'movie', released: '2026-01-01T00:00:00Z' }), '1 de janeiro de 2026');
  assert.equal(releaseText({ type: 'series', releaseInfo: '2020–2026', released: '2020-01-01T00:00:00Z' }), '2020–2026');
  assert.equal(releaseText({ type: 'movie', released: 'bad', releaseInfo: '2026' }), '2026');
  assert.equal(runtimeText('123 min'), '2h 3min');
  assert.equal(runtimeText('45'), '45min');
  assert.equal(runtimeText('2h 10m'), '2h 10m');
  assert.equal(runtimeText(null), '');
});
test('cast uses supplied metadata, deduplicates and keeps leading credits before performers', () => {
  assert.deepEqual(castMembers({ director: ['A'], cast: ['B', 'B'] }), [{ name: 'A', character: 'Director' }, { name: 'B' }]);
  assert.deepEqual(castMembers({ castMembers: [null, { name: 'B' }, { name: 'A', character: 'Director' }] }).map(m => m.name), ['A', 'B']);
  assert.equal(castMembers({ cast: Array.from({ length: 100 }, (_, i) => String(i)) }).length, 40);
});
