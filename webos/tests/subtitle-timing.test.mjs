import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSubtitleDelay, syncSubtitleDelay, selectSyncCues, nearestCueIndex, formatSubtitleDelay, cueTimestamp } from '../src/core/subtitle-timing.js';
import { saveDelay, readDelay } from '../src/core/playback-memory.js';
const cue=(start,text=`Line ${start}`)=>({start,end:start+1,text});
test('sync anchors the selected spoken line to the captured video time with fork reaction compensation',()=>{
  assert.equal(syncSubtitleDelay(25.3,20),5);
  assert.equal(syncSubtitleDelay(20,25),-5.3);
  assert.equal(syncSubtitleDelay(0,0),-.3);
  assert.equal(syncSubtitleDelay(900,20),180);
  assert.equal(syncSubtitleDelay(20,900),-180);
  for(const value of [NaN,Infinity,'20',-1])assert.throws(()=>syncSubtitleDelay(value,20));
});
test('sync cue window is centered, bounded and falls back to nearest lines across long gaps',()=>{
  const cues=Array.from({length:20000},(_,i)=>cue(i));
  const selected=selectSyncCues(cues,10000);assert.equal(selected.length,90);assert.equal(selected[0].start,9955);assert.equal(selected[89].start,10044);
  assert.equal(selectSyncCues(cues,0)[0].start,0);assert.equal(selectSyncCues(cues,19999).at(-1).start,19999);
  assert.deepEqual(selectSyncCues([cue(1000),cue(0)],500).map(c=>c.start),[0,1000]);
  assert.equal(nearestCueIndex([cue(20),cue(30)],25),0);
  assert.deepEqual(selectSyncCues([cue(1),cue(180),cue(181)],0).map(c=>c.start),[1,180]);
  assert.deepEqual(selectSyncCues([],0),[]);assert.deepEqual(selectSyncCues([cue(0)],NaN),[]);
});
test('millisecond precision survives storage, legacy delays and fine adjustment without float drift',()=>{
  const state={},context={type:'movie',id:'fixture'};
  saveDelay(state,context,syncSubtitleDelay(123.456,100));assert.equal(readDelay(state,context),23.156);
  for(const value of [-180,180,.5,-.5]){saveDelay(state,context,value);assert.equal(readDelay(state,context),value);}
  saveDelay(state,context,181);assert.equal(readDelay(state,context),-.5);
  let delay=0;for(let i=0;i<50;i++)delay=clampSubtitleDelay(delay+.1);assert.equal(delay,5);
  assert.equal(formatSubtitleDelay(-.3),'-300 ms');assert.equal(formatSubtitleDelay(2.001),'+2001 ms');assert.equal(formatSubtitleDelay(0),'0 ms');
  assert.equal(cueTimestamp(65),'01:05');assert.equal(cueTimestamp(3661.9),'1:01:01');
});
