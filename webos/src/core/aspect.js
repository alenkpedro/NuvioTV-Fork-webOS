// SPDX-License-Identifier: GPL-3.0-only
// PlayerAspectScaleUtils.kt at ysosrs123/NuvioTV-Fork@45e0984.
export const aspectModes = Object.freeze([
  ['ORIGINAL','Ajustar (Original)'],['FULL_SCREEN','Preencher Tela'],['STRETCH','Esticar'],
  ['SLIGHT_ZOOM','Zoom leve'],['CINEMA_ZOOM','Zoom cinema'],
  ['VERTICAL_STRETCH','Ajustar à altura'],['HORIZONTAL_STRETCH','Ajustar à largura'],
]);
export function readAspect(value) { return aspectModes.some(([mode])=>mode===value) ? value : 'ORIGINAL'; }
export function nextAspect(value) { return aspectModes[(aspectModes.findIndex(([mode])=>mode===readAspect(value))+1)%aspectModes.length][0]; }
export function aspectScale(mode,viewAspect,videoAspect) {
  if (!Number.isFinite(viewAspect) || viewAspect<=0) return [1,1];
  if (mode==='SLIGHT_ZOOM') return [1.15,1.15];
  if (mode==='CINEMA_ZOOM') return [1.33,1.33];
  if (!Number.isFinite(videoAspect) || videoAspect<=0) return [1,1];
  const wider=videoAspect>viewAspect, scale=wider ? videoAspect/viewAspect : viewAspect/videoAspect;
  if (mode==='FULL_SCREEN' || (mode==='VERTICAL_STRETCH' && wider) || (mode==='HORIZONTAL_STRETCH' && !wider)) return [scale,scale];
  if (mode==='STRETCH') return wider ? [1,scale] : [scale,1];
  return [1,1];
}
export function installAspect({video,settings,persist,notify}) {
  let mode=readAspect(settings.aspectMode);
  function apply() { const [x,y]=aspectScale(mode,video.clientWidth/video.clientHeight,video.videoWidth/video.videoHeight); video.style.transform=`scale(${x}, ${y})`; video.dataset.aspectMode=mode; }
  for (const name of ['loadedmetadata','resize']) video.addEventListener(name,apply);
  window.addEventListener('resize',apply);apply();
  return {label:()=>aspectModes.find(([key])=>key===mode)[1],cycle(){mode=nextAspect(mode);settings.aspectMode=mode;apply();persist();notify(aspectModes.find(([key])=>key===mode)[1]);},dispose(){for(const name of ['loadedmetadata','resize'])video.removeEventListener(name,apply);window.removeEventListener('resize',apply);video.style.transform='';}};
}
