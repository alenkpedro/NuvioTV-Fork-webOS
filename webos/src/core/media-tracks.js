// SPDX-License-Identifier: GPL-3.0-only
// HTMLMediaElement track APIs, as documented by LG for webOS TV.
const languages = { pt: 'Português', por: 'Português', pob: 'Português (Brasil)', 'pt-br': 'Português (Brasil)', en: 'Inglês', eng: 'Inglês', es: 'Espanhol', spa: 'Espanhol', fr: 'Francês', fra: 'Francês', fre: 'Francês', de: 'Alemão', deu: 'Alemão', ger: 'Alemão', it: 'Italiano', ita: 'Italiano', ja: 'Japonês', jpn: 'Japonês', ko: 'Coreano', kor: 'Coreano', zh: 'Chinês', zho: 'Chinês', rus: 'Russo', ru: 'Russo' };
export function languageName(code) {
  const value = typeof code === 'string' ? code.trim().toLowerCase().replace('_', '-') : '';
  if (!value || value === 'und' || value === 'unknown') return 'Idioma não informado';
  return languages[value] || value.slice(0, 40);
}
export function mediaTracks(video, kind) {
  try {
    const tracks = kind === 'audio' ? video.audioTracks : video.textTracks;
    return Array.from({ length: Math.min(tracks?.length || 0, 64) }, (_, index) => ({ track: tracks[index], index }))
      .filter(({ track }) => track && (kind === 'audio' || ['subtitles', 'captions'].includes(track.kind)))
      .map(({ track, index }) => ({ track, index, name: String(track.label || `${kind === 'audio' ? 'Áudio' : 'Legenda'} ${index + 1}`), language: languageName(track.language), selected: kind === 'audio' ? track.enabled === true : track.mode === 'showing' }));
  } catch { return []; }
}
export function selectAudioTrack(video, track) {
  const rows = mediaTracks(video, 'audio');
  if (!rows.some(r => r.track === track)) throw Error('Esta faixa de áudio não está mais disponível. Abra o menu novamente.');
  const previous = rows.map(r => r.track.enabled);
  try {
    track.enabled = true;
    for (const row of rows) if (row.track !== track) row.track.enabled = false;
    if (!track.enabled || rows.some(r => r.track !== track && r.track.enabled)) throw Error('ignored');
  } catch {
    rows.forEach((r, i) => { try { r.track.enabled = previous[i]; } catch {} });
    throw Error('O player não aceitou a troca de áudio nesta fonte.');
  }
}
export function selectTextTrack(video, track = null) {
  const rows = mediaTracks(video, 'text');
  if (track && !rows.some(r => r.track === track)) throw Error('Esta legenda não está mais disponível. Abra o menu novamente.');
  const previous = rows.map(r => r.track.mode);
  try {
    for (const row of rows) row.track.mode = row.track === track ? 'showing' : 'disabled';
    if (rows.some(row => row.track.mode !== (row.track === track ? 'showing' : 'disabled'))) throw Error('ignored');
  } catch {
    rows.forEach((r, i) => { try { r.track.mode = previous[i]; } catch {} });
    throw Error('O player não aceitou esta legenda interna.');
  }
}
