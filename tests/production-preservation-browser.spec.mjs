import {test,expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());
});

test('recovered public chat remains a local FAQ with no provider or storage calls',async ({page,baseURL})=>{
  const external=[];
  page.on('request',request=>{if(new URL(request.url()).origin!==new URL(baseURL).origin)external.push(request.url());});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Ask The Ballers Kingdom',exact:true}).click();
  await expect(page.getByText('AI chat is not connected yet.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Soccer training',exact:true}).click();
  await expect(page.locator('#tbk-chat-dialog a')).toHaveAttribute('href','/soccer');
  expect(external.every(url=>/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url))).toBe(true);
  await page.getByRole('button',{name:'Close service guide',exact:true}).click();
  await page.getByRole('link',{name:/AI Readiness Assessment.*Explore AI readiness/}).click();
  await page.getByRole('link',{name:'Try the native assessment',exact:true}).click();
  await expect(page).toHaveURL(/\/ai-assessment(?:\.html)?$/);
});

for(const signedIn of [false,true]) {
  test(`native assessment leaves the recovered workout journey intact: synthetic ${signedIn?'owner':'signed-out'} runtime`,async ({context,page})=>{
    const user=signedIn?{uid:'synthetic-owner',email:'owner@example.invalid'}:null;
    await context.route('**/assets/js/workouts-production-runtime.js*',route=>route.fulfill({contentType:'text/javascript',body:`
      export const friendlyError=error=>error.message;
      export async function productionRuntime(){return {
        repository:{listPlans:async()=>[{id:'synthetic-plan',weekStart:'2026-10-05',status:'draft',goal:'Synthetic fixture'}]},
        hasEmailLink:()=>false,observe:callback=>{callback(${JSON.stringify(user)});return()=>{};}
      };}` }));
    await page.goto('/workouts.html');
    if(signedIn){await expect(page.locator('#private-panel')).toBeVisible();await expect(page.locator('#plan-picker')).toContainText('Synthetic fixture');}
    else{await expect(page.locator('#private-panel')).toBeHidden();await expect(page.getByRole('button',{name:'Email me a sign-in link',exact:true})).toBeEnabled();}
    const saved={'bk_daily_game_log_v1':'{"synthetic":true}','bk_workout_daily_links_v1':'{"synthetic":true}'};
    await page.evaluate(saved=>Object.entries(saved).forEach(([key,value])=>localStorage.setItem(key,value)),saved);
    const assessment=await context.newPage();
    await assessment.goto('/ai-assessment.html');
    await assessment.getByRole('button',{name:'Start assessment',exact:true}).click();
    await assessment.getByRole('radio',{name:'Not yet',exact:true}).check();
    await assessment.close();
    expect(await page.evaluate(()=>({...localStorage}))).toEqual(saved);
    if(signedIn)await expect(page.locator('#identity')).toContainText('synthetic-owner');
    else await expect(page.locator('#identity')).toBeEmpty();
  });
}
