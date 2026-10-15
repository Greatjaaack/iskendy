import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
async function restore(page: Page, rated = false, queue = false) {
  await page.addInitScript(
    ({ rated }) => {
      if (localStorage.getItem('iskendi_my_order')) return;
      localStorage.setItem(
        'iskendi_my_order',
        JSON.stringify({
          n: rated ? 998 : 997,
          d: '2026-10-07',
          seen: true,
          subAt: 10,
          servedAt: Date.now(),
          lastStatus: 'served',
          claim: 'synthetic-claim',
          legacyUnknown: 'retain',
          ...(rated
            ? {
                rated: true,
                done: true,
                fb: {
                  id: 2,
                  token: '<token>',
                  rating: 1,
                  branch: 'negative',
                  detailSent: true,
                },
              }
            : {}),
        }),
      );
    },
    { rated },
  );
  await page.goto(queue ? '/board?view=queue' : '/board?my=1');
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
}
test('issued order opens the new rating; portrait, draft, focus and storage survive without automatic feedback', async ({
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
  await restore(page);
  await page.getByRole('button', { name: 'Заказ 997, Выдан' }).click();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const trigger = page.getByRole('button', {
    name: 'Оставить отзыв',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog'),
    slider = dialog.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuenow', '3');
  await expect(dialog.locator('img[data-size=lg]')).toBeVisible();
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await page.screenshot({ path: info.outputPath('rating-20261015.png') });
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  expect(posts).toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iskendi_my_order')!),
    ),
  ).toMatchObject({
    n: 997,
    legacyUnknown: 'retain',
    claim: 'synthetic-claim',
  });
});
test('neutral rating remains stable until an explicit Next and exposes no external review link', async ({
  page,
}) => {
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/feedback/.test(r.url())) posts++;
  });
  await restore(page);
  await page.getByRole('button', { name: 'Заказ 997, Выдан' }).click();
  await page
    .getByRole('button', { name: 'Оставить отзыв', exact: true })
    .click();
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  await expect(
    page.getByRole('button', { name: 'Дальше', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('link', { name: /Оставить отзыв/ })).toHaveCount(
    0,
  );
  expect(new URL(page.url()).search).not.toMatch(/order=|day=/);
  expect(posts).toBe(0);
});
test('configured reminder is one-shot across reload and preserves the current queue without opening a dialog', async ({
  page,
}) => {
  await page.clock.install();
  await restore(page, false, true);
  await expect(
    page.getByRole('heading', { name: 'Табло', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ISKENDY_TEST__!.signals.events.filter(
            (e) => e === 'rating:997',
          ).length,
      ),
    )
    .toBe(0);
  await page.clock.fastForward(181000);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ISKENDY_TEST__!.signals.events.filter(
            (e) => e === 'rating:997',
          ).length,
      ),
    )
    .toBe(1);
  await expect(page).toHaveURL(/\/board\?view=queue$/);
  await expect(
    page.getByRole('heading', { name: 'Табло', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.signals.events.filter(
          (e) => e === 'rating:997',
        ).length,
    ),
  ).toBe(1);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await page.clock.fastForward(181000);
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.signals.events.filter(
          (e) => e === 'rating:997',
        ).length,
    ),
  ).toBe(0);
});
