// SPDX-License-Identifier: GPL-3.0-only
import {ratingProviders,readRatingsSettings,saveRatingsSettings,ratingText,validRating} from './core/ratings.js';
export function installRatings(ctx,meta) {
 const {main,el,button,signal,ratings,textDialog}=ctx;
 const slot=main.querySelector('.detail-source-space');if(!slot)return {update:()=>{}};
 const row=el('div',{class:'detail-ratings','aria-label':'Avaliações'});slot.append(row);
 const raw=typeof meta.imdbRating==='string' && /^\d+(?:\.\d+)?$/.test(meta.imdbRating)?Number(meta.imdbRating):meta.imdbRating;
 let base=validRating(raw)!==null && raw<=10?{imdb:{value:raw,origin:'Addon'}}:{},remote={},failed=[],busy=false,lastKey='',controller;
 const entry=()=>readRatingsSettings(localStorage);
 signal.addEventListener('abort',()=>controller?.abort(),{once:true});
 function draw(){const focused=row.contains(document.activeElement)?document.activeElement.dataset.focus:null,scroll=row.scrollLeft,config=entry();
  const values={...base,...Object.fromEntries(Object.entries(remote).map(([id,value])=>[id,{value,origin:'MDBList'}]))};
  const visible=ratingProviders.filter(p=>values[p.id] && (!ratings.configured() || config.providers.includes(p.id)));
  row.replaceChildren(...visible.map(p=>{const r=values[p.id],score=ratingText(p.id,r.value,r.origin);return button([el('img',{src:`assets/ratings/${p.icon}`,alt:''}),el('span',{},score)],()=>textDialog(p.label,`${p.label}: ${score}\nFonte: ${r.origin==='Addon'?'addon do catálogo':r.origin}${r.origin==='TMDB'?'\nNota TMDB convertida de 0–10 para 0–100, como no fork.':''}`),{'aria-label':`${p.label}: ${score}`,class:'rating-item','data-focus':`rating-${p.id}`});}));
  if(failed.length)row.append(button('Avaliações indisponíveis',()=>{textDialog('Avaliações',`Não foi possível consultar: ${failed.map(id=>ratingProviders.find(p=>p.id===id)?.label || id).join(', ')}. As notas disponíveis foram mantidas. Confira a chave e os limites da sua conta MDBList em Ajustes → Integrações.`);},{class:'rating-warning','data-focus':'rating-error'}),button('Tentar novamente',()=>{if(!busy)load(meta,true);},{'aria-disabled':String(busy),'aria-label':'Tentar avaliações novamente',class:'rating-warning','data-focus':'rating-retry'}));
  row.setAttribute('aria-busy',String(busy));
  const original=main.querySelector('.hero-meta .imdb-rating');if(original)original.hidden=visible.some(p=>p.id==='imdb') || (ratings.configured() && !config.providers.includes('imdb'));
  if(focused){([...row.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focused) || row.querySelector('button') || main.querySelector('.detail-actions button'))?.focus({preventScroll:true});row.scrollLeft=scroll;}
 }
 async function load(next,refresh=false) {
  meta=next;if(!ratings.configured()){draw();return;}
  const key=JSON.stringify([meta.id,meta.type]);if(!refresh && key===lastKey)return;lastKey=key;controller?.abort();const active=controller=new AbortController();busy=true;draw();
  try{const result=await ratings.ratings(meta,active.signal,{refresh});if(signal.aborted || active.signal.aborted)return;for(const p of entry().providers)if(!result.failed.includes(p))delete remote[p];remote={...remote,...result.values};failed=result.failed;if(result.unresolved)failed=['Identificação do título'];}
  catch{if(!signal.aborted && !active.signal.aborted)failed=['MDBList'];}
  finally{if(!signal.aborted && !active.signal.aborted){busy=false;draw();}}
 }
 row.addEventListener('focusin',()=>{main.scrollTop=0;},{signal});draw();load(meta);
 return {update(next,rating){if(typeof rating==='number')base.tmdb={value:rating,origin:'TMDB'};draw();load({...meta,...next});}};
}
export function ratingsSettingsScreen(ctx) {
 const {main,el,button,signal,ratings}=ctx,config=readRatingsSettings(localStorage);
 main.append(el('h1',{},'Avaliações MDBList'),el('p',{class:'muted'},'Consulte as notas das fontes que você escolher. Sua chave fica somente nesta TV. Esta integração não envia avaliações pessoais nem altera listas ou histórico.'));
 const input=el('input',{type:'password','aria-label':'Chave de API MDBList',autocomplete:'off',maxlength:128,placeholder:config.key?'Chave salva — deixe vazio para manter':'Chave de API MDBList'}),enabled=el('input',{type:'checkbox',checked:config.enabled,'aria-label':'Ativar avaliações MDBList'}),providers=el('fieldset',{class:'chips'},el('legend',{},'Fontes de avaliações')),status=el('p',{role:'status'});
 for(const p of ratingProviders)providers.append(el('label',{},el('input',{type:'checkbox',checked:config.providers.includes(p.id),'data-provider':p.id}),p.label));
 const save=button('Salvar',()=>{try{const key=input.value.trim() || config.key;if(enabled.checked && !key)throw Error('Informe sua chave MDBList para ativar as avaliações.');saveRatingsSettings(localStorage,{key,enabled:enabled.checked,providers:[...providers.querySelectorAll('input:checked')].map(n=>n.dataset.provider)});config.key=key;input.value='';input.placeholder=key?'Chave salva — deixe vazio para manter':'Chave de API MDBList';ratings.clear();status.textContent=enabled.checked?'Preferências salvas. As fontes serão consultadas ao abrir um título.':'Avaliações MDBList desativadas. Notas do addon e TMDB continuam disponíveis.';}catch(error){status.textContent=error.message;}});
 main.append(el('div',{class:'metadata-form'},el('label',{},'Chave da API',input),el('label',{},enabled,'Ativar avaliações MDBList'),providers,el('div',{class:'toolbar'},save,button('Remover chave',()=>{try{saveRatingsSettings(localStorage,{...readRatingsSettings(localStorage),key:'',enabled:false});config.key='';input.value='';input.placeholder='Chave de API MDBList';enabled.checked=false;ratings.clear();status.textContent='Chave removida desta TV.';}catch{status.textContent='Não foi possível alterar o armazenamento da TV.';}})),status));
}
export function collectionSection(ctx) {
 const {main,el,button,card,route,signal,metadata}=ctx,section=el('section',{class:'movie-collection',hidden:true});main.append(section);
 let reference=null,data=null,error='',loading=false,controller;
 signal.addEventListener('abort',()=>controller?.abort(),{once:true});
 section.addEventListener('focusin',()=>{main.scrollTop=Math.max(0,section.offsetTop-24);},{signal});
 function draw(preserve=false){const focused=preserve && section.contains(document.activeElement)?document.activeElement.dataset.focus:null,scroll=section.querySelector('.rail')?.scrollLeft || 0;
  const items=data?.items || [];let page=Math.min(route.collectionPage || 0,Math.max(0,Math.ceil(items.length/30)-1));route.collectionPage=page;
  section.hidden=!reference;section.replaceChildren(el('h2',{},data?.name || reference?.name || 'Coleção'));
  if(items.length)section.append(el('div',{class:'rail related-rail collection-rail'},items.slice(page*30,(page+1)*30).map(m=>card({...m,poster:m.background || m.poster},null,null,'collection',{portrait:true}))));
  else section.append(el('p',{role:'status',class:'muted'},loading?'Carregando coleção…':error || 'Nenhum filme disponível nesta coleção.'));
  if(error)section.append(el('p',{class:'muted',role:'status'},items.length?'Não foi possível atualizar. Coleção anterior preservada.':error));
  const move=delta=>{route.collectionPage=page+delta;draw();section.querySelector('.card')?.focus();};
  section.append(el('div',{class:'toolbar'},...(items.length>30?[button('Anteriores',()=>move(-1),{disabled:page===0}),el('span',{class:'muted'},`${page*30+1}–${Math.min((page+1)*30,items.length)} de ${items.length}`),button('Próximos',()=>move(1),{disabled:(page+1)*30>=items.length})]:[]),button(error?'Tentar coleção novamente':'Atualizar coleção',()=>{if(!loading)load(reference,true);},{'aria-disabled':String(loading),'data-focus':'collection-refresh'})));
  if(focused){[...section.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focused)?.focus({preventScroll:true});const rail=section.querySelector('.rail');if(rail)rail.scrollLeft=scroll;}
 }
 async function load(next,refresh=false){if(!next)return;if(reference?.id===next.id && data && !refresh)return;reference=next;controller?.abort();const active=controller=new AbortController();loading=true;error='';draw(true);
  try{const result=await metadata.collection(reference,active.signal,{refresh});if(!signal.aborted && !active.signal.aborted)data=result;}
  catch(e){if(!signal.aborted && !active.signal.aborted)error=e.message;}
  finally{if(!signal.aborted && !active.signal.aborted){loading=false;draw(true);}}
 }
 return {load};
}
