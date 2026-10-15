import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export async function sourceProvenance(root = process.cwd()) {
  const ownGit = await stat(join(root, '.git')).then(
    () => true,
    () => false,
  );
  if (ownGit) {
    const git = (...args) =>
      execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    return {
      commit: git('rev-parse', 'HEAD'),
      epoch: git('show', '-s', '--format=%ct', 'HEAD'),
      dirty: Boolean(git('status', '--porcelain')),
    };
  }
  const manifest = JSON.parse(
    await readFile(join(root, 'source-revision.json'), 'utf8'),
  );
  if (
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
    !/^\d+$/.test(String(manifest.sourceDateEpoch)) ||
    !Object.keys(manifest.sourceFileHashes ?? {}).length
  )
    throw new Error('Invalid source archive provenance');
  let dirty = false;
  for (const [file, hash] of Object.entries(manifest.sourceFileHashes)) {
    if (file.startsWith('/') || file.split(/[\\/]/).includes('..'))
      throw new Error('Unsafe provenance path');
    const bytes = await readFile(join(root, file)).catch(() => null);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== hash)
      dirty = true;
  }
  return {
    commit: manifest.sourceCommit,
    epoch: String(manifest.sourceDateEpoch),
    dirty,
  };
}

/** Portable deterministic USTAR writer: avoids GNU-only tar options on a Mac. */
export async function tarGzipDirectory(directory, epoch) {
  const chunks = [];
  async function entry(relative) {
    const absolute = join(directory, relative);
    const info = await stat(absolute);
    const name = `./${relative}${info.isDirectory() ? '/' : ''}`;
    const data = info.isDirectory()
      ? Buffer.alloc(0)
      : await readFile(absolute);
    if (Buffer.byteLength(name) > 100)
      throw new Error(`Archive path too long: ${name}`);
    const header = Buffer.alloc(512);
    const text = (offset, length, value) => {
      if (Buffer.byteLength(value) > length)
        throw new Error('Tar field overflow');
      header.write(value, offset, length, 'utf8');
    };
    const octal = (offset, length, value) =>
      text(offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
    text(0, 100, name);
    octal(100, 8, info.isDirectory() ? 0o755 : 0o644);
    octal(108, 8, 0);
    octal(116, 8, 0);
    octal(124, 12, data.length);
    octal(136, 12, Number(epoch));
    header.fill(32, 148, 156);
    text(156, 1, info.isDirectory() ? '5' : '0');
    text(257, 6, 'ustar\0');
    text(263, 2, '00');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    text(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
    if (info.isDirectory())
      for (const child of (await readdir(absolute)).sort())
        await entry(relative ? `${relative}/${child}` : child);
  }
  for (const child of (await readdir(directory)).sort()) await entry(child);
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}
