// SPDX-License-Identifier: GPL-3.0-only
// Protocol: fork AuthManager.kt / AccountViewModel.kt / AddonSyncService.kt.
import { historySource, parseHistory } from './history.js';
import { parseProfiles, parseLibrary } from './profiles.js';
import publicConfig from './nuvio-config.json' with { type: 'json' };
export const SESSION_KEY = 'nuvio-fork.webos.account.v1';
export class AccountError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}
const cancelled = () => new DOMException('Cancelado', 'AbortError');
export function createAccountClient({ storage, fetcher = globalThis.fetch, config = publicConfig, now = Date.now, random = bytes => crypto.getRandomValues(bytes) }) {
  let session = null, refreshFlight = null, generation = 0;
  try {
    const s = JSON.parse(storage.getItem(SESSION_KEY));
    if (s?.access_token && s?.refresh_token && typeof s.user?.id === 'string' && Number.isFinite(s.expires_at)) session = s;
  } catch { /* An absent/damaged local session means signed out. */ }
  function clear() { generation++; session = null; storage.removeItem(SESSION_KEY); }
  function commit(s) {
    // Tokens never enter add-on requests, UI text, logs, or the general app state.
    try { storage.setItem(SESSION_KEY, JSON.stringify(s)); }
    catch { throw new AccountError('Não foi possível salvar o login nesta TV. Libere espaço e tente novamente.'); }
    session = s;
  }
  async function request(path, { body, token, signal, method = body === undefined ? 'GET' : 'POST' } = {}) {
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController(); const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    try {
      const headers = { apikey: config.publishableKey, Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetcher(config.backendUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (r.status === 204) return null;
      if (Number(r.headers.get('content-length')) > 1024 * 1024) throw new AccountError('Resposta da conta acima do limite da TV.');
      const raw = await r.text();
      if (raw.length > 1024 * 1024) throw new AccountError('Resposta da conta acima do limite da TV.');
      let data; try { data = raw ? JSON.parse(raw) : null; } catch { throw new AccountError('O serviço Nuvio retornou uma resposta inválida.', r.status); }
      if (!r.ok) {
        // Never expose server bodies: they can contain tokens or configured URLs.
        const code = typeof data?.code === 'string' ? data.code : typeof data?.error_code === 'string' ? data.error_code : '';
        const message = r.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : r.status >= 500 ? 'O serviço Nuvio está temporariamente indisponível. Tente novamente.' : [401, 403].includes(r.status) ? 'Sua sessão Nuvio precisa ser renovada. Entre novamente.' : 'Não foi possível concluir a operação na conta Nuvio. Tente novamente.';
        throw new AccountError(message, r.status, code);
      }
      return data;
    } catch (e) {
      if (signal?.aborted) throw cancelled();
      if (controller.signal.aborted) throw new AccountError('O serviço Nuvio demorou a responder. Tente novamente.');
      if (e instanceof TypeError) throw new AccountError('Não foi possível conectar ao Nuvio. Verifique a conexão da TV.');
      throw e;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  function tokenSession(data, user) {
    if (typeof data?.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token || typeof user?.id !== 'string' || !user.id || typeof user.email !== 'string') throw new AccountError('A vinculação não retornou uma sessão Nuvio válida. Gere outro código.');
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: now() + Math.max(30, Number(data.expires_in) || 3600) * 1000, user: { id: user.id, email: user.email } };
  }
  async function refresh() {
    if (!session) throw new AccountError('Entre na sua conta Nuvio para sincronizar.');
    if (!refreshFlight) {
      const old = session, epoch = generation;
      refreshFlight = (async () => {
        try {
          // A rotating refresh must finish even if the current screen is closed.
          const data = await request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: old.refresh_token } });
          if (epoch !== generation) throw cancelled();
          const next = tokenSession(data, data.user || old.user);
          if (next.user.id !== old.user.id) throw new AccountError('A sessão retornou outra conta. Entre novamente.');
          commit(next);
        } catch (error) {
          if (epoch === generation && ([401, 403].includes(error.status) || ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'invalid_grant'].includes(error.code))) clear();
          throw error;
        } finally { refreshFlight = null; }
      })();
    }
    await refreshFlight;
  }
  async function authorized(path, body, signal) {
    if (!session) throw new AccountError('Entre na sua conta Nuvio para sincronizar.');
    const epoch=generation, userId=session.user.id;
    const check=()=>{if(epoch!==generation || session?.user.id!==userId || signal?.aborted)throw cancelled();};
    if (session.expires_at <= now() + 60000) await refresh();
    check();
    const observed = session?.access_token;
    if (!observed || signal?.aborted) throw cancelled();
    try { return await request(path, { body, token: observed, signal }); }
    catch (error) {
      if (error.status !== 401) throw error;
      if (session?.access_token === observed) await refresh();
      if (!session) throw error;
      check();
      return request(path, { body, token: session.access_token, signal });
    }
  }
  function pairingURL(value) {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.origin !== new URL(config.linkUrl).origin || !['/link', '/tv-login'].includes(u.pathname.replace(/\/$/, '')) || u.username || u.password) throw new AccountError('O serviço retornou um endereço de vinculação inválido.');
    return u.href;
  }
  return {
    get user() { return session ? { ...session.user } : null; },
    get hasSession() { return !!session; },
    async restore(signal) {
      if (!session) return null;
      const user = await authorized('/auth/v1/user', undefined, signal);
      if (typeof user?.id !== 'string' || user.id !== session?.user.id || !user.email) throw new AccountError('Não foi possível validar a conta Nuvio.');
      return { id: user.id, email: user.email };
    },
    async start(signal) {
      const bytes = random(new Uint8Array(24));
      const nonce = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      let data;
      try {
        const result = await request('/rest/v1/rpc/start_device_login_session', { signal, body: { p_device_nonce: nonce, p_device_name: 'Nuvio Fork · LG webOS', p_device_type: 'tv', p_redirect_base_url: config.linkUrl } });
        data = result?.[0];
      } catch (error) {
        if (error.code !== 'PGRST202') throw error;
        const result = await request('/rest/v1/rpc/start_tv_login_session', { signal, body: { p_device_nonce: nonce, p_device_name: 'Nuvio Fork · LG webOS', p_redirect_base_url: config.legacyLinkUrl } });
        const old = result?.[0];
        data = old && { device_code: old.code, user_code: old.code, verification_uri_complete: old.web_url, expires_at: old.expires_at, poll_interval_seconds: old.poll_interval_seconds };
      }
      if (typeof data?.device_code !== 'string' || typeof data.user_code !== 'string' || !Number.isFinite(Date.parse(data.expires_at))) throw new AccountError('O serviço não retornou um código de vinculação válido.');
      return { nonce, code: data.device_code, userCode: data.user_code, url: pairingURL(data.verification_uri_complete), expiresAt: Math.min(Date.parse(data.expires_at), now() + 15 * 60000), interval: Math.max(2, Math.min(30, Number(data.poll_interval_seconds) || 3)) };
    },
    async poll(pairing, signal) {
      const r = await request('/rest/v1/rpc/poll_tv_login_session', { signal, body: { p_code: pairing.code, p_device_nonce: pairing.nonce } });
      if (!r?.[0]?.status) throw new AccountError('Não foi possível verificar a vinculação. Gere outro código.');
      return { status: String(r[0].status).toLowerCase(), interval: Math.max(2, Math.min(30, Number(r[0].poll_interval_seconds) || pairing.interval)) };
    },
    async exchange(pairing, signal) {
      const epoch = generation;
      const data = await request('/functions/v1/tv-logins-exchange', { signal, body: { code: pairing.code, device_nonce: pairing.nonce } });
      if (!data?.access_token) throw new AccountError('A vinculação não retornou uma sessão válida.');
      const user = await request('/auth/v1/user', { signal, token: data.access_token });
      if (signal?.aborted || epoch !== generation) throw cancelled();
      commit(tokenSession(data, user));
      return { ...session.user };
    },
    async addons(signal, profileId = 1) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6) throw new AccountError('Perfil inválido.');
      const owner = await authorized('/rest/v1/rpc/get_sync_owner', {}, signal);
      if (typeof owner !== 'string' || !owner) throw new AccountError('Não foi possível identificar o proprietário dos addons.');
      const query = new URLSearchParams({ select: 'url,name,enabled,sort_order,profile_id', user_id: `eq.${owner}`, profile_id: `eq.${profileId}`, order: 'sort_order.asc', limit: '31' });
      const rows = await authorized(`/rest/v1/addons?${query}`, undefined, signal);
      if (!Array.isArray(rows) || rows.some(r => typeof r.url !== 'string')) throw new AccountError('A conta retornou uma lista de addons inválida.');
      if (rows.length > 30) throw new AccountError('A conta tem mais de 30 addons neste perfil; esta versão suporta até 30.');
      return rows.filter(r => r.enabled !== false);
    },
    async profiles(signal) {
      const [profiles, locks] = await Promise.all([
        authorized('/rest/v1/rpc/sync_pull_profiles', {}, signal),
        authorized('/rest/v1/rpc/sync_pull_profile_locks', {}, signal)
      ]);
      return parseProfiles(profiles, locks);
    },
    async verifyPin(profileId, pin, signal) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6 || !/^\d{4}$/.test(pin)) throw new AccountError('Informe o PIN de quatro números.');
      const rows = await authorized('/rest/v1/rpc/verify_profile_pin', { p_profile_id: profileId, p_pin: pin }, signal);
      if (!Array.isArray(rows) || typeof rows[0]?.unlocked !== 'boolean') throw new AccountError('Não foi possível validar o PIN.');
      return { unlocked: rows[0].unlocked, retryAfter: Math.max(0, Number(rows[0].retry_after_seconds) || 0) };
    },
    async library(profileId, signal) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6) throw new AccountError('Perfil inválido.');
      const items = [];
      // Paginated snapshot: commit only when every page succeeds, including empty snapshots.
      for (let offset = 0; offset <= 2000; offset += 100) {
        const page = await authorized('/rest/v1/rpc/sync_pull_library', { p_profile_id: profileId, p_limit: 100, p_offset: offset }, signal);
        if (!Array.isArray(page) || page.length > 100) throw new AccountError('A conta retornou uma página de biblioteca inválida.');
        items.push(...page);
        if (items.length > 2000) throw new AccountError('Biblioteca acima do limite de 2.000 títulos desta versão. A cópia anterior foi preservada.');
        if (page.length < 100) return parseLibrary(items, profileId);
      }
      throw new AccountError('Não foi possível concluir a leitura da biblioteca.');
    },
    async history(profileId, signal) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6) throw new AccountError('Perfil inválido.');
      const settings = await authorized('/rest/v1/rpc/sync_pull_profile_settings_blob', { p_profile_id:profileId, p_platform:'tv' }, signal);
      const sourcePreference = historySource(settings,profileId);
      // Trakt/Simkl authentication is device-local in the fork and is not ported here.
      // Therefore Nuvio is the same unauthenticated-provider fallback, never external history.
      const progress = await authorized('/rest/v1/rpc/sync_pull_watch_progress', {p_profile_id:profileId,p_limit:1001}, signal);
      if (!Array.isArray(progress) || progress.length > 1000) throw new AccountError('Histórico acima do limite de 1.000 registros por importação. A cópia anterior foi preservada.');
      const watched=[];
      for(let page=1;page<=21;page++) {
        const rows=await authorized('/rest/v1/rpc/sync_pull_watched_items',{p_profile_id:profileId,p_page:page,p_page_size:100},signal);
        if(!Array.isArray(rows) || rows.length>100) throw new AccountError('Página de assistidos inválida.');
        watched.push(...rows);
        if(watched.length>2000) throw new AccountError('Mais de 2.000 assistidos. A cópia anterior foi preservada.');
        if(rows.length<100) return {...parseHistory(progress,watched,profileId),sourcePreference};
      }
      throw new AccountError('Não foi possível concluir a importação do histórico.');
    },
    async collections(profileId, signal) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6) throw new AccountError('Perfil inválido.');
      const rows = await authorized('/rest/v1/rpc/sync_pull_collections', { p_profile_id: profileId }, signal);
      if (!Array.isArray(rows)) throw new AccountError('A conta retornou coleções inválidas.');
      const blob = rows.find(row => row && typeof row === 'object');
      // No row means this profile never stored collections; the local copy is kept.
      return { present: Boolean(blob), collections: blob && Array.isArray(blob.collections_json) ? blob.collections_json : [], updatedAt: blob?.updated_at || null };
    },
    async pushCollections(profileId, collections, clientId, signal) {
      if (!Number.isInteger(profileId) || profileId < 1 || profileId > 6) throw new AccountError('Perfil inválido para enviar coleções.');
      if (!/^[a-zA-Z0-9_-]{16,96}$/.test(clientId)) throw new AccountError('Identificador de sincronização inválido.');
      if (!Array.isArray(collections)) throw new AccountError('Coleções inválidas para enviar.');
      await authorized('/rest/v1/rpc/sync_push_collections', { p_profile_id: profileId, p_collections_json: collections, p_origin_client_id: clientId }, signal);
      return { collections: collections.length };
    },
    async mutate(profileId, op, clientId, signal, expectedUserId) {
      if (!Number.isInteger(profileId) || profileId<1 || profileId>6 || session?.user.id!==expectedUserId) throw new AccountError('Perfil ou conta inválidos para envio.');
      if (!/^[a-zA-Z0-9_-]{16,96}$/.test(clientId)) throw new AccountError('Identificador de sincronização inválido.');
      const v=op.value, [type,id]=JSON.parse(op.key);
      if(!['movie','series'].includes(type) || typeof id!=='string' || !id || id.length>512)throw new AccountError('Item inválido para sincronizar.');
      const base={p_profile_id:profileId,p_origin_client_id:clientId};let rpc,body;
      if(op.kind==='library') {
        rpc=v?'sync_push_library_items':'sync_delete_library_items';
        body=v?{p_items:[{content_id:id,content_type:type,name:v.name || id,poster:v.poster || null,poster_shape:'POSTER',background:v.background || null,description:v.description || null,release_info:v.releaseInfo || null,imdb_rating:null,genres:v.genres || [],addon_base_url:null,added_at:v.addedAt || 0}]}:{p_keys:[{content_id:id,content_type:type}]};
      } else if(op.kind==='watched') {
        const [, ,season=null,episode=null]=JSON.parse(op.key);
        rpc=v?.value?'sync_push_watched_items':'sync_delete_watched_items';
        body=v?.value?{p_items:[{content_id:id,content_type:type,title:v.name || id,season,episode,watched_at:v.updated}]}:{p_keys:[{content_id:id,...(season!==null?{season,episode}:{})}]};
      } else if(op.kind==='progress') {
        if(!v || !Number.isFinite(v.time) || v.time<0 || !Number.isFinite(v.duration) || v.duration<=0 || !Number.isSafeInteger(v.updated) || !v.meta?.id || (type==='series' && (!Number.isInteger(v.episode?.season) || !Number.isInteger(v.episode?.episode))))throw new AccountError('Progresso inválido para sincronizar.');
        rpc='sync_push_watch_progress';
        body={p_entries:[{content_id:v.meta.id,content_type:type,video_id:id,...(v.episode || {}),position:Math.round(v.time*1000),duration:Math.round(v.duration*1000),last_watched:v.updated,progress_key:v.episode?`${v.meta.id}_s${v.episode.season}e${v.episode.episode}`:v.meta.id}]};
      } else throw new AccountError('Operação de sincronização inválida.');
      return authorized(`/rest/v1/rpc/${rpc}`,{...base,...body},signal);
    },
    async signOut() {
      try { if (refreshFlight) await refreshFlight; } catch { /* Revoke whatever session remains. */ }
      const token = session?.access_token; clear();
      if (!token) return true;
      try { await request('/auth/v1/logout?scope=local', { token, method: 'POST' }); return true; }
      catch { return false; } // Local credentials are removed even when offline.
    }
  };
}
