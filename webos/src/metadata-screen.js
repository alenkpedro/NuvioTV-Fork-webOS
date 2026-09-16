// SPDX-License-Identifier: GPL-3.0-only
import {enrichPlayerMetadata} from './core/player-artwork.js';
import {people,trailers,readMetadataSettings,saveMetadataSettings,youtubeId} from './core/metadata.js';
import {installRatings,collectionSection} from './ratings-screen.js';
import {createSettingsKit} from './settings-kit.js';
import {installTrailerPlayer} from './trailer-player.js';
const roles={Creator:'Criação',Director:'Direção',Writer:'Roteiro',Acting:'Atuação',Directing:'Direção',Writing:'Roteiro'};
export function launchTrailer(ytId,{signal,Bridge=globalThis.PalmServiceBridge,timeout=8000,browser=false}={}) {
  if(!youtubeId(ytId))return Promise.reject(Error('Trailer inválido.'));
  if(!Bridge)return Promise.reject(Error('A abertura na TV está disponível no webOS. Use o QR code para assistir no celular.'));
  return new Promise((resolve,reject)=>{
    const bridge=new Bridge();let done=false,timer;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);bridge.onservicecallback=()=>{};try{bridge.cancel();}catch{}error?reject(error):resolve();};
    const abort=()=>finish(new DOMException('Cancelado','AbortError'));
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(Error('A TV não confirmou a abertura. Tente o navegador ou use o QR code.')),timeout);
    bridge.onservicecallback=raw=>{try{const data=JSON.parse(raw);finish(data.returnValue===true?null:Error('Não foi possível abrir o aplicativo. Tente o navegador da TV ou use o QR code.'));}catch{finish(Error('A TV retornou uma resposta inválida.'));}};
    try{bridge.call('luna://com.webos.applicationManager/launch',JSON.stringify(browser?{id:'com.webos.app.browser',params:{target:`https://www.youtube.com/watch?v=${ytId}`}}:{id:'youtube.leanback.v4',params:{contentId:ytId}}));}catch{finish(Error('Não foi possível abrir o trailer na TV.'));}
  });
}
export function trailerDialog(ctx,trailer) {
  const {root,el,button,signal,qr}=ctx,previous=document.activeElement,controller=new AbortController();
  const dialog=el('div',{class:'app-dialog',role:'dialog','aria-modal':'true','aria-label':trailer.name}),status=el('p',{role:'status',class:'muted'},'O trailer abre no YouTube. Retorne ao Nuvio para continuar.'),url=`https://www.youtube.com/watch?v=${trailer.ytId}`;
  const close=()=>{controller.abort();signal.removeEventListener('abort',close);dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});};
  const launch=async browser=>{open.disabled=true;browserButton.disabled=true;status.textContent='Abrindo trailer…';try{await launchTrailer(trailer.ytId,{signal:controller.signal,browser});if(!controller.signal.aborted)status.textContent='Trailer enviado à TV. Retorne ao Nuvio para continuar.';}catch(error){if(!controller.signal.aborted)status.textContent=error.message;}finally{open.disabled=false;browserButton.disabled=false;}};
  const open=button('Abrir no YouTube',()=>launch(false)),browserButton=button('Abrir no navegador da TV',()=>launch(true));
  dialog.append(el('section',{class:'dialog-panel trailer-panel'},el('h2',{},trailer.name),el('div',{class:'trailer-pair'},qr(url),el('div',{},status,el('p',{class:'muted'},'Ou escaneie para assistir no celular.'))),el('div',{class:'toolbar'},open,browserButton,button('Fechar',close,{'data-dismiss':true}))));
  root.append(dialog);open.focus();signal.addEventListener('abort',close,{once:true});
}
export function detailExtras(ctx,meta,addon) {
  const {main,el,button,card,poster,navigate,signal,route,metadata,readTrailer}=ctx;
  const section=el('section',{class:'detail-extras'}),tabs=el('div',{class:'detail-tabs',role:'tablist','aria-label':'Mais sobre o título'}),panel=el('div',{class:'detail-extra-panel',role:'tabpanel','aria-label':'Conteúdo do título'}),source=el('p',{class:'metadata-source muted'});
  section.append(tabs,panel,source);main.append(section);
  const scoreRow=installRatings(ctx,meta),collection=collectionSection(ctx);
  section.addEventListener('focusin',()=>{main.scrollTop=Math.max(0,section.offsetTop-24);},{signal});
  let members=people(meta),videos=trailers(meta),recommendations=[],loading=metadata.configured(),error='';
  route.extraTab ||= members.length?'cast':videos.length?'trailers':'related';
  const heroTrailer=button(el('img',{src:'assets/icons/trailer_play_button.svg',alt:'',class:'trailer-action-icon'}),()=>{if(videos.length)trailerPlayer.open(videos[0]);},{class:'round-button detail-trailer-button','aria-label':'Trailer','data-focus':'detail-trailer'});main.querySelector('.detail-actions')?.append(heroTrailer);heroTrailer.addEventListener('focus',()=>{main.scrollTop=0;},{signal});
  // TrailerPlayer: the port plays the trailer in-app through the packaged proxy page, and keeps
  // the TV's YouTube app, the TV browser and the QR dialog one key away.
  const trailerPlayer=installTrailerPlayer({root:ctx.root,el,button,signal,
    external:{launch:(id,options)=>launchTrailer(id,{signal,...options})},
    more:{open:trailer=>trailerDialog(ctx,trailer||videos[0])}});
  const labels={cast:'Elenco',related:'Semelhantes',trailers:'Trailers'};
  const configure=()=>navigate({name:'metadata-settings'});
  // MetaDetailsViewModel.startIdleTimer: with "Trailer automático" on, the trailer
  // starts after the configured delay while the play button stays focused, once per
  // title. The fork plays it inside the hero; this target cannot, so the port opens
  // the same dialog the Trailer button opens and the user keeps control of the TV.
  const playButton=main.querySelector('.detail-actions .play-button');
  let idleTimer, trailerOffered=false;
  const clearIdleTimer=()=>{clearTimeout(idleTimer);idleTimer=null;};
  function armIdleTimer() {
    clearIdleTimer();
    const settings=readTrailer?.() || {};
    if(!settings.trailerAutoPlay || trailerOffered || !videos.length)return;
    if(!playButton || document.activeElement!==playButton)return;
    idleTimer=setTimeout(()=>{
      idleTimer=null;
      if(signal.aborted || trailerOffered)return;
      if(!playButton.isConnected || document.activeElement!==playButton)return;
      trailerOffered=true;
      trailerPlayer.open(videos[0]);
    },settings.trailerDelay*1000);
  }
  playButton?.addEventListener('focus',armIdleTimer,{signal});
  main.addEventListener('focusin',event=>{if(event.target!==playButton)clearIdleTimer();},{signal});
  for(const event of ['keydown','pointerdown','wheel'])main.addEventListener(event,()=>clearIdleTimer(),{signal,capture:true});
  signal.addEventListener('abort',clearIdleTimer,{once:true});
  function draw(preserve=false) {
    heroTrailer.hidden=!videos.length;
    const focused=preserve && section.contains(document.activeElement)?document.activeElement.dataset.focus:null;
    const scroll=panel.querySelector('.rail,.cast-rail,.trailer-rail')?.scrollLeft || 0;
    tabs.replaceChildren(...Object.entries(labels).flatMap(([id,label],index)=>{
      const select=()=>{if(route.extraTab===id)return;route.extraTab=id;draw();tabs.querySelector(`[data-tab="${id}"]`)?.focus();};
      return [index?el('span',{'aria-hidden':'true',class:'detail-tab-divider'},'|'):null,button(label,select,{onfocus:select,role:'tab','aria-selected':String(route.extraTab===id),'data-tab':id,'data-focus':`detail-tab-${id}`,class:route.extraTab===id?'selected':''})].filter(Boolean);
    }));
    panel.replaceChildren();panel.setAttribute('aria-label',labels[route.extraTab]);
    if(route.extraTab==='cast') {
      if(members.length)panel.append(el('div',{class:'cast-rail'},members.map((member,i)=>button([poster(member.photo,member.name,'cast-photo'),el('strong',{},member.name),el('small',{class:'muted'},roles[member.character] || member.character)],()=>navigate({name:'person',member,addon}),{class:'cast-card','data-focus':`cast-${member.name}`}))));
      else panel.append(el('p',{class:'notice'},loading?'Carregando elenco…':'O catálogo não informou o elenco.'));
    }else if(route.extraTab==='trailers') {
      if(videos.length)panel.append(el('div',{class:'trailer-rail'},videos.map(t=>button([poster(t.photo,t.name,'trailer-art'),el('strong',{},t.name),el('small',{class:'muted'},[t.type,t.lang.toUpperCase()].filter(Boolean).join(' • '))],()=>trailerPlayer.open(t),{class:'trailer-card','data-focus':`trailer-${t.ytId}`}))));
      else panel.append(el('p',{class:'notice'},loading?'Carregando trailers…':'Nenhum trailer disponível nas fontes consultadas.'));
    }else {
      if(recommendations.length)panel.append(el('div',{class:'rail related-rail'},recommendations.map(m=>card({...m,poster:m.background || m.poster},null,null,'related',{portrait:true}))));
      else panel.append(el('p',{class:'notice'},loading?'Carregando recomendações…':error || (metadata.configured()?'Nenhuma recomendação disponível para este título.':'Configure o TMDB para carregar recomendações.')));
    }
    if(!metadata.configured())panel.append(button('Configurar TMDB',configure,{class:'metadata-configure','data-focus':'detail-configure-tmdb'}));
    else if(error)panel.append(button('Tentar novamente',()=>load(),{'data-focus':'detail-retry-metadata'}));
    source.textContent=loading?'Carregando dados complementares…':error?'Dados do addon preservados. TMDB indisponível.':recommendations.length || members.some(m=>m.tmdbId)?'Metadados dos addons / TMDB':'';
    if(focused){const node=[...section.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focused);node?.focus({preventScroll:true});const rail=panel.querySelector('.rail,.cast-rail,.trailer-rail');if(rail)rail.scrollLeft=scroll;}
    armIdleTimer();
  }
  let running=false;
  async function load() {
    if(!metadata.configured() || running)return;running=true;loading=true;error='';draw(true);
    try {
      const data=await metadata.detail(meta,signal);if(signal.aborted)return;
      if(data){enrichPlayerMetadata(meta,data.meta);if(!people(meta).length)meta.castMembers=people(data.meta);members=people({castMembers:[...people(data.meta),...people(meta)]});videos=trailers({trailers:[...trailers(meta),...trailers(data.meta)]});recommendations=data.recommendations;scoreRow.update(data.meta,data.rating);draw(true);await collection.load(data.collection);}
    }catch(e){if(!signal.aborted)error=e.message;}
    finally{running=false;loading=false;if(!signal.aborted)draw(true);}
  }
  draw();return load();
}
export async function personScreen(ctx) {
  const {main,el,button,poster,card,route,signal,metadata,navigate,textDialog}=ctx,member=route.member;
  main.classList.add('person-content');main.append(el('h1',{},member.name),el('p',{role:'status'},'Carregando perfil…'));
  let person;
  try{person=await metadata.person(member,signal);}catch(error){if(signal.aborted)return;person={name:member.name,photo:member.photo,items:[],error:error.message};}
  if(signal.aborted)return;main.replaceChildren();
  const biography=person.biography || 'Biografia não disponível.',portrait=button(poster(person.photo,person.name,'person-photo'),()=>textDialog(person.name,biography),{'aria-label':`Ler biografia de ${person.name}`,'data-focus':'person-biography',class:'person-portrait'});
  portrait.addEventListener('focus',()=>{main.scrollTop=0;},{signal});
  main.append(el('section',{class:'person-hero'},portrait,el('div',{class:'person-info'},el('h1',{},person.name),el('p',{class:'muted'},[roles[person.knownFor] || person.knownFor,person.birthday,person.deathday?`Falecimento: ${person.deathday}`:'',person.placeOfBirth].filter(Boolean).join(' • ')),el('p',{class:'person-biography'},biography))));
  if(person.error)main.append(el('p',{class:'notice'},person.error),button(metadata.configured()?'Revisar TMDB':'Configurar TMDB',()=>navigate({name:'metadata-settings'})),button('Tentar novamente',()=>navigate({...route},true)));
  const credits=person.items || [];let page=Math.min(route.creditPage || 0,Math.max(0,Math.ceil(credits.length/30)-1));const section=el('section',{class:'filmography'});main.append(section);
  function draw(focus=false){route.creditPage=page;section.replaceChildren(el('div',{class:'section-head'},el('h2',{},'Filmografia'),el('span',{class:'muted'},`${credits.length} títulos`)),el('div',{class:'rail filmography-rail'},credits.slice(page*30,(page+1)*30).map(m=>card(m,null,null,'filmography',{portrait:true}))));if(credits.length>30)section.append(el('div',{class:'toolbar'},button('Anteriores',()=>{page--;draw(true);},{disabled:page===0}),button('Próximos',()=>{page++;draw(true);},{disabled:(page+1)*30>=credits.length})));if(focus)section.querySelector('.card')?.focus();}
  draw();main.append(el('p',{class:'metadata-source muted'},person.error?'Dados do addon':'Dados de pessoas e filmografia: TMDB'));
}
export function metadataSettingsScreen(ctx) {
  const {main,el,button,icon,toast,metadata,signal}=ctx,config=readMetadataSettings(localStorage);
  const kit=createSettingsKit({el,button,icon,toast});
  const pane=el('div',{class:'settings-pane'});
  let validation;signal?.addEventListener('abort',()=>validation?.abort(),{once:true});
  // The TV keyboard drops characters in secret fields, so the key is typed in the open with
  // a counter: the user sees 32/32 before saving (same shape as the MDBList screen).
  const normalizeKey = value => String(value || '').replace(/[\s-]/g, '').toLowerCase();
  function draw(){
    const input=el('input',{type:'text',inputmode:'text','aria-label':'Chave de API TMDB',autocomplete:'off',spellcheck:'false',maxlength:40,placeholder:config.key?'Chave salva — deixe vazio para manter':'Cole a chave de API v3 (32 caracteres)'}),
      counter=el('small',{class:'muted','aria-live':'polite'}),status=el('p',{role:'status'});
    const paintCounter=()=>{const clean=normalizeKey(input.value);counter.textContent=clean?`${clean.length}/32 caracteres`:'Nenhuma chave digitada.';counter.classList.toggle('warning',Boolean(clean)&&!/^[a-f0-9]{32}$/.test(clean));};
    input.addEventListener('input',paintCounter);
    const save=button('Salvar e verificar',async()=>{validation?.abort();const active=validation=new AbortController();save.disabled=true;try{const typed=normalizeKey(input.value),key=typed || config.key;if(!key)throw Error('Informe sua chave de API v3 do TMDB.');if(!/^[a-f0-9]{32}$/.test(key))throw Error(`A chave do TMDB tem 32 caracteres; chegaram ${key.length}.`);saveMetadataSettings(localStorage,{key,language:config.language});config.key=key;input.value='';paintCounter();input.placeholder='Chave salva — deixe vazio para manter';metadata.clear();status.textContent='Verificando…';await metadata.validate(active.signal);if(!signal?.aborted && !active.signal.aborted)status.textContent='TMDB conectado. Reabra os detalhes do título para carregar os dados.';}catch(error){if(!signal?.aborted && !active.signal.aborted)status.textContent=error.message;}finally{if(validation===active)save.disabled=false;}},{class:'primary'});
    const remove=button('Remover chave',()=>{validation?.abort();try{saveMetadataSettings(localStorage,{key:'',language:config.language});config.key='';input.value='';paintCounter();metadata.clear();status.textContent='TMDB desativado nesta TV. Os dados dos addons continuam disponíveis.';}catch{status.textContent='Não foi possível alterar o armazenamento desta TV.';}});
    const languages=[['pt-BR','Português (Brasil)'],['en-US','English'],['es-ES','Español']];
    pane.replaceChildren(
      kit.header('TMDB','Elenco, imagens, recomendações e trailers dos títulos.'),
      kit.group('Chave da API','Complete o que os add-ons não trazem; a chave fica somente nesta TV',
        kit.field({title:'Chave da API TMDB',subtitle:'32 caracteres; nenhuma URL de vídeo ou credencial Nuvio é enviada',control:input,actions:[save,remove],hint:counter,status})),
      kit.group('Idioma dos metadados','Sinopses, imagens e nomes de gênero',
        kit.choices('Idioma dos metadados',...languages.map(([code,label])=>kit.chip(label,config.language===code,()=>{saveMetadataSettings(localStorage,{key:config.key,language:code});config.language=code;metadata.clear();draw();`Metadados em ${label}`})))),
      kit.note('This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    paintCounter();
  }
  main.append(el('div',{class:'settings-workspace settings-workspace-single'},pane),el('img',{src:'assets/tmdb.svg',alt:'TMDB',class:'tmdb-logo'}));
  draw();
}
