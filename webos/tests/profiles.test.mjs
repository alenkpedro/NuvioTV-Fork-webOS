import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeProfiles, activateProfile, leaveAccountProfiles, parseProfiles, parseLibrary, mergeLibrary, setLibraryItem, profileKey } from '../src/core/profiles.js';
import { initial, saveState, readState } from '../src/core/storage.js';
import { createAccountClient, SESSION_KEY } from '../src/core/account.js';
const key = JSON.stringify(['movie','tt1']);
const profile = id => ({id,name:`Perfil ${id}`});
const memory = () => {const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('legacy account data migrates to primary profile, guest addons survive, profiles never share history', () => {
  const state=initial();state.accountSync={userId:'owner',profileId:1};state.library[key]={id:'tt1',type:'movie',name:'Antigo'};state.progress.old={time:12};state.addons=[{url:'manual',manifest:{id:'manual',resources:[]}}, {url:'account',manifest:{id:'account',resources:[]},accountOwner:'owner'}];
  initializeProfiles(state);assert.equal(state.profileStore.activeKey,profileKey('owner',1));
  activateProfile(state,'owner',profile(2));assert.deepEqual(state.library,{});assert.deepEqual(state.progress,{});assert.deepEqual(state.addons,[]);
  state.progress.second={time:99};activateProfile(state,'owner',profile(1));assert.equal(state.library[key].name,'Antigo');assert.equal(state.progress.old.time,12);assert.equal(state.progress.second,undefined);
  const storage=memory();assert.equal(saveState(storage,state),true);
  const restored=readState(storage);activateProfile(restored,'owner',profile(2));assert.equal(restored.progress.second.time,99);
  leaveAccountProfiles(restored,'owner');assert.equal(restored.profileStore.buckets[profileKey('owner',1)].addons.some(a=>a.accountOwner==='owner'),false);assert.deepEqual(restored.library,{});assert.equal(restored.addons[0].url,'manual');
  activateProfile(restored,'another',profile(1));assert.deepEqual(restored.library,{});assert.equal(restored.addons[0].url,'manual');
  activateProfile(restored,'owner',profile(1));assert.equal(restored.library[key].name,'Antigo');
});
test('profile parsing requires explicit lock states, preserves addon inheritance and rejects duplicate indexes', () => {
  const rows=[{profile_index:2,name:'Filhos',uses_primary_addons:true,avatar_color_hex:'url(evil)'}];
  assert.throws(()=>parseProfiles(rows,[]),/bloqueio/);
  const [p]=parseProfiles(rows,[{profile_index:2,pin_enabled:true}]);assert.equal(p.locked,true);assert.equal(p.usesPrimaryAddons,true);assert.equal(p.color,'#1E88E5');
  assert.throws(()=>parseProfiles([...rows,...rows],[{profile_index:2,pin_enabled:false}]),/inválidos/);
});
test('cloud library snapshot merges local edits and removals without resurrecting deleted remote favorites', () => {
  const state=initial();state.library.local={id:'local',type:'movie',name:'Local'};
  const cloud=parseLibrary([{content_id:'tt1',content_type:'movie',name:'Nuvem',profile_id:2}],2);
  mergeLibrary(state,cloud,2);assert.equal(state.library[key].name,'Nuvem');assert.equal(state.library.local.name,'Local');
  setLibraryItem(state,key,null);mergeLibrary(state,cloud,2);assert.equal(state.library[key],undefined);
  mergeLibrary(state,{},2);assert.equal(state.library.local.name,'Local');
  assert.throws(()=>parseLibrary([{content_id:'bad',content_type:'movie',profile_id:1}],2),/perfil/);
});
function clientWith(fetcher) {
  const storage=memory();storage.setItem(SESSION_KEY,JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Date.now()+3600000,user:{id:'owner',email:'fixture@example.test'}}));
  return createAccountClient({storage,fetcher});
}
test('library uses verified paginated read RPC; malformed and failed pages do not produce partial snapshots', async () => {
  const calls=[];
  const client=clientWith(async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,body});assert.match(url,/sync_pull_library$/);assert.equal(body.p_profile_id,2);return new Response(JSON.stringify(body.p_offset===0?Array.from({length:100},(_,i)=>({content_id:`tt${i}`,content_type:'movie',profile_id:2})):[]));});
  assert.equal(Object.keys(await client.library(2)).length,100);assert.equal(calls[1].body.p_offset,100);
  const bad=clientWith(async()=>new Response(JSON.stringify({message:'bad'})));await assert.rejects(bad.library(2),/página/);
  const failed=clientWith(async(_,opts)=>JSON.parse(opts.body).p_offset===0?new Response(JSON.stringify(Array.from({length:100},(_,i)=>({content_id:`tt${i}`,content_type:'movie'})))):new Response('{}',{status:503}));await assert.rejects(failed.library(2),/indisponível/);
});
test('PIN verification sends the selected profile and honors server cooldown, with no local PIN persistence', async () => {
  const client=clientWith(async(url,opts)=>{assert.match(url,/verify_profile_pin$/);assert.deepEqual(JSON.parse(opts.body),{p_profile_id:2,p_pin:'1234'});return new Response(JSON.stringify([{unlocked:false,retry_after_seconds:30}]));});
  assert.deepEqual(await client.verifyPin(2,'1234'),{unlocked:false,retryAfter:30});await assert.rejects(client.verifyPin(2,'12'),/quatro/);
});
