// SPDX-License-Identifier: GPL-3.0-only
// The TV page cannot set request headers or read a response without CORS permission, so API calls
// that need a key (Trakt, Simkl, debrid, plugins) go through the packaged service. In a browser
// (tests, development) the same call falls back to fetch, so every caller has one code path.
const serviceURI = 'luna://org.nuviofork.webos.segments/fetch';
function bridgeAvailable(Bridge) { return typeof Bridge === 'function'; }
export function fetchThroughService(payload, signal, Bridge = globalThis.PalmServiceBridge) {
  return new Promise((resolve, reject) => {
    let done = false, timer;
    const bridge = new Bridge();
    const finish = (error, data) => {
      if (done) return;
      done = true; clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      bridge.onservicecallback = () => {};
      try { bridge.cancel(); } catch {}
      error ? reject(error) : resolve(data);
    };
    const abort = () => finish(new DOMException('Cancelado', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(Error('Serviço de rede indisponível.')), Number(payload.timeoutMs || 20000) + 5000);
    bridge.onservicecallback = raw => {
      try {
        const response = JSON.parse(raw);
        finish(response.returnValue === true ? null : Error(response.errorText || 'Requisição recusada.'), response.data);
      } catch { finish(Error('Resposta inválida.')); }
    };
    try { bridge.call(serviceURI, JSON.stringify(payload)); } catch { finish(Error('Serviço de rede indisponível.')); }
  });
}
async function fetchDirect(payload, signal, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(payload.url, { method: payload.method || 'GET', headers: payload.headers, body: payload.body, signal });
  const buffer = await response.arrayBuffer();
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim();
  const textual = /^(?:text\/|application\/(?:json|xml|x-www-form-urlencoded|javascript|manifest\+json)|image\/svg)/i.test(type) || (!type && buffer.byteLength < 4096);
  const bytes = new Uint8Array(buffer);
  let text = null;
  if (textual) text = new TextDecoder().decode(bytes);
  return {
    status: response.status, ok: response.ok, url: response.url, contentType: type, bytes: bytes.length,
    text, bodyBase64: text === null ? btoa(String.fromCharCode(...bytes.slice(0, 3 * 1024 * 1024))) : undefined,
    headers: { 'content-range': response.headers.get('content-range'), 'accept-ranges': response.headers.get('accept-ranges'), location: response.headers.get('location') }
  };
}
export function createNetwork({ Bridge = globalThis.PalmServiceBridge, fetchImpl = globalThis.fetch } = {}) {
  const send = (payload, signal) => bridgeAvailable(Bridge)
    ? fetchThroughService(payload, signal, Bridge)
    : fetchDirect(payload, signal, fetchImpl);
  return {
    available: () => bridgeAvailable(Bridge),
    send,
    async json(url, { headers, method = 'GET', body, signal, timeoutMs } = {}) {
      const response = await send({ url, method, headers, body, timeoutMs }, signal);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      try { return JSON.parse(response.text ?? ''); } catch { throw Error('Resposta inválida.'); }
    },
    async text(url, { headers, method = 'GET', body, signal, timeoutMs } = {}) {
      const response = await send({ url, method, headers, body, timeoutMs }, signal);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.text ?? '';
    }
  };
}
