import { build, createServer, preview } from 'vite';
import { cp } from 'node:fs/promises';
if (process.argv.includes('--e2e')) {
  await build({ mode: 'mock', build: { outDir: 'dist-mock' } });
  await cp('legacy/index.html', 'dist-mock/legacy.html');
  await cp('legacy/assets', 'dist-mock/assets', { recursive: true });
  const server = await preview({
    mode: 'mock',
    build: { outDir: 'dist-mock' },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  });
  server.printUrls();
} else {
  const hostIndex = process.argv.indexOf('--host');
  const host = hostIndex < 0 ? '127.0.0.1' : process.argv[hostIndex + 1];
  if (!['127.0.0.1', '0.0.0.0'].includes(host))
    throw new Error('Invalid development host');
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex < 0 ? 5173 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid development port');
  const server = await createServer({
    mode: 'mock',
    server: { host, port, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}
