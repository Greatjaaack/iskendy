import { expect, test } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
/** Text-resize stress harness, not native browser zoom or a screen-reader verdict. */
async function doubleText(page: Page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-a11y-font]',
    )) {
      element.style.fontSize = element.dataset.a11yFont!;
      element.style.lineHeight = element.dataset.a11yLine!;
    }
    const values = Array.from(
      document.querySelectorAll<HTMLElement>('body,body *'),
    )
      .filter((node) => node instanceof HTMLElement)
      .map((node) => {
        const style = getComputedStyle(node);
        return {
          node,
          size: parseFloat(style.fontSize),
          line: style.lineHeight,
        };
      });
    for (const { node, size, line } of values) {
      node.dataset.a11yFont = node.style.fontSize;
      node.dataset.a11yLine = node.style.lineHeight;
      node.style.fontSize = size * 2 + 'px';
      node.style.lineHeight =
        line === 'normal' ? 'normal' : parseFloat(line) * 2 + 'px';
    }
  });
}
async function textInside(box: Locator, text: Locator) {
  const bounds = (await box.boundingBox())!;
  for (const item of await text.all()) {
    const child = (await item.boundingBox())!;
    expect(
      await item.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    expect(child.x).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(child.y).toBeGreaterThanOrEqual(bounds.y - 1);
    expect(child.x + child.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
    expect(child.y + child.height).toBeLessThanOrEqual(
      bounds.y + bounds.height + 1,
    );
  }
}
test('information cards contain doubled text while remaining keyboard accessible', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const cards = page.getByTestId('info-card-kit').locator('[data-kind]');
  await doubleText(page);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await textInside(card, card.locator(':scope > span:nth-child(2)'));
    if (await card.getAttribute('href')) {
      await card.focus();
      await expect(card).toBeFocused();
    }
  }
  await cards
    .first()
    .screenshot({ path: info.outputPath('info-card-text-200.png') });
});
test('rating retains keyboard trap and reachable actions after orientation and 200% text stress', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const trigger = page.getByTestId('rating-dialog-kit').getByRole('button');
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await page.setViewportSize({ width: 844, height: 390 });
  await doubleText(page);
  const next = dialog.getByRole('button', { name: 'Дальше', exact: true });
  await next.scrollIntoViewIfNeeded();
  await textInside(next, next.locator(':scope > span').first());
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i < 6 ? 'Tab' : 'Shift+Tab');
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await next.click();
  const tag = dialog.getByRole('button', { name: 'Вкус', exact: true });
  await tag.focus();
  await page.keyboard.press('Space');
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await next.click();
  await doubleText(page);
  const send = dialog.getByRole('button', {
    name: 'Отправить отзыв',
    exact: true,
  });
  await send.scrollIntoViewIfNeeded();
  await textInside(send, send.locator(':scope > span').first());
  const field = dialog.getByRole('textbox', {
    name: 'Комментарий · необязательно',
  });
  await field.fill('synthetic accessibility draft');
  await expect(field).toHaveClass(/ym-disable-keys/);
  await dialog.screenshot({
    path: info.outputPath('rating-landscape-text-200.png'),
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
