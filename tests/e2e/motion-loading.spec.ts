import { expect, test } from '@playwright/test';
const origin = 'http://127.0.0.1:4181';
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`production motion loads lazily with preference=${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const runtime: string[] = [];
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (/\/app\/runtime-.*\.js$/.test(url.pathname))
        runtime.push(url.pathname);
      if (url.pathname === '/api/config')
        return route.fulfill({
          contentType: 'application/json',
          path: 'tests/fixtures/config-empty.json',
        });
      if (url.pathname === '/api/status')
        return route.fulfill({
          contentType: 'application/json',
          path: 'tests/fixtures/status-populated.json',
        });
      if (url.pathname.startsWith('/api/'))
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await page.goto(origin + '/');
    await expect(
      page.getByRole('button', { name: /^(Отслеживать|Показать статус)$/ }),
    ).toBeVisible();
    if (reducedMotion === 'no-preference')
      await expect.poll(() => runtime.length).toBe(1);
    else {
      await page.getByRole('textbox').first().fill('112');
      expect(runtime).toEqual([]);
    }
  });
}
test('failed motion import preserves the guest form and its focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /\/app\/runtime-.*\.js$/.test(url.pathname))
      return route.abort();
    if (url.pathname === '/api/config')
      return route.fulfill({
        contentType: 'application/json',
        path: 'tests/fixtures/config-empty.json',
      });
    if (url.pathname === '/api/status')
      return route.fulfill({
        contentType: 'application/json',
        path: 'tests/fixtures/status-populated.json',
      });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.continue();
  });
  await page.goto(origin + '/');
  const input = page.getByRole('textbox').first();
  await input.fill('112');
  await expect(input).toHaveValue('112');
  await expect(input).toBeFocused();
  await expect(
    page.getByRole('button', { name: /^(Отслеживать|Показать статус)$/ }),
  ).toBeVisible();
});
