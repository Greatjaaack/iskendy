import { expect, test, type Page } from '@playwright/test';
const diagnostics = (page: Page) =>
  page.evaluate(() => window.__ISKENDY_MOTION_TEST__!.tweens());
async function start(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('http://127.0.0.1:5174/dev/motion.html');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('slider', { name: 'Эмоция' })).toBeVisible();
}
test('loops use author durations, pause when hidden, and fully clean up', async ({
  page,
}) => {
  await start(page, 'no-preference');
  await expect
    .poll(
      async () =>
        (await diagnostics(page)).filter((t) => t.repeat === -1).length,
    )
    .toBe(3);
  const loops = (await diagnostics(page)).filter((t) => t.repeat === -1);
  expect(
    loops.filter((t) => t.kind === 'loader').every((t) => t.duration === 1.1),
  ).toBe(true);
  const distance = await page
    .locator('[data-ticker-cycle="original"]')
    .evaluate(
      (node) =>
        node.getBoundingClientRect().width +
        parseFloat(getComputedStyle(node.parentElement!).columnGap),
    );
  expect(loops.find((t) => t.kind === 'ticker')!.duration).toBeCloseTo(
    distance / 60,
    4,
  );
  await expect(
    page.locator('[data-testid="ticker"] [aria-hidden="true"]').last(),
  ).toBeAttached();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(
    (await diagnostics(page))
      .filter((t) => t.repeat === -1)
      .every((t) => t.paused),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(
    (await diagnostics(page))
      .filter((t) => t.repeat === -1)
      .every((t) => !t.paused),
  ).toBe(true);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator('[data-action="unmount"]').click();
    await expect
      .poll(() => page.evaluate(() => window.__ISKENDY_MOTION_TEST__!.count()))
      .toBe(0);
    await page.locator('[data-action="mount"]').click();
    await expect
      .poll(
        async () =>
          (await diagnostics(page)).filter((t) => t.repeat === -1).length,
      )
      .toBe(3);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => window.__ISKENDY_MOTION_TEST__!.count()))
    .toBe(0);
  await expect(page.locator('[data-ticker-cycle="original"]')).toHaveCount(1);
  expect(
    await page.getByTestId('ticker').locator(':scope > div > div').count(),
  ).toBe(1);
});
test('press feedback preserves keyboard operation; slider cancels stale targets', async ({
  page,
}) => {
  await start(page, 'no-preference');
  await expect
    .poll(
      async () =>
        (await diagnostics(page)).filter((t) => t.repeat === -1).length,
    )
    .toBe(3);
  const button = page.getByRole('button', { name: 'Отслеживать', exact: true });
  await button.focus();
  await page.keyboard.down('Space');
  await expect
    .poll(() =>
      button.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).a,
      ),
    )
    .toBeCloseTo(0.98, 3);
  await page.keyboard.up('Space');
  await expect
    .poll(() =>
      button.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).a,
      ),
    )
    .toBe(1);
  await expect(button).toBeFocused();
  const slider = page.getByRole('slider', { name: 'Эмоция' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  const indicator = page.locator('span[class*="indicator"]');
  await expect
    .poll(() =>
      indicator.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).m41,
      ),
    )
    .toBe(286);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(indicator).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await page.locator('[data-action="loading"]').click();
  await expect(button).toBeDisabled();
});
test('ticker keyboard scroll stays static and resumes from its first cycle', async ({
  page,
}) => {
  await start(page, 'no-preference');
  const ticker = page.getByTestId('ticker');
  await ticker.focus();
  await page.keyboard.press('End');
  expect(await ticker.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(await ticker.locator(':scope > div > div').count()).toBe(1);
  await page.getByRole('slider', { name: 'Эмоция' }).focus();
  await expect.poll(() => ticker.evaluate((node) => node.scrollLeft)).toBe(0);
  await expect.poll(() => ticker.locator(':scope > div > div').count()).toBe(2);
});
test('reduced motion stays static, with exact values and no running animations', async ({
  page,
}) => {
  await start(page, 'reduce');
  expect(await diagnostics(page)).toEqual([]);
  const slider = page.getByRole('slider', { name: 'Эмоция' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  expect(await diagnostics(page)).toEqual([]);
  await page.locator('[data-action="unmount"]').click();
  expect(await diagnostics(page)).toEqual([]);
});
test('dock scroll hide is reversible and focus restores it immediately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await start(page, 'no-preference');
  const dock = page.locator('[data-guest-navigation]');
  await expect(dock).toHaveAttribute('data-motion', 'active');
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(dock).toHaveAttribute('data-visibility', 'hidden');
  const panel = dock.locator(':scope > div');
  await expect
    .poll(() =>
      panel.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).m42,
      ),
    )
    .toBeGreaterThan(60);
  await dock.getByRole('link').first().focus();
  await expect(dock.getByRole('link').first()).toBeFocused();
  await expect
    .poll(() =>
      panel.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).m42,
      ),
    )
    .toBe(0);
  const box = (await dock.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(384, 0);
});
test('keyboard viewport hides dock instantly and moving decoration causes no layout shifts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
    }),
  );
  await start(page, 'no-preference');
  const dock = page.locator('[data-guest-navigation]');
  await expect(dock).toHaveAttribute('data-motion', 'active');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate(() => {
    (window as unknown as Window & { motionCLS: number }).motionCLS = 0;
    (window as unknown as Window & { motionShifts: unknown[] }).motionShifts =
      [];
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources: { node: Element | null }[];
          };
          (
            window as unknown as Window & { motionShifts: unknown[] }
          ).motionShifts.push({
            value: shift.value,
            input: shift.hadRecentInput,
            nodes: shift.sources.map((source) =>
              source.node?.outerHTML.slice(0, 200),
            ),
          });
          // Radix moves its native thumb immediately after keyboard input.
          // Exempt only that exact input step; GSAP decoration/layout shifts fail
          // even within the recent-input window excluded by standard CLS.
          const nativeInputStep =
            shift.hadRecentInput &&
            shift.sources.length > 0 &&
            shift.sources.every(
              (source) =>
                source.node?.matches('[role="slider"]') ||
                source.node?.querySelector(':scope > [role="slider"]'),
            );
          if (!nativeInputStep)
            (window as unknown as Window & { motionCLS: number }).motionCLS +=
              shift.value;
        }
      }).observe({ type: 'layout-shift' });
    }
  });
  const slider = page.getByRole('slider', { name: 'Эмоция' });
  await slider.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  const input = page.getByRole('textbox', { name: 'Тестовое поле' });
  await input.focus();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 420 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(dock).toHaveAttribute('data-visibility', 'keyboard');
  expect(
    await dock
      .locator(':scope > div')
      .evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42),
  ).toBe(68);
  await expect(input).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as Window & { motionCLS: number }).motionCLS,
    ),
    JSON.stringify(
      await page.evaluate(
        () =>
          (window as unknown as Window & { motionShifts: unknown[] })
            .motionShifts,
      ),
    ),
  ).toBe(0);
});
