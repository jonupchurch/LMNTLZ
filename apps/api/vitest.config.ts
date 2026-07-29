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
          environment: 'node',
        },
      },
    ],
    // Playwright owns the end-to-end paths; without this, Vitest tries to run
    // `.spec.ts` files it cannot drive and the failure looks like a broken test
    // rather than a misrouted one.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
