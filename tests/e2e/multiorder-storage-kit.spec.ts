import { expect, test, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:5174';
const modulePath = '/src/storage/orderCollectionStorage.ts';
async function read(page: Page) {
  return page.evaluate(async (path) => {
    const { createOrderCollectionStorage } = await import(path);
    return createOrderCollectionStorage().read();
  }, modulePath);
}
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/'))
      return route.continue();
    return route.abort();
  });
  await page.goto(origin + '/dev/kit.html');
  await page.evaluate(() => localStorage.clear());
});

test('empty storage has no fabricated demo order; legacy migration retains bytes after reload', async ({
  page,
}) => {
  expect(await read(page)).toMatchObject({
    ok: true,
    collection: { orders: [] },
  });
  const record = {
    n: 135,
    d: '2026-10-09',
    rated: true,
    future: { preserved: true },
    fb: {
      id: 9,
      token: 'synthetic',
      rating: 5,
      branch: 'positive',
      unknown: true,
    },
  };
  const bytes = JSON.stringify(record);
  await page.evaluate(
    async ({ path, bytes }) => {
      localStorage.setItem('iskendi_my_order', bytes);
      const { createOrderCollectionStorage } = await import(path);
      createOrderCollectionStorage().migrate();
    },
    { path: modulePath, bytes },
  );
  await page.reload();
  expect(await read(page)).toMatchObject({
    ok: true,
    collection: { orders: [record] },
  });
  expect(
    await page.evaluate(() => localStorage.getItem('iskendi_my_order')),
  ).toBe(bytes);
});

test('two real tabs retain concurrent additions up to five and repeated QR cannot reset ratings', async ({
  context,
  page,
}) => {
  const second = await context.newPage();
  await second.goto(origin + '/dev/kit.html');
  const add = (target: Page, numbers: number[]) =>
    target.evaluate(
      async ({ path, numbers }) => {
        const { createOrderCollectionStorage } = await import(path);
        const storage = createOrderCollectionStorage();
        for (const n of numbers) storage.add({ n, d: '2026-10-09' });
      },
      { path: modulePath, numbers },
    );
  await Promise.all([add(page, [112, 128, 135]), add(second, [136, 137])]);
  const before = await read(page);
  expect(before).toMatchObject({
    ok: true,
    collection: {
      orders: expect.arrayContaining(
        [112, 128, 135, 136, 137].map((n) => ({ n, d: '2026-10-09' })),
      ),
    },
  });
  expect(before.collection.orders).toHaveLength(5);
  await page.evaluate(async (path) => {
    const { createOrderCollectionStorage } = await import(path);
    createOrderCollectionStorage().patch(
      { n: 135, d: '2026-10-09' },
      {
        rated: true,
        fb: { id: 9, token: 'synthetic', rating: 5, branch: 'positive' },
      },
    );
  }, modulePath);
  await add(second, [135]);
  expect(await read(second)).toEqual(await read(page));
  await second.reload();
  const after = await read(second);
  expect(
    after.collection.orders.map((order: { n: number }) => order.n),
  ).toEqual(before.collection.orders.map((order: { n: number }) => order.n));
  expect(
    after.collection.orders.find((order: { n: number }) => order.n === 135),
  ).toMatchObject({ rated: true, fb: { rating: 5 } });
  expect(
    after.collection.orders.find((order: { n: number }) => order.n === 112),
  ).not.toHaveProperty('fb');
});

test('parallel status and rating patches survive across tabs and dates isolate repeated numbers', async ({
  context,
  page,
}) => {
  await page.evaluate(async (path) => {
    const { createOrderCollectionStorage } = await import(path);
    const storage = createOrderCollectionStorage();
    storage.add({ n: 135, d: '2026-10-09' });
    storage.add({ n: 135, d: '2026-10-10' });
  }, modulePath);
  const second = await context.newPage();
  await second.goto(origin + '/dev/kit.html');
  await Promise.all([
    page.evaluate(async (path) => {
      const { createOrderCollectionStorage } = await import(path);
      createOrderCollectionStorage().patch(
        { n: 135, d: '2026-10-09' },
        {
          rated: true,
          fb: { id: 9, token: 'synthetic', rating: 5, branch: 'positive' },
        },
      );
    }, modulePath),
    second.evaluate(async (path) => {
      const { createOrderCollectionStorage } = await import(path);
      createOrderCollectionStorage().patch(
        { n: 135, d: '2026-10-09' },
        { lastStatus: 'served' },
      );
    }, modulePath),
  ]);
  expect(await read(second)).toEqual(await read(page));
  expect(await read(page)).toMatchObject({
    ok: true,
    collection: {
      orders: [
        {
          n: 135,
          d: '2026-10-09',
          rated: true,
          lastStatus: 'served',
          fb: { rating: 5 },
        },
        { n: 135, d: '2026-10-10' },
      ],
    },
  });
});

test('interrupted or quota-blocked rating is not fabricated after reload', async ({
  page,
}) => {
  const result = await page.evaluate(async (path) => {
    const { createOrderCollectionStorage } = await import(path);
    const storage = createOrderCollectionStorage();
    storage.add({ n: 135, d: '2026-10-09' });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('Synthetic quota', 'QuotaExceededError');
    };
    try {
      return storage.patch(
        { n: 135, d: '2026-10-09' },
        {
          rated: true,
          fb: { id: 9, token: 'synthetic', rating: 5, branch: 'positive' },
        },
      );
    } finally {
      Storage.prototype.setItem = original;
    }
  }, modulePath);
  expect(result).toEqual({ ok: false, reason: 'storage-unavailable' });
  await page.reload();
  expect(await read(page)).toMatchObject({
    ok: true,
    collection: { orders: [{ n: 135, d: '2026-10-09' }] },
  });
});
