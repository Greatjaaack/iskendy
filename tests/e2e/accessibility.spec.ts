import { expect, test } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
test('entry errors remain named, described and reachable from the keyboard', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Где мой заказ?' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const input = page.getByRole('textbox', { name: 'Номер заказа' });
  await expect(input).toBeFocused();
  await page.keyboard.type('invalid');
  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAccessibleDescription(
    'Введите номер заказа от 1 до 999.',
  );
  await expect(page.getByRole('alert')).toHaveText(
    'Введите номер заказа от 1 до 999.',
  );
  await expect(input).toBeFocused();
  await expect(page.locator('main')).toHaveCount(1);
  const help = page.getByRole('link', { name: 'Помощь', exact: true }).first();
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Помощь' }),
  ).toBeFocused();
});
test('guest entry/help/queue reflow without horizontal scrolling in a 200% page-zoom equivalent viewport', async ({
  page,
}, info) => {
  // 1280x800 / 2: layout-viewport reflow proxy, not native text zoom or mobile pinch.
  await page.setViewportSize({ width: 640, height: 400 });
  for (const url of ['/', '/board?view=help', '/board?view=queue']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    for (const element of await page.getByRole('link').all()) {
      if (!(await element.isVisible())) continue;
      await element.focus();
      await expect(element).toBeFocused();
      expect(
        await element.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= innerWidth + 1;
        }),
      ).toBe(true);
    }
  }
  await page.screenshot({
    path: info.outputPath('guest-reflow-640.png'),
    fullPage: true,
  });
});
