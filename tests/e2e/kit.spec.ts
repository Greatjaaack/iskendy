import { test, expect } from '@playwright/test';

test('ReturnBar keeps both Figma states and keyboard focus', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId('return-figma');
  const links = frame.getByRole('link');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box!.width).toBe(342);
    expect(box!.height).toBe(52);
    await expect(link).toHaveAttribute('href', '/board?my=1');
  }
  await expect(links.first()).toHaveCSS(
    'background-color',
    'rgb(247, 214, 110)',
  );
  await expect(links.last()).toHaveCSS(
    'background-color',
    'rgb(154, 171, 101)',
  );
  await frame.screenshot({ path: testInfo.outputPath('return-figma.png') });
  await links.first().focus();
  await expect(links.first()).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
});

test('Headers reuse exact brand geometry, safe links and the guest switch', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const mobile = page.getByTestId('header-mobile').locator('header');
  const desktop = page.getByTestId('header-desktop').locator('header');
  expect((await mobile.boundingBox())!.width).toBe(342);
  expect((await mobile.boundingBox())!.height).toBe(68);
  const maps = mobile.getByRole('link', { name: 'Адрес · Яндекс Карты' });
  expect((await maps.boundingBox())!.width).toBe(44);
  expect((await maps.boundingBox())!.height).toBe(44);
  await expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
  expect(
    (await mobile.getByRole('link', { name: 'Искенди' }).boundingBox())!.width,
  ).toBe(276);
  expect(
    (await mobile.getByRole('link', { name: 'Искенди' }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  expect((await desktop.boundingBox())!.width).toBe(1200);
  expect((await desktop.boundingBox())!.height).toBe(80);
  expect(
    (await desktop.getByRole('link', { name: 'Искенди' }).boundingBox())!.width,
  ).toBe(340);
  await expect(desktop.getByRole('navigation')).toBeVisible();
  for (const header of [mobile, desktop]) {
    const logo = header.getByRole('img', { name: 'Искенди' });
    await expect
      .poll(() =>
        logo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth === 600,
        ),
      )
      .toBe(true);
    const box = await logo.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(600 / 82.8533, 2);
  }
  await mobile.screenshot({ path: testInfo.outputPath('header-mobile.png') });
  await desktop.screenshot({ path: testInfo.outputPath('header-desktop.png') });
});

for (const width of [768, 1024, 1440])
  test(`Desktop header fits ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const header = page.getByTestId('header-desktop').locator('header');
    expect((await header.boundingBox())!.width).toBe(Math.min(width, 1200));
    const links = header.getByRole('link');
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });

test('NavSwitch matches seven Figma variants and preserves supported destinations', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId('nav-figma');
  const navs = frame.getByRole('navigation');
  await expect(navs).toHaveCount(7);
  const widths = [326, 326, 319, 319, 326, 326, 319];
  for (let i = 0; i < 7; i++) {
    const nav = navs.nth(i);
    const box = await nav.boundingBox();
    expect(Math.abs(box!.width - widths[i]!)).toBeLessThanOrEqual(2);
    expect(box!.height).toBe(48);
    await expect(nav.getByRole('link')).toHaveCount(3);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(
      i === 4 ? 0 : 1,
    );
    for (const link of await nav.getByRole('link').all())
      expect((await link.boundingBox())!.height).toBe(44);
  }
  await frame.screenshot({ path: testInfo.outputPath('nav-figma.png') });
  await frame.getByRole('link', { name: 'Табло' }).first().focus();
  await expect(frame.getByRole('link', { name: 'Табло' }).first()).toHaveCSS(
    'outline-color',
    'rgb(37, 99, 235)',
  );
});

test('QueueChip matches all four Figma variants without relying only on color', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId('queue-figma');
  const chips = frame.getByRole('group');
  await expect(chips).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const chip = chips.nth(i);
    const box = await chip.boundingBox();
    expect(box!.width).toBe(96);
    expect(box!.height).toBe(56);
    await expect(chip).toHaveCSS(
      'background-color',
      i < 2 ? 'rgb(255, 255, 255)' : 'rgb(154, 171, 101)',
    );
    if (i % 2) {
      await expect(chip).toHaveCSS('border-top-width', '3px');
      await expect(chip).toHaveAccessibleName(/ваш/);
    }
    await expect(chip).toHaveText('112');
  }
  await frame.screenshot({ path: testInfo.outputPath('queue-figma.png') });
});

test('Status live regions match Figma pills', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId('status-figma');
  const statuses = frame.getByRole('status');
  await expect(statuses).toHaveCount(4);
  const widths = [111, 252, 168, 364];
  for (let i = 0; i < 4; i++) {
    const pill = statuses.nth(i);
    const box = await pill.boundingBox();
    expect(Math.abs(box!.width - widths[i]!)).toBeLessThanOrEqual(2);
    expect(box!.height).toBe(i === 3 ? 39 : 36);
    await expect(pill).toHaveAttribute('aria-live', 'polite');
  }
  await frame.screenshot({ path: testInfo.outputPath('status-figma.png') });
});

test('OrderTicket matches all six Figma geometries and preserves ornament slots', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId('ticket-figma');
  for (const size of ['mobile', 'desktop'])
    for (const status of ['preparing', 'ready', 'issued']) {
      const ticket = frame
        .getByTestId(size + '-' + status)
        .getByRole('article');
      const box = await ticket.boundingBox();
      expect(box!.width).toBe(size === 'mobile' ? 342 : 560);
      expect(box!.height).toBeCloseTo(
        size === 'mobile'
          ? status === 'preparing'
            ? 340 // 67:1143 with the UX-14 cooking hint (13.10)
            : 348
          : status === 'preparing'
            ? 428
            : 468,
        0,
      );
      const color =
        status === 'preparing'
          ? 'rgb(247, 214, 110)'
          : status === 'ready'
            ? 'rgb(154, 171, 101)'
            : 'rgb(255, 178, 221)';
      await expect(ticket).toHaveCSS('background-color', color);
      const ornament = ticket.locator('img');
      await expect
        .poll(() =>
          ornament.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const ornamentBox = await ornament.boundingBox();
      expect(ornamentBox!.width).toBe(size === 'mobile' ? 160 : 260);
      expect(ornamentBox!.height).toBe(size === 'mobile' ? 160 : 260);
      expect(ornamentBox!.x - box!.x).toBe(size === 'mobile' ? 222 : 360);
      expect(ornamentBox!.y - box!.y).toBe(size === 'mobile' ? -34 : -50);
      await expect(ticket.locator('li[aria-current="step"]')).toHaveCount(1);
      await expect(ticket.locator('li[aria-current="step"]')).toHaveText(
        status === 'preparing'
          ? 'Готовим'
          : status === 'ready'
            ? 'Готово'
            : 'Выдан',
      );
    }
  await frame.screenshot({ path: testInfo.outputPath('ticket-figma.png') });
  await page
    .getByTestId('steps-figma')
    .screenshot({ path: testInfo.outputPath('steps-figma.png') });
});

test('Figma Input renders all 12 states with linked hints and exact geometry', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 2400, height: 1100 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const grid = page.getByTestId('input-figma-grid');
  const inputs = grid.getByRole('textbox');
  await expect(inputs).toHaveCount(12);
  for (let i = 0; i < 12; i++) {
    const input = inputs.nth(i);
    const wrapper = input.locator('xpath=../..');
    expect((await wrapper.boundingBox())!.width).toBe(342);
    const field = input.locator('xpath=..');
    expect((await field.boundingBox())!.height).toBe(i < 6 ? 56 : 144);
    await expect(input).toHaveAccessibleName(
      i < 6 ? 'Номер заказа' : 'Комментарий',
    );
    const state = await wrapper.getAttribute('data-state');
    if (state === 'disabled') await expect(input).toBeDisabled();
    if (state === 'error') {
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveCSS('border-top-color', 'rgb(179, 38, 30)');
    }
    if (state === 'focus') {
      await expect(field).toHaveCSS('border-top-width', '1px');
      await expect(field).toHaveCSS('outline-color', 'rgb(255, 178, 221)');
    }
    expect(await input.getAttribute('aria-describedby')).toBeTruthy();
  }
  await expect(
    grid.locator(
      '[data-kind="order-number"][data-state="filled"] [aria-hidden="true"]',
    ),
  ).toBeHidden();
  await grid.screenshot({ path: testInfo.outputPath('input-figma-grid.png') });
});

for (const width of [390, 768, 1024, 1440]) {
  test(`Input stays editable and proportional at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    const demo = page.getByTestId('input-interaction');
    const order = demo.getByRole('textbox', { name: 'Номер заказа' });
    await order.fill('012');
    await expect(order).toHaveValue('012');
    await expect(order.locator('xpath=..')).toHaveCSS(
      'outline-color',
      'rgb(255, 178, 221)',
    );
    const comment = demo.getByRole('textbox', { name: 'Комментарий' });
    await comment.fill('Первая строка\nВторая строка');
    await expect(comment).toHaveValue('Первая строка\nВторая строка');
    await expect(comment).toHaveClass(/ym-disable-keys/);
    const box = await comment.boundingBox();
    expect(box!.width).toBeLessThan(width);
    expect(box!.height).toBeGreaterThan(80);
  });
}

test('Figma Button exposes every state with exact targets and semantic colors', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const grid = page.getByTestId('button-figma-grid');
  const buttons = grid.getByRole('button');
  await expect(buttons).toHaveCount(18);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBe(56);
    expect(box!.width).toBeGreaterThanOrEqual(120);
    await expect(button).toHaveAccessibleName('Отслеживать');
    const state = await button.getAttribute('data-state');
    if (state === 'disabled' || state === 'loading')
      await expect(button).toBeDisabled();
    if (state === 'loading')
      await expect(button).toHaveAttribute('aria-busy', 'true');
    if (state === 'focus') {
      await expect(button).toHaveCSS('border-top-width', '2px');
      if ((await button.getAttribute('class'))?.includes('primary')) {
        await expect(button).toHaveCSS(
          'border-top-color',
          'rgb(255, 252, 245)',
        );
        await expect(button).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
        await expect(button).toHaveCSS('outline-width', '2px');
        await expect(button).toHaveCSS('outline-offset', '2px');
      } else
        await expect(button).toHaveCSS('border-top-color', 'rgb(37, 99, 235)');
    }
    await expect(button).toHaveCSS('animation-name', 'none');
    if (state === 'loading') await expect(button).toHaveCSS('cursor', 'wait');
  }
  for (let i = 0; i < 6; i++) {
    const button = buttons.nth(i);
    await expect(button.locator('[class*=knob]')).toHaveCount(0);
    const expected = [
      'rgba(45, 45, 43, 0.86)',
      'rgb(61, 61, 58)',
      'rgb(30, 30, 28)',
      'rgba(45, 45, 43, 0.86)',
      'rgb(239, 230, 214)',
      'rgba(45, 45, 43, 0.86)',
    ][i];
    await expect(button).toHaveCSS('background-color', expected!);
  }
  await grid.screenshot({ path: testInfo.outputPath('button-figma-grid.png') });
});

test('Button has real hover, focus and keyboard activation', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const button = page.getByTestId('button-interaction').getByRole('button');
  await button.hover();
  await expect(button).toHaveCSS('background-color', 'rgb(61, 61, 58)');
  await page.mouse.move(0, 0);
  await button.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('data-activated', 'true');
  await expect(button).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
  await expect(button).toHaveCSS('outline-width', '2px');
  await expect(button).toHaveCSS('outline-offset', '2px');
});
test('component kit is a development-only entry', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await expect(
    page.getByRole('heading', { name: 'Витрина компонентов' }),
  ).toBeVisible();
});

test('Figma icon strip keeps all 23 local glyphs at their exact size', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const strip = page.getByTestId('icon-figma-strip');
  const icons = strip.getByRole('img');
  await expect(icons).toHaveCount(23);
  for (const icon of await icons.all()) {
    const geometry = await icon.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        mask: style.maskImage,
      };
    });
    expect(geometry.width).toBe(24);
    expect(geometry.height).toBe(24);
    expect(geometry.mask).toContain('/src/assets/icons/');
    const url = geometry.mask.slice(5, -2);
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  await strip.screenshot({ path: testInfo.outputPath('icon-figma-strip.png') });
});

test('original brand assets retain exact Figma orientation and geometry', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  const pair = page.getByTestId('logo-figma-pair');
  await expect(pair).toHaveCSS('background-color', 'rgb(234, 240, 249)');
  const box = await pair.boundingBox();
  expect(box?.width).toBe(680);
  expect(box?.height).toBeCloseTo(293.355, 1);
  for (const img of await pair.locator('img').all()) {
    await expect
      .poll(() =>
        img.evaluate(
          (node: HTMLImageElement) =>
            node.complete &&
            node.naturalWidth === 600 &&
            node.naturalHeight >= 82,
        ),
      )
      .toBe(true);
    await expect(img).toHaveCSS('transform', 'matrix(1, 0, 0, -1, 0, 0)');
    expect((await img.boundingBox())?.height).toBeCloseTo(82.8533, 1);
  }
  await pair.screenshot({ path: testInfo.outputPath('logo-figma-pair.png') });
  const rosette = page.getByTestId('rosette-figma');
  const img = rosette.locator('img');
  await expect
    .poll(() =>
      img.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth === 100,
      ),
    )
    .toBe(true);
  expect((await img.boundingBox())?.height).toBeCloseTo(101.333, 1);
  await img.screenshot({ path: testInfo.outputPath('rosette-figma.png') });
});

for (const width of [390, 768, 1024, 1440]) {
  test(`brand scales proportionally at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5174/dev/kit.html');
    for (const img of await page
      .getByTestId('logo-figma-pair')
      .locator('img')
      .all()) {
      const box = await img.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      expect(box!.width / box!.height).toBeCloseTo(600 / 82.8533, 2);
    }
  });
}

test('all six OrderTicket fact rows keep equal content-driven card heights', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5174/dev/kit.html');
  await page.evaluate(() => document.fonts.ready);
  const tickets = page.getByTestId('ticket-figma').getByRole('article');
  await expect(tickets).toHaveCount(6);
  for (const ticket of await tickets.all()) {
    await ticket.evaluate((element) => {
      element.style.width = '272px';
    });
    const cards = ticket.locator('dl > div');
    await cards
      .last()
      .locator('dd')
      .evaluate((element) => {
        element.textContent = 'Касса · выдача заказа у входа в ресторан';
      });
    const a = (await cards.first().boundingBox())!,
      b = (await cards.last().boundingBox())!;
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(b.height).toBeGreaterThan(56);
    for (const card of await cards.all()) {
      expect(
        await card.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const content = (await card.locator('dd').boundingBox())!;
      const bounds = (await card.boundingBox())!;
      expect(content.y + content.height).toBeLessThanOrEqual(
        bounds.y + bounds.height,
      );
    }
  }
});
