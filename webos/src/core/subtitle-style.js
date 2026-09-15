// SPDX-License-Identifier: GPL-3.0-only
// SubtitleSelectionOverlay.StyleRail; the family comes from the packaged Netflix Sans.
export const textColors=['#ffffff','#d9d9d9','#ffd700','#00e5ff','#ff5c5c','#00ff88'];
export const outlineColors=['#000000','#ffffff','#00e5ff','#ff5c5c'];
// The user asked for the look the port already had (Netflix Sans Medium) to be the bold
// state, and the lighter state to be a thinner face. Styles saved before v2 keep Medium.
export const subtitleStyleDefaults=Object.freeze({v:2,size:100,bold:true,color:'#ffffff',opacity:100,outline:true,outlineColor:'#000000',offset:5});
export function readSubtitleStyle(value={}) {
 const legacyBold = value?.v === 2 ? undefined : true;
 const out={...subtitleStyleDefaults,bold:legacyBold ?? subtitleStyleDefaults.bold};
 for(const [key,min,max]of [['size',50,200],['opacity',0,100],['offset',-20,50]])if(Number.isFinite(value?.[key]))out[key]=Math.max(min,Math.min(max,value[key]));
 for(const key of ['bold','outline'])if(typeof value?.[key]==='boolean')out[key]=value[key];
 if(textColors.includes(value?.color))out.color=value.color;if(outlineColors.includes(value?.outlineColor))out.outlineColor=value.outlineColor;return out;
}
// Bold is the packaged Netflix Sans Medium. Without bold the port asks for the packaged
// Netflix Sans Regular, with the Inter variable font as a fallback if the file is missing.
export const subtitleFamilyBold = "'Netflix Sans', Inter, Arial, sans-serif";
export const subtitleFamilyLight = "'Netflix Sans Regular', Inter, Arial, sans-serif";
export function applySubtitleStyle(screen,value) {
 const s=readSubtitleStyle(value),rgb=[1,3,5].map(i=>parseInt(s.outlineColor.slice(i,i+2),16));
 const shadow=(alpha)=>`rgba(${rgb.join(',')},${alpha})`;
 const vars={size:`${19.44*s.size/100}px`,weight:s.bold?'500':'400',family:s.bold?subtitleFamilyBold:subtitleFamilyLight,color:`rgba(${[1,3,5].map(i=>parseInt(s.color.slice(i,i+2),16)).join(',')},${s.opacity/100})`,bottom:`${6.5+s.offset-5}%`,shadow:s.outline?`0 .5px 1px ${shadow(1)},.5px 0 .5px ${shadow(.9)},-.5px 0 .5px ${shadow(.9)},0 -.5px .5px ${shadow(.75)}`:'none'};
 for(const [key,val]of Object.entries(vars))screen.style.setProperty(`--sub-${key}`,val);
}
