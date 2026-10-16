import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`public shell fits ${width}px and menu state stays accurate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator('.nav-links a')).toHaveCount(6);
    await expect(page.locator('.nav-links a[href*="inspection"]')).toHaveCount(0);
    if (width <= 1100) {
      const toggle = page.locator('.nav-toggle');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await page.locator('.nav-links').getByRole('link', { name: 'Tools', exact: true }).click();
      await expect(page).toHaveURL(/tools\.html$/);
      await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
    } else {
      await page.locator('.nav-links').getByRole('link', { name: 'Tools', exact: true }).click();
    }
    await expect(page.locator('.nav-links a[aria-current="page"]')).toHaveText('Tools');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `output/playwright/tools-${width}.png`, fullPage: true });
    await page.goto('/products.html');
    await expect(page.getByRole('heading', { name: 'Business Readiness Scorecard Pro', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.goto('/');
    await expect(page.locator('.ks-card').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `output/playwright/home-${width}.png`, fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'output/playwright/home-desktop.png' });
  });
}

test('tool directory destinations return actual pages and inspection remains available', async ({ page, request }) => {
  await page.goto('/tools.html');
  const links = await page.locator('main a').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute('href')).filter(h => h?.startsWith('/') && !h.startsWith('/#')))]);
  for (const href of links) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(response.headers()['content-type'], href).toContain('text/html');
    expect((await response.text()).includes('<h1'), href).toBeTruthy();
  }
  await expect(page.locator('footer a[href*="home-inspection"]')).toHaveCount(1);
  const inspection = await request.get('/home-inspection-guide/');
  expect(inspection.status()).toBe(200);
  expect(await inspection.text()).toContain('Inspection');
  const asset = await request.get('/assets/js/member-assessment-app.js');
  expect(asset.headers()['content-type']).not.toContain('text/html');
  expect(await asset.text()).toContain('assessment');
});
