import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Production preview: the mock build answers /api inside the page, past page.route.
const origin = 'http://127.0.0.1:4181';
const pixel = readFileSync('tests/fixtures/pixel.png');
const order = (number: number, status: 'preparing' | 'ready') => ({
  number,
  status,
  acceptedAt: '2026-10-20T12:00:00',
  readyAt: null,
  servedAt: null,
});
test.use({ serviceWorkers: 'block' });
// Hall TV: Yandex Browser on a 1366×768 panel shows ~520–560 css px of page.
for (const [count, height] of [
  [3, 560],
  [19, 560],
  [19, 768],
] as const)
  test(`/tv with ${count} preparing at 1366×${height} fits the hall TV`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height });
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.fallback();
      const path = url.pathname;
      if (path === '/api/qr')
        return route.fulfill({ contentType: 'image/png', body: pixel });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-10-20',
          now: '12:00',
          updatedAt: '',
          servedCount: 0,
          orders: [
            ...Array.from({ length: count }, (_, i) =>
              order(1 + i, 'preparing'),
            ),
            order(40, 'ready'),
            order(41, 'ready'),
          ],
        }),
      });
    });
    await page.goto(`${origin}/tv`);
    const preparing = page.getByRole('region', { name: 'Готовим' });
    await expect(preparing.getByRole('listitem').first()).toHaveText('1');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveTitle('Искенди — табло заказов');
    if (count > 12)
      await expect(preparing.getByLabel(/ещё 8/)).toHaveText('+8');
    await expect(
      page.getByRole('region', { name: 'Готово' }).getByRole('listitem'),
    ).toHaveText(['40', '41']);
    const qr = (await page.getByRole('img', { name: /QR/ }).boundingBox())!;
    expect(qr.width).toBeGreaterThanOrEqual(80);
    for (const item of await page.getByRole('listitem').all()) {
      const box = (await item.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    const footer = (await page.getByText(/Новослободская/).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(height);
    expect(errors).toEqual([]);
    expect(requests.some((url) => url.endsWith('/legacy.html'))).toBe(false);
    expect(requests.some((url) => url.includes('mc.yandex.ru'))).toBe(false);
    expect(requests.some((url) => url.includes('/api/guest/'))).toBe(false);
  });
