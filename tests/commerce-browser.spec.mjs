import { test, expect } from '@playwright/test';

const activeRelease = Object.freeze({
  products: [{sku:'home-inspection-study-guide',active:true}],
});

async function installCommerceMock(page, scenario = 'pending') {
  await page.addInitScript(({release, scenario}) => {
    const calls = [];
    window.__commerceTestCalls = calls;
    window.__BALLERS_COMMERCE__ = {
      async getBuyerCommerceCapability() { calls.push(['release']); return release; },
      async requestPilotSignInLink(input) { calls.push(['auth', input]); return {status:'request_received'}; },
      async completeEmailLink() { calls.push(['complete']); return scenario === 'invalid-link' ? {signedIn:false} : {signedIn:true}; },
      async createDigitalOrder(input) {
        calls.push(['create', input]);
        return {orderHandle:'safe-order-1',amountCents:4900,currency:'USD',status:'payment_verification_pending',message:'Payment verification is pending.'};
      },
      async getOrderStatus() {
        calls.push(['status']);
        if (scenario === 'unexpected') return {orderHandle:'safe-order-1',status:'fulfilled',message:'Ready',downloadReady:true,providerUrl:'https://example.invalid'};
        if (scenario === 'fulfilled' || scenario === 'replay') return {orderHandle:'safe-order-1',status:'fulfilled',message:'Your protected delivery is ready.',downloadReady:true};
        if (scenario === 'status-denied') throw new Error('owner denied');
        return {orderHandle:'safe-order-1',status:'payment_verification_pending',message:'QuickBooks sent payment instructions to your email. Payment verification is pending.',downloadReady:false};
      },
      async createDownloadGrant() { const grant=`single-use-${calls.length.toString().padStart(32,'0')}`; calls.push(['grant',grant]); return {grant,expiresAt:'2099-01-01T00:00:00.000Z'}; },
      async redeemDownloadGrant(input) { calls.push(['redeem',input]); if (scenario === 'replay') throw new Error('consumed'); return {streamed:true}; },
    };
  }, {release:activeRelease, scenario});
}

async function installProtectedDeliveryRuntime(page,{streamStatus=200,streamType='application/pdf',streamLength=null,streamMode='normal',grant='A'.repeat(43),expiresAt='2099-01-01T00:00:00.000Z',grantExtra=false}={}){
  await page.route(/\/order-status\.html(?:\?.*)?$/,async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace('<script type="module" src="assets/js/firebase-commerce-runtime.js"></script>','');
    await route.fulfill({response,body});
  });
  await page.addInitScript(({streamStatus,streamType,streamLength,streamMode,grant,expiresAt,grantExtra})=>{
    const evidence={fetches:[],tokens:[],objectUrls:[],revoked:[],downloads:[],console:[],readerCancels:0};
    window.__protectedDeliveryEvidence=evidence;
    window.__commerceTestCalls=[];
    window.__commerceTestDownloadTimeoutMs=50;
    window.__BALLERS_FIREBASE_RUNTIME__={
      async completeEmailLink(){return {signedIn:true};},
      async getAppCheckToken(){const token=`ordinary-app-check-${evidence.tokens.length}`;evidence.tokens.push(['ordinary',token]);return token;},
      async getLimitedUseAppCheckToken(){const token=`limited-app-check-${evidence.tokens.length}`;evidence.tokens.push(['limited',token]);return token;},
      async getIdToken(){const token=`fresh-id-token-${evidence.tokens.length}`;evidence.tokens.push(['id',token]);return token;},
    };
    window.__BALLERS_FIREBASE_RUNTIME_READY__=Promise.resolve(window.__BALLERS_FIREBASE_RUNTIME__);
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(url,options={})=>{
      const name=String(url).split('/').pop();
      evidence.fetches.push({name,method:options.method,headers:{...options.headers},body:options.body,credentials:options.credentials});
      if(name==='getBuyerCommerceCapability')return new Response(JSON.stringify({data:{products:[{sku:'home-inspection-study-guide',active:true}]}}),{status:200,headers:{'Content-Type':'application/json'}});
      if(name==='getOrderStatus')return new Response(JSON.stringify({data:{orderHandle:'safe-order-1',status:'fulfilled',message:'Ready.',downloadReady:true}}),{status:200,headers:{'Content-Type':'application/json'}});
      if(name==='createDownloadGrant'){const data={grant,expiresAt};if(grantExtra)data.unexpected='field';return new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});}
      if(name==='redeemDownloadGrant'){
        if(streamMode==='never-fetch')return new Promise(()=>{});
        const headers={'Content-Type':streamType};if(streamLength!==null)headers['Content-Length']=streamLength;
        let body=new Uint8Array([37,80,68,70,45,49,46,55]);
        if(streamMode==='empty')body=new Uint8Array();
        if(streamMode==='partial-stall')body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([37,80,68,70]));},cancel(){evidence.readerCancels+=1;}});
        if(streamMode==='cancel-never')body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([37,80,68,70]));},cancel(){evidence.readerCancels+=1;return new Promise(()=>{});}});
        if(streamMode==='reader-error')body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([37,80,68,70]));queueMicrotask(()=>controller.error(new Error('private reader detail')));},cancel(){evidence.readerCancels+=1;}});
        if(streamMode==='oversize'){
          let chunks=0;
          body=new ReadableStream({pull(controller){if(chunks>=81){controller.close();return;}chunks+=1;controller.enqueue(new Uint8Array(1024*1024));},cancel(){evidence.readerCancels+=1;}});
        }
        return new Response(body,{status:streamStatus,headers});
      }
      return originalFetch(url,options);
    };
    const originalCreate=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const value=`blob:protected-${evidence.objectUrls.length+1}`;evidence.objectUrls.push({value,type:blob.type,size:blob.size});return value;};
    URL.revokeObjectURL=value=>evidence.revoked.push(value);
    const originalClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){evidence.downloads.push({download:this.download,href:this.href,connected:this.isConnected});};
    window.addEventListener('beforeunload',()=>{URL.createObjectURL=originalCreate;HTMLAnchorElement.prototype.click=originalClick;});
    for(const method of ['log','info','warn','error']){const original=console[method].bind(console);console[method]=(...args)=>{evidence.console.push(args.map(String).join(' '));original(...args);};}
  },{streamStatus,streamType,streamLength,streamMode,grant,expiresAt,grantExtra});
}

async function expectProtectedFailure(page,options){
  await installProtectedDeliveryRuntime(page,options);
  await page.goto('/order-status.html?sku=home-inspection-study-guide&order=safe-order-1');
  const button=page.getByRole('button',{name:/Download protected guide/i});
  await button.click();
  await expect(page.getByText(/one-time delivery attempt could not be completed/i)).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(page.getByText(/protected delivery started/i)).toHaveCount(0);
  const evidence=await page.evaluate(()=>window.__protectedDeliveryEvidence);
  expect(evidence.objectUrls).toHaveLength(0);
  expect(evidence.downloads).toHaveLength(0);
  return evidence;
}

test('digital product shows QuickBooks email instructions without a pay URL', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/products.html');
  await page.getByRole('link',{name:/Get the Home Inspection Guide/i}).click();
  await expect(page).toHaveURL(/order-status/);
  await expect(page.getByRole('heading',{name:/Review your order/i})).toBeVisible();
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/QuickBooks sent payment instructions to your email/i)).toBeVisible();
  await expect(page.locator('a[href*="quickbooks"], a[href*="intuit"]')).toHaveCount(0);
});

test('client assertions do not unlock fulfillment', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/order-status.html?order=unverified&payment=success');
  await expect(page.getByText(/payment verification is pending/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/download/i})).toHaveCount(0);
});

test('unavailable Functions leave purchase controls fail closed', async ({page}) => {
  await page.goto('/products.html');
  await expect(page.getByText(/Purchasing is temporarily unavailable/i)).toBeVisible();
  const control = page.getByRole('link',{name:/Get the Home Inspection Guide/i});
  await expect(control).toHaveAttribute('aria-disabled','true');
  await control.dispatchEvent('click');
  await expect(page).toHaveURL(/products\.html$/);
  await page.goto('/order-status.html');
  await expect(page.getByRole('button',{name:/Email me a sign-in link/i})).toBeDisabled();
  await expect(page.getByRole('button',{name:/Send payment instructions/i})).toBeDisabled();
});

test('direct order route requires the exact active server SKU',async({page})=>{
  await installCommerceMock(page);
  await page.goto('/order-status.html?sku=unknown-product');
  await expect(page.getByText(/Purchasing is temporarily unavailable/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/Email me a sign-in link/i})).toBeDisabled();
  await expect(page.getByRole('button',{name:/Send payment instructions/i})).toBeDisabled();
});

test('generic sign-in response does not reveal recipient decision or call client mail', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  for (const email of ['approved@example.test','arbitrary@example.com','approved@example.test']) {
    await page.getByLabel(/email address/i).fill(email);
    await page.getByRole('button',{name:/Email me a sign-in link/i}).click();
    await expect(page.getByText(/If this address is eligible/i)).toBeVisible();
  }
  const calls = await page.evaluate(() => window.__commerceTestCalls);
  expect(calls.filter(([name]) => name === 'auth')).toHaveLength(3);
  expect(calls.some(([name]) => /mail/i.test(name))).toBe(false);
});

test('expired modified or reused email link remains signed out and requires a new request', async ({page}) => {
  await installCommerceMock(page,'invalid-link');
  await page.goto('/order-status.html?sku=home-inspection-study-guide&mode=signIn&oobCode=modified');
  await page.getByLabel(/email address/i).fill('approved@example.test');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/expired, modified, already used/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/Email me a sign-in link/i})).toBeEnabled();
  await expect(page.getByRole('button',{name:/Send payment instructions/i})).toBeDisabled();
  const calls=await page.evaluate(()=>window.__commerceTestCalls);
  expect(calls.some(([name])=>name==='create')).toBe(false);
});

test('signed-out or wrong-owner status denial never reveals order state', async ({page}) => {
  await installCommerceMock(page,'status-denied');
  await page.goto('/order-status.html?sku=home-inspection-study-guide&order=safe-order-1');
  await expect(page.getByText(/verified owner/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/download/i})).toHaveCount(0);
});

test('390px order status stays usable and keyboard focus is visible', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await installCommerceMock(page);
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toBeVisible();
});

test('unexpected provider fields fail closed instead of unlocking delivery', async ({page}) => {
  await installCommerceMock(page, 'unexpected');
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/could not safely create or read/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/download/i})).toHaveCount(0);
});

test('download grant stays in memory for one redemption attempt', async ({page}) => {
  await installCommerceMock(page, 'fulfilled');
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await page.getByRole('button',{name:/Download protected guide/i}).click();
  const evidence = await page.evaluate(() => ({calls:window.__commerceTestCalls,url:location.href,storage:{...localStorage}}));
  const grant = evidence.calls.find(([name]) => name === 'grant')[1];
  expect(evidence.calls.filter(([name]) => name === 'redeem')).toHaveLength(1);
  expect(evidence.url).not.toContain(grant);
  expect(JSON.stringify(evidence.storage)).not.toContain(grant);
});

test('consumed grant denial returns to a safe fulfilled view and a new grant can be requested',async({page})=>{
  await installCommerceMock(page,'replay');
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  const button=page.getByRole('button',{name:/Download protected guide/i});
  await button.click();
  await expect(page.getByText(/one-time delivery attempt could not be completed/i)).toBeVisible();
  await button.click();
  const calls=await page.evaluate(()=>window.__commerceTestCalls);
  expect(calls.filter(([name])=>name==='grant')).toHaveLength(2);
  expect(calls.filter(([name])=>name==='redeem')).toHaveLength(2);
});

test('real protected delivery uses fresh tokens once and revokes the temporary PDF URL',async({page})=>{
  await installProtectedDeliveryRuntime(page);
  await page.goto('/order-status.html?sku=home-inspection-study-guide&order=safe-order-1');
  await page.getByRole('button',{name:/Download protected guide/i}).click();
  await expect(page.getByText(/protected delivery started/i)).toBeVisible();
  const evidence=await page.evaluate(()=>({
    ...window.__protectedDeliveryEvidence,
    url:location.href,
    local:{...localStorage},
    session:{...sessionStorage},
    html:document.documentElement.outerHTML,
  }));
  const grantCall=evidence.fetches.find(call=>call.name==='createDownloadGrant');
  const streamCall=evidence.fetches.find(call=>call.name==='redeemDownloadGrant');
  expect(grantCall.headers.Authorization).toMatch(/^Bearer fresh-id-token-/);
  expect(grantCall.headers['X-Firebase-AppCheck']).toMatch(/^ordinary-app-check-/);
  expect(streamCall.headers.Authorization).toMatch(/^Bearer fresh-id-token-/);
  expect(streamCall.headers['X-Firebase-AppCheck']).toMatch(/^limited-app-check-/);
  expect(streamCall.credentials).toBe('omit');
  expect(JSON.parse(streamCall.body)).toEqual({orderHandle:'safe-order-1',grant:'A'.repeat(43)});
  expect(evidence.objectUrls).toEqual([{value:'blob:protected-1',type:'application/pdf',size:8}]);
  expect(evidence.downloads).toEqual([{download:'Home Inspection Study Guide.pdf',href:'blob:protected-1',connected:false}]);
  expect(evidence.revoked).toEqual(['blob:protected-1']);
  const exposed=JSON.stringify({url:evidence.url,local:evidence.local,session:evidence.session,html:evidence.html,console:evidence.console});
  for(const secret of ['A'.repeat(43),'fresh-id-token-','ordinary-app-check-','limited-app-check-','private-commerce/'])expect(exposed).not.toContain(secret);
});

test('failed stream is not retried automatically and a user may request a fresh grant',async({page})=>{
  await installProtectedDeliveryRuntime(page,{streamStatus:502});
  await page.goto('/order-status.html?sku=home-inspection-study-guide&order=safe-order-1');
  const button=page.getByRole('button',{name:/Download protected guide/i});
  await button.click();
  await expect(page.getByText(/one-time delivery attempt could not be completed/i)).toBeVisible();
  let calls=await page.evaluate(()=>window.__protectedDeliveryEvidence.fetches);
  expect(calls.filter(call=>call.name==='createDownloadGrant')).toHaveLength(1);
  expect(calls.filter(call=>call.name==='redeemDownloadGrant')).toHaveLength(1);
  expect(await page.evaluate(()=>window.__protectedDeliveryEvidence.objectUrls)).toHaveLength(0);
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.__protectedDeliveryEvidence.fetches.filter(call=>call.name==='redeemDownloadGrant').length)).toBe(2);
  calls=await page.evaluate(()=>window.__protectedDeliveryEvidence.fetches);
  expect(calls.filter(call=>call.name==='createDownloadGrant')).toHaveLength(2);
  expect(calls.filter(call=>call.name==='redeemDownloadGrant')).toHaveLength(2);
});

test('non-PDF stream response fails closed without creating a download',async({page})=>{
  await expectProtectedFailure(page,{streamType:'text/html'});
});

test('oversized declared PDF fails before a browser download is created',async({page})=>{
  await expectProtectedFailure(page,{streamLength:String(81*1024*1024)});
});

for(const [name,options] of [
  ['empty PDF body',{streamMode:'empty'}],
  ['zero Content-Length',{streamLength:'0'}],
  ['malformed Content-Length',{streamLength:'eight'}],
  ['declared and streamed length mismatch',{streamLength:'9'}],
  ['stream exceeding 80 MiB without Content-Length',{streamMode:'oversize'}],
  ['reader failure after partial bytes',{streamMode:'reader-error'}],
])test(`${name} fails closed without a false download`,async({page})=>{await expectProtectedFailure(page,options);});

test('never-resolving fetch reaches one deadline, re-enables UI, and does not retry',async({page})=>{
  const evidence=await expectProtectedFailure(page,{streamMode:'never-fetch'});
  expect(evidence.fetches.filter(call=>call.name==='redeemDownloadGrant')).toHaveLength(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>window.__protectedDeliveryEvidence.fetches.filter(call=>call.name==='redeemDownloadGrant').length)).toBe(1);
});

test('partial reader stall is cancelled at the same deadline and never claims success',async({page})=>{
  const evidence=await expectProtectedFailure(page,{streamMode:'partial-stall'});
  expect(evidence.readerCancels).toBeGreaterThan(0);
  expect(evidence.fetches.filter(call=>call.name==='redeemDownloadGrant')).toHaveLength(1);
});

test('never-settling reader cancellation cannot block generic failure or UI recovery',async({page})=>{
  const evidence=await expectProtectedFailure(page,{streamMode:'cancel-never'});
  expect(evidence.readerCancels).toBeGreaterThan(0);
  expect(evidence.fetches.filter(call=>call.name==='redeemDownloadGrant')).toHaveLength(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>window.__protectedDeliveryEvidence.fetches.filter(call=>call.name==='redeemDownloadGrant').length)).toBe(1);
  expect(await page.evaluate(()=>window.__protectedDeliveryEvidence.objectUrls)).toHaveLength(0);
  expect(await page.evaluate(()=>window.__protectedDeliveryEvidence.downloads)).toHaveLength(0);
});

test('grant response must have exact keys, base64url length, and a future expiration before stream tokens',async({page})=>{
  for(const invalid of [
    {grant:'short',expiresAt:'2099-01-01T00:00:00.000Z'},
    {grant:'A'.repeat(43),expiresAt:'2020-01-01T00:00:00.000Z'},
    {grant:'A'.repeat(43),expiresAt:'2099-01-01T00:00:00.000Z',grantExtra:true},
  ]){
    const isolated=await page.context().newPage();
    const evidence=await expectProtectedFailure(isolated,invalid);
    expect(evidence.fetches.some(call=>call.name==='redeemDownloadGrant')).toBe(false);
    expect(evidence.tokens.some(([kind])=>kind==='limited')).toBe(false);
    await isolated.close();
  }
});

test('polling stops at terminal state and respects its timeout cap', async ({page}) => {
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  const result=await page.evaluate(async()=>{
    const {pollStatus}=await import('/assets/js/commerce-client.js');
    let terminalCalls=0;let boundedCalls=0;
    const terminal=await pollStatus({async getOrderStatus(){terminalCalls+=1;return {orderHandle:'o',status:'fulfilled',message:'Ready',downloadReady:true};}},'o',{delay:0,maxPolls:5});
    await pollStatus({async getOrderStatus(){boundedCalls+=1;return {orderHandle:'o',status:'payment_verification_pending',message:'Pending',downloadReady:false};}},'o',{delay:0,maxPolls:3});
    return {terminalCalls,boundedCalls,terminal:terminal.status};
  });
  expect(result).toEqual({terminalCalls:1,boundedCalls:3,terminal:'fulfilled'});
});

test('reduced-motion preference disables commerce animation and transition', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installCommerceMock(page);
  await page.goto('/order-status.html');
  const style=await page.locator('.commerce-action').evaluate(node=>({animationName:getComputedStyle(node).animationName,transitionDuration:getComputedStyle(node).transitionDuration}));
  expect(style.animationName).toBe('none');
  expect(style.transitionDuration).toBe('0s');
});
