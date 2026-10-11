import {test,expect} from '@playwright/test';

// Fresh profiles, synthetic fixtures only: no real Auth, record reads or writes.
test.beforeEach(async ({context,baseURL})=>{
  const origin=new URL(baseURL).origin;
  await context.route('**/*',route=>{
    const request=route.request();
    return ['GET','HEAD'].includes(request.method())&&new URL(request.url()).origin===origin
      ?route.continue():route.abort();
  });
});

for(const [path,heading] of [
  ['/index.html','Building Ballers.'],['/products.html','Practical playbooks.'],
  ['/readiness.html','Buy the building.'],['/your-game.html','Know whose you are.'],
  ['/growth.html','Name it. Understand it. Respond well.'],['/soccer.html','Personal training.'],
])test(`public page and mobile layout survive cleanup: ${path}`,async ({page,baseURL})=>{
  const missing=[];
  page.on('response',response=>{if(response.url().startsWith(baseURL)&&response.status()>=400)missing.push(response.status());});
  await page.goto(path);
  await expect(page.getByRole('heading',{level:1})).toContainText(heading);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(missing).toEqual([]);
});

test('existing public service guide opens, answers and closes without a provider call',async ({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Ask The Ballers Kingdom',exact:true}).click();
  await expect(page.getByText('AI chat is not connected yet.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Soccer training',exact:true}).click();
  await expect(page.locator('#tbk-chat-dialog a')).toHaveAttribute('href','/soccer');
  await page.getByRole('button',{name:'Close service guide',exact:true}).click();
  await expect(page.locator('#tbk-chat-dialog')).not.toBeVisible();
  await expect(page.locator('a[href*="ai-readiness"],a[href*="ai-assessment"]')).toHaveCount(0);
});

async function fixture(context,{signedIn=false,retry=false}={}){
  const user=signedIn?{uid:'synthetic-owner',email:'owner@example.invalid'}:null;
  await context.route('**/assets/js/workouts-production-runtime.js*',route=>route.fulfill({contentType:'text/javascript',body:`
    export const friendlyError=error=>error.message;
    export async function productionRuntime(){
      let observe,attempt=0;
      return {
        repository:{listPlans:async()=>[{id:'synthetic-plan',weekStart:'2026-10-05',status:'draft',goal:'Synthetic fixture'}]},
        hasEmailLink:()=>false,
        observe:callback=>{observe=callback;callback(${JSON.stringify(user)});return()=>{};},
        signOut:async()=>observe(null),
        requestEmailLink:async()=>{if(${retry}&&attempt++===0)throw new Error('Synthetic connection failure. Try again.');return {status:'synthetic_only'};}
      };
    }` }));
}
for(const signedIn of [false,true])test(`workout journey is preserved: synthetic ${signedIn?'owner':'signed-out'}`,async ({context,page})=>{
  await fixture(context,{signedIn});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/workouts.html');
  await expect(page.getByRole('heading',{level:1})).toContainText('Show up.');
  if(signedIn){
    await expect(page.locator('#private-panel')).toBeVisible();
    await expect(page.locator('#plan-picker')).toContainText('Synthetic fixture');
    await expect(page.locator('#identity')).toContainText('synthetic-owner');
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await expect(page.locator('#private-panel')).toBeHidden();
    await expect(page.locator('#identity')).toBeEmpty();
  }else{
    await expect(page.locator('#private-panel')).toBeHidden();
    await expect(page.getByRole('button',{name:'Email me a sign-in link',exact:true})).toBeEnabled();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(()=>({...localStorage}))).toEqual({});
});

test('workout sign-in error remains recoverable with a synthetic retry',async ({context,page})=>{
  await fixture(context,{retry:true});
  await page.goto('/workouts.html');
  await page.getByLabel('Your email',{exact:true}).fill('synthetic@example.invalid');
  const submit=page.getByRole('button',{name:'Email me a sign-in link',exact:true});
  await submit.click();
  await expect(page.locator('#feedback')).toHaveText('Synthetic connection failure. Try again.');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#feedback')).toContainText('Delivery is not yet verified.');
  await expect(submit).toBeEnabled();
  expect(await page.evaluate(()=>({...localStorage}))).toEqual({});
});
