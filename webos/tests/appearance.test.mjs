import test from 'node:test';
import assert from 'node:assert/strict';
import {themeIds,defaultTheme,themeFor,readAppearance,appearanceVars,applyAppearance,settingsStyles} from '../src/core/appearance.js';
import {settingsCategories} from '../src/settings-screen.js';
import {readState,saveState,initial} from '../src/core/storage.js';
test('the twelve AppTheme palettes copy ThemeColors.kt and SupporterThemeColors.kt',()=>{
  assert.deepEqual(themeIds,['gold','jade','roseGold','arcticBlue','graphite','crimson','ocean','violet','emerald','amber','rose','white']);
  const gold=themeFor('gold');
  assert.equal(gold.label,'Dourado');assert.equal(gold.secondary,'#e8a91c');assert.equal(gold.secondaryVariant,'#9a6200');
  assert.equal(gold.background,'#0f0e0b');assert.equal(gold.backgroundCard,'#262116');assert.equal(gold.surfaceVariant,'#302a1d');assert.equal(gold.onSecondary,'#111111');assert.equal(gold.onSecondaryVariant,'#ffffff');
  assert.deepEqual(gold.gradient,['#8a5700','#e8a91c','#fff1a8','#ffd45c','#9a6200']);
  assert.deepEqual(themeFor('jade').gradient,['#7bf08d','#22d37c','#0bbf9a']);
  assert.deepEqual(themeFor('arcticBlue').gradient,['#4de3ff','#3185f5','#4d55e8']);
  assert.deepEqual(themeFor('graphite').gradient,['#f3f5f7','#aab2be','#687381']);
  assert.equal(themeFor('crimson').background,'#0a0a0e');assert.equal(themeFor('ocean').backgroundElevated,'#1a1a1e');
  assert.equal(themeFor('ocean').background,'#0d0d0f');assert.equal(themeFor('violet').background,'#0d0d0f');
  assert.equal(themeFor('emerald').background,'#0d0d0d');assert.equal(themeFor('emerald').backgroundCard,'#1a241a');
  assert.equal(themeFor('amber').background,'#0f0d0d');
  assert.equal(themeFor('violet').focusBackground,'#2d1a3d');assert.equal(themeFor('rose').backgroundCard,'#241a1f');
  // Palettes inherit every token they do not override from the shared defaults.
  assert.equal(themeFor('crimson').panel,'#1a1a1a');assert.equal(themeFor('rose').field,'#222222');
  assert.equal(themeFor('unknown'),themeFor(defaultTheme));
});
test('appearance normalizes unknown themes, AMOLED flags and settings styles',()=>{
  assert.deepEqual(readAppearance(),{theme:'white',amoled:false,amoledSurfaces:false,style:'classic'});
  assert.deepEqual(readAppearance({theme:'ocean',amoled:true,amoledSurfaces:true,style:'horizon'}),{theme:'ocean',amoled:true,amoledSurfaces:true,style:'horizon'});
  assert.equal(readAppearance({theme:'nope'}).theme,'white');assert.equal(readAppearance({style:'flat'}).style,'classic');
  assert.equal(readAppearance({amoled:'true'}).amoled,false);
  assert.deepEqual(settingsStyles.map(style=>[style.id,style.label]),[['classic','Padrão'],['zen','Minimalista'],['horizon','Barra Superior']]);
});
test('the White baseline reproduces the literals the port already used',()=>{
  const vars=appearanceVars({});
  assert.equal(vars['--background'],'#0d0d0d');assert.equal(vars['--background-elevated'],'#1a1a1a');
  assert.equal(vars['--line'],'#333333');assert.equal(vars['--focus'],'rgba(255,255,255,.14)');
  assert.equal(vars['--accent'],'#f5f5f5');assert.equal(vars['--accent-on'],'#111111');assert.equal(vars['--focus-ring'],'#ffffff');
  assert.equal(appearanceVars({theme:'gold'})['--line'],'#302a1d'); // Every other palette uses its own border token.
});
test('AMOLED and pure-black surfaces only change the tokens they own',()=>{
  const amoled=appearanceVars({amoled:true});
  assert.equal(amoled['--background'],'#000000');assert.equal(amoled['--background-elevated'],'#1a1a1a');
  const surfaces=appearanceVars({amoled:true,amoledSurfaces:true});
  for(const key of ['--surface','--surface-variant','--panel','--field','--menu','--modal','--background-elevated','--background-card'])assert.equal(surfaces[key],'#000000');
  assert.equal(surfaces['--line'],'#333333');
  assert.equal(appearanceVars({amoledSurfaces:true})['--surface'],'#1e1e1e'); // Surfaces need AMOLED itself.
});
test('applyAppearance writes theme variables and classes on the root element',()=>{
  const root={values:{},classes:new Set(),style:{setProperty(key,value){root.values[key]=value;}},classList:{toggle(name,on){on?root.classes.add(name):root.classes.delete(name);}}};
  const applied=applyAppearance(root,{theme:'jade',amoled:true,style:'zen'});
  assert.deepEqual(applied,{theme:'jade',amoled:true,amoledSurfaces:false,style:'zen'});
  assert.equal(root.values['--accent'],'#22d37c');assert.equal(root.values['--background'],'#000000');
  assert.ok(root.classes.has('theme-jade')&&root.classes.has('amoled')&&root.classes.has('settings-style-zen'));
  assert.equal(root.classes.has('theme-white'),false);assert.equal(root.classes.has('amoled-surfaces'),false);assert.equal(root.classes.has('settings-style-classic'),false);
  applyAppearance(root,{theme:'white',style:'classic'});
  assert.equal(root.classes.has('theme-jade'),false);assert.equal(root.classes.has('amoled'),false);assert.equal(root.classes.has('settings-style-classic'),true);
});
test('settings categories follow the fork order, titles and subtitles',()=>{
  assert.deepEqual(settingsCategories.map(category=>category.id),['account','profiles','appearance','layout','discovery','integration','playback','tracking','about','advanced']);
  assert.deepEqual(settingsCategories.map(category=>category.title),['Conta','Perfis','Aparência','Layout','Conteúdo e Descoberta','Integrações','Reprodução','Rastreamento','Sobre','Avançado']);
  assert.deepEqual(settingsCategories.map(category=>category.subtitle),['Conta e status de sincronização','Gerenciar perfis de usuário','Escolha seu tema de cores, fonte e idioma','Estrutura da página inicial e estilos de pôster','Add-ons, plugins, catálogos e fontes de descoberta','Gerenciar integrações disponíveis','Player, legendas e reprodução automática','Gerenciar conexões com Trakt e Simkl','Versão e políticas','Desempenho, navegação, cache e diagnósticos']);
  assert.ok(Object.isFrozen(settingsCategories));
});
test('appearance lives in the TV settings blob beside layout and playback',()=>{
  const storage={value:''};
  const store={getItem:()=>storage.value,setItem:(key,value)=>{storage.value=value;}};
  const state=readState(store);
  state.settings.layout={modernSidebar:true};
  state.settings.playback={pauseOverlay:true};
  state.settings.appearance=readAppearance({theme:'arcticBlue',amoled:true});
  assert.equal(saveState(store,state),true);
  const stored=readState(store);
  assert.deepEqual(readAppearance(stored.settings.appearance),{theme:'arcticBlue',amoled:true,amoledSurfaces:false,style:'classic'});
  assert.deepEqual(stored.settings.layout,{modernSidebar:true});
  assert.deepEqual(stored.settings.playback,{pauseOverlay:true});
});