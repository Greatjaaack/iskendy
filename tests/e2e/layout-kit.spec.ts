import { expect, test, type Locator } from '@playwright/test';

const origin = process.env.ISKENDY_KIT_ORIGIN ?? 'http://127.0.0.1:5174';
const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.5);

async function primaryGeometry(button: Locator) {
  await expect(button).toBeVisible();
  const label = button.locator('[data-hidden]').filter({ visible: true });
  const bounds = (await button.boundingBox())!;
  const text = (await label.boundingBox())!;
  near(bounds.height, 56);
  await expect(button.locator('[class*=knob]')).toHaveCount(0);
  near(text.x + text.width / 2, bounds.x + bounds.width / 2);
  near(text.y + text.height / 2, bounds.y + bounds.height / 2);
  expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
}

// Approved collection navigation replaces the number-dependent ring in the live app.
// Current CompactDock is56px high, with48px tabs and >=44px targets.
for (const width of [320, 390])
  for (const [status, number] of [
    ['preparing', 112],
    ['ready', 102],
    ['issued', 997],
  ] as const)
    test(`collection navigation remains accessible for ${status} at ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        (preset) => sessionStorage.setItem('iskendy_manual_preset', preset),
        status,
      );
      await page.goto('/board?my=1');
      const menu = page.getByRole('navigation');
      const own = menu.getByRole('link', { name: /^Мои заказы(, готово)?$/ });
      await expect(own).toBeVisible();
      await expect(menu.getByRole('link')).toHaveCount(3);
      await expect(menu.locator('img')).toHaveCount(3);
      // SEC-02: the orders tab carries no view or order in the address.
      await expect(own).toHaveAttribute('href', '/board?my=1');
      for (const action of await menu.getByRole('link').all()) {
        const box = (await action.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('iskendi_my_order')!).n,
        ),
      ).toBe(number);
      await own.focus();
      await expect(own).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`collection-menu-${status}-${width}.png`),
        clip: { x: 0, y: 644, width, height: 200 },
      });
    });

test('primary buttons retain intrinsic geometry and fill wider actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/dev/kit.html`);
  await page.evaluate(() => document.fonts.ready);
  const buttons = page.getByTestId('button-figma-grid').getByRole('button');
  for (let index = 0; index < 6; index++) {
    const button = buttons.nth(index);
    await primaryGeometry(button);
    expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(120);
  }
  const wide = page.getByTestId('button-interaction').getByRole('button');
  await wide.evaluate((el) => {
    el.style.width = '342px';
  });
  await primaryGeometry(wide);
  await wide.focus();
  await primaryGeometry(wide);
});

for (const width of [320, 390, 768, 1024, 1440])
  test(`rating R1–R3 keeps aligned actions and keyboard focus at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/dev/kit.html`);
    const trigger = page.getByTestId('rating-dialog-kit').getByRole('button');
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await page.evaluate(() => document.fonts.ready);
    for (const [step, title] of [
      'Как вам заказ?',
      'Что порадовало?',
      'Хотите добавить?',
    ].entries()) {
      const heading = dialog.getByRole('heading', { name: title, exact: true });
      await expect(heading).toBeFocused();
      await expect(heading).toHaveCSS('outline-style', 'none');
      const action = dialog.getByRole('button', {
        name: step === 2 ? 'Отправить отзыв' : 'Дальше',
        exact: true,
      });
      await primaryGeometry(action);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await dialog.screenshot({
        path: info.outputPath(`rating-r${step + 1}-${width}.png`),
      });
      if (step < 2) {
        if (step === 1)
          await dialog
            .getByRole('button', { name: 'Вкус', exact: true })
            .click();
        await action.click();
      }
    }
    const field = dialog.getByRole('textbox', {
      name: 'Комментарий · необязательно',
    });
    await field.fill('Проверка сохранения фокуса');
    await expect(field).toBeFocused();
    await expect(field.locator('..')).toHaveCSS('border-top-width', '1px');
    await expect(field.locator('..')).toHaveCSS(
      'outline-color',
      'rgb(255, 178, 221)',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

// Updated Figma617:23426: a shared24px four-petal sign; no width jump.
test('loading retains button width, accessible action and original sign color', async ({
  page,
}) => {
  await page.goto(`${origin}/dev/kit.html`);
  await page.evaluate(() => document.fonts.ready);
  const buttons = page.getByTestId('button-figma-grid').getByRole('button');
  for (let variant = 0; variant < 3; variant++) {
    const normal = buttons.nth(variant * 6);
    const loading = buttons.nth(variant * 6 + 5);
    const initial = (await normal.boundingBox())!;
    const pending = (await loading.boundingBox())!;
    near(initial.width, pending.width);
    near(pending.height, 56);

    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAccessibleName('Отслеживать');
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    const sign = loading.locator('[class*=loaderGlyph]');
    const signBounds = (await sign.boundingBox())!;
    near(signBounds.width, 24);
    near(signBounds.height, 24);
    expect(
      await sign.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(await loading.evaluate((el) => getComputedStyle(el).color));
    await normal.focus();
    near((await normal.boundingBox())!.width, initial.width);
  }
});
