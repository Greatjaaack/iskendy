import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:4181';
const status = JSON.parse(
  readFileSync('tests/fixtures/status-populated.json', 'utf8'),
);
const config = JSON.parse(
  readFileSync('tests/fixtures/config-empty.json', 'utf8'),
);
const original = {
  n: 135,
  d: '2026-10-07',
  subAt: 1,
  servedAt: 1,
  rated: true,
  done: true,
  extra: { retained: true },
  fb: {
    id: 9,
    token: 'synthetic-original',
    rating: 5,
    branch: 'positive',
    future: true,
  },
};
test.use({ serviceWorkers: 'block' });
async function submit(page: Page, n: number) {
  // With orders saved, another number goes through «Добавить заказ» (variant A).
  const add = page.getByRole('button', { name: 'Добавить заказ' });
  const entry = page.getByRole('heading', { name: 'Где мой заказ?' });
  await expect(add.or(entry).first()).toBeVisible();
  if (await add.isVisible()) await add.click();
  const scope = (await add.count())
    ? page.getByRole('dialog', { name: 'Добавить заказ' })
    : page.locator('main');
  await scope.getByLabel('Номер заказа', { exact: true }).fill(String(n));
  await scope.getByRole('button', { name: 'Показать статус' }).click();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ ' + n, exact: true }),
  ).toBeVisible();
  // SEC-02: whichever way the order was added, the address has no number.
  expect(new URL(page.url()).search).not.toMatch(/order=|day=|\d{3}/);
}
async function saved(page: Page, n: number) {
  return page.evaluate((n) => {
    const operations = Object.keys(localStorage)
      .filter((key) => key.startsWith('iskendy_orders_v1:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!));
    const record = operations.find(
      (op) => op.kind === 'add' && op.record.n === n,
    )?.record;
    return record;
  }, n);
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    let data: unknown;
    if (url.pathname === '/api/status') data = status;
    else if (url.pathname === '/api/feedback/config') data = config;
    else if (url.pathname === '/api/guest/claim')
      data = {
        ok: true,
        claimToken: 'synthetic-' + request.postDataJSON().number,
        number: request.postDataJSON().number,
      };
    else if (url.pathname === '/api/feedback/check')
      data = { ok: false, reason: 'already' };
    else if (url.pathname.startsWith('/api/')) data = { ok: true };
    else return route.continue();
    return route.fulfill({ json: data });
  });
});
test('live claim preserves a migrated rating through new order, repeat QR and reload', async ({
  page,
}) => {
  await page.addInitScript(
    (record) =>
      localStorage.setItem('iskendi_my_order', JSON.stringify(record)),
    original,
  );
  await page.goto(origin + '/');
  await submit(page, 112);
  expect(await saved(page, 135)).toEqual(original);
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112', exact: true }),
  ).toBeVisible();
  await page.goto(origin + '/');
  await submit(page, 135);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iskendi_my_order')!),
    ),
  ).toEqual(original);
  expect(await saved(page, 112)).toMatchObject({ n: 112, d: '2026-10-07' });
});
test('two live app tabs keep their own selected order after concurrent claims and reload', async ({
  context,
  page,
}) => {
  const second = await context.newPage();
  await Promise.all([page.goto(origin + '/'), second.goto(origin + '/')]);
  await Promise.all([submit(page, 112), submit(second, 110)]);
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112', exact: true }),
  ).toBeVisible();
  await expect(
    second.getByRole('article', { name: 'Ваш заказ 110', exact: true }),
  ).toBeVisible();
  expect(await saved(page, 112)).toMatchObject({ n: 112 });
  expect(await saved(page, 110)).toMatchObject({ n: 110 });
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112', exact: true }),
  ).toBeVisible();
});
test('acknowledged feedback with failed local write requires fresh check and cannot fabricate an edit token', async ({
  page,
}) => {
  let committed = false,
    creates = 0;
  await page.route(origin + '/api/feedback/check*', (route) =>
    route.fulfill({
      json: committed
        ? { ok: false, reason: 'already' }
        : { ok: true, reason: null, number: 135, waitSeconds: 0 },
    }),
  );
  await page.route(origin + '/api/feedback', (route) => {
    committed = true;
    creates++;
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ok: true,
        feedbackId: 99,
        editToken: 'synthetic-new',
        number: 135,
        rating: body.rating,
        branch: 'negative',
        waitSeconds: 0,
        links: {},
      },
    });
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({
        n: 135,
        d: '2026-10-07',
        subAt: 1,
        servedAt: 1,
        promptedAt: 1,
        claim: 'synthetic',
        lastStatus: 'served',
      }),
    ),
  );
  await page.goto(origin + '/board?my=1&rate=1');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('iskendy_orders_v1:'))
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      native.call(this, key, value);
    };
  });
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('slider')).toBeVisible();
  expect(creates).toBe(1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iskendi_my_order')!).fb,
    ),
  ).toBeUndefined();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(page.getByRole('slider')).not.toBeVisible();
  expect(creates).toBe(1);
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('iskendi_my_order')!),
  );
  expect(record.rated).toBe(true);
  expect(record.fb).toBeUndefined();
});
