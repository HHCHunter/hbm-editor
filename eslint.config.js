import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.runtime/**', '.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/editor/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: [
      'packages/server/**/*.ts',
      'packages/*/scripts/**/*.ts',
      'apps/editor/e2e/**/*.ts',
      'apps/editor/*.config.ts',
      'scripts/**/*.mjs',
      'tools/**/*.mjs',
      '*.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Format and scene code also runs in the browser, so file access and zlib stay on the server.
    files: ['packages/formats/src/**/*.ts', 'packages/scene/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'fs/*', 'path', 'zlib', 'crypto', 'buffer'],
              message: 'Format code must run in the browser too; do Node work in the server or scripts.',
            },
          ],
        },
      ],
    },
  },
);
