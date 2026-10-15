import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
});
test('all ten original emotion photos load with WebP sources and Figma geometry', async ({
  page,
}, testInfo) => {
  const images = page.getByTestId('emotion-characters').locator('img');
  await expect(images).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    const image = images.nth(i);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth,
        ),
      )
      .toBe(i % 2 === 0 ? 720 : 180);
    const response = await page.request.get(
      await image.evaluate((img: HTMLImageElement) => img.src),
    );
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await image.boundingBox())!.width).toBe(i % 2 === 0 ? 240 : 72);
    await image.screenshot({
      path: testInfo.outputPath(
        `emotion-${Math.floor(i / 2) + 1}-${i % 2 === 0 ? 'lg' : 'sm'}.png`,
      ),
    });
  }
  await page
    .getByTestId('emotion-characters')
    .screenshot({ path: testInfo.outputPath('emotion-characters.png') });
});
for (const width of [272, 320, 342])
  test(`pointer, keyboard, exact stop alignment and 56px targets at ${width}`, async ({
    page,
  }, testInfo) => {
    const example = page.getByTestId('emotion-slider-3');
    await example.evaluate((node, w) => {
      node.style.width = `${w}px`;
    }, width);
    const slider = example.getByRole('slider');
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toHaveAttribute('aria-valuenow', '3');
    const box = (await example.boundingBox())!;
    const target = (await slider.boundingBox())!;
    expect(target.width).toBe(56);
    expect(target.height).toBe(56);
    expect(target.x + 28 - box.x).toBeCloseTo(width / 2, 0);
    for (let stop = 1; stop <= 5; stop++) {
      await example.click({
        position: { x: ((28 + (stop - 1) * 71.5) * width) / 342, y: 28 },
      });
      await expect(slider).toHaveAttribute('aria-valuenow', String(stop));
    }
    await example.click({ position: { x: (28 * width) / 342, y: 28 } });
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    let thumb = (await slider.boundingBox())!;
    expect(thumb.x + 28 - box.x).toBeCloseTo((28 * width) / 342, 0);
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '5');
    thumb = (await slider.boundingBox())!;
    expect(thumb.x + 28 - box.x).toBeCloseTo((314 * width) / 342, 0);
    await slider.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '4');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Тёп');
    await expect(slider).toBeFocused();
    await slider.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(slider).toBeFocused();
    await expect(slider).toHaveCSS('outline-width', '2px');
    await expect(slider).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
    await example.screenshot({
      path: testInfo.outputPath(`emotion-slider-${width}.png`),
    });
  });
