import test from 'node:test';
import assert from 'node:assert/strict';
import {readSubtitleStyle,subtitleStyleDefaults} from '../src/core/subtitle-style.js';
import {segmentIdentity,normalizeSegments,activeSegment,fetchSegments} from '../src/core/skip-segments.js';
import {readPlayback} from '../src/core/playback.js';
test('subtitle appearance bounds and palette preserve the fixed default and reject font overrides',()=>{
 assert.deepEqual(readSubtitleStyle(),subtitleStyleDefaults);
 // The look the port had (Netflix Sans Medium) is the bold state; the added weight range
 // and the family come from the packaged faces, never from the saved object.
 const s=readSubtitleStyle({size:999,offset:-99,opacity:-1,color:'red',fontFamily:'Arial',bold:'true'});
 assert.equal(s.size,200);assert.equal(s.offset,-20);assert.equal(s.opacity,0);assert.equal(s.color,'#ffffff');assert.equal(s.bold,true);assert.equal(s.fontFamily,undefined);
 assert.equal(subtitleStyleDefaults.bold,true);assert.equal(subtitleStyleDefaults.v,2);
 // A style saved before v2 keeps Medium, so an update never changes the viewer's look.
 assert.equal(readSubtitleStyle({size:120,outline:false}).bold,true);
 assert.equal(readSubtitleStyle({v:2,bold:false}).bold,false);
});
test('skip intervals require exact episode identity and valid finite positive windows',()=>{
 const context={id:'tt123:1:2',meta:{type:'series',id:'tt123'},episode:{season:1,episode:2}},id=segmentIdentity(context);assert.equal(id.imdb_id,'tt123');assert.equal(segmentIdentity({...context,episode:null}),null);assert.equal(segmentIdentity({...context,meta:{type:'movie'}}),null);
 const items=normalizeSegments({intro:{start_ms:1000,end_ms:5000},outro:{start_sec:50,end_sec:60},recap:{start_sec:4,end_sec:2}},id);assert.equal(items.length,2);assert.equal(activeSegment(items,1,60).type,'intro');assert.equal(activeSegment(items,5,60),null);assert.equal(activeSegment(items,55,40),null);assert.equal(activeSegment(items,55,Infinity),null);assert.deepEqual(normalizeSegments({imdb_id:'tt999',intro:{start_sec:1,end_sec:5}},id),[]);
});
test('segment lookup is bounded, cached and does not send account credentials',async()=>{
 const ctx={id:'tt456:2:3',meta:{type:'series'},episode:{season:2,episode:3}},calls=[];const request=async(url,opts)=>{calls.push({url,opts});return {intro:{start_sec:1,end_sec:5}};};await fetchSegments(ctx,null,request);await fetchSegments(ctx,null,request);assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).host,'api.introdb.app');assert.equal(calls[0].opts.timeout,15000);assert.equal(calls[0].opts.body,undefined);
});
test('skip defaults require manual action and thumbnails are opt-in',()=>{
 const p=readPlayback();assert.equal(p.skipSegments,true);assert.equal(p.seekThumbnails,false);assert.deepEqual(p.autoSkipTypes,[]);assert.deepEqual(readPlayback({autoSkipTypes:['intro','invalid','intro','outro']}).autoSkipTypes,['intro','outro']);
});
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {requestSegmentService} from '../src/core/segment-service.js';
import {initializeProfiles,activateProfile} from '../src/core/profiles.js';
import {initial} from '../src/core/storage.js';
const {requestSegments,valid}=createRequire(import.meta.url)('../service/request.js');
test('local service only accepts episode identifiers and fixes the HTTPS destination',async()=>{
 let captured;const transport={get(options,callback){captured=options;const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from('{"intro":null}'));res.emit('end');});return req;}};
 assert.equal(valid({imdb_id:'https://evil.test',season:1,episode:1}),false);await assert.rejects(requestSegments({url:'https://evil.test'},transport));
 assert.deepEqual(await requestSegments({imdb_id:'tt123',season:1,episode:2,url:'https://evil.test'},transport),{intro:null});assert.equal(captured.hostname,'api.introdb.app');assert.equal(captured.rejectUnauthorized,true);assert.equal(captured.path,'/segments?imdb_id=tt123&season=1&episode=2');assert.equal(captured.headers.Authorization,undefined);
});
test('local service rejects redirects and oversized responses',async()=>{
 for(const status of [302,200]){const transport={get(options,callback){const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.resume=()=>{};res.destroy=()=>{};callback(res);if(status===200)res.emit('data',Buffer.alloc(32769));});return req;}};await assert.rejects(requestSegments({imdb_id:'tt123',season:1,episode:1},transport),status===302?/HTTP/:/large/);}
});
test('Luna segment bridge sends only episode identity and ignores late cancelled callbacks',async()=>{
 let bridge;class Bridge{constructor(){bridge=this;}call(uri,payload){this.uri=uri;this.payload=JSON.parse(payload);}cancel(){this.cancelled=true;}}
 const identity={imdb_id:'tt123',season:1,episode:1},controller=new AbortController(),pending=requestSegmentService(identity,controller.signal,Bridge);assert.deepEqual(bridge.payload,identity);assert.equal(bridge.uri,'luna://org.nuviofork.webos.segments/segments');controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(bridge.cancelled,true);bridge.onservicecallback('{"returnValue":true}');
 const success=requestSegmentService(identity,null,Bridge);bridge.onservicecallback('{"returnValue":true,"data":{"intro":null}}');assert.deepEqual(await success,{intro:null});
});
test('subtitle appearance stays isolated across profiles',()=>{
 const state=initial();initializeProfiles(state);activateProfile(state,'user',{id:1,name:'One'});state.subtitleAppearance={size:150,color:'#ffd700'};activateProfile(state,'user',{id:2,name:'Two'});assert.equal(state.subtitleAppearance,undefined);state.subtitleAppearance={size:80};activateProfile(state,'user',{id:1,name:'One'});assert.equal(state.subtitleAppearance.size,150);
});
