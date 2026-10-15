import { expect, test } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
test('guest footer follows mobile Help and desktop composition without background writes', async ({
  page,
}, info) => {
  let posts = 0;
  page.on('request', (r) => {
    if (
      r.method() === 'POST' &&
      /\/api\/(guest\/claim|feedback\/)/.test(r.url())
    )
      posts++;
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await expect(page.getByTestId('guest-footer')).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Помощь', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Помощь', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Где найти номер заказа?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Связаться с управляющим' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(3);
  await expect(page.getByTestId('guest-footer')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('help-20261015.png') });
  expect(posts).toBe(0);
});
