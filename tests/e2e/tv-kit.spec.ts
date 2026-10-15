import { expect, test } from '@playwright/test';
for (const state of ['populated', 'empty', 'no-connection', 'overflow'])
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
  ])
    test(`TV ${state} ${width}×${height} has author geometry and no API`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: width!, height: height! });
      const api: string[] = [];
      await page.route('**/api/**', (route) => {
        api.push(route.request().url());
        return route.abort();
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:5174/dev/tv.html?state=${state}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.getByRole('heading', { name: 'Готовим', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Готово', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('listitem')).toHaveCount(
        state === 'overflow' ? 24 : state === 'populated' ? 10 : 0,
      );
      const bounds = await page.locator('main').boundingBox();
      expect(bounds!.width).toBeCloseTo(
        Math.min(width!, (height! * 1920) / 1080),
        0,
      );
      expect(bounds!.height).toBeCloseTo(
        Math.min(height!, (width! * 1080) / 1920),
        0,
      );
      for (const number of await page.getByRole('listitem').all()) {
        const b = (await number.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width!);
        expect(b.y + b.height).toBeLessThanOrEqual(height!);
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(() =>
          [...document.images].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        ),
      ).toBe(true);
      expect(api).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`tv-${state}-${width}.png`),
      });
    });
test('static Ticker exposes the complete author cycle by native keyboard scrolling', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const ticker = page.getByTestId('footer-desktop-kit').getByTestId('ticker');
  await ticker.scrollIntoViewIfNeeded();
  await ticker.focus();
  await expect(ticker).toBeFocused();
  await expect(ticker.getByText('Выбирайте своё. Мы приготовим.')).toHaveCount(
    1,
  );
  await expect(ticker).toHaveCSS('height', '56px');
  await expect(ticker).toHaveCSS('background-color', 'rgb(248, 243, 231)');
  await page.keyboard.press('End');
  await expect
    .poll(() => ticker.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
});
