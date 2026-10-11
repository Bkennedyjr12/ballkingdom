import { test, expect } from '@playwright/test';

// A fresh browser has no member credentials. No account or App Check bypass is created.
test('live signed-out notebook exposes the member entry without account operations', async ({ page }) => {
  const calls = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/assessmentAccount')) calls.push(request.method()); });
  await page.goto('/workouts#member-assessments');
  await expect(page.locator('#signin-fields')).toBeEnabled();
  await expect(page.locator('#private-panel')).toBeHidden();
  const panel = page.locator('#member-assessments');
  await expect(panel.getByRole('heading', { name: 'Your AI assessment notebook' })).toBeVisible();
  await expect(panel.getByText(/Sign in above to use your assessment notebook/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Save this result to my account', exact: true })).toBeHidden();
  expect(calls).toEqual([]);
});

test('live mobile member navigation stays on the production site and fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai-readiness');
  await page.getByRole('link', { name: 'Open your member assessment notebook', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/ballkingdom\.com\/workouts(?:\.html)?#member-assessments$/);
  await expect(page.locator('#member-assessments')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#member-assessments').screenshot({ path: 'output/playwright/member-live-signed-out-mobile.png' });
});
