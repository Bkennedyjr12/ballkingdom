import { test, expect } from '@playwright/test';

const activeRelease = Object.freeze({
  products: [{sku:'home-inspection-study-guide',active:true}],
});

async function installCommerceMock(page, scenario = 'pending') {
  await page.addInitScript(({release, scenario}) => {
    const calls = [];
    window.__commerceTestCalls = calls;
    window.__BALLERS_COMMERCE__ = {
      async getReleaseState() { calls.push(['release']); return release; },
      async requestPilotSignInLink(input) { calls.push(['auth', input]); return {status:'request_received'}; },
      async completeEmailLink() { calls.push(['complete']); return {signedIn:true}; },
      async createDigitalOrder(input) {
        calls.push(['create', input]);
        return {orderHandle:'safe-order-1',amountCents:4900,currency:'USD',status:'payment_verification_pending',message:'Payment verification is pending.'};
      },
      async getOrderStatus() {
        calls.push(['status']);
        if (scenario === 'unexpected') return {orderHandle:'safe-order-1',status:'fulfilled',message:'Ready',downloadReady:true,providerUrl:'https://example.invalid'};
        if (scenario === 'fulfilled') return {orderHandle:'safe-order-1',status:'fulfilled',message:'Your protected delivery is ready.',downloadReady:true};
        return {orderHandle:'safe-order-1',status:'payment_verification_pending',message:'QuickBooks sent payment instructions to your email. Payment verification is pending.',downloadReady:false};
      },
      async createDownloadGrant() { const grant=`single-use-${calls.length.toString().padStart(32,'0')}`; calls.push(['grant',grant]); return {grant,expiresAt:'soon'}; },
      async redeemDownloadGrant(input) { calls.push(['redeem',input]); if (scenario === 'replay') throw new Error('consumed'); return {streamed:true}; },
    };
  }, {release:activeRelease, scenario});
}

test('digital product shows QuickBooks email instructions without a pay URL', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/products.html');
  await page.getByRole('link',{name:/Get the Home Inspection Guide/i}).click();
  await expect(page).toHaveURL(/order-status/);
  await expect(page.getByRole('heading',{name:/Review your order/i})).toBeVisible();
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/QuickBooks sent payment instructions to your email/i)).toBeVisible();
  await expect(page.locator('a[href*="quickbooks"], a[href*="intuit"]')).toHaveCount(0);
});

test('client assertions do not unlock fulfillment', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/order-status.html?order=unverified&payment=success');
  await expect(page.getByText(/payment verification is pending/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/download/i})).toHaveCount(0);
});

test('unavailable Functions leave purchase controls fail closed', async ({page}) => {
  await page.goto('/products.html');
  await expect(page.getByText(/Purchasing is temporarily unavailable/i)).toBeVisible();
  const control = page.getByRole('link',{name:/Get the Home Inspection Guide/i});
  await expect(control).toHaveAttribute('aria-disabled','true');
  await control.dispatchEvent('click');
  await expect(page).toHaveURL(/products\.html$/);
  await page.goto('/order-status.html');
  await expect(page.getByRole('button',{name:/Email me a sign-in link/i})).toBeDisabled();
  await expect(page.getByRole('button',{name:/Send payment instructions/i})).toBeDisabled();
});

test('generic sign-in response does not reveal recipient decision or call client mail', async ({page}) => {
  await installCommerceMock(page);
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/email address/i).fill('arbitrary@example.com');
  await page.getByRole('button',{name:/Email me a sign-in link/i}).click();
  await expect(page.getByText(/If this address is eligible/i)).toBeVisible();
  const calls = await page.evaluate(() => window.__commerceTestCalls);
  expect(calls.filter(([name]) => name === 'auth')).toHaveLength(1);
  expect(calls.some(([name]) => /mail/i.test(name))).toBe(false);
});

test('390px order status stays usable and keyboard focus is visible', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await installCommerceMock(page);
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toBeVisible();
});

test('unexpected provider fields fail closed instead of unlocking delivery', async ({page}) => {
  await installCommerceMock(page, 'unexpected');
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/could not safely create or read/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/download/i})).toHaveCount(0);
});

test('download grant stays in memory for one redemption attempt', async ({page}) => {
  await installCommerceMock(page, 'fulfilled');
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await page.getByLabel(/name/i).fill('Pilot Buyer');
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await page.getByRole('button',{name:/Download protected guide/i}).click();
  const evidence = await page.evaluate(() => ({calls:window.__commerceTestCalls,url:location.href,storage:{...localStorage}}));
  const grant = evidence.calls.find(([name]) => name === 'grant')[1];
  expect(evidence.calls.filter(([name]) => name === 'redeem')).toHaveLength(1);
  expect(evidence.url).not.toContain(grant);
  expect(JSON.stringify(evidence.storage)).not.toContain(grant);
});
