import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
async function restore(
  page: import('@playwright/test').Page,
  number: number,
  seen = true,
) {
  await page.addInitScript(
    ({ number, seen }) => {
      localStorage.setItem(
        'iskendi_my_order',
        JSON.stringify({
          n: number,
          d: '2026-10-07',
          seen,
          subAt: Date.now() - 65000,
          claim: 'synthetic-existing',
          servedAt: 0,
          rated: false,
          done: false,
          lastStatus: seen ? 'ready' : '',
        }),
      );
    },
    { number, seen },
  );
}
test('ready order opens pickup details without claiming or showing the root dock', async ({
  page,
}, info) => {
  let claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await restore(page, 102);
  await page.goto('/board?my=1');
  const ticket = page.getByRole('article', { name: 'Ваш заказ 102' });
  await expect(ticket).toContainText('Можно забирать');
  await ticket.getByRole('button').click();
  await expect(
    page.getByRole('heading', { name: 'Заказ 102', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByText('Можно забирать', { exact: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByText('Можно забирать на кассе.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('ready.png') });
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Мои заказы', exact: true }),
  ).toBeFocused();
  expect(claims).toBe(0);
});
test('unseen number expires to a not-found card without background claim', async ({
  page,
}, info) => {
  let claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await restore(page, 999, false);
  await page.goto('/board?my=1');
  await expect(
    page.getByRole('heading', { name: 'Заказ не найден', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Проверьте номер в верхней части чека и попробуйте ещё раз.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Заказ 999, Готовим' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('not-found.png') });
  expect(claims).toBe(0);
});
test('order text remains within the card at a narrow 320px viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await restore(page, 102);
  await page.goto('/board?my=1');
  const card = page.getByRole('article', { name: 'Ваш заказ 102' });
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(288);
  for (const text of ['Ваш заказ', '102', 'Готово', 'Можно забирать']) {
    const bounds = (await card.getByText(text, { exact: true }).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(box.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('a missing previously seen order is issued only after server confirmation', async ({
  page,
}) => {
  let claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await restore(page, 999);
  await page.goto('/board?my=1');
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 999' }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setFixture('/api/feedback/check', 'check-ok'),
  );
  await page.clock.install();
  await page.clock.runFor(21000);
  await page.getByRole('button', { name: 'Заказ 999, Выдан' }).click();
  await expect(
    page.getByRole('button', { name: 'Оставить отзыв', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iskendi_my_order')!).servedAt,
    ),
  ).toBeGreaterThan(0);
  expect(claims).toBe(0);
});
