// SPDX-License-Identifier: GPL-3.0-only
// PlayerScrubRates.kt: 10s steps, 20s after a 3s hold; commit once on release.
export function installSeek({video,timeline,update,reveal}) {
  let preview=null,started=0,direction=null;
  const eligible=()=>Number.isFinite(video.duration) && video.duration>0;
  const clamp=value=>Math.max(0,Math.min(video.duration-.1,value));
  function cancel(){preview=null;direction=null;update();}
  function commit(){if(preview===null)return;const target=preview;preview=null;direction=null;if(eligible())video.currentTime=clamp(target);update();}
  function key(key,event){if(!['ArrowLeft','ArrowRight'].includes(key)||!eligible())return false;
    if(!event.repeat || direction!==key){started=performance.now();direction=key;}
    const step=performance.now()-started>=3000?20:10;
    preview=clamp((preview??video.currentTime)+(key==='ArrowLeft'?-step:step));reveal();update();event.preventDefault();return true;}
  function released(event){const key=({37:'ArrowLeft',39:'ArrowRight',412:'ArrowLeft',417:'ArrowRight'})[event.keyCode] || ({MediaRewind:'ArrowLeft',MediaFastForward:'ArrowRight'})[event.key] || event.key;if(key===direction){event.preventDefault();commit();}}
  function input(){if(eligible()){preview=clamp(Number(timeline.value));reveal();update();}}
  const blur=()=>commit(),hidden=()=>{if(document.hidden)cancel();};
  document.addEventListener('keyup',released);document.addEventListener('visibilitychange',hidden);
  window.addEventListener('blur',cancel);timeline.addEventListener('input',input);timeline.addEventListener('change',commit);timeline.addEventListener('blur',blur);
  return {position:()=>preview??video.currentTime,active:()=>preview!==null,key,cancel,commit,dispose(){document.removeEventListener('keyup',released);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',cancel);timeline.removeEventListener('input',input);timeline.removeEventListener('change',commit);timeline.removeEventListener('blur',blur);}};
}
