// SPDX-License-Identifier: GPL-3.0-only
// EpisodesSidePanel.kt: 520 dp, season rail, current episode and inline sources.
import { episodeList, releaseText } from './core/presentation.js';
import { getJSON, resourceURL, supports, mapLimit } from './core/addons.js';
import { filterAndSort, rankStreams, playbackIssue } from './core/ranking.js';
import { progressKey } from './core/storage.js';
import { isWatched } from './core/history.js';
const PAGE_SIZE=50;
export function installEpisodePanel({screen,context,state,el,button,poster,sourceCard,loadMeta,play,playCurrent,onOpen,onClose}) {
  let dialog,returnFocus,disposed=false,controller,episodes=[],season,page=0,selected,rows=[],providers=[],provider=null,showAll=false,loading=false,error='',failed=0,mode='episodes',currentOnly=false;
  function cancelRequest() { controller?.abort();controller=null;loading=false; }
  function close() { if(!dialog)return;cancelRequest();dialog.remove();dialog=null;rows=[];providers=[];screen.classList.remove('episodes-open');onClose();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true}); }
  function backToEpisodes() { cancelRequest();rows=[];providers=[];mode='episodes';error='';draw(`episode-${selected.id}`); }
  function changeSeason(value,focusEpisode=false) { season=value;page=0;draw(focusEpisode ? 'first-episode' : `season-${season}`); }
  function choose(episode,stream) {
    if(disposed || !dialog || document.hidden || playbackIssue(stream,state.settings.avoidDvOnly))return;
    cancelRequest();if(currentOnly)playCurrent(stream);else play(episode,stream,context.meta);
  }
  async function sources(episode) {
    if(Date.parse(episode.released)>Date.now())return;
    cancelRequest();selected=episode;mode='sources';rows=[];provider=null;showAll=false;failed=0;error='';loading=true;
    providers=state.addons.filter(a=>supports(a,'stream',context.type,episode.id)).slice(0,30);
    const request=controller=new AbortController();draw('sources-back');
    const results=await mapLimit(providers,async(addon,index)=>{
      const result=await getJSON(resourceURL(addon,'stream',context.type,episode.id),{signal:request.signal});
      if(!Array.isArray(result.streams))throw Error('Resposta de fontes inválida.');
      return result.streams.filter(s=>s && typeof s==='object').slice(0,300).map((s,i)=>({...s,addonName:addon.manifest.name,sourceProvider:index,sourceKey:`episode-source-${index}-${i}`}));
    },request.signal);
    if(disposed || !dialog || request.signal.aborted || controller!==request)return;
    rows=results.flatMap(r=>r?.value || []);failed=results.filter(r=>r?.error).length;loading=false;controller=null;
    const focus=dialog.querySelector(currentOnly?'[data-panel-key="close"]':'[data-panel-key="sources-back"]')===document.activeElement ? 'first-source' : null;
    draw(focus);
  }
  async function metadata() {
    cancelRequest();loading=true;error='';const request=controller=new AbortController();draw('close');
    try {
      const meta=await loadMeta(request.signal);
      if(disposed || !dialog || request.signal.aborted || controller!==request)return;
      if(!Array.isArray(meta?.videos))throw Error('Não foi possível carregar os episódios.');
      context.meta=meta;episodes=episodeList(meta).slice(0,10000);selectInitial();
    } catch(failure) {if(!request.signal.aborted)error=failure.message;}
    finally {if(!disposed && dialog && controller===request){controller=null;loading=false;draw('initial');}}
  }
  function selectInitial() { const current=episodes.find(v=>v.id===context.id);season=current?.season ?? episodes[0]?.season;selected=current;page=Math.max(0,Math.floor(episodes.filter(v=>v.season===season).findIndex(v=>v.id===context.id)/PAGE_SIZE)); }
  function draw(focusKey) {
    if(!dialog || disposed)return;
    const oldKey=dialog.contains(document.activeElement) ? document.activeElement.dataset.panelKey : null;
    const oldScroll=dialog.querySelector('.episode-panel-list')?.scrollTop || 0;
    const panel=el('section',{class:`episode-panel${currentOnly?' current-source-panel':''}`});
    panel.append(el('div',{class:'episode-panel-heading'},el('h2',{},mode==='episodes'?'Episódios':'Fontes'),button('Fechar',close,{'data-panel-key':'close',...(mode==='episodes'||currentOnly?{'data-dismiss':true}:{})})));
    const list=el('div',{class:'episode-panel-list'});
    if(mode==='episodes') {
      const seasons=[...new Set(episodes.map(v=>v.season))];
      if(seasons.length) {
        const rail=el('div',{class:'episode-seasons','aria-label':'Temporadas'});
        // A windowed rail bounds DOM size even for unusually large season lists.
        const index=seasons.indexOf(season),start=Math.max(0,index-5),end=Math.min(seasons.length,start+12);
        if(start>0)rail.append(button('‹',()=>changeSeason(seasons[start-1]),{'aria-label':'Temporadas anteriores'}));
        for(const value of seasons.slice(start,end))rail.append(button(value===0?'Especiais':`Temporada ${value}`,()=>changeSeason(value),{class:value===season?'selected':'','aria-pressed':String(value===season),'data-panel-key':`season-${value}`}));
        if(end<seasons.length)rail.append(button('›',()=>changeSeason(seasons[end]),{'aria-label':'Próximas temporadas'}));
        panel.append(rail);
      }
      const inSeason=episodes.filter(v=>v.season===season);
      for(const episode of inSeason.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)) {
        const current=episode.id===context.id,progress=state.progress[progressKey(context.type,episode.id)];
        const watched=progress?.complete || isWatched(state,{...progress,type:context.type,meta:context.meta,episode});
        const future=Date.parse(episode.released)>Date.now();
        const art=el('div',{class:'episode-panel-art'},poster(episode.thumbnail,episode.title || 'Episódio','episode-panel-image'),el('span',{class:'episode-panel-code'},`T${episode.season} E${episode.episode}`),current?el('span',{class:'episode-current','aria-label':'Em reprodução'},'✓'):null);
        const body=el('div',{class:'grow'},el('strong',{},episode.title || `Episódio ${episode.episode}`),el('small',{},releaseText({type:'movie',released:episode.released})),el('p',{},episode.overview || episode.description || ''),watched?el('small',{class:'episode-watched'},'Assistido'):null,future?el('small',{},'Ainda não lançado'):null);
        list.append(button([art,body],()=>sources(episode),{class:'episode-panel-item','data-panel-key':`episode-${episode.id}`,'data-episode-id':episode.id,'aria-current':current?'true':null,'aria-disabled':String(future)}));
      }
      if(inSeason.length>PAGE_SIZE)panel.append(el('div',{class:'episode-pagination'},button('Anterior',()=>{page--;draw('first-episode');},{disabled:page===0}),el('small',{},`${page+1} / ${Math.ceil(inSeason.length/PAGE_SIZE)}`),button('Próxima página',()=>{page++;draw('first-episode');},{disabled:(page+1)*PAGE_SIZE>=inSeason.length})));
      if(loading)list.append(el('p',{role:'status'},'Carregando episódios…'));
      else if(error)list.append(el('p',{role:'alert'},error),button('Tentar novamente',metadata));
      else if(!episodes.length)list.append(el('p',{role:'status'},'Nenhum episódio disponível para esta série.'));
    } else {
      if(!currentOnly)panel.append(el('div',{class:'episode-sources-heading'},button('Voltar aos episódios',backToEpisodes,{'data-dismiss':true,'data-panel-key':'sources-back'}),el('strong',{},`T${selected.season} E${selected.episode} · ${selected.title || 'Episódio'}`)));
      if(currentOnly)panel.append(el('p',{class:'current-source-title'},context.episode?`T${context.episode.season} E${context.episode.episode} • ${context.episode.title || context.meta.name}`:context.meta.name));
      const chips=el('div',{class:'stream-chips'},button('Atualizar',()=>sources(selected),{'aria-label':currentOnly?'Atualizar fontes':'Atualizar fontes do episódio','data-panel-key':'refresh'}));
      for(const index of [null,...providers.map((_,i)=>i)])chips.append(button(index===null?'Todos':providers[index].manifest.name,()=>{provider=index;draw(`provider-${index}`);},{class:index===provider?'selected':'','data-panel-key':`provider-${index}`}));
      panel.append(chips);
      if(loading)list.append(el('p',{role:'status'},'Buscando fontes…'));
      else {
        const subset=rows.filter(s=>provider===null || s.sourceProvider===provider);
        const prefs=showAll ? {...state.settings.preferences,...Object.fromEntries(['excludedResolutions','excludedQualities','excludedVisualTags','excludedAudioTags','excludedAudioChannels','excludedEncodes','excludedLanguages','excludedReleaseGroups'].map(k=>[k,[]]))} : state.settings.preferences;
        const visible=(showAll?rankStreams:filterAndSort)(subset,prefs);
        list.append(el('p',{role:'status',class:'episode-source-count'},`${Math.min(100,visible.length)} de ${subset.length} fonte(s)${failed?` · ${failed} addon(s) não responderam`:''}`));
        if(!visible.length)list.append(el('p',{},providers.length?'Nenhuma fonte disponível neste filtro. Atualize ou use Mostrar todas.':'Nenhum addon instalado fornece fontes para este episódio.'));
        for(const stream of visible.slice(0,100)) {const card=sourceCard(stream,providers,()=>choose(selected,stream));card.dataset.panelKey=stream.sourceKey;list.append(card);}
        panel.append(el('div',{class:'episode-source-actions'},button('Reproduzir melhor fonte',()=>{const best=rankStreams(subset.filter(s=>!playbackIssue(s,state.settings.avoidDvOnly)),state.settings.preferences)[0];if(best)choose(selected,best);else{error='Não há fonte HTTP(S) elegível nesta seleção.';draw();}},{'data-panel-key':'best'}),button(showAll?'Aplicar filtros do fork':'Mostrar todas',()=>{showAll=!showAll;draw('filters');},{'data-panel-key':'filters'})));
        if(error)list.append(el('p',{role:'alert'},error));
      }
    }
    panel.append(list);dialog.replaceChildren(panel);
    const key=focusKey || oldKey;
    const target=key==='initial'?dialog.querySelector(`[aria-current="true"]`):key==='first-episode'?list.querySelector('.episode-panel-item'):key==='first-source'?list.querySelector('.source:not([aria-disabled="true"])'):null;
    const focus=target || [...dialog.querySelectorAll('[data-panel-key]')].find(e=>e.dataset.panelKey===key) || (focusKey?list.querySelector('button') || dialog.querySelector('button'):null);
    if(!focusKey)list.scrollTop=oldScroll;
    focus?.focus({preventScroll:true});if(focusKey)focus?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function open() {
    if(disposed || dialog || context.type!=='series')return;
    returnFocus=document.activeElement;currentOnly=false;mode='episodes';rows=[];error='';episodes=episodeList(context.meta).slice(0,10000);selectInitial();
    dialog=el('div',{class:'player-episode-dialog',role:'dialog','aria-modal':'true','aria-label':'Episódios e fontes'});screen.append(dialog);screen.classList.add('episodes-open');onOpen();
    if(Array.isArray(context.meta.videos))draw('initial');else metadata();
  }
  function openCurrent() {
    if(disposed || dialog)return;
    returnFocus=document.activeElement;currentOnly=true;
    dialog=el('div',{class:'player-episode-dialog player-source-dialog',role:'dialog','aria-modal':'true','aria-label':'Fontes'});screen.append(dialog);screen.classList.add('episodes-open');onOpen();
    sources({id:context.id,...context.episode});
  }
  return {open,openCurrent,isOpen:()=>Boolean(dialog),key(key,event){if(!dialog || mode!=='episodes' || !document.activeElement?.matches('.episode-panel-item') || !['ArrowLeft','ArrowRight'].includes(key))return false;const seasons=[...new Set(episodes.map(v=>v.season))],index=seasons.indexOf(season)+(key==='ArrowLeft'?-1:1);if(seasons[index]!==undefined)changeSeason(seasons[index],true);event.preventDefault();return true;},dispose(){disposed=true;cancelRequest();dialog?.remove();dialog=null;rows=[];episodes=[];screen.classList.remove('episodes-open');}};
}
