import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'generated/**',
      'node_modules/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['*.config.js', '*.config.cjs', 'tailwind.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['component/chat-sidebar.tsx', 'component/user-auth.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
