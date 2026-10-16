import {test,expect} from '@playwright/test';
import {GUMROAD_PRODUCTS,GUMROAD_PENDING} from '../scripts/gumroad-catalog.mjs';
import {placements} from '../scripts/build-gumroad-sections.mjs';
test.beforeEach(async({page})=>{await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());});
for(const width of [360,768,1440]){
 test(`published collections render with real covers and fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  for(const {file,ids} of Object.values(placements)){
   await page.goto('/'+file);
   await expect(page.locator('[data-gumroad-product]')).toHaveCount(ids.length);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),file).toBeTruthy();
   for(const card of await page.locator('[data-gumroad-product]').all()){await card.scrollIntoViewIfNeeded();await expect(card).toBeVisible();await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();}
  }
  await page.goto('/products.html#shop-now');await expect(page.locator('#shop-now .gr-card')).toHaveCount(GUMROAD_PRODUCTS.length);
  for(const card of await page.locator('[data-gumroad-product]').all()){await card.scrollIntoViewIfNeeded();await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();}
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/product-line-integration/products-${width}.png`,fullPage:true});
  for(const [file,placement] of [['ee-venture.html','consulting'],['soccer.html','training']]){await page.goto('/'+file);for(const item of await page.locator('[data-reveal]').all()){await expect.poll(()=>item.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(.99);}await page.screenshot({path:`output/product-line-integration/${placement}-first-fold-${width}.png`});for(const card of await page.locator('[data-gumroad-product]').all()){await card.scrollIntoViewIfNeeded();await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();}await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/product-line-integration/${placement}-${width}.png`,fullPage:true});}
 });
}
test('each published product opens its exact destination with no original-window access',async({page,context})=>{
 await context.route('https://ballerskingdom.gumroad.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Synthetic checkout destination; no purchase</h1>'}));
 await page.goto('/products.html');
 for(const p of GUMROAD_PRODUCTS){const popupPromise=context.waitForEvent('page');await page.locator(`[data-gumroad-product="${p.id}"] .gr-cta`).click();const popup=await popupPromise;await popup.waitForLoadState();expect(popup.url()).toBe(p.url);expect(await popup.evaluate(()=>opener===null)).toBe(true);await popup.close();}
 expect(page.url()).toContain('/products.html');
});
test('full collections and collection navigation work without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce'});await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());const page=await context.newPage();
 for(const name of ['products','shop']){
  await page.goto(`http://127.0.0.1:4187/${placements[name].file}`);
  await expect(page.locator('[data-gumroad-product]')).toHaveCount(GUMROAD_PRODUCTS.length);
  const jumps=page.locator('.gr-collections a');for(const link of await jumps.all()){const href=await link.getAttribute('href');await link.click();await expect(page.locator(href)).toBeInViewport();}
 }
 await context.close();
});

test('prepared resources have no checkout links and are distinct from published cards',async({page})=>{
 for(const file of ['products.html','shop.html','soccer.html']){
  await page.goto('/'+file);await expect(page.locator('[data-gumroad-pending]')).toHaveCount(GUMROAD_PENDING.length);
  for(const p of GUMROAD_PENDING){const notice=page.locator(`[data-gumroad-pending="${p.id}"]`);await expect(notice).toContainText('Coming soon');await expect(notice.locator('a')).toHaveCount(0);await expect(page.locator(`[data-gumroad-product="${p.id}"]`)).toHaveCount(0);}
 }
});
