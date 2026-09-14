import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, SESSION_KEY } from '../src/core/account.js';
import { importAccountAddons, detachAccountAddons } from '../src/core/account-sync.js';
const config = { backendUrl: 'https://auth.fixture', publishableKey: 'public-anon-fixture', linkUrl: 'https://nuvio.tv/link', legacyLinkUrl: 'https://nuvio.tv/tv-login' };
const user = { id: 'fixture-user', email: 'fixture@example.test' };
const token = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, user };
const pairing = { code: 'device-fixture', nonce: 'nonce-fixture' };
function memory(initial) { const map = new Map(initial ? [[SESSION_KEY, JSON.stringify(initial)]] : []); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }
const reply = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const initial = expires_at => ({ ...token, expires_at });
function make(fetcher, storage = memory(), now = () => 1000) { return createAccountClient({ storage, config, fetcher, now, random: b => b.fill(9) }); }
test('device linking uses fork RPC fields, keeps nonce off QR and validates user before saving', async () => {
  const storage = memory(), requests = [];
  const client = make(async (url, options) => {
    requests.push({ url, ...options });
    if (url.endsWith('start_device_login_session')) return reply([{ device_code: 'device-fixture', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://nuvio.tv/link?code=ABCD-EFGH', expires_at: new Date(100000).toISOString(), poll_interval_seconds: 1 }]);
    if (url.endsWith('poll_tv_login_session')) return reply([{ status: 'approved' }]);
    if (url.endsWith('tv-logins-exchange')) return reply(token);
    if (url.endsWith('/user')) return reply(user);
    throw Error('Unexpected request');
  }, storage);
  const p = await client.start();
  assert.equal(p.interval, 2); assert.equal(p.nonce.length, 32); assert.ok(!p.url.includes(p.nonce));
  assert.equal(JSON.parse(requests[0].body).p_device_type, 'tv');
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.equal((await client.poll(p)).status, 'approved');
  assert.equal(await storage.getItem(SESSION_KEY), null);
  await client.exchange(p);
  assert.equal(client.user.id, user.id);
  assert.equal(JSON.parse(storage.getItem(SESSION_KEY)).refresh_token, token.refresh_token);
  assert.equal(requests.at(-1).headers.Authorization, 'Bearer fixture-access');
  assert.ok(requests.every(r => r.credentials === 'omit' && r.redirect === 'error'));
});
test('pairing rejects foreign approval URLs and only falls back on missing RPC', async () => {
  const client = make(async () => reply([{ device_code: 'x', user_code: 'x', verification_uri_complete: 'https://attacker.example/link', expires_at: new Date(100000).toISOString() }]));
  await assert.rejects(client.start(), /endereço de vinculação inválido/);
  let calls = 0;
  const fallback = make(async () => ++calls === 1 ? reply({ code: 'PGRST202' }, 404) : reply([{ code: 'legacy-code', web_url: 'https://nuvio.tv/tv-login?code=fixture', expires_at: new Date(100000).toISOString() }]));
  assert.equal((await fallback.start()).code, 'legacy-code'); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(make(async () => { calls++; return reply({}, 500); }).start(), /temporariamente/);
  assert.equal(calls, 1);
});
test('concurrent requests serialize rotating refresh and persist the replacement token', async () => {
  let refreshes = 0;
  const storage = memory(initial(0));
  const client = make(async (url, options) => {
    if (url.includes('grant_type=refresh_token')) { refreshes++; await new Promise(r => setTimeout(r, 5)); return reply({ ...token, access_token: 'new-access', refresh_token: 'new-refresh' }); }
    assert.equal(options.headers.Authorization, 'Bearer new-access'); return reply(user);
  }, storage);
  await Promise.all([client.restore(), client.restore(), client.restore()]);
  assert.equal(refreshes, 1); assert.equal(JSON.parse(storage.getItem(SESSION_KEY)).refresh_token, 'new-refresh');
});
test('refresh outage preserves session, revoked refresh clears it without leaking server text', async () => {
  const storage = memory(initial(0));
  let client = make(async () => reply({ message: 'SECRET SHOULD NOT APPEAR' }, 503), storage);
  await assert.rejects(client.restore(), e => !e.message.includes('SECRET') && e.status === 503);
  assert.ok(client.hasSession); assert.ok(storage.getItem(SESSION_KEY));
  client = make(async () => reply({ error_code: 'refresh_token_not_found' }, 400), storage);
  await assert.rejects(client.restore()); assert.equal(client.hasSession, false); assert.equal(storage.getItem(SESSION_KEY), null);
});
test('sign out revokes only this session and clears local tokens even offline', async () => {
  const storage = memory(initial(999999));
  let path;
  const client = make(async url => { path = url; throw new TypeError('offline'); }, storage);
  assert.equal(await client.signOut(), false); assert.ok(path.endsWith('/logout?scope=local'));
  assert.equal(client.user, null); assert.equal(storage.getItem(SESSION_KEY), null);
});
test('abort during token exchange cannot persist a late login', async () => {
  const abort = new AbortController(), storage = memory();
  const client = make(async url => {
    if (url.endsWith('tv-logins-exchange')) return reply(token);
    abort.abort(); return reply(user);
  }, storage);
  await assert.rejects(client.exchange(pairing, abort.signal), e => e.name === 'AbortError');
  assert.equal(storage.getItem(SESSION_KEY), null);
});
test('addon import reads owner/primary profile and passes no session headers to addon transport', async () => {
  const paths = [], storage = memory(initial(999999));
  const client = make(async (url, options) => {
    paths.push(url); assert.equal(options.headers.Authorization, 'Bearer fixture-access');
    if (url.endsWith('get_sync_owner')) return reply('linked-owner');
    const params = new URL(url).searchParams;
    assert.equal(params.get('user_id'), 'eq.linked-owner'); assert.equal(params.get('profile_id'), 'eq.1');
    return reply([{ url: 'https://addon.fixture/configured-token/manifest.json', name: 'Remote name', enabled: true }, { url: 'https://disabled.fixture/manifest.json', enabled: false }]);
  }, storage);
  const state = { addons: [{ url: 'https://local.fixture/manifest.json', manifest: { id: 'local' } }] };
  const result = await importAccountAddons(client, state, { loader: async (url, options) => {
    assert.deepEqual(Object.keys(options), ['signal']);
    return { url, manifest: { id: 'remote', name: 'Original' } };
  } });
  assert.equal(result.imported, 1); assert.equal(state.addons[1].manifest.name, 'Remote name');
  assert.equal(state.addons[1].accountOwner, user.id); assert.equal(paths.length, 2);
  detachAccountAddons(state); assert.equal(state.addons.length, 1); assert.equal(state.addons[0].manifest.id, 'local');
});
test('partial import keeps previous usable addon, deletes remotely removed addons, and reports failures', async () => {
  const old = { url: 'https://old.fixture/manifest.json', accountOwner: user.id, manifest: { id: 'old' } };
  const state = { addons: [old, { url: 'https://deleted.fixture/manifest.json', accountOwner: user.id }] };
  const client = { user, addons: async () => [{ url: old.url }] };
  const result = await importAccountAddons(client, state, { loader: async () => { throw Error('offline'); } });
  assert.equal(result.failed, 1); assert.deepEqual(state.addons, [old]);
});
test('account switch during import cannot install another account’s configured URLs', async () => {
  const state = { addons: [] }, client = { user, addons: async () => [{ url: 'https://addon.fixture/manifest.json' }] };
  await assert.rejects(importAccountAddons(client, state, { loader: async url => { client.user = { id: 'other' }; return { url, manifest: { id: 'addon' } }; } }), e => e.name === 'AbortError');
  assert.deepEqual(state.addons, []);
});
