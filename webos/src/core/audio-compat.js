// SPDX-License-Identifier: GPL-3.0-only
// The fork's "audio that fits your gear" switches (PlaybackAudioSettings.kt): per-format
// questions about the receiver — Dolby Digital, DD+, TrueHD, DTS, DTS-HD — so the player knows
// what the chain can take instead of treating passthrough as all-or-nothing.
//
// What a web app can do with that answer is different from Android, and the port says so
// instead of pretending: there is no decoder here to convert a format the receiver cannot
// take. So a format switched off becomes a *compatibility gate*: the port stops offering
// sources whose only audio is that format (they are marked as unavailable in the list, and the
// automatic choice skips them) and it asks the platform what it claims to decode, labelling
// the answer as the platform's claim, not as a measurement of the output chain.
export const audioFormats = Object.freeze([
  { id: 'dolby', label: 'Dolby Digital (AC-3)', question: 'Seu receiver decodifica Dolby Digital?', codecs: ['ac-3', 'ac3'], tags: ['dd', 'ac3', 'dolby digital'] },
  { id: 'plus', label: 'Dolby Digital Plus (E-AC-3)', question: 'Seu receiver decodifica DD+?', codecs: ['ec-3', 'eac3'], tags: ['plus', 'atmos'] },
  { id: 'truehd', label: 'Dolby TrueHD / Atmos', question: 'Seu receiver decodifica TrueHD?', codecs: ['mlpa'], tags: ['truehd', 'mlp'] },
  { id: 'dts', label: 'DTS', question: 'Seu receiver decodifica DTS?', codecs: ['dts'], tags: ['dts', 'dts core'] },
  { id: 'dtshd', label: 'DTS-HD / DTS:X', question: 'Seu receiver decodifica DTS-HD?', codecs: ['dts-hd', 'dtsx'], tags: ['dts-hd', 'dtshd', 'dts:x', 'dtsx', 'dts-hd ma'] }
]);
export const audioFormatIds = Object.freeze(audioFormats.map(format => format.id));
export const audioSwitchDefaults = Object.freeze(Object.fromEntries(audioFormatIds.map(id => [id, true])));
export function readAudioCompat(value = {}) {
  const result = { enabled: value?.audioSwitchesEnabled === true, allowed: { ...audioSwitchDefaults } };
  for (const id of audioFormatIds) if (typeof value?.[`audio${id[0].toUpperCase()}${id.slice(1)}`] === 'boolean') result.allowed[id] = value[`audio${id[0].toUpperCase()}${id.slice(1)}`];
  return result;
}
export const readPlaybackFormat = (id, value = {}) => {
  const key = `audio${id[0].toUpperCase()}${id.slice(1)}`;
  return typeof value?.[key] === 'boolean' ? value[key] : true;
};
export const playbackPatchFor = (id, allowed) => ({ [`audio${id[0].toUpperCase()}${id.slice(1)}`]: allowed });
// Tag matching is boundary-aware: "dd+" must not feed the Dolby Digital matcher, and "truehd"
// must not be read as "dd" inside a longer word.
function textHasTag(text, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}
// The formats a source carries, from the fork's own facts (audio tags parsed out of the release
// name) plus the structured fields when the add-on sends them.
export function sourceFormats(stream) {
  const raw = [stream?.name, stream?.title, stream?.description, ...(stream?.audioTags || []), ...(stream?.info?.audioTags || [])]
    .filter(value => typeof value === 'string').join(' ').toLowerCase();
  // "+"-forms belong to their own format, never to the shorter tag they start with.
  const text = raw.replace(/dd\+|ddp|e-?ac3/g, ' plus ').replace(/true-?hd/g, ' truehd ').replace(/dts-?x/g, ' dtshd ');
  const found = new Set();
  for (const format of audioFormats) {
    if (format.tags.some(tag => textHasTag(text, tag))) found.add(format.id);
  }
  return audioFormatIds.filter(id => found.has(id));
}
// audioCompatIssue(): null when the source is fine for the configured chain, otherwise the
// reason to show on the card. A source with no recognisable audio tag is never blocked — the
// port does not guess in the dark.
export function audioCompatIssue(stream, prefs = {}) {
  const compat = readAudioCompat(prefs);
  if (!compat.enabled) return null;
  const formats = sourceFormats(stream);
  if (!formats.length) return null;
  const disabled = formats.filter(id => compat.allowed[id] === false);
  if (!disabled.length || disabled.length < formats.length) return null;
  return `Áudio em ${disabled.map(id => audioFormats.find(format => format.id === id).label).join(', ')}, que você marcou como não suportado pelo seu receiver. Desligue o switch ou escolha outra fonte.`;
}
// What the platform claims it can decode. Labelled as a claim on purpose: a webOS web app
// cannot see the receiver's EDID, and the fork's diagnostics row exists exactly because a
// lying EDID looks like a real limitation.
export function platformCapabilities({ isTypeSupported = globalThis.MediaSource?.isTypeSupported } = {}) {
  if (typeof isTypeSupported !== 'function') return { available: false, formats: {} };
  const probe = codecs => codecs.some(codec => {
    try { return isTypeSupported(`audio/mp4; codecs="${codec}"`) || isTypeSupported(`video/mp4; codecs="${codec}"`); } catch { return false; }
  });
  return { available: true, formats: Object.fromEntries(audioFormats.map(format => [format.id, probe(format.codecs)])) };
}
export function capabilityText(capabilities) {
  if (!capabilities?.available) return 'A TV não expõe o que decodifica a esta página.';
  return audioFormats.map(format => `${format.label}: ${capabilities.formats[format.id] ? 'declarado' : 'não declarado'}`).join(' · ');
}
