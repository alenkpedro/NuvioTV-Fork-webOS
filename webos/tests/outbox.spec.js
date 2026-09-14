import {test,expect} from '@playwright/test';
const user={id:'outbox-owner',email:'outbox@example.test'},key='["movie","tt1"]';
async function fixture(page,{legacy=false}={}){
 const calls=[];let failure=false,held=false,release;
 const library={tt1:{profile_id:1,content_id:'tt1',content_type:'movie',name:'Filme da conta',added_at:100}};
 const progress={};const watched={tt1:{profile_id:1,content_id:'tt1',content_type:'movie',title:'Filme da conta',watched_at:200}};
 await page.addInitScript(({user,legacy})=>{
  localStorage.setItem('nuvio-fork.webos.account.v1',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Date.now()+3600000,user}));
  if(legacy && !localStorage.getItem('nuvio-fork.webos.v1'))localStorage.setItem('nuvio-fork.webos.v1',JSON.stringify({addons:[],accountSync:{userId:user.id},progress:{'["movie","tt1"]':{id:'tt1',type:'movie',meta:{id:'tt1',type:'movie',name:'Filme da conta'},time:15,duration:100,updated:100}},library:{},watched:{}}));
 },{user,legacy});
 await page.route('https://api.nuvio.tv/**',async r=>{
  const path=new URL(r.request().url()).pathname,b=r.request().postDataJSON();calls.push({path,b});const json=value=>r.fulfill({json:value});
  if(path==='/auth/v1/user')return json(user);
  if(path.endsWith('sync_pull_profiles'))return json([{profile_index:1,name:'Principal'},{profile_index:2,name:'Outro'}]);
  if(path.endsWith('sync_pull_profile_locks'))return json([{profile_index:1,pin_enabled:false},{profile_index:2,pin_enabled:false}]);
  if(path.endsWith('get_sync_owner'))return json('owner');
  if(path==='/rest/v1/addons')return json([{url:'https://outbox.fixture/manifest.json'}]);
  if(path.endsWith('sync_pull_library'))return json(b.p_profile_id===1?Object.values(library):[]);
  if(path.endsWith('sync_pull_watch_progress'))return json(b.p_profile_id===1?Object.values(progress):[]);
  if(path.endsWith('sync_pull_watched_items'))return json(b.p_profile_id===1?Object.values(watched):[]);
  if(path.endsWith('sync_pull_profile_settings_blob'))return json([]);
  if(/sync_(push|delete)_/.test(path)) {
   if(failure)return r.fulfill({status:503,json:{}});
   if(held)await new Promise(resolve=>release=resolve);
   if(path.endsWith('sync_delete_watched_items'))delete watched[b.p_keys[0].content_id];
   if(path.endsWith('sync_push_watched_items'))for(const item of b.p_items)watched[item.content_id]={...item,profile_id:b.p_profile_id};
   if(path.endsWith('sync_delete_library_items'))delete library[b.p_keys[0].content_id];
   if(path.endsWith('sync_push_library_items'))for(const item of b.p_items)library[item.content_id]={...item,profile_id:b.p_profile_id};
   if(path.endsWith('sync_push_watch_progress'))for(const item of b.p_entries)progress[item.content_id]={...item,profile_id:b.p_profile_id};
   return r.fulfill({status:204});
  }
  return r.abort();
 });
 await page.route('https://outbox.fixture/**',r=>r.fulfill({json:r.request().url().endsWith('manifest.json')?{id:'outbox',name:'Fixture',resources:['meta'],types:['movie'],catalogs:[]}:{meta:{id:'tt1',type:'movie',name:'Filme da conta'}}}));
 return {calls,progress,fail:()=>failure=true,recover:()=>failure=false,hold:()=>held=true,release:()=>{held=false;release?.();}};
}
async function openProfile(page,name='Principal'){await page.getByRole('button',{name:new RegExp(name)}).click();await expect(page.getByRole('heading',{name:'Quem está assistindo?'})).toHaveCount(0);}
async function library(page){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Biblioteca',exact:true}).click();}
async function queue(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).outbox || {});}
test('failed outbound removal persists across reload and is sent after recovery without touching another profile',async({page})=>{
 const f=await fixture(page);f.fail();await page.goto('/');await openProfile(page);await library(page);await page.getByRole('button',{name:'Histórico e assistidos',exact:true}).click();await page.getByRole('button',{name:'Assistidos',exact:true}).click();await page.getByRole('button',{name:'Marcar como não assistido',exact:true}).click();await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByRole('button',{name:'Sincronizar agora',exact:true}).click();await expect(page.locator('[data-sync-status]')).toContainText('indisponível');expect(Object.keys(await queue(page))).toHaveLength(1);
 await page.reload();await openProfile(page,'Outro');expect(Object.keys(await queue(page))).toHaveLength(0);expect(f.calls.filter(c=>/sync_(push|delete)_/.test(c.path)).every(c=>c.b.p_profile_id===1)).toBe(true);
 f.recover();await page.reload();await openProfile(page);await library(page);await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByRole('button',{name:'Sincronizar agora',exact:true}).click();await expect.poll(async()=>Object.keys(await queue(page)).length).toBe(0);await expect(page.locator('[data-sync-status]')).toContainText('Último envio confirmado');
});
test('legacy conflict requires a remote-control choice before uploading progress',async({page})=>{
 const f=await fixture(page,{legacy:true});f.progress.tt1={profile_id:1,content_id:'tt1',content_type:'movie',video_id:'tt1',position:50000,duration:100000,last_watched:200};await page.goto('/');await openProfile(page);await library(page);await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByRole('button',{name:'Sincronizar agora',exact:true}).click();await expect(page.locator('[data-sync-conflict]')).toHaveCount(1);expect(f.calls.filter(c=>/sync_push/.test(c.path))).toHaveLength(0);await page.screenshot({path:'test-results/outbound-conflict-1920.png'});
 await page.getByRole('button',{name:'Enviar desta TV',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Sincronizar agora',exact:true}).click();await expect.poll(()=>f.progress.tt1.position).toBe(15000);await expect.poll(async()=>Object.keys(await queue(page)).length).toBe(0);
});
test('favorite toggled during an in-flight request stays queued and sends the final choice',async({page})=>{
 const f=await fixture(page);await page.goto('/');await openProfile(page);await library(page);await page.locator('.card').first().click();f.hold();await page.getByRole('button',{name:'Remover da biblioteca',exact:true}).click();await expect.poll(()=>f.calls.some(c=>c.path.endsWith('sync_delete_library_items'))).toBe(true);await page.getByRole('button',{name:'Adicionar à biblioteca',exact:true}).click();f.release();await expect.poll(async()=>Object.values(await queue(page))[0]?.value?.id).toBe('tt1');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByRole('button',{name:'Sincronizar agora',exact:true}).click();await expect.poll(async()=>Object.keys(await queue(page)).length).toBe(0);expect(f.calls.filter(c=>c.path.endsWith('sync_push_library_items'))).toHaveLength(1);
});

test('connection restored event automatically drains a persisted favorite removal',async({page,context})=>{
 const f=await fixture(page);await page.goto('/');await openProfile(page);await library(page);await page.locator('.card').first().click();await context.setOffline(true);await page.getByRole('button',{name:'Remover da biblioteca',exact:true}).click();expect(Object.keys(await queue(page))).toHaveLength(1);expect(f.calls.filter(c=>/sync_(push|delete)_/.test(c.path))).toHaveLength(0);
 await context.setOffline(false);await expect.poll(async()=>Object.keys(await queue(page)).length,{timeout:10000}).toBe(0);expect(f.calls.filter(c=>c.path.endsWith('sync_delete_library_items'))).toHaveLength(1);
});
