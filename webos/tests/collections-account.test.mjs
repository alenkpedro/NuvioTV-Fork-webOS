import test from 'node:test';
import assert from 'node:assert/strict';
import {addFolder,addSource,collectionRails,collectionSections,createCollection,createFolder,describeSource,isPlayableSource,parseAccountCollections,readCatalogSource,readCollections,sourceKindLabel,toAccountCollections,collectionSourceCount} from '../src/core/collections.js';
const accountBlob = [{
  id: 'acc1', title: 'Sagas do Xperience', pinToTop: true, backdropImageUrl: 'https://img/x.jpg', viewMode: 'TABBED_GRID', showAllTab: true,
  folders: [{
    id: 'f1', title: 'Star Wars', coverEmoji: '🚀', tileShape: 'POSTER', hideTitle: false,
    sources: [
      { provider: 'addon', addonId: 'local.test', type: 'movie', catalogId: 'test', genre: 'Ação' },
      { provider: 'tmdb', tmdbSourceType: 'COLLECTION', title: 'Star Wars', tmdbId: 10, mediaType: 'MOVIE', sortBy: 'popularity.desc' },
      { provider: 'trakt', traktListId: 991, title: 'Minha lista Trakt', mediaType: 'MOVIE', sortBy: 'rank', sortHow: 'asc' },
      { provider: 'addon' }
    ]
  }, { id: 'f2', title: 'Vazia', sources: [] }]
}];
test('collections built in another client arrive through the account blob',()=>{
  const parsed = parseAccountCollections(accountBlob);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Sagas do Xperience');
  assert.equal(parsed[0].pinToTop, true);
  assert.equal(parsed[0].folders.length, 2);
  const [addonSource, tmdbSource, traktSource] = parsed[0].folders[0].sources;
  assert.deepEqual(addonSource, { kind: 'catalog', addonId: 'local.test', addonUrl: '', type: 'movie', catalogId: 'test', genre: 'Ação' });
  assert.equal(tmdbSource.kind, 'tmdb');assert.equal(tmdbSource.sourceType, 'collection');assert.equal(tmdbSource.tmdbId, 10);assert.equal(tmdbSource.mediaType, 'movie');
  assert.equal(traktSource.kind, 'other');assert.equal(traktSource.provider, 'trakt');
  assert.equal(parsed[0].folders[0].sources.length, 3); // the addon source without catalog is dropped
  assert.equal(sourceKindLabel('other'), 'Outro cliente');
  assert.equal(describeSource(traktSource), 'Lista do Trakt · Minha lista Trakt (não suportada nesta TV)');
  assert.equal(isPlayableSource(traktSource), false);
  // Only the folder with a usable source becomes a real rail; the empty one still shows up
  // with the reason, so nothing disappears from the Home without an explanation.
  const rails = collectionRails(parsed, { addonInstalled: source => source.addonId === 'local.test' });
  // The rail is per folder and carries the folder's own title: the collection name is the row
  // header now, exactly like the fork's CollectionRowSection.
  assert.deepEqual(rails.map(rail => rail.title), ['Star Wars', 'Vazia']);
  assert.deepEqual(rails.map(rail => rail.collectionId), [parsed[0].id, parsed[0].id]);
  // The same folders reach the Home as cover cards of that one collection row.
  const sections = collectionSections(parsed, { addonInstalled: source => source.addonId === 'local.test' });
  assert.equal(sections.length, 1);assert.equal(sections[0].title, 'Sagas do Xperience');
  assert.deepEqual(sections[0].folders.map(folder => folder.title), ['Star Wars', 'Vazia']);
  assert.deepEqual(rails[0].sources.map(source => source.kind), ['catalog', 'tmdb']);
  assert.equal(rails[0].unavailable, undefined);
  assert.equal(rails[1].unavailable, 'unsupported');
  assert.match(rails[1].unavailableMessage, /ainda não tem fontes/);
  // An add-on that is not installed is reported as such instead of an empty row.
  const missing = collectionRails(parsed, { addonInstalled: () => false });
  assert.equal(missing[0].sources.length, 1);
  assert.equal(missing[0].unavailableMessage, undefined);
  const many = [{ id: 'c', title: 'C', folders: [{ id: 'f', title: 'F', sources: [{ kind: 'catalog', addonId: 'gone', type: 'movie', catalogId: 'x' }] }] }];
  assert.equal(collectionRails(many, { addonInstalled: () => false })[0].unavailable, 'addon');
  assert.match(collectionRails(many, { addonInstalled: () => false })[0].unavailableMessage, /não está instalado nesta TV/);
});
test('pushing keeps foreign sources and the fields the other client needs',()=>{
  const parsed = parseAccountCollections(accountBlob);
  const out = toAccountCollections(parsed);
  assert.equal(out[0].id, 'acc1');
  assert.equal(out[0].folders[0].sources.length, 3);
  assert.deepEqual(out[0].folders[0].sources[0], { provider: 'addon', addonId: 'local.test', type: 'movie', catalogId: 'test', genre: 'Ação' });
  assert.equal(out[0].folders[0].sources[1].provider, 'tmdb');
  assert.equal(out[0].folders[0].sources[1].tmdbSourceType, 'COLLECTION');
  // The Trakt list survives the round trip untouched, so pushing never deletes it.
  assert.deepEqual(out[0].folders[0].sources[2], accountBlob[0].folders[0].sources[2]);
  assert.equal(out[0].folders[1].sources.length, 0);
  // A collection created on the TV keeps the add-on id the blob expects.
  const collection = createCollection('Minha');
  const folder = createFolder('Uma');
  const seeded = addFolder([collection], collection.id, folder);
  const filled = addSource(seeded, collection.id, folder.id, { kind: 'catalog', addonId: 'x', addonUrl: 'https://a/m.json', addonName: 'Addon', type: 'movie', catalogId: 'c' });
  assert.equal(collectionSourceCount(filled[0]), 1);
  const payload = toAccountCollections(filled);
  assert.equal(payload[0].folders[0].sources[0].addonId, 'x');
  assert.equal(payload[0].folders[0].sources[0].provider, 'addon');
  assert.equal(payload[0].folders[0].sources[0].genre, '');
});
test('an empty or unusable blob never replaces the local collections',()=>{
  assert.deepEqual(parseAccountCollections(null), []);
  assert.deepEqual(parseAccountCollections([]), []);
  assert.deepEqual(parseAccountCollections([{ id: 'x', title: 'Sem fontes', folders: [] }]).map(collection => collection.folders.length), [0]);
  // A catalog source from the account is valid without a URL: the add-on id resolves it.
  assert.deepEqual(readCatalogSource({ kind: 'catalog', addonId: 'abc', type: 'series', catalogId: 'c' }), { kind: 'catalog', addonId: 'abc', addonUrl: '', type: 'series', catalogId: 'c' });
  assert.equal(readCatalogSource({ kind: 'catalog', type: 'movie', catalogId: 'c' }), null);
  assert.deepEqual(readCollections([{ title: 'Só local', folders: [] }]).length, 1);
});
