import test from 'node:test';import assert from 'node:assert/strict';
import {parseHistory,historySource,mergeHistory,resolveHistoryConflict,markWatched,watchedKey,continueHistory,isWatched,progressWithWatched} from '../src/core/history.js';
import {initial,progressKey,recordProgress} from '../src/core/storage.js';
import {initializeProfiles,activateProfile} from '../src/core/profiles.js';
import {createAccountClient,SESSION_KEY} from '../src/core/account.js';
const row=(patch={})=>({content_id:'tt1',content_type:'movie',video_id:'tt1',position:25000,duration:100000,last_watched:200,profile_id:2,...patch});
const watched=(patch={})=>({content_id:'tt1',content_type:'movie',watched_at:300,profile_id:2,title:'Filme',...patch});
const k=progressKey('movie','tt1');
test('fork progress converts ms to seconds, uses 90 percent completion and canonicalizes episode mirrors',()=>{
 const p=parseHistory([row(),row({content_id:'tt2',video_id:'tt2',position:90000}),row({content_id:'ttshow',content_type:'series',video_id:'ttshow',season:1,episode:2}),row({content_id:'ttshow',content_type:'series',video_id:'custom-episode',season:1,episode:2,last_watched:201})],[],2).progress;
 assert.equal(p[k].time,25);assert.equal(p[progressKey('movie','tt2')].complete,true);assert.equal(Object.keys(p).length,3);assert.equal(p[progressKey('series','custom-episode')].meta.id,'ttshow');
 assert.throws(()=>parseHistory([row({profile_id:1})],[],2),/perfil/);assert.throws(()=>parseHistory([row({position:-1})],[],2),/inválidos/);assert.throws(()=>parseHistory([], [watched({season:1,episode:null})],2),/Episódio/);
});
test('unsent local playback survives newer cloud conflict, choices affect only local state and stale choices are rejected',()=>{
 const s=initial();s.progress[k]={type:'movie',id:'tt1',meta:{id:'tt1',type:'movie',name:'Local'},time:10,duration:100,updated:100};
 const remote=parseHistory([row()],[],2);mergeHistory(s,remote,{profileId:2});assert.equal(s.progress[k].time,10);
 const id=Object.keys(s.historyConflicts)[0];resolveHistoryConflict(s,id,false);mergeHistory(s,remote,{profileId:2});assert.equal(Object.keys(s.historyConflicts).length,0);
 mergeHistory(s,parseHistory([row({last_watched:201})],[],2),{profileId:2});const id2=Object.keys(s.historyConflicts)[0];s.progress[k]={...s.progress[k],updated:202};assert.throws(()=>resolveHistoryConflict(s,id2,true),/mudou/);
 s.progress[k].updated=100;resolveHistoryConflict(s,id2,true);assert.equal(s.progress[k].time,25);assert.equal(s.progress[k].origin,'nuvio');
 mergeHistory(s,parseHistory([],[],2),{profileId:2});assert.equal(s.progress[k],undefined);
});
test('newer or equal local progress wins without creating unnecessary conflicts and legacy records survive empty snapshots',()=>{
 const s=initial();s.progress[k]={type:'movie',id:'tt1',meta:{id:'tt1'},time:10,duration:100,updated:300};mergeHistory(s,parseHistory([row()],[],2),{profileId:2});assert.equal(s.progress[k].time,10);assert.equal(Object.keys(s.historyConflicts).length,0);mergeHistory(s,parseHistory([],[],2),{profileId:2});assert.equal(s.progress[k].time,10);
});
test('watched episodes do not mark the whole series, local unwatch survives pulls and rewatch remains resumable',()=>{
 const s=initial();mergeHistory(s,parseHistory([], [watched({content_id:'ttshow',content_type:'series',season:1,episode:2})],2),{profileId:2});assert.equal(s.watched[progressKey('series','ttshow')],undefined);
 const p={type:'series',meta:{id:'ttshow'},episode:{season:1,episode:2},updated:200};assert.equal(isWatched(s,p),true);assert.equal(isWatched(s,{...p,updated:400}),false);
 const videos={id:'ttshow',type:'series',videos:[{id:'custom',season:1,episode:2}]};assert.equal(progressWithWatched(s,videos)[progressKey('series','custom')].complete,true);
 s.progress[progressKey('series','custom')]={time:20,duration:100,updated:400,complete:false};assert.equal(progressWithWatched(s,videos)[progressKey('series','custom')].complete,false);
 markWatched(s,{type:'series',id:'ttshow',season:1,episode:2},false);mergeHistory(s,parseHistory([], [watched({content_id:'ttshow',content_type:'series',season:1,episode:2})],2),{profileId:2});assert.equal(isWatched(s,p),false);
});
test('history fields follow profile scope and local player records preserve read-only origin semantics',()=>{
 const s=initial();initializeProfiles(s);activateProfile(s,'owner',{id:2,name:'Dois'});mergeHistory(s,parseHistory([row()],[watched()],2),{profileId:2});activateProfile(s,'owner',{id:1,name:'Um'});assert.equal(s.historySync,undefined);assert.deepEqual(s.progress,{});activateProfile(s,'owner',{id:2,name:'Dois'});assert.equal(s.historySync.profileId,2);
 recordProgress(s,{type:'movie',id:'tt1',meta:{id:'tt1',type:'movie',name:'Filme'},time:90,duration:100});assert.equal(s.progress[k].origin,'local');assert.equal(s.progress[k].complete,true);
});
test('tracking preference uses the tv settings blob without credentials or fabricated provider auth',()=>{
 assert.equal(historySource([],2),'TRAKT');for(const value of ['TRAKT','SIMKL','MDBLIST','NUVIO_SYNC'])assert.equal(historySource([{profile_id:2,settings_json:{features:{trakt_settings:{watch_progress_source:{type:'string',value}}}}}],2),value);
 assert.throws(()=>historySource([{profile_id:1}],2),/inválidas/);
});
function client(fetcher){const values=new Map([[SESSION_KEY,JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Date.now()+3600000,user:{id:'owner',email:'fixture@example.test'}})]]);return createAccountClient({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetcher});}
test('history RPC paging is read-only and rejects partial or excessive snapshots',async()=>{
 const calls=[];const c=client(async(url,opts)=>{const b=JSON.parse(opts.body);calls.push({url,b});assert.equal(b.p_profile_id,2);if(url.endsWith('sync_pull_profile_settings_blob'))return new Response('[]');if(url.endsWith('sync_pull_watch_progress'))return new Response(JSON.stringify([row()]));return new Response(JSON.stringify(b.p_page===1?Array.from({length:100},(_,i)=>watched({content_id:`tt${i}`})):[]));});
 const r=await c.history(2);assert.equal(Object.keys(r.watched).length,100);assert.equal(calls[0].b.p_platform,'tv');assert.equal(calls.at(-1).b.p_page,2);assert.ok(calls.every(c=>c.url.includes('/rpc/sync_pull_')));
 const bad=client(async url=>url.endsWith('settings_blob')?new Response('[]'):url.endsWith('watch_progress')?new Response(JSON.stringify([row()])):new Response('{}',{status:503}));await assert.rejects(bad.history(2),/indisponível/);
});

test('legacy watched migration preserves other titles when marking a first item before cloud import',()=>{
 const s=initial();s.watched[progressKey('movie','legacy')]=true;
 markWatched(s,{type:'movie',id:'new'},true);
 assert.equal(s.watched[progressKey('movie','legacy')],true);
 assert.equal(s.watched[progressKey('movie','new')],true);
});
test('continue watching deduplicates series and hides old episodes after the latest is completed',()=>{
 const s=initial();const p=(id,updated,complete=false)=>({type:'series',id,meta:{id:'show'},episode:{season:1,episode:updated},time:30,duration:100,updated,complete});
 s.progress={a:p('a',1),b:p('b',2)};assert.deepEqual(continueHistory(s).map(p=>p.id),['b']);
 s.progress.b.complete=true;assert.deepEqual(continueHistory(s),[]);
 s.progress.b.complete=false;s.progress.b.time=1;assert.deepEqual(continueHistory(s),[]);
});
test('excessive progress or watched snapshots fail instead of importing a truncated account',async()=>{
 const progress=client(async url=>new Response(JSON.stringify(url.endsWith('settings_blob')?[]:Array.from({length:1001},()=>row()))));
 await assert.rejects(progress.history(2),/1.000/);
 const watchedClient=client(async(url,opts)=>{const page=JSON.parse(opts.body).p_page;return new Response(JSON.stringify(url.endsWith('settings_blob')||url.endsWith('watch_progress')?[]:Array.from({length:100},(_,i)=>watched({content_id:`tt${page}-${i}`}))));});
 await assert.rejects(watchedClient.history(2),/2.000/);
});
