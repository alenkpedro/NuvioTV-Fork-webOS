import test from 'node:test';import assert from 'node:assert/strict';
import {initial,recordProgress,readState,saveState,progressKey} from '../src/core/storage.js';
import {initializeProfiles,activateProfile,setLibraryItem,mergeLibrary} from '../src/core/profiles.js';
import {markWatched,watchedKey,mergeHistory} from '../src/core/history.js';
import {initializeOutbox,observeSnapshot,enqueueKnown,flushOutbox,resolveOutbound,mutationId} from '../src/core/outbox.js';
import {createAccountClient,SESSION_KEY} from '../src/core/account.js';
const key=progressKey('movie','tt1'), item={id:'tt1',type:'movie',name:'Filme',addedAt:10};
function state(){const s=initial();initializeProfiles(s);activateProfile(s,'owner',{id:2});initializeOutbox(s);for(const kind of ['library','progress','watched'])observeSnapshot(s,kind,{});return s;}
const progress=(time=25,updated=100)=>({id:'tt1',type:'movie',meta:item,time,duration:100,updated,origin:'local'});
function runner(s,remote={library:{},progress:{},watched:{}},mutate=async()=>{}){
 const controller=new AbortController(),calls=[];let current=true,persisted=true;
 const account={user:{id:'owner'},library:async()=>remote.library,history:async()=>({progress:remote.progress,watched:remote.watched}),mutate:async(...args)=>{calls.push(args);await mutate(...args);}};
 return {run:()=>flushOutbox({state:s,account,access:{id:2,userId:'owner'},signal:controller.signal,isCurrent:()=>current,persist:()=>persisted,clientId:'nuvio-webos-test00000000'}),calls,account,controller,leave:()=>current=false,noStorage:()=>persisted=false};
}
test('queued edits coalesce, persist across reload and remain isolated by account/profile',()=>{
 const s=state();setLibraryItem(s,key,item);setLibraryItem(s,key,null);assert.equal(Object.keys(s.outbox).length,1);assert.equal(s.outbox[mutationId('library',key)].value,null);
 const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};saveState(storage,s);const restored=readState(storage);initializeProfiles(restored);activateProfile(restored,'owner',{id:1});assert.equal(restored.outbox,undefined);activateProfile(restored,'owner',{id:2});assert.equal(Object.keys(restored.outbox).length,1);activateProfile(restored,'another',{id:2});assert.equal(restored.outbox,undefined);
});
test('pending entries acknowledge only after success; uncertain success is reconciled without another write',async()=>{
 const s=state();enqueueKnown(s,'progress',key,progress());const remote={library:{},progress:{},watched:{}};const r=runner(s,remote,async()=>{remote.progress[key]=progress();throw Error('network lost after commit');});
 await assert.rejects(r.run(),/network/);assert.equal(Object.keys(s.outbox).length,1);await r.run();assert.equal(r.calls.length,1);assert.equal(Object.keys(s.outbox).length,0);assert.equal(s.progress[key].origin,'nuvio');
});
test('snapshot failures or unavailable storage prevent all writes',async()=>{
 const s=state();setLibraryItem(s,key,item);const r=runner(s);r.account.history=async()=>{throw Error('partial snapshot');};await assert.rejects(r.run(),/partial/);assert.equal(r.calls.length,0);assert.equal(Object.keys(s.outbox).length,1);
 const second=runner(s);second.noStorage();await assert.rejects(second.run(),/salvar/);assert.equal(second.calls.length,0);
});
test('newer cloud progress conflicts and local choice rebases before upload',async()=>{
 const s=state();observeSnapshot(s,'progress',{[key]:progress(10,100)});enqueueKnown(s,'progress',key,progress(15,200));const r=runner(s,{library:{},progress:{[key]:progress(50,300)},watched:{}});
 await r.run();const id=mutationId('progress',key),op=s.outbox[id];assert.ok(op.conflict);assert.equal(r.calls.length,0);
 resolveOutbound(s,id,false,op.revision);await r.run();assert.equal(r.calls.length,1);assert.equal(r.calls[0][1].value.time,15);assert.equal(Object.keys(s.outbox).length,0);
});
test('offline removals conflict with changed cloud membership; remote choice removes local tombstone',async()=>{
 const s=state();observeSnapshot(s,'library',{[key]:item});setLibraryItem(s,key,null);const remote={...item,addedAt:20};const r=runner(s,{library:{[key]:remote},progress:{},watched:{}});await r.run();const id=mutationId('library',key);assert.ok(s.outbox[id].conflict);resolveOutbound(s,id,true,s.outbox[id].revision);assert.equal(s.library[key].addedAt,20);assert.equal(s.libraryOverrides[key],undefined);assert.equal(Object.keys(s.outbox).length,0);
});
test('late acknowledgement cannot clear a newer edit, and rebases it on our previous write',async()=>{
 const s=state();setLibraryItem(s,key,item);const remote={library:{},progress:{},watched:{}};
 const r=runner(s,remote,async()=>{remote.library[key]=item;setLibraryItem(s,key,null);});await r.run();assert.equal(Object.keys(s.outbox).length,1);assert.equal(s.outbox[mutationId('library',key)].value,null);assert.equal(s.outbox[mutationId('library',key)].base,JSON.stringify([true,10]));
 r.account.mutate=async()=>{delete remote.library[key];};await r.run();assert.equal(Object.keys(s.outbox).length,0);
});
test('profile change and cancellation fence acknowledgements and later operations',async()=>{
 const s=state();setLibraryItem(s,key,item);enqueueKnown(s,'progress',key,progress());let r;r=runner(s,undefined,async()=>r.leave());await assert.rejects(r.run(),/Cancelado/);assert.equal(r.calls.length,1);assert.equal(Object.keys(s.outbox).length,2);
 const stopped=runner(s);stopped.controller.abort();await assert.rejects(stopped.run(),/Cancelado/);assert.equal(stopped.calls.length,0);
});
test('legacy data queues once and needs review before overwriting unknown cloud state',async()=>{
 const s=state();delete s.outboxInitialized;s.progress[key]=progress();initializeOutbox(s);initializeOutbox(s);const r=runner(s);await r.run();const id=mutationId('progress',key);assert.ok(s.outbox[id].conflict);assert.equal(r.calls.length,0);assert.throws(()=>resolveOutbound(s,id,true,-1),/mudou/);
 resolveOutbound(s,id,true,s.outbox[id].revision);assert.equal(s.progress[key],undefined);
});
test('completion queues one watched episode and progress, without marking the whole series',()=>{
 const s=state(),meta={id:'show',type:'series',name:'Série'};recordProgress(s,{type:'series',id:'custom-episode',meta,episode:{season:1,episode:2},time:90,duration:100});assert.equal(Object.keys(s.outbox).length,2);const watchedId=mutationId('watched',watchedKey('series','show',1,2));const revision=s.outbox[watchedId].revision;
 recordProgress(s,{type:'series',id:'custom-episode',meta,episode:{season:1,episode:2},time:95,duration:100});assert.equal(s.outbox[watchedId].revision,revision);assert.equal(s.watched[progressKey('series','show')],undefined);
});
test('unwatch and favorite deletion send only the selected item; successful ack removes overrides',async()=>{
 const s=state(),w={type:'movie',id:'tt1',season:null,episode:null,updated:50,value:true};const wk=watchedKey('movie','tt1');mergeHistory(s,{progress:{},watched:{[wk]:w}},{profileId:2});mergeLibrary(s,{[key]:item},2);markWatched(s,item,false);setLibraryItem(s,key,null);
 const r=runner(s,{library:{[key]:item},progress:{},watched:{[wk]:w}});await r.run();assert.equal(r.calls.length,2);assert.equal(Object.keys(s.outbox).length,0);assert.equal(s.watchedOverrides[wk],undefined);assert.equal(s.libraryOverrides[key],undefined);
});
function client(fetcher){const values=new Map([[SESSION_KEY,JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Date.now()+3600000,user:{id:'owner',email:'fixture@example.test'}})]]);return createAccountClient({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetcher});}
test('write RPCs match fork item contracts, milliseconds, canonical episode key and client/profile scope',async()=>{
 const calls=[];const c=client(async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(null,{status:204});});const send=(kind,key,value)=>c.mutate(2,{kind,key,value},'nuvio-webos-test00000000',undefined,'owner');
 await send('library',key,item);await send('library',key,null);await send('watched',watchedKey('series','show',1,2),{name:'Série',value:true,updated:300});await send('watched',watchedKey('series','show',1,2),{value:false});await send('progress',progressKey('series','custom'),{...progress(),meta:{id:'show'},episode:{season:1,episode:2}});
 assert.ok(calls.every(c=>c.body.p_profile_id===2 && c.body.p_origin_client_id==='nuvio-webos-test00000000'));
 assert.deepEqual(calls[1].body.p_keys,[{content_id:'tt1',content_type:'movie'}]);assert.deepEqual(calls[3].body.p_keys,[{content_id:'show',season:1,episode:2}]);const entry=calls[4].body.p_entries[0];assert.equal(entry.position,25000);assert.equal(entry.duration,100000);assert.equal(entry.video_id,'custom');assert.equal(entry.progress_key,'show_s1e2');
 await assert.rejects(c.mutate(2,{kind:'library',key,value:item},'nuvio-webos-test00000000',undefined,'other'),/conta/);assert.equal(calls.length,5);
});

test('episode identity follows the fork key even when addons use different video IDs',async()=>{
 const s=state(),first={...progress(10,100),type:'series',id:'provider-a',meta:{id:'show',type:'series'},episode:{season:1,episode:2}},keyA=progressKey('series','provider-a'),keyB=progressKey('series','provider-b');
 observeSnapshot(s,'progress',{[keyA]:first});enqueueKnown(s,'progress',keyA,{...first,time:15,updated:200});enqueueKnown(s,'progress',keyB,{...first,id:'provider-b',time:20,updated:200});assert.equal(Object.keys(s.outbox).length,1);
 const r=runner(s,{library:{},progress:{[keyA]:{...first,time:50,updated:300}},watched:{}});await r.run();assert.equal(r.calls.length,0);assert.ok(s.outbox[mutationId('progress',keyB)].conflict);
});
