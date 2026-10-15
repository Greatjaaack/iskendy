import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Owner decision 12.10 (CODE-01): first screen ≤ 120 KiB gzip, lazy chunks ≤ 70 KiB gzip in total.
const script = resolve('scripts/check-size.mjs');
const noise = (kib) => `/*${randomBytes(kib * 1024).toString('base64')}*/`;
function run({ entry = 1, mount, runtime = 3, rating = 0, motion = 0 }) {
  const dir = mkdtempSync(join(tmpdir(), 'iskendy-size-'));
  try {
    mkdirSync(join(dir, 'dist', 'app'), { recursive: true });
    const write = (name, kib, body = '') =>
      writeFileSync(join(dir, 'dist', 'app', name), body + noise(kib));
    write('index-a.js', entry, 'import("./mount-b.js");');
    write('mount-b.js', mount, 'import"./jsx-runtime-c.js";');
    write('jsx-runtime-c.js', runtime);
    if (rating) write('Rating-d.js', rating, 'import"./jsx-runtime-c.js";');
    if (motion) write('runtime-e.js', motion);
    writeFileSync(
      join(dir, 'dist', 'index.html'),
      '<script type="module" crossorigin src="/app/index-a.js"></script>',
    );
    return execFileSync('node', [script], {
      cwd: dir,
      stdio: 'pipe',
    }).toString();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe('size budget split by loading moment', () => {
  it('passes when the first screen and lazy chunks each fit, even if their sum does not', () => {
    expect(run({ mount: 105, rating: 25, motion: 30 })).toMatch(
      /first screen/i,
    );
  });
  it('fails when JS needed before the first screen exceeds 120 KiB', () => {
    expect(() => run({ mount: 125 })).toThrow(/first screen/i);
  });
  it('fails when lazily loaded chunks exceed 70 KiB together', () => {
    expect(() => run({ mount: 90, rating: 40, motion: 40 })).toThrow(/lazy/i);
  });
});
