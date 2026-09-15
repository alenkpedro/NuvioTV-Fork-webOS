import test from 'node:test';
import assert from 'node:assert/strict';
import { aspectScale,aspectModes,readAspect,nextAspect } from '../src/core/aspect.js';
test('aspect cycle matches seven fork modes and recovers malformed preference',()=>{
  let mode='ORIGINAL';for(const [expected] of aspectModes){assert.equal(mode,expected);mode=nextAspect(mode);}assert.equal(mode,'ORIGINAL');
  for(const value of [null,undefined,'broken',{},1])assert.equal(readAspect(value),'ORIGINAL');
});
test('4:3 content in 16:9 viewport preserves fit, fills width without distortion or stretches only X',()=>{
  assert.deepEqual(aspectScale('ORIGINAL',16/9,4/3),[1,1]);
  assert.deepEqual(aspectScale('FULL_SCREEN',16/9,4/3),[4/3,4/3]);
  assert.deepEqual(aspectScale('STRETCH',16/9,4/3),[4/3,1]);
  assert.deepEqual(aspectScale('VERTICAL_STRETCH',16/9,4/3),[1,1]);
  assert.deepEqual(aspectScale('HORIZONTAL_STRETCH',16/9,4/3),[4/3,4/3]);
});
test('wide cinema content fills height while fixed zooms and invalid metadata follow reference fallbacks',()=>{
  const ratio=2.35/(16/9);
  assert.deepEqual(aspectScale('FULL_SCREEN',16/9,2.35),[ratio,ratio]);
  assert.deepEqual(aspectScale('STRETCH',16/9,2.35),[1,ratio]);
  assert.deepEqual(aspectScale('VERTICAL_STRETCH',16/9,2.35),[ratio,ratio]);
  assert.deepEqual(aspectScale('HORIZONTAL_STRETCH',16/9,2.35),[1,1]);
  assert.deepEqual(aspectScale('SLIGHT_ZOOM',16/9,null),[1.15,1.15]);assert.deepEqual(aspectScale('CINEMA_ZOOM',16/9,null),[1.33,1.33]);
  for(const value of [0,NaN,Infinity,-1,null])assert.deepEqual(aspectScale('FULL_SCREEN',16/9,value),[1,1]);
  assert.deepEqual(aspectScale('CINEMA_ZOOM',0,2),[1,1]);
});
