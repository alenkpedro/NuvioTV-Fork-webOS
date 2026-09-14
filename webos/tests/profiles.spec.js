import {test,expect} from '@playwright/test';
const user={id:'profile-fixture-user',email:'profiles@example.test'};
async function setup(page,{locksFail=false}={}) {
  const calls=[];let libraryFail=false,remotePresent=true;
  await page.addInitScript(({user})=>localStorage.setItem('nuvio-fork.webos.account.v1',JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Date.now()+3600000,user})),{user});
  await page.route('https://api.nuvio.tv/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON();calls.push({path:u.pathname,body,query:u.search});const json=value=>route.fulfill({json:value});
    if(u.pathname==='/auth/v1/user')return json(user);
    if(u.pathname.endsWith('sync_pull_profiles'))return json([{profile_index:1,name:'Principal',avatar_color_hex:'#1E88E5'},{profile_index:2,name:'Cinema',uses_primary_addons:true,avatar_color_hex:'#7C3AED'}]);
    if(u.pathname.endsWith('sync_pull_profile_locks'))return locksFail?route.fulfill({status:503,json:{}}):json([{profile_index:1,pin_enabled:false},{profile_index:2,pin_enabled:true}]);
    if(u.pathname.endsWith('verify_profile_pin'))return json([{unlocked:body.p_pin==='1234',retry_after_seconds:body.p_pin==='0000'?2:0}]);
    if(u.pathname.endsWith('get_sync_owner'))return json('fixture-owner');
    if(u.pathname==='/rest/v1/addons')return json([{url:'https://profiles-addon.fixture/manifest.json',enabled:true}]);
    if(u.pathname.endsWith('sync_pull_profile_settings_blob'))return json([{profile_id:req.postDataJSON()?.p_profile_id,settings_json:{features:{trakt_settings:{watch_progress_source:{type:'string',value:'NUVIO_SYNC'}}}}}]);
    if(u.pathname.endsWith('sync_pull_watch_progress') || u.pathname.endsWith('sync_pull_watched_items'))return json([]);
    if(u.pathname.endsWith('sync_pull_library'))return libraryFail?route.fulfill({status:503,json:{}}):json(remotePresent?[{content_id:`tt${body.p_profile_id}`,content_type:'movie',name:body.p_profile_id===1?'Filme principal':'Filme cinema',profile_id:body.p_profile_id}]:[]);
    if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204});return route.abort();
  });
  await page.route('https://profiles-addon.fixture/**',r=>r.fulfill({json:r.request().url().endsWith('manifest.json')?{id:'profiles.fixture',name:'Addon perfil',resources:['meta'],types:['movie'],catalogs:[]}:{meta:{id:r.request().url().includes('tt2')?'tt2':'tt1',type:'movie',name:r.request().url().includes('tt2')?'Filme cinema':'Filme principal'}}}));
  return {calls,failLibrary:value=>libraryFail=value,removeRemote:()=>remotePresent=false};
}
async function navigate(page,name) {await page.keyboard.press('Escape');await page.getByRole('button',{name,exact:true}).click();}
async function switchProfile(page) {await navigate(page,'Ajustes');await page.getByRole('button',{name:'Conta',exact:true}).click();await page.getByRole('button',{name:/^Trocar perfil/}).click();}
async function unlock(page,pin='1234') {await page.getByRole('button',{name:/Cinema/}).click();await page.getByLabel('PIN de quatro números').fill(pin);await page.getByRole('button',{name:'Entrar',exact:true}).click();}
test('profile PIN gates account data, inherits primary addons and separates favorites across reload',async({page})=>{
  const {calls}=await setup(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Quem está assistindo?'})).toBeVisible();await expect(page.getByRole('button',{name:/Principal/})).toBeFocused();expect(calls.some(c=>c.path.endsWith('sync_pull_library'))).toBe(false);
  await page.screenshot({path:'test-results/profiles-1920.png'});await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  for(const digit of ['1','2','3','4'])await page.getByRole('button',{name:digit,exact:true}).click();await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();
  await navigate(page,'Biblioteca');await expect(page.getByRole('button',{name:'Filme cinema',exact:true})).toBeVisible();expect(calls.find(c=>c.path.endsWith('/addons')).query).toContain('profile_id=eq.1');expect(calls.find(c=>c.path.endsWith('sync_pull_library')).body.p_profile_id).toBe(2);await page.screenshot({path:'test-results/profile-library-1920.png'});
  await page.getByRole('button',{name:'Filme cinema',exact:true}).click();await page.getByRole('button',{name:'Remover da biblioteca',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Filme cinema',exact:true})).toHaveCount(0);
  await switchProfile(page);await page.getByRole('button',{name:/Principal/}).click();await expect(page.locator('.sidebar')).toBeVisible();await navigate(page,'Biblioteca');await expect(page.getByRole('button',{name:'Filme principal',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Filme cinema',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Quem está assistindo?'})).toBeVisible();await unlock(page);await expect(page.locator('.sidebar')).toBeVisible();await navigate(page,'Biblioteca');await expect(page.getByRole('button',{name:'Filme cinema',exact:true})).toHaveCount(0);
  expect(calls.some(c=>/sync_push|sync_delete|set_profile_pin/.test(c.path))).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('nuvio-fork.webos.v1'))).not.toContain('1234');expect(errors).toEqual([]);
});
test('wrong PIN respects cooldown and LG Back cancels without exposing profile data',async({page})=>{
  const {calls}=await setup(page);await page.goto('/');await unlock(page,'0000');await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeDisabled();await expect(page.getByRole('dialog')).toContainText('Aguarde');expect(calls.some(c=>c.path.endsWith('sync_pull_library'))).toBe(false);await page.screenshot({path:'test-results/profile-pin-1920.png'});
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:/Cinema/})).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('.sidebar')).toHaveCount(0);
});
test('lock lookup failure cannot open cached account data',async({page})=>{
  const {calls}=await setup(page,{locksFail:true});await page.addInitScript(()=>localStorage.setItem('nuvio-fork.webos.v1',JSON.stringify({addons:[],progress:{},library:{secret:{id:'secret',type:'movie',name:'Biblioteca privada'}},accountSync:{userId:'profile-fixture-user',profileId:1}})));
  await page.goto('/');await expect(page.locator('.profile-status')).toContainText('indisponível');await expect(page.locator('.sidebar')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByText('Biblioteca privada')).toHaveCount(0);expect(calls.some(c=>c.path.endsWith('sync_pull_library'))).toBe(false);
});
test('failed library refresh preserves snapshot; complete empty snapshot removes remote entries',async({page})=>{
  const state=await setup(page);await page.goto('/');await page.getByRole('button',{name:/Principal/}).click();await expect(page.locator('.sidebar')).toBeVisible();await navigate(page,'Biblioteca');await expect(page.getByRole('button',{name:'Filme principal',exact:true})).toBeVisible();
  state.failLibrary(true);await page.getByRole('button',{name:'Atualizar biblioteca',exact:true}).click();await expect(page.locator('.library-sync-status')).toContainText('indisponível');await expect(page.getByRole('button',{name:'Filme principal',exact:true})).toBeVisible();
  state.failLibrary(false);state.removeRemote();await page.getByRole('button',{name:'Atualizar biblioteca',exact:true}).click();await expect(page.getByRole('button',{name:'Filme principal',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nuvio-fork.webos.v1')).librarySync.count)).toBe(0);
});
test('all six fork profiles fit the TV canvas and remain reachable by remote',async({page})=>{
  await setup(page);await page.route('**/sync_pull_profiles',r=>r.fulfill({json:Array.from({length:6},(_,i)=>({profile_index:i+1,name:`Pessoa ${i+1}`}))}));await page.route('**/sync_pull_profile_locks',r=>r.fulfill({json:Array.from({length:6},(_,i)=>({profile_index:i+1,pin_enabled:false}))}));
  await page.goto('/');await expect(page.locator('.profile-card')).toHaveCount(6);await expect(page.locator('.profile-card').first()).toBeFocused();
  for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');await expect(page.locator('.profile-card').last()).toBeFocused();
  const boxes=await page.locator('.profile-card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}));
  for(const b of boxes){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(1920);expect(b.bottom).toBeLessThanOrEqual(1080);}
  await page.screenshot({path:'test-results/profiles-six-1920.png'});await expect(page.locator('.profile-card').last()).toBeFocused();
});
test('late PIN approval after cancelling the dialog cannot activate a profile',async({page})=>{
  const {calls}=await setup(page);let release;const pending=new Promise(r=>release=r);await page.route('**/verify_profile_pin',async r=>{await pending;await r.fulfill({json:[{unlocked:true,retry_after_seconds:0}]}).catch(()=>{});});
  await page.goto('/');await unlock(page);await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeDisabled();await page.keyboard.press('Escape');release();
  await page.getByRole('button',{name:'Atualizar perfis',exact:true}).click();await expect(page.getByRole('button',{name:/Cinema/})).toBeEnabled();await expect(page.locator('.sidebar')).toHaveCount(0);expect(calls.some(c=>c.path.endsWith('sync_pull_library'))).toBe(false);
});
test('library pagination keeps no more than 100 posters in the DOM',async({page})=>{
  await setup(page);await page.route('**/sync_pull_library',r=>{const offset=r.request().postDataJSON().p_offset;return r.fulfill({json:Array.from({length:offset===0?100:1},(_,i)=>({content_id:`tt${offset+i}`,content_type:'movie',profile_id:1,name:`Filme ${offset+i}`}))});});
  await page.goto('/');await page.getByRole('button',{name:/Principal/}).click();await expect(page.locator('.sidebar')).toBeVisible();await navigate(page,'Biblioteca');await expect(page.locator('.library-content .card')).toHaveCount(100);await page.getByRole('button',{name:'Próxima página',exact:true}).click();await expect(page.locator('.library-content .card')).toHaveCount(1);await expect(page.getByRole('button',{name:'Filme 100',exact:true})).toBeFocused();await page.getByRole('button',{name:'Página anterior',exact:true}).click();await expect(page.locator('.library-content .card')).toHaveCount(100);
});
