import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:4181',
  day = '2026-10-07';
const board = JSON.parse(
  readFileSync('tests/fixtures/status-populated.json', 'utf8'),
);
board.orders.push({ ...board.orders[0], number: 128, status: 'ready' });
const records = [
  {
    n: 112,
    d: day,
    seen: true,
    lastStatus: 'preparing',
    claim: 'synthetic112',
    subAt: 1,
  },
  {
    n: 128,
    d: day,
    seen: true,
    lastStatus: 'preparing',
    claim: 'synthetic128',
    subAt: 1,
  },
  {
    n: 135,
    d: day,
    seen: true,
    lastStatus: 'served',
    claim: 'synthetic135',
    subAt: 1,
    servedAt: 1,
    promptedAt: 1,
  },
  {
    n: 136,
    d: day,
    seen: true,
    lastStatus: 'served',
    claim: 'synthetic136',
    subAt: 1,
    servedAt: 1,
    promptedAt: 1,
  },
  {
    n: 137,
    d: day,
    seen: true,
    lastStatus: 'served',
    claim: 'synthetic137',
    subAt: 1,
    servedAt: 1,
    promptedAt: 1,
  },
];
test.use({ serviceWorkers: 'block' });
async function seed(page: Page, count: number, selected?: number) {
  if (selected)
    await page.addInitScript(
      ([n, d]) =>
        sessionStorage.setItem(
          'iskendy_selected_order_v1',
          JSON.stringify({ n, d }),
        ),
      [selected, day] as const,
    );
  await page.addInitScript(
    (records) => {
      if (
        Object.keys(localStorage).some((k) =>
          k.startsWith('iskendy_orders_v1:'),
        )
      )
        return;
      records.forEach((record, index) =>
        localStorage.setItem(
          'iskendy_orders_v1:synthetic' + index,
          JSON.stringify({ sequence: index + 1, kind: 'add', record }),
        ),
      );
    },
    records.slice(0, count),
  );
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    let data: unknown;
    if (url.pathname === '/api/status') data = board;
    else if (url.pathname === '/api/feedback/config')
      data = { promptDelaySec: 180, links: {} };
    else if (url.pathname === '/api/guest/claim')
      data = {
        ok: true,
        number: req.postDataJSON().number,
        claimToken: 'synthetic',
      };
    else if (url.pathname === '/api/feedback/check')
      data = {
        ok: true,
        number: Number(url.searchParams.get('number')),
        reason: null,
        waitSeconds: 0,
      };
    else if (url.pathname === '/api/feedback' && req.method() === 'POST')
      data = {
        ok: true,
        number: req.postDataJSON().number,
        feedbackId: 99,
        editToken: 'synthetic-edit',
        rating: req.postDataJSON().rating,
        branch: 'negative',
        waitSeconds: 0,
        links: {},
      };
    else if (url.pathname.startsWith('/api/')) data = { ok: true };
    else return route.continue();
    return route.fulfill({ json: data });
  });
});

const ticket = (page: Page, n: number) =>
  page.getByRole('article', { name: 'Ваш заказ ' + n, exact: true });
const card = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp('^Заказ ' + n + ', ') });
for (const count of [0, 1, 2, 3, 5])
  test(`approved carousel with ${count} orders`, async ({ page }, info) => {
    await seed(page, count);
    await page.goto(origin + '/board?my=1');
    await expect(
      page.getByRole('heading', {
        name: count ? 'Мои заказы' : 'Где мой заказ?',
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Заказ \d+, / }),
    ).toHaveCount(count);
    await expect(
      page.getByRole('group', { name: /Переключение заказов/ }),
    ).toHaveCount(count >= 2 ? 1 : 0);
    await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (count === 2) {
      const first = (await ticket(page, 112).boundingBox())!;
      await page.getByRole('button', { name: 'Следующий заказ' }).click();
      await expect(page.getByText('2 из 2', { exact: true })).toBeVisible();
      const second = (await ticket(page, 128).boundingBox())!;
      expect(Math.abs(second.x - first.x)).toBeLessThan(2);
      expect(Math.abs(second.width - first.width)).toBeLessThan(2);
    }
    expect(page.url()).toBe(origin + '/board?my=1');
    await page.screenshot({
      path: info.outputPath('orders-' + count + '.png'),
    });
  });
test('details swipe settles to the selected order and Back returns to the wallet list', async ({
  page,
}) => {
  await seed(page, 3, 112);
  await page.goto(origin + '/board?my=1');
  await page.getByRole('button', { name: 'Все заказы', exact: true }).click();
  await card(page, 128).click();
  await expect(
    page.getByRole('heading', { name: 'Заказ 128', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const viewport = page.locator('[class*=detailCarousel]');
  await viewport.evaluate((el) => {
    const child = el.children[2] as HTMLElement;
    el.scrollTo({
      left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2,
      behavior: 'instant',
    });
  });
  await expect(
    page.getByRole('heading', { name: 'Заказ 135', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Все заказы', exact: true }),
  ).toBeFocused();
  expect(new URL(page.url()).search).not.toMatch(/number=|day=|order=/);
});
test('adding an existing order does not claim again; a new order is added once', async ({
  page,
}) => {
  const claims: unknown[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim')
      claims.push(r.postDataJSON());
  });
  await seed(page, 1);
  await page.goto(origin + '/board?my=1');
  await page
    .getByRole('button', { name: 'Добавить заказ', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Добавить заказ' }),
    field = sheet.getByLabel('Номер заказа', { exact: true });
  await expect(field).toBeFocused();
  await field.fill('112');
  await expect(field).toHaveAccessibleDescription('Заказ № 112 уже добавлен');
  await sheet.getByRole('button', { name: 'Показать статус' }).click();
  await expect(sheet).toHaveCount(0);
  expect(claims).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Добавить заказ', exact: true })
    .click();
  await field.fill('128');
  await sheet.getByRole('button', { name: 'Показать статус' }).click();
  await expect(ticket(page, 128)).toBeVisible();
  expect(claims).toEqual([expect.objectContaining({ number: 128 })]);
  await expect(ticket(page, 112)).toBeVisible();
});
test('ready toast opens the exact order and notifications can be marked read', async ({
  page,
}) => {
  await seed(page, 2, 112);
  await page.goto(origin + '/board?my=1');
  const toast = page.getByRole('button', { name: /^Заказ 128 готов/ });
  await expect(toast).toBeVisible();
  await toast.click();
  await expect(
    page.getByRole('heading', { name: 'Заказ 128', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Уведомления' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Прочитать все' }).click();
  await expect(page.getByText(/новых/)).toHaveCount(0);
});
test('offline retains cached orders, labels stale data and recovers without claiming', async ({
  page,
}) => {
  let failing = false,
    claims = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/guest/claim') claims++;
  });
  await page.route('**/api/status', (route) =>
    failing
      ? route.fulfill({ status: 503, json: { detail: 'synthetic outage' } })
      : route.fallback(),
  );
  await page.clock.install();
  await seed(page, 2, 112);
  await page.goto(origin + '/board?my=1');
  await expect(card(page, 128)).toHaveAccessibleName('Заказ 128, Готово');
  failing = true;
  for (let i = 0; i < 8; i++) await page.clock.runFor(5000);
  await expect(page.getByText('Нет интернета', { exact: true })).toBeVisible();
  await expect(ticket(page, 112)).toBeVisible();
  await expect(ticket(page, 128)).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Табло', exact: true })
    .click();
  await expect(page.getByText('Нет интернета', { exact: true })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Нет интернета', { exact: true })).toHaveCount(0);
  expect(claims).toBe(0);
});
test('Other explanation and selected files survive an unavailable upload; text details send only after removal', async ({
  page,
}) => {
  let details = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/feedback/detail') details++;
  });
  await seed(page, 3, 135);
  await page.goto(origin + '/board?my=1&rate=1');
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await page.getByRole('button', { name: 'Другое', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Что именно?', exact: true })
    .fill('Соус');
  await expect(
    page.getByRole('textbox', { name: 'Что именно?', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'ОК', exact: true }).click();
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(page.getByLabel('Комментарий · необязательно')).toHaveValue(
    'Соус',
  );
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'synthetic-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('synthetic'),
    });
  await page
    .getByRole('button', { name: 'Отправить отзыв', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось отправить вложения',
  );
  expect(details).toBe(0);
  await page
    .getByRole('button', { name: 'Удалить synthetic-video.mp4' })
    .click();
  await page
    .getByRole('button', { name: 'Отправить отзыв', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Спасибо вам большое' }),
  ).toBeVisible();
  expect(details).toBe(1);
});
test('manager form stays anonymous, supports file removal and never fabricates delivery', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') writes.push(new URL(r.url()).pathname);
  });
  await seed(page, 1);
  await page.goto(origin + '/board?view=manager');
  await page
    .getByRole('button', { name: 'Оставить сообщение управляющему' })
    .click();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page
    .getByLabel('Что случилось?', { exact: true })
    .fill('Не хватает соуса');
  await page.getByLabel('Что случилось?', { exact: true }).blur();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'synthetic-long-filename-document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('synthetic'),
    });
  await expect(
    page.getByText('Ваше сообщение будет анонимным.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось отправить сообщение',
  );
  await expect(page.getByLabel('Что случилось?', { exact: true })).toHaveValue(
    'Не хватает соуса',
  );
  await page
    .getByRole('button', {
      name: 'Удалить synthetic-long-filename-document.pdf',
    })
    .click();
  await expect(
    page.getByText('synthetic-long-filename-document.pdf'),
  ).toHaveCount(0);
  expect(
    writes.filter((p) => !/\/api\/(guest\/event|client\/event)$/.test(p)),
  ).toEqual([]);
});
test('pointer lens follows a held gesture; cancel does not navigate and release commits once', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed(page, 1);
  await page.goto(origin + '/board?my=1');
  const nav = page.getByRole('navigation');
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole('article', { name: 'Ваш заказ 112' }),
  ).toBeVisible();
  const box = (await nav.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 30);
  await page.mouse.down();
  await expect(nav).toHaveAttribute('data-held', 'true');
  await page.mouse.move(box.x + box.width - 50, box.y + 30);
  await page.mouse.up();
  await expect(
    page.getByRole('heading', { name: 'Помощь', exact: true }),
  ).toBeVisible();
  const nextBox = (await nav.boundingBox())!;
  await page.mouse.move(nextBox.x + 50, nextBox.y + 30);
  await page.mouse.down();
  await nav.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(page).toHaveURL(origin + '/board?view=help');
});

test.describe('owner review: pointer feedback', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('contextual follower, gentle FAQ and stable input focus', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.setViewportSize({ width: 897, height: 837 });
    await seed(page, 3);
    await page.goto(origin + '/board?my=1');
    const order = card(page, 112);
    await expect(page.locator('[data-cursor-follower]')).toHaveCount(1);
    await order.hover();
    const cursor = page.locator('[data-cursor-follower]');
    await expect(cursor.locator('span[aria-hidden=true]')).toBeVisible();
    await expect(cursor).toHaveCSS('opacity', '1');
    await expect(order).toHaveCSS('transform', /1\.02/);
    await page.screenshot({
      path: 'docs/reviews/2026-10-16-corrections/cursor-desktop.png',
    });
    await page.getByRole('button', { name: 'Все заказы', exact: true }).hover();
    await expect(cursor.locator('span[aria-hidden=true]')).toBeVisible();
    const next = page.getByRole('button', { name: 'Следующий заказ' });
    await next.click();
    await expect(page.getByText('2 из 3', { exact: true })).toBeVisible();
    await card(page, 128).click();
    await expect(
      page.getByRole('heading', { name: 'Заказ 128', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(400); // Regression: stale scroll-settle must not select the first order.
    await expect(
      page.getByRole('heading', { name: 'Заказ 128', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await page.getByRole('link', { name: 'Помощь', exact: true }).click();
    const faq = page.getByRole('link', {
      name: 'Заказ не находится',
      exact: true,
    });
    await faq.hover();
    await expect(faq.locator('[data-faq-back]')).toHaveCSS('opacity', '1');
    const backText = await faq.locator('[data-faq-back]').boundingBox();
    const line = await faq.boundingBox();
    expect(backText!.y).toBeGreaterThanOrEqual(line!.y);
    expect(backText!.y + backText!.height).toBeLessThanOrEqual(
      line!.y + line!.height,
    );
    await page.mouse.move(10, 10);
    await faq.hover();
    await expect(faq.locator('[data-faq-back]')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    await expect(
      cursor.locator('span[aria-hidden=true]').locator('..'),
    ).toHaveCSS('background-color', 'rgb(255, 178, 221)');
    await page.mouse.move(10, 10);
    await expect(faq.locator('[data-faq-front]')).toHaveCSS('opacity', '1');
    const services = page.locator('[class*=services]');
    await services.scrollIntoViewIfNeeded();
    const bounds = (await services.boundingBox())!;
    const dock = (await page.getByRole('navigation').boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(dock.y - 12);
    await page
      .getByRole('button', { name: 'Связаться с управляющим', exact: true })
      .hover();
    await expect(cursor.locator('[data-tone=contrast]')).toHaveCSS(
      'background-color',
      'rgb(182, 202, 235)',
    );
    await expect(cursor.locator('[data-tone=contrast]')).toHaveCSS(
      'color',
      'rgb(255, 252, 245)',
    );
    await expect(cursor).toHaveCSS('opacity', '1');
    await expect(cursor.locator('[data-tone=contrast]')).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(cursor.locator('[data-tone=contrast]')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    await page.screenshot({
      path: 'docs/reviews/2026-10-16-corrections/help-desktop.png',
    });
    await page
      .getByRole('link', { name: 'Мои заказы', exact: true })
      .last()
      .click();
    await page
      .getByRole('button', { name: 'Добавить заказ', exact: true })
      .click();
    const field = page.getByRole('textbox', {
      name: 'Номер заказа',
      exact: true,
    });
    await field.fill('1000');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.fill('999');
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveCSS('outline-style', 'none');
    const frame = field.locator('..');
    await field.hover();
    const border = await frame.evaluate((el) => ({
      border: getComputedStyle(el).borderColor,
      outline: getComputedStyle(el).outline,
    }));
    await page.mouse.move(10, 10);
    expect(
      await frame.evaluate((el) => ({
        border: getComputedStyle(el).borderColor,
        outline: getComputedStyle(el).outline,
      })),
    ).toEqual(border);
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-guest-cursor',
      'true',
    );
  });
});

test('service artwork retains proportions and stays inside its stage at all breakpoints', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await seed(page, 3);
  for (const [width, height] of [
    [390, 844],
    [834, 1194],
    [897, 837],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(origin + '/board?my=1');
    await expect(
      page.getByRole('heading', { name: 'Мои заказы', exact: true }),
    ).toBeVisible();
    const images = page.locator('[class*=actionArt] img');
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect(image).toHaveJSProperty('complete', true);
      await expect(image).toHaveCSS('object-fit', 'contain');
      const box = (await image.boundingBox())!,
        stage = (await image.locator('..').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(stage.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(
        stage.y + stage.height + 1,
      );
    }
    await page.screenshot({
      path: `docs/reviews/2026-10-16-corrections/orders-${width}.png`,
    });
  }
});
