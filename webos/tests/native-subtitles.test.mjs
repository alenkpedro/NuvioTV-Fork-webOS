import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSubtitles } from '../src/core/native-subtitles.js';
function setup() {
  const track = Object.assign(new EventTarget(),{kind:'subtitles',mode:'disabled',activeCues:[]});
  const other = Object.assign(new EventTarget(),{kind:'subtitles',mode:'disabled',activeCues:[{text:'Outra'}]});
  const video = {textTracks:[track,other]}; let events=0;
  const captions = nativeSubtitles(video,()=>events++);captions.setFontReady(true);captions.select(track);
  return {track,other,video,captions,events:()=>events};
}
test('native text waits for real text and loaded font, then hides native painting and sanitizes cues',()=>{
  const {captions,track}=setup();assert.equal(captions.text(),'');assert.equal(track.mode,'showing');
  track.activeCues=[{text:'<b>Olá</b> &amp; você'},{text:'Segunda linha'}];captions.setFontReady(false);
  assert.equal(captions.text(),'');assert.equal(track.mode,'showing');captions.setFontReady(true);
  assert.equal(captions.text(),'Olá & você\nSegunda linha');assert.equal(track.mode,'hidden');assert.equal(captions.selected(),track);
  track.activeCues=[];assert.equal(captions.text(),'');assert.equal(captions.custom,true);
});
test('opaque cues and inaccessible native API preserve TV subtitles, including after custom rendering',()=>{
  const {captions,track}=setup();track.activeCues=[{text:'Olá'}];captions.text();
  track.activeCues=[{image:'bitmap'}];assert.equal(captions.text(),'');assert.equal(track.mode,'showing');assert.equal(captions.custom,false);
  Object.defineProperty(track,'activeCues',{get(){throw Error('unavailable');}});assert.equal(captions.text(),'');assert.equal(track.mode,'showing');
});
test('refused hidden mode never paints duplicate overlay or loses track selection',()=>{
  const {captions,track}=setup();track.activeCues=[{text:'Olá'}];let mode='showing';
  Object.defineProperty(track,'mode',{get:()=>mode,set:value=>{if(value!=='hidden')mode=value;}});
  assert.equal(captions.text(),'');assert.equal(captions.custom,false);assert.equal(captions.selected(),track);assert.equal(mode,'showing');
});
test('failed switch preserves old custom track; successful off, switch and removal clean up listeners',()=>{
  const {captions,track,other,video,events}=setup();track.activeCues=[{text:'Olá'}];captions.text();
  Object.defineProperty(other,'mode',{configurable:true,get:()=> 'disabled',set(){}});
  assert.throws(()=>captions.select(other));assert.equal(track.mode,'hidden');assert.equal(captions.text(),'Olá');
  Object.defineProperty(other,'mode',{writable:true,value:'disabled'});captions.select(other);
  track.dispatchEvent(new Event('cuechange'));assert.equal(events(),0);other.dispatchEvent(new Event('cuechange'));assert.equal(events(),1);
  assert.equal(captions.text(),'Outra');captions.select();assert.equal(captions.text(),'');assert.equal(other.mode,'disabled');
  captions.select(track);captions.text();video.textTracks=[];assert.equal(captions.text(),'');assert.equal(captions.selected(),null);
  track.dispatchEvent(new Event('cuechange'));assert.equal(events(),1);captions.dispose();
});

test('a track already enabled by the platform also receives the custom font',()=>{
  const track=Object.assign(new EventTarget(),{kind:'subtitles',mode:'showing',activeCues:[{text:'Padrão da TV'}]});
  const captions=nativeSubtitles({textTracks:[track]},()=>{});captions.setFontReady(true);
  assert.equal(captions.text(),'Padrão da TV');assert.equal(track.mode,'hidden');captions.dispose();assert.equal(track.mode,'showing');
});
