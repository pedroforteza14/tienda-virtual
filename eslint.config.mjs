import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['alo/**', '.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {
      // Security-relevant: raw HTML injection must be a deliberate, reviewed act.
      'react/no-danger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Structured-data and JSON-LD emitters are the one sanctioned place for
    // serialised payloads; they are serialised with a dedicated hardened helper.
    files: ['src/lib/seo/**'],
    rules: { 'react/no-danger': 'off' },
  },
];

export default config;
