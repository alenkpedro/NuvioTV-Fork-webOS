import test from 'node:test';
import assert from 'node:assert/strict';
import {subtitleFlags,stripSdhText,subtitlePolicy,subtitleScoreFor,readTrackMemory,saveTrackMemory,clearTrackMemory} from '../src/core/subtitle-options.js';
import {readPlayback} from '../src/core/playback.js';
import {normalizeSubtitles} from '../src/core/subtitles.js';
import {initializeProfiles,activateProfile} from '../src/core/profiles.js';
import {initial,saveState,readState} from '../src/core/storage.js';
test('forced and SDH metadata uses explicit flags and bounded markers without misreading URLs or unforced',()=>{
  assert.deepEqual(subtitleFlags({name:'Português [Forced] SDH'}),{forced:true,sdh:true});
  assert.equal(subtitleFlags({name:'Unforced',url:'https://forced.test/sub.srt?token=forced'}).forced,false);
  assert.equal(subtitleFlags({name:'Forced',forced:false}).forced,false);
  assert.equal(subtitleFlags({kind:'captions'}).sdh,true);
  const [sub]=normalizeSubtitles([{url:'https://test/a.forced.srt',lang:'por',hearingImpaired:true}]);assert.equal(sub.forced,true);assert.equal(sub.sdh,true);
});
test('SDH text filtering follows fork speaker, brackets and parentheses rules without stripping numeric dialogue',()=>{
  assert.equal(stripSdhText('>> JOHN: Hello!\n[Door closes]\n- MARY: (whispering) Stay here.\n(2024)\n-'),'Hello!\n- Stay here.\n(2024)');
  assert.equal(stripSdhText('[Music]\n>>\n-'),'');
  assert.equal(stripSdhText('Olá mundo\n(123)\n字幕（日本語）'),'Olá mundo\n(123)\n字幕（日本語）');
  assert.equal(stripSdhText('They said: hello'), 'hello'); // The optional filter preserves the fork heuristic, including this ambiguity.
});
test('forced mode follows selected audio, defers when unknown and does not choose forced for foreign audio',()=>{
  const args={preferences:readPlayback({forcedSubtitles:true}),languages:['pt-br','en']};
  assert.equal(subtitlePolicy({...args,audioLanguage:''}).defer,true);
  const policy=subtitlePolicy({...args,audioLanguage:'por'});assert.equal(policy.forced,true);
  assert.equal(subtitleScoreFor({lang:'pob',forced:false},policy,'external'),Infinity);
  assert.equal(subtitleScoreFor({lang:'pob',forced:true},policy,'external'),0);
  assert.equal(subtitlePolicy({...args,audioLanguage:'pt-PT'}).forced,false);
  assert.equal(subtitlePolicy({...args,audioLanguage:'eng'}).forced,false);
});
test('remembered Off overrides settings and remembered kind/flags are matched without URLs or indexes',()=>{
  const args={preferences:readPlayback(),languages:['pt-br'],audioLanguage:'pt'};
  assert.equal(subtitlePolicy({...args,remembered:{kind:'off'}}).off,true);
  const policy=subtitlePolicy({...args,remembered:{kind:'external',language:'en',forced:true,sdh:true}});
  assert.equal(subtitleScoreFor({lang:'eng',forced:true,sdh:true},policy,'external'),0);
  assert.equal(subtitleScoreFor({lang:'eng',forced:true,sdh:true},policy,'native'),.25);
  assert.equal(subtitleScoreFor({lang:'eng'},policy,'external'),Infinity);
});
test('track memories are isolated by content type and profile, survive reload, and never store source URLs or delays',()=>{
  const state=initial(),series={type:'series',id:'tt1'};initializeProfiles(state);
  saveTrackMemory(state,series,'subtitles',{kind:'external',language:'por',url:'https://secret',delay:5,forced:true});
  saveTrackMemory(state,series,'audio',{language:'eng',index:3});
  assert.deepEqual(readTrackMemory(state,series),{audio:{language:'en'},subtitles:{language:'pt',kind:'external',forced:true,sdh:false}});
  assert.equal(readTrackMemory(state,{...series,type:'movie'}).audio,null);
  const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};saveState(storage,state);
  const restored=readState(storage);activateProfile(restored,'owner',{id:1});assert.equal(readTrackMemory(restored,series).audio,null);
  activateProfile(restored,null);assert.equal(readTrackMemory(restored,series).audio.language,'en');
  assert.doesNotMatch(JSON.stringify(restored.trackPreferences),/secret|delay|index/);clearTrackMemory(restored,series);assert.equal(readTrackMemory(restored,series).subtitles,null);
});
test('memory is bounded to 100 titles, retains other category and rejects unknown languages',()=>{
  const state=initial();for(let i=0;i<110;i++)saveTrackMemory(state,{type:'series',id:String(i)},'audio',{language:'en'});
  assert.equal(Object.keys(state.trackPreferences).length,100);assert.equal(readTrackMemory(state,{type:'series',id:'0'}).audio,null);
  const meta={type:'series',id:'109'};saveTrackMemory(state,meta,'subtitles',{kind:'off'});saveTrackMemory(state,meta,'audio',{language:'und'});
  assert.deepEqual(readTrackMemory(state,meta),{audio:null,subtitles:{kind:'off'}});
});
