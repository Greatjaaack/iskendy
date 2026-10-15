import { expect, test } from '@playwright/test';
for (const [name, width, height] of [
  // Hours in three lines and the Telegram channel card (Q-09, Q-06): Web/Footer/Desktop 557:14264.
  ['mobile', 342, 514],
  ['desktop', 1200, 318],
] as const)
  test(`Figma ${name} footer with static author Ticker`, async ({
    page,
  }, info) => {
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const footer = page
      .getByTestId(`footer-${name}-kit`)
      .getByTestId('guest-footer');
    await footer.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const box = (await footer.boundingBox())!;
    expect(box.width).toBe(width);
    expect(box.height).toBe(height);
    const links = footer.getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      const b = (await link.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS('outline-style', 'solid');
      await expect(link).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
    }
    const images = footer.locator('img');
    for (const image of await images.all()) {
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const b = (await image.boundingBox())!;
      if (
        (await image.getAttribute('alt')) === '' &&
        !(await image.evaluate((img) =>
          Boolean(img.closest('[data-testid="ticker"]')),
        ))
      )
        expect([22, 24]).toContain(b.width);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await footer.screenshot({ path: info.outputPath(`footer-${width}.png`) });
  });
test('information cards retain Figma geometry', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const cards = page.getByTestId('info-card-kit').locator('[data-kind]');
  // Web/InfoCard 204:223 at 342: address 94 (two-line title), hours 122, telegram 74.
  const heights = { address: 94, hours: 122, telegram: 74 } as const;
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const b = (await card.boundingBox())!;
    expect(b.width).toBe(342);
    expect(b.height).toBe(
      heights[(await card.getAttribute('data-kind')) as keyof typeof heights],
    );
    const images = card.locator('img');
    expect((await images.first().boundingBox())!.width).toBe(24);
  }
});
