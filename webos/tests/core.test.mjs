import test from 'node:test';
import assert from 'node:assert/strict';
import { rankStreams, filterAndSort, releaseGroupFromText, sizeFromText, sizeBytes, factsFor, playbackIssue, defaults } from '../src/core/ranking.js';
import { manifestURL, resourceURL, supports, mapLimit, getJSON } from '../src/core/addons.js';
import { initial, recordProgress, readState } from '../src/core/storage.js';
const stream = (name, extras = {}) => ({ name, url: 'https://example.com/video', behaviorHints: { filename: name }, ...extras });
// Same fixtures and expected outcomes as StreamQualityRankTrashTest.kt.
test('fork: preferred remux groups retain the exact tier order', () => {
  const names = ['RANDOMGRP', 'NTb', 'playBD', 'FraMeSToR'];
  const s = names.map(g => stream(`Movie.2023.2160p.UHD.BluRay.REMUX.TrueHD.7.1-${g}.mkv`));
  assert.deepEqual(rankStreams(s), [s[3], s[2], s[1], s[0]]);
});
test('fork: excluded groups lose even with a higher resolution', () => {
  const junk = stream('Movie.2023.2160p.BluRay.x265-YIFY.mkv'), good = stream('Movie.2023.1080p.WEB-DL.DDP5.1-FLUX.mkv');
  assert.deepEqual(rankStreams([junk, good]), [good]);
});
test('fork: auto-pick falls back to the unfiltered pool when everything is excluded', () => {
  const a = stream('Movie.2023.1080p.WEBRip.x264-YIFY.mkv'), b = stream('Movie.2023.720p.HDTV.x264-MeGusta.mkv');
  assert.deepEqual(rankStreams([b, a]), [a, b]);
  assert.deepEqual(filterAndSort([b, a]), []);
});
test('fork: MKV wins equal candidates and ties remain stable', () => {
  const a = stream('Movie 2160p WEB-DL DDP5.1', { url: 'https://example.com/a.mp4' }), b = { ...a, url: 'https://example.com/a.mkv' };
  assert.deepEqual(rankStreams([a, b]), [b, a]);
  const c = { ...a, id: 2 }; assert.deepEqual(rankStreams([a, c]), [a, c]);
});
test('fork: group extraction ignores source/codec suffixes and handles compound groups', () => {
  for (const [name, expected] of [['Movie.2023.2160p.WEB-DL.DDP5.1.Atmos-FLUX.mkv', 'FLUX'], ['Movie.2010.1080p.BluRay.DTS.x264-D-Z0N3.mkv', 'D-Z0N3'], ['Movie.2023.1080p.BluRay.x264-YIFY.mkv', 'YIFY'], ['Movie.2008.2160p.WEB-DL', ''], ['[SubsPlease] Title.mkv', 'SubsPlease'], ['Title-DTS-HD', '']]) assert.equal(releaseGroupFromText(name), expected);
});
test('fork: size parsing respects binary units, comma decimal, structured fields and description priority', () => {
  assert.equal(sizeFromText('👤 12 💾 1.81 GB'), Math.floor(1.81 * 1024 ** 3));
  assert.equal(sizeFromText('2,4 GB'), Math.floor(2.4 * 1024 ** 3));
  assert.equal(sizeFromText('700 MB'), 700 * 1024 ** 2);
  assert.equal(sizeFromText('512KB'), 512 * 1024);
  assert.equal(sizeFromText('320kbps'), null);
  assert.equal(sizeFromText('2024.2160p'), null);
  assert.equal(sizeBytes({ title: '2 GB', description: '1 GB' }), 1024 ** 3);
  assert.equal(sizeBytes({ title: '2 GB', behaviorHints: { videoSize: 123 } }), 123);
});
test('fork: parsed metadata precedence, strict requirements and limits', () => {
  const a = stream('Movie 720p WEB-DL HDR10 HEVC-FLUX', { clientResolve: { stream: { raw: { parsed: { resolution: '2160p', group: 'Preferred' }, size: 20e9 } } } });
  assert.equal(factsFor(a).resolution, 'P2160');
  assert.equal(factsFor(a).releaseGroup, 'Preferred');
  assert.deepEqual(filterAndSort([a], { sizeMaxGb: 10 }), []);
  assert.deepEqual(filterAndSort([a], { requiredAudioTags: ['TRUEHD'] }), []);
  assert.equal(filterAndSort([a, { ...a }, stream('Movie 1080p WEB-DL')], { maxPerResolution: 1 }).length, 2);
});
test('fork: high resolution beats lower resolution remux; TrueHD preference is preserved', () => {
  const web = stream('Movie 2160p WEB-DL AAC'), remux = stream('Movie 1080p BluRay REMUX TrueHD');
  assert.equal(rankStreams([remux, web])[0], web);
  assert.equal(defaults.preferredAudioTags[0], 'TRUEHD');
  assert.ok(defaults.excludedEncodes.includes('AV1'));
});
test('LG compatibility is separate from quality fallback', () => {
  assert.ok(playbackIssue(stream('Title 2160p DV WEB-DL')));
  assert.equal(playbackIssue(stream('Title 2160p DV HDR10 WEB-DL')), null);
  assert.equal(playbackIssue(stream('Title 2160p DV WEB-DL'), false), null);
  assert.ok(playbackIssue({ infoHash: 'abc' }));
  assert.ok(playbackIssue({ externalUrl: 'https://example.com' }));
  assert.ok(playbackIssue(stream('X', { behaviorHints: { proxyHeaders: { request: { Authorization: 'fixture' } } } })));
});
test('manifest/resource URLs retain configuration path and query and encode media IDs', () => {
  const url = manifestURL('stremio://example.com/config/manifest.json?key=fixture');
  assert.equal(url, 'https://example.com/config/manifest.json?key=fixture');
  assert.equal(resourceURL({ url }, 'stream', 'series', 'tt123:1:2'), 'https://example.com/config/stream/series/tt123%3A1%3A2.json?key=fixture');
  assert.equal(resourceURL({ url }, 'catalog', 'movie', 'top', { search: 'a/b c' }), 'https://example.com/config/catalog/movie/top/search=a%2Fb%20c.json?key=fixture');
  assert.throws(() => manifestURL('javascript:alert(1)'));
  assert.throws(() => manifestURL('https://user:pass@example.com/manifest.json'));
});
test('resource declarations honor type and ID prefix restrictions', () => {
  assert.ok(supports({ manifest: { resources: ['stream'], types: ['series'], idPrefixes: ['tt'] } }, 'stream', 'series', 'tt1:1:2'));
  assert.ok(!supports({ manifest: { resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] } }, 'stream', 'movie', 'local1'));
});
test('metadata request limit and cancellation stop subsequent work', async () => {
  let active = 0, max = 0, calls = 0; const controller = new AbortController();
  const rows = await mapLimit([1, 2, 3, 4, 5, 6], async n => { calls++; active++; max = Math.max(active, max); await new Promise(r => setTimeout(r, 5)); active--; if (n === 1) controller.abort(); return n; }, controller.signal);
  assert.equal(max, 3); assert.equal(calls, 3); assert.equal(rows.length, 3);
});
test('malformed metadata and oversized responses fail clearly', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{not json');
    await assert.rejects(getJSON('https://example.com'), /JSON válido/);
    globalThis.fetch = async () => new Response('x', { headers: { 'Content-Length': String(7 * 1024 ** 2) } });
    await assert.rejects(getJSON('https://example.com'), /muito grande/);
  } finally { globalThis.fetch = original; }
});
test('progress is bounded and never saves expiring source URLs', () => {
  const state = initial();
  for (let n = 0; n < 110; n++) recordProgress(state, { type: 'series', id: String(n), meta: { id: 'show', name: 'Show', url: 'https://private.example/token' }, time: 30, duration: 300, stream: { url: 'secret' } });
  assert.equal(Object.keys(state.progress).length, 100);
  assert.ok(!JSON.stringify(state).includes('private.example'));
  assert.deepEqual(readState({ getItem: () => '{broken' }), initial());
});
