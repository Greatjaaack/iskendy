import { build, preview } from 'vite';
import { access, cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const serveOnly = process.argv.includes('--serve');
const outDir = resolve(
  process.argv.slice(2).find((arg) => arg !== '--serve') ??
    '/tmp/iskendy-manual-preview-20261008',
);
const port = Number(process.env.ISKENDY_MANUAL_PORT ?? 5180);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Manual preview needs an unprivileged local port.');
if (serveOnly) {
  await access(`${outDir}/SNAPSHOT.txt`);
} else {
  let exists = false;
  try {
    await access(`${outDir}/SNAPSHOT.txt`);
    exists = true;
  } catch {
    /* A new snapshot has no marker yet. */
  }
  if (exists)
    throw new Error(
      'Stable snapshot already exists. Use --serve or a new output directory; do not overwrite a running manual preview.',
    );
  await mkdir(outDir, { recursive: true });
  await build({
    mode: 'mock',
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          app: resolve('index.html'),
          kit: resolve('dev/kit.html'),
          manual: resolve('dev/manual.html'),
          scenario: resolve('dev/scenario.html'),
          tv: resolve('dev/tv.html'),
          motion: resolve('dev/motion.html'),
        },
      },
    },
  });
  await cp('legacy/index.html', `${outDir}/legacy.html`);
  await cp('legacy/assets', `${outDir}/assets`, { recursive: true });
  await cp('dev/manual-checklist.html', `${outDir}/manual-checklist.html`);
  await writeFile(
    `${outDir}/SNAPSHOT.txt`,
    `Built once at ${new Date().toISOString()}. Source edits do not alter this directory. Local synthetic manual preview only.\n`,
  );
}
const server = await preview({
  mode: 'mock',
  build: { outDir },
  preview: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
});
server.printUrls();
console.log(`Manual scenarios: http://127.0.0.1:${port}/dev/manual.html`);
