import { defineConfig } from 'vitest/config';

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
    projects: [
      {
        test: {
          name: 'auth',
          include: ['tests/auth/**/*.test.ts'],
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
