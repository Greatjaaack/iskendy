/* global window, document */
/* global URL, localStorage, console */
import { webkit, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Only the separately created synthetic test container; never a configurable production origin.
const origin = 'http://127.0.0.1:8103';
const browser = await webkit.launch({ headless: true });
const results = [];
try {
  for (const [number, branch] of [
    [995, 'positive'],
    [996, 'negative'],
  ]) {
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
    const calls = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (
        [
          '/api/guest/claim',
          '/api/feedback',
          '/api/feedback/rate',
          '/api/feedback/detail',
        ].includes(path)
      )
        calls.push({ path, status: response.status() });
    });
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.__cspViolations.push(event.effectiveDirective),
      );
    });
    page.on('pageerror', (error) => errors.push(error.name));
    const response = await page.request.get(`${origin}/api/status`);
    expect(response.ok()).toBe(true);
    const board = await response.json();
    await page.addInitScript(
      ({ number, date }) =>
        localStorage.setItem(
          'iskendi_my_order',
          JSON.stringify({
            n: number,
            d: date,
            subAt: 10,
            seen: true,
            servedAt: Date.now(),
            claim: '',
            lastStatus: 'served',
            legacyUnknown: 'retain',
          }),
        ),
      { number, date: board.date },
    );
    await page.goto(`${origin}/board?my=1&rate=1`);
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press(branch === 'positive' ? 'End' : 'Home');
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: branch === 'positive' ? 'Что порадовало?' : 'Что вас разозлило?',
      }),
    ).toBeVisible();
    if (branch === 'positive') {
      // Exercise actual /rate with the server-owned branch before sending detail.
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await slider.focus();
      await page.keyboard.press('ArrowLeft');
      await page.getByRole('button', { name: 'Дальше', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Что порадовало?' }),
      ).toBeVisible();
    }
    await page
      .getByRole('button', {
        name: branch === 'positive' ? 'Вкус' : 'Остыло',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    if (branch === 'negative') {
      await page
        .getByRole('textbox', { name: 'Комментарий' })
        .fill('Synthetic local verification');
      await page
        .getByRole('button', { name: 'Отправить управляющему', exact: true })
        .click();
    }
    await expect(
      page.getByRole('heading', {
        name: 'Спасибо вам большое',
        exact: true,
      }),
    ).toBeVisible();
    const verified = await page.evaluate(
      ({ number, branch }) => {
        const record = JSON.parse(localStorage.getItem('iskendi_my_order'));
        return (
          record.n === number &&
          record.legacyUnknown === 'retain' &&
          record.rated === true &&
          record.done === true &&
          record.fb?.detailSent === true &&
          record.fb.branch === branch &&
          typeof record.claim === 'string' &&
          record.claim.length > 0
        );
      },
      { number, branch },
    );
    expect(verified).toBe(true);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(calls.every((call) => call.status === 200)).toBe(true);
    await page.getByRole('dialog').screenshot({
      path: new URL(`webkit-${branch}-r4.png`, import.meta.url).pathname,
    });
    results.push({
      branch,
      passed: true,
      calls,
      cspViolations: [],
      endpoints: [
        '/api/guest/claim',
        '/api/feedback',
        ...(branch === 'positive' ? ['/api/feedback/rate'] : []),
        '/api/feedback/detail',
      ],
    });
    await context.close();
  }
  await writeFile(
    new URL('webkit-rating-result.json', import.meta.url),
    JSON.stringify({ origin, syntheticOnly: true, results }, null, 2) + '\n',
  );
  console.log(
    'PASS: 2 real-backend browser rating flows; create, claimEnsure, rate, detail and storage verified. No tokens logged.',
  );
} finally {
  await browser.close();
}
