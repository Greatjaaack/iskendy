import { test, expect } from '@playwright/test';
import { boardLoaded } from './support/board';
const submit = (page: import('@playwright/test').Page) =>
  page.getByRole('button', {
    name: 'Показать статус',
    exact: true,
  });
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
test('permission follows one explicit successful subscription without replacing mock worker', async ({
  page,
}) => {
  await page.goto('/');
  await boardLoaded(page);
  expect(
    await page.evaluate(() => window.__ISKENDY_TEST__!.signals.events),
  ).not.toContain('permission');
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await submit(page).click();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  const events = await page.evaluate(
    () => window.__ISKENDY_TEST__!.signals.events,
  );
  expect(events.filter((event) => event === 'permission')).toHaveLength(1);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toContain('/mockServiceWorker.js');
});
test('a business rejection never prompts or sends a success vibration', async ({
  page,
}) => {
  await page.goto('/');
  await boardLoaded(page);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setFixture('/api/guest/claim', 'claim-taken'),
  );
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await submit(page).click();
  await expect(
    page.getByLabel('Номер заказа', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByLabel('Номер заказа', { exact: true }),
  ).toHaveAccessibleDescription(
    'Этот номер уже отслеживают с другого телефона',
  );
  expect(
    await page.evaluate(() => window.__ISKENDY_TEST__!.signals.events),
  ).not.toContain('permission');
  expect(
    await page.evaluate(() => window.__ISKENDY_TEST__!.signals.events),
  ).not.toContain('subscribed');
});

test('repeated submission during a delayed claim stays single', async ({
  page,
}) => {
  let claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await page.goto('/');
  await boardLoaded(page);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.holdResponse('/api/guest/claim'),
  );
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await submit(page).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ISKENDY_TEST__!.requests.filter(
            (path) => path === '/api/guest/claim',
          ).length,
      ),
    )
    .toBe(1);
  await expect(submit(page)).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(submit(page)).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.requests.filter(
          (path) => path === '/api/guest/claim',
        ).length,
    ),
  ).toBe(1);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.releaseResponse('/api/guest/claim'),
  );
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  expect(claims).toBe(1);
  expect(
    await page.evaluate(
      () =>
        window.__ISKENDY_TEST__!.signals.events.filter(
          (e) => e === 'permission',
        ).length,
    ),
  ).toBe(1);
});

test('leaving a delayed subscription rejects its late response and permits return', async ({
  page,
}) => {
  let claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await page.goto('/');
  await boardLoaded(page);
  await page.evaluate(() =>
    window.__ISKENDY_TEST__!.setDelay('/api/guest/claim', 1000),
  );
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await submit(page).click();
  await expect(submit(page)).toBeDisabled();
  // Q-14: before a claim only «Мои заказы» and «Помощь» are in the navigation.
  await page
    .getByRole('navigation')
    .filter({ visible: true })
    .getByRole('link', { name: 'Помощь', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Помощь' })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(() => localStorage.getItem('iskendi_my_order')),
  ).toBeNull();
  expect(
    await page.evaluate(() => window.__ISKENDY_TEST__!.signals.events),
  ).not.toContain('permission');
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Где мой заказ?' }),
  ).toBeVisible();
  await expect(page.getByLabel('Номер заказа', { exact: true })).toBeEnabled();
  expect(claims).toBe(1);
});

test('guest telemetry keeps goal parameters private and emits bounded funnel steps', async ({
  page,
}) => {
  const steps: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/guest/event')
      steps.push(request.postDataJSON() as Record<string, unknown>);
  });
  await page.goto('/');
  await boardLoaded(page);
  await page.getByLabel('Номер заказа', { exact: true }).fill('112');
  await submit(page).click();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  await expect
    .poll(() => steps.filter((body) => body.step === 'sub_ok').length)
    .toBe(1);
  expect(steps.filter((body) => body.step === 'board_open')).toHaveLength(1);
  expect(steps.filter((body) => body.step === 'sub_try')).toHaveLength(1);
  const calls = await page.evaluate(() => window.ym?.a ?? []);
  const goals = calls.filter((call) => call[1] === 'reachGoal');
  expect(goals.some((call) => call[2] === 'sub_ok')).toBe(true);
  expect(goals.some((call) => call[2] === 'notif_granted')).toBe(true);
  expect(goals.every((call) => call.length === 3)).toBe(true);
  expect(JSON.stringify(goals)).not.toMatch(
    /claimToken|editToken|synthetic|\b112\b/,
  );
  expect(await page.locator('script[src*="mc.yandex.ru"]').count()).toBe(0);
});

test('restoring a ready order with no prior status does not invent a ready transition', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({
        n: 102,
        d: '2026-10-07',
        seen: true,
        subAt: 10,
        claim: 'synthetic-claim',
        servedAt: 0,
        rated: false,
        done: false,
        lastStatus: '',
      }),
    );
  });
  await page.goto('/board?my=1');
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 102' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('iskendi_my_order')!).lastStatus,
      ),
    )
    .toBe('ready');
  expect(
    await page.evaluate(() =>
      window.__ISKENDY_TEST__!.signals.events.filter(
        (event) => event === 'ready:102',
      ),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 102' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__ISKENDY_TEST__!.signals.events.filter(
        (event) => event === 'ready:102',
      ),
    ),
  ).toEqual([]);
});
