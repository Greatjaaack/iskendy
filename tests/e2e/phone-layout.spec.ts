import { expect, test } from '@playwright/test';
const origin = 'http://127.0.0.1:5176';
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 730 });
});
test('phone cards can scroll fully above the dock, without selectable icon artwork', async ({
  page,
}) => {
  for (const path of ['/board?my=1', '/board?view=help']) {
    await page.goto(origin + '/dev/scenario.html?preset=orders5');
    await page.goto(origin + path);
    const dock = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(dock).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (path.includes('my=1'))
      await expect(
        page.getByRole('article', { name: 'Ваш заказ 112' }),
      ).toBeVisible();
    const cards = page.locator('main [data-hover-card]');
    await expect
      .poll(async () => {
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const last = (await cards.last().boundingBox())!;
        const nav = (await dock.boundingBox())!;
        return last.y + last.height - nav.y;
      })
      .toBeLessThan(0);
    await expect(dock.locator('img').first()).toHaveCSS(
      'pointer-events',
      'none',
    );
  }
});
test('issued status uses the completed copy and full-width progress', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenario.html?preset=issued');
  await page
    .getByRole('button', { name: 'Заказ 997, Выдан', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Выдан', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Позовём, когда будет готово.', { exact: false }),
  ).toHaveCount(0);
  const steps = page.locator('ol');
  const size = await steps.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    parent:
      el.parentElement!.clientWidth -
      parseFloat(getComputedStyle(el.parentElement!).paddingLeft) -
      parseFloat(getComputedStyle(el.parentElement!).paddingRight),
  }));
  expect(Math.abs(size.width - size.parent)).toBeLessThan(2);
});
test('rating scale fits above actions and comment remains scrollable with keyboard', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenario.html?preset=positive');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const scale = dialog.getByRole('slider');
  const footer = dialog.locator('footer');
  const sliderBox = (await scale.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  expect(sliderBox.y + sliderBox.height + 24).toBeLessThanOrEqual(footerBox.y);
  await page.screenshot({
    path: 'docs/reviews/2026-10-16-phone/rating-scale.png',
  });
  await dialog.getByRole('button', { name: 'Дальше', exact: true }).click();
  await dialog.getByRole('button', { name: 'Дальше', exact: true }).click();
  await dialog.getByRole('textbox').fill('Проверка с телефона');
  await page.evaluate(() => {
    const viewport = Object.assign(new EventTarget(), {
      height: 410,
      offsetTop: 0,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    window.dispatchEvent(new Event('resize'));
  });
  await expect(dialog).toHaveCSS('height', '410px');
  await expect(footer).toBeHidden();
  const body = dialog.locator('header + div');
  const bodyBox = (await body.boundingBox())!;
  expect(bodyBox.y + bodyBox.height).toBeLessThanOrEqual(410);
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await dialog.getByRole('textbox').evaluate((el) => el.blur());
  await expect(footer).toBeVisible();
  await page.screenshot({
    path: 'docs/reviews/2026-10-16-phone/rating-keyboard.png',
  });
});
test('message submit follows the anonymous note instead of covering it', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenario.html?preset=manager');
  await page
    .getByRole('button', {
      name: 'Оставить сообщение управляющему',
      exact: true,
    })
    .click();
  const button = page.getByRole('button', {
    name: 'Отправить сообщение',
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  const note = (await page
    .getByText('Ваше сообщение будет анонимным.', { exact: false })
    .boundingBox())!;
  expect(note.y + note.height).toBeLessThan((await button.boundingBox())!.y);
});

test('touch navigation releases its pressed colour and reasons fit without a scroll bar', async ({
  page,
}, info) => {
  test.skip(!['iphone', 'android'].includes(info.project.name));
  await page.goto(origin + '/dev/scenario.html?preset=orders5');
  const next = page.getByRole('button', {
    name: 'Следующий заказ',
    exact: true,
  });
  const resting = await next.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await next.tap();
  await expect(next).toHaveCSS('background-color', resting);
  await page.goto(origin + '/dev/scenario.html?preset=positive');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: 'Дальше', exact: true }).click();
  const body = dialog.locator('header + div');
  const sizes = await body.evaluate((el) => ({
    height: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.height + 1);
  await page.screenshot({ path: 'docs/reviews/2026-10-16-phone/reasons.png' });
});
test('emotion transitions pass through intermediate positions and surface colours', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/dev/scenario.html?preset=positive');
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider');
  await expect(dialog.locator('[data-slider-fill]').first()).toBeAttached();
  await slider.press('Home');
  await expect(dialog).toHaveCSS('background-color', 'rgb(250, 224, 228)');
  const frames = await slider.evaluate(async (el) => {
    const values: { x: number; color: string }[] = [];
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    for (let i = 0; i < 25; i++) {
      await new Promise(requestAnimationFrame);
      const mark = document.querySelector('[data-slider-mark]')!.parentElement!;
      values.push({
        x: new DOMMatrix(getComputedStyle(mark).transform).m41,
        color: getComputedStyle(el.closest('[role="dialog"]')!).backgroundColor,
      });
    }
    return values;
  });
  expect(frames.some((frame) => frame.x > 1 && frame.x < 285)).toBe(true);
  expect(new Set(frames.map((frame) => frame.color)).size).toBeGreaterThan(2);
  await expect(dialog).toHaveCSS('background-color', 'rgb(254, 239, 191)');
});

test('interrupted dock hold clears the lens and accepts the next touch', async ({
  page,
}, info) => {
  test.skip(!['iphone', 'android'].includes(info.project.name));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/dev/scenario.html?preset=entry');
  const dock = page.getByRole('navigation', { name: 'Основная навигация' });
  for (const interruption of [
    'contextmenu',
    'blur',
    'pagehide',
    'visibilitychange',
  ]) {
    const box = (await dock.boundingBox())!;
    await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
    await page.mouse.down();
    await expect(dock).toHaveAttribute('data-held', 'true');
    if (interruption === 'contextmenu') {
      const prevented = await dock.evaluate(
        (el) =>
          !el.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
          ),
      );
      expect(prevented).toBe(true);
    } else if (interruption === 'visibilitychange') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } else
      await page.evaluate(
        (event) => window.dispatchEvent(new Event(event)),
        interruption,
      );
    await expect(dock).toHaveAttribute('data-held', 'false');
    await page.mouse.up();
    await expect(
      page.getByRole('heading', { name: 'Где мой заказ?', exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('link', { name: 'Помощь', exact: true }).tap();
  await expect(
    page.getByRole('heading', { name: 'Помощь', exact: true }),
  ).toBeVisible();
  await expect(dock).toHaveAttribute('data-held', 'false');
});

test('Other opens a focused editor, saves explicitly and restores the selected reason', async ({
  page,
}) => {
  await page.goto(origin + '/dev/scenario.html?preset=positive');
  const rating = page.getByRole('dialog', {
    name: 'Оценка заказа 997',
    exact: true,
  });
  await rating.getByRole('slider').press('Home');
  await rating.getByRole('button', { name: 'Дальше', exact: true }).click();
  await rating.getByRole('button', { name: 'Другое', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Что именно?', exact: true });
  const field = editor.getByRole('textbox', {
    name: 'Что именно?',
    exact: true,
  });
  await expect(field).toBeFocused();
  await field.fill('Не хватает соуса');
  await editor.getByRole('button', { name: 'ОК', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    rating.getByRole('button', { name: 'Другое', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    rating.getByRole('button', { name: 'Другое', exact: true }),
  ).toBeFocused();
  await expect(
    rating.getByRole('button', {
      name: 'Что именно? Не хватает соуса',
      exact: true,
    }),
  ).toBeVisible();
  await rating
    .getByRole('button', { name: 'Что именно? Не хватает соуса', exact: true })
    .click();
  await expect(field).toHaveValue('Не хватает соуса');
  await field.fill('Не сохранять');
  await editor.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(
    rating.getByRole('button', {
      name: 'Что именно? Не хватает соуса',
      exact: true,
    }),
  ).toBeVisible();
});
test('rapid slider reversals keep one continuous fill anchored to the left edge', async ({
  page,
}, info) => {
  test.skip(!['iphone', 'android', 'desktop'].includes(info.project.name));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/dev/scenario.html?preset=positive');
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider');
  const fill = dialog.locator('[data-slider-fill]');
  await expect(fill).toHaveCount(1);
  const samples = await slider.evaluate(async (el) => {
    const result: { left: number; mismatch: number }[] = [];
    for (const key of [
      'Home',
      'End',
      'Home',
      'End',
      'ArrowLeft',
      'Home',
      'End',
    ]) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      for (let i = 0; i < 4; i++) {
        await new Promise(requestAnimationFrame);
        const fill = document.querySelector<HTMLElement>('[data-slider-fill]')!;
        const indicator =
          document.querySelector('[data-slider-mark]')!.parentElement!;
        const x = new DOMMatrix(getComputedStyle(indicator).transform).m41;
        result.push({
          left: parseFloat(getComputedStyle(fill).left),
          mismatch: Math.abs(parseFloat(getComputedStyle(fill).width) - x - 56),
        });
      }
    }
    return result;
  });
  expect(samples.every((sample) => sample.left === 0)).toBe(true);
  expect(Math.max(...samples.map((sample) => sample.mismatch))).toBeLessThan(2);
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  await expect(fill).toHaveCSS('width', '342px');
});

test('venue cards preserve the address, weekly hours and Telegram at all three layouts', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const [width, height] of [
    [430, 730],
    [834, 1194],
    [1440, 1000],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(origin + '/dev/scenario.html?preset=help');
    const section = page.getByRole('region', {
      name: 'Адрес и контакты',
      exact: true,
    });
    await expect(section.locator('[data-venue-card]')).toHaveCount(3);
    const maps = section.getByRole('link', { name: /Наш адрес/ });
    await expect(maps).toHaveAttribute(
      'href',
      /https:\/\/yandex.ru\/maps\/\?text=/,
    );
    await expect(
      section.getByRole('link', { name: /Наш Telegram/ }),
    ).toHaveAttribute('href', 'https://t.me/iskendy');
    await expect(section.getByText('пн–чт 11:30–22:00')).toBeVisible();
    await expect(
      section.getByText('пт 11:30–23:00', { exact: true }),
    ).toBeVisible();
    await expect(section.getByText('сб–вс 12:00–23:00')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.evaluate(() => document.fonts.ready);
    const sizes = await section.locator('img').evaluateAll((images) =>
      images.map((image) => ({
        natural: (image as HTMLImageElement).naturalWidth,
        fit: getComputedStyle(image).objectFit,
        height: image.getBoundingClientRect().height,
        stage: image.parentElement!.getBoundingClientRect().height,
      })),
    );
    expect(
      sizes.every(
        (image) =>
          image.natural > 0 &&
          image.fit === 'contain' &&
          image.height <= image.stage + 1,
      ),
    ).toBe(true);
    await section.screenshot({
      path: `docs/reviews/2026-10-16-phone/venue-${width}.png`,
    });
  }
});
