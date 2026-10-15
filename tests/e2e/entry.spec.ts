import { test, expect } from '@playwright/test';
import { boardLoaded } from './support/board';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
test('entry fits viewport, claims explicitly and restores order after reload', async ({
  page,
}, info) => {
  const claims: string[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/guest/claim')
      claims.push(request.postData() ?? '');
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Где мой заказ?' }),
  ).toBeVisible();
  await boardLoaded(page);
  // Q-14: no queue before a claim.
  await expect(page.getByText('108 · 110 · 111 · 112 · 113 · 114')).toHaveCount(
    0,
  );
  expect(claims).toHaveLength(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('entry.png') });
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  const submit = page.getByRole('button', {
    name: 'Показать статус',
    exact: true,
  });
  await submit.click();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  expect(claims).toHaveLength(1);
  expect(JSON.parse(claims[0]!)).toMatchObject({ number: 112 });
  expect(page.url()).not.toContain('synthetic-browser-claim');
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  expect(claims).toHaveLength(1);
  const navigation = page.getByRole('navigation').filter({ visible: true });
  await navigation.getByRole('link', { name: 'Табло', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Табло' })).toBeFocused();
  await expect(
    page.getByRole('group', { name: '112 · Готовим · ваш' }),
  ).toBeVisible();
  expect(claims).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('board.png') });
});
test('rate limit never triggers automatic retry and keeps number editable', async ({
  page,
}) => {
  let claims = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/guest/claim') claims++;
  });
  await page.goto('/');
  await boardLoaded(page);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setFixture('/api/guest/claim', 'claim-429'),
  );
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await page
    .getByRole('button', {
      name: 'Показать статус',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Много гостей сразу — нажмите ещё раз через минуту'),
  ).toBeVisible();
  await expect(
    page.getByLabel('Номер заказа', { exact: true }),
  ).not.toHaveAttribute('aria-invalid', 'true');
  expect(claims).toBe(1);
  await expect(page.getByLabel('Номер заказа', { exact: true })).toHaveValue(
    '112',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('iskendi_my_order')),
  ).toBeNull();
});
