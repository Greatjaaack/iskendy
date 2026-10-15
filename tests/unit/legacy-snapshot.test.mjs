import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('legacy/SOURCE.json', 'utf8'));
describe('immutable legacy snapshot', () => {
  it.each(Object.entries(manifest.sha256))(
    'preserves %s exactly',
    (file, expected) => {
      expect(
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ).toBe(expected);
    },
  );
  it('retains notification navigation without a caching service worker', () => {
    const worker = readFileSync('public/sw.js', 'utf8');
    expect(worker).toContain('/board?my=1');
    expect(worker).not.toMatch(/addEventListener\(["']fetch/);
  });
});
