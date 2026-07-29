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
