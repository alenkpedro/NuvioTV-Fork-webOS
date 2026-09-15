import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPlayModes,autoPlayModeIds,autoPlayModeLabel,autoPlayConfigured,allowedAddonsFilter,compileRegex,exclusionWords,migrateAutoPlay,readAutoPlayMode,readAutoPlayRegex,regexConfigured,searchableText,selectAutoPlayStream} from '../src/core/auto-play.js';
import {cacheDurationLabel,clearLinkCache,linkCacheDefaultHours,linkCacheHours,linkCacheLimit,linkCacheSize,linkKey,readLink,readLinkCache,readLinkCacheHours,writeLink} from '../src/core/link-cache.js';
import {postPlayCountdown,postPlayTrailerCountdown,readTrailerDelay,shouldCountTrailer,trailerDelayDefault,trailerDelayRange} from '../src/core/trailer.js';
import {readPlayback} from '../src/core/playback.js';
import {initial,readState,saveState} from '../src/core/storage.js';
const stream=(name,url,extra={})=>({name,url,addonName:'Catálogo de teste',...extra});
const rows=[
  stream('Movie 1080p WEB-DL-FLUX', 'https://fixture.example/low.mp4'),
  stream('Movie 2160p REMUX DV', 'https://fixture.example/high.mkv', {addonName:'Outro addon'}),
  stream('Movie 2160p CAM', 'https://fixture.example/cam.mp4')
];
test('auto-play modes mirror the fork and unknown values fall back to manual',()=>{
  assert.deepEqual(autoPlayModeIds,['manual','first','rank','regex']);
  assert.equal(readAutoPlayMode('regex'),'regex');assert.equal(readAutoPlayMode('AUTO'),'manual');assert.equal(readAutoPlayMode(undefined),'manual');
  assert.equal(autoPlayModeLabel('rank'),'Seleção inteligente');assert.equal(autoPlayModeLabel('nope'),'Manual (escolher fonte)');
  assert.ok(autoPlayModes.every(mode=>mode.description));
});
test('the regex policy needs letters or digits and a compilable pattern',()=>{
  assert.equal(regexConfigured('4K|2160p|Remux'),true);
  assert.equal(regexConfigured('|||'),false); // no letter and no digit never turns the mode on
  assert.equal(regexConfigured('(?!cam)'),true); // the words inside the lookahead count
  assert.equal(regexConfigured(''),false);assert.equal(regexConfigured('   '),false);assert.equal(regexConfigured('('),false);
  assert.equal(regexConfigured(' 1080p '),true); // the fork trims before compiling
  assert.equal(readAutoPlayRegex(' 4K '.repeat(80)).length,200);
  assert.equal(readAutoPlayRegex(42),'');
});
test('exclusion words come out of the negative lookahead groups the fork parses',()=>{
  assert.deepEqual(exclusionWords('4K|2160p(?!(cam|ts))'),['cam','ts']);
  assert.deepEqual(exclusionWords('(?!( cam | ts ))'),['cam','ts']);
  assert.deepEqual(exclusionWords('4K'),[]);
  assert.ok(compileRegex('4K(?!(cam))').exclude instanceof RegExp);
  assert.equal(compileRegex('('),null);assert.equal(compileRegex(''),null);
  assert.equal(searchableText(stream('Nome','https://x/y.mp4',{title:'Título',description:'Desc',infoHash:'HASH'})),'Catálogo de teste Nome Título Desc https://x/y.mp4 HASH');
});

test('each mode picks the source the fork would pick, in add-on order',()=>{
  const options={avoidDvOnly:false,preferences:{}};
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'manual'}),null);
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'first'}).name,'Movie 1080p WEB-DL-FLUX');
  // Regex keeps the add-on order, like candidateStreams in the fork.
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'regex',regex:'2160p'}).name,'Movie 2160p REMUX DV');
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'regex',regex:'2160p(?!(cam))'}).name,'Movie 2160p REMUX DV');
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'regex',regex:'2160p(?!(cam|remux))'}),null);
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'regex',regex:'av1'}),null);
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'regex',regex:'none at all'}),null);
  assert.equal(selectAutoPlayStream(rows,{mode:'regex',regex:'(',avoidDvOnly:false}),null);
});
test('exclusions, add-on scope, device profile and empty lists gate the automatic pick',()=>{
  const options={avoidDvOnly:false,preferences:{}};
  assert.equal(selectAutoPlayStream([rows[2]],{...options,mode:'regex',regex:'2160p(?!(cam|ts))'}),null);
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'rank'}).name,'Movie 2160p REMUX DV');
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'first',allowedAddons:['Outro addon']}).name,'Movie 2160p REMUX DV');
  assert.equal(selectAutoPlayStream(rows,{...options,mode:'first',allowedAddons:['Inexistente']}),null);
  assert.equal(allowedAddonsFilter([])(rows[0]),true);assert.equal(allowedAddonsFilter(['Outro addon'])(rows[0]),false);
  // The UT8050 profile drops Dolby-Vision-only sources before any mode runs.
  const dvOnly=[stream('Movie 2160p DV', 'https://fixture.example/dv.mkv', {description:'Dolby Vision Profile 5'})];
  assert.equal(selectAutoPlayStream(dvOnly,{mode:'first',avoidDvOnly:true}),null);
  assert.equal(selectAutoPlayStream([],{...options,mode:'first'}),null);
  assert.equal(selectAutoPlayStream(null,{...options,mode:'first'}),null);
});
test('automatic playback is on for a real mode, off for manual and unusable regex',()=>{
  assert.equal(autoPlayConfigured({autoPlayMode:'manual',autoPlayRegex:'4K'}),false);
  assert.equal(autoPlayConfigured({autoPlayMode:'manual',reuseLastLink:true}),true); // the cache still runs
  assert.equal(autoPlayConfigured({autoPlayMode:'first'}),true);
  assert.equal(autoPlayConfigured({autoPlayMode:'rank'}),true);
  assert.equal(autoPlayConfigured({autoPlayMode:'regex',autoPlayRegex:'4K'}),true);
  assert.equal(autoPlayConfigured({autoPlayMode:'regex',autoPlayRegex:'|||'}),false);
  assert.equal(autoPlayConfigured({autoPlayMode:'regex',autoPlayRegex:'('}),false);
  assert.equal(autoPlayConfigured(readPlayback({autoPlayMode:'regex',autoPlayRegex:'2160p'})),true);
  assert.equal(autoPlayConfigured(),false);
});
test('the previous single switch becomes Seleção inteligente and is not kept',()=>{
  const legacy=migrateAutoPlay({autoPlay:true,playback:{}});
  assert.equal(legacy.playback.autoPlayMode,'rank');assert.equal('autoPlay' in legacy,false);
  const chosen=migrateAutoPlay({autoPlay:true,playback:{autoPlayMode:'regex'}});
  assert.equal(chosen.playback.autoPlayMode,'regex');
  const untouched=migrateAutoPlay({autoPlay:false,playback:{}});
  assert.equal(untouched.playback.autoPlayMode,undefined);
  assert.equal(migrateAutoPlay(null),null);
});
test('link cache keys, durations and validation follow the fork store',()=>{
  assert.equal(linkKey('Series','tt123:1:2'),'series|tt123:1:2');
  assert.equal(linkKey('movie',''),'');assert.equal(linkKey(null,'x'),'');
  assert.deepEqual([...linkCacheHours],[1,2,3,6,12,24,48,72,168]);
  assert.equal(linkCacheDefaultHours,24);assert.equal(readLinkCacheHours(0),24);assert.equal(readLinkCacheHours(6),6);
  assert.equal(cacheDurationLabel(1),'1 hora');assert.equal(cacheDurationLabel(6),'6 horas');
  assert.equal(cacheDurationLabel(24),'1 dia');assert.equal(cacheDurationLabel(168),'7 dias');assert.equal(cacheDurationLabel(30),'1d 6h');
});

test('an entry is stored, bounded, expired and dropped when it stops being playable',()=>{
  const now=Date.now();
  const cache=writeLink({},'movie|tt1',{url:'https://fixture.example/clip.mp4',streamName:'Movie 1080p WEB-DL-FLUX',addonName:'Catálogo de teste'},{now});
  assert.equal(linkCacheSize(cache),1);
  assert.deepEqual(readLink(cache,'movie|tt1',24,now).link,{url:'https://fixture.example/clip.mp4',streamName:'Movie 1080p WEB-DL-FLUX',addonName:'Catálogo de teste',cachedAt:now,age:0});
  assert.equal(readLink(cache,'movie|tt1',1,now+3600001).link,null); // outside the configured hours
  assert.equal(linkCacheSize(readLink(cache,'movie|tt1',1,now+3600001).cache),0); // and removed
  assert.equal(readLink(cache,'movie|tt1',0,now).link,null); // the fork refuses a zero age
  // No future-date guard in the fork either: an entry is served while it is in age.
  assert.equal(readLink(cache,'movie|tt1',24,now-1).link.url,'https://fixture.example/clip.mp4');
  assert.equal(readLink(cache,'other|tt2',24,now).link,null);
  // Only direct HTTP(S) links are reusable on this target.
  assert.equal(linkCacheSize(writeLink({},'movie|tt1',{url:'magnet:?xt=urn:btih:X',streamName:'Torrent'},{now})),0);
  assert.equal(linkCacheSize(writeLink({},'movie|tt1',{url:'javascript:alert(1)',streamName:'x'},{now})),0);
  assert.equal(linkCacheSize(writeLink({},'movie|tt1',{url:'',streamName:'x'},{now})),0);
  assert.equal(linkCacheSize(writeLink({},'',{url:'https://x/y.mp4',streamName:'x'},{now})),0);
  assert.equal(linkCacheSize(readLinkCache({a:{url:'https://x/y.mp4',cachedAt:now},b:{url:'ftp://x/y'},c:null})),1);
  assert.equal(linkCacheSize(readLinkCache(null)),0);
  assert.equal(linkCacheSize(clearLinkCache()),0);
});
test('the link cache keeps the newest entries and stays bounded',()=>{
  const now=Date.now();
  let cache={};
  for(let i=0;i<linkCacheLimit+10;i++)cache=writeLink(cache,`movie|tt${i}`,{url:`https://fixture.example/${i}.mp4`,streamName:`Fonte ${i}`},{now:now+i});
  assert.equal(linkCacheSize(cache),linkCacheLimit);
  assert.equal(cache['movie|tt0'],undefined); // the oldest left first
  assert.equal(Boolean(cache[`movie|tt${linkCacheLimit+9}`]),true);
});
test('trailer settings keep the fork delay range and the five-second countdown',()=>{
  assert.deepEqual([...trailerDelayRange],[3,15]);assert.equal(trailerDelayDefault,7);assert.equal(postPlayTrailerCountdown,5);
  assert.equal(readTrailerDelay(undefined),7);assert.equal(readTrailerDelay('9'),9);assert.equal(readTrailerDelay(1),3);assert.equal(readTrailerDelay(99),15);
  assert.equal(readTrailerDelay(7.4),7);
  assert.equal(postPlayCountdown(90,100),null);assert.equal(postPlayCountdown(95,100),5);
  assert.equal(postPlayCountdown(96.2,100),4);assert.equal(postPlayCountdown(100,100),1);assert.equal(postPlayCountdown(0,0),null);
  assert.equal(shouldCountTrailer({enabled:true,open:true,hasTrailer:true}),true);
  assert.equal(shouldCountTrailer({enabled:true,open:true,hasTrailer:true,launched:true}),false);
  assert.equal(shouldCountTrailer({enabled:false,open:true,hasTrailer:true}),false);
  assert.equal(shouldCountTrailer({enabled:true,open:false,hasTrailer:true}),false);
  assert.equal(shouldCountTrailer({enabled:true,open:true,hasTrailer:false}),false);
});
test('the new playback keys are validated and the old single switch migrates on load',()=>{
  const defaults=readPlayback();
  assert.equal(defaults.autoPlayMode,'manual');assert.equal(defaults.autoPlayRegex,'');assert.deepEqual(defaults.autoPlayAddons,[]);
  assert.equal(defaults.reuseLastLink,false);assert.equal(defaults.reuseLastLinkHours,24);
  assert.equal(defaults.trailerAutoPlay,false);assert.equal(defaults.trailerDelay,7);
  assert.equal(readPlayback({autoPlayMode:'regex'}).autoPlayMode,'regex');
  assert.equal(readPlayback({autoPlayMode:'AUTO'}).autoPlayMode,'manual');
  assert.equal(readPlayback({autoPlayRegex:'  4K '}).autoPlayRegex,'4K');
  assert.equal(readPlayback({autoPlayRegex:42}).autoPlayRegex,'');
  assert.deepEqual(readPlayback({autoPlayAddons:['A','A',2]}).autoPlayAddons,['A']);
  assert.deepEqual(readPlayback({autoPlayAddons:'A'}).autoPlayAddons,[]);
  assert.equal(readPlayback({reuseLastLinkHours:5}).reuseLastLinkHours,24);
  assert.equal(readPlayback({reuseLastLinkHours:48}).reuseLastLinkHours,48);
  assert.equal(readPlayback({trailerDelay:1}).trailerDelay,3);
  assert.equal(readPlayback({trailerDelay:40}).trailerDelay,15);
  const store={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};
  store.value=JSON.stringify({...initial(),addons:[],settings:{autoPlay:true,preferences:{}},progress:{}});
  const migrated=readState(store);
  assert.equal(migrated.settings.playback.autoPlayMode,'rank');assert.equal('autoPlay' in migrated.settings,false);
  const withLinks={...initial(),addons:[],progress:{},linkCache:{'movie|tt1':{url:'https://x/y.mp4',cachedAt:Date.now()},'movie|tt2':{url:'magnet:x'}}};
  saveState(store,withLinks);
  assert.equal(linkCacheSize(readState(store).linkCache),1);
});
