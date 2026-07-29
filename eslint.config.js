// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.generated.ts',
      '.turbo/**',
      'resources/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  /**
   * Feature 002 T003 — the client may never reach the resolver or the defense AI.
   *
   * Scoped here rather than in `apps/client/eslint.config.js` because that app
   * does not exist until feature 006; this way the ban is already in place on the
   * day it does, instead of being a task somebody has to remember.
   *
   * **This is the fast local signal, not the guarantee.** It catches a direct
   * import only. `purity.test.ts` walks the whole graph and is the thing that is
   * actually true — a transitive path through a third package would sail past
   * this rule and fail there.
   */
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@lmntlz/sim/resolver',
              message:
                'The resolver is server-only: it holds the RNG and the seed. ' +
                'The client gets @lmntlz/sim/rules, which returns probabilities ' +
                'and never outcomes (Constitution XII).',
            },
            {
              name: '@lmntlz/sim/ai',
              message:
                'The defense AI is server-only. Shipping it would hand every ' +
                'player the exact ranking the engine will use against them.',
            },
          ],
        },
      ],
    },
  },
);
