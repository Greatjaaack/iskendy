import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '.cache/**',
      'artifacts/**',
      'playwright-report-spike/**',
      'test-results-spike/**',
      'dist/**',
      'dist-mock/**',
      'tests/msw/public/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'legacy/**',
      'design/**',
      'scripts/figma-export-tokens.js',
      // Локальная обвязка Искенди (ветка local/docker): сценарии стенда, не код фронта.
      'local/**',
      'docker/**',
    ],
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { self: 'readonly' } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
