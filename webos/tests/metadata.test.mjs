import {test} from 'node:test';
import assert from 'node:assert/strict';
import {people,trailers,youtubeId,preview,creditItems,createMetadataClient,readMetadataSettings,saveMetadataSettings} from '../src/core/metadata.js';
import {launchTrailer} from '../src/metadata-screen.js';
const key='a'.repeat(32),config=()=>({key,language:'pt-BR'});
test('addon app_extras maps crew, photos and person IDs without dropping plain cast',()=>{
 const members=people({app_extras:{directors:[{name:'Director',photo:'https://photo.test/a',tmdbId:2}],cast:[{name:'Actor',character:'Hero',tmdbId:3}]},writers:['Writer'],cast:['Actor','Extra',null]});
 assert.deepEqual(members.map(x=>[x.name,x.character]),[['Director','Director'],['Writer','Writer'],['Actor','Hero'],['Extra','']]);assert.equal(members[0].tmdbId,2);assert.equal(people({cast:Array.from({length:80},(_,i)=>String(i))}).length,40);
});
test('trailers accept fork formats, deduplicate YouTube IDs and reject arbitrary URLs',()=>{
 const id='abcdefghijk';assert.equal(youtubeId('https://youtu.be/'+id),id);assert.equal(youtubeId('https://www.youtube.com/watch?v='+id),id);assert.equal(youtubeId('javascript:'+id),null);assert.equal(youtubeId('https://youtube.com.evil.test/?v='+id),null);
 assert.deepEqual(trailers({trailers:[{source:id,name:'Trailer'},null,{source:'<script>'}],trailerStreams:[{ytId:id},{ytId:'12345678901'}]}).map(x=>x.ytId),[id,'12345678901']);
});
test('filmography chooses crew per medium, excludes adult entries and keeps movie/series IDs distinct',()=>{
 const items=creditItems({cast:[{id:1,title:'Actor credit',media_type:'movie',release_date:'2019-01-01'},{id:1,name:'Series',media_type:'tv',first_air_date:'2024-01-01'}],crew:[{id:2,title:'Director credit',media_type:'movie',release_date:'2023-01-01'},{id:3,title:'Excluded',media_type:'movie',adult:true}]},true);
 assert.deepEqual(items.map(x=>x.name),['Series','Director credit']);assert.equal(preview({id:0,title:'Bad'},'movie'),null);assert.equal(preview({id:1,title:'OK',poster_path:'https://evil.test'},'movie').poster,null);
});
test('settings stay in their own local key and validate credentials',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};assert.equal(readMetadataSettings(storage).key,'');assert.throws(()=>saveMetadataSettings(storage,{key:'bad'}));saveMetadataSettings(storage,config());assert.deepEqual(readMetadataSettings(storage),config());assert.equal(values.size,1);assert.equal(values.has('nuvio-fork.webos.v1'),false);
});
test('TMDB resolves exact IMDb identity, maps cast and trailers, limits recommendations and caches requests',async()=>{
 const calls=[],client=createMetadataClient({settings:config,request:async raw=>{const u=new URL(raw);calls.push(u);if(u.pathname.includes('/find/'))return {movie_results:[{id:10}]};return {id:10,title:'Title',imdb_id:'tt123',credits:{cast:[{id:5,name:'Actor',character:'Hero',profile_path:'/actor.jpg'}]},videos:{results:[{site:'YouTube',key:'abcdefghijk',name:'Trailer'}]},recommendations:{results:Array.from({length:30},(_,i)=>({id:i+11,title:'Movie '+i}))}};}});
 const result=await client.detail({id:'tt123',type:'movie'});assert.equal(result.meta.id,'tt123');assert.equal(result.meta.castMembers[0].tmdbId,5);assert.equal(result.meta.trailers.length,1);assert.equal(result.recommendations.length,20);await client.detail({id:'tt123',type:'movie'});assert.equal(calls.length,2);assert.equal(calls[0].searchParams.get('external_source'),'imdb_id');assert.ok(calls.every(u=>u.hostname==='api.themoviedb.org'));
});
test('TMDB does not guess identity by title and never substitutes a different returned ID',async()=>{
 let calls=0;const client=createMetadataClient({settings:config,request:async()=>{calls++;return {id:99,title:'Wrong'};}});assert.equal(await client.detail({id:'custom-id',type:'movie',name:'Some title'}),null);assert.equal(calls,0);await assert.rejects(client.detail({id:'tmdb:1',type:'movie'}),/diferente/);
});
test('person biography falls back to English and crew filmography is sorted by release year',async()=>{
 const calls=[],client=createMetadataClient({settings:config,request:async raw=>{const u=new URL(raw);calls.push(u);return {id:5,name:'Person',biography:u.searchParams.get('language')==='en-US'?'Biography':'',combined_credits:{crew:[{id:1,title:'Film',media_type:'movie',release_date:'2020-01-01'}]}};}});const result=await client.person({tmdbId:5,name:'Person',character:'Director'});assert.equal(result.biography,'Biography');assert.equal(result.items[0].id,'tmdb:1');assert.equal(calls.length,2);
});
test('TMDB errors omit credentials and cancellation propagates',async()=>{
 const client=createMetadataClient({settings:config,request:async()=>{throw Error('secret '+key);}});await assert.rejects(client.detail({id:'tmdb:1',type:'movie'}),error=>!error.message.includes(key));
 const controller=new AbortController();controller.abort();const cancelled=createMetadataClient({settings:config,request:async()=>({id:1})});await assert.rejects(cancelled.detail({id:'tmdb:1',type:'movie'},controller.signal),{name:'AbortError'});
});
test('native trailer launch uses fixed app/service and validated video identity',async()=>{
 let call,cancelled=false;class Bridge{call(uri,params){call={uri,...JSON.parse(params)};queueMicrotask(()=>this.onservicecallback('{"returnValue":true}'));}cancel(){cancelled=true;}}
 await launchTrailer('abcdefghijk',{Bridge});assert.equal(call.uri,'luna://com.webos.applicationManager/launch');assert.equal(call.id,'youtube.leanback.v4');assert.equal(call.params.contentId,'abcdefghijk');assert.equal(cancelled,true);await assert.rejects(launchTrailer('bad',{Bridge}));
});
test('native trailer errors, timeout and cancellation settle without affecting playback history',async()=>{
 class Fail{call(){queueMicrotask(()=>this.onservicecallback('{"returnValue":false}'));}cancel(){}}
 await assert.rejects(launchTrailer('abcdefghijk',{Bridge:Fail}),/Não foi possível/);
 class Silent{call(){}cancel(){}}await assert.rejects(launchTrailer('abcdefghijk',{Bridge:Silent,timeout:5}),/não confirmou/);
 const controller=new AbortController();const pending=launchTrailer('abcdefghijk',{Bridge:Silent,signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
