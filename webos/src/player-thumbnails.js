// SPDX-License-Identifier: GPL-3.0-only
// SeekThumbnailPane geometry; bounded webOS single-decoder frame cache.
import {readPlayback} from './core/playback.js';
export function installThumbnails({screen,video,context,settings,el,blocked}) {
 const enabled=readPlayback(settings.playback).seekThumbnails,frames=[],pane=el('div',{class:'seek-thumbnail',hidden:true,'aria-label':'Prévia da posição'});
 let disposed=false,protectedMedia=false,failures=0,lastCapture=-Infinity,timer,shown=null;
 if(enabled)screen.append(pane);
 const eligible=()=>enabled&&!disposed&&!protectedMedia&&!video.mediaKeys&&!context.stream.drm&&!context.stream.drmData&&video.videoWidth>0&&video.videoHeight>0&&video.videoWidth<=1920&&video.videoHeight<=1080&&Number.isFinite(video.duration)&&!/(?:\bHDR\b|\bDV\b|Dolby.?Vision|HLG)/i.test([context.stream.name,context.stream.title,context.stream.behaviorHints?.videoHdr].join(' '));
 function hide(){clearTimeout(timer);shown=null;pane.hidden=true;pane.replaceChildren();}
 function capture(){
  if(!eligible()||document.hidden||video.paused||video.seeking||video.readyState<2||blocked()||failures>=3)return;
  const now=performance.now(),time=video.currentTime,bucket=Math.floor(time/10);if(now-lastCapture<1000||frames.some(f=>f.bucket===bucket))return;lastCapture=now;
  const canvas=document.createElement('canvas'),aspect=video.videoWidth/video.videoHeight;canvas.width=Math.min(320,Math.round(108*aspect));canvas.height=Math.round(canvas.width/aspect);
  try{canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);frames.push({bucket,time,canvas});failures=0;if(frames.length>64){const old=frames.shift();old.canvas.width=old.canvas.height=0;}}catch{canvas.width=canvas.height=0;failures++;}
 }
 function preview(time){
  if(!eligible()||document.hidden||blocked()){hide();return;}
  clearTimeout(timer);shown=time;const frame=frames.reduce((best,item)=>Math.abs(item.time-time)<Math.abs((best?.time??Infinity)-time)?item:best,null);
  if(!frame||Math.abs(frame.time-time)>10){pane.hidden=true;pane.replaceChildren();return;}
  pane.replaceChildren(frame.canvas);const width=Math.min(400,108*frame.canvas.width/frame.canvas.height);pane.style.width=`${width}px`;pane.style.left=`${32+(960-64-width)*Math.max(0,Math.min(1,time/video.duration))}px`;pane.hidden=false;
 }
 function commit(){clearTimeout(timer);if(shown!==null)timer=setTimeout(hide,3000);}
 const visibility=()=>{if(document.hidden)hide();},encrypted=()=>{protectedMedia=true;hide();for(const f of frames)f.canvas.width=f.canvas.height=0;frames.length=0;};
 const observer=new MutationObserver(()=>{if(blocked())hide();});if(enabled){observer.observe(screen,{childList:true});video.addEventListener('timeupdate',capture);video.addEventListener('encrypted',encrypted);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);}
 return {preview,commit,cancel:hide,dispose(){disposed=true;hide();observer.disconnect();video.removeEventListener('timeupdate',capture);video.removeEventListener('encrypted',encrypted);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);for(const f of frames)f.canvas.width=f.canvas.height=0;frames.length=0;pane.remove();}};
}
