// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

describe('local tool output never enters source linting', () => {
  it('ignores browser/npm caches, artifacts and both browser report folders', async () => {
    for (const file of [
      '.cache/ms-playwright/webkit-2359/browser.js',
      '.cache/npm/_cacache/package.js',
      'artifacts/generated.js',
      'playwright-report/data.js',
      'playwright-report-spike/data.js',
      'test-results/generated.js',
      'test-results-spike/generated.js',
    ]) {
      expect(await eslint.isPathIgnored(file), file).toBe(true);
    }
  });

  it('still detects source errors in project scripts', async () => {
    const results = await eslint.lintText('missingProjectGlobal();', {
      filePath: 'scripts/lint-guard.mjs',
    });
    expect(results.flatMap((result) => result.messages)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'no-undef' })]),
    );
  });
});
