import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const status = readFileSync('tests/fixtures/status-populated.json', 'utf8');
const config = readFileSync('tests/fixtures/config-empty.json', 'utf8');
const pixel = readFileSync('tests/fixtures/pixel.png');
const operational = [
  ['/staff', '#loginBox'],
  ['/stats', '#statsAuthNote'],
] as const;

// Every API request is intercepted; synthetic staff credentials never leave the browser test.
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173')
      return route.abort();
    return route.fallback();
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/qr')
      return route.fulfill({ contentType: 'image/png', body: pixel });
    const body =
      path === '/api/status'
        ? status
        : path === '/api/feedback/config'
          ? config
          : path === '/api/auth/login'
            ? JSON.stringify({ token: 'synthetic-spike-session' })
            : path === '/api/stats/days'
              ? JSON.stringify({ days: [] })
              : path === '/api/stats/range'
                ? JSON.stringify({ summary: {}, hours: [] })
                : path === '/api/stats/orders'
                  ? JSON.stringify({ orders: [], total: 0 })
                  : JSON.stringify({ ok: true });
    return route.fulfill({ contentType: 'application/json', body });
  });
});

for (const path of ['/board', '/board?my=1', '/board?view=queue']) {
  test(`guest query ${path} stays in the new app`, async ({ page }) => {
    const errors: string[] = [];
    const legacyRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/legacy.html'))
        legacyRequests.push(request.url());
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      path.includes('view=queue') ? 'Табло' : 'Где мой заказ?',
    );
    await expect(page.locator('#root')).toHaveCount(1);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
      path,
    );
    expect(legacyRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const [path, selector] of operational) {
  test(`${path} survives reload with local legacy images and no JS errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible();
    const wordmark = page.locator(`#${path.slice(1)} img.wordmark`);
    await expect(wordmark).toHaveCount(1);
    await expect
      .poll(() =>
        wordmark.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(path);
    expect(errors).toEqual([]);
  });

  test(`${path} recovers from legacy download failure after explicit retry`, async ({
    page,
  }) => {
    let fail = true;
    await page.route('**/legacy.html', (route) =>
      fail
        ? route.fulfill({
            status: 503,
            contentType: 'text/plain',
            body: 'unavailable',
          })
        : route.continue(),
    );
    await page.goto(path);
    await expect(page.getByRole('alert')).toHaveText(
      'Не удалось загрузить экран.',
    );
    expect(new URL(page.url()).pathname).toBe(path);
    fail = false;
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
  });
}

test('legacy operational history works backwards, forwards and after reload', async ({
  page,
}) => {
  await page.goto('/stats');
  await page.locator('#statsAuthNote a').click();
  await expect(page.locator('#loginBox')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/staff');
  await page.goBack();
  await expect(page.locator('#statsAuthNote')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/stats');
  await page.goForward();
  await expect(page.locator('#loginBox')).toBeVisible();
  await page.reload();
  await expect(page.locator('#loginBox')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/staff');
});

test('synthetic legacy login opens the staff panel and analytics', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/staff');
  await page.locator('#pw').fill('synthetic-spike-password');
  const login = page.waitForResponse('**/api/auth/login');
  await page.locator('#loginBox button').click();
  expect((await login).status()).toBe(200);
  await expect(page.locator('#panelBox')).toBeVisible();
  await expect(page.locator('#loginBox')).toBeHidden();
  await page.getByText('Аналитика', { exact: true }).click();
  await expect(page.locator('#statsContent')).toBeVisible();
  await expect(page.locator('#statsAuthNote')).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/stats');
  await page.reload();
  await expect(page.locator('#statsContent')).toBeVisible();
  expect(errors).toEqual([]);
});

// /tv polling moved to the new app (tests/unit/tv-app.test.tsx, tv-route.spec.ts).
for (const [path, selector] of operational.slice(0, 1)) {
  test(`${path} keeps polling and recovers after two failures`, async ({
    page,
  }) => {
    let calls = 0;
    let fail = false;
    await page.clock.install();
    await page.route('**/api/status', (route) => {
      calls++;
      return route.fulfill({
        status: fail ? 503 : 200,
        contentType: 'application/json',
        body: fail ? JSON.stringify({ detail: 'test offline' }) : status,
      });
    });
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible();
    await expect.poll(() => calls).toBe(1);
    fail = true;
    await page.clock.runFor(5_000);
    await expect.poll(() => calls).toBe(2);
    await page.clock.runFor(5_000);
    await expect.poll(() => calls).toBe(3);
    if (path === '/staff')
      await expect(page.locator('#offlineBar')).toBeVisible();
    else await expect(page.locator('#offlineBar')).toBeHidden();
    fail = false;
    await page.clock.runFor(5_000);
    await expect.poll(() => calls).toBe(4);
    await expect(page.locator('#offlineBar')).toBeHidden();
  });
}

test('legacy guest handoff boots the new app and keeps back/forward navigation', async ({
  page,
}) => {
  await page.goto('/staff');
  await page.locator('#pw').fill('synthetic-spike-password');
  await page.locator('#loginBox button').click();
  await expect(page.locator('#panelBox')).toBeVisible();
  await page.getByText('← Гостевое табло', { exact: true }).click();
  await expect(page.locator('#root')).toHaveCount(1);
  // Bare /board is the receipt-QR entry (UX-22); the staff link goes to the queue.
  await expect(page).toHaveURL(/\/board\?view=queue$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Табло');
  expect(new URL(page.url()).pathname).toBe('/board');
  await page.goBack();
  await expect(page.locator('#panelBox')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/staff');
  await page.goForward();
  await expect(page.locator('#root')).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe('/board');
});
