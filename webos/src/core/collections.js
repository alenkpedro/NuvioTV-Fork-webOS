// SPDX-License-Identifier: GPL-3.0-only
// CollectionsDataStore.kt and domain/model/Collection.kt at 45e0984: collections own
// folders, and every folder owns sources. The port keeps the two source families that
// work on this target — an installed add-on catalog and TMDB (collection, list,
// company, network, person, director and discover) — and leaves the Trakt lists out,
// because there is no Trakt login here. Everything is per profile and local.
export const collectionLimits = Object.freeze({ collections: 20, folders: 12, sources: 8, title: 60, catalogs: 60 });
// TmdbCollectionSourceType
export const tmdbSourceTypes = Object.freeze([
  Object.freeze({ id: 'collection', label: 'Coleção do TMDB', needsId: true, media: 'movie' }),
  Object.freeze({ id: 'list', label: 'Lista do TMDB', needsId: true, media: 'both' }),
  Object.freeze({ id: 'company', label: 'Produtora', needsId: true, media: 'both' }),
  Object.freeze({ id: 'network', label: 'Emissora', needsId: true, media: 'tv' }),
  Object.freeze({ id: 'person', label: 'Pessoa (elenco)', needsId: true, media: 'both' }),
  Object.freeze({ id: 'director', label: 'Direção', needsId: true, media: 'both' }),
  Object.freeze({ id: 'discover', label: 'Descobrir (filtros)', needsId: false, media: 'both' })
]);
// TmdbCollectionMediaType / TmdbCollectionSort
export const tmdbMediaTypes = Object.freeze([Object.freeze({ id: 'movie', label: 'Filmes' }), Object.freeze({ id: 'tv', label: 'Séries' })]);
export const tmdbSorts = Object.freeze([
  Object.freeze({ id: 'popularity.desc', label: 'Mais populares' }),
  Object.freeze({ id: 'vote_average.desc', label: 'Melhor avaliados' }),
  Object.freeze({ id: 'vote_count.desc', label: 'Mais votados' }),
  Object.freeze({ id: 'primary_release_date.desc', label: 'Lançamento recente' }),
  Object.freeze({ id: 'original', label: 'Ordem original' })
]);
const text = (value, max = collectionLimits.title) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID().replaceAll('-', '').slice(0, 16) : Math.random().toString(36).slice(2, 18));
export function readCatalogSource(value) {
  if (!value || typeof value !== 'object') return null;
  const addonUrl = text(value.addonUrl, 2048);
  const addonId = text(value.addonId, 200);
  const type = text(value.type, 40);
  const catalogId = text(value.catalogId, 200);
  // A coleção vinda da conta identifica o addon pelo id do manifesto; a criada nesta TV
  // guarda os dois, então a mesma pasta funciona nos dois lados.
  if ((!addonUrl || !/^https?:/i.test(addonUrl)) && !addonId) return null;
  if (!type || !catalogId) return null;
  const source = { kind: 'catalog', addonId: addonId || '', addonUrl: addonUrl && /^https?:/i.test(addonUrl) ? addonUrl : '', type, catalogId };
  if (text(value.addonName)) source.addonName = text(value.addonName);
  if (text(value.catalogName)) source.catalogName = text(value.catalogName);
  if (text(value.genre, 200)) source.genre = text(value.genre, 200);
  return source;
}
// Trakt lists and future providers are kept verbatim so a push from the TV never deletes
// a collection the user built in another client.
export function readForeignSource(value) {
  if (!value || typeof value !== 'object') return null;
  const provider = text(value.provider, 40).toLowerCase();
  if (!provider || provider === 'addon' || provider === 'tmdb') return null;
  return { kind: 'other', provider, raw: value };
}
export function readTmdbSource(value) {
  if (!value || typeof value !== 'object') return null;
  const type = tmdbSourceTypes.find(entry => entry.id === value.sourceType);
  if (!type) return null;
  const tmdbId = Number.isSafeInteger(value.tmdbId) && value.tmdbId > 0 ? value.tmdbId : null;
  if (type.needsId && !tmdbId) return null;
  const media = tmdbMediaTypes.some(entry => entry.id === value.mediaType) ? value.mediaType : type.media;
  const source = { kind: 'tmdb', sourceType: type.id, tmdbId, mediaType: media === 'tv' ? 'tv' : 'movie', sortBy: tmdbSorts.some(entry => entry.id === value.sortBy) ? value.sortBy : 'popularity.desc' };
  if (text(value.title)) source.title = text(value.title);
  if (text(value.genres, 200)) source.genres = text(value.genres, 200);
  if (Number.isSafeInteger(value.year) && value.year >= 1900 && value.year <= 2199) source.year = value.year;
  return source;
}
export const readCollectionSource = value => {
  if (value?.kind === 'other') return value.raw ? value : readForeignSource(value.raw);
  if (value?.kind === 'tmdb') return readTmdbSource(value);
  return readCatalogSource(value) || readForeignSource(value);
};
// CollectionFolder.kt: the cover the Android app lets the user pick (image or emoji) plus the
// row/folder appearance. They are kept here so a folder covered in another client reaches the
// TV with the cover, and travels back when the collections are sent to the account again.
const posterShapes = ['POSTER', 'LANDSCAPE', 'SQUARE'];
const viewModes = ['TABBED_GRID', 'GRID', 'LIST'];
const urlField = (value, limit = 1000) => { const raw = typeof value === 'string' ? value.trim() : ''; return /^https?:\/\//i.test(raw) ? raw.slice(0, limit) : ''; };
const emojiField = value => typeof value === 'string' ? [...value.trim()].slice(0, 8).join('') : '';
function readFolderCovers(value) {
  const covers = {
    coverImageUrl: urlField(value.coverImageUrl), coverEmoji: emojiField(value.coverEmoji),
    tileShape: posterShapes.includes(value.tileShape) ? value.tileShape : 'SQUARE',
    hideTitle: value.hideTitle === true, focusGifEnabled: value.focusGifEnabled !== false
  };
  for (const [key, field] of [['focusGifUrl', 'focusGifUrl'], ['heroBackdropUrl', 'heroBackdropUrl'], ['titleLogoUrl', 'titleLogoUrl']]) {
    const url = urlField(value[field]); if (url) covers[key] = url;
  }
  return covers;
}
export const folderCover = folder => ({ image: urlField(folder?.coverImageUrl), emoji: emojiField(folder?.coverEmoji), hideTitle: folder?.hideTitle === true, shape: posterShapes.includes(folder?.tileShape) ? folder.tileShape : 'SQUARE' });
const readCollectionStyle = value => ({
  focusGlowEnabled: value.focusGlowEnabled !== false,
  viewMode: viewModes.includes(value.viewMode) ? value.viewMode : 'TABBED_GRID',
  showAllTab: value.showAllTab !== false
});
function readFolder(value) {
  if (!value || typeof value !== 'object') return null;
  const title = text(value.title) || 'Sem título';
  const sources = (Array.isArray(value.sources) ? value.sources : []).map(readCollectionSource).filter(Boolean).slice(0, collectionLimits.sources);
  return { id: text(value.id, 40) || newId(), title, ...readFolderCovers(value), sources };
}
function readCollection(value) {
  if (!value || typeof value !== 'object') return null;
  const title = text(value.title) || 'Coleção sem título';
  const folders = (Array.isArray(value.folders) ? value.folders : []).map(readFolder).filter(Boolean).slice(0, collectionLimits.folders);
  return { id: text(value.id, 40) || newId(), title, pinToTop: value.pinToTop === true, ...readCollectionStyle(value), folders };
}
export function readCollections(value) {
  return (Array.isArray(value) ? value : []).map(readCollection).filter(Boolean).slice(0, collectionLimits.collections);
}
export const createCollection = title => ({ id: newId(), title: text(title) || 'Coleção sem título', pinToTop: false, ...readCollectionStyle({}), folders: [] });
export const createFolder = title => ({ id: newId(), title: text(title) || 'Sem título', ...readFolderCovers({}), sources: [] });
const replace = (list, id, change) => list.map(item => item.id === id ? change(item) : item);
export const renameCollection = (list, id, title) => replace(list, id, item => ({ ...item, title: text(title) || item.title }));
export const removeCollection = (list, id) => list.filter(item => item.id !== id);
export const togglePin = (list, id) => replace(list, id, item => ({ ...item, pinToTop: !item.pinToTop }));
export const addFolder = (list, id, folder) => replace(list, id, item => item.folders.length >= collectionLimits.folders ? item : { ...item, folders: [...item.folders, folder] });
export const removeFolder = (list, id, folderId) => replace(list, id, item => ({ ...item, folders: item.folders.filter(folder => folder.id !== folderId) }));
export const renameFolder = (list, id, folderId, title) => replace(list, id, item => ({ ...item, folders: item.folders.map(folder => folder.id === folderId ? { ...folder, title: text(title) || folder.title } : folder) }));
export const addSource = (list, id, folderId, source) => replace(list, id, item => ({
  ...item,
  folders: item.folders.map(folder => folder.id !== folderId || folder.sources.length >= collectionLimits.sources || folder.sources.some(entry => sameSource(entry, source)) ? folder : { ...folder, sources: [...folder.sources, source] })
}));
export const removeSource = (list, id, folderId, index) => replace(list, id, item => ({
  ...item,
  folders: item.folders.map(folder => folder.id === folderId ? { ...folder, sources: folder.sources.filter((_, position) => position !== index) } : folder)
}));
// The fork offers move up/down in the editors; the port keeps the same ordering rule.
export function moveIn(list, id, move) {
  const index = list.findIndex(item => item.id === id);
  const target = index + move;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export const moveFolder = (list, id, folderId, move) => replace(list, id, item => ({ ...item, folders: moveIn(item.folders, folderId, move) }));
// One rail per folder: a pinned collection comes first, like the fork's pinToTop. A folder
// whose sources the TV cannot open still produces a rail, marked with the reason, so a
// collection created elsewhere never disappears from the Home without an explanation.
function folderRail(collection, folder, addonInstalled) {
  const usable = folder.sources.filter(source => source.kind === 'tmdb' || (source.kind === 'catalog' && addonInstalled(source)));
  const key = `collection-${collection.id}-${folder.id}`;
  const base = { key, collectionId: collection.id, folderId: folder.id, pinned: collection.pinToTop === true, title: folder.title };
  if (usable.length) return { ...base, sources: usable, cover: folderCover(folder) };
  const catalog = folder.sources.find(source => source.kind === 'catalog');
  return {
    ...base, sources: [], cover: folderCover(folder), unavailable: catalog ? 'addon' : 'unsupported',
    unavailableMessage: catalog
      ? `O add-on “${catalog.addonName || catalog.addonId}” desta coleção não está instalado nesta TV.`
      : folder.sources.length ? 'Esta pasta só tem fontes que a TV não abre (listas do Trakt, por exemplo).' : 'Esta pasta ainda não tem fontes.'
  };
}
export function collectionRails(collections, { addonInstalled = () => true } = {}) {
  const rows = [];
  for (const collection of [...collections].sort((a, b) => Number(b.pinToTop) - Number(a.pinToTop))) {
    for (const folder of collection.folders) rows.push(folderRail(collection, folder, addonInstalled));
  }
  return rows;
}
// CollectionRowSection.kt: the Home shows one row per collection and one **cover card** per
// folder — the cover the user picked, with the folder title underneath. The titles inside the
// folder stay behind the card, exactly like the folder screen on the fork.
export function collectionSections(collections, { addonInstalled = () => true } = {}) {
  return [...(collections || [])].sort((a, b) => Number(b.pinToTop) - Number(a.pinToTop)).map(collection => ({
    key: `collection-${collection.id}`, collectionId: collection.id, title: collection.title,
    pinned: collection.pinToTop === true, coverEmoji: emojiField(collection.coverEmoji),
    folders: collection.folders.map(folder => folderRail(collection, folder, addonInstalled))
  }));
}
export const collectionSourceCount = collection => collection.folders.reduce((total, folder) => total + folder.sources.length, 0);

export function describeSource(source) {
  if (!source) return '';
  if (source.kind === 'other') return source.provider === 'trakt' ? `Lista do Trakt${source.raw?.title ? ` · ${source.raw.title}` : ''} (não suportada nesta TV)` : `Fonte não suportada (${source.provider})`;
  if (source.kind === 'catalog') return [source.addonName || source.addonUrl || source.addonId, source.catalogName || source.catalogId, source.genre].filter(Boolean).join(' · ');
  const type = tmdbSourceTypes.find(entry => entry.id === source.sourceType)?.label || source.sourceType;
  return ['TMDB', type, source.title || (source.tmdbId ? String(source.tmdbId) : ''), source.sourceType === 'discover' ? tmdbMediaTypes.find(entry => entry.id === source.mediaType)?.label : '', source.year ? String(source.year) : ''].filter(Boolean).join(' · ');
}
export const sourceKindLabel = kind => kind === 'tmdb' ? 'TMDB' : kind === 'other' ? 'Outro cliente' : 'Catálogo de add-on';
// Sources the TV can actually open in a row.
export const isPlayableSource = source => source?.kind === 'catalog' || source?.kind === 'tmdb';
export const sameSource = (a, b) => Boolean(a && b) && a.kind === b.kind && a.catalogId === b.catalogId && a.tmdbId === b.tmdbId && a.sourceType === b.sourceType && describeSource(a) === describeSource(b);
// CollectionsDataStore SerializableCollection/SerializableSource: the blob the account
// stores per profile. Reading it brings the collections built in another client (for
// example the Android app) to this TV, and writing it keeps that client working.
const accountSource = value => {
  if (!value || typeof value !== 'object') return null;
  const provider = text(value.provider, 40).toLowerCase();
  if (provider === 'tmdb') {
    const sourceType = text(value.tmdbSourceType, 40).toLowerCase();
    if (!tmdbSourceTypes.some(entry => entry.id === sourceType)) return readForeignSource(value);
    const source = readTmdbSource({ kind: 'tmdb', sourceType, tmdbId: Number.isSafeInteger(value.tmdbId) ? value.tmdbId : null, mediaType: text(value.mediaType, 10).toLowerCase(), sortBy: value.sortBy, title: value.title });
    return source;
  }
  if (provider && provider !== 'addon') return readForeignSource(value);
  return readCatalogSource({ kind: 'catalog', addonId: value.addonId, type: value.type, catalogId: value.catalogId, genre: value.genre });
};
export function parseAccountCollections(json) {
  const rows = Array.isArray(json) ? json : [];
  return rows.map(row => {
    if (!row || typeof row !== 'object') return null;
    const folders = (Array.isArray(row.folders) ? row.folders : []).map(folder => {
      if (!folder || typeof folder !== 'object') return null;
      const listed = Array.isArray(folder.sources) ? folder.sources : Array.isArray(folder.catalogSources) ? folder.catalogSources.map(entry => ({ provider: 'addon', ...entry })) : [];
      const sources = listed.map(accountSource).filter(Boolean).slice(0, collectionLimits.sources);
      return { id: text(folder.id, 40) || newId(), title: text(folder.title) || 'Sem título', ...readFolderCovers(folder), sources };
    }).filter(Boolean).slice(0, collectionLimits.folders);
    return { id: text(row.id, 40) || newId(), title: text(row.title) || 'Coleção sem título', pinToTop: row.pinToTop === true, ...readCollectionStyle(row), folders };
  }).filter(Boolean).slice(0, collectionLimits.collections);
}
const toAccountSource = source => {
  if (source.kind === 'other') return source.raw;
  if (source.kind === 'tmdb') return {
    provider: 'tmdb', tmdbSourceType: source.sourceType.toUpperCase(), title: source.title || '', tmdbId: source.tmdbId,
    mediaType: source.mediaType.toUpperCase(), sortBy: source.sortBy
  };
  return { provider: 'addon', addonId: source.addonId || '', type: source.type, catalogId: source.catalogId, genre: source.genre || '' };
};
export function toAccountCollections(collections) {
  return (Array.isArray(collections) ? collections : []).map(collection => ({
    id: collection.id, title: collection.title, pinToTop: collection.pinToTop === true,
    ...readCollectionStyle(collection),
    folders: collection.folders.map(folder => ({
      id: folder.id, title: folder.title, ...readFolderCovers(folder),
      sources: folder.sources.map(toAccountSource), catalogSources: []
    }))
  }));
}

