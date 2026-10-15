import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
async function restore(page: Page, feedback = false) {
  await page.addInitScript(
    ({ feedback }) => {
      localStorage.setItem(
        'iskendi_my_order',
        JSON.stringify({
          n: feedback ? 998 : 997,
          d: '2026-10-07',
          seen: true,
          subAt: 10,
          servedAt: Date.now(),
          lastStatus: 'served',
          claim: 'synthetic-claim',
          legacyUnknown: 'retain',
          ...(feedback
            ? {
                rated: true,
                fb: {
                  id: 2,
                  token: '<token>',
                  rating: 1,
                  branch: 'negative',
                  detailSent: false,
                },
              }
            : {}),
        }),
      );
    },
    { feedback },
  );
  await page.goto('/board?my=1');
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await page.evaluate(() => {
    window.__ISKENDY_TEST__!.setFixture(
      '/api/feedback/check',
      'check-served-positive',
    );
    history.pushState(null, '', '/board?my=1&rate=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
async function chooseDelight(page: Page) {
  const slider = page.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
}
test('actual positive API flow preserves storage, offers optional comment before sending tags, and completes only after acknowledgement', async ({
  page,
}) => {
  await restore(page);
  await chooseDelight(page);
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Что порадовало?' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Вкус', exact: true }).click();
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Хотите добавить?' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Отправить отзыв', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Спасибо вам большое', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iskendi_my_order')!),
    ),
  ).toMatchObject({
    n: 997,
    claim: 'synthetic-claim',
    legacyUnknown: 'retain',
    rated: true,
    done: true,
    fb: {
      id: 1,
      token: '<token>',
      rating: 5,
      branch: 'positive',
      detailSent: true,
    },
  });
  await expect(
    page.getByRole('textbox', { name: 'Комментарий · необязательно' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Оставить отзыв на Картах', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // SEC-02: closing the rating returns to «Мои заказы» without the number in the address.
  await expect(page).toHaveURL(/\/board\?my=1$/);
});
test('negative comment survives Escape, browser navigation and back; rejected detail is retryable', async ({
  page,
}) => {
  await restore(page, true);
  await page.getByRole('button', { name: 'Остыло', exact: true }).click();
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  const field = page.getByRole('textbox', {
    name: 'Комментарий · необязательно',
  });
  await field.fill('synthetic private draft');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Остыло', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(field).toHaveValue('synthetic private draft');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState(null, '', '/board?my=1&rate=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(field).toHaveValue('synthetic private draft');
  await expect(
    page.getByRole('button', { name: 'Назад', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setFixture(
      '/api/feedback/detail',
      'detail-wrong-token',
    ),
  );
  await page
    .getByRole('button', { name: 'Отправить отзыв', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Не получилось дописать отзыв',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iskendi_my_order')!).fb.detailSent,
    ),
  ).toBe(false);
  await expect(field).toHaveValue('synthetic private draft');
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setFixture('/api/feedback/detail', 'detail-ok'),
  );
  await page
    .getByRole('button', { name: 'Отправить отзыв', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Спасибо вам большое', exact: true }),
  ).toBeVisible();
  // Q-21 and ADR-014 (12.10): the complaint is acknowledged and Maps is offered in this branch too.
  await expect(
    page.getByText('Управляющий уже получил ваш отзыв.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Оставить отзыв на Картах', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iskendi_my_order')!).fb.detailSent,
    ),
  ).toBe(true);
});
test('closing a delayed create ignores its late response and never writes a fabricated completion', async ({
  page,
}) => {
  await restore(page);
  await chooseDelight(page);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setDelay('/api/feedback', 1200),
  );
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await page.waitForFunction(() =>
    window.__ISKENDY_TEST__!.requests.includes('/api/feedback'),
  );
  await expect(
    page.getByRole('button', { name: 'Дальше', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.requests.filter(
          (path) => path === '/api/feedback',
        ).length,
    ),
  ).toBe(1);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iskendi_my_order')!),
    ),
  ).not.toHaveProperty('fb');
  await page.evaluate(() => {
    history.pushState(null, '', '/board?my=1&rate=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '5');
});
