// SPDX-License-Identifier: GPL-3.0-only
import {readSubtitleStyle,subtitleStyleDefaults,textColors,outlineColors} from './core/subtitle-style.js';
export function subtitleStyleEditor({el,button,value,change,disabled=false}) {
 const style=readSubtitleStyle(value),root=el('div',{class:'subtitle-style-editor'});
 const update=patch=>change({...style,...patch});
 const control=(text,key,action,attrs={})=>button(text,action,{'data-track-key':`appearance-${key}`,disabled,...attrs});
 const section=(title,content)=>el('section',{class:'subtitle-style-section'},el('h3',{},title),content);
 function step(title,key,amount,min,max,suffix='') {
  return section(title,el('div',{class:'subtitle-style-stepper'},control('−',`${key}-less`,()=>update({[key]:Math.max(min,style[key]-amount)}),{'aria-label':`Diminuir ${title.toLowerCase()}`,disabled:disabled||style[key]<=min}),el('span',{},`${style[key]}${suffix}`),control('+',`${key}-more`,()=>update({[key]:Math.min(max,style[key]+amount)}),{'aria-label':`Aumentar ${title.toLowerCase()}`,disabled:disabled||style[key]>=max})));
 }
 const names={'#ffffff':'Branco','#d9d9d9':'Cinza','#ffd700':'Amarelo','#00e5ff':'Ciano','#ff5c5c':'Vermelho','#00ff88':'Verde','#000000':'Preto'};
 function colors(title,key,items){return section(title,el('div',{class:'subtitle-color-row'},items.map(color=>control('',`${key}-${color.slice(1)}`,()=>update({[key]:color,...(key==='outlineColor'?{outline:true}:{})}),{class:'subtitle-color','aria-label':`${title}: ${names[color]}`,'aria-pressed':String(style[key]===color),style:`--swatch:${color}`}))));}
 root.append(step('Tamanho','size',10,50,200,'%'),section('Negrito',control(style.bold?'Ligado':'Desligado','bold',()=>update({bold:!style.bold}),{'aria-label':'Negrito','aria-pressed':String(style.bold)})),colors('Cor do texto','color',textColors),step('Opacidade do texto','opacity',10,0,100,'%'),section('Contorno',control(style.outline?'Ligado':'Desligado','outline',()=>update({outline:!style.outline}),{'aria-label':'Contorno','aria-pressed':String(style.outline)})),colors('Cor do contorno','outlineColor',outlineColors),step('Posição vertical','offset',5,-20,50),control('Restaurar aparência padrão','reset',()=>change({...subtitleStyleDefaults}),{class:'track-action'}));
 return root;
}
