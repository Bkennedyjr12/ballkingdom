import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('/your-game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('assessment builds a role profile and carries it into Daily Game and Inner Game', async ({ page }) => {
  await page.getByRole('button', { name: /Begin the assessment/ }).click();
  await page.getByPlaceholder('What should your playbook call you?').fill('Test');
  await page.getByRole('button', { name: 'Athletics', exact: true }).click();
  await page.getByRole('button', { name: /Build Turn the assignment/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();

  for (let round = 0; round < 4; round += 1) {
    for (let statement = 0; statement < 5; statement += 1) {
      await page.locator('.yg-statement').nth(statement).locator('.yg-rate').nth(4).click();
    }
    await page.getByRole('button', { name: round === 3 ? /Name my purpose/ : /Next round/ }).click();
  }

  await page.getByLabel('What responsibility is actually in front of you now?').fill('Complete today’s faithful work');
  await expect(page.getByRole('button', { name: /Build my Kingdom Playbook/ })).toBeEnabled();
  await page.getByRole('button', { name: /Build my Kingdom Playbook/ }).click();

  await expect(page.getByText('Test’s Kingdom Playbook')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Playmaker' })).toBeVisible();
  await page.getByRole('tab', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'Play today faithfully.', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /I made this move today/ }).check();
  for (const checkbox of await page.locator('.yg-daily-checks input[type=checkbox]').all()) await checkbox.check();
  await page.getByRole('button', { name: 'Save today' }).click();
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.getByText('3/3 commitments')).toBeVisible();
  await expect(page.getByText('Purpose move made')).toBeVisible();

  await page.goto('/growth.html?source=your-game&role=playmaker');
  await expect(page.getByText('Your Game · Playmaker')).toBeVisible();
});

test('mobile assessment has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/your-game.html');
  const sizes = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.viewport);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know whose you are');
});
