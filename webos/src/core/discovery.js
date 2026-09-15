// SPDX-License-Identifier: GPL-3.0-only
// SearchViewModel / CatalogDescriptorExtensions / SearchHistoryDataStore.
import genreLabels from './genre-labels.json' with {type:'json'};
export const genreLabel=value=>genreLabels[String(value).toLowerCase().trim().replaceAll('-',' ')] || value;
import {extraOptions} from './addons.js';
export const catalogKey=(addon,catalog)=>JSON.stringify([addon.url,catalog.type,catalog.id]);
export const typeLabel=type=>({movie:'Filmes',series:'Séries',anime:'Anime',tv:'TV',channel:'Canais'})[type] || type;
export function catalogEntries(addons) {
  const seen=new Set(),entries=[];
  for(const addon of addons)for(const catalog of addon.manifest.catalogs || []) {
    if(!catalog || typeof catalog.id!=='string' || typeof catalog.type!=='string')continue;
    const key=catalogKey(addon,catalog);if(seen.has(key))continue;seen.add(key);
    const extras=extraOptions(catalog),genre=extras.find(e=>e.name==='genre');
    entries.push({key,addon,catalog,extras,genres:(genre?.options || []).filter(g=>typeof g==='string' && g.length<=200),requiredGenre:genre?.isRequired===true});
  }
  return entries;
}
export function discoverEntries(addons) {return catalogEntries(addons).filter(e=>!e.extras.some(x=>x.name==='search' && x.isRequired));}
export function searchEntries(addons) {return catalogEntries(addons).filter(e=>e.extras.some(x=>x.name==='search') && !e.extras.some(x=>x.isRequired && !['search','skip'].includes(x.name)));}
export function skipStep(catalog) {
  if(Number.isSafeInteger(catalog.pageSize) && catalog.pageSize>0)return catalog.pageSize;
  const values=[...new Set((extraOptions(catalog).find(e=>e.name==='skip')?.options || []).map(x=>typeof x==='string' && /^\d+$/.test(x.trim())?Number(x):NaN).filter(x=>Number.isSafeInteger(x) && x>=0))].sort((a,b)=>a-b);
  return values.length>1?Math.min(...values.slice(1).map((v,i)=>v-values[i])):100;
}
export function selectDiscover(entries,saved={}) {
  const selected=entries.find(e=>e.key===saved.key) || entries.find(e=>e.catalog.type===saved.type) || entries[0];
  if(!selected)return {key:null,type:null,genre:null};
  const genre=selected.genres.includes(saved.genre)?saved.genre:selected.requiredGenre?selected.genres[0] || null:null;
  return {key:selected.key,type:selected.catalog.type,genre};
}
export function catalogExtras(entry,{genre,search,skip=0}={}) {
  const values={};if(genre)values.genre=genre;if(search)values.search=search;
  if(skip || entry.extras.some(e=>e.name==='skip' && e.isRequired))values.skip=skip;
  const missing=entry.extras.filter(e=>e.isRequired && values[e.name]==null);
  if(missing.length)throw Error(`Este catálogo exige um filtro ainda indisponível: ${missing.map(e=>e.name).join(', ')}.`);
  return values;
}
export function parseCatalogPage(data,type) {
  if(!Array.isArray(data?.metas))throw Error('O addon retornou um catálogo inválido.');
  if(data.metas.length>500)throw Error('Este catálogo excedeu o limite de 500 títulos por resposta da TV.');
  const seen=new Set(),items=[];
  for(const m of data.metas) {
    if(!m || typeof m.id!=='string' || !m.id || m.id.length>512)continue;
    const item={id:m.id,type:typeof m.type==='string'?m.type.slice(0,40):type,name:String(m.name || m.id).slice(0,300)};
    const key=JSON.stringify([item.type,item.id]);if(seen.has(key))continue;seen.add(key);
    for(const f of ['poster','background','fanart','logo','description','releaseInfo','imdbRating'])if(typeof m[f]==='string')item[f]=m[f].slice(0,f==='description'?2000:2048);
    if(Array.isArray(m.genres))item.genres=m.genres.filter(x=>typeof x==='string').slice(0,20);
    items.push(item);
  }
  if(JSON.stringify(items).length>1024*1024)throw Error('Metadados do catálogo excederam o limite de memória desta tela.');
  return {items,rawCount:data.metas.length};
}
export function rememberSearch(state,query) {
  const value=query.trim().slice(0,200);if(!value)return;
  const normalized=value.toLocaleLowerCase();
  state.recentSearches=[value,...(state.recentSearches || []).filter(q=>typeof q==='string' && !normalized.startsWith(q.toLocaleLowerCase()))].slice(0,8);
}
export function homeCatalogEntries(state) {
  const entries=catalogEntries(state.addons).filter(e=>!e.extras.some(x=>x.isRequired));
  const order=state.catalogOrder || [],hidden=new Set(state.hiddenHomeCatalogs || []);
  return entries.filter(e=>!hidden.has(e.key)).sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});
}
