import { defineConfig } from 'vitest/config';

/**
 * Three projects, and the split is not cosmetic.
 *
 * `rules` is isomorphic and must keep working in a browser. `resolver` is
 * **server only** — it reads `node:crypto` and holds the seed — so it is pinned
 * to the Node environment. Running it in a browser environment would either fail
 * loudly or, worse, quietly find a shim. `ai` is server only for a different
 * reason — it makes the *choices* a defender configured, and shipping it would
 * hand every player the engine's exact preferences — but it is pinned the same
 * way, because it draws through the resolver.
 */
/**
 * **`dist/` is excluded in every project, and it has to be stated per project.**
 *
 * `tsc` emits a `.js` twin of every test file, so one `pnpm build` gives Vitest
 * two copies of each suite. The compiled copies then fail — the purity gate, the
 * entropy scan and the no-constant-2 scan all read source files by relative path
 * to assert what the type system cannot, and those paths do not exist under
 * `dist/`. The symptom is four failures unrelated to whatever you just changed,
 * appearing only where a build has run: every CI machine, and no developer
 * machine until the day it is.
 *
 * An `exclude` on the parent config does **not** reach projects — each one
 * resolves its own includes — so this is shared explicitly rather than inherited.
 */
const EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.turbo/**'];

export default defineConfig({
  test: {
    exclude: EXCLUDE,
    projects: [
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          exclude: EXCLUDE,
        },
      },
      {
        test: {
          name: 'resolver',
          include: ['tests/resolver/**/*.test.ts'],
          exclude: EXCLUDE,
          environment: 'node',
        },
      },
      {
        test: {
          name: 'ai',
          include: ['tests/ai/**/*.test.ts'],
          exclude: EXCLUDE,
          environment: 'node',
        },
      },
    ],
  },
});
