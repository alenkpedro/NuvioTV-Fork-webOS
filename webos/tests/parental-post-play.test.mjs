import test from 'node:test';
import assert from 'node:assert/strict';
import {imdbId,resolveSeverity,parentalWarnings,parentalEndpoint,fetchParentalGuide,parentalMaxWarnings,parentalCacheLimit,parentalCacheSize,clearParentalCache} from '../src/core/parental-guide.js';
import {postPlayMax,postPlayReason,postPlayPrefetch,shouldShowPostPlay,stepRecommendation,boundedRecommendations} from '../src/core/post-play.js';
import {readPlayback,postPlayThresholdRange} from '../src/core/playback.js';
test('parental guide resolves the show id and rejects ids the API cannot answer',()=>{
  assert.equal(imdbId('tt0133093'),'tt0133093');assert.equal(imdbId('tt0133093:2:5'),'tt0133093');assert.equal(imdbId(' tt0133093 '),'tt0133093');
  for(const value of ['tmdb:603','',null,'tt12','0133093','tt0133093a'])assert.equal(imdbId(value),'');
  assert.equal(parentalEndpoint('tt0133093'),'https://api.tiffara.com/titles/tt0133093/parentsGuide');
});
test('parental severity follows the highest vote and yields to "none"',()=>{
  // Matrix, as served by the API: mild wins over none, moderate dominates Violence.
  assert.equal(resolveSeverity([{severityLevel:'none',voteCount:534},{severityLevel:'mild',voteCount:576},{severityLevel:'moderate',voteCount:60},{severityLevel:'severe',voteCount:49}]),'mild');
  assert.equal(resolveSeverity([{severityLevel:'none',voteCount:18},{severityLevel:'mild',voteCount:106},{severityLevel:'moderate',voteCount:416},{severityLevel:'severe',voteCount:75}]),'moderate');
  assert.equal(resolveSeverity([{severityLevel:'none',voteCount:900},{severityLevel:'severe',voteCount:12}]),'');
  assert.equal(resolveSeverity([{severityLevel:'none',voteCount:3}]),'');assert.equal(resolveSeverity([{severityLevel:'mild',voteCount:0}]),'');
  assert.equal(resolveSeverity([]),'');assert.equal(resolveSeverity(undefined),'');
  // Equal votes keep the first entry, like the fork's maxByOrNull.
  assert.equal(resolveSeverity([{severityLevel:'severe',voteCount:5},{severityLevel:'mild',voteCount:5}]),'severe');
});
test('parental warnings keep the fork order by severity, cap at five and ignore unknown categories',()=>{
  const payload={parentsGuide:[
    {category:'FRIGHTENING_INTENSE_SCENES',severityBreakdowns:[{severityLevel:'mild',voteCount:9}]},
    {category:'SEXUAL_CONTENT',severityBreakdowns:[{severityLevel:'moderate',voteCount:9}]},
    {category:'VIOLENCE',severityBreakdowns:[{severityLevel:'severe',voteCount:9}]},
    {category:'PROFANITY',severityBreakdowns:[{severityLevel:'none',voteCount:40},{severityLevel:'mild',voteCount:2}]},
    {category:'ALCOHOL_DRUGS',severityBreakdowns:[{severityLevel:'moderate',voteCount:4}]},
    {category:'FUTURE_CATEGORY',severityBreakdowns:[{severityLevel:'severe',voteCount:99}]}
  ]};
  assert.deepEqual(parentalWarnings(payload),[
    {key:'violence',label:'Violência',severity:'severe',severityLabel:'Intenso'},
    {key:'nudity',label:'Nudez',severity:'moderate',severityLabel:'Moderado'},
    {key:'alcohol',label:'Drogas/Álcool',severity:'moderate',severityLabel:'Moderado'},
    {key:'frightening',label:'Conteúdo Assustador',severity:'mild',severityLabel:'Leve'}
  ]);
  assert.equal(parentalWarnings(null).length,0);assert.equal(parentalWarnings({parentsGuide:[]}).length,0);
  assert.ok(parentalWarnings(payload).length<=parentalMaxWarnings);
});
test('parental fetch validates the response and never throws on unsupported ids',async()=>{
  const calls=[];const request=async(url,options)=>{calls.push(new URL(url).pathname);assert.equal(options.timeout,10000);return {parentsGuide:[{category:'VIOLENCE',severityBreakdowns:[{severityLevel:'severe',voteCount:7}]}]};};
  const warnings=await fetchParentalGuide('tt0133093:1:1',{request});
  assert.deepEqual(warnings.map(w=>w.label),['Violência']);assert.deepEqual(calls,['/titles/tt0133093/parentsGuide']);
  assert.deepEqual(await fetchParentalGuide('tmdb:603',{request:()=>{throw Error('must not run');}}),[]);
  clearParentalCache(); // the cache would hide the abort path for an id already resolved
  await assert.rejects(fetchParentalGuide('tt0133093',{request:async()=>{const error=Error('aborted');error.name='AbortError';throw error;}}),{name:'AbortError'});
});
test('parental guides are cached per title and the cache stays bounded',async()=>{
  clearParentalCache();
  let calls=0;
  const request=async url=>{calls++;return {parentsGuide:[{category:'VIOLENCE',severityBreakdowns:[{severityLevel:'moderate',voteCount:20}]}]};};
  await fetchParentalGuide('tt0000001',{request});await fetchParentalGuide('tt0000001:1:1',{request});
  assert.equal(calls,1);assert.equal(parentalCacheSize(),1);
  assert.deepEqual((await fetchParentalGuide('tt0000001',{request})).map(w=>w.label),['Violência']);
  for(let i=2;i<=parentalCacheLimit+4;i++)await fetchParentalGuide(`tt${String(i).padStart(7,'0')}`,{request});
  assert.equal(parentalCacheSize(),parentalCacheLimit);
  clearParentalCache();assert.equal(parentalCacheSize(),0);
});
test('post-play timing uses the movie threshold and the next-episode threshold for series',()=>{
  const movie=readPlayback({postPlayRecommendations:true});
  assert.equal(shouldShowPostPlay({},{type:'movie',position:50,duration:100}),false); // opt-in setting
  assert.equal(shouldShowPostPlay(movie,{type:'movie',position:89,duration:100}),false);
  assert.equal(shouldShowPostPlay(movie,{type:'movie',position:90,duration:100}),true);
  assert.equal(shouldShowPostPlay(movie,{type:'movie',position:100,duration:100}),true);
  assert.equal(shouldShowPostPlay(movie,{type:'movie',position:5,duration:0}),false);
  const threshold=readPlayback({postPlayRecommendations:true,postPlayMovieThreshold:80});
  assert.equal(shouldShowPostPlay(threshold,{type:'movie',position:79,duration:100}),false);
  assert.equal(shouldShowPostPlay(threshold,{type:'movie',position:80,duration:100}),true);
  // Episodes follow PlayerNextEpisodeRules: 99% by default or the credits interval.
  assert.equal(shouldShowPostPlay(movie,{type:'series',position:50,duration:100}),false);
  assert.equal(shouldShowPostPlay(movie,{type:'series',position:99,duration:100}),true);
  assert.equal(shouldShowPostPlay(movie,{type:'series',position:50,duration:100,skipIntervals:[{type:'outro',start:40,end:60}]}),true);
  assert.equal(shouldShowPostPlay(movie,{type:'series',position:20,duration:100,skipIntervals:[{type:'intro',start:10,end:30}]}),false);
});
test('post-play prefetch, reason line and carousel stay bounded',()=>{
  const settings=readPlayback({postPlayRecommendations:true,postPlayMovieThreshold:90});
  assert.equal(postPlayPrefetch(settings,{type:'movie',position:84,duration:100}),false);
  assert.equal(postPlayPrefetch(settings,{type:'movie',position:85,duration:100}),true);
  assert.equal(postPlayPrefetch(settings,{type:'series',position:99,duration:100}),false);
  assert.equal(postPlayPrefetch(readPlayback({}),{type:'movie',position:99,duration:100}),false);
  assert.equal(postPlayReason('Horizonte de teste'),'Porque você assistiu a Horizonte de teste');
  assert.equal(postPlayReason('  '),'Recomendado para você');assert.equal(postPlayReason(undefined),'Recomendado para você');
  assert.equal(stepRecommendation(0,1,4),1);assert.equal(stepRecommendation(3,1,4),0);assert.equal(stepRecommendation(0,-1,4),3);
  assert.equal(stepRecommendation(0,1,0),-1);assert.equal(stepRecommendation(0,1,undefined),-1);
  assert.equal(boundedRecommendations(Array.from({length:9},(_,i)=>i)).length,postPlayMax);
  assert.deepEqual(boundedRecommendations('nope'),[]);
});
test('playback settings validate the new parental and post-play keys',()=>{
  const defaults=readPlayback();
  assert.equal(defaults.parentalGuide,true);assert.equal(defaults.postPlayRecommendations,false);assert.equal(defaults.postPlayMovieThreshold,90);
  assert.deepEqual(postPlayThresholdRange,[80,100]);
  assert.equal(readPlayback({parentalGuide:'true'}).parentalGuide,true); // non-booleans are ignored
  assert.equal(readPlayback({postPlayRecommendations:1}).postPlayRecommendations,false);
  assert.equal(readPlayback({postPlayMovieThreshold:70}).postPlayMovieThreshold,80);
  assert.equal(readPlayback({postPlayMovieThreshold:140}).postPlayMovieThreshold,100);
  assert.equal(readPlayback({postPlayMovieThreshold:92.6}).postPlayMovieThreshold,93);
  assert.equal(readPlayback({postPlayMovieThreshold:'95'}).postPlayMovieThreshold,90);
});