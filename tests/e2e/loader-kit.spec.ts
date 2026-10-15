import { expect, test } from '@playwright/test';
for (const reducedMotion of ['reduce', 'no-preference'] as const)
  test(`original Loader respects motion preference and remains accessible with reducedMotion=${reducedMotion}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const glyph = page
      .getByTestId('loader-figma-glyph')
      .getByRole('status', { name: 'Проверяем…' });
    await expect(glyph).toHaveAttribute('aria-busy', 'true');
    const image = glyph.locator('img');
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const box = (await glyph.boundingBox())!;
    expect(box.width).toBe(24);
    expect(box.height).toBe(24);
    expect(await image.evaluate((img) => img.clientWidth)).toBe(24);
    await expect(image).toHaveCSS('animation-name', 'none');
    await expect(image).toHaveCSS('transition-duration', '0s');
    if (reducedMotion === 'reduce')
      await expect(image).toHaveCSS('transform', 'none');
    else {
      await expect(image).not.toHaveCSS('transform', 'none');
      const previous = await image.evaluate(
        (img) => getComputedStyle(img).transform,
      );
      await expect
        .poll(() => image.evaluate((img) => getComputedStyle(img).transform))
        .not.toBe(previous);
    }
    expect(
      await glyph.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    const labelled = page
      .getByTestId('loader-with-copy')
      .getByRole('status', { name: 'Ищем заказ…' });
    await expect(
      labelled.getByText('Ищем заказ…', { exact: true }),
    ).toBeVisible();
    await glyph.screenshot({
      path: info.outputPath(`loader-${reducedMotion}.png`),
    });
    await page.setViewportSize({ width: 320, height: 844 });
    const narrow = (await labelled.boundingBox())!;
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(320);
  });
