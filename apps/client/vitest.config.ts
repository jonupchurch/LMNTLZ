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
    ],
    // Repeated inside the project above on purpose: an `exclude` here does NOT
    // reach nested projects, and one `pnpm build` otherwise doubles the suite
    // with the .js twins tsc emits. Learned the hard way in feature 005.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', 'tests/e2e/**'],
  },
});
