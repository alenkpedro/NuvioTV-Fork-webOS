// SPDX-License-Identifier: GPL-3.0-only
import { readPlayback } from './core/playback.js';
export function playbackSettingsScreen({main,settings,persist,el}) {
  const prefs = settings.playback = readPlayback(settings.playback);
  const languages = [['pt-br','Português (Brasil)'],['pt','Português'],['en','Inglês'],['es','Espanhol'],['fr','Francês'],['de','Alemão'],['it','Italiano'],['ja','Japonês'],['ko','Coreano'],['zh','Chinês'],['ru','Russo'],['ar','Árabe'],['hi','Hindi'],['nl','Holandês']];
  main.append(el('h1',{},'Idiomas e próximo episódio'),el('p',{class:'muted'},'Preferências salvas nesta TV. As escolhas lembradas no player pertencem a cada título e perfil.'));
  const select = (key,title,options) => {
    if (!options.some(([value])=>value === prefs[key])) options = [...options,[prefs[key],prefs[key]]];
    const input = el('select',{'aria-label':title,onchange:e=>{prefs[key]=e.target.value;persist();}},options.map(([value,label])=>el('option',{value,selected:value===prefs[key]},label)));
    main.append(el('label',{class:'setting'},el('span',{},title),input));
  };
  const toggle = (key,title) => main.append(el('label',{class:'setting'},el('span',{},title),el('input',{type:'checkbox',checked:prefs[key],'aria-label':title,onchange:e=>{prefs[key]=e.target.checked;persist();}})));
  select('audio','Idioma do áudio',[['device','Idioma da TV'],['default','Padrão da fonte'],['original','Idioma original'],...languages]);
  select('secondaryAudio','Áudio secundário',[['','Nenhum'],...languages]);
  select('subtitles','Idioma das legendas',[['device','Idioma da TV'],['off','Desativadas'],...languages]);
  select('secondarySubtitles','Legenda secundária',[['','Nenhuma'],...languages]);
  toggle('rememberTracks','Lembrar áudio e legendas por título');
  toggle('forcedSubtitles','Usar legendas forçadas quando o áudio coincidir');
  toggle('onlyPreferredSubtitles','Mostrar só idiomas preferidos no painel');
  toggle('stripSdh','Remover descrições SDH das legendas externas');
  toggle('addonSubtitles','Buscar legendas de addons automaticamente');
  main.append(el('p',{class:'muted'},'Forçadas: traduzem trechos pontuais quando o áudio já está no idioma desejado. SDH: descrições de sons e identificação de falantes. A limpeza SDH não altera legendas internas. Sem uma faixa compatível, o áudio da fonte é mantido. Legendas de addons também podem ser buscadas manualmente no player.'));
  toggle('autoNext','Reproduzir próximo episódio automaticamente');
  toggle('preferBingeGroup','Preferir o mesmo grupo de reprodução');
  toggle('nextFallback','Usar outra fonte se o grupo não estiver disponível');
  select('thresholdMode','Quando mostrar o próximo episódio',[['percentage','Porcentagem assistida'],['minutes','Minutos antes do fim']]);
  for (const [key,title,min,max,step] of [['thresholdPercent','Porcentagem assistida',97,100,0.5],['thresholdMinutes','Minutos antes do fim',0,3.5,0.5]]) {
    const input=el('input',{type:'number',min,max,step,value:prefs[key],'aria-label':title,onchange:e=>{const value=Number(e.target.value);if(Number.isFinite(value))prefs[key]=Math.max(min,Math.min(max,value));e.target.value=prefs[key];persist();}});
    main.append(el('label',{class:'setting'},el('span',{},title),input));
  }
}
