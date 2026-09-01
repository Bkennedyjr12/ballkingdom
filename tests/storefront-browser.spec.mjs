import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Remote fonts are presentation-only and can leave local `load` navigation
  // waiting on an external host. Keep this browser suite focused on storefront
  // behavior; production retains its font declarations.
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
});

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

test('custom solution route opens the dedicated inquiry context', async ({ page }) => {
  await page.goto('/contact.html?interest=custom-solution');
  await expect(page.locator('[data-custom-solution-context]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request a Custom Solution' })).toBeVisible();
});
