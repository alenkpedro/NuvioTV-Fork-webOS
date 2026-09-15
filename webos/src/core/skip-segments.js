// SPDX-License-Identifier: GPL-3.0-only
// SkipIntroApi, SkipIntroRepository and SkipIntroVisibilityRules @ 45e0984.
import {requestSegmentService} from './segment-service.js';
import {getJSON} from './addons.js';
export function segmentIdentity(context){
 if(context.meta?.type!=='series')return null;
 const imdb=[context.id?.split(':')[0],context.meta.imdb_id,context.meta.imdbId,context.meta.id].find(id=>/^tt\d+$/.test(id || ''));
 const {season,episode}=context.episode || {};return imdb && Number.isInteger(season)&&season>=0&&Number.isInteger(episode)&&episode>0?{imdb_id:imdb,season,episode}:null;
}
export function normalizeSegments(data,identity){
 if(!data || (data.imdb_id && data.imdb_id!==identity.imdb_id) || (data.season!=null && data.season!==identity.season) || (data.episode!=null && data.episode!==identity.episode))return [];
 return ['intro','recap','outro'].flatMap(type=>{const v=data[type];if(!v)return [];const start=typeof v.start_sec==='number'?v.start_sec:typeof v.start_ms==='number'?v.start_ms/1000:NaN,end=typeof v.end_sec==='number'?v.end_sec:typeof v.end_ms==='number'?v.end_ms/1000:NaN;return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=86400?[{type,start,end}]:[];});
}
export const activeSegment=(items,time,duration)=>Number.isFinite(duration)?items.find(v=>time>=v.start&&time<v.end&&v.end<=duration+1)||null:null;
const cache=new Map();
export async function fetchSegments(context,signal,request=getJSON){
 const identity=segmentIdentity(context);if(!identity)return [];const key=JSON.stringify(identity);const saved=cache.get(key);if(saved&&Date.now()-saved.at<3600000)return saved.items;
 const u=new URL('https://api.introdb.app/segments');for(const [k,v]of Object.entries(identity))u.searchParams.set(k,v);
 const data=globalThis.PalmServiceBridge && request===getJSON?await requestSegmentService(identity,signal):await request(u.href,{signal,timeout:15000});if(signal?.aborted)return [];
 const items=normalizeSegments(data,identity);if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(key,{items,at:Date.now()});return items;
}
