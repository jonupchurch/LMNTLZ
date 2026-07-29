import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * **The suite talks to a real Neon database**, so it needs the same
 * `.env.local` the app does — and Vitest does not load one on its own.
 *
 * `process.loadEnvFile` is Node's own, built in since 22, so this costs no
 * dependency. Vite's `loadEnv` would do the same job but `vite` is not a direct
 * dependency of this app and pnpm's strict linking correctly refuses to resolve
 * it — adding one to read a `.env` file would be a phantom dependency bought for
 * nothing.
 *
 * The path is the repo root, which is the single canonical location for the file
 * (see the `//db` note in package.json).
 *
 * **Neon is the database for every environment, tests included.** There is no
 * in-memory substitute and no mock: the rotation rule is enforced by a unique
 * index and a real transaction, and a fake would exercise neither. A developer
 * without `.env.local` therefore sees these fail loudly, which is the right
 * failure — a suite that silently skipped its own database tests would report
 * green on a machine where nothing had been checked.
 */
try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../.env.local'));
} catch {
  // Absent is fine here; the tests that need it fail with a message that says so.
}

/**
 * **Projects from the start, because features 005–016 all land tests here.**
 * One flat `include` would have every feature's suite run on every change, and
 * the auth suite is the one with database round trips in it.
 *
 * Node environment throughout — this app never runs in a browser, and a browser
 * environment would quietly shim `node:crypto` rather than failing.
 */
export default defineConfig({
  test: {
    /**
     * **The `projects` array below is honoured in-package and dropped by the
     * root runner**, which declares `projects: ['apps/*']` — each app is itself
     * a project, and Vitest does not nest one inside another. So
     * `pnpm exec vitest run --project auth` works from `apps/api` and fails from
     * the repo root.
     *
     * It is harmless here only because both projects want `node`, which is
     * already the default. `apps/client` needs `jsdom` and therefore has to
     * state its environment at this level too, or the root run has no DOM.
     * Recorded here so the next person does not have to rediscover it from a
     * `document is not defined` in an unrelated suite.
     */
    environment: 'node',

    /**
     * **Audits the database across the whole run.** Every suite that creates an
     * account already deletes it, and a run still left ten behind — a per-file
     * `afterAll` cannot see what another file failed to clean up, and nobody
     * notices a leak that does not fail anything. See `tests/globalSetup.ts`.
     *
     * At this level rather than inside a project: it must span all of them.
     */
    globalSetup: ['./tests/globalSetup.ts'],

    projects: [
      {
        test: {
          name: 'auth',
          include: ['tests/auth/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'squads',
          include: ['tests/squads/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'battle',
          include: ['tests/battle/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'replays',
          include: ['tests/replays/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
          /**
           * **The only project that runs its files one at a time, and it has to.**
           *
           * `cleanupExpired()` deliberately has no "only these battles" parameter —
           * a job that can be scoped is a job somebody will scope by accident, and
           * a scoped sweep silently stops deleting things. So it operates on every
           * expired row in the table.
           *
           * Several files here create expired records on purpose (`list.test.ts`
           * needs them for the `watchable` cases, `access.test.ts` for the `410`
           * ones). Run in parallel, `cleanup.test.ts` deletes another file's
           * fixtures mid-assertion and both fail intermittently — the classic
           * shared-database flake that gets retried instead of read.
           *
           * Serial costs a few seconds. The alternative was making the job
           * scopable for the tests' benefit, which would have weakened the thing
           * being tested.
           */
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'matchmaking',
          include: ['tests/matchmaking/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
          /**
           * **Longer than the default, because one suite here is a simulation
           * rather than a test.** `population.ts` builds 20,000 synthetic accounts
           * and the league-share and bleed suites sweep the whole score range
           * across it — `09-matchmaking.md` is explicit that those are population
           * questions and that reasoning will not settle them. The work is pure
           * arithmetic with no database in it, so it is fast per account and still
           * adds up.
           */
          testTimeout: 30_000,
        },
      },
      {
        /**
         * **Cross-cutting concerns that belong to no feature.** The projects
         * above are named for features, and a rule that holds for every route —
         * the CORS policy, and feature 016's maintenance flag — has nowhere to
         * live among them. Without this the file simply is not collected, and a
         * test nobody runs reports nothing at all.
         */
        test: {
          name: 'platform',
          include: ['tests/platform/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
    ],
    // Two things excluded for two reasons. `dist/**` because `tsc` emits a .js
    // twin of every test file, so one build gives Vitest two copies of each
    // suite — and an `exclude` here does NOT reach the projects above, so it is
    // repeated there. `tests/e2e/**` because Playwright owns those; without it
    // Vitest tries to run `.spec.ts` files it cannot drive, and the failure
    // reads like a broken test rather than a misrouted one.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', 'tests/e2e/**'],
  },
});
