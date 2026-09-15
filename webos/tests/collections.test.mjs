import test from 'node:test';
import assert from 'node:assert/strict';
import {addFolder,addSource,collectionLimits,collectionRails,collectionSections,collectionSourceCount,createCollection,createFolder,describeSource,folderCover,moveFolder,moveIn,parseAccountCollections,readCatalogSource,readCollectionSource,readCollections,readTmdbSource,removeCollection,removeFolder,removeSource,renameCollection,renameFolder,sameSource,sourceKindLabel,tmdbSorts,tmdbSourceTypes,toAccountCollections,togglePin} from '../src/core/collections.js';
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
  // A folder without sources is visible with the reason instead of vanishing from the Home.
  assert.deepEqual(collectionRails(list).map(rail=>rail.unavailable),['unsupported']);
  assert.match(collectionRails(list)[0].unavailableMessage,/ainda não tem fontes/);
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
test('folder covers from another client survive the trip and travel back',()=>{
  const account=[{id:'c1',title:'Sagas',pinToTop:true,viewMode:'GRID',showAllTab:false,focusGlowEnabled:false,folders:[{id:'f1',title:'Star Wars',coverImageUrl:'https://x/c.jpg',coverEmoji:'🚀',tileShape:'LANDSCAPE',hideTitle:true,focusGifUrl:'https://x/a.gif',sources:[{provider:'addon',addonId:'a',type:'movie',catalogId:'c'}]}]}];
  const parsed=parseAccountCollections(account);
  assert.equal(parsed[0].viewMode,'GRID');assert.equal(parsed[0].showAllTab,false);assert.equal(parsed[0].focusGlowEnabled,false);
  assert.deepEqual(folderCover(parsed[0].folders[0]),{image:'https://x/c.jpg',emoji:'🚀',hideTitle:true,shape:'LANDSCAPE'});
  // Anything the TV cannot use is dropped instead of stored: no scheme tricks, no unknown shape.
  const rough=parseAccountCollections([{id:'c2',title:'X',folders:[{id:'f2',title:'Y',coverImageUrl:'javascript:alert(1)',coverEmoji:'x'.repeat(20),tileShape:'HACK'}]}]);
  assert.equal(rough[0].folders[0].coverImageUrl,'');assert.equal([...rough[0].folders[0].coverEmoji].length,8);assert.equal(rough[0].folders[0].tileShape,'SQUARE');
  // The blob sent back keeps the cover and the appearance settings of the other client.
  const back=toAccountCollections(parsed);
  assert.equal(back[0].folders[0].coverImageUrl,'https://x/c.jpg');assert.equal(back[0].folders[0].tileShape,'LANDSCAPE');
  assert.equal(back[0].viewMode,'GRID');assert.equal(back[0].showAllTab,false);assert.equal(back[0].folders[0].focusGifUrl,'https://x/a.gif');
  // Local storage keeps them too, so a TV restart never loses the folder art.
  assert.equal(readCollections(parsed)[0].folders[0].coverEmoji,'🚀');assert.equal(readCollections(parsed)[0].folders[0].hideTitle,true);
});
test('a collection row carries its folders with covers and keeps the reason for the ones it cannot open',()=>{
  const collection={...createCollection('Sagas'),pinToTop:true};
  let list=addFolder([collection],collection.id,createFolder('Clássicos'));
  const sections=collectionSections(list,{addonInstalled:()=>false});
  assert.equal(sections.length,1);assert.equal(sections[0].title,'Sagas');assert.equal(sections[0].pinned,true);assert.equal(sections[0].key,`collection-${collection.id}`);
  assert.equal(sections[0].folders[0].title,'Clássicos');
  assert.deepEqual(sections[0].folders[0].cover,{image:'',emoji:'',hideTitle:false,shape:'SQUARE'});
  // A folder without a usable source keeps the same reason the rail used to report.
  assert.equal(sections[0].folders[0].unavailable,'unsupported');
  assert.match(sections[0].folders[0].unavailableMessage,/ainda não tem fontes/);
  // A folder with a source the TV can open is playable and carries it.
  const ready=addSource(list,collection.id,list[0].folders[0].id,{kind:'catalog',addonId:'a',type:'movie',catalogId:'c'});
  assert.equal(collectionSections(ready)[0].folders[0].sources.length,1);
  assert.equal(collectionSections(ready,{addonInstalled:()=>false})[0].folders[0].unavailable,'addon');
});

