// SPDX-License-Identifier: GPL-3.0-only
// PauseOverlay.kt and schedulePauseOverlay: opt-in, 5 seconds after manual pause.
import {readPlayback} from './core/playback.js';
import {people} from './core/metadata.js';
import {artworkURL} from './core/player-artwork.js';
import {playerArtwork} from './player-artwork.js';
export function installPauseOverlay({screen,video,context,settings,el,button,blocked,onOpen,onClose,resume}) {
  let dialog,timer,clockTimer,manual=false,disposed=false,member=null,lastMember='',opened=false;
  const enabled=readPlayback(settings.playback).pauseOverlay;
  const format=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'});
  function cancelTimer(){clearTimeout(timer);timer=null;}
  function close(){cancelTimer();manual=false;if(!dialog)return;dialog.remove();dialog=null;member=null;clearTimeout(clockTimer);onClose();}
  function eligible(){return enabled && manual && !disposed && !document.hidden && video.paused && !video.ended && !video.error && !video.seeking && video.readyState>=2 && !blocked();}
  function interaction(){cancelTimer();if(!dialog && eligible())timer=setTimeout(()=>{timer=null;if(eligible())open();},5000);}
  function dismiss(){if(member){member=null;draw();dialog.querySelector(`[data-member="${lastMember}"]`)?.focus();}else close();}
  function clock(){clearTimeout(clockTimer);if(!dialog || disposed || document.hidden)return;const node=dialog.querySelector('.pause-clock');if(node)node.textContent=format.format(Date.now());clockTimer=setTimeout(clock,Math.max(1000,60000-Date.now()%60000));}
  function draw(){
    if(!dialog)return;
    const focused=dialog.contains(document.activeElement)?document.activeElement.dataset.member:null;
    const dismissButton=button('Fechar tela de pausa',dismiss,{'data-dismiss':true,hidden:true,tabindex:-1});
    const panel=el('section',{class:'pause-content',tabindex:0,'data-focusable':true,'aria-label':'Vídeo pausado. Pressione OK para continuar.'});
    if(member){
      const back=button('← Voltar aos detalhes',()=>{member=null;draw();dialog.querySelector(`[data-member="${lastMember}"]`)?.focus();},{class:'pause-cast-back'});
      const photo=artworkURL(member.photo);
      panel.append(el('div',{class:'pause-cast-detail'},back,el('div',{class:'pause-cast-body'},photo?el('img',{class:'pause-cast-photo',src:photo,alt:member.name,onerror:e=>e.target.remove()}):null,el('div',{class:'grow'},el('h2',{},member.name),member.character?el('p',{},`Como ${member.character}`):null))));
    }else{
      const meta=context.meta,episode=context.episode;
      const cast=people(meta).filter(m=>!['Creator','Director','Writer'].includes(m.character)).slice(0,8);
      const artwork=playerArtwork(el,meta,{imageClass:'pause-title-logo',tag:'h2'});artwork.classList.add('pause-artwork');
      const details=el('div',{class:'pause-metadata'},el('p',{class:'pause-eyebrow'},'Você está assistindo'),artwork);
      const year=String(meta.releaseInfo || meta.year || '').slice(0,30),episodeLabel=episode?`T${episode.season} E${episode.episode}`:'';
      if(year || episodeLabel)details.append(el('p',{class:'pause-year'},[year,episodeLabel].filter(Boolean).join(' • ')));
      if(episode?.title)details.append(el('p',{class:'pause-episode'},episode.title));
      const episodeMeta=Array.isArray(meta.videos)?meta.videos.find(item=>item.id===context.id):null;
      const description=episodeMeta?.overview || episodeMeta?.description || meta.description;
      if(description)details.append(el('p',{class:'pause-description'},String(description)));
      if(cast.length)details.append(el('div',{class:'pause-cast'},el('h3',{},'Elenco'),el('div',{class:'pause-cast-rail'},cast.map((item,i)=>button(item.name,()=>{lastMember=String(i);member=item;draw();dialog.querySelector('.pause-cast-back')?.focus();},{class:'pause-cast-chip','data-member':String(i)})))));
      panel.append(details);
    }
    const time=Number.isFinite(video.duration)?el('span',{class:'pause-clock','aria-label':'Horário atual'}):null;
    dialog.replaceChildren(dismissButton,panel,time);clock();
    if(opened){if(typeof focused==='string')dialog.querySelector(`[data-member="${focused}"]`)?.focus({preventScroll:true});else panel.focus({preventScroll:true});}
  }
  function open(){dialog=el('div',{class:'player-pause-overlay',role:'dialog','aria-modal':true,'aria-label':'Tela de pausa'});screen.append(dialog);opened=true;onOpen();draw();dialog.querySelector('.pause-content')?.focus({preventScroll:true});dialog.addEventListener('click',e=>{if(!e.target.closest('button'))close();});}
  function manualPause(){manual=true;video.pause();interaction();}
  function reset(){manual=false;cancelTimer();if(dialog)close();}
  const visibility=()=>{if(document.hidden)reset();};
  const events={pause:interaction,playing:reset,play:reset,seeking:reset,ended:reset,error:reset,emptied:reset};
  for(const [name,fn]of Object.entries(events))video.addEventListener(name,fn);
  document.addEventListener('visibilitychange',visibility);
  return {manualPause,interaction,reset,isOpen:()=>Boolean(dialog),update:()=>{if(dialog)draw();},
    key(key,event){
      if(!dialog)return false;
      if(['MediaPlay',' ','Enter'].includes(key) && (key!=='Enter' || !document.activeElement?.closest('button'))){event.preventDefault();close();resume();return true;}
      if(['MediaPause','MediaStop','MediaRewind','MediaFastForward'].includes(key)){event.preventDefault();return true;}
      if(['ArrowDown','ArrowRight'].includes(key) && document.activeElement?.classList.contains('pause-content')){event.preventDefault();dialog.querySelector('.pause-cast-chip,.pause-cast-back')?.focus();return true;}
      if(key==='ArrowUp' && document.activeElement?.classList.contains('pause-cast-chip')){event.preventDefault();dialog.querySelector('.pause-content')?.focus();return true;}
      return false;
    },
    dispose(){disposed=true;manual=false;cancelTimer();clearTimeout(clockTimer);dialog?.remove();dialog=null;for(const [name,fn]of Object.entries(events))video.removeEventListener(name,fn);document.removeEventListener('visibilitychange',visibility);}
  };
}
