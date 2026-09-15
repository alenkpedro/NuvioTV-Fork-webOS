import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkURL,localizedLogo,enrichPlayerMetadata} from '../src/core/player-artwork.js';
import {createMetadataClient} from '../src/core/metadata.js';
import {readPlayback} from '../src/core/playback.js';
test('artwork keeps addon fallback and rejects unsafe or empty logos',()=>{
 const meta={logo:'https://addon.test/logo.png',description:'Original'};
 enrichPlayerMetadata(meta,{logo:null,description:'New'});assert.equal(meta.logo,'https://addon.test/logo.png');assert.equal(meta.description,'Original');
 enrichPlayerMetadata(meta,{logo:'https://image.tmdb.org/logo.png'});assert.equal(meta.fallbackLogo,'https://addon.test/logo.png');
 for(const value of ['javascript:alert(1)','file:///logo','https://user:pass@host/logo',null,''])assert.equal(artworkURL(value),null);
});
test('localized title logos follow region, language, English and neutral fallback in the fork order',()=>{
 const images=[{file_path:'/neutral.png',iso_639_1:null},{file_path:'/en.png',iso_639_1:'en'},{file_path:'/pt-PT.png',iso_639_1:'pt',iso_3166_1:'PT'},{file_path:'/pt.png',iso_639_1:'pt'},{file_path:'/br.png',iso_639_1:'pt',iso_3166_1:'BR'}];
 assert.equal(localizedLogo(images,'pt-BR'),'/br.png');assert.equal(localizedLogo(images.slice(0,4),'pt-BR'),'/pt.png');assert.equal(localizedLogo(images.slice(0,3),'pt-BR'),'/pt-PT.png');assert.equal(localizedLogo(images,'es-ES'),'/en.png');assert.equal(localizedLogo([{file_path:'https://evil.test/logo'}]),null);
});
test('TMDB title images are requested with language fallbacks and mapped without extra API calls',async()=>{
 const calls=[],client=createMetadataClient({settings:()=>({key:'a'.repeat(32),language:'pt-BR'}),request:async raw=>{calls.push(new URL(raw));return {id:1,title:'Example',images:{logos:[{file_path:'/logo.png',iso_639_1:'pt'}]}};}});
 const data=await client.detail({id:'tmdb:1',type:'movie'});assert.equal(data.meta.logo,'https://image.tmdb.org/t/p/w500/logo.png');assert.equal(calls.length,1);assert.match(calls[0].searchParams.get('append_to_response'),/images/);assert.equal(calls[0].searchParams.get('include_image_language'),'pt,en,null');
});
test('pause overlay is opt-in like the Android fork and validates stored values',()=>{
 assert.equal(readPlayback().pauseOverlay,false);assert.equal(readPlayback({pauseOverlay:true}).pauseOverlay,true);assert.equal(readPlayback({pauseOverlay:'true'}).pauseOverlay,false);
});
