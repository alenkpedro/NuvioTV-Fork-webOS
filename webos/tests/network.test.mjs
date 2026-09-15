import test from 'node:test';
import assert from 'node:assert/strict';
import {bufferedAhead,bufferDefaults,bufferRanges,bufferStatusText,initialTarget,readBufferSeconds,readWaitTimeout,rebufferTarget,toRanges,waitForBuffer} from '../src/core/buffer.js';
import {formatLatency,formatMbps,formatSpeed,mbpsFrom,measureSource,measureSources,speedBudget,speedRequestHeaders,subWindowRates} from '../src/core/speed-test.js';
import {readPlayback} from '../src/core/playback.js';
test('the custom buffer keeps the fork defaults and only acts when it is on',()=>{
  assert.deepEqual([...bufferRanges.initial],[0,20]);assert.deepEqual([...bufferRanges.afterRebuffer],[0,20]);
  assert.equal(bufferDefaults.custom,false);assert.equal(bufferDefaults.initial,5);assert.equal(bufferDefaults.afterRebuffer,3);
  const off=readPlayback({});assert.equal(initialTarget(off),0);assert.equal(rebufferTarget(off),0); // media element keeps its own policy
  const on=readPlayback({customBuffer:true});
  assert.equal(initialTarget(on),5);assert.equal(rebufferTarget(on),3);
  assert.equal(initialTarget(readPlayback({customBuffer:true,bufferInitial:0})),0); // zero means "do not wait"
  assert.equal(bufferStatusText(4),'Aguardando buffer (4s)…');
});
test('buffer durations and the wait guard are validated like the fork sliders',()=>{
  assert.equal(readBufferSeconds(7,'initial'),7);assert.equal(readBufferSeconds(7.6,'initial'),8);
  assert.equal(readBufferSeconds(-3,'initial'),0);assert.equal(readBufferSeconds(99,'afterRebuffer'),20);
  assert.equal(readBufferSeconds('x','initial'),5);assert.equal(readBufferSeconds(undefined,'afterRebuffer'),3);
  assert.equal(readWaitTimeout(0),5);assert.equal(readWaitTimeout(90),60);assert.equal(readWaitTimeout('x'),20);
  const prefs=readPlayback({customBuffer:true,bufferInitial:99,bufferAfterRebuffer:-4,bufferWaitTimeout:600});
  assert.equal(prefs.bufferInitial,20);assert.equal(prefs.bufferAfterRebuffer,0);assert.equal(prefs.bufferWaitTimeout,60);
  assert.equal(readPlayback({customBuffer:'true'}).customBuffer,false);
});
test('buffered ranges report only the contiguous media ahead of the position',()=>{
  const timeRanges={length:2,start:i=>[10,30][i],end:i=>[20,45][i]};
  assert.equal(bufferedAhead(timeRanges,12),8);assert.equal(bufferedAhead(timeRanges,20),0);
  assert.equal(bufferedAhead(timeRanges,25),0); // the gap is not buffer
  assert.equal(bufferedAhead([[0,6]],0.5),5.5);assert.equal(bufferedAhead([[4,9]],3),0);
  assert.deepEqual(toRanges([[1,2],[3,3],null]),[{start:1,end:2}]);
  assert.deepEqual(toRanges(timeRanges),[{start:10,end:20},{start:30,end:45}]);
  assert.equal(bufferedAhead(undefined,3),0);assert.equal(bufferedAhead([[0,5]],NaN),0);
});
test('waiting for the buffer resolves, times out and never waits for a zero target',async()=>{
  let clock=0,reads=0;
  const outcome=await waitForBuffer({target:3,read:()=>{reads++;return reads<3?1:4;},timeout:10000,delay:100,now:()=>clock,wait:async ms=>{clock+=ms;}});
  assert.equal(outcome,'ready');assert.equal(reads,3);
  clock=0;
  const timedOut=await waitForBuffer({target:30,read:()=>1,timeout:500,delay:100,now:()=>clock,wait:async ms=>{clock+=ms;}});
  assert.equal(timedOut,'timeout');
  assert.equal(await waitForBuffer({target:0,read:()=>0,timeout:1000}),'ready');
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>waitForBuffer({target:5,read:()=>0,timeout:1000,signal:controller.signal}),/Cancelado/);
});
// Deterministic transport + clock: every read advances the injected clock, so the
// measured Mbps of a test is a fact, not a timing race.
function fakeClock() { let value = 0; return { now: () => value, advance: ms => { value += ms; } }; }
function fakeTransport({ chunks = [], status = 200, latency = 100, advance = 100, clock, error, body = true }) {
  return async () => {
    clock.advance(latency);
    if (error) throw error;
    let index = 0;
    return { status, body: body ? { getReader: () => ({
      read: async () => { if (index >= chunks.length) return { done: true }; clock.advance(advance); return { done: false, value: new Uint8Array(chunks[index++]) }; },
      cancel: async () => {}
    }) } : undefined };
  };
}
test('the measurement skips the warm-up, stops at the byte budget and reports latency',async()=>{
  const clock=fakeClock();
  const budget={...speedBudget,warmupBytes:100,measureBytes:300,minMs:0,maxMs:10000,subWindowMs:100,timeoutMs:8000};
  const result=await measureSource('https://fixture.example/clip.mp4',{request:fakeTransport({chunks:[100,100,100,100,100],clock,advance:100,latency:100}),budget,now:clock.now});
  assert.equal(result.ok,true);assert.equal(result.failure,null);
  assert.equal(result.bytes,300);assert.equal(result.ms,200);assert.equal(result.latencyMs,100);
  assert.equal(result.mbps,0.012);assert.equal(formatMbps(result.mbps),'0,0 Mbps');assert.equal(formatLatency(result.latencyMs),'100 ms');
  // 300 bytes in 200 ms: three sub-windows of 100 ms, each moving 100 bytes.
  assert.deepEqual(result.subWindows,[0.008,0.008]);
});
test('the window, the status code and the body decide the failure text',async()=>{
  const clock=fakeClock();
  const windowed={...speedBudget,warmupBytes:0,measureBytes:1000000,minMs:500,maxMs:1000,subWindowMs:200,timeoutMs:8000};
  const long=await measureSource('https://fixture.example/clip.mp4',{request:fakeTransport({chunks:Array.from({length:20},()=>100),clock,advance:200}),budget:windowed,now:clock.now});
  assert.equal(long.ok,true);assert.equal(long.bytes,600); // stopped by the window, not by the budget
  assert.equal(await measureSource('magnet:?xt=urn:btih:X',{request:fakeTransport({clock}),now:clock.now}).then(r=>r.failure),'a fonte não é um link HTTP(S) direto');
  assert.equal((await measureSource('https://x/y.mp4',{request:fakeTransport({status:404,clock}),now:clock.now})).failure,'HTTP 404');
  assert.equal((await measureSource('https://x/y.mp4',{request:fakeTransport({body:false,clock}),now:clock.now})).failure,'sem corpo na resposta');
  assert.equal((await measureSource('https://x/y.mp4',{request:fakeTransport({chunks:[],clock}),now:clock.now})).failure,'nenhum byte recebido');
  assert.equal((await measureSource('https://x/y.mp4',{request:fakeTransport({chunks:[100],clock,error:new TypeError('network')}),now:clock.now})).failure,'falha de rede');
  const aborted=new DOMException('The operation was aborted.','AbortError');
  assert.equal((await measureSource('https://x/y.mp4',{request:fakeTransport({chunks:[100],clock,error:aborted}),now:clock.now})).failure,'tempo esgotado');
});
test('a body that arrives in one block measures over the whole request and says so',async()=>{
  const clock=fakeClock();
  const budget={...speedBudget,warmupBytes:100,measureBytes:1000,minMs:0,maxMs:10000};
  const single=await measureSource('https://fixture.example/clip.mp4',{request:fakeTransport({chunks:[300],clock,advance:0,latency:100}),budget,now:clock.now});
  assert.equal(single.ok,true);assert.equal(single.bytes,200);assert.equal(single.approximate,true);
  assert.equal(single.ms,100); // no measured window of its own: the request time is used
  assert.equal(single.mbps,0.016);assert.equal(formatSpeed(single).startsWith('~'),true);
  // A body that never passes the warm-up cannot be measured at all.
  const short=await measureSource('https://fixture.example/clip.mp4',{request:fakeTransport({chunks:[50],clock}),budget,now:clock.now});
  assert.equal(short.ok,false);assert.equal(short.failure,'nenhum byte recebido');assert.equal(short.bytes,0);
});

test('cancelling the screen aborts the measurement instead of reporting a speed',async()=>{
  const clock=fakeClock();
  const controller=new AbortController();
  const request=async (url,options)=>{controller.abort();options.signal.dispatchEvent(new Event('abort'));throw new DOMException('Cancelado','AbortError');};
  await assert.rejects(()=>measureSource('https://x/y.mp4',{request,signal:controller.signal,now:clock.now}),/Cancelado/);
});
test('the sweep measures a bounded pool and keeps a result per source',async()=>{
  const clock=fakeClock();
  const budget={...speedBudget,warmupBytes:0,measureBytes:200,minMs:0,maxMs:10000};
  const entries=[1,2,3,4,5,6].map(index=>({key:`s${index}`,url:`https://fixture.example/${index}.mp4`}));
  const seen=[];
  const results=await measureSources(entries,{budget,now:clock.now,concurrency:1,onResult:(key,result)=>{seen.push(key);assert.ok(result);},request:async url=>{
    clock.advance(50);
    const index=Number(new URL(url).pathname.match(/(\d+)/)[1]);
    let sent=0;
    return { status:200, body:{ getReader:()=>({ read:async()=>{ if(sent>=2)return{done:true}; sent++; clock.advance(100); return {done:false,value:new Uint8Array(index*20)}; }, cancel:async()=>{} }) } };
  }});
  assert.equal(results.size,budget.maxSources); // maxSources caps the run
  assert.deepEqual([...results.keys()],['s1','s2','s3','s4']);
  assert.deepEqual(seen,['s1','s2','s3','s4']);
  // One source at a time with the same clock: a source that delivers twice the bytes
  // per chunk measures a higher rate.
  assert.ok(results.get('s2').mbps > results.get('s1').mbps);
  assert.ok(results.get('s2').bytes >= results.get('s1').bytes);
  assert.ok(Array.isArray(results.get('s1').subWindows)); // the series itself is unit-tested below
  assert.equal(results.get('s4').ok,true);
});
test('helpers format and bucket the measurement like the fork reports it',()=>{
  assert.equal(mbpsFrom(1024*1024,1000),8.388608);assert.equal(mbpsFrom(0,1000),0);assert.equal(mbpsFrom(100,0),0);
  assert.equal(formatMbps(8.388608),'8,4 Mbps');assert.equal(formatMbps(42.2),'42 Mbps');assert.equal(formatMbps(0),'sem medição');
  assert.equal(formatSpeed({mbps:9.44,latencyMs:230}),'9,4 Mbps · 230 ms');
  assert.equal(formatSpeed({mbps:9.44,latencyMs:230,approximate:true}),'~9,4 Mbps · 230 ms');
  assert.equal(formatSpeed({mbps:0,failure:'HTTP 403'}),'HTTP 403');assert.equal(formatSpeed(null),'');
  assert.deepEqual(speedRequestHeaders({warmupBytes:100,measureBytes:200}),{Range:'bytes=0-299','Cache-Control':'no-store'});
  assert.deepEqual(subWindowRates([{at:0,bytes:0},{at:100,bytes:100},{at:200,bytes:250}],100),[0.008,0.012]);
  assert.deepEqual(subWindowRates([{at:0,bytes:0}],100),[]);assert.deepEqual(subWindowRates(null,100),[]);
});

