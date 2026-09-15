import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpeed,saveSpeed,readDelay,saveDelay,setPlaybackSpeed,playbackSpeeds } from '../src/core/playback-memory.js';
import { readPlayback } from '../src/core/playback.js';
import { initializeProfiles,activateProfile } from '../src/core/profiles.js';
const meta={type:'series',id:'ttseries'}, episode={type:'series',id:'ttseries:1:1'};
test('speed follows title while subtitle delay stays with video, isolated by type and profile',()=>{
  const state={addons:[]};initializeProfiles(state);
  saveSpeed(state,meta,1.25);saveDelay(state,episode,1.5);
  assert.equal(readSpeed(state,meta),1.25);assert.equal(readDelay(state,{...episode,id:'ttseries:1:2'}),0);
  assert.equal(readDelay(state,{...episode,type:'movie'}),0);
  activateProfile(state,'user',{id:2,name:'Second'});assert.equal(readSpeed(state,meta),1);assert.equal(readDelay(state,episode),0);
  saveSpeed(state,meta,2);saveDelay(state,episode,-1);
  activateProfile(state,null);assert.equal(readSpeed(state,meta),1.25);assert.equal(readDelay(state,episode),1.5);
  saveSpeed(state,meta,1);saveDelay(state,episode,0);assert.deepEqual(state.playbackSpeeds,{});assert.deepEqual(state.subtitleDelays,{});
});
test('timing memory validates corrupted values, has bounded storage and excludes URLs',()=>{
  const state={};for(let i=0;i<120;i++){saveSpeed(state,{...meta,id:String(i)},1.5);saveDelay(state,{...episode,id:String(i)},0.5);}
  assert.equal(Object.keys(state.playbackSpeeds).length,100);assert.equal(Object.keys(state.subtitleDelays).length,100);
  assert.equal(readSpeed(state,{...meta,id:'0'}),1);assert.equal(readDelay(state,{...episode,id:'0'}),0);
  for(const value of [NaN,Infinity,'2',null,999]){saveSpeed(state,meta,value);saveDelay(state,episode,value);}
  assert.equal(readSpeed(state,meta),1);assert.equal(readDelay(state,episode),0);
  saveDelay(state,{...episode,url:'https://secret.example'},-.5);assert.doesNotMatch(JSON.stringify(state),/https/);
});
test('speed changes reject ignored and throwing platform setters without changing prior speed',()=>{
  const video={duration:60,playbackRate:1};for(const speed of playbackSpeeds){setPlaybackSpeed(video,speed);assert.equal(video.playbackRate,speed);}
  assert.throws(()=>setPlaybackSpeed({...video,duration:Infinity},2),/duração/);
  for(const throws of [true,false]) {
    let rate=1.25;const refused={duration:60,get playbackRate(){return rate;},set playbackRate(value){if(value!==1.25){if(throws)throw Error('unsupported');return;}rate=value;}};
    assert.throws(()=>setPlaybackSpeed(refused,2),/não aceitou/);assert.equal(rate,1.25);
  }
});
test('still watching matches fork defaults and clamps its integer threshold',()=>{
  assert.equal(readPlayback().stillWatching,false);assert.equal(readPlayback().stillWatchingThreshold,3);
  assert.equal(readPlayback({stillWatching:true,stillWatchingThreshold:1}).stillWatchingThreshold,2);
  assert.equal(readPlayback({stillWatchingThreshold:9}).stillWatchingThreshold,6);
  assert.equal(readPlayback({stillWatchingThreshold:2.5}).stillWatchingThreshold,3);
});
