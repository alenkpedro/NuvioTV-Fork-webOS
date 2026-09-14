// SPDX-License-Identifier: GPL-3.0-only
// Protocol: fork AuthManager.kt / AccountViewModel.kt / AddonSyncService.kt.
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
        const message = r.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : r.status >= 500 ? 'O serviço Nuvio está temporariamente indisponível. Tente novamente.' : [401, 403].includes(r.status) ? 'Sua sessão Nuvio precisa ser renovada. Entre novamente.' : 'Não foi possível concluir a operação na conta Nuvio. Tente gerar outro código.';
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
    if (session.expires_at <= now() + 60000) await refresh();
    const observed = session?.access_token;
    if (!observed || signal?.aborted) throw cancelled();
    try { return await request(path, { body, token: observed, signal }); }
    catch (error) {
      if (error.status !== 401) throw error;
      if (session?.access_token === observed) await refresh();
      if (!session) throw error;
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
    async addons(signal) {
      const owner = await authorized('/rest/v1/rpc/get_sync_owner', {}, signal);
      if (typeof owner !== 'string' || !owner) throw new AccountError('Não foi possível identificar o proprietário dos addons.');
      const query = new URLSearchParams({ select: 'url,name,enabled,sort_order,profile_id', user_id: `eq.${owner}`, profile_id: 'eq.1', order: 'sort_order.asc', limit: '31' });
      const rows = await authorized(`/rest/v1/addons?${query}`, undefined, signal);
      if (!Array.isArray(rows) || rows.some(r => typeof r.url !== 'string')) throw new AccountError('A conta retornou uma lista de addons inválida.');
      if (rows.length > 30) throw new AccountError('A conta tem mais de 30 addons no perfil principal; esta versão suporta até 30.');
      return rows.filter(r => r.enabled !== false);
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
