import {playerArtwork} from './player-artwork.js';
// SPDX-License-Identifier: GPL-3.0-only
// PlayerScreen.kt: PlayerControlsOverlay, ControlButton, PillControlButton and ProgressBar.
export function playerUI({el,button,context,video,toggle,restart,audio,subtitles,sources,episodes,speed,aspect,stats}) {
  const icon=name=>el('span',{class:`player-icon player-icon-${name}`,'aria-hidden':'true'});
  const pill=(label,name,action)=>button([icon(name),el('span',{},label)],action,{class:'player-pill','aria-label':label});
  const control=(label,name,action)=>button(icon(name),action,{class:'player-icon-button','aria-label':label,title:label});
  let artwork=playerArtwork(el,context.meta);
  const episode=context.episode ? el('p',{class:'player-episode-title'},`T${context.episode.season} E${context.episode.episode}${context.episode.title ? ` • ${context.episode.title}` : ''}`) : null;
  const identity=el('div',{class:'player-identity'},artwork,episode);
  const pause=pill('Pausar','pause',toggle);
  const moreActions=el('div',{class:'player-more-actions',hidden:true},control('Velocidade','speed',speed),control('Proporção da imagem','aspect_ratio',aspect));
  const more=control('Mais','more',()=>setMore(moreActions.hidden));more.setAttribute('aria-expanded','false');
  function setMore(open) { moreActions.hidden=!open;more.setAttribute('aria-expanded',String(open));more.classList.toggle('expanded',open);controls.parentElement?.classList.toggle('more-expanded',open); }
  const info=control('Informações de reprodução','info',stats);
  const actions=el('div',{class:'player-icon-actions'},info,control('Áudio','audio',audio),control('Legendas','subtitles',subtitles),control('Fontes','sources',sources),moreActions,more);
  const timeline=el('input',{type:'range',class:'player-timeline',min:0,max:1,value:0,step:1,disabled:true,'aria-label':'Posição do vídeo'});
  const elapsed=el('span',{class:'player-time'},'00:00'),remaining=el('span',{class:'player-time'},'-00:00');
  const pills=el('div',{class:'toolbar player-pill-actions'},pause,pill('Reiniciar','restart',restart),context.episode?pill('Episódios','episodes',episodes):null);
  const controls=el('div',{class:'player-controls'},el('div',{class:'player-title-actions'},identity,actions),timeline,el('div',{class:'player-time-row'},elapsed,remaining),pills);
  const meta=el('div',{class:'player-meta-chips','aria-label':'Informações da fonte'});
  const now=el('strong',{}),ends=el('small',{}),clock=el('div',{class:'player-clock'},now,ends);
  const top=el('div',{class:'player-top'},meta,clock);
  function setPlaying(playing) {const label=playing?'Pausar':'Reproduzir';pause.replaceChildren(icon(playing?'pause':'play'),el('span',{},label));pause.setAttribute('aria-label',label);}
  const format=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'});
  function updateClock() {
    const date=Date.now(),current=format.format(date);if(now.textContent!==current)now.textContent=current;
    const duration=video.duration,left=(duration-video.currentTime)/Math.max(.25,video.playbackRate || 1);
    const end=Number.isFinite(left)?`Termina às ${format.format(date+Math.max(0,left)*1000)}`:'';if(ends.textContent!==end)ends.textContent=end;
  }
  function updateIdentity(){const next=playerArtwork(el,context.meta);artwork.replaceWith(next);artwork=next;}
  return {updateIdentity,controls,top,timeline,elapsed,remaining,pause,info,actions,pills,meta,setPlaying,updateClock,setMore,more,
    key(key,hide) {
      const focused=document.activeElement;
      if(key==='ArrowDown' && focused?.closest('.player-icon-actions')) {timeline.focus();return true;}
      if(key==='ArrowUp' && focused?.closest('.player-icon-actions')) {hide();return true;}
      if(key==='ArrowUp' && focused?.closest('.player-pill-actions')) {timeline.focus();return true;}
      if(key==='ArrowDown' && focused?.closest('.player-pill-actions')) {hide();return true;}
      if(focused===timeline && ['ArrowUp','ArrowDown'].includes(key)) {(key==='ArrowUp'?info:pause).focus();return true;}
      return false;
    }};
}
