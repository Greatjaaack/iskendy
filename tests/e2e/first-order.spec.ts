import { expect, test } from '@playwright/test';
const origin = 'http://127.0.0.1:5176';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.fallback()
      : route.abort(),
  );
});
test('first visit is a dedicated form, validates locally and opens the first order', async ({
  page,
}, info) => {
  await page.goto(origin + '/dev/scenario.html?preset=entry');
  await expect(
    page.getByRole('heading', { name: 'Где мой заказ?', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Добавить заказ', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Все заказы', exact: true }),
  ).toHaveCount(0);
  const field = page.getByRole('textbox', {
    name: 'Номер заказа',
    exact: true,
  });
  await field.fill('1000');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Показать статус' }).click();
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.requests.filter(
          (p) => p === '/api/guest/claim',
        ).length,
    ),
  ).toBe(0);
  await field.fill('112');
  await page.screenshot({ path: info.outputPath('entry-filled.png') });
  await page.getByRole('button', { name: 'Показать статус' }).click();
  await expect(
    page.getByRole('button', { name: 'Заказ 112, Готовим' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Заказ 112, Готовим' }),
  ).toBeVisible();
  expect(new URL(page.url()).search).not.toContain('112');
});
test('scenario launcher exposes all presets and restores request limits across reload', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenarios.html');
  const links = page
    .getByRole('navigation', { name: 'Выбор тестового сценария' })
    .getByRole('link');
  expect(await links.count()).toBeGreaterThanOrEqual(20);
  await page
    .getByRole('link', { name: 'Лимит подписки (429)', exact: true })
    .click();
  await page.reload();
  const field = page.getByRole('textbox', {
    name: 'Номер заказа',
    exact: true,
  });
  await field.fill('112');
  await page.getByRole('button', { name: 'Показать статус' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Много гостей сразу' }),
  ).toBeVisible();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});
test('business rejection remains inline and can be corrected', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenario.html?preset=firstError');
  const field = page.getByRole('textbox', {
    name: 'Номер заказа',
    exact: true,
  });
  await field.fill('999');
  await page.getByRole('button', { name: 'Показать статус' }).click();
  await expect(field).toHaveAccessibleDescription(
    'Этот номер уже отслеживают с другого телефона',
  );
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('112');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});
test('first form follows the responsive Figma bounds', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const [width, height] of [
    [390, 844],
    [834, 1194],
    [1440, 1000],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(origin + '/dev/scenario.html?preset=entry');
    const field = page.getByRole('textbox', {
      name: 'Номер заказа',
      exact: true,
    });
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const form = page.locator('form');
    const box = (await form.boundingBox())!;
    expect(Math.abs(box.width - (width === 390 ? 358 : 560))).toBeLessThan(2);
    await expect(
      page.getByRole('button', { name: 'Показать статус' }),
    ).toHaveCSS('height', '56px');
    await page.screenshot({
      path: `docs/reviews/2026-10-16-entry/build-${width}.png`,
    });
  }
});

test('HTTP phone preview supports every emotion on issued test orders without a service worker', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.addInitScript(() =>
    Object.defineProperty(window, 'isSecureContext', { value: false }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const rating of [1, 2, 3, 4, 5]) {
    await page.goto(origin + '/dev/scenario.html?preset=orders5');
    await expect
      .poll(() => page.evaluate(() => window.__ISKENDY_TEST__?.transport))
      .toBe('local');
    await page
      .getByRole('button', { name: 'Следующий заказ', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Следующий заказ', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Заказ 997, Выдан', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Оставить отзыв', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Оценка заказа 997',
      exact: true,
    });
    const slider = dialog.getByRole('slider');
    await slider.focus();
    await slider.press('Home');
    for (let i = 1; i < rating; i++) await slider.press('ArrowRight');
    await dialog.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(
      dialog.getByText('Можно выбрать несколько — или пропустить'),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          window.__ISKENDY_TEST__!.requests.filter((p) => p === '/api/feedback')
            .length,
      ),
    ).toBe(1);
  }
});
