// SPDX-License-Identifier: GPL-3.0-only
// Resource contracts adapted from the fork's AddonApi/AddonRepositoryImpl.
export function manifestURL(value) {
  const u = new URL(String(value).trim().replace(/^stremio:\/\//i, 'https://'));
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Use um endereço HTTP(S) válido para o manifest.json.');
  u.hash = '';
  u.pathname = u.pathname.replace(/\/+$/, '');
  if (!u.pathname.endsWith('/manifest.json')) u.pathname += '/manifest.json';
  return u.href;
}
export function resourceURL(addon, resource, type, id, extra = {}) {
  const u = new URL(addon.url);
  const base = u.pathname.replace(/\/manifest\.json$/, '');
  const fields = Object.entries(extra).filter(([, v]) => v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  u.pathname = `${base}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${fields ? '/' + fields : ''}.json`;
  return u.href;
}
export function supports(addon, name, type, id) {
  const m = addon.manifest;
  return (m.resources ?? []).some(r => {
    const d = typeof r === 'string' ? { name: r, types: m.types, idPrefixes: m.idPrefixes } : r;
    return d.name === name && (!d.types?.length || d.types.includes(type)) && (!d.idPrefixes?.length || d.idPrefixes.some(p => id.startsWith(p)));
  });
}
export async function getJSON(url, { signal, timeout = 15000, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const r = await fetch(url, { signal: controller.signal, credentials: 'omit', method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!r.ok) throw Error(`O servidor respondeu HTTP ${r.status}.`);
    const max = 6 * 1024 * 1024;
    if (Number(r.headers.get('content-length')) > max) throw Error('Resposta muito grande para carregar na TV.');
    // Bound decoded bytes too: a compressed response can be much larger than Content-Length.
    const reader = r.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder(); let bytes = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > max) { await reader.cancel(); throw Error('Resposta muito grande para carregar na TV.'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } else { text = await r.text(); if (text.length > max) throw Error('Resposta muito grande para carregar na TV.'); }
    return JSON.parse(text);
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (controller.signal.aborted) throw Error('O add-on demorou demais. Tente novamente.');
    if (e instanceof TypeError) throw Error('Não foi possível acessar o add-on. Verifique a rede, o endereço e a permissão CORS do servidor.');
    if (e instanceof SyntaxError) throw Error('O servidor não retornou um JSON válido.');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function loadAddon(value, options) {
  const url = manifestURL(value), m = await getJSON(url, options);
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !Array.isArray(m.resources)) throw Error('O manifesto não contém id, name e resources válidos.');
  return { url, manifest: { id: m.id, name: m.name, version: m.version, description: m.description, logo: m.logo, types: m.types, idPrefixes: m.idPrefixes, resources: m.resources, catalogs: Array.isArray(m.catalogs) ? m.catalogs.filter(c => typeof c.id === 'string' && typeof c.type === 'string') : [] } };
}
// Bounded concurrency avoids a burst of connections and JSON allocations on the TV.
export async function mapLimit(items, fn, signal, limit = 3) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && !signal?.aborted) {
      const i = cursor++;
      try { result[i] = { value: await fn(items[i], i) }; }
      catch (error) { result[i] = { error }; }
    }
  }));
  return result.filter(Boolean);
}
export function extraOptions(catalog) {
  const extras=new Map();
  for(const e of Array.isArray(catalog.extra)?catalog.extra:[])if(e && typeof e.name==='string')extras.set(e.name.toLowerCase(),{...e,name:e.name.toLowerCase(),options:Array.isArray(e.options)?e.options:[]});
  for(const raw of [...(Array.isArray(catalog.extraSupported)?catalog.extraSupported:[]),...(Array.isArray(catalog.extraRequired)?catalog.extraRequired:[])])if(typeof raw==='string') {
    const name=raw.toLowerCase();extras.set(name,{...(extras.get(name) || {name}),isRequired:extras.get(name)?.isRequired || (Array.isArray(catalog.extraRequired)?catalog.extraRequired:[]).some(x=>typeof x==='string' && x.toLowerCase()===name)});
  }
  return [...extras.values()];
}
export const normalCatalogs = a => (a.manifest.catalogs ?? []).filter(c => !extraOptions(c).some(e => e.isRequired));
