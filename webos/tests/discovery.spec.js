import {test,expect} from '@playwright/test';
const base='https://discovery.test';
async function fixture(page,{many=false,large=false,secondGate=null}={}) {
 const requests=[];let fail=false;
 const catalogs=[{id:'movies',name:'Popular',type:'movie',pageSize:50,extra:[{name:'genre',options:['Drama','Crime & Mystery']}],extraSupported:['search','skip']},{id:'series',name:'Séries',type:'series',extraSupported:['search']},...(many?Array.from({length:6},(_,i)=>({id:`extra${i}`,name:`Extra ${i}`,type:'movie',extraSupported:['search']})):[])];
 const addons=['one','two'].map(name=>({url:`${base}/${name}/manifest.json?key=fixture`,manifest:{id:'same',name:`Addon ${name}`,resources:['catalog','meta'],catalogs:name==='one'?catalogs:[{id:'movies',name:'Popular',type:'movie',extraSupported:['search']}]}}));
 await page.addInitScript(addons=>{if(!localStorage.getItem('nuvio-fork.webos.v1'))localStorage.setItem('nuvio-fork.webos.v1',JSON.stringify({addons,progress:{},library:{},watched:{},guestMode:true,settings:{}}));},addons);
 await page.route(`${base}/**`,async route=>{
  const u=new URL(route.request().url()),parts=u.pathname.split('/');const extra=new URLSearchParams((parts[5] || '').replace(/\.json$/,''));const record={url:u.href,addon:parts[1],resource:parts[2],type:parts[3],id:decodeURIComponent((parts[4] || '').replace(/\.json$/,'')),search:extra.get('search'),genre:extra.get('genre'),skip:Number(extra.get('skip') || 0)};requests.push(record);
  const item=(id,name,type)=>({id,name,type,poster:`${base}/poster.svg`,background:`${base}/poster.svg`});
  if(u.pathname==='/poster.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="252" height="378"><rect width="252" height="378" fill="#163745"/><circle cx="126" cy="145" r="68" fill="#406070"/><path d="M0 280L130 180L252 280V378H0" fill="#284754"/></svg>'});
  if(record.resource==='meta')return route.fulfill({json:{meta:item(record.id,`Detalhes ${record.id}`,record.type)}});
  if(record.resource==='catalog') {
   if(fail)return route.fulfill({status:503,json:{}});
   if(record.search==='alpha')await new Promise(r=>setTimeout(r,700));
   if(record.addon==='two' && record.search){if(secondGate)await secondGate;else await new Promise(r=>setTimeout(r,250));}
   const n=large?230:record.search?20:record.type==='series'?3:50;
   const prefix=record.search || record.genre || `${record.addon}-${record.type}`;
   const metas=Array.from({length:n},(_,i)=>item(`${prefix}-${record.skip+i}`,`${prefix} ${record.skip+i}`,record.type));
   return route.fulfill({json:{metas}}).catch(()=>{});
  }
  return route.abort();
 });
 return {requests,fail:()=>fail=true};
}
async function search(page){await page.goto('/');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Busca',exact:true}).click();}
async function discover(page){await search(page);await page.getByRole('button',{name:'Abrir Descobrir',exact:true}).click();}
test('Discover follows fork geometry, encodes genre, pages by skipStep and restores filters/focus from detail',async({page})=>{
 const f=await fixture(page);await discover(page);await expect(page.locator('.discover-grid .card')).toHaveCount(50);const picker=page.locator('[data-picker="Tipo"]');const box=await picker.boundingBox();expect(box.x).toBe(96);expect(box.width).toBeCloseTo(560,0);
 await page.locator('[data-picker="Gênero"]').click();await page.getByRole('dialog').getByRole('button',{name:'Crime & Mystery',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.discover-grid .card').first()).toHaveAttribute('aria-label','Crime & Mystery 0');expect(f.requests.some(r=>r.genre==='Crime & Mystery' && r.url.includes('key=fixture'))).toBe(true);
 await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await expect(page.locator('.discover-grid .card').first()).toHaveAttribute('aria-label','Crime & Mystery 50');const target=page.locator('.discover-grid .card').nth(8);const focus=await target.getAttribute('data-focus');await target.click();await expect(page.locator('.detail-title')).toBeVisible();const before=f.requests.filter(r=>r.resource==='catalog').length;await page.keyboard.press('Escape');await expect(page.locator('.discover-grid .card').nth(8)).toBeFocused();expect(await page.locator(':focus').getAttribute('data-focus')).toBe(focus);expect(f.requests.filter(r=>r.resource==='catalog')).toHaveLength(before);
 await page.keyboard.press('Escape');await expect(picker).toBeFocused();await page.screenshot({path:'test-results/discover-1920.png'});
});
test('same catalog names remain distinct; picker traps focus and LG Back closes it without leaving',async({page})=>{
 await fixture(page);await discover(page);await page.locator('[data-picker="Catálogo"]').click();await expect(page.getByRole('dialog').getByRole('button',{name:'Popular · Addon one',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Popular · Addon two',exact:true}).click();await expect(page.locator('.discover-info')).toContainText('Addon two');await expect(page.locator('.discover-grid .card').first()).toHaveAttribute('aria-label','two-movie 0');
 await page.locator('[data-picker="Tipo"]').click();await page.keyboard.press('Tab');expect(await page.locator(':focus').evaluate(n=>!!n.closest('[role=dialog]'))).toBe(true);await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true})));await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('[data-picker="Tipo"]')).toBeFocused();
});
test('live search ignores stale response, restores results from detail and preserves query in view-all pagination',async({page})=>{
 const f=await fixture(page);await search(page);const input=page.getByRole('searchbox',{name:'Buscar título'});await input.fill('alpha');await expect.poll(()=>f.requests.some(r=>r.search==='alpha')).toBe(true);await input.fill('beta');await expect(page.locator('.search-results .card').first()).toHaveAttribute('aria-label','beta 0');await expect(page.locator('.search-results')).not.toContainText('alpha');
 const c=page.locator('.search-results .card').nth(5);await c.click();await expect(page.locator('.detail-title')).toBeVisible();await page.keyboard.press('Escape');await expect(input).toHaveValue('beta');await expect(page.locator('.search-results .card').nth(5)).toBeFocused();
 await page.getByRole('button',{name:'Ver todos: Popular',exact:true}).first().click();await expect(page.locator('.discover-grid .card')).toHaveCount(20);await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await expect(page.locator('.discover-grid .card').first()).toHaveAttribute('aria-label','beta 50');expect(f.requests.some(r=>r.search==='beta' && r.skip===50)).toBe(true);
 await page.keyboard.press('Escape');await page.screenshot({path:'test-results/search-1920.png'});
});
test('recent queries persist and can be removed; catalog search batches keep at most 96 posters',async({page})=>{
 await fixture(page,{many:true});await search(page);const input=page.getByRole('searchbox',{name:'Buscar título'});await input.fill('test');await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.locator('.search-results .card')).toHaveCount(96);await expect(page.locator('.discovery-paging')).toContainText('de 9');await page.getByRole('button',{name:'Próximos catálogos',exact:true}).click();await expect(page.locator('.search-results .card')).toHaveCount(48);
 await page.getByRole('button',{name:'Limpar',exact:true}).click();await expect(page.locator('.recent-row')).toContainText('test');await page.reload();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Busca',exact:true}).click();await expect(page.locator('.recent-row')).toContainText('test');await page.getByRole('button',{name:'Remover pesquisa: test',exact:true}).click();await expect(page.locator('.recent-row')).toHaveCount(0);
});
test('large catalog displays 100 cards per page and failures preserve the previous usable page',async({page})=>{
 const f=await fixture(page,{large:true});await discover(page);await expect(page.locator('.discover-grid .card')).toHaveCount(100);await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await expect(page.locator('.discover-grid .card').first()).toHaveAttribute('aria-label','one-movie 100');await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await expect(page.locator('.discover-grid .card')).toHaveCount(30);f.fail();await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await expect(page.locator('.discovery-status')).toContainText('503');await expect(page.locator('.discover-grid .card')).toHaveCount(30);
});
test('home catalog ordering and visibility persist without hiding catalogs from Discover',async({page})=>{
 await fixture(page);await page.goto('/');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Ajustes',exact:true}).click();await page.getByRole('button',{name:'Conteúdo e Descoberta',exact:true}).click();await page.getByRole('button',{name:/Catálogos do início/}).click();await page.getByRole('button',{name:'Subir: Séries',exact:true}).click();await page.getByRole('button',{name:'Ocultar: Popular',exact:true}).first().click();await page.reload();await expect(page.locator('.home-rows .catalog-section h2').first()).toContainText('Séries');await discover(page);await page.locator('[data-picker="Catálogo"]').click();await expect(page.getByRole('dialog').getByRole('button',{name:'Popular · Addon one',exact:true})).toBeVisible();
});

test('late addon results preserve a scrolled rail and focused poster',async({page})=>{
 let release;const secondGate=new Promise(resolve=>release=resolve);
 await fixture(page,{secondGate});await search(page);await page.getByRole('searchbox',{name:'Buscar título'}).fill('scroll');await page.getByRole('button',{name:'Buscar',exact:true}).click();
 await expect(page.locator('.search-results .card')).toHaveCount(32);
 const rail=page.locator('.search-results .rail').first(),poster=rail.locator('.card').nth(12);
 await poster.evaluate(n=>{n.focus();n.scrollIntoView({block:'nearest',inline:'nearest'});});
 const left=await rail.evaluate(n=>n.scrollLeft);expect(left).toBeGreaterThan(0);
 release();await expect(page.locator('.search-results .card')).toHaveCount(48);
 await expect(poster).toBeFocused();expect(await rail.evaluate(n=>n.scrollLeft)).toBeCloseTo(left,0);
 const bounds=await poster.boundingBox(),viewport=await rail.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(viewport.x-1);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.x+viewport.width+1);
});
