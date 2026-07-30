// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * **One clock ban, two motivations** (013 T006, T007).
 *
 * `packages/sim/rules` forbids these calls because a rules function that reads the
 * wall clock makes a replay non-deterministic — a stored battle would resolve
 * differently on a different day. `apps/api/src/guilds` forbids them because
 * succession spans **21 days across two timers**, and a timer that reads the
 * ambient clock cannot be tested without waiting three weeks.
 *
 * Same two calls, same rule object, so neither can drift from the other.
 *
 * **A convention is not enough here and the failure mode says why**: "inject the
 * clock" is broken in a one-line bug fix at the worst possible moment, by somebody
 * who is thinking about the outage rather than about testability. Lint objects
 * while they are still typing.
 *
 * `sim`'s own `purity.test.ts` and `replayability.test.ts` still scan the built
 * source and remain the stronger guarantee — this is the fast local signal.
 */
const NO_AMBIENT_CLOCK = [
  'error',
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      'Date.now() is banned here. Take a Clock and call clock.now() — ' +
      'see apps/api/src/guilds/clock.ts for why (21 days across two timers).',
  },
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message:
      'new Date() with no arguments reads the ambient clock. Take a Clock and ' +
      'call clock.now(). new Date(someInstant) is fine.',
  },
];

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

  /**
   * The clock ban, applied to the two places that have earned it.
   *
   * > **The rest of `apps/api` is deliberately NOT here yet.** 013 T007 asks for
   * > *"every feature with a timer"*, and measured rather than assumed that is **45
   * > ambient clock calls across 24 files in 8 features** — token rotation, battle
   * > expiry, replay retention, the daily curve. Threading a clock through all of
   * > them is a bigger job than feature 013 and touches deployed code, so it is
   * > named as work rather than half-done. Adding a path to this array is the
   * > whole change when somebody takes it on.
   */
  {
    files: ['apps/api/src/guilds/**/*.ts', 'packages/sim/rules/**/*.ts'],
    rules: {
      'no-restricted-syntax': NO_AMBIENT_CLOCK,
    },
  },
);
