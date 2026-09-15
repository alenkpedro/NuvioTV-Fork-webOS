// SPDX-License-Identifier: GPL-3.0-only
import {ratingProviders,readRatingsSettings,saveRatingsSettings,ratingText,validRating} from './core/ratings.js';
import {createSettingsKit} from './settings-kit.js';
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
 const {main,el,button,icon,toast,ratings}=ctx,kit=createSettingsKit({el,button,icon,toast}),config=readRatingsSettings(localStorage);
 const pane=el('div',{class:'settings-pane'});
 const grid=el('div',{class:'settings-workspace settings-workspace-single'},pane);
 function draw(){
  const input=el('input',{type:'text',inputmode:'text','aria-label':'Chave de API MDBList',autocomplete:'off',spellcheck:'false',maxlength:64,placeholder:config.key?'Chave salva — deixe vazio para manter':'Cole a chave (só letras e números)'}),
   counter=el('small',{class:'muted','aria-live':'polite'}),status=el('p',{role:'status'});
  const state=()=>readRatingsSettings(localStorage);
  const paintCounter=()=>{const value=input.value.trim();counter.textContent=value?`${value.length} caracteres`:'Nenhuma chave digitada.';};
  input.addEventListener('input',paintCounter);
  const save=button('Salvar',()=>{try{const key=input.value.trim()||state().key;if(!key&&state().enabled)throw Error('Informe sua chave MDBList para ativar as avaliações.');if(key&&!/^[A-Za-z0-9_-]{8,128}$/.test(key))throw Error('A chave da MDBList usa apenas letras, números, hífen e sublinhado (8 a 128 caracteres).');saveRatingsSettings(localStorage,{key,enabled:state().enabled,providers:state().providers});input.value='';input.placeholder=key?'Chave salva — deixe vazio para manter':'Cole a chave (só letras e números)';paintCounter();ratings.clear();status.textContent=state().enabled?'Preferências salvas. As fontes serão consultadas ao abrir um título.':'Avaliações MDBList desativadas. Notas do addon e TMDB continuam disponíveis.';}catch(error){status.textContent=error.message;}},{class:'primary'});
  const remove=button('Remover chave',()=>{try{saveRatingsSettings(localStorage,{key:'',enabled:false,providers:state().providers});input.value='';paintCounter();ratings.clear();draw();toast('Chave removida desta TV.');}catch{status.textContent='Não foi possível alterar o armazenamento da TV.';}});
  const providers=ratingProviders.map(provider=>kit.chip(provider.label,state().providers.includes(provider.id),()=>{
   const current=state(),list=new Set(current.providers);list.has(provider.id)?list.delete(provider.id):list.add(provider.id);
   saveRatingsSettings(localStorage,{...current,providers:[...list]});ratings.clear();draw();
  },`Mantém ${provider.label} nas notas`));
  pane.replaceChildren(kit.header('Avaliações MDBList','Notas de fontes externas, somente leitura. A chave fica nesta TV.'),
   kit.group('Ativação','Ligue as avaliações e guarde sua chave',
    kit.toggle('Ativar avaliações MDBList','Consulta as fontes escolhidas ao abrir um título',()=>state().enabled,value=>{saveRatingsSettings(localStorage,{...state(),enabled:value});ratings.clear();draw();}),
    kit.field({title:'Chave da API MDBList',subtitle:'Somente nesta TV; o app consulta apenas as notas públicas.',
     control:input,actions:[save,remove],hint:counter,status})),
   kit.group('Fontes de avaliações','Escolha quem pode responder',
    kit.choices('Fontes de avaliações',...providers)),
   kit.note('A integração é somente leitura: o port não envia avaliações pessoais nem altera listas ou histórico.'));
  paintCounter();
 }
 main.append(grid);
 draw();
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
