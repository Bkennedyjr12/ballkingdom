import {test,expect} from '@playwright/test';
const products=[['recruiting','gfjmoo'],['car-ride','ofopvv'],['scorecard','ejldv']];
test.beforeEach(async({page})=>{await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());});
for(const width of [360,768,1440]){
 test(`all published products render with real covers and fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  for(const [path,count] of [['/products.html',3],['/index.html',3],['/soccer.html',2],['/shop.html',3],['/readiness.html',1]]){
   await page.goto(path);
   await expect(page.locator('[data-gumroad-product]')).toHaveCount(count);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBeTruthy();
   const cards=page.locator('[data-gumroad-product]');
   for(const card of await cards.all()){await expect(card).toBeVisible();await card.scrollIntoViewIfNeeded();await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();}
  }
  await page.goto('/products.html#shop-now');
  await expect(page.locator('#shop-now .gr-card')).toHaveCount(3);
  await page.locator('#shop-now').screenshot({path:`output/gumroad-integration/products-${width}.png`});
 });
}
test('each product opens the exact Gumroad destination without giving it the original window',async({page,context})=>{
 await context.route('https://ballerskingdom.gumroad.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Synthetic checkout destination; no purchase</h1>'}));
 await page.goto('/products.html');
 for(const [id,slug] of products){
  const popupPromise=context.waitForEvent('page');await page.locator(`[data-gumroad-product="${id}"] .gr-cta`).click();const popup=await popupPromise;await popup.waitForLoadState();
  expect(popup.url()).toBe(`https://ballerskingdom.gumroad.com/l/${slug}`);
  expect(await popup.evaluate(()=>opener===null)).toBe(true);await popup.close();
 }
 expect(page.url()).toContain('/products.html');
});
test('digital products remain available without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto('http://127.0.0.1:4187/products.html');
 await expect(page.locator('#shop-now [data-gumroad-product]')).toHaveCount(3);for(const link of await page.locator('#shop-now .gr-cta').all())await expect(link).toBeVisible();await context.close();
});
