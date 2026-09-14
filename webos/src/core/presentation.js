// SPDX-License-Identifier: GPL-3.0-only
// LayoutPreferenceDataStore, ModernHomeContent, ModernHomeModels, HeroSection.
import { progressKey } from './storage.js';

export const layoutDefaults = Object.freeze({
  modernSidebar: false, hideSidebar: false, sidebarBlur: false,
  landscapePosters: false, fullBackdrop: false, posterLabels: true,
  catalogAddonName: true, catalogType: true, continueWatching: true,
  continueStyle: 'card',
});
export function readLayout(value) {
  const result = { ...layoutDefaults };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'boolean' && typeof value?.[key] === 'boolean') result[key] = value[key];
  }
  if (['card', 'poster', 'wide'].includes(value?.continueStyle)) result.continueStyle = value.continueStyle;
  return result;
}
export function homeGeometry(layout) {
  const width = layout.landscapePosters ? 126 * 1.24 * 1.34 : 126 * .84 * 1.08;
  const height = layout.landscapePosters ? width / 1.77 : 189 * .84 * 1.08;
  const rowsHeight = 540 * (layout.landscapePosters ? .49 : .52);
  const cwWidth = layout.continueStyle === 'poster' ? 126 * .84 * 1.08 : layout.continueStyle === 'wide' ? 126 * 2.1 : 126 * 1.24 * 1.34;
  return { width, height, rowsHeight, backdropHeight: 540 - rowsHeight + 24 + 14, cwWidth,
    cwHeight: layout.continueStyle === 'poster' ? 189 * .84 * 1.08 : layout.continueStyle === 'wide' ? cwWidth / 2.5 : cwWidth / 1.77 };
}
export function catalogTitle(catalog, layout) {
  const name = String(catalog.name || catalog.id || 'Catálogo');
  const title = name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1);
  return layout.catalogType ? `${title} - ${{ movie: 'Filme', series: 'Série' }[catalog.type] || catalog.type || ''}` : title;
}
export function runtimeText(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  const numeric = raw.match(/^(\d+)\s*(?:min(?:utes|utos)?|m)?$/i);
  if (!numeric) return raw;
  const minutes = Number(numeric[1]);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}` : `${minutes}min`;
}
export function releaseText(meta) {
  // Preserve the calendar date returned by the addon (avoid UTC midnight shifting a day).
  const day = typeof meta.released === 'string' && meta.released.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  if (meta.type === 'movie' && day) {
    const date = new Date(`${day}T12:00:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return String(meta.releaseInfo || '');
}
export function episodeList(meta) {
  const seen = new Set();
  return (Array.isArray(meta.videos) ? meta.videos : []).filter(v => {
    if (!v || typeof v.id !== 'string' || !v.id || seen.has(v.id)) return false;
    seen.add(v.id); return true;
  }).map(v => ({ ...v, season: Number.isInteger(v.season) && v.season >= 0 ? v.season : 0,
    episode: Number.isInteger(v.episode) && v.episode >= 0 ? v.episode : 0 }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}
export function nextEpisode(meta, progress, now = Date.now()) {
  const videos = episodeList(meta);
  const available = videos.filter(v => !v.released || !Number.isFinite(Date.parse(v.released)) || Date.parse(v.released) <= now);
  const regular = available.filter(v => v.season > 0);
  const candidates = regular.length ? regular : available;
  const latest = videos.map(v => ({ video: v, progress: progress[progressKey(meta.type, v.id)] }))
    .filter(x => x.progress && available.includes(x.video)).sort((a, b) => b.progress.updated - a.progress.updated)[0];
  if (latest && !latest.progress.complete) return { video: latest.video, resume: true };
  if (latest) {
    const index = candidates.indexOf(latest.video);
    const next = candidates.slice(index + 1).find(v => !progress[progressKey(meta.type, v.id)]?.complete);
    if (next) return { video: next, resume: false };
  }
  const video = candidates.find(v => !progress[progressKey(meta.type, v.id)]?.complete) || candidates[0];
  return video ? { video, resume: false } : null;
}
export function castMembers(meta) {
  const detailed = Array.isArray(meta.castMembers) ? meta.castMembers.filter(v => v && typeof v.name === 'string') : [];
  const names = value => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(v => typeof v === 'string' && v.trim());
  const leading = ['Creator', 'Director', 'Writer'];
  const list = detailed.length ? detailed : [
    ...names(meta.director).map(name => ({ name, character: 'Director' })),
    ...names(meta.writer).map(name => ({ name, character: 'Writer' })),
    ...names(meta.cast).map(name => ({ name })),
  ];
  const seen = new Set();
  return list.filter(m => { const key = `${m.name}|${m.character || ''}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => Number(leading.includes(b.character)) - Number(leading.includes(a.character))).slice(0, 40);
}
