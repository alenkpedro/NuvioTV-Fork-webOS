// SPDX-License-Identifier: GPL-3.0-only
// Port of DirectDebridStreamFilter, StreamQualityRank and StreamTextSizeParser
// from ysosrs123/NuvioTV-Fork @ 45e0984. See PORTING.md for deliberate differences.
import data from './fork-defaults.json' with { type: 'json' };
export const defaults = data.defaults;
export const enums = data.enums;
const MAX = 2147483647;
const lower = v => String(v ?? '').toLowerCase();
const nonGroup = new Set('dl rip hd uhd sd web bluray remux hdr hdr10 sdr dv dovi ma es x atmos truehd dts aac ac3 eac3 flac opus avc hevc av1 x264 x265 h264 h265 vc1 10bit 8bit hi10p imax proper repack extended remastered unrated multi dual sub subs dubbed hc cam ts tc scr 2160p 1440p 1080p 720p 576p 480p 360p 4k 2k'.split(' '));
const extension = /\.(mkv|mp4|m4v|avi|ts|m2ts|webm|mov)$/i;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regexCache = new Map();
const matches = (s, expression) => {
  let regex = regexCache.get(expression);
  if (!regex) { regex = new RegExp(expression); if (regexCache.size >= 128) regexCache.delete(regexCache.keys().next().value); regexCache.set(expression, regex); }
  return regex.test(lower(s));
};
const token = (s, t) => matches(s, `(^|[^a-z0-9])${escape(lower(t))}([^a-z0-9]|$)`);
const anyToken = (s, patterns) => matches(s, `(^|[^a-z0-9])(${patterns.join('|')})([^a-z0-9]|$)`);
const rank = (v, list) => { const n = list.indexOf(v); return n < 0 ? MAX : n; };
const rankAny = (v, list) => Math.min(MAX, ...v.map(x => rank(x, list)));
export const preferences = overrides => ({ ...defaults, ...overrides });
export function sizeFromText(value) {
  const m = String(value ?? '').match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB)\b/i);
  if (!m) return null;
  const n = Math.floor(Number(m[1].replace(',', '.')) * 1024 ** ({ KB: 1, MB: 2, GB: 3, TB: 4 }[m[2].toUpperCase()]));
  return n > 0 ? n : null;
}
export function sizeBytes(s) {
  return s.clientResolve?.stream?.raw?.size ?? s.behaviorHints?.videoSize ?? s.debridCacheStatus?.cachedSize ?? sizeFromText(s.description) ?? sizeFromText(s.title) ?? sizeFromText(s.name);
}
export function releaseGroupFromText(value) {
  const text = String(value ?? '').trim();
  const compound = text.match(/(?:^|[^A-Za-z0-9])(VISIONPLUSHDR-X|BR-GuyZo|Pahe\.in|Pahe\.ph|D-Z0N3|YTS\.LT|YTS\.MX|YTS\.AG|C\.A\.A)(?![A-Za-z0-9])/i);
  if (compound) return compound[1];
  const bracket = text.match(/^\[([A-Za-z0-9][A-Za-z0-9._-]{1,23})\]/);
  if (bracket && !nonGroup.has(lower(bracket[1]))) return bracket[1];
  for (const line of text.split(/\r\n|\n|\r/)) {
    const stripped = line.trim().replace(extension, '');
    const n = stripped.lastIndexOf('-');
    if (n <= 0 || n >= stripped.length - 1) continue;
    const tail = stripped.slice(n + 1).trim();
    const t = (tail.match(/^[A-Za-z0-9][A-Za-z0-9._]{0,23}/)?.[0] ?? '').replace(extension, '');
    if (!t || nonGroup.has(lower(t)) || /^\d+$/.test(t) || /^\d\.\d$/.test(t) || (t.length === 1 && tail !== t)) continue;
    return t;
  }
  return '';
}
export function releaseGroup(s) {
  const r = s.clientResolve, raw = r?.stream?.raw;
  if (raw?.parsed?.group?.trim()) return raw.parsed.group.trim();
  for (const v of [s.behaviorHints?.filename, r?.filename, raw?.filename, r?.torrentName, raw?.torrentName, s.name, s.title, s.description]) {
    const group = releaseGroupFromText(v);
    if (group) return group;
  }
  return '';
}
export function factsFor(s, overrides = {}) {
  const p = preferences(overrides), r = s.clientResolve, raw = r?.stream?.raw, parsed = raw?.parsed ?? {};
  const search = [s.name, s.title, s.description, s.behaviorHints?.filename, s.quality, r?.torrentName, r?.filename, raw?.torrentName, raw?.filename, s.debridCacheStatus?.cachedName, parsed.resolution, parsed.quality, parsed.codec, parsed.hdr?.join(' '), parsed.audio?.join(' ')].filter(x => x != null).join(' ').toLowerCase();
  let resolution = 'UNKNOWN';
  for (const v of [parsed.resolution, parsed.quality, s.quality, search]) {
    for (const [id, patterns] of [['P2160', ['2160p?', '4k', 'uhd']], ['P1440', ['1440p?', '2k']], ['P1080', ['1080p?', 'fhd']], ['P720', ['720p?', 'hd']], ['P576', ['576p?']], ['P480', ['480p?', 'sd']], ['P360', ['360p?']]]) {
      if (anyToken(v, patterns)) { resolution = id; break; }
    }
    if (resolution !== 'UNKNOWN') break;
  }
  const q = lower(`${parsed.quality ?? ''} ${search}`);
  let quality = 'UNKNOWN';
  for (const [id, markers] of [['BLURAY_REMUX', ['remux']], ['BLURAY', ['blu-ray', 'bluray', 'bdrip', 'brrip']], ['WEB_DL', ['web-dl', 'webdl']], ['WEBRIP', ['webrip', 'web-rip']], ['HDRIP', ['hdrip']], ['HD_RIP', ['hd-rip', 'hcrip']], ['DVDRIP', ['dvdrip']], ['HDTV', ['hdtv']]]) {
    if (markers.some(x => q.includes(x))) { quality = id; break; }
  }
  if (quality === 'UNKNOWN') quality = ['CAM', 'TS', 'TC', 'SCR'].find(x => token(q, x)) ?? 'UNKNOWN';
  const visualTags = [], audioTags = [], audioChannels = [];
  const hdr = Array.isArray(parsed.hdr) ? parsed.hdr : [];
  const visual = lower([...hdr, search].join(' '));
  const dv = hdr.some(x => ['dv', 'dovi', 'dolbyvision'].includes(lower(x).replace(/[^a-z0-9]/g, ''))) || /(^|[^a-z0-9])(dv|dovi|dolby[ ._-]?vision)([^a-z0-9]|$)/.test(search);
  const hasHdr = hdr.some(x => ['hdr', 'hdr10', 'hdr10+', 'hdr10plus', 'hlg'].includes(lower(x).replace(/[^a-z0-9+]/g, ''))) || /(^|[^a-z0-9])(hdr|hdr10|hdr10plus|hdr10\+|hlg)([^a-z0-9]|$)/.test(search);
  const push = (arr, condition, tag) => { if (condition) arr.push(tag); };
  push(visualTags, dv && hasHdr, 'HDR_DV'); push(visualTags, dv && !hasHdr, 'DV_ONLY'); push(visualTags, hasHdr && !dv, 'HDR_ONLY');
  push(visualTags, visual.includes('hdr10+') || visual.includes('hdr10plus'), 'HDR10_PLUS'); push(visualTags, visual.includes('hdr10'), 'HDR10');
  push(visualTags, dv, 'DV'); push(visualTags, hasHdr, 'HDR'); push(visualTags, token(visual, 'hlg'), 'HLG');
  push(visualTags, visual.includes('10bit') || visual.includes('10 bit'), 'TEN_BIT');
  for (const [word, id] of [['3d', 'THREE_D'], ['imax', 'IMAX'], ['ai', 'AI'], ['sdr', 'SDR']]) push(visualTags, token(visual, word), id);
  push(visualTags, visual.includes('h-ou'), 'H_OU'); push(visualTags, visual.includes('h-sbs'), 'H_SBS');
  const audio = lower([...(parsed.audio ?? []), search].join(' '));
  push(audioTags, token(audio, 'atmos'), 'ATMOS');
  push(audioTags, ['dd+', 'ddp', 'dolby digital plus'].some(x => audio.includes(x)), 'DD_PLUS');
  push(audioTags, token(audio, 'dd') || audio.includes('ac3') || audio.includes('dolby digital'), 'DD');
  for (const [id, words] of [['DTS_X', ['dts:x', 'dtsx']], ['DTS_HD_MA', ['dts-hd ma', 'dtshd ma']], ['DTS_HD', ['dts-hd', 'dtshd']], ['DTS_ES', ['dts-es', 'dtses']], ['TRUEHD', ['truehd', 'true hd']]]) push(audioTags, words.some(x => audio.includes(x)), id);
  for (const id of ['DTS', 'OPUS', 'FLAC', 'AAC']) push(audioTags, token(audio, id), id);
  const ch = lower([...(parsed.channels ?? []), search].join(' '));
  for (const [id, words] of [['CH_7_1', ['7.1']], ['CH_6_1', ['6.1']], ['CH_5_1', ['5.1', '6ch']], ['CH_2_0', ['2.0']]]) push(audioChannels, words.some(x => token(ch, x)), id);
  const codec = lower(`${parsed.codec ?? ''} ${search}`);
  const encode = [['AV1', ['av1']], ['HEVC', ['hevc', 'h265', 'x265']], ['AVC', ['avc', 'h264', 'x264']], ['XVID', ['xvid']], ['DIVX', ['divx']]].find(([, words]) => words.some(x => token(codec, x)))?.[0] ?? 'UNKNOWN';
  let languages = (parsed.languages ?? []).map(x => enums.DebridStreamLanguage.entries.find(e => [e.code, lower(e.label)].includes(lower(x)))?.id).filter(Boolean);
  if (!languages.length) languages = enums.DebridStreamLanguage.entries.filter(e => token(search, e.code)).map(e => e.id);
  for (const list of [visualTags, audioTags, audioChannels]) if (!list.length) list.push('UNKNOWN');
  const group = releaseGroup(s);
  return { resolution, quality, visualTags, audioTags, audioChannels, encode, languages, releaseGroup: group, size: sizeBytes(s),
    resolutionRank: rank(resolution, p.preferredResolutions), qualityRank: rank(quality, p.preferredQualities),
    visualRank: rankAny(visualTags, p.preferredVisualTags), audioRank: rankAny(audioTags, p.preferredAudioTags),
    channelRank: rankAny(audioChannels, p.preferredAudioChannels), encodeRank: rank(encode, p.preferredEncodes),
    languageRank: rankAny(languages, p.preferredLanguages), groupRank: group ? rank(lower(group), p.preferredReleaseGroups.map(lower)) : MAX };
}
const categories = [['Resolutions', 'resolution'], ['Qualities', 'quality'], ['VisualTags', 'visualTags'], ['AudioTags', 'audioTags'], ['AudioChannels', 'audioChannels'], ['Encodes', 'encode']];
const values = v => Array.isArray(v) ? v : [v];
export function passesExclusions(f, overrides = {}) {
  const p = preferences(overrides);
  if (categories.some(([key, field]) => values(f[field]).some(x => p[`excluded${key}`].includes(x)))) return false;
  if (f.languages.length && f.languages.every(x => p.excludedLanguages.includes(x))) return false;
  return !p.excludedReleaseGroups.some(x => lower(x) === lower(f.releaseGroup));
}
export function passesRequirements(f, overrides = {}) {
  const p = preferences(overrides);
  if (categories.some(([key, field]) => p[`required${key}`].length && !values(f[field]).some(x => p[`required${key}`].includes(x)))) return false;
  if (p.requiredLanguages.length && !f.languages.some(x => p.requiredLanguages.includes(x))) return false;
  if (p.requiredReleaseGroups.length && !p.requiredReleaseGroups.some(x => lower(x) === lower(f.releaseGroup))) return false;
  if (f.size != null && ((p.sizeMinGb > 0 && f.size < p.sizeMinGb * 1e9) || (p.sizeMaxGb > 0 && f.size > p.sizeMaxGb * 1e9))) return false;
  return true;
}
const containerScore = s => /\.mkv\b|\bmkv\b/i.test([s.behaviorHints?.filename, s.url ?? s.externalUrl, s.name, s.title, s.description].filter(x => x != null).join(' ')) ? 1 : 0;
export function rankStreams(streams, overrides = {}) {
  if (streams.length <= 1) return [...streams];
  const decorated = streams.map((s, i) => ({ s, i, f: factsFor(s, overrides) }));
  const filtered = decorated.filter(x => passesExclusions(x.f, overrides));
  return (filtered.length ? filtered : decorated).sort((a, b) => {
    for (const k of ['resolutionRank', 'qualityRank', 'groupRank', 'visualRank', 'audioRank', 'channelRank', 'encodeRank']) if (a.f[k] !== b.f[k]) return a.f[k] - b.f[k];
    return (b.f.size ?? -1) - (a.f.size ?? -1) || containerScore(b.s) - containerScore(a.s) || a.i - b.i;
  }).map(x => x.s);
}
export function filterAndSort(streams, overrides = {}) {
  const p = preferences(overrides);
  const keys = { RESOLUTION: 'resolutionRank', QUALITY: 'qualityRank', VISUAL_TAG: 'visualRank', AUDIO_TAG: 'audioRank', AUDIO_CHANNEL: 'channelRank', ENCODE: 'encodeRank', LANGUAGE: 'languageRank', RELEASE_GROUP: 'groupRank' };
  const cached = s => s.clientResolve?.isCached === true || s.debridCacheStatus?.state === 'CACHED' ? 0 : 1;
  const rows = streams.map((s, i) => ({ s, i, f: factsFor(s, p) })).filter(x => passesExclusions(x.f, p) && passesRequirements(x.f, p));
  rows.sort((a, b) => {
    const cache = cached(a.s) - cached(b.s); if (cache) return cache;
    for (const c of p.sortCriteria) {
      const direction = c.direction === 'ASC' ? 1 : -1;
      let n = c.key === 'SIZE' ? ((a.f.size ?? 0) - (b.f.size ?? 0)) * direction : (a.f[keys[c.key]] - b.f[keys[c.key]]) * -direction;
      if (!n && c.key === 'RELEASE_GROUP') { const x = lower(a.f.releaseGroup), y = lower(b.f.releaseGroup); n = x < y ? -1 : x > y ? 1 : 0; }
      if (n) return n;
    }
    return a.i - b.i;
  });
  const resolutionCounts = {}, qualityCounts = {}, result = [];
  for (const x of rows) {
    if (p.maxResults > 0 && result.length >= p.maxResults) break;
    if (p.maxPerResolution > 0 && (resolutionCounts[x.f.resolution] ?? 0) >= p.maxPerResolution) continue;
    if (p.maxPerQuality > 0 && (qualityCounts[x.f.quality] ?? 0) >= p.maxPerQuality) continue;
    resolutionCounts[x.f.resolution] = (resolutionCounts[x.f.resolution] ?? 0) + 1;
    qualityCounts[x.f.quality] = (qualityCounts[x.f.quality] ?? 0) + 1;
    result.push(x.s);
  }
  return result;
}

// Device eligibility is separate from fork quality preferences: fallback must never
// make the browser attempt a magnet, external page or unsupported resolver object.
export function playbackIssue(s, avoidDvOnly = true) {
  if (s.clientResolve && !s.url) return 'Esta fonte precisa do resolvedor debrid, ainda não portado.';
  if (s.ytId) return 'O player do YouTube ainda não foi portado.';
  if (!s.url || !/^https?:\/\//i.test(s.url)) return 'Esta fonte não oferece um link HTTP(S) direto.';
  if (s.debridCacheStatus && ['CHECKING', 'NOT_CACHED', 'UNKNOWN'].includes(s.debridCacheStatus.state)) return 'A fonte não confirmou disponibilidade em cache.';
  if (Object.keys(s.behaviorHints?.proxyHeaders?.request ?? {}).length) return 'Esta fonte exige cabeçalhos HTTP; o transporte local ainda não foi portado.';
  if (avoidDvOnly && factsFor(s).visualTags.includes('DV_ONLY')) return 'A fonte anuncia apenas Dolby Vision. A UT8050 usa HDR10/HLG.';
  return null;
}
