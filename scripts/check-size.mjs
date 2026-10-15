import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(`${path}/${entry.name}`)
          : [`${path}/${entry.name}`],
      ),
    )
  ).flat();
}
const files = await walk('dist');
const appFiles = files.filter((file) => file.startsWith('dist/app/'));
const sums = { css: 0 };
const jsSizes = new Map();
const jsImports = new Map();
for (const file of files)
  if (file.endsWith('.map')) throw new Error(`Source map in release: ${file}`);
for (const file of appFiles) {
  if (/\.(js|css)$/.test(file)) {
    const bytes = await readFile(file);
    const source = bytes.toString('utf8');
    if (file.endsWith('.js')) {
      jsSizes.set(file, gzipSync(bytes).byteLength);
      // Static imports only: `import(` (lazy) has a parenthesis before the quote.
      jsImports.set(
        file,
        [
          ...source.matchAll(/\b(?:from|import)\s*["']\.\/([\w.-]+\.js)["']/g),
        ].map(([, name]) => file.replace(/[^/]+$/, name)),
      );
    } else sums.css += gzipSync(bytes).byteLength;
    if (
      /mockServiceWorker|Mock Service Worker|__ISKENDY_TEST__|__ISKENDY_MOTION_TEST__|figma\.com\/api\/mcp\/asset|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(
        source,
      )
    )
      throw new Error(`Test code or temporary/external asset URL in ${file}`);
  }
}
const html = await readFile('dist/index.html', 'utf8');
// Owner decision 12.10 (CODE-01): JS before the first screen (entry scripts + app mount and
// their static imports) ≤ 120 KiB gzip; everything loaded later (rating, motion) ≤ 70 KiB.
const firstScreen = new Set();
const queue = [
  ...[...html.matchAll(/<script\b[^>]*\bsrc="\/(app\/[^"]+\.js)"/g)].map(
    ([, path]) => `dist/${path}`,
  ),
  ...[...jsSizes.keys()].filter((file) => /\/mount-[^/]*\.js$/.test(file)),
];
while (queue.length) {
  const file = queue.pop();
  if (firstScreen.has(file) || !jsSizes.has(file)) continue;
  firstScreen.add(file);
  queue.push(...jsImports.get(file));
}
const sum = (list) =>
  list.reduce((total, file) => total + jsSizes.get(file), 0);
const firstJs = sum([...firstScreen]);
const lazyJs = sum(
  [...jsSizes.keys()].filter((file) => !firstScreen.has(file)),
);
if (firstJs > 120 * 1024)
  throw new Error(`First screen JS exceeds 120 KiB gzip: ${firstJs}`);
if (lazyJs > 70 * 1024)
  throw new Error(`Lazy JS chunks exceed 70 KiB gzip: ${lazyJs}`);
if (sums.css > 30 * 1024)
  throw new Error(`CSS exceeds 30 KiB gzip: ${sums.css}`);
const preloadFonts = [...html.matchAll(/<link\b[^>]*\bas="font"[^>]*>/g)]
  .length;
if (preloadFonts > 2)
  throw new Error(`More than two font preloads: ${preloadFonts}`);
// Explicit hero filename convention; prevents later photo additions silently escaping the budget.
for (const file of appFiles.filter((file) =>
  /(?:^|\/)hero[^/]*\.avif$/.test(file),
))
  if ((await stat(file)).size > 150 * 1024)
    throw new Error(`Hero image exceeds 150 KiB: ${file}`);
console.log(
  `First screen JS ${(firstJs / 1024).toFixed(2)} KiB gzip; lazy JS ${(lazyJs / 1024).toFixed(2)} KiB gzip; CSS ${(sums.css / 1024).toFixed(2)} KiB gzip; font preloads ${preloadFonts}. No MSW, sourcemaps or temporary asset URLs.`,
);
