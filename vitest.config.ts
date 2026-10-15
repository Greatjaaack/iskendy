import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
  plugins: [react(), imagetools()],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx,mjs}',
      'src/**/*.test.{ts,tsx,mjs}',
    ],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/boot/main.ts', 'src/vite-env.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
        'src/{domain,api,polling,storage}/**/*.{ts,tsx}': {
          lines: 90,
          branches: 90,
        },
      },
    },
  },
});
