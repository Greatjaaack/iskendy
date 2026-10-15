import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:8103')
      return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { spikeCspViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(event.violatedDirective);
    });
  });
});

for (const path of ['/', '/board?my=1', '/board?view=queue']) {
  test(`FastAPI serves the new guest app on ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain(
      "script-src 'self'",
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      path.includes('view=queue') ? 'Табло' : 'Где мой заказ?',
    );
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
      path,
    );
  });
}

for (const [path, selector] of [
  ['/tv', '#guest'],
  ['/staff', '#loginBox'],
  ['/stats', '#statsAuthNote'],
] as const) {
  test(`FastAPI CSP allows the legacy bridge on ${path}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const cspErrors: string[] = [];
    page.on('console', (message) => {
      if (
        /Content Security Policy|Refused to (execute|load|connect|apply)|violates.*directive/i.test(
          message.text(),
        )
      )
        cspErrors.push(message.text());
    });
    const mountRequests: string[] = [];
    const metricRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/\/app\/mount-/.test(request.url()))
        mountRequests.push(request.url());
      if (request.url().includes('mc.yandex.ru'))
        metricRequests.push(request.url());
    });
    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain(
      "worker-src 'self' blob:",
    );
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
    const wordmark = page.locator(
      `${path === '/tv' ? '#guest' : `#${path.slice(1)}`} img.wordmark`,
    );
    await expect
      .poll(() =>
        wordmark.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator(selector)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
    expect(errors).toEqual([]);
    expect(cspErrors).toEqual([]);
    expect(mountRequests).toEqual([]);
    expect(metricRequests).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { spikeCspViolations: string[] })
            .spikeCspViolations,
      ),
    ).toEqual([]);
    await info.attach('legacy-local-smoke', {
      body: await page.screenshot({
        path: info.outputPath('legacy-local-smoke.png'),
        fullPage: true,
      }),
      contentType: 'image/png',
    });
  });
}

test('local synthetic staff login renders real analytics and preserves the session on reload', async ({
  page,
}) => {
  let token = '';
  try {
    await page.goto('/staff');
    await page.locator('#pw').fill('synthetic-spike-password');
    const loginResponse = page.waitForResponse('**/api/auth/login');
    await page.locator('#loginBox button').click();
    const response = await loginResponse;
    expect(response.status()).toBe(200);
    token = ((await response.json()) as { token: string }).token;
    await expect(page.locator('#panelBox')).toBeVisible();
    await expect(page.locator('#orderList')).toContainText('102');
    const statsResponse = page.waitForResponse('**/api/stats/range?*');
    await page.getByText('Аналитика', { exact: true }).click();
    expect((await statsResponse).status()).toBe(200);
    await expect(page.locator('#statsContent')).toBeVisible();
    await expect(page.locator('#chartOrders svg')).toBeVisible();
    await expect(page.locator('#chartTimes svg')).toBeVisible();
    await page.reload();
    await expect(page.locator('#statsContent')).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { spikeCspViolations: string[] })
            .spikeCspViolations,
      ),
    ).toEqual([]);
  } finally {
    if (token) {
      const logout = await page.request.post('/api/auth/logout', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(logout.status()).toBe(200);
    }
  }
});

test('production notification worker registers under FastAPI CSP', async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (
      /Content Security Policy|Refused to (execute|load|connect)|violates.*directive/i.test(
        message.text(),
      )
    )
      cspErrors.push(message.text());
  });
  await page.goto('/board');
  const script = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    try {
      const ready = await navigator.serviceWorker.ready;
      return ready.active?.scriptURL;
    } finally {
      await registration.unregister();
    }
  });
  expect(script).toBe('http://127.0.0.1:8103/sw.js');
  expect(cspErrors).toEqual([]);
});

test('legacy guest transition automatically hands off to the new app', async ({
  page,
}) => {
  let token = '';
  try {
    await page.goto('/staff');
    await page.locator('#pw').fill('synthetic-spike-password');
    const login = page.waitForResponse('**/api/auth/login');
    await page.locator('#loginBox button').click();
    token = ((await (await login).json()) as { token: string }).token;
    await expect(page.locator('#panelBox')).toBeVisible();
    await page.getByText('← Гостевое табло', { exact: true }).click();
    expect(new URL(page.url()).pathname).toBe('/board');
    await expect(page.locator('#root')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Табло заказов',
    );
    await page.goBack();
    await expect(page.locator('#panelBox')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/staff');
    await page.goForward();
    await expect(page.locator('#root')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe('/board');
  } finally {
    if (token) {
      const logout = await page.request.post('/api/auth/logout', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(logout.status()).toBe(200);
    }
  }
});
