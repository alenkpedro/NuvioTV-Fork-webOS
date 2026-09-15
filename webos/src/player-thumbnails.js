// SPDX-License-Identifier: GPL-3.0-only
// SeekThumbnailPane geometry; bounded webOS single-decoder frame cache.
import {readPlayback} from './core/playback.js';
export function installThumbnails({screen,video,context,settings,el,blocked,onUnavailable}) {
 const enabled=readPlayback(settings.playback).seekThumbnails,frames=[],pane=el('div',{class:'seek-thumbnail',hidden:true,'aria-label':'Prévia da posição'});
 let disposed=false,protectedMedia=false,failures=0,blanks=0,unavailable='',lastCapture=-Infinity,timer,shown=null,frameCallback=0;
 if(enabled)screen.append(pane);
 const eligible=()=>enabled&&!disposed&&!protectedMedia&&!video.mediaKeys&&!context.stream.drm&&!context.stream.drmData&&video.videoWidth>0&&video.videoHeight>0&&video.videoWidth<=4096&&video.videoHeight<=2304&&Number.isFinite(video.duration);
 // 4K frames cost more to scale, so the capture window is wider there; playback keeps
 // priority. Cross-origin sources are fine: the canvas is only displayed, never read.
 const captureWindow=()=>video.videoWidth>1920?1500:1000;
 function hide(){clearTimeout(timer);shown=null;pane.hidden=true;pane.replaceChildren();}
 // Some TVs composite the video in a hardware plane the canvas cannot read: drawImage answers
 // black. Sampling the first pixels tells a black answer from a dark scene, and a black frame is
 // never cached or shown. A tainted canvas is not evidence, so the frame is kept.
 function blankFrame(canvas){
  try{
   const context2d=canvas.getContext('2d'),w=canvas.width,h=canvas.height,crop=Math.min(8,w,h);
   // Nine patches across the frame: a dark scene still has a lit pixel somewhere, and a frame the
   // compositor never painted is black everywhere.
   for(const x of [0,Math.round((w-crop)/2),w-crop])for(const y of [0,Math.round((h-crop)/2),h-crop]){
    const data=context2d.getImageData(x,y,crop,crop).data;
    for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>12)return false;
   }
   return true;
  }catch{return false;}
 }
 function capture(){
  if(!eligible()||document.hidden||video.paused||video.seeking||video.readyState<2||blocked()||failures>=3||unavailable)return;
  const now=performance.now(),time=video.currentTime,bucket=Math.floor(time/10);if(now-lastCapture<captureWindow()||frames.some(f=>f.bucket===bucket))return;
  const canvas=document.createElement('canvas'),aspect=video.videoWidth/video.videoHeight;canvas.width=Math.min(320,Math.round(108*aspect));canvas.height=Math.round(canvas.width/aspect);
  try{
   canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
   if(blankFrame(canvas)){
    canvas.width=canvas.height=0;blanks++;
    if(blanks===2){unavailable='A TV não entrega o quadro para a prévia desta fonte (o vídeo é composto por hardware); as miniaturas ficam desligadas nesta reprodução.';onUnavailable?.(unavailable);hide();}
    return;
   }
   blanks=0;lastCapture=now;frames.push({bucket,time,canvas});
   if(frames.length>64){const old=frames.shift();old.canvas.width=old.canvas.height=0;}
  }catch{canvas.width=canvas.height=0;failures++;if(failures===1){unavailable='A TV não permitiu capturar o quadro desta fonte (a origem não autoriza leitura); as miniaturas ficam desligadas nesta reprodução.';onUnavailable?.(unavailable);hide();}}
 }
 function preview(time){
  if(!eligible()||document.hidden||blocked()){hide();return;}
  clearTimeout(timer);shown=time;const frame=frames.reduce((best,item)=>Math.abs(item.time-time)<Math.abs((best?.time??Infinity)-time)?item:best,null);
  // The nearest frame of the shots already played is always the answer: moving one frame ahead
  // must not blank the pane.
  if(!frame){pane.hidden=true;pane.replaceChildren();return;}
  pane.replaceChildren(frame.canvas);const width=Math.min(400,108*frame.canvas.width/frame.canvas.height);pane.style.width=`${width}px`;pane.style.left=`${32+(960-64-width)*Math.max(0,Math.min(1,time/video.duration))}px`;pane.hidden=false;
 }
 function commit(){clearTimeout(timer);if(shown!==null)timer=setTimeout(hide,3000);}
 // requestVideoFrameCallback hands over a frame that was actually presented to the compositor,
 // which is what makes drawImage return the picture on a TV; timeupdate is the fallback.
 const hasFrames=typeof video.requestVideoFrameCallback==='function';
 const schedule=()=>{if(!enabled||disposed||!hasFrames||protectedMedia||unavailable)return;frameCallback=video.requestVideoFrameCallback(()=>{frameCallback=0;capture();schedule();});};
 const visibility=()=>{if(document.hidden)hide();},encrypted=()=>{protectedMedia=true;hide();for(const f of frames)f.canvas.width=f.canvas.height=0;frames.length=0;};
 const observer=new MutationObserver(()=>{if(blocked())hide();});
 if(enabled){
  observer.observe(screen,{childList:true});
  if(hasFrames)schedule();else video.addEventListener('timeupdate',capture);
  video.addEventListener('seeked',capture);video.addEventListener('encrypted',encrypted);
  video.addEventListener('play',schedule);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);
 }
 return {preview,commit,cancel:hide,isBlank:()=>blanks>=2,dispose(){disposed=true;hide();observer.disconnect();if(frameCallback&&typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(frameCallback);video.removeEventListener('timeupdate',capture);video.removeEventListener('seeked',capture);video.removeEventListener('encrypted',encrypted);video.removeEventListener('play',schedule);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);for(const f of frames)f.canvas.width=f.canvas.height=0;frames.length=0;pane.remove();}};
}
