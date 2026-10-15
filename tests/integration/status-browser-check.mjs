/* global window, document */
/* global URL, console */
/* global localStorage */
import { chromium, webkit, expect, request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:8103';
const staff = await request.newContext({ baseURL: origin });
const login = await staff.post('/api/auth/login', {
  data: { password: 'synthetic-spike-password' },
});
expect(login.status()).toBe(200);
const { token } = await login.json();
const headers = { Authorization: 'Bearer ' + token };
const results = [];
try {
  for (const [name, engine, number] of [
    ['chromium', chromium, 112],
    ['webkit', webkit, 113],
  ]) {
    expect(
      (await staff.post('/api/order', { headers, data: { number } })).status(),
    ).toBe(200);
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin
          ? route.fallback()
          : route.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.name));
      await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) =>
          window.__cspViolations.push(event.effectiveDirective),
        );
      });
      await page.goto(origin + '/');
      await page
        .getByRole('textbox', { name: 'Номер заказа' })
        .fill(String(number));
      await page
        .getByRole('button', { name: 'Показать статус', exact: true })
        .click();
      const day = (await (await staff.get('/api/status')).json()).date;
      await expect(page).toHaveURL(
        origin + '/board?my=1&order=' + number + '&day=' + day,
      );
      await expect(
        page
          .getByRole('article', { name: `Ваш заказ ${number}` })
          .getByRole('status'),
      ).toBeVisible();
      expect(
        (
          await staff.post('/api/order/status', {
            headers,
            data: { number, status: 'ready' },
          })
        ).status(),
      ).toBe(200);
      await expect(
        page
          .getByRole('article', { name: `Ваш заказ ${number}` })
          .getByRole('status')
          .filter({ hasText: 'Готов' }),
      ).toBeVisible({ timeout: 15000 });
      expect(
        (
          await staff.post('/api/order/status', {
            headers,
            data: { number, status: 'served' },
          })
        ).status(),
      ).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Как вам заказ?' }),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page
          .getByRole('article', { name: `Ваш заказ ${number}` })
          .getByRole('status')
          .filter({ hasText: 'Выдан' }),
      ).toBeVisible();
      expect(
        await page.evaluate((n) => {
          const record = JSON.parse(localStorage.getItem('iskendi_my_order'));
          return (
            record.n === n &&
            record.d.length === 10 &&
            record.claim.length > 0 &&
            record.servedAt > 0
          );
        }, number),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
      await page.screenshot({
        path: new URL(`${name}-status-issued.png`, import.meta.url).pathname,
        fullPage: true,
      });
      results.push({
        browser: name,
        number,
        states: ['entry', 'preparing', 'ready', 'issued'],
        cspViolations: [],
        storagePreserved: true,
        passed: true,
      });
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    new URL('status-browser-result.json', import.meta.url),
    JSON.stringify({ origin, syntheticOnly: true, results }, null, 2) + '\n',
  );
  console.log(
    'PASS: Chromium/WebKit explicit subscription and live preparing -> ready -> issued via isolated staff API, CSP/storage verified. No tokens logged.',
  );
} finally {
  await staff.post('/api/auth/logout', { headers });
  await staff.dispose();
}
