import js from '@eslint/js';
import globals from 'globals';

// Size limits: files target ~300 lines (hard cap 500), functions target ~30 (hard cap 50).
export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      complexity: ['error', 15],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: { 'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }] },
  },
];
