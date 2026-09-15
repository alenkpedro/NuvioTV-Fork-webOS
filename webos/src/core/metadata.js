// SPDX-License-Identifier: GPL-3.0-only
// Contracts: MetaMapper, TmdbMetadataService and CastDetailScreen in the reference fork.
import {getJSON} from './addons.js';
const list=value=>Array.isArray(value)?value:[];
const str=(value,max=300)=>typeof value==='string'?value.trim().slice(0,max):'';
const positive=value=>/^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>0?Number(value):null;
export const imageURL=(path,size='w342')=>typeof path==='string' && /^\/[\w./-]+$/.test(path)?`https://image.tmdb.org/t/p/${size}${path}`:null;
export function youtubeId(value) {
  if(typeof value!=='string')return null;
  if(/^[\w-]{11}$/.test(value))return value;
  try {const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return null;const host=u.hostname.replace(/^www\./,'');const id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','m.youtube.com'].includes(host)?u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1]:null;return /^[\w-]{11}$/.test(id || '')?id:null;}catch{return null;}
}
export function trailers(meta) {
  const seen=new Set(),out=[];
  for(const item of [...list(meta.trailers),...list(meta.trailerStreams),...list(meta.trailerYtIds).map(ytId=>({ytId}))]) {
    const ytId=youtubeId(item?.ytId) || youtubeId(item?.source);if(!ytId || seen.has(ytId))continue;seen.add(ytId);
    out.push({ytId,name:str(item.name) || str(item.type) || 'Trailer',type:str(item.type,40),lang:str(item.lang,20),photo:`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`});if(out.length===20)break;
  }return out;
}
export function people(meta) {
  const extra=meta.app_extras || {},detailed=[...list(extra.directors).map(x=>({...x,character:'Director'})),...list(extra.writers).map(x=>({...x,character:'Writer'})),...list(extra.cast),...list(meta.castMembers)];
  const names=v=>(Array.isArray(v)?v:[v]).filter(x=>typeof x==='string').map(name=>({name}));
  const all=[...detailed,...names(meta.director).map(x=>({...x,character:'Director'})),...names(meta.writer || meta.writers).map(x=>({...x,character:'Writer'})),...names(meta.cast)];
  const seen=new Set();return all.filter(x=>str(x?.name)).map(x=>({name:str(x.name),character:str(x.character),photo:str(x.photo,2048),tmdbId:positive(x.tmdbId)})).filter(x=>{const key=x.name.toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Number(['Creator','Director','Writer'].includes(b.character))-Number(['Creator','Director','Writer'].includes(a.character))).slice(0,40);
}
export function preview(item,type) {
  const id=positive(item?.id),kind=type || (item?.media_type==='tv'?'series':item?.media_type==='movie'?'movie':null),name=str(item?.title || item?.name);
  if(!id || !kind || !name || item.adult===true)return null;
  const released=str(item.release_date || item.first_air_date,30);
  return {id:`tmdb:${id}`,tmdbId:id,type:kind,name,poster:imageURL(item.poster_path),background:imageURL(item.backdrop_path,'w780'),description:str(item.overview,3000),releaseInfo:released.slice(0,4),released};
}
export function collectionItems(data) {
  if(!Array.isArray(data?.parts))throw Error('O TMDB não retornou uma coleção válida.');
  if(data.parts.length>500)throw Error('Coleção grande demais para carregar na TV.');
  const seen=new Set();return data.parts.map(x=>preview(x,'movie')).filter(x=>x && !seen.has(x.id) && seen.add(x.id)).sort((a,b)=>(/^\d{4}-\d{2}-\d{2}$/.test(a.released) && Number.isFinite(Date.parse(a.released))?a.released:'9999').localeCompare(/^\d{4}-\d{2}-\d{2}$/.test(b.released) && Number.isFinite(Date.parse(b.released))?b.released:'9999'));
}
export function creditItems(data,preferCrew=false) {
  const cast=list(data?.cast),crew=list(data?.crew),out=[];
  for(const type of ['movie','tv']) {
    const a=cast.filter(x=>x?.media_type===type),b=crew.filter(x=>x?.media_type===type);
    out.push(...((preferCrew && b.length)?b:a.length?a:b).map(x=>preview(x)).filter(Boolean));
  }
  const seen=new Set();return out.filter(x=>{const k=x.type+x.id;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>(Number(b.releaseInfo)||0)-(Number(a.releaseInfo)||0)).slice(0,500);
}
export function readMetadataSettings(storage) {try {const value=JSON.parse(storage.getItem('nuvio-fork.webos.metadata.v1'));return {key:/^[a-f\d]{32}$/i.test(value?.key || '')?value.key:'',language:['pt-BR','en-US','es-ES'].includes(value?.language)?value.language:'pt-BR'};}catch{return {key:'',language:'pt-BR'};}}
export function saveMetadataSettings(storage,value) {if(value.key && !/^[a-f\d]{32}$/i.test(value.key))throw Error('Informe uma chave de API v3 do TMDB válida (32 caracteres).');storage.setItem('nuvio-fork.webos.metadata.v1',JSON.stringify({key:value.key,language:value.language}));}
export function createMetadataClient({settings,request=getJSON}={}) {
  const cache=new Map();let configuration='';
  const configured=()=>Boolean(settings().key);
  async function api(path,signal,params={},refresh=false) {
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    const config=settings();if(!config.key)throw Error('Configure o TMDB em Ajustes → Integrações para carregar estes dados.');
    const revision=JSON.stringify(config);if(configuration!==revision){cache.clear();configuration=revision;}
    const u=new URL(`https://api.themoviedb.org/3/${path}`);u.searchParams.set('api_key',config.key);u.searchParams.set('language',config.language);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
    const key=path+JSON.stringify(params),hit=cache.get(key);if(!refresh && hit && Date.now()-hit.at<300000)return JSON.parse(hit.json);
    let data;try{data=await request(u.href,{signal,timeout:8000});}catch(error){if(signal?.aborted)throw error;throw Error('Não foi possível carregar o TMDB. Verifique a chave e a conexão em Ajustes → Integrações.');}
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    const json=JSON.stringify(data);if(json.length>1048576)throw Error('Metadados grandes demais para a TV.');
    if(configuration===revision){cache.set(key,{at:Date.now(),json});while(cache.size>8 || [...cache.values()].reduce((n,v)=>n+v.json.length,0)>2097152)cache.delete(cache.keys().next().value);}
    return data;
  }
  async function resolve(meta,signal) {
    if(!['movie','series'].includes(meta.type))return null;
    const numeric=positive(meta.tmdbId) || positive(meta.id?.match(/^tmdb:(\d+)$/)?.[1]);if(numeric)return numeric;
    const imdb=/^tt\d+$/.test(meta.imdb_id || '')?meta.imdb_id:/^tt\d+$/.test(meta.id || '')?meta.id:null;if(!imdb)return null;
    const found=await api(`find/${imdb}`,signal,{external_source:'imdb_id'});return positive(list(found[meta.type==='series'?'tv_results':'movie_results'])[0]?.id);
  }
  async function detail(meta,signal) {
    const id=await resolve(meta,signal);if(!id)return null;const type=meta.type==='series'?'tv':'movie';
    const data=await api(`${type}/${id}`,signal,{append_to_response:`${type==='tv'?'aggregate_credits':'credits'},videos,recommendations,external_ids`});
    if(positive(data.id)!==id)throw Error('O TMDB retornou um título diferente do solicitado.');
    const credits=data.aggregate_credits || data.credits || {},crew=list(credits.crew).filter(x=>['Director','Writer','Screenplay','Creator'].includes(x?.job));
    const cast=[...list(data.created_by).map(x=>({...x,character:'Creator'})),...crew.map(x=>({...x,character:x.job==='Screenplay'?'Writer':x.job})),...list(credits.cast)];
    const members=cast.filter(x=>str(x?.name)).map(x=>({name:x.name,tmdbId:positive(x.id),character:x.character || list(x.roles).slice(0,3).map(r=>r.character).filter(Boolean).join(', '),photo:imageURL(x.profile_path,'w185')}));
    const videos=list(data.videos?.results).filter(x=>x?.site==='YouTube').sort((a,b)=>Number(b.official===true)-Number(a.official===true));
    const seen=new Set();const recommendations=list(data.recommendations?.results).map(x=>preview(x,meta.type)).filter(x=>x && x.tmdbId!==id && !seen.has(x.id) && seen.add(x.id)).slice(0,20);
    return {meta:{...preview(data,meta.type),id:/^tt\d+$/.test(data.imdb_id || data.external_ids?.imdb_id || '')?(data.imdb_id || data.external_ids.imdb_id):meta.id,tmdbId:id,runtime:data.runtime || list(data.episode_run_time)[0],genres:list(data.genres).map(x=>x.name).filter(Boolean),castMembers:people({castMembers:members}),trailers:trailers({trailers:videos.map(x=>({ytId:x.key,name:x.name,type:x.type,lang:x.iso_639_1}))})},recommendations,collection:meta.type==='movie' && positive(data.belongs_to_collection?.id)?{id:positive(data.belongs_to_collection.id),name:str(data.belongs_to_collection.name) || 'Coleção'}:null,rating:typeof data.vote_average==='number' && data.vote_average>=0 && data.vote_average<=10 && Number(data.vote_count)>0?data.vote_average:null};
  }
  async function person(member,signal) {
    if(!positive(member.tmdbId))throw Error('Este addon não informou a identificação da pessoa. Configure o TMDB e reabra os detalhes do título para completar o elenco.');
    const data=await api(`person/${member.tmdbId}`,signal,{append_to_response:'combined_credits'});if(positive(data.id)!==member.tmdbId)throw Error('Identificação da pessoa inválida.');
    let biography=str(data.biography,16000);if(!biography && settings().language!=='en-US'){try{biography=str((await api(`person/${member.tmdbId}`,signal,{language:'en-US'})).biography,16000);}catch(error){if(signal?.aborted)throw error;}}
    return {name:str(data.name) || member.name,photo:imageURL(data.profile_path),biography,birthday:str(data.birthday,20),deathday:str(data.deathday,20),placeOfBirth:str(data.place_of_birth),knownFor:str(data.known_for_department),items:creditItems(data.combined_credits,['Creator','Director','Writer'].includes(member.character))};
  }
  async function collection(reference,signal,{refresh=false}={}) {
    const id=positive(reference?.id);if(!id)throw Error('Identificação da coleção inválida.');
    const data=await api(`collection/${id}`,signal,{},refresh);if(positive(data?.id)!==id)throw Error('O TMDB retornou uma coleção diferente da solicitada.');
    return {id,name:str(data.name) || reference.name || 'Coleção',items:collectionItems(data)};
  }
  return {configured,detail,person,collection,clear:()=>cache.clear(),validate:signal=>api('configuration',signal)};
}
