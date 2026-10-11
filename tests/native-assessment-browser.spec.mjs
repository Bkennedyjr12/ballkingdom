import { test, expect } from '@playwright/test';

async function start(page) {
  await page.goto('/ai-assessment.html');
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
}

async function complete(page, value = 'In practice') {
  for (let question = 1; question <= 12; question += 1) {
    await page.getByRole('radio', { name: value, exact: true }).check();
    await page.getByRole('button', { name: question === 12 ? 'Review answers' : 'Next question', exact: true }).click();
  }
  await page.getByRole('button', { name: 'See my results', exact: true }).click();
}

test('unanswered next stays disabled, back retains choices and review changes the report', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Not yet', exact: true }).check();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Not yet', exact: true })).toBeChecked();
  await complete(page);
  await expect(page.getByRole('heading', { name: 'Your readiness snapshot', exact: true })).toBeVisible();
  await expect(page.locator('[data-total-score]')).toHaveText('24 / 36');
  await page.getByRole('button', { name: 'Review my answers', exact: true }).click();
  await page.getByRole('button', { name: 'Edit question 1', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'In practice', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Not yet', exact: true }).check();
  await page.getByRole('button', { name: 'Return to review', exact: true }).click();
  await page.getByRole('button', { name: 'See my results', exact: true }).click();
  await expect(page.locator('[data-total-score]')).toHaveText('22 / 36');
});

test('restart confirmation is reversible, clears answers and refresh starts a fresh tab session', async ({ page }) => {
  await start(page);
  await page.getByRole('radio', { name: 'Consistent and reviewed', exact: true }).check();
  await page.getByRole('button', { name: 'Restart assessment', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my answers', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Consistent and reviewed', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Restart assessment', exact: true }).click();
  await page.getByRole('button', { name: 'Clear answers and restart', exact: true }).click();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start assessment', exact: true })).toBeVisible();
});

test('assessment never reads or alters saved account, workout or journal data and makes no external requests', async ({ context, page, baseURL }) => {
  const network = [];
  const failures = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || !['GET', 'HEAD'].includes(request.method())) {
      network.push({ origin: url.origin, method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__assessmentStorageReads = [];
    const oldGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      window.__assessmentStorageReads.push(key);
      return oldGet.call(this, key);
    };
  });
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/ai-assessment.html?uid=synthetic-other-user&price=1&paid=true');
  const synthetic = {
    'firebase:authUser:synthetic-app': '{"uid":"synthetic-user"}',
    'bk_workout_daily_links_v1': '{"synthetic":true,"status":"complete"}',
    'bk_daily_game_log_v1': '{"synthetic":true,"notes":"test fixture"}',
  };
  await page.evaluate(values => {
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
    sessionStorage.setItem('synthetic-session', 'keep');
  }, synthetic);
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  await complete(page, 'Not yet');
  await expect(page.locator('[data-total-score]')).toHaveText('0 / 36');
  await expect(page.getByText(/Account saving and purchases are not connected/)).toBeVisible();
  expect(await page.evaluate(() => window.__assessmentStorageReads)).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(synthetic);
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({ 'synthetic-session': 'keep' });
  expect(network).toEqual([]);
  expect(failures).toEqual([]);
  await expect(page.locator('iframe, input[type="email"], input[type="text"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore existing tools', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:index\.html)?#tools$/);
});

test('mobile questionnaire and results fit 390 pixels and support keyboard selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const radio = page.getByRole('radio', { name: 'Not yet', exact: true });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  for (const stage of ['questions', 'results']) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/native-assessment-mobile-${stage}.png`, fullPage: true });
    if (stage === 'questions') await complete(page);
  }
  for (const href of ['ee-venture.html', 'growth.html', 'products.html']) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
});

test('incomplete review directs back to unanswered questions without inventing a result', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Review progress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See my results', exact: true })).toBeDisabled();
  await expect(page.getByText('12 questions still need an answer.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Answer question 5', exact: true }).click();
  await expect(page.getByText('Question 5 of 12', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Starting', exact: true }).check();
  await page.getByRole('button', { name: 'Return to review', exact: true }).click();
  await expect(page.getByText('11 questions still need an answer.', { exact: true })).toBeVisible();
});
