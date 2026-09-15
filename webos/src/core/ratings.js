// SPDX-License-Identifier: GPL-3.0-only
// MDBListRepository.getRating is a read-only POST lookup, not a user rating write.
import {getJSON,mapLimit} from './addons.js';
export const ratingProviders=Object.freeze([
 ['trakt','Trakt','mdblist_trakt.svg'],['imdb','IMDb','imdb_logo_2016.svg'],['tmdb','TMDB','mdblist_tmdb.svg'],['letterboxd','Letterboxd','mdblist_letterboxd.svg'],['mal','MyAnimeList','mdblist_mal.svg'],['tomatoes','Rotten Tomatoes','mdblist_tomatoes.svg'],['audience','Rotten Tomatoes — público','mdblist_audience.png'],['metacritic','Metacritic','mdblist_metacritic.png']
].map(([id,label,icon])=>({id,label,icon})));
const known=ratingProviders.map(p=>p.id),storageKey='nuvio-fork.webos.ratings.v1';
export function readRatingsSettings(storage){try{const x=JSON.parse(storage.getItem(storageKey));return {key:typeof x?.key==='string'?x.key.slice(0,128):'',enabled:x?.enabled===true,providers:Array.isArray(x?.providers)?known.filter(id=>x.providers.includes(id)):[...known]};}catch{return {key:'',enabled:false,providers:[...known]};}}
export function saveRatingsSettings(storage,value){const key=value.key.trim();if(key && !/^[A-Za-z0-9_-]{8,128}$/.test(key))throw Error('Informe uma chave de API MDBList válida.');storage.setItem(storageKey,JSON.stringify({key,enabled:Boolean(value.enabled && key),providers:known.filter(id=>value.providers.includes(id))}));}
export function ratingIdentity(meta) {
 if(!['movie','series'].includes(meta?.type))return null;
 const imdb=[meta.id,meta.imdb_id].find(x=>typeof x==='string' && /^tt\d+$/.test(x));if(imdb)return {id:imdb,provider:'imdb',type:meta.type==='series'?'show':'movie'};
 const tmdb=meta.id?.match(/^tmdb:(\d+)$/)?.[1] || meta.tmdbId;if(/^\d+$/.test(String(tmdb)) && Number.isSafeInteger(Number(tmdb)) && Number(tmdb)>0)return {id:String(Number(tmdb)),provider:'tmdb',type:meta.type==='series'?'show':'movie'};
 return null;
}
export function validRating(value){return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100?value:null;}
export function ratingText(provider,value,origin='MDBList') {if(origin==='TMDB')return String(Math.trunc(value*10));return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:['imdb','tmdb','letterboxd'].includes(provider)?1:0,maximumFractionDigits:1}).format(value);}
export function createRatingsClient({settings,request=getJSON}={}) {
 const cache=new Map();let generation=0;
 const configured=()=>{const s=settings();return Boolean(s.enabled && s.key);};
 const clear=()=>{generation++;cache.clear();};
 async function ratings(meta,signal,{refresh=false}={}) {
  const config=settings(),identity=ratingIdentity(meta),revision=JSON.stringify(config),epoch=generation;
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  if(!configured())return {values:{},failed:[],disabled:true};
  if(!identity)return {values:{},failed:[],unresolved:true};
  const results=await mapLimit(config.providers.filter(id=>known.includes(id)),async provider=>{
   if(signal?.aborted || epoch!==generation || revision!==JSON.stringify(settings()))throw new DOMException('Cancelado','AbortError');
   const cacheKey=JSON.stringify([revision,identity,provider]),hit=cache.get(cacheKey);if(!refresh && hit && Date.now()-hit.at<1800000)return {provider,value:hit.value};
   try {
    const url=new URL(`https://api.mdblist.com/rating/${identity.type}/${provider}`);url.searchParams.set('apikey',config.key);
    const data=await request(url.href,{signal,timeout:8000,method:'POST',body:{ids:[identity.id],provider:identity.provider}});
    if(signal?.aborted || epoch!==generation || revision!==JSON.stringify(settings()))throw new DOMException('Cancelado','AbortError');
    if(!Array.isArray(data?.ratings) || data.ratings.length>1)throw Error('Resposta inválida.');
    const row=data.ratings[0];if(row?.provider_id!=null && String(row.provider_id)!==identity.id)throw Error('Identidade diferente.');
    const value=validRating(row?.rating);
    cache.set(cacheKey,{value,at:Date.now()});while(cache.size>128)cache.delete(cache.keys().next().value);
    return {provider,value};
   }catch(error){if(signal?.aborted || epoch!==generation || revision!==JSON.stringify(settings()))throw new DOMException('Cancelado','AbortError');return {provider,error:true};}
  },signal,3);
  if(signal?.aborted || epoch!==generation || revision!==JSON.stringify(settings()))throw new DOMException('Cancelado','AbortError');
  const values={},failed=[];for(const {value}of results){if(value?.error)failed.push(value.provider);else if(value?.value!==null && value?.value!==undefined)values[value.provider]=value.value;}
  return {values,failed};
 }
 return {configured,ratings,clear};
}
