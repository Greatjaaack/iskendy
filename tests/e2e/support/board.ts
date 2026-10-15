import { expect, type Page } from '@playwright/test';
/** Q-14: the entry no longer shows the queue, so wait for the board request itself. */
export async function boardLoaded(page: Page) {
  await page.waitForFunction(() => Boolean(window.__ISKENDY_TEST__));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__ISKENDY_TEST__!.requests.includes('/api/status'),
      ),
    )
    .toBe(true);
  await page.waitForLoadState('networkidle');
}
