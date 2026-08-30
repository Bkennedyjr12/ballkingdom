import { test, expect } from '@playwright/test';

test('desktop catalog renders three primary offers', async ({ page }) => {
  await page.goto('/products.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practical playbooks');
  await expect(page.locator('.product-offer')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Build My Free Career Snapshot' })).toBeVisible();
});

test('mobile visitor can reach the career funnel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products.html');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Products' })).toBeVisible();
  await page.getByRole('link', { name: 'Build My Free Career Snapshot' }).click();
  await expect(page).toHaveURL(/career-blueprint\.html/);
});

test('career page exposes no file upload or active checkout', async ({ page }) => {
  await page.goto('/career-blueprint.html');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.locator('[data-career-intake-pending]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(/not guaranteed/i)).toBeVisible();
});
