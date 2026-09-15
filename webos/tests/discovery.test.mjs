import test from 'node:test';import assert from 'node:assert/strict';
import {extraOptions,resourceURL} from '../src/core/addons.js';
import {catalogEntries,catalogKey,discoverEntries,searchEntries,skipStep,selectDiscover,catalogExtras,parseCatalogPage,rememberSearch,homeCatalogEntries,genreLabel} from '../src/core/discovery.js';
import {initial} from '../src/core/storage.js';import {initializeProfiles,activateProfile} from '../src/core/profiles.js';
const addon=(url='https://fixture.test/one/manifest.json')=>({url,manifest:{id:'same',name:'Addon',resources:['catalog'],catalogs:[{id:'popular',type:'movie',name:'Popular',extra:[{name:'genre',options:['Drama','Crime & Mystery']}],extraSupported:['search','skip']},{id:'lookup',type:'series',extraSupported:['search'],extraRequired:['search']}]}});
test('long and short extras merge, including required-only and case-insensitive declarations',()=>{
 const extras=extraOptions({extra:[{name:'GENRE',options:['Drama']}],extraSupported:['search'],extraRequired:['genre','skip']});assert.equal(extras.length,3);assert.equal(extras[0].isRequired,true);assert.ok(extras.some(e=>e.name==='skip'&&e.isRequired));assert.doesNotThrow(()=>extraOptions({extraSupported:['search'],extraRequired:'invalid'}));
});
test('pagination uses declared page size, minimum positive option gap or fork default',()=>{
 assert.equal(skipStep({pageSize:50}),50);assert.equal(skipStep({extra:[{name:'skip',options:['100','0','50','50','bad','-1']}]}),50);assert.equal(skipStep({}),100);assert.equal(skipStep({pageSize:-1}),100);
});
test('discovery excludes search-required catalogs, while identities separate equal addon IDs and types',()=>{
 const first=addon(),second=addon('https://fixture.test/two/manifest.json');assert.equal(discoverEntries([first,second]).length,2);assert.equal(searchEntries([first,second]).length,4);assert.equal(new Set(catalogEntries([first,second]).map(e=>e.key)).size,4);assert.equal(catalogEntries([first,first]).length,2);
});
test('required filters never issue an unfiltered request and encoded values keep addon configuration',()=>{
 const a=addon('https://fixture.test/conf/manifest.json?token=fixture');a.manifest.catalogs[0].extra[0].isRequired=true;const e=discoverEntries([a])[0];assert.equal(selectDiscover([e]).genre,'Drama');assert.throws(()=>catalogExtras(e),/filtro/);
 const url=resourceURL(a,'catalog','movie','popular',catalogExtras(e,{genre:'Crime & Mystery',skip:50}));assert.ok(url.includes('Crime%20%26%20Mystery'));assert.equal(new URL(url).searchParams.get('token'),'fixture');assert.ok(url.includes('skip=50'));
});
test('page parsing deduplicates by type/id, caps metadata and rejects malformed or excessive snapshots',()=>{
 const data=parseCatalogPage({metas:[{id:'same',type:'movie',name:'One',secret:'ignore'},{id:'same',type:'series',name:'Two'},{id:'same',type:'movie'},null,{id:''}]},'movie');assert.equal(data.items.length,2);assert.equal(data.items[0].secret,undefined);assert.throws(()=>parseCatalogPage({},'movie'),/inválido/);assert.throws(()=>parseCatalogPage({metas:Array(501).fill({id:'x'})},'movie'),/500/);
});
test('recent search history collapses typed prefixes and is limited to eight per profile',()=>{
 const s=initial();initializeProfiles(s);activateProfile(s,'owner',{id:1});rememberSearch(s,'fri');rememberSearch(s,'Frieren');assert.deepEqual(s.recentSearches,['Frieren']);for(let i=0;i<10;i++)rememberSearch(s,`Title ${i}`);assert.equal(s.recentSearches.length,8);activateProfile(s,'owner',{id:2});assert.equal(s.recentSearches,undefined);activateProfile(s,'owner',{id:1});assert.equal(s.recentSearches[0],'Title 9');
});
test('catalog order and visibility affect only home and stay scoped to the selected profile',()=>{
 const s=initial();s.addons=[addon(),addon('https://fixture.test/two/manifest.json')];initializeProfiles(s);activateProfile(s,'owner',{id:1});const keys=discoverEntries(s.addons).map(e=>e.key);s.catalogOrder=[keys[1],keys[0]];s.hiddenHomeCatalogs=[keys[0]];assert.deepEqual(homeCatalogEntries(s).map(e=>e.key),[keys[1]]);assert.equal(discoverEntries(s.addons).length,2);activateProfile(s,'owner',{id:2});assert.equal(s.catalogOrder,undefined);activateProfile(s,'owner',{id:1});assert.deepEqual(s.hiddenHomeCatalogs,[keys[0]]);
});

test('Portuguese genre labels preserve the original transport value and unknown addon genres',()=>{assert.equal(genreLabel('science-fiction'),'Ficção científica');assert.equal(genreLabel('Crime & Mystery'),'Crime & Mystery');assert.equal(genreLabel('Action'),'Ação');});
