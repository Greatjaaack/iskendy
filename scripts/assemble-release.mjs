import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { sourceProvenance, tarGzipDirectory } from './release-utils.mjs';
import { createHash } from 'node:crypto';
import { ROUTES } from '../src/boot/routes.ts';

const snapshot = JSON.parse(await readFile('legacy/SOURCE.json', 'utf8'));
for (const [file, expected] of Object.entries(snapshot.sha256)) {
  const actual = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  if (actual !== expected) throw new Error(`Legacy snapshot mismatch: ${file}`);
}
await readFile('dist/index.html');
await cp('legacy/index.html', 'dist/legacy.html');
await cp('legacy/assets', 'dist/assets', { recursive: true });
await cp('public/sw.js', 'dist/sw.js');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const { commit, epoch: sourceEpoch, dirty } = await sourceProvenance();
const epoch = process.env.SOURCE_DATE_EPOCH || sourceEpoch;
if (!/^\d+$/.test(epoch)) throw new Error('Invalid SOURCE_DATE_EPOCH');
const builtAt = new Date(Number(epoch) * 1000).toISOString();
await writeFile(
  'dist/VERSION',
  `${version}\ncommit: ${commit}${dirty ? '-dirty' : ''}\nbuiltAt: ${builtAt}\n`,
);
await writeFile('dist/ROUTES.json', `${JSON.stringify(ROUTES, null, 2)}\n`);
const allowed = new Set([
  'index.html',
  'legacy.html',
  'sw.js',
  'app',
  'assets',
  'VERSION',
  'ROUTES.json',
]);
for (const file of await readdir('dist'))
  if (!allowed.has(file)) throw new Error(`Unexpected release file: ${file}`);
await mkdir('artifacts', { recursive: true });
const name = `iskendy-web-${version}.tar.gz`;
await writeFile(`artifacts/${name}`, await tarGzipDirectory('dist', epoch));
const hash = createHash('sha256')
  .update(await readFile(`artifacts/${name}`))
  .digest('hex');
await writeFile(`artifacts/${name}.sha256`, `${hash}  ${name}\n`);
console.log(
  `Assembled local ${name}; SHA-256 ${hash}. No publication performed.`,
);
