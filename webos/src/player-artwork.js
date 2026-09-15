// SPDX-License-Identifier: GPL-3.0-only
import {artworkURL} from './core/player-artwork.js';
export function playerArtwork(el,meta,{imageClass='player-title-logo',tag='h1'}={}) {
  const title=el(tag,{},meta.name || '');
  const candidates=[...new Set([meta.logo,meta.fallbackLogo].map(artworkURL).filter(Boolean))];
  const root=el('div',{class:'player-artwork'},title);
  if(candidates.length) {
    title.hidden=true;root.classList.add('has-logo');
    const image=el('img',{class:imageClass,alt:meta.name || '',decoding:'async',onerror:()=>{
      candidates.shift();if(candidates.length)image.src=candidates[0];else {image.remove();title.hidden=false;root.classList.remove('has-logo');}
    }});
    image.src=candidates[0];root.append(image);
  }
  return root;
}
