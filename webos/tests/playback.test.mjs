import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlayback,languageCode,preferredLanguages,languageScore,followingEpisode,nextThreshold,nextSource} from '../src/core/playback.js';
test('fork playback defaults and thresholds survive absent or malformed saved preferences',()=>{
  assert.equal(readPlayback().autoNext,false);assert.equal(readPlayback().addonSubtitles,false);assert.equal(readPlayback().thresholdPercent,99);
  assert.deepEqual(readPlayback(null),readPlayback());
  assert.equal(readPlayback({thresholdPercent:2,thresholdMinutes:99,audio:'<script>'}).thresholdPercent,97);
  assert.equal(readPlayback({thresholdMinutes:99}).thresholdMinutes,3.5);
});
test('language matching maps ISO aliases and prioritizes the requested region before a secondary language',()=>{
  assert.equal(languageCode('POR_br'),'pt-br');assert.equal(languageCode('pob'),'pt-br');assert.equal(languageCode('und'),'');
  const preferred=preferredLanguages('pt-br','eng',['es']);assert.deepEqual(preferred,['pt-br','en']);
  assert.equal(languageScore('pob',preferred),0);assert.equal(languageScore('por',preferred),1);assert.equal(languageScore('en',preferred),2);assert.equal(languageScore('',preferred),Infinity);
});
test('device, original, default audio and disabled subtitles have explicit language fallbacks',()=>{
  assert.deepEqual(preferredLanguages('original','es',['pt-BR'],'jpn'),['ja','es']);
  assert.deepEqual(preferredLanguages('original','es',['pt-BR']),['pt-br','es']);
  assert.deepEqual(preferredLanguages('device','por',['pt','pt-BR']),['pt','pt-br']);
  assert.deepEqual(preferredLanguages('default','',['en']),[]);
  assert.deepEqual(preferredLanguages('off','en',['pt']),[]);
});
const meta={type:'series',videos:[{id:'b',season:2,episode:1,released:'2999-01-01'},{id:'a',season:1,episode:2},{id:'a',season:1,episode:2}]};
test('next episode uses current ID, crosses seasons, exposes unaired and never wraps last episode',()=>{
  assert.equal(followingEpisode(meta,'a').id,'b');assert.equal(followingEpisode(meta,'a').hasAired,false);
  assert.equal(followingEpisode(meta,'b'),null);assert.equal(followingEpisode(meta,'missing'),null);assert.equal(followingEpisode({...meta,type:'movie'},'a'),null);
});
test('absolute numbered episodes advance and unknown date is allowed like the fork',()=>{
  assert.equal(followingEpisode({type:'series',videos:[{id:'x',episode:2},{id:'y',episode:3,released:'unknown'}]},'x').hasAired,true);
});
test('next threshold supports 97–100 percent, minutes, live/invalid duration and backward seeking',()=>{
  assert.equal(nextThreshold(990,1000,{}),true);assert.equal(nextThreshold(989,1000,{}),false);
  assert.equal(nextThreshold(880,1000,{thresholdMode:'minutes'}),true);assert.equal(nextThreshold(800,1000,{thresholdMode:'minutes'}),false);
  for(const duration of [0,NaN,Infinity,-1])assert.equal(nextThreshold(100,duration,{}),false);
  assert.equal(nextThreshold(999,1000,{thresholdPercent:100}),false);assert.equal(nextThreshold(1000,1000,{thresholdPercent:100}),true);
});
test('binge group selection respects ranking and optional fallback without guessing titles',()=>{
  const ranked=[{url:'https://test/a'},{url:'https://test/b',behaviorHints:{bingeGroup:'group'}}];
  assert.equal(nextSource(ranked,'group',{}),ranked[1]);assert.equal(nextSource(ranked,'missing',{}),ranked[0]);
  assert.equal(nextSource(ranked,'missing',{nextFallback:false}),null);
  assert.equal(nextSource(ranked,'group',{preferBingeGroup:false}),ranked[0]);assert.equal(nextSource([],null,{}),null);
});
