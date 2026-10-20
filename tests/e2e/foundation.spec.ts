import { test, expect } from '@playwright/test';
import { boardLoaded } from './support/board';

test('guest entry loads without JS errors or background claims', async ({
  page,
}) => {
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiCalls.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Где мой заказ?',
  );
  await boardLoaded(page);
  // Q-14: before a claim the guest sees only the number field.
  await expect(
    page.getByRole('heading', { name: 'Сейчас на кухне' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    apiCalls.every((url) =>
      ['/api/status', '/api/feedback/config', '/api/guest/event'].includes(
        new URL(url).pathname,
      ),
    ),
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

for (const path of ['/staff', '/stats']) {
  test(`operational route ${path} is isolated in legacy`, async ({ page }) => {
    const requests: string[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-10-07',
          now: '12:00',
          orders: [],
          servedCount: 0,
          updatedAt: '',
        }),
      }),
    );
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(path);
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(
      page.locator(
        path === '/tv'
          ? '#guest'
          : path === '/staff'
            ? '#loginBox'
            : '#statsAuthNote',
      ),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
    expect(requests.some((url) => url.endsWith('/legacy.html'))).toBe(true);
    expect(requests.some((url) => /\/app\/mount-/.test(url))).toBe(false);
    expect(requests.some((url) => url.includes('mc.yandex.ru'))).toBe(false);
  });
}
