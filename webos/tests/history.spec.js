import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const user={id:'history-user',email:'history@example.test'};
const meta={id:'ttmovie',type:'movie',name:'Filme retomado'};
async function fixture(page,{local=false,source='NUVIO_SYNC'}={}){
 const calls=[];let fail=false,empty=false,watchedRemoved=false;
 await page.addInitScript(({user,local})=>{
  localStorage.setItem('nuvio-fork.webos.account.v1',JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Date.now()+3600000,user}));
  if(local && !localStorage.getItem('nuvio-fork.webos.v1')) localStorage.setItem('nuvio-fork.webos.v1',JSON.stringify({addons:[],progress:{'["movie","ttmovie"]':{type:'movie',id:'ttmovie',meta:{id:'ttmovie',type:'movie',name:'Filme retomado'},time:10,duration:60,updated:1789390800000}},watched:{},accountSync:{userId:user.id,profileId:1}}));
 },{user,local});
 await page.route('https://api.nuvio.tv/**',r=>{
  const path=new URL(r.request().url()).pathname,b=r.request().postDataJSON();calls.push({path,b});const json=value=>r.fulfill({json:value});
  if(path==='/auth/v1/user')return json(user);
  if(path.endsWith('sync_pull_profiles'))return json([{profile_index:1,name:'Principal'}]);
  if(path.endsWith('sync_pull_profile_locks'))return json([{profile_index:1,pin_enabled:false}]);
  if(path.endsWith('get_sync_owner'))return json('owner');
  if(path==='/rest/v1/addons')return json([{url:'https://history.fixture/manifest.json'}]);
  if(path.endsWith('sync_pull_library'))return json([{profile_id:1,content_id:'ttmovie',content_type:'movie',name:'Filme retomado'}]);
  if(path.endsWith('sync_pull_profile_settings_blob'))return json([{profile_id:1,settings_json:{features:{trakt_settings:{watch_progress_source:{type:'string',value:source}}}}}]);
  if(path.endsWith('sync_pull_watch_progress'))return json(empty?[]:[{profile_id:1,content_id:'ttmovie',content_type:'movie',video_id:'ttmovie',position:25000,duration:60000,last_watched:1789394400000}]);
  if(path.endsWith('sync_pull_watched_items'))return fail?r.fulfill({status:503,json:{}}):json(empty || watchedRemoved?[]:[{profile_id:1,content_id:'ttwatched',content_type:'movie',title:'Filme já visto',watched_at:1789398000000}]);
  if(path.endsWith('sync_delete_watched_items')){watchedRemoved=true;return r.fulfill({status:204});}
  if(path.endsWith('sync_push_watch_progress'))return r.fulfill({status:204});
  return r.abort();
 });
 await page.route('https://history.fixture/**',r=>{
  const url=r.request().url();if(url.endsWith('manifest.json'))return r.fulfill({json:{id:'history',name:'Histórico teste',resources:['meta','stream'],types:['movie'],catalogs:[]}});
  if(url.includes('/meta/'))return r.fulfill({json:{meta}});
  if(url.includes('/stream/'))return r.fulfill({json:{streams:[{name:'Movie 1080p WEB-DL-FLUX',url:'https://history.fixture/clip.mp4'}]}});
  if(url.endsWith('clip.mp4')){const data=fs.readFileSync('tests/fixtures/clip.mp4');const range=r.request().headers().range?.match(/bytes=(\d+)-(\d*)/);const start=Number(range?.[1]||0),end=range?.[2]?Number(range[2]):data.length-1;return r.fulfill({status:range?206:200,contentType:'video/mp4',body:data.subarray(start,end+1),headers:{'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})}});}
  return r.abort();
 });
 return {calls,fail:()=>fail=true,empty:()=>empty=true};
}
async function history(page){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:'Histórico e assistidos',exact:true}).click();}
test('remote progress resumes native video at imported seconds and source fallback is explicit',async({page})=>{
 const {calls}=await fixture(page,{source:'TRAKT'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:'Continuar assistindo'})).toBeVisible();await expect(page.locator('.continue-card')).toHaveCount(1);await expect(page.locator('.continue-card')).toContainText('00:25');
 await page.locator('.continue-card').click();await page.getByRole('button',{name:'Reproduzir melhor fonte'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(24);await page.locator('video').evaluate(v=>v.pause());
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await history(page);await expect(page.locator('.history-summary')).toContainText('Trakt está selecionado no Android');await expect(page.locator('.history-summary')).toContainText('usando Nuvio Sync');expect(calls.some(c=>/provider_credentials|trakt|simkl/.test(c.path))).toBe(false);expect(errors).toEqual([]);
});
test('newer remote conflict preserves local progress until explicit choice, including after reload',async({page})=>{
 const {calls}=await fixture(page,{local:true});await page.goto('/');await expect(page.getByRole('heading',{name:'Continuar assistindo'})).toBeVisible();await history(page);await expect(page.locator('.history-conflict')).toHaveCount(1);await expect(page.locator('.history-conflict')).toContainText('00:10');await expect(page.locator('.history-conflict')).toContainText('00:25');await page.screenshot({path:'test-results/history-conflict-1920.png'});
 await page.getByRole('button',{name:'Usar da conta',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.history-conflict')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).progress['["movie","ttmovie"]'].time)).toBe(25);
 await page.reload();await expect(page.getByRole('heading',{name:'Continuar assistindo'})).toBeVisible();await history(page);await expect(page.locator('.history-conflict')).toHaveCount(0);expect(calls.some(c=>/provider_credentials|trakt|simkl/.test(c.path))).toBe(false);
});
test('local unwatch survives refresh and partial history failures preserve previous snapshot',async({page})=>{
 const state=await fixture(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Continuar assistindo'})).toBeVisible();await history(page);await page.getByRole('button',{name:'Assistidos',exact:true}).click();await expect(page.locator('.history-row')).toContainText('Filme já visto');await page.screenshot({path:'test-results/history-watched-1920.png'});
 await page.getByRole('button',{name:'Marcar como não assistido',exact:true}).click();await page.getByRole('button',{name:'Atualizar histórico',exact:true}).click();await expect(page.locator('.history-list')).toContainText('Nenhum assistido salvo');
 state.fail();await page.getByRole('button',{name:'Atualizar histórico',exact:true}).click();await expect(page.locator('.history-summary')).toContainText('indisponível');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).progress['["movie","ttmovie"]'].time)).toBe(25);
});
