// SPDX-License-Identifier: GPL-3.0-only
// SeekThumbnailEngine.kt: the fork reads frames from the stream itself with one
// MediaMetadataRetriever per session — never from the surface that is playing. The port does the
// same with one hidden video element: the browser paints the frame it seeks to, so the pane never
// depends on reading pixels back (a TV answers black to that) and the playing picture is left
// alone. The element is created on the first preview, so nothing is fetched until the viewer
// actually scrubs.
import {readPlayback} from './core/playback.js';
const playableURL = value => typeof value === 'string' && /^https?:/i.test(value.trim()) ? value.trim() : '';
export function installThumbnails({screen,video,context,settings,el,blocked,onUnavailable}) {
 const enabled=readPlayback(settings.playback).seekThumbnails;
 const pane=el('div',{class:'seek-thumbnail',hidden:true,'aria-label':'Prévia da posição'});
 const source=playableURL(context.stream?.url);
 let disposed=false,protectedMedia=false,unavailable='',extractor=null,seeking=false,pending=null,frameAt=-1,watchdog=null,shown=null,timer=null;
 if(enabled)screen.append(pane);
 // DRM, protected media and anything that is not an HTTP(S) stream have no frame to read.
 const eligible=()=>enabled&&!disposed&&!unavailable&&!protectedMedia&&Boolean(source)&&!context.stream?.drm&&!context.stream?.drmData&&!video.mediaKeys&&Number.isFinite(video.duration)&&video.duration>0;
 function hide(){clearTimeout(timer);shown=null;pane.hidden=true;}
 function fail(message){unavailable=message;clearTimeout(watchdog);watchdog=null;hide();extractor?.removeAttribute('src');extractor?.remove();extractor=null;onUnavailable?.(message);}
 function apply(){
  if(shown===null||disposed||!extractor)return;
  const aspect=(extractor.videoWidth||16)/(extractor.videoHeight||9),width=Math.min(400,108*aspect);
  pane.style.width=`${width}px`;pane.style.left=`${32+(960-64-width)*Math.max(0,Math.min(1,shown/video.duration))}px`;
  // Nothing is shown until a frame is really there: the pane never displays an empty box.
  pane.hidden=frameAt<0;
 }
 function request(time){
  if(!extractor)return;
  if(seeking){pending=time;return;}
  if(frameAt>=0&&Math.abs(frameAt-time)<1.5){apply();return;}
  seeking=true;
  try{extractor.currentTime=time;}catch{seeking=false;}
 }
 function ensureExtractor(){
  if(extractor||!eligible())return extractor;
  extractor=el('video',{class:'seek-thumbnail-video',src:source,muted:true,playsinline:true,preload:'metadata','aria-hidden':true});
  extractor.addEventListener('seeked',()=>{
   frameAt=Number.isFinite(extractor.currentTime)?extractor.currentTime:-1;
   seeking=false;clearTimeout(watchdog);watchdog=null;
   if(pending!==null){const next=pending;pending=null;request(next);}
   apply();
  });
  extractor.addEventListener('error',()=>fail('A TV não conseguiu abrir a prévia desta fonte: o decodificador recusou o segundo vídeo.'));
  pane.append(extractor);
  // A TV that never answers the seek keeps the pane hidden and says so once, instead of covering
  // the timeline with a black block.
  watchdog=setTimeout(()=>{if(frameAt<0&&!disposed)fail('A TV não conseguiu decodificar a prévia desta fonte: o decodificador não respondeu.');},8000);
  return extractor;
 }
 function preview(time){
  if(!eligible()||document.hidden||blocked()){hide();return;}
  clearTimeout(timer);shown=time;
  if(!ensureExtractor()){hide();return;}
  request(time);apply();
 }
 function commit(){clearTimeout(timer);if(shown!==null)timer=setTimeout(hide,3000);}
 const protected2=()=>{protectedMedia=true;hide();};
 const visibility=()=>{if(document.hidden)hide();};
 const observer=new MutationObserver(()=>{if(blocked())hide();});
 if(enabled){
  observer.observe(screen,{childList:true});
  video.addEventListener('encrypted',protected2);video.addEventListener('emptied',protected2);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);
 }
 return {preview,commit,cancel:hide,dispose(){disposed=true;hide();observer.disconnect();clearTimeout(watchdog);const node=extractor;extractor=null;if(node){node.removeAttribute('src');node.remove();}video.removeEventListener('encrypted',protected2);video.removeEventListener('emptied',protected2);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);pane.remove();}};
}
