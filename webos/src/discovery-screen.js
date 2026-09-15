// SPDX-License-Identifier: GPL-3.0-only
import {getJSON,resourceURL,mapLimit} from './core/addons.js';
import {catalogEntries,discoverEntries,searchEntries,selectDiscover,catalogExtras,parseCatalogPage,skipStep,typeLabel,genreLabel,rememberSearch} from './core/discovery.js';
export function picker(ctx,title,value,options,selected,onSelect) {
  const {el,button,root,signal}=ctx;
  const trigger=button([el('small',{},title),el('span',{},value || 'Padrão'),el('span',{class:'picker-arrow','aria-hidden':'true'},'⌄')],()=>{
    const rect=trigger.getBoundingClientRect(),canvas=root.getBoundingClientRect(),scale=canvas.width/960;
    const shade=el('div',{class:'discover-picker-shade'}),dialog=el('div',{role:'dialog','aria-label':title,'aria-modal':'true',class:'discover-picker-menu'});
    Object.assign(dialog.style,{left:`${(rect.left-canvas.left)/scale}px`,top:`${Math.min((rect.bottom-canvas.top)/scale+4,200)}px`,width:`${rect.width/scale}px`});
    const onAbort=()=>shade.remove();
    const close=()=>{shade.remove();signal.removeEventListener('abort',onAbort);trigger.setAttribute('aria-expanded','false');if(trigger.isConnected)trigger.focus();};
    let optionPage=Math.max(0,Math.floor(options.findIndex(o=>o.value===selected)/100));
    const drawOptions=()=>{
      dialog.replaceChildren();
      for(const option of options.slice(optionPage*100,(optionPage+1)*100))dialog.append(button(option.label,()=>{close();onSelect(option.value);},{class:option.value===selected?'selected':'','data-choice':option.value,'aria-pressed':String(option.value===selected)}));
      if(options.length>100)dialog.append(button('Opções anteriores',()=>{optionPage--;drawOptions();dialog.querySelector('button')?.focus();},{disabled:optionPage===0}),button('Próximas opções',()=>{optionPage++;drawOptions();dialog.querySelector('button')?.focus();},{disabled:(optionPage+1)*100>=options.length}));
      dialog.append(button('Fechar',close,{'data-dismiss':true}));
    };
    drawOptions();shade.append(dialog);shade.addEventListener('click',event=>{if(event.target===shade)close();});root.append(shade);trigger.setAttribute('aria-expanded','true');
    const active=[...dialog.querySelectorAll('[data-choice]')].find(n=>n.dataset.choice===String(selected));(active || dialog.querySelector('button')).focus();active?.scrollIntoView({block:'nearest'});
    signal.addEventListener('abort',onAbort,{once:true});
  },{class:'discover-picker','aria-label':`${title}: ${value || 'Padrão'}`,'aria-haspopup':'dialog','aria-expanded':'false','data-picker':title,disabled:!options.length});
  return trigger;
}
export async function discoverScreen(ctx) {
  const {main,el,button,card,state,route,signal,persist}=ctx,fixed=route.name==='catalog',entries=fixed?catalogEntries([route.addon]).filter(e=>e.catalog.id===route.catalog.id && e.catalog.type===route.catalog.type):discoverEntries(state.addons);
  main.classList.add('discover-content');
  main.append(el('h1',{},fixed?route.catalog.name || route.catalog.id:'Descobrir'));
  if(!entries.length){main.append(el('p',{class:'notice'},'Nenhum catálogo de descoberta disponível. Instale um addon de catálogo.'));return;}
  let selection=selectDiscover(entries,route.discoverView?.selection || (fixed?{}:state.discoverSelection)),view=route.discoverView;
  if(!view || JSON.stringify(selection)!==JSON.stringify(view.selection))view=route.discoverView={selection,skip:0,localPage:0};
  let controller,loading=false;
  signal.addEventListener('abort',()=>controller?.abort(),{once:true});
  const filters=el('div',{class:'discover-filters'}),info=el('p',{class:'discover-info muted'}),status=el('p',{role:'status',class:'discovery-status'}),grid=el('div',{class:'grid discover-grid'}),footer=el('div',{class:'toolbar discovery-paging'});
  main.append(filters,info,status,grid,footer);
  filters.hidden=fixed;
  main.addEventListener('scroll',()=>{view.scrollTop=main.scrollTop;},{signal});
  const entry=()=>entries.find(e=>e.key===selection.key);
  function change(next,focusTitle) {
    controller?.abort();selection=selectDiscover(entries,next);view=route.discoverView={selection,skip:0,localPage:0};if(!fixed)state.discoverSelection=selection;persist();filtersDraw();grid.replaceChildren();footer.replaceChildren();
    filters.querySelector(`[data-picker="${focusTitle}"]`)?.focus();main.scrollTop=0;load(0);
  }
  function filtersDraw() {
    const e=entry(),types=[...new Set(entries.map(x=>x.catalog.type))];
    filters.replaceChildren(picker(ctx,'Tipo',typeLabel(selection.type),types.map(value=>({value,label:typeLabel(value)})),selection.type,type=>change({type},'Tipo')),
      picker(ctx,'Catálogo',e.catalog.name || e.catalog.id,entries.filter(x=>x.catalog.type===selection.type).map(x=>({value:x.key,label:`${x.catalog.name || x.catalog.id} · ${x.addon.manifest.name}`})),selection.key,key=>change({key},'Catálogo')),
      picker(ctx,'Gênero',genreLabel(selection.genre) || 'Padrão',[...(e.requiredGenre?[]:[{value:'',label:'Padrão'}]),...e.genres.map(value=>({value,label:genreLabel(value)}))],selection.genre || '',genre=>change({...selection,genre},'Gênero')));
    info.textContent=[e.addon.manifest.name,typeLabel(selection.type),genreLabel(selection.genre)].filter(Boolean).join(' • ');
  }
  function draw() {
    const e=entry(),items=view.items || [],start=view.localPage*100;
    grid.replaceChildren(...items.slice(start,start+100).map(meta=>card(meta,e.addon,null,`discover-${e.key}`,{portrait:true})));
    const previous=button('Página anterior',()=>{if(view.localPage){view.localPage--;draw();grid.querySelector('button')?.focus();}else load(Math.max(0,view.skip-skipStep(e.catalog)),true);},{disabled:loading || (!view.skip && !view.localPage)});
    const next=button('Carregar mais',()=>{if(start+100<items.length){view.localPage++;draw();grid.querySelector('button')?.focus();}else load(view.skip+skipStep(e.catalog),true);},{disabled:loading || (!(start+100<items.length) && !view.more)});
    footer.replaceChildren(previous,el('span',{class:'muted'},`${items.length?start+1:0}–${Math.min(start+100,items.length)} · lote ${Math.floor(view.skip/skipStep(e.catalog))+1}`),next,button('Atualizar catálogo',()=>load(view.skip),{disabled:loading}));
  }
  async function load(skip,focus=false) {
    controller?.abort();const active=controller=new AbortController();loading=true;status.textContent='Carregando…';draw();
    try {
      const e=entry(),extra=catalogExtras(e,{genre:selection.genre,search:route.searchQuery,skip});
      const data=parseCatalogPage(await getJSON(resourceURL(e.addon,'catalog',e.catalog.type,e.catalog.id,extra),{signal:active.signal}),e.catalog.type);
      if(signal.aborted || active.signal.aborted)return;
      const same=skip>view.skip && (!data.items.length || data.items.every(m=>(view.items || []).some(old=>old.id===m.id && old.type===m.type)));
      if(same){view.more=false;status.textContent='Fim deste catálogo. Nenhum título novo foi retornado.';}
      else {Object.assign(view,data,{skip,localPage:0,at:Date.now(),more:data.rawCount>0 && e.extras.some(x=>x.name==='skip')});status.textContent=data.items.length?'':'Nenhum título encontrado com estes filtros.';}
      if(!fixed)state.discoverSelection=selection;persist();
    }catch(error){if(!signal.aborted && !active.signal.aborted)status.textContent=error.message;}
    finally {if(!signal.aborted && !active.signal.aborted){loading=false;draw();if(focus)(grid.querySelector('button') || filters.querySelector('button'))?.focus();}}
  }
  filtersDraw();
  if(view.items && Date.now()-view.at<120000){draw();main.scrollTop=view.scrollTop || 0;}else await load(view.skip);
}
export function searchScreen(ctx) {
  const {main,el,button,card,state,route,signal,persist,navigate}=ctx;
  main.classList.add('search-content');
  const view=route.searchView ||= {query:'',type:'',catalog:'',batch:0,rows:[]};
  const targets=searchEntries(state.addons);let controller,timer,composing=false;
  const input=el('input',{type:'search',value:view.query,maxlength:200,'aria-label':'Buscar título',placeholder:'Buscar filmes e séries',autocomplete:'off','data-focus':'search-input'});
  const discover=button(el('span',{class:'explore-symbol','aria-hidden':'true'}),()=>navigate({name:'discover'}),{'aria-label':'Abrir Descobrir',class:'search-discover'});
  const form=el('form',{class:'inline-form search-form',onsubmit:event=>{event.preventDefault();clearTimeout(timer);search(true);}},discover,input,button('Buscar',null,{type:'submit',class:'primary'}),button('Limpar',()=>{input.value='';changed();input.focus();}));
  const filters=el('div',{class:'discover-filters search-filters'}),recent=el('div',{class:'recent-searches'}),status=el('p',{role:'status',class:'discovery-status'}),results=el('div',{class:'search-results'}),paging=el('div',{class:'toolbar discovery-paging'});
  main.append(form,filters,recent,status,results,paging);
  const selected=()=>targets.filter(e=>(!view.type || e.catalog.type===view.type) && (!view.catalog || e.key===view.catalog));
  function filtersDraw() {
    if(view.catalog && !targets.some(e=>e.key===view.catalog && (!view.type || e.catalog.type===view.type)))view.catalog='';
    const set=(field,value)=>{view[field]=value;view.batch=0;controller?.abort();filtersDraw();filters.querySelector(`[data-picker="${field==='type'?'Tipo':'Catálogo'}"]`)?.focus();search(true);};
    filters.replaceChildren(picker(ctx,'Tipo',view.type?typeLabel(view.type):'Todos',[{value:'',label:'Todos'},...[...new Set(targets.map(e=>e.catalog.type))].map(value=>({value,label:typeLabel(value)}))],view.type,value=>set('type',value)),
      picker(ctx,'Catálogo',targets.find(e=>e.key===view.catalog)?.catalog.name || 'Todos',[{value:'',label:'Todos'},...targets.filter(e=>!view.type || e.catalog.type===view.type).map(e=>({value:e.key,label:`${e.catalog.name || e.catalog.id} · ${e.addon.manifest.name}`}))],view.catalog,value=>set('catalog',value)));
  }
  function recentDraw() {
    recent.replaceChildren();if(input.value.trim())return;
    const queries=state.recentSearches || [];if(!queries.length){recent.append(el('p',{class:'muted'},'Busque um título ou abra Descobrir para explorar os catálogos.'));return;}
    recent.append(el('div',{class:'section-head'},el('h2',{},'Pesquisas recentes'),button('Limpar histórico',()=>{state.recentSearches=[];persist();recentDraw();input.focus();})));
    for(const query of queries)recent.append(el('div',{class:'recent-row'},button(query,()=>{input.value=query;changed(true);},{class:'grow'}),button('×',()=>{state.recentSearches=queries.filter(q=>q!==query);persist();recentDraw();(recent.querySelector('button') || input).focus();},{'aria-label':`Remover pesquisa: ${query}`})));
  }
  function rowsDraw() {
    const scrollPositions=new Map([...results.querySelectorAll('[data-search-rail]')].map(rail=>[rail.dataset.searchRail,rail.scrollLeft]));
    results.replaceChildren();
    for(const row of view.rows) {
      if(row.loading){results.append(el('p',{class:'loading'},`${row.entry.catalog.name || row.entry.catalog.id} · Buscando…`));continue;}
      if(row.error){results.append(el('p',{class:'notice'},`${row.entry.addon.manifest.name} · ${row.entry.catalog.name || row.entry.catalog.id}: ${row.error}`));continue;}
      if(!row.items?.length)continue;
      const e=row.entry;
      const rail=el('div',{class:'rail','data-search-rail':e.key},row.items.slice(0,16).map(m=>card(m,e.addon,null,`search-${e.key}`,{portrait:true})));
      results.append(el('section',{class:'catalog-section'},el('div',{class:'section-head'},el('h2',{},`${e.catalog.name || e.catalog.id} · ${typeLabel(e.catalog.type)}`),el('span',{class:'muted'},e.addon.manifest.name)),rail,button('Ver todos',()=>navigate({name:'catalog',addon:e.addon,catalog:e.catalog,searchQuery:view.query}),{'aria-label':`Ver todos: ${e.catalog.name || e.catalog.id}`,'data-focus':`search-more-${e.key}`} )));
      rail.scrollLeft=scrollPositions.get(e.key) || 0;
    }
  }
  function pagingDraw() {
    const count=selected().length,pages=Math.max(1,Math.ceil(count/6));paging.replaceChildren();if(!view.query)return;
    paging.append(button('Catálogos anteriores',()=>{view.batch--;search(true);},{disabled:view.batch===0}),el('span',{class:'muted'},`Catálogos ${count?view.batch*6+1:0}–${Math.min((view.batch+1)*6,count)} de ${count}`),button('Próximos catálogos',()=>{view.batch++;search(true);},{disabled:view.batch+1>=pages}),button('Tentar novamente',()=>search(true)));
  }
  async function search(force=false) {
    clearTimeout(timer);const query=input.value.trim().slice(0,200);if(!query){controller?.abort();view.query='';view.rows=[];results.replaceChildren();status.textContent='';paging.replaceChildren();recentDraw();return;}
    const requestKey=JSON.stringify([query,view.type,view.catalog,view.batch]);if(!force && view.requestKey===requestKey && Date.now()-view.at<120000)return;
    controller?.abort();const active=controller=new AbortController();view.query=query;view.requestKey=requestKey;view.at=Date.now();
    rememberSearch(state,query);persist();recentDraw();const batch=selected().slice(view.batch*6,view.batch*6+6);
    view.rows=batch.map(entry=>({entry,loading:true}));status.textContent=batch.length?'Buscando…':'Nenhum addon compatível com esta busca.';rowsDraw();pagingDraw();
    await mapLimit(batch,async(entry,index)=>{
      let row;try {const extra=catalogExtras(entry,{search:query});const data=parseCatalogPage(await getJSON(resourceURL(entry.addon,'catalog',entry.catalog.type,entry.catalog.id,extra),{signal:active.signal}),entry.catalog.type);row={entry,items:data.items.slice(0,16)};}catch(error){row={entry,error:error.message};}
      if(active.signal.aborted || signal.aborted)return;view.rows[index]=row;
      // Preserve focus identity when another addon finishes after the user entered the results.
      const focused=results.contains(document.activeElement)?document.activeElement.dataset.focus:null;rowsDraw();if(focused)[...results.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focused)?.focus({preventScroll:true});
    },active.signal,3);
    if(active.signal.aborted || signal.aborted)return;
    status.textContent=view.rows.some(r=>r.items?.length)?'':view.rows.some(r=>r.error)?'Alguns catálogos falharam. Tente novamente.':'Nenhum resultado para esta busca.';
  }
  function changed(immediate=false) {clearTimeout(timer);controller?.abort();view.query=input.value.trim();view.batch=0;view.requestKey=null;view.rows=[];results.replaceChildren();paging.replaceChildren();recentDraw();status.textContent=view.query?'Buscando…':'';if(!composing)timer=setTimeout(()=>search(),immediate?0:350);}
  input.addEventListener('input',()=>changed());input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);controller?.abort();});input.addEventListener('compositionend',()=>{composing=false;changed();});
  signal.addEventListener('abort',()=>{clearTimeout(timer);controller?.abort();},{once:true});
  filtersDraw();recentDraw();
  if(view.query && view.rows.length && !view.rows.some(r=>r.loading) && Date.now()-view.at<120000){rowsDraw();pagingDraw();}else if(view.query)search(true);
}
export function catalogManager(ctx) {
  const {main,el,button,state,persist}=ctx,all=catalogEntries(state.addons).filter(e=>!e.extras.some(x=>x.isRequired));let page=0;
  main.append(el('h1',{},'Catálogos do início'),el('p',{class:'muted'},'Escolha a ordem e quais catálogos aparecem no início deste perfil. Descobrir continua mostrando todos.'));
  const list=el('div');main.append(list);
  function draw(focusKey) {
    const order=state.catalogOrder || [],entries=[...all].sort((a,b)=>(order.includes(a.key)?order.indexOf(a.key):order.length)-(order.includes(b.key)?order.indexOf(b.key):order.length));
    list.replaceChildren();if(!entries.length)list.append(el('p',{class:'notice'},'Nenhum catálogo disponível para o início.'));
    const edit=(e,delta)=>{const next=entries.map(x=>x.key),i=next.indexOf(e.key);[next[i],next[i+delta]]=[next[i+delta],next[i]];state.catalogOrder=next;persist();page=Math.floor((i+delta)/20);draw(e.key);};
    for(const [i,e]of entries.entries())if(i>=page*20 && i<(page+1)*20){const hidden=(state.hiddenHomeCatalogs || []).includes(e.key);list.append(el('div',{class:'catalog-manage-row'},el('div',{class:'grow'},el('strong',{},e.catalog.name || e.catalog.id),el('small',{class:'muted'},`${e.addon.manifest.name} · ${typeLabel(e.catalog.type)}`)),button(hidden?'Mostrar':'Ocultar',()=>{const set=new Set(state.hiddenHomeCatalogs || []);hidden?set.delete(e.key):set.add(e.key);state.hiddenHomeCatalogs=[...set];persist();draw(e.key);},{'data-catalog-key':e.key,'aria-label':`${hidden?'Mostrar':'Ocultar'}: ${e.catalog.name || e.catalog.id}`}),button('Subir',()=>edit(e,-1),{disabled:i===0,'aria-label':`Subir: ${e.catalog.name || e.catalog.id}`}),button('Descer',()=>edit(e,1),{disabled:i===entries.length-1,'aria-label':`Descer: ${e.catalog.name || e.catalog.id}`})));}
    list.append(el('div',{class:'toolbar'},button('Página anterior',()=>{page--;draw();},{disabled:page===0}),button('Próxima página',()=>{page++;draw();},{disabled:(page+1)*20>=entries.length}),button('Restaurar ordem',()=>{state.catalogOrder=[];state.hiddenHomeCatalogs=[];persist();draw();})));
    if(focusKey)[...list.querySelectorAll('[data-catalog-key]')].find(n=>n.dataset.catalogKey===focusKey)?.focus();
  }
  draw();
}
