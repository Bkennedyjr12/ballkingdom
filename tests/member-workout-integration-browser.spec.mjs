import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/assets/js/workouts-production-runtime.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    import {scoreAssessment} from '/assets/js/ai-assessment-model.js';
    let user={uid:'synthetic-workout-owner',email:'owner@example.invalid'};const observers=[],records=new Map(),attempts=new Map();
    export const friendlyError=()=> 'Synthetic fixture failure';
    export async function productionRuntime(){return {
      repository:{listPlans:async()=>[{id:'synthetic-existing-plan',weekStart:'2026-10-05',status:'draft',goal:'Keep this synthetic workout'}]},
      hasEmailLink:()=>false,observe:fn=>{observers.push(fn);fn(user);return()=>{};},signOut:async()=>{user=null;observers.forEach(fn=>fn(null));},
      assessmentAccount:{call:async(action,payload)=>{
        if(action==='list')return{items:[...records.values()],nextCursor:null};
        if(action==='save'){const id=attempts.get(payload.requestId)||'synthetic-assessment-1';attempts.set(payload.requestId,id);const result=records.get(id)||{assessmentId:id,createdAtMs:1700000000000,report:scoreAssessment(payload.answers)};records.set(id,result);return result;}
        if(action==='get')return records.get(payload.assessmentId);
        if(action==='delete'){records.delete(payload.assessmentId);return{deleted:true};}
      }}
    };}
  ` }));
});

test('same-tab member assessment save/delete leaves existing private workout controls intact', async ({ page }) => {
  await page.goto('/workouts.html');
  await expect(page.locator('#plan-picker')).toContainText('Keep this synthetic workout');
  await expect(page.locator('#private-panel')).toBeVisible();
  const panel = page.locator('#member-assessments');
  await panel.getByRole('button', { name: 'Start assessment', exact: true }).click();
  for (let q = 1; q <= 12; q += 1) {
    await panel.getByRole('radio', { name: 'In practice', exact: true }).check();
    await panel.getByRole('button', { name: q === 12 ? 'Review answers' : 'Next question', exact: true }).click();
  }
  await panel.getByRole('button', { name: 'See my results', exact: true }).click();
  await panel.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  await expect(panel.getByText('Saved privately until you delete it.', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
  await panel.getByRole('button', { name: 'Delete saved result', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.locator('#plan-picker')).toContainText('Keep this synthetic workout');
  await expect(page.locator('#private-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('#private-panel')).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Start assessment', exact: true })).toBeHidden();
  await expect(page.locator('#identity')).toBeEmpty();
});

test('the extended notebook fits mobile and keeps its existing CSP and no email transfer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/workouts.html');
  await expect(page.locator('#member-assessments')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("form-action 'none'"); expect(csp).not.toContain('base44');
  await expect(page.locator('#member-assessments input[type=email]')).toHaveCount(0);
  await page.locator('#member-assessments').screenshot({ path: 'output/playwright/member-workout-mobile-preview.png' });
});
