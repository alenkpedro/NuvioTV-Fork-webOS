// SPDX-License-Identifier: GPL-3.0-only
import {fetchSegments,activeSegment} from './core/skip-segments.js';
import {readPlayback} from './core/playback.js';
export function installSegments({screen,video,context,settings,el,button,blocked,seek,restore,onIntervals}) {
 const prefs=readPlayback(settings.playback),controller=new AbortController(),autoSkipped=new Set();
 let items=[],active=null,dismissed=false,remaining=10000,last=0,timer,disposed=false,loaded=false,priorControls=true;
 const label={intro:'Pular abertura',recap:'Pular recapitulação',outro:'Pular créditos'};
 const node=button('',skip,{class:'skip-segment',hidden:true}),fill=el('span',{class:'skip-segment-progress','aria-hidden':true});screen.append(node);
 function visibleClass(value){if(screen.classList.contains('skip-visible')!==value)screen.classList.toggle('skip-visible',value);}
 function hide(){node.hidden=true;visibleClass(false);if(document.activeElement===node)restore();}
 function skip(){if(!active||blocked()||document.hidden)return;autoSkipped.add(`${active.type}:${active.start}`);dismissed=true;seek(Math.min(active.end,video.duration-.1));refresh();}
 function refresh(){
  if(disposed)return;const now=performance.now();if(last)remaining=Math.max(0,remaining-(now-last));last=0;clearTimeout(timer);
  const next=activeSegment(items,video.currentTime,video.duration);if(next!==active){active=next;dismissed=false;remaining=10000;}
  const controls=screen.classList.contains('controls-visible');
  if(!prefs.skipSegments||!active||document.hidden||video.error||video.ended||video.readyState<2||video.seeking||blocked()){hide();return;}
  if(!video.paused&&prefs.autoSkipTypes.includes(active.type)&&!autoSkipped.has(`${active.type}:${active.start}`)){skip();return;}
  if((dismissed||remaining<=0)&&!controls){hide();return;}
  if(node.dataset.segment!==active.type){node.dataset.segment=active.type;node.replaceChildren(el('span',{class:'player-icon player-icon-next'}),el('span',{},label[active.type]),fill);node.setAttribute('aria-label',label[active.type]);}
  const focusOnHide=priorControls&&!controls;priorControls=controls;const wasHidden=node.hidden;node.hidden=false;visibleClass(true);const controlsNode=screen.querySelector('.player-controls'),bar=screen.querySelector('.player-timeline');node.style.bottom=`${controls?controlsNode.offsetHeight-bar.offsetTop+12:30}px`;fill.style.transform=`scaleX(${1-remaining/10000})`;fill.hidden=controls||dismissed||remaining<=0;
  if(!controls&&remaining>0){last=now;timer=setTimeout(refresh,200);if(wasHidden||focusOnHide)node.focus({preventScroll:true});}
 }
 async function load(){if(loaded||!prefs.skipSegments||disposed)return;loaded=true;try{const result=await fetchSegments(context,controller.signal);if(!disposed&&!controller.signal.aborted){items=result;onIntervals?.(items);refresh();}}catch{}}
 const observer=new MutationObserver(refresh);observer.observe(screen,{attributes:true,attributeFilter:['class'],childList:true});
 const events=['timeupdate','seeked','seeking','pause','playing','durationchange','error','ended'];for(const e of events)video.addEventListener(e,refresh);video.addEventListener('loadeddata',load,{once:true});document.addEventListener('visibilitychange',refresh);
 return {refresh,focused:()=>document.activeElement===node,dismiss(){if(node.hidden||document.activeElement!==node)return false;dismissed=true;hide();return true;},focus(){if(node.hidden)return false;node.focus();return true;},dispose(){disposed=true;controller.abort();clearTimeout(timer);observer.disconnect();for(const e of events)video.removeEventListener(e,refresh);video.removeEventListener('loadeddata',load);document.removeEventListener('visibilitychange',refresh);node.remove();}};
}
