import { expect, test } from '@playwright/test';
// R-20261012-02 / ADR-019: a regular guest with a long journal (review 12.10:
// 1 504 keys, CPU ×6 → 7 long tasks, 1 012 ms in 6 s) must scroll and type smoothly.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
test('1 500 journal keys at CPU ×6: folded once, then no long task over 50 ms', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'android',
    'CDP CPU throttling needs Chromium; one mobile profile is enough.',
  );
  await page.addInitScript(() => {
    if (
      Object.keys(localStorage).some((k) => k.startsWith('iskendy_orders_v1:'))
    )
      return;
    const prefix = 'iskendy_orders_v1:';
    localStorage.setItem(
      prefix + 'seed-add',
      JSON.stringify({
        sequence: 1,
        kind: 'add',
        record: { n: 112, d: '2026-10-07', seen: true, subAt: 1 },
      }),
    );
    for (let i = 0; i < 1500; i++)
      localStorage.setItem(
        prefix + 'seed-' + i,
        JSON.stringify({
          sequence: 2 + i,
          kind: 'patch',
          identity: { n: 112, d: '2026-10-07' },
          patch: { lastStatus: 'preparing', subAt: 1 + i },
        }),
      );
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto('/board?my=1');
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith('iskendy_orders_v1:'),
          ).length,
      ),
    )
    .toBeLessThanOrEqual(2);
  const longTasks = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const found: number[] = [];
        new PerformanceObserver((list) =>
          list.getEntries().forEach((entry) => found.push(entry.duration)),
        ).observe({ type: 'longtask' });
        setTimeout(() => resolve(found), 6000);
      }),
  );
  expect(longTasks.filter((duration) => duration > 50)).toEqual([]);
});
