import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * **Projects from the start**, matching `apps/api/vitest.config.ts` — features
 * 006–016 all land suites here, and one flat `include` would run every screen's
 * tests on every change.
 *
 * `jsdom` rather than a real browser: these are component tests over the
 * allocation rules, and the rules themselves are tested in `packages/sim` with
 * no DOM at all. Playwright owns the paths a unit test cannot reach, and
 * `tests/e2e/**` is excluded here so Vitest does not try to drive them.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * **`environment` and `setupFiles` are here, at the top level, and that is
     * load-bearing.**
     *
     * There are two ways this suite runs and they do not read the same keys:
     *
     * - `pnpm test` → Turbo → `vitest run` **inside this package**, which reads
     *   `projects` below and honours `--project squad-builder`.
     * - `pnpm vitest run` **from the repo root**, whose config declares
     *   `projects: ['apps/*']` — each app *is* a project, so the `projects`
     *   array below is **dropped**, taking any option nested inside it.
     *
     * With `environment: 'jsdom'` only in the nested project, the root run gets
     * Node and every render fails with `document is not defined`. It is silent
     * in `apps/api` because its nested project asks for `node`, which is already
     * the default — so the same latent bug is invisible there and fatal here.
     *
     * Stated at both levels, the two runners agree.
     */
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],

    projects: [
      {
        plugins: [react()],
        test: {
          name: 'squad-builder',
          include: ['tests/squads/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **Sign-in, which belongs to feature 005 and was built two features
         * late.** 005 shipped the entire server half and nothing ever called
         * it; 006 and 007 both assumed a session existed. The suite lives here
         * rather than under `squads` because it is what every screen depends
         * on, not what any one screen does.
         */
        plugins: [react()],
        test: {
          name: 'auth',
          include: ['tests/auth/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **The battle screen (007).** Its own project because the assertion
         * that matters here is about *requests* — the turn queue must project
         * locally and the screen must send exactly one call per choice — and a
         * suite that shares a fetch stub with the squad builder cannot say
         * whose call it was.
         */
        plugins: [react()],
        test: {
          name: 'battle',
          include: ['tests/battle/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **Choosing an opponent (006's scout view + 009's candidate list + 007's
         * start).** All three routes existed and none had a caller, which is why
         * this project appears three features after the code it drives.
         *
         * Its own project for the same reason `battle` is: the assertions are about
         * *which* requests happen, and a shared fetch stub cannot say whose call it
         * was.
         */
        plugins: [react()],
        test: {
          name: 'attack',
          include: ['tests/attack/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **The site around the game**, which belongs to no feature: the five
         * static policy pages a payment provider requires, and the footer that
         * makes them reachable. `apps/api` has a `platform` project for the
         * same reason — a rule that holds everywhere has nowhere to live among
         * projects named after features, and an uncollected test reports
         * nothing at all.
         */
        plugins: [react()],
        test: {
          name: 'site',
          include: ['tests/site/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'profile',
          include: ['tests/profile/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **The Store (018).** Separate from `forge` for the reason every
         * project here is separate: the assertions are about *requests*, and
         * the one that matters most — that no rail means `/checkout` is never
         * reached — cannot be made against a shared stub.
         */
        plugins: [react()],
        test: {
          name: 'store',
          include: ['tests/store/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **The Forge (018).** Its own project because the claims here are
         * about *requests* — planning must send nothing, a refusal must happen
         * before any charge — and a suite sharing a fetch stub with another
         * screen cannot say whose call it was.
         *
         * **Adding this entry is not bookkeeping.** `include` is an explicit
         * per-project list, so a suite in a directory no project names is not
         * "unmatched", it is silently never run — which reads almost exactly
         * like a pass. Check the collected count went up.
         */
        plugins: [react()],
        test: {
          name: 'forge',
          include: ['tests/forge/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **Replays (018 US3).** Its own project because the claim that matters
         * here is an *absence* — playback reads the stored log and never
         * derives one — and because `watchable.test.tsx` asserts which requests
         * happen, which a shared fetch stub cannot say.
         *
         * **Adding this entry is not bookkeeping.** `include` is an explicit
         * per-project list, so a suite in a directory no project names is not
         * "unmatched", it is silently never run — which reads almost exactly
         * like a pass. Check the collected count went up.
         */
        plugins: [react()],
        test: {
          name: 'replays',
          include: ['tests/replays/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'guilds',
          include: ['tests/guilds/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        /**
         * **The component layer (017).** Every project above is named after a
         * screen; this one is named after the furniture they are all built
         * from, so it runs on a change to any of them.
         *
         * **Adding this entry was not optional bookkeeping.** `include` here is
         * an explicit per-project list, so a suite in a directory no project
         * names is not "unmatched", it is **silently never run** — `vitest run
         * tests/components/…` printed the project globs and collected nothing,
         * which reads almost exactly like a pass. A test that cannot be
         * collected is worse than a missing one: it looks like coverage.
         */
        plugins: [react()],
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
    ],
    // Repeated inside the project above on purpose: an `exclude` here does NOT
    // reach nested projects, and one `pnpm build` otherwise doubles the suite
    // with the .js twins tsc emits. Learned the hard way in feature 005.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', 'tests/e2e/**'],
  },
});
