import { describe, it, expect } from 'vitest';
import {
  readFileSync,
  mkdtempSync,
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROUTES } from '../../src/boot/routes.ts';

describe('release contracts', () => {
  it('keeps staff routes on legacy; guest routes and the hall TV on the new app', () => {
    expect(ROUTES).toEqual({
      '/': 'app',
      '/board': 'app',
      '/tv': 'app',
      '/staff': 'legacy',
      '/stats': 'legacy',
    });
  });
  it('build config keeps hash assets separate and disables sourcemaps', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("assetsDir: 'app'");
    expect(config).toContain('sourcemap: false');
  });
  it('budget checker rejects an accidentally included source map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iskendy-budget-'));
    try {
      cpSync('scripts', join(dir, 'scripts'), { recursive: true });
      mkdirSync(join(dir, 'dist', 'app'), { recursive: true });
      writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>');
      writeFileSync(join(dir, 'dist', 'leak.map'), '{}');
      expect(() =>
        execFileSync('node', ['scripts/check-size.mjs'], {
          cwd: dir,
          stdio: 'pipe',
        }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('has an exact legacy snapshot checksum for all five original files', () => {
    const manifest = JSON.parse(readFileSync('legacy/SOURCE.json', 'utf8'));
    expect(Object.keys(manifest.sha256)).toHaveLength(5);
    for (const [file, hash] of Object.entries(manifest.sha256))
      expect(
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ).toBe(hash);
  });
});

import {
  sourceProvenance,
  tarGzipDirectory,
} from '../../scripts/release-utils.mjs';
import { gunzipSync } from 'node:zlib';

describe('portable source-archive review', () => {
  it('builds without Git history and detects source edits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'iskendy-source-'));
    try {
      writeFileSync(join(dir, 'input.txt'), 'original');
      writeFileSync(
        join(dir, 'source-revision.json'),
        JSON.stringify({
          sourceCommit: 'a'.repeat(40),
          sourceDateEpoch: 100,
          sourceFileHashes: {
            'input.txt': createHash('sha256').update('original').digest('hex'),
          },
        }),
      );
      expect(await sourceProvenance(dir)).toEqual({
        commit: 'a'.repeat(40),
        epoch: '100',
        dirty: false,
      });
      writeFileSync(join(dir, 'input.txt'), 'edited');
      expect((await sourceProvenance(dir)).dirty).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('creates deterministic portable USTAR with correct padding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'iskendy-tar-'));
    try {
      mkdirSync(join(dir, 'app'));
      writeFileSync(join(dir, 'app', 'test.js'), 'hello');
      const archive = await tarGzipDirectory(dir, '100');
      expect(await tarGzipDirectory(dir, '100')).toEqual(archive);
      const raw = gunzipSync(archive);
      expect(raw.subarray(0, 6).toString()).toBe('./app/');
      expect(raw.subarray(257, 263).toString()).toBe('ustar\0');
      expect(raw.length % 512).toBe(0);
      const path = join(dir, 'test.tar.gz');
      writeFileSync(path, archive);
      expect(
        execFileSync('tar', ['-tzf', path], { encoding: 'utf8' }),
      ).toContain('./app/test.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
