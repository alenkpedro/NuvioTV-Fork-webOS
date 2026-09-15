// SPDX-License-Identifier: GPL-3.0-only
import { followingEpisode, nextThreshold, readPlayback } from './core/playback.js';
export function installNextEpisode({screen,video,context,settings,el,button,loadMeta,advance,stopPlayback,modalOpen,restoreFocus}) {
  const prefs = readPlayback(settings.playback);
  let next = followingEpisode(context.meta,context.id), disposed = false, dismissed = false, committed = false, buffering = true;
  let timer, remaining = 5, lastTick = 0, prompt, promptTimer, promptRemaining = 60, promptTick = 0, promptUpdate;
  const autoCount = Number.isInteger(context.nextPlayback?.count) ? Math.max(0,Math.min(6,context.nextPlayback.count)) : 0;
  const status = el('small',{'aria-live':'polite'});
  const label = el('strong',{});
  const thumbnail = el('img',{alt:'',loading:'lazy',onerror:()=>{thumbnail.hidden=true;}});
  const start = button([thumbnail,el('span',{class:'grow'},el('small',{},'Próximo episódio'),label,status),el('span',{'aria-hidden':'true'},'▶')],()=>proceed(false),{'aria-label':'Reproduzir próximo episódio',class:'next-episode-play'});
  const cancel = button('Continuar neste episódio',dismiss,{class:'next-episode-cancel'});
  const card = el('section',{class:'next-episode',hidden:true,'aria-label':'Próximo episódio'},start,cancel);
  const shortcut = button([el('span',{class:'player-icon player-icon-next','aria-hidden':'true'}),el('span',{},'Próximo episódio')],()=>proceed(),{hidden:true,class:'player-pill','aria-label':'Ir para o próximo episódio'});
  screen.querySelector('.player-controls .toolbar').append(shortcut); screen.append(card);
  function stopTimer() { clearInterval(timer); timer = null; lastTick = 0; }
  function dismiss() { dismissed = true; stopTimer(); card.hidden = true; restoreFocus(); }
  function closePrompt() { clearInterval(promptTimer); promptTimer=null; prompt?.remove(); prompt=null; screen.classList.remove('awaiting-viewer'); }
  function stopWatching() { if (disposed || committed) return; committed=true; stopTimer(); closePrompt(); stopPlayback(); }
  function askStillWatching() {
    stopTimer(); card.hidden=true;
    const countdown=el('p',{'aria-live':'polite'});
    const resume=button([el('span',{'aria-hidden':'true'},'▶'), 'Reproduzir'],()=>{if(document.hidden || disposed || committed)return;closePrompt();proceed(false);},{'aria-label':'Continuar assistindo'});
    prompt=el('section',{class:'still-watching-dialog',role:'dialog','aria-modal':'true','aria-label':'Ainda assistindo?'},
      el('div',{class:'still-watching-panel'},
        el('div',{class:'grow'},el('h2',{},'Você ainda está assistindo?'),el('strong',{},label.textContent),countdown),
        el('div',{class:'toolbar'},resume,button([el('span',{'aria-hidden':'true'},'×'),'Sair'],stopWatching,{'data-dismiss':true,'aria-label':'Parar de assistir'}))));
    try { const url=new URL(next.thumbnail || ''); if (['https:','http:'].includes(url.protocol)) { const thumb=el('img',{src:url.href,alt:'',onerror:()=>thumb.remove()}); prompt.querySelector('.still-watching-panel').prepend(thumb); } } catch {}
    screen.classList.add('awaiting-viewer'); screen.append(prompt); video.pause(); resume.focus();
    function tickPrompt() {
      if (!prompt || disposed) return;
      const now=performance.now();
      if (!document.hidden && promptTick) promptRemaining-=Math.min(1,(now-promptTick)/1000);
      promptTick=now;
      countdown.textContent=`Parando em ${Math.max(0,Math.ceil(promptRemaining))} s`;
      if (promptRemaining<=0 && !document.hidden) stopWatching();
    }
    promptUpdate=tickPrompt; tickPrompt();
    promptTimer=setInterval(tickPrompt,1000);
  }
  function proceed(automatic = false) {
    if (disposed || committed || !next?.hasAired || document.hidden) return;
    if (automatic && prefs.stillWatching && prefs.autoNext && autoCount >= prefs.stillWatchingThreshold) { if (!prompt) askStillWatching(); return; }
    committed = true; stopTimer(); closePrompt(); advance(next,prefs.autoNext,automatic ? autoCount+1 : 0);
  }
  function updateStatus() {
    const text = !next?.hasAired ? 'Este episódio ainda não foi lançado.' : prefs.autoNext ? `Reproduzir em ${Math.max(1,Math.ceil(remaining))} s${blocked() ? ' · pausado' : ''}` : 'Escolher fontes';
    if (status.textContent !== text) status.textContent = text;
  }
  function blocked() { return document.hidden || Boolean(video.error) || video.seeking || modalOpen() || (!video.ended && (video.paused || buffering)); }
  function tick() {
    if (disposed || dismissed || committed) { stopTimer(); return; }
    const now = performance.now();
    if (!blocked() && lastTick) remaining -= Math.min(0.5,(now-lastTick)/1000);
    lastTick = now; updateStatus();
    if (remaining <= 0 && !blocked()) proceed(true);
  }
  function update() {
    if (disposed || !next || committed || prompt) return;
    shortcut.hidden = !next.hasAired;
    label.textContent = `${next.season ? `T${next.season} · ` : ''}E${next.episode} · ${next.title || 'Próximo episódio'}`;
    start.disabled = !next.hasAired;
    const visible = !dismissed && (video.ended || context.skipIntervals?.some(v=>v.type==='outro' && v.end<=video.duration+1 && video.currentTime>=v.start) || nextThreshold(video.currentTime,video.duration,prefs));
    const wasVisible = !card.hidden;
    card.hidden = !visible;
    if (!visible) { stopTimer(); remaining = 5; if (wasVisible && card.contains(document.activeElement)) restoreFocus(); return; }
    if (!wasVisible) {
      try { const url = new URL(next.thumbnail || ''); if (['https:','http:'].includes(url.protocol)) thumbnail.src = url.href; } catch {}
      thumbnail.hidden = !thumbnail.getAttribute('src');
      if (prefs.autoNext && !modalOpen() && !document.hidden && !video.paused) start.focus({preventScroll:true});
    }
    updateStatus();
    if (blocked()) stopTimer();
    else if (prefs.autoNext && next.hasAired && !timer) { lastTick=performance.now(); timer = setInterval(tick,250); }
  }
  const events = {timeupdate:update,seeked:update,durationchange:update,ended:()=>{buffering=false;update();},playing:()=>{buffering=false;update();},waiting:()=>{buffering=true;update();},pause:()=>{lastTick=0;update();},seeking:()=>{lastTick=0;update();},error:()=>{stopTimer();dismissed=true;card.hidden=true;}};
  for (const [event,fn] of Object.entries(events)) video.addEventListener(event,fn);
  const visibility = () => { lastTick = 0; promptTick = 0; if (prompt) { clearInterval(promptTimer); promptTimer=document.hidden ? null : setInterval(promptUpdate,1000); } update(); }; document.addEventListener('visibilitychange',visibility);
  if (context.type === 'series' && !Array.isArray(context.meta.videos)) {
    loadMeta().then(meta=>{ if (!disposed) { next = followingEpisode(meta,context.id); context.meta = meta; update(); } }).catch(()=>{});
  }
  update();
  return {isOpen:()=>Boolean(prompt),refresh:update,focused:()=>!card.hidden && card.contains(document.activeElement),dispose(){disposed=true;stopTimer();closePrompt();for(const [event,fn] of Object.entries(events))video.removeEventListener(event,fn);document.removeEventListener('visibilitychange',visibility);card.remove();shortcut.remove();}};
}
