import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import board from '../fixtures/status-populated.json' with { type: 'json' };
import config from '../fixtures/config-links.json' with { type: 'json' };
import guestEvent from '../fixtures/guest-event-ok.json' with { type: 'json' };
import clientEvent from '../fixtures/client-event-ok.json' with { type: 'json' };
const origin = 'http://127.0.0.1:4181';
test.use({ baseURL: origin });
// Rating, «⋯» sheets and the served-order card share one lazy chunk (CODE-01).
const ratingChunk = /\/app\/lazy-screens-[^/]+\.js(?:\?|$)/;
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const responses: Record<string, unknown> = {
      '/api/status': board,
      '/api/feedback/config': config,
      '/api/guest/event': guestEvent,
      '/api/client/event': clientEvent,
    };
    return url.pathname in responses
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responses[url.pathname]),
        })
      : route.fallback();
  });
});
function observeWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() === 'POST' &&
      ['/api/feedback', '/api/guest/claim'].includes(path)
    )
      writes.push(path);
  });
  return writes;
}
async function restore(page: Page, number: number, served = false) {
  await page.addInitScript(
    ({ number, served }) => {
      localStorage.setItem(
        'iskendi_my_order',
        JSON.stringify({
          n: number,
          d: '2026-10-07',
          seen: true,
          subAt: 10,
          servedAt: served ? Date.now() : 0,
          claim: 'synthetic-existing',
          lastStatus: served ? 'served' : 'ready',
          legacyUnknown: 'retain',
        }),
      );
    },
    { number, served },
  );
}
for (const [name, url, number] of [
  ['entry', '/', 0],
  ['queue', '/board?view=queue', 112],
  ['preparing', '/board?my=1', 112],
  ['ready', '/board?my=1', 102],
] as const)
  test(`rating is not downloaded for the ${name} first screen`, async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (ratingChunk.test(new URL(request.url()).pathname))
        requested.push('rating');
    });
    if (number) await restore(page, number);
    await page.goto(url);
    if (name === 'ready' || name === 'preparing')
      await expect(
        page.getByRole('article', { name: `Ваш заказ ${number}` }),
      ).toBeVisible();
    else await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requested).toEqual([]);
  });
test('a missing rating chunk preserves the order, reloads explicitly, and recovers without claims', async ({
  page,
  context,
}) => {
  await restore(page, 997, true);
  const writes = observeWrites(page);
  const block = (route: import('@playwright/test').Route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/javascript',
      headers: { 'Cache-Control': 'no-store' },
      body: '',
    });
  await context.route(ratingChunk, block);
  await page.goto('/board?my=1&rate=1');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось загрузить экран.',
  );
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 997' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iskendi_my_order')!).legacyUnknown,
    ),
  ).toBe('retain');
  await context.unroute(ratingChunk, block);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The served-order card has the same heading; the dialog's one takes focus.
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Как вам заказ?' }),
  ).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(writes).toEqual([]);
});
test('browser back during rating chunk loading does not open a late dialog or send POST', async ({
  page,
  context,
}) => {
  await restore(page, 997, true);
  const writes = observeWrites(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  const hold = async (route: import('@playwright/test').Route) => {
    started = true;
    await gate;
    await route.continue();
  };
  await context.route(ratingChunk, hold);
  try {
    await page.goto('/board?my=1', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('article', { name: 'Ваш заказ 997' }),
    ).toBeVisible();
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() => {
      history.pushState(null, '', '/board?my=1&rate=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/board\?my=1$/);
    const loaded = page.waitForResponse(
      (response) =>
        ratingChunk.test(new URL(response.url()).pathname) &&
        response.status() === 200,
    );
    release();
    await loaded;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => {
      history.pushState(null, '', '/board?my=1&rate=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(
      page.getByRole('heading', { name: 'Как вам заказ?' }),
    ).toBeFocused();
    expect(writes).toEqual([]);
  } finally {
    release();
    await context.unroute(ratingChunk, hold);
  }
});
