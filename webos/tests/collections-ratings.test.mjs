import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionItems,createMetadataClient} from '../src/core/metadata.js';
import {createRatingsClient,ratingIdentity,ratingText,validRating,readRatingsSettings,saveRatingsSettings} from '../src/core/ratings.js';
import {getJSON} from '../src/core/addons.js';
const config=()=>({key:'fixture-key-123',enabled:true,providers:['imdb','tmdb','tomatoes','letterboxd']});
test('collections use release order, deduplicate films and bound payloads',()=>{
 const result=collectionItems({parts:[{id:2,title:'Later',release_date:'2024-01-01'},{id:1,title:'First',release_date:'2000-01-01'},{id:1,title:'Duplicate'},{id:3,title:'Unknown'},{id:4,title:'Adult',adult:true},null]});assert.deepEqual(result.map(m=>m.id),['tmdb:1','tmdb:2','tmdb:3']);assert.throws(()=>collectionItems({parts:'bad'}));assert.throws(()=>collectionItems({parts:Array(501).fill({id:1,title:'X'})}));
});
test('detail exposes collection membership only for movies and keeps TMDB ratings distinct from IMDb',async()=>{
 const client=createMetadataClient({settings:()=>({key:'a'.repeat(32),language:'pt-BR'}),request:async()=>({id:1,title:'Title',vote_average:8.4,vote_count:5,belongs_to_collection:{id:9,name:'Saga'}})});
 const movie=await client.detail({id:'tmdb:1',type:'movie'});assert.equal(movie.rating,8.4);assert.equal(movie.meta.imdbRating,undefined);assert.deepEqual(movie.collection,{id:9,name:'Saga'});assert.equal((await client.detail({id:'tmdb:1',type:'series'})).collection,null);
});
test('collection cache avoids repeat reads, refresh bypasses it and mismatched identity is rejected',async()=>{
 let count=0,bad=false;const client=createMetadataClient({settings:()=>({key:'a'.repeat(32),language:'pt-BR'}),request:async()=>{count++;return {id:bad?8:9,name:'Saga',parts:[{id:1,title:'Film'}]};}});
 await client.collection({id:9});await client.collection({id:9});assert.equal(count,1);await client.collection({id:9},undefined,{refresh:true});assert.equal(count,2);bad=true;await assert.rejects(client.collection({id:9},undefined,{refresh:true}),/diferente/);
});
test('rating identities never guess titles and preserve movie/show and ID-provider distinctions',()=>{
 assert.deepEqual(ratingIdentity({type:'series',id:'tt123'}),{type:'show',provider:'imdb',id:'tt123'});assert.deepEqual(ratingIdentity({type:'movie',id:'tmdb:123'}),{type:'movie',provider:'tmdb',id:'123'});assert.equal(ratingIdentity({type:'movie',id:'random',name:'A Movie'}),null);assert.equal(ratingIdentity({type:'other',id:'tt123'}),null);
 assert.equal(validRating(null),null);assert.equal(validRating(-1),null);assert.equal(validRating(0),0);assert.equal(ratingText('imdb',8.4),'8,4');assert.equal(ratingText('tmdb',8.4,'TMDB'),'84');assert.equal(ratingText('tmdb',8.4),'8,4');
});
test('ratings read-only POST contracts, bounded concurrency, partial errors, cache and explicit retry',async()=>{
 const calls=[];let active=0,maximum=0;const client=createRatingsClient({settings:config,request:async(raw,options)=>{const url=new URL(raw);calls.push({url,options});active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;if(url.pathname.endsWith('/tomatoes'))throw Error('key should not leak');return {ratings:[{rating:8}]};}});
 const result=await client.ratings({id:'tt123',type:'movie'});assert.equal(Object.keys(result.values).length,3);assert.deepEqual(result.failed,['tomatoes']);assert.ok(maximum<=3);assert.ok(calls.every(x=>x.options.method==='POST' && x.url.hostname==='api.mdblist.com' && x.url.pathname.startsWith('/rating/movie/')));assert.deepEqual(calls[0].options.body,{ids:['tt123'],provider:'imdb'});
 await client.ratings({id:'tt123',type:'movie'});assert.equal(calls.length,5);await client.ratings({id:'tt123',type:'movie'},undefined,{refresh:true});assert.equal(calls.length,9);
});
test('disabled or unknown identity never calls MDBList, invalid responses cannot become ratings',async()=>{
 let calls=0;const client=createRatingsClient({settings:()=>({...config(),enabled:false}),request:async()=>{calls++;}});assert.equal((await client.ratings({id:'tt1',type:'movie'})).disabled,true);assert.equal(calls,0);
 const enabled=createRatingsClient({settings:config,request:async()=>{calls++;return {ratings:[{provider_id:'tt999',rating:9}]};}});assert.equal((await enabled.ratings({id:'custom',type:'movie'})).unresolved,true);assert.equal(calls,0);assert.equal((await enabled.ratings({id:'tt1',type:'movie'})).failed.length,4);
});
test('rating settings are separate from account state and restrict selected endpoints',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};saveRatingsSettings(storage,{...config(),providers:['imdb','../../scrobble/start']});assert.deepEqual(readRatingsSettings(storage).providers,['imdb']);assert.equal(map.has('nuvio-fork.webos.v1'),false);assert.throws(()=>saveRatingsSettings(storage,{...config(),key:'x?bad'}));
});
test('clearing credentials cancels in-flight ratings and does not schedule additional lookups',async()=>{
 let resolve,calls=0;const gate=new Promise(r=>resolve=r);let settings=config();const client=createRatingsClient({settings:()=>settings,request:async()=>{calls++;await gate;return {ratings:[{rating:9}]};}});const pending=client.ratings({id:'tt1',type:'movie'});settings={...settings,enabled:false,key:''};client.clear();resolve();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,3);
});
test('addon transport supports JSON POST lookups while omitting credentials and retaining GET defaults',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(options);return new Response('{"ratings":[]}',{status:200});};try{await getJSON('https://fixture.test',{method:'POST',body:{ids:['tt1'],provider:'imdb'}});await getJSON('https://fixture.test');assert.equal(calls[0].method,'POST');assert.equal(calls[0].headers['Content-Type'],'application/json');assert.equal(calls[0].credentials,'omit');assert.deepEqual(JSON.parse(calls[0].body),{ids:['tt1'],provider:'imdb'});assert.equal(calls[1].method,'GET');assert.equal(calls[1].body,undefined);}finally{globalThis.fetch=original;}
});
