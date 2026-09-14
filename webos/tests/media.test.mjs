import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaTracks, selectAudioTrack, selectTextTrack, languageName } from '../src/core/media-tracks.js';
import { normalizeSubtitles, subtitleExtras, parseSubtitles, subtitleFrame, fetchSubtitles, discoverSubtitles, MAX_SUBTITLE_BYTES } from '../src/core/subtitles.js';
const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\nOlá <i>mundo</i> &amp; você\r\nsegunda linha\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\nSobreposição';
test('subtitle parser handles SRT/VTT, markup, overlaps and backward seeks', () => {
  const cues = parseSubtitles(srt);
  assert.equal(cues[0].text, 'Olá mundo & você\nsegunda linha');
  assert.deepEqual(subtitleFrame(cues, 0), {text:'',next:1});
  assert.equal(subtitleFrame(cues, 3.25).text, cues.map(c => c.text).join('\n'));
  assert.deepEqual(subtitleFrame(cues, 5), {text:'',next:Infinity});
  assert.equal(subtitleFrame(cues, 2).text, cues[0].text);
  assert.equal(parseSubtitles('WEBVTT\n\nNOTE ignored\nfoo\n\nidentifier\n00:01.000 --> 00:02.000 align:start\n&lt;img src=x&gt;')[0].text, '<img src=x>');
  for (const invalid of ['<html>oops</html>', '[Script Info]\nASS', 'PK\x03\x04zip', '00:61.000 --> 00:62.000\ninvalid', '00:03.000 --> 00:01.000\nbackwards']) assert.throws(() => parseSubtitles(invalid));
});
test('subtitle URLs are HTTP(S), deduplicated, and hash extras use supplied metadata only', () => {
  assert.equal(normalizeSubtitles([{url:'javascript:alert(1)'},{url:'https://user:pass@example.com/x'},{url:'https://example.com/a',lang:'por'},{url:'https://example.com/a'}]).length,1);
  assert.deepEqual(subtitleExtras({behaviorHints:{videoHash:'not-a-hash',videoSize:-1,filename:'movie.mkv'}}),{filename:'movie.mkv'});
  assert.deepEqual(subtitleExtras({behaviorHints:{videoHash:'0123456789abcdef',videoSize:123}}),{videoHash:'0123456789abcdef',videoSize:123});
});
test('subtitle downloads decode UTF16 and Windows1252 without sending credentials', async () => {
  for (const body of [Buffer.concat([Buffer.from([255,254]), Buffer.from(srt,'utf16le')]), Buffer.from(srt,'latin1')]) {
    const cues = await fetchSubtitles({url:'https://example.com/sub'}, undefined, async (_, opts) => {
      assert.equal(opts.credentials,'omit'); assert.equal(opts.referrerPolicy,'no-referrer'); assert.equal(opts.headers,undefined);
      return new Response(body);
    });
    assert.match(cues[0].text,/Olá/);
  }
});
test('subtitle download caps decoded response bytes, reports HTTP failures and honors cancellation', async () => {
  await assert.rejects(fetchSubtitles({url:'https://example.com/a'},undefined,async()=>new Response('x',{status:403})),/HTTP 403/);
  let cancelled=false;
  await assert.rejects(fetchSubtitles({url:'https://example.com/a'},undefined,async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(MAX_SUBTITLE_BYTES+1));},cancel(){cancelled=true;}}))),/muito grande/);
  assert.equal(cancelled,true);
  const c=new AbortController();
  await assert.rejects(fetchSubtitles({url:'https://example.com/a'},c.signal,async()=>{c.abort();return new Response(srt);}),{name:'AbortError'});
});
test('subtitle addon request preserves configured query, episode ID and partial failures', async t => {
  const urls=[]; t.mock.method(globalThis,'fetch',async(url,opts)=>{urls.push(String(url));assert.equal(opts.credentials,'omit');if(String(url).includes('broken')) throw Error('offline');return new Response(JSON.stringify({subtitles:[{url:'https://example.com/sub.vtt',lang:'por'}]}));});
  const addons=['ok','broken'].map(name=>({url:`https://example.com/${name}/config/manifest.json?token=fixture`,manifest:{name,resources:['subtitles'],types:['series']}}));
  const result=await discoverSubtitles(addons,{type:'series',id:'tt1:2:3',stream:{behaviorHints:{filename:'A & B.mkv'}}});
  assert.equal(result.failed,1);assert.equal(result.subtitles.length,1);
  assert.match(urls[0],/tt1%3A2%3A3\/filename=A%20%26%20B.mkv.json\?token=fixture/);
});
test('audio selection switches one track and rolls back ignored changes', () => {
  assert.deepEqual(mediaTracks({},'audio'),[]); assert.equal(languageName('pt_BR'),'Português (Brasil)');
  const tracks=[{label:'Original',language:'eng',enabled:true},{language:'por',enabled:false}];
  selectAudioTrack({audioTracks:tracks},tracks[1]);assert.deepEqual(tracks.map(t=>t.enabled),[false,true]);
  Object.defineProperty(tracks[0],'enabled',{get(){return false;},set(){}});
  assert.throws(()=>selectAudioTrack({audioTracks:tracks},tracks[0]),/não aceitou/);assert.equal(tracks[1].enabled,true);
});
test('subtitle selection ignores metadata tracks and verifies disabling as well as enabling', () => {
  const tracks=[{kind:'metadata',mode:'hidden'},{kind:'subtitles',mode:'disabled'},{kind:'captions',mode:'showing'}];
  selectTextTrack({textTracks:tracks},tracks[1]);assert.deepEqual(tracks.map(t=>t.mode),['hidden','showing','disabled']);
  selectTextTrack({textTracks:tracks});assert.equal(tracks[1].mode,'disabled');
  Object.defineProperty(tracks[1],'mode',{get(){return 'showing';},set(){}});
  assert.throws(()=>selectTextTrack({textTracks:tracks}),/não aceitou/);
});
