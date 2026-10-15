import { expect, test } from '@playwright/test';
// Legacy showcase retains its layout; the shared Glass action is now 56px high (+8px).
// The desktop height came from the deleted D5 81:634 with the Maps block; the approved card
// 557:14475 has no Maps link (ADR-014, 12.10). Its 688×250 layout is task R-20261012-04.
for (const [index, width, height] of [
  [0, 342, 258],
  [1, 720, undefined],
] as const)
  test(`Figma issued card ${width}×${height ?? 'auto'} and narrow viewport`, async ({
    page,
  }, info) => {
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const card = page
      .getByTestId('issued-card-kit')
      .getByTestId('issued-card')
      .nth(index);
    await card.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const box = (await card.boundingBox())!;
    expect(box.width).toBe(width);
    if (height) expect(box.height).toBe(height);
    await expect(card.getByRole('link')).toHaveCount(0);
    await card.screenshot({ path: info.outputPath(`issued-${width}.png`) });
    if (index === 0) {
      await page.setViewportSize({ width: 320, height: 900 });
      await expect(
        card.getByRole('button', { name: 'Оценить заказ', exact: true }),
      ).toBeVisible();
      const photos = await card.locator('img').all();
      const narrow = (await card.boundingBox())!;
      for (const photo of photos) {
        const b = (await photo.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(narrow.x);
        expect(b.x + b.width).toBeLessThanOrEqual(narrow.x + narrow.width);
      }
      await card.screenshot({ path: info.outputPath('issued-320.png') });
    }
  });
