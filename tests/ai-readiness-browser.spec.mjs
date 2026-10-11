import { test, expect } from '@playwright/test';

const assessment = 'https://ballers-ready-ai.base44.app/assessment';
const hub = 'https://ballers-ready-ai.base44.app/';

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
});

test('homepage discovers AI readiness while retaining existing development tools', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('link', { name: /AI Readiness Assessment.*Explore AI readiness/ }).click();
  await expect(page).toHaveURL(/\/ai-readiness(?:\.html)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Make your next move with AI');
  await page.goto('/index.html');
  for (const href of ['your-game.html', 'readiness.html', 'growth.html', 'soccer.html']) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
});

test('landing contacts no Base44 endpoint before an explicit click and explains the data boundary', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().includes('base44')) requests.push(request.url()); });
  await page.goto('/ai-readiness.html');
  await expect(page.getByText(/Firebase sign-in does not carry over/)).toBeVisible();
  await expect(page.getByText(/name and email.*Base44/i)).toBeVisible();
  await expect(page.locator('iframe, input, form')).toHaveCount(0);
  expect(requests).toEqual([]);
});

for (const state of ['signed out', 'synthetic saved session']) {
  test(`external assessment and hub preserve the original tab and stored data: ${state}`, async ({ context, page }) => {
    await page.goto('/index.html');
    const saved = state === 'signed out' ? {} : {
      'firebase:authUser:synthetic-test-app': '{"uid":"synthetic-test-user"}',
      'bk-your-game': '{"role":"playmaker","synthetic":true}',
      'synthetic-workout-plan': '{"week":1,"synthetic":true}'
    };
    await page.evaluate(saved => { for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value); }, saved);
    await page.goto('/ai-readiness.html?email=synthetic%40example.invalid&token=synthetic-do-not-forward');
    const seen = [];
    await context.route('https://ballers-ready-ai.base44.app/**', route => {
      seen.push({ url: route.request().url(), headers: route.request().headers() });
      return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic external destination</h1>' });
    });
    for (const [name, destination] of [['Open Base44 assessment', assessment], ['Explore the Ballers Kingdom hub', hub]]) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
      const popupPromise = page.waitForEvent('popup');
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      expect(popup.url()).toBe(destination);
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await popup.close();
      await expect(page).toHaveURL(/\/ai-readiness(?:\.html)?\?email=/);
    }
    expect(seen).toHaveLength(2);
    for (const request of seen) {
      expect(request.headers.referer).toBeUndefined();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers.cookie).toBeUndefined();
      expect(request.url).not.toContain('synthetic');
    }
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(saved);
  });
}

test('a failed external load can be closed and retried without losing local data', async ({ context, page }) => {
  await page.goto('/ai-readiness.html');
  let fail = true;
  await context.route('https://ballers-ready-ai.base44.app/**', route => fail ? route.abort('internetdisconnected') : route.fulfill({ contentType: 'text/html', body: '<h1>Retry succeeded</h1>' }));
  const first = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open Base44 assessment', exact: true }).click();
  const failed = await first;
  await failed.close();
  await expect(page.getByText(/close that tab and try the link again/i)).toBeVisible();
  fail = false;
  const second = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open Base44 assessment', exact: true }).click();
  const retry = await second;
  await expect(retry.getByRole('heading', { name: 'Retry succeeded' })).toBeVisible();
  await retry.close();
  await page.getByRole('link', { name: 'Stay with the existing tools', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:index\.html)?#tools$/);
});

test('mobile entry and keyboard links remain usable without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai-readiness.html');
  const sizes = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.viewport);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Training', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const link = page.getByRole('link', { name: 'Try the native assessment', exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await page.screenshot({ path: 'output/playwright/ai-readiness-mobile.png', fullPage: true });
});
