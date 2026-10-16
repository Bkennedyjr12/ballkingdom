import { test, expect } from '@playwright/test';

async function complete(page) {
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  for (let q = 1; q <= 12; q += 1) {
    await page.getByRole('radio', { name: 'In practice', exact: true }).check();
    await page.getByRole('button', { name: q === 12 ? 'Review answers' : 'Next question', exact: true }).click();
  }
  await page.getByRole('button', { name: 'See my results', exact: true }).click();
}
async function signIn(page) {
  await page.goto('/member-assessment-preview.html');
  await page.getByRole('button', { name: 'Use synthetic signed-in preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start assessment', exact: true })).toBeEnabled();
}

test('signed-out account controls remain hidden and assessment completion never auto-saves', async ({ page }) => {
  await page.goto('/member-assessment-preview.html');
  await expect(page.getByText('Sign in above to use your assessment notebook.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start assessment', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Use synthetic signed-in preview', exact: true }).click();
  await complete(page);
  await page.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
  await expect(page.getByText('No saved results.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save this result to my account', exact: true })).toBeEnabled();
});

test('explicit save, reopen, cancel deletion and confirmed deletion preserve the current quiz', async ({ page }) => {
  await signIn(page); await complete(page);
  await page.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  await expect(page.getByText('Saved privately until you delete it.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save this result to my account', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
  await page.getByRole('button', { name: 'Open saved result', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved readiness snapshot', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved result', exact: true }).click();
  await page.getByRole('button', { name: 'Keep saved result', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open saved result', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved result', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open saved result', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved readiness snapshot', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start assessment', exact: true })).toBeVisible();
});

test('a failed save can be retried without duplicate rows or leaking provider details', async ({ page }) => {
  await signIn(page); await complete(page);
  await page.getByRole('button', { name: 'Simulate next request failure', exact: true }).click();
  await page.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  await expect(page.getByText('This action could not be confirmed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save this result to my account', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open saved result', exact: true })).toHaveCount(1);
  await expect(page.getByText('synthetic request failure', { exact: false })).toHaveCount(0);
});

test('sign-out clears private results and an in-flight old-account response cannot reappear', async ({ page }) => {
  await page.route('**/assets/js/member-assessment-preview.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import {installMemberAssessment} from '/assets/js/member-assessment-app.js';
    import {scoreAssessment} from '/assets/js/ai-assessment-model.js';
    let observer, resolve; const runtime={observe:fn=>{observer=fn;fn(null);return()=>{};},assessmentAccount:{call:async(action,payload)=>action==='list'?{items:[],nextCursor:null}:new Promise(done=>{resolve=()=>done({assessmentId:'synthetic-id',createdAtMs:1700000000000,report:scoreAssessment(Array(12).fill(2))});})}};
    installMemberAssessment({root:document.querySelector('#member-assessments'),runtime,enabled:true});
    document.querySelector('#preview-signin').onclick=()=>observer({uid:'synthetic-owner'});
    document.querySelector('#preview-signout').onclick=()=>observer(null);
    document.querySelector('#preview-fail').onclick=()=>resolve?.();
  ` }));
  await signIn(page); await complete(page);
  await page.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out of preview', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate next request failure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start assessment', exact: true })).toBeHidden();
  await expect(page.locator('[data-total-score]')).toHaveCount(0);
  await expect(page.getByText('Saved privately until you delete it.', { exact: false })).toHaveCount(0);
});

test('mobile account controls fit and preserve unanswered-question behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/member-assessment-mobile-preview.png', fullPage: true });
});

test('preview remains local and neither reads nor alters workout/account browser storage', async ({ context, page, baseURL }) => {
  const requests = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL).origin || route.request().method() !== 'GET') { requests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/member-assessment-preview.html');
  await page.evaluate(() => { localStorage.setItem('synthetic-workout-plan', 'keep'); sessionStorage.setItem('synthetic-auth-fixture', 'keep'); });
  await page.getByRole('button', { name: 'Use synthetic signed-in preview', exact: true }).click(); await complete(page);
  await page.getByRole('button', { name: 'Save this result to my account', exact: true }).click();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ 'synthetic-workout-plan': 'keep' });
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({ 'synthetic-auth-fixture': 'keep' });
  expect(requests).toEqual([]);
});
