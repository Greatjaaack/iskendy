import { expect, test } from '@playwright/test';
test('Soon game card keeps original illustrations beside board without navigation or writes', async ({
  page,
  context,
}, info) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await page
    .getByRole('button', {
      name: 'Показать статус',
      exact: true,
    })
    .click();
  const card = page.getByRole('article', { name: 'Сыграть — Скоро' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText('Скоро', { exact: true })).toBeVisible();
  await expect(card.getByRole('link')).toHaveCount(0);
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card).not.toHaveAttribute('tabindex');
  const board = page.getByRole('button', { name: /Всё табло/ });
  const a = (await card.boundingBox())!,
    b = (await board.boundingBox())!;
  expect(a.y).toBeCloseTo(b.y, 1);
  expect(a.x + a.width).toBeLessThan(b.x);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const images = card.locator('img');
  for (const image of await images.all())
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  const url = page.url();
  let writes = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST') writes++;
  });
  await card.click();
  await expect(page).toHaveURL(url);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card
    .locator('..')
    .screenshot({ path: info.outputPath('paired-game-board.png') });
});
