// SPDX-License-Identifier: GPL-3.0-only
// Skeletons.kt and PlaceholderShimmer.kt: the fork's loading screens. Every block occupies the
// place the real content will take — hero, rail, episode list, source rows — and the sweep is
// the fork's own (1600 ms, a 60%-wide band, white 7% → 13% → 7%) so nothing jumps when the
// content arrives. The blocks are inert: no focus, no remote stops.
const block = (el, className) => el('div', { class: `skeleton ${className}`, 'aria-hidden': true });
export function railSkeleton(el, { title = '', cards = 6, landscape = false } = {}) {
  return el('section', { class: 'catalog-section skeleton-section', 'aria-label': title ? `Carregando ${title}` : 'Carregando', role: 'status' },
    el('div', { class: 'section-head' }, title ? el('h2', { class: 'skeleton-title' }, title) : block(el, 'skeleton-heading')),
    el('div', { class: `rail skeleton-rail${landscape ? ' skeleton-rail-landscape' : ''}` },
      Array.from({ length: cards }, () => el('div', { class: 'skeleton-card', 'aria-hidden': true }, block(el, 'skeleton-art'), block(el, 'skeleton-line')))));
}
export function detailSkeleton(el, { series = false } = {}) {
  return el('div', { class: 'detail-skeleton', role: 'status', 'aria-label': 'Carregando detalhes' },
    el('div', { class: 'skeleton-hero' }, block(el, 'skeleton-backdrop')),
    el('div', { class: 'skeleton-detail-body' },
      block(el, 'skeleton-logo'), block(el, 'skeleton-meta-line'), block(el, 'skeleton-line wide'), block(el, 'skeleton-line wide'), block(el, 'skeleton-line short'),
      el('div', { class: 'skeleton-actions' }, block(el, 'skeleton-button'), block(el, 'skeleton-button round'))),
    series ? el('div', { class: 'skeleton-episodes' }, Array.from({ length: 5 }, () => el('div', { class: 'skeleton-episode', 'aria-hidden': true }, block(el, 'skeleton-thumb'), el('div', { class: 'grow' }, block(el, 'skeleton-line'), block(el, 'skeleton-line short'))))) : null);
}
export function streamsSkeleton(el, { rows = 6 } = {}) {
  return el('div', { class: 'streams skeleton-streams', role: 'status', 'aria-label': 'Buscando fontes' },
    Array.from({ length: rows }, () => el('div', { class: 'skeleton-source', 'aria-hidden': true }, block(el, 'skeleton-logo-small'), el('div', { class: 'grow' }, block(el, 'skeleton-line'), block(el, 'skeleton-line short')))));
}
