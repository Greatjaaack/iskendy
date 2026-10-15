import { test, expect, type Locator } from '@playwright/test';
import { boardLoaded } from './support/board';

// R-20261012-01 (UX-01, UX-13): iPhone in landscape, 844×390.
test.use({ viewport: { width: 844, height: 390 } });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'iphone', 'WebKit iPhone only');
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.fallback()
      : route.abort(),
  );
});
async function overlaps(a: Locator, b: Locator) {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()];
  if (!x || !y) return false;
  return (
    x.x < y.x + y.width &&
    y.x < x.x + x.width &&
    x.y < y.y + y.height &&
    y.y < x.y + x.height
  );
}
test('landscape iPhone: safe area enabled and the dock never covers the focused number field', async ({
  page,
}, info) => {
  await page.goto('/');
  await boardLoaded(page);
  // Without viewport-fit=cover iOS reports every env(safe-area-inset-*) as 0.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(844);
  const field = page.getByLabel('Номер заказа', { exact: true });
  await field.focus();
  await field.fill('11');
  const docks = page.getByRole('navigation');
  for (const dock of await docks.all())
    if (await dock.isVisible()) expect(await overlaps(dock, field)).toBe(false);
  await page.screenshot({ path: info.outputPath('landscape-entry.png') });
});
