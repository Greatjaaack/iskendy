import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { radixCollectionTreeShaking } from './radix-collection-tree-shaking';
import { imagetools } from 'vite-imagetools';
import { readFile } from 'node:fs/promises';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    radixCollectionTreeShaking(),
    imagetools(),
    {
      name: 'immutable-legacy-dev',
      async generateBundle() {
        if (mode === 'mock')
          this.emitFile({
            type: 'asset',
            fileName: 'mockServiceWorker.js',
            source: await readFile(
              'tests/msw/public/mockServiceWorker.js',
              'utf8',
            ),
          });
      },
      configureServer(server) {
        const files: Record<string, string> = {
          ...(mode === 'mock'
            ? {
                '/mockServiceWorker.js':
                  'tests/msw/public/mockServiceWorker.js',
              }
            : {}),
          '/legacy.html': 'legacy/index.html',
          '/assets/favicon.png': 'legacy/assets/favicon.png',
          '/assets/logo_white.png': 'legacy/assets/logo_white.png',
          '/assets/iskendi_wordmark_white.png':
            'legacy/assets/iskendi_wordmark_white.png',
        };
        server.middlewares.use((request, response, next) => {
          const path = request.url?.split('?')[0] ?? '';
          const file = files[path];
          if (!file) {
            next();
            return;
          }
          void readFile(file)
            .then((bytes) => {
              response.setHeader(
                'Content-Type',
                file.endsWith('.html')
                  ? 'text/html; charset=utf-8'
                  : file.endsWith('.js')
                    ? 'text/javascript'
                    : 'image/png',
              );
              response.setHeader('Cache-Control', 'no-cache');
              response.end(bytes);
            })
            .catch(next);
        });
      },
    },
  ],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'app',
    // Keep original SVGs as local files instead of embedding every unused variant in JavaScript.
    assetsInlineLimit: (filePath) =>
      filePath.endsWith('.svg') ? false : undefined,
    sourcemap: false,
    target: ['safari15', 'chrome100'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8080' },
  },
  preview: { port: 4173, strictPort: true },
}));
