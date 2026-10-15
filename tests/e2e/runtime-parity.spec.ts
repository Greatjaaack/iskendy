import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4181';
const legacyHtml = readFileSync('legacy/index.html', 'utf8');
const status = readFileSync('tests/fixtures/status-populated.json', 'utf8');
const config = readFileSync('tests/fixtures/config-empty.json', 'utf8');
const pixel = readFileSync('tests/fixtures/pixel.png');
type Call = {
  path: string;
  method: string;
  body: Record<string, unknown> | null;
};
test.use({ serviceWorkers: 'block' });

/** Full unchanged legacy document vs production app, every API intercepted and external origin blocked. */
async function isolate(
  page: Page,
  legacy: boolean,
  path: '/' | '/board' = '/board',
) {
  const calls: Call[] = [];
  let failing = false;
  await page.clock.install({ time: new Date('2026-10-07T10:08:00Z') });
  await page.clock.pauseAt(new Date('2026-10-07T10:08:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('iskendy_guest', 'synthetic-guest');
    sessionStorage.setItem('iskendy_visit', 'synthetic-visit');
    let visible = true;
    Object.defineProperty(document, 'visibilityState', {
      get: () => (visible ? 'visible' : 'hidden'),
    });
    window.addEventListener('parity-visibility', (event) => {
      visible = (event as CustomEvent<boolean>).detail;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (legacy && request.isNavigationRequest() && url.pathname === path)
      return route.fulfill({ contentType: 'text/html', body: legacyHtml });
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    calls.push({
      path: url.pathname,
      method: request.method(),
      body: request.postData()
        ? (request.postDataJSON() as Record<string, unknown>)
        : null,
    });
    if (url.pathname === '/api/qr')
      return route.fulfill({ contentType: 'image/png', body: pixel });
    if (url.pathname === '/api/status')
      return route.fulfill({
        status: failing ? 503 : 200,
        contentType: 'application/json',
        body: failing ? '{"detail":"synthetic outage"}' : status,
      });
    if (url.pathname === '/api/feedback/config')
      return route.fulfill({ contentType: 'application/json', body: config });
    if (['/api/guest/event', '/api/client/event'].includes(url.pathname))
      return route.fulfill({
        contentType: 'application/json',
        body: '{"ok":true}',
      });
    throw new Error(`Unconfigured synthetic API: ${url.pathname}`);
  });
  await page.goto(origin + path);
  if (legacy && path === '/') {
    await expect(page.locator('#landing')).toBeVisible();
    return {
      calls,
      failing: (value: boolean) => {
        failing = value;
      },
      statuses: () =>
        calls.filter((call) => call.path === '/api/status').length,
    };
  }
  await expect
    .poll(() => calls.filter((call) => call.path === '/api/guest/event').length)
    .toBe(1);
  await expect
    .poll(() => calls.filter((call) => call.path === '/api/status').length)
    .toBe(1);
  await expect
    .poll(
      () => calls.filter((call) => call.path === '/api/feedback/config').length,
    )
    .toBe(1);
  if (!legacy)
    await expect(
      // `/` and bare `/board` (receipt QR, UX-22) open the same entry.
      page.getByRole('heading', { name: 'Где мой заказ?' }),
    ).toBeVisible();
  return {
    calls,
    failing: (value: boolean) => {
      failing = value;
    },
    statuses: () => calls.filter((call) => call.path === '/api/status').length,
  };
}

for (const legacy of [true, false]) {
  const name = legacy ? 'unchanged legacy' : 'production guest';
  test(`${name} startup sends one status/config/visit, no claim and a bounded visit payload`, async ({
    page,
  }) => {
    const h = await isolate(page, legacy);
    expect(
      h.calls
        .filter((call) =>
          ['/api/status', '/api/feedback/config', '/api/guest/event'].includes(
            call.path,
          ),
        )
        .map((call) => call.path)
        .sort(),
    ).toEqual(['/api/feedback/config', '/api/guest/event', '/api/status']);
    expect(h.calls.find((call) => call.path === '/api/guest/event')).toEqual({
      path: '/api/guest/event',
      method: 'POST',
      body: {
        step: 'board_open',
        session: 'synthetic-visit',
        guest: 'synthetic-guest',
        number: null,
      },
    });
    expect(h.calls.some((call) => call.path === '/api/guest/claim')).toBe(
      false,
    );
    await page.clock.runFor(1000);
    expect(
      h.calls.filter((call) => call.path === '/api/feedback/config'),
    ).toHaveLength(1);
    expect(
      h.calls.filter((call) => call.path === '/api/guest/event'),
    ).toHaveLength(1);
    const analytics = await page.evaluate(
      () => window.ym?.a?.map((call) => Array.from(call)) ?? [],
    );
    expect(analytics.filter((call) => call[1] === 'init')).toHaveLength(1);
    // Legacy init records its first pageview implicitly; the new defer:true init uses one manual hit.
    expect(analytics.filter((call) => call[1] === 'hit')).toHaveLength(
      legacy ? 0 : 1,
    );
    expect(analytics.find((call) => call[1] === 'init')?.[2]).toMatchObject({
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });
    if (!legacy)
      expect(analytics.find((call) => call[1] === 'init')?.[2]).toMatchObject({
        defer: true,
      });
    expect(analytics.every((call) => call[0] === 110894396)).toBe(true);
  });
  test(`${name} reload keeps visit identity but restarts page-local event/config scope`, async ({
    page,
  }) => {
    const h = await isolate(page, legacy);
    await page.evaluate(() =>
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'synthetic reload scope' }),
      ),
    );
    await expect
      .poll(
        () =>
          h.calls.filter((call) => call.path === '/api/client/event').length,
      )
      .toBe(1);
    await page.reload();
    await expect
      .poll(
        () => h.calls.filter((call) => call.path === '/api/guest/event').length,
      )
      .toBe(2);
    await expect
      .poll(
        () =>
          h.calls.filter((call) => call.path === '/api/feedback/config').length,
      )
      .toBe(2);
    await expect.poll(h.statuses).toBe(2);
    await page.evaluate(() =>
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'synthetic reload scope' }),
      ),
    );
    await expect
      .poll(
        () =>
          h.calls.filter((call) => call.path === '/api/client/event').length,
      )
      .toBe(2);

    expect(
      h.calls
        .filter((call) => call.path === '/api/guest/event')
        .map((call) => call.body),
    ).toEqual([
      {
        step: 'board_open',
        session: 'synthetic-visit',
        guest: 'synthetic-guest',
        number: null,
      },
      {
        step: 'board_open',
        session: 'synthetic-visit',
        guest: 'synthetic-guest',
        number: null,
      },
    ]);
  });
  test(`${name} root follows the existing landing-versus-entry decision`, async ({
    page,
  }) => {
    const h = await isolate(page, legacy, '/');
    await page.clock.runFor(5001);
    await expect.poll(h.statuses).toBe(legacy ? 0 : 2);
    expect(
      h.calls.filter((call) => call.path === '/api/guest/event'),
    ).toHaveLength(legacy ? 0 : 1);
    expect(
      h.calls.filter((call) => call.path === '/api/feedback/config'),
    ).toHaveLength(legacy ? 0 : 1);
    expect(h.calls.some((call) => call.path === '/api/guest/claim')).toBe(
      false,
    );
  });
  test(`${name} polls at 5s/20s and refreshes once on visibility return`, async ({
    page,
  }) => {
    const h = await isolate(page, legacy);
    await page.clock.runFor(4999);
    expect(h.statuses()).toBe(1);
    await page.clock.runFor(1);
    await expect.poll(h.statuses).toBe(2);
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('parity-visibility', { detail: false }),
      ),
    );
    await page.clock.runFor(19999);
    expect(h.statuses()).toBe(2);
    await page.clock.runFor(1);
    await expect.poll(h.statuses).toBe(3);
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('parity-visibility', { detail: true }),
      ),
    );
    await expect.poll(h.statuses).toBe(4);
    expect(
      h.calls.filter((call) => call.path === '/api/feedback/config'),
    ).toHaveLength(1);
    expect(
      h.calls.filter((call) => call.path === '/api/guest/event'),
    ).toHaveLength(1);
  });
}

test('production guest backs off after outage, sends one recovered report, and preserves visit frequency', async ({
  page,
}) => {
  const h = await isolate(page, false);
  h.failing(true);
  // Request interception is earlier than the client's receipt of its response. Await delivery
  // before advancing the frozen clock again, so a busy browser can schedule the next interval.
  const advanceStatus = async (ms: number) => {
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/status',
    );
    await page.clock.runFor(ms);
    await (await response).finished();
    await page.evaluate(() => Promise.resolve());
  };
  for (const [index, interval] of [5000, 5000, 10000].entries()) {
    await advanceStatus(interval);
    await expect.poll(h.statuses).toBe(index + 2);
    expect(
      h.calls.filter((call) => call.path === '/api/client/event'),
    ).toHaveLength(0);
  }
  h.failing(false);
  await advanceStatus(20000);
  await expect.poll(h.statuses).toBe(5);
  await expect
    .poll(
      () => h.calls.filter((call) => call.path === '/api/client/event').length,
    )
    .toBe(1);
  expect(h.calls.find((call) => call.path === '/api/client/event')).toEqual({
    path: '/api/client/event',
    method: 'POST',
    body: {
      kind: 'offline',
      screen: 'entry', // bare /board is the receipt-QR entry (UX-22)
      detail: 'Экран был без связи 40 с',
    },
  });
  await advanceStatus(5000);
  await expect.poll(h.statuses).toBe(6);
  expect(
    h.calls.filter((call) => call.path === '/api/client/event'),
  ).toHaveLength(1);
  expect(
    h.calls.filter((call) => call.path === '/api/guest/event'),
  ).toHaveLength(1);
  expect(JSON.stringify(h.calls)).not.toMatch(
    /claimToken|editToken|claim_token|edit_token|comment|contact/,
  );
});

test('production client reporting keeps its 60s budget across wall-clock corrections and sends generic payloads', async ({
  page,
}) => {
  const h = await isolate(page, false);
  const report = () =>
    page.evaluate(() =>
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'claimToken=synthetic-private; synthetic contact draft',
        }),
      ),
    );
  const count = () =>
    h.calls.filter((call) => call.path === '/api/client/event').length;
  await report();
  await expect.poll(count).toBe(1);
  await page.clock.setSystemTime(new Date('2026-10-07T11:08:00Z'));
  await report();
  expect(count()).toBe(1);
  await page.clock.runFor(59999);
  await report();
  expect(count()).toBe(1);
  await page.clock.runFor(1);
  await report();
  await expect.poll(count).toBe(2);
  await page.clock.setSystemTime(new Date('2026-10-07T09:08:00Z'));
  await report();
  expect(count()).toBe(2);
  await page.clock.runFor(60000);
  await report();
  await expect.poll(count).toBe(3);
  for (const call of h.calls.filter(
    (call) => call.path === '/api/client/event',
  ))
    expect(call).toEqual({
      path: '/api/client/event',
      method: 'POST',
      body: {
        kind: 'js',
        screen: 'entry', // bare /board is the receipt-QR entry (UX-22)
        detail: 'Ошибка выполнения скрипта',
      },
    });
  expect(JSON.stringify(h.calls)).not.toMatch(
    /synthetic-private|contact draft/,
  );
});
