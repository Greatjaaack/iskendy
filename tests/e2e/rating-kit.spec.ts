import { expect, test } from '@playwright/test';
test.use({ hasTouch: true });
test('touch selects the nearest emotion stop without posting', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.getByTestId('rating-dialog-kit').getByRole('button').tap();
  const slider = page.getByRole('slider');
  const target = (await slider.boundingBox())!;
  await page.touchscreen.tap(target.x + 28 - 143, target.y + 28);
  await expect(slider).toHaveAttribute('aria-valuenow', '3');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Нормально');
  await expect(
    page.getByRole('heading', { name: 'Как вам заказ?' }),
  ).toBeVisible();
});
for (const width of [390, 768, 1024, 1440])
  test(`rating dialog focus, back, private draft and layout at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const trigger = page.getByTestId('rating-dialog-kit').getByRole('button');
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Оценка заказа 112');
    await expect(
      dialog.getByRole('heading', { name: 'Как вам заказ?' }),
    ).toBeFocused();
    await expect(dialog.getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      '5',
    );
    await page.evaluate(() => document.fonts.ready);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBe(width < 768 ? width : 560);
    expect(bounds.y).toBe(width < 768 ? 0 : 16);
    await dialog.screenshot({
      path: info.outputPath(`rating-r1-${width}.png`),
    });
    await dialog.getByRole('button', { name: 'Дальше' }).click();
    await dialog.getByRole('button', { name: 'Вкус', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Вкус', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Дальше' }).click();
    const field = dialog.getByRole('textbox', {
      name: 'Комментарий · необязательно',
    });
    await field.fill('private draft');
    await dialog.getByRole('button', { name: 'Назад' }).click();
    await expect(
      dialog.getByRole('button', { name: 'Вкус', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Дальше' }).click();
    await expect(field).toHaveValue('private draft');
    await field.focus();
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(field).toHaveValue('private draft');
    await dialog.getByRole('button', { name: 'Отправить отзыв' }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Спасибо вам большое', exact: true }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Готово' }).click();
    await expect(trigger).toBeFocused();
  });
