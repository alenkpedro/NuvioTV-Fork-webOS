import test from 'node:test';
import assert from 'node:assert/strict';
import {addFolder,addSource,collectionLimits,collectionRails,collectionSourceCount,createCollection,createFolder,describeSource,moveFolder,moveIn,readCatalogSource,readCollectionSource,readCollections,readTmdbSource,removeCollection,removeFolder,removeSource,renameCollection,renameFolder,sameSource,sourceKindLabel,tmdbSorts,tmdbSourceTypes,togglePin} from '../src/core/collections.js';
const catalog={kind:'catalog',addonUrl:'https://fixture.example/manifest.json',addonName:'Catálogo de teste',type:'movie',catalogId:'test',catalogName:'Coleção de teste'};
const tmdb={kind:'tmdb',sourceType:'collection',tmdbId:10,mediaType:'movie',sortBy:'popularity.desc'};
test('collections and folders are validated like the fork store',()=>{
  assert.deepEqual(readCollections(null),[]);assert.deepEqual(readCollections({}),[]);
  const list=readCollections([{id:'c1',title:'Sagas',pinToTop:true,folders:[{id:'f1',title:'Star Wars',sources:[catalog,tmdb,{kind:'trakt'},{kind:'catalog',addonUrl:'magnet:x'}]},'nope']}]);
  assert.equal(list.length,1);
  assert.equal(list[0].title,'Sagas');assert.equal(list[0].pinToTop,true);
  assert.equal(list[0].folders.length,1);assert.equal(list[0].folders[0].sources.length,2); // trakt and a bad link are dropped
  assert.equal(list[0].folders[0].sources[0].addonName,'Catálogo de teste');
  const generated=readCollections([{title:'  '}]);
  assert.equal(generated[0].title,'Coleção sem título');assert.ok(generated[0].id);
});
test('a source keeps only what this target can fetch',()=>{
  assert.equal(readCatalogSource({...catalog,genre:'Ação'}).genre,'Ação');
  assert.equal(readCatalogSource({addonUrl:'notaurl',type:'movie',catalogId:'x'}),null);
  assert.equal(readCatalogSource({addonUrl:'https://a/m.json',type:'movie',catalogId:''}),null);
  assert.equal(readTmdbSource({kind:'tmdb',sourceType:'trakt',tmdbId:1}),null); // família sem equivalente aqui
  assert.equal(readTmdbSource({kind:'tmdb',sourceType:'collection'}),null); // a coleção exige ID
  const discover=readTmdbSource({kind:'tmdb',sourceType:'discover',mediaType:'tv',sortBy:'nope',year:2024});
  assert.equal(discover.tmdbId,null);assert.equal(discover.mediaType,'tv');assert.equal(discover.sortBy,'popularity.desc');assert.equal(discover.year,2024);
  const network=readTmdbSource({kind:'tmdb',sourceType:'network',tmdbId:213,mediaType:'movie'});
  assert.equal(network.mediaType,'movie'); // rede é séries, mas a fonte reivindica o que o usuário escolheu
  assert.equal(readTmdbSource({kind:'tmdb',sourceType:'company',tmdbId:-4}),null);
  assert.equal(describeSource(catalog),'Catálogo de teste · Coleção de teste');
  assert.equal(describeSource({kind:'catalog',addonUrl:'https://a/m.json',type:'movie',catalogId:'x',genre:'Ação'}),'https://a/m.json · x · Ação');
  assert.equal(describeSource(tmdb),'TMDB · Coleção do TMDB · 10');
  assert.equal(describeSource({kind:'tmdb',sourceType:'discover',mediaType:'tv',sortBy:'popularity.desc',year:2024}),'TMDB · Descobrir (filtros) · Séries · 2024');
  assert.equal(sourceKindLabel('catalog'),'Catálogo de add-on');assert.equal(sourceKindLabel('tmdb'),'TMDB');
  assert.equal(sameSource(catalog,{...catalog}),true);assert.equal(sameSource(catalog,{...catalog,genre:'Ação'}),false);
  assert.equal(sameSource(tmdb,{...tmdb,tmdbId:11}),false);
});
test('editing keeps the fork limits, the ordering and the pin',()=>{
  let list=[createCollection('A'),createCollection('B')];
  const [a,b]=list;
  list=renameCollection(list,a.id,'Sagas');list=togglePin(list,a.id);
  assert.equal(list[0].title,'Sagas');assert.equal(list[0].pinToTop,true);
  assert.deepEqual(collectionRails(list).map(rail=>rail.title),[]); // no folder, no rail
  list=addFolder(list,a.id,createFolder('Star Wars'));
  const folderId=list[0].folders[0].id;
  assert.deepEqual(collectionRails(list).map(rail=>rail.title),[]); // a folder without sources stays out of the Home
  list=addSource(list,a.id,folderId,catalog);list=addSource(list,a.id,folderId,tmdb);
  assert.equal(collectionSourceCount(list[0]),2);
  assert.deepEqual(collectionRails(list).map(rail=>rail.title),['Star Wars']); // one rail per folder, sources merged
  list=addSource(list,a.id,folderId,{...catalog}); // duplicates are ignored
  assert.equal(collectionSourceCount(list[0]),2);
  list=moveIn(list,a.id,1);assert.equal(list[0].id,b.id);
  list=moveFolder(list,b.id,list[1].folders[0]?.id ?? folderId,-1); // no folders in B: nothing moves
  assert.equal(list[1].folders.length,1);
  list=removeSource(list,a.id,folderId,0);assert.equal(collectionSourceCount(list.find(entry=>entry.id===a.id)),1);
  list=removeFolder(list,a.id,folderId);assert.equal(list.find(c=>c.id===a.id).folders.length,0);
  list=removeCollection(list,a.id);assert.equal(list.length,1);
});
