import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { createNetwork, fetchThroughService } from '../src/core/net-service.js';
const require = createRequire(import.meta.url);
const { valid, request } = require('../service/net.js');
function transportFor(response) {
  const calls = [];
  return {
    calls,
    request(options, callback) {
      calls.push(options);
      const req = new EventEmitter();
      req.write = () => {};
      req.destroy = () => {};
      req.end = () => queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = response.status || 200;
        res.headers = response.headers || {};
        res.resume = () => {};
        res.destroy = () => {};
        callback(res);
        if (response.body) res.emit('data', Buffer.from(response.body));
        res.emit('end');
      });
      return req;
    }
  };
}
test('the local network service accepts only bounded http(s) requests', () => {
  assert.equal(valid({ url: 'https://api.trakt.tv/users/me' }), true);
  assert.equal(valid({ url: 'http://localhost:8080/x', method: 'POST', body: 'a=1', headers: { 'trakt-api-key': 'x' } }), true);
  assert.equal(valid({ url: 'ftp://example.test/x' }), false);
  assert.equal(valid({ url: 'javascript:alert(1)' }), false);
  assert.equal(valid({ url: 'https://x.test', method: 'TRACE' }), false);
  assert.equal(valid({ url: 'https://x.test', headers: 'nope' }), false);
  assert.equal(valid({ url: 'https://x.test', body: 'x'.repeat(1024 * 1024 + 1) }), false);
});
test('the local network service sends the caller headers and hides connection ones', async () => {
  const transport = transportFor({ body: '{"ok":true}', headers: { 'content-type': 'application/json' } });
  const result = await request({ url: 'https://api.trakt.tv/sync/last_activities', headers: { 'trakt-api-key': 'secret', Host: 'evil.test', 'Content-Length': '9', 'User-Agent': 'Trakt/1' } }, { 'https:': transport });
  assert.deepEqual(transport.calls[0].headers, { 'trakt-api-key': 'secret', 'User-Agent': 'Trakt/1', Accept: '*/*' });
  assert.equal(transport.calls[0].hostname, 'api.trakt.tv');
  assert.equal(transport.calls[0].path, '/sync/last_activities');
  assert.deepEqual(result, {
    status: 200, ok: true, url: 'https://api.trakt.tv/sync/last_activities', contentType: 'application/json', bytes: 11,
    text: '{"ok":true}', bodyBase64: undefined, headers: { 'content-range': undefined, 'accept-ranges': undefined, location: undefined }
  });
});
test('the local network service follows redirects, decodes gzip and answers binary as base64', async () => {
  const redirect = transportFor({ status: 302, headers: { location: 'https://cdn.test/sub.srt' } });
  const target = transportFor({ body: zlib.gzipSync(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nOlá')), headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' } });
  const subtitle = await request({ url: 'https://addon.test/sub.srt' }, { 'https:': { request: (options, callback) => (options.hostname === 'addon.test' ? redirect.request(options, callback) : target.request(options, callback)) } });
  assert.match(subtitle.text, /Olá/);
  assert.equal(subtitle.contentType, 'text/plain');
  const image = transportFor({ body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), headers: { 'content-type': 'image/png' } });
  const binary = await request({ url: 'https://cdn.test/poster.png' }, { 'https:': image });
  assert.equal(binary.text, undefined);
  assert.equal(binary.bodyBase64, Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'));
});
test('the app path uses the packaged service when it exists and fetch otherwise', async () => {
  const seen = [];
  class Bridge {
    call(uri, payload) { seen.push({ uri, payload: JSON.parse(payload) }); queueMicrotask(() => this.onservicecallback(JSON.stringify({ returnValue: true, data: { ok: true, status: 200, text: '{"user":"me"}' } }))); }
    cancel() { this.cancelled = true; }
  }
  const throughService = createNetwork({ Bridge });
  assert.equal(throughService.available(), true);
  assert.deepEqual(await throughService.json('https://api.trakt.tv/users/me', { headers: { 'trakt-api-key': 'x' } }), { user: 'me' });
  assert.equal(seen[0].uri, 'luna://org.nuviofork.webos.segments/fetch');
  assert.equal(seen[0].payload.url, 'https://api.trakt.tv/users/me');
  // Aborting reaches the service bridge so the TV does not keep the request open.
  const controller = new AbortController();
  const Bridge2 = class { call() { this.pending = true; } cancel() { this.cancelled = true; } };
  const first = createNetwork({ Bridge: Bridge2 }).json('https://api.trakt.tv/x', { signal: controller.signal });
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  // No bridge (browser and tests): the same call goes through fetch.
  const calls = [];
  const fakeFetch = async (url, options) => { calls.push({ url, options }); return { status: 200, ok: true, url, headers: new Headers({ 'content-type': 'application/json' }), arrayBuffer: async () => new TextEncoder().encode('{"user":"me"}').buffer }; };
  const throughFetch = createNetwork({ Bridge: undefined, fetchImpl: fakeFetch });
  assert.equal(throughFetch.available(), false);
  assert.deepEqual(await throughFetch.json('https://api.trakt.tv/users/me', { headers: { 'trakt-api-key': 'x' } }), { user: 'me' });
  assert.equal(calls[0].options.headers['trakt-api-key'], 'x');
  // A refusal from the service is an error, and an unreachable service never hangs the caller.
  class RefusingBridge { call() { queueMicrotask(() => this.onservicecallback(JSON.stringify({ returnValue: false, errorText: 'Busy' }))); } cancel() {} }
  await assert.rejects(createNetwork({ Bridge: RefusingBridge }).json('https://api.trakt.tv/x'), /Busy/);
  class MuteBridge { call() {} cancel() {} }
  await assert.rejects(fetchThroughService({ url: 'https://x.test', timeoutMs: 1000 }, null, MuteBridge), /indisponível/);
});
