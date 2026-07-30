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

    /**
     * **Serial across the whole app, and it has to be stated HERE rather than inside the
     * `replays` project — which is where it was, and where the root runner ignored it.**
     *
     * `replays/cleanup.test.ts` exercises a job that deletes *every* expired row in the
     * database, deliberately: a job that can be scoped is a job somebody scopes by
     * accident, and a scoped sweep silently stops deleting. That makes the file
     * incompatible with anything else writing battle records at the same time, so
     * `fileParallelism: false` was set on the `replays` project to serialise it.
     *
     * **It was set in the one place the comment above says gets dropped.** Nested projects
     * are honoured in-package and discarded by the root runner, so the setting worked for
     * `vitest run --project replays` from `apps/api` and did nothing for `pnpm vitest run`
     * from the repo root — which is how CI runs. The suite was parallel in exactly the
     * environment the flake matters in, and it surfaced as four or five *different*
     * failures per run once feature 009's matchmaking suite grew heavy enough to overlap.
     *
     * Serialising only the `replays` project is not enough anyway: the collision is with
     * the `battle` project's records, which is a *different* project. Cross-project
     * parallelism is not configurable per project, so the honest lever is the app.
     *
     * **Costs about a minute on a full run**, all of it database round trips that were
     * already the bulk of the time. The rejected alternative was making the cleanup job
     * scopable for the tests' benefit, which weakens the thing under test — and rewriting
     * fifteen absolute-count assertions into deltas, which does not help while a
     * concurrent writer can still have its rows swept mid-assertion.
     */
    fileParallelism: false,

    /**
     * **Thirty seconds, at this level, and this is the SECOND setting lost to the trap
     * above.**
     *
     * It was set on the `matchmaking` project — for `population.ts`, which builds 20,000
     * synthetic accounts — and the root runner dropped it exactly as it dropped
     * `fileParallelism`. Nothing noticed for two features because every matchmaking test
     * until now was pure arithmetic or a single query and fit inside the 5s default. Then
     * `record.test.ts` started fighting battles to a conclusion — ~73 requests each, every
     * one replaying the action log — and six of its seven tests timed out **in the root run
     * only**, while passing in-package.
     *
     * ### So the rule for this file, written down rather than rediscovered a third time
     *
     * **Treat the nested `projects` array as a way to name and filter files, and nothing
     * else.** `name`, `include` and `exclude` do their job there because the root run does
     * not need them. Everything *behavioural* — `environment`, `setupFiles`,
     * `fileParallelism`, `testTimeout`, `hookTimeout` — must be stated here or it silently
     * applies only when somebody runs vitest from inside `apps/api`, which is not how CI
     * runs.
     *
     * Generous rather than tuned: every suite in this app talks to a network database, so
     * the failure this guards against is a slow round trip, and a timeout that fires on
     * one of those reports a defect that is not there.
     */
    testTimeout: 30_000,

    /**
     * **The same thirty seconds for hooks, and this is the third setting the
     * default caught out — this time by omission rather than by nesting.**
     *
     * `testTimeout` does not cover `beforeAll`/`afterAll`; they have their own budget
     * and it defaults to **10 seconds**. Almost every suite in this app opens with a
     * `beforeAll` that signs an account in over HTTP and then writes squads —
     * several Neon round trips before a single test runs — and the heavier suites
     * fight whole battles in theirs.
     *
     * It surfaced the way the other two did: two files failed on
     * `Hook timed out in 10000ms` in a full root run, and the same run passed
     * completely on a re-run. **A failure set that changes between runs is a race or
     * a budget, not a defect in the newest code** — and the tell here was that both
     * failures were in `beforeAll`, not in any assertion.
     *
     * Raising it cannot hide a real hang: a genuinely stuck hook still fails, thirty
     * seconds later. What it stops is a slow round trip being reported as a broken
     * test.
     */
    hookTimeout: 30_000,

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
        test: {
          name: 'payments',
          include: ['tests/payments/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'progression',
          include: ['tests/progression/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
          /**
           * **Same reason as `matchmaking`, and it borrows that project's
           * harness.** `rating.test.ts` runs 2,000 synthetic players to 400
           * battles each and asserts on rank correlation, because SC-003 —
           * *"the ladder measures skill, not hours"* — is a population property
           * that no unit test can reach.
           */
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'profiles',
          include: ['tests/profiles/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'guilds',
          include: ['tests/guilds/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'node',
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
