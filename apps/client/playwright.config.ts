import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, against the real Vite build.
 *
 * **The API is intercepted rather than run.** These specs are about the
 * *client's* flow — that a player can build a squad, that the eviction confirm
 * appears before anything commits, that every control is reachable by keyboard.
 * The server's own rules already have 100+ tests against a real Neon database,
 * and re-proving them through a browser would be slower and would fail for
 * reasons that have nothing to do with the interface.
 *
 * It also means these run with no `.env.local`, no database and no Google
 * client — which is what makes them runnable in CI on a fork.
 *
 * **Chromium only.** The game is desktop Electron plus a desktop browser; there
 * is no mobile target and no Safari story to protect.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    /**
     * **Port 5190, not the dev server's 5173, and `reuseExistingServer: false`.**
     *
     * The first run of this suite tested a completely different application. The
     * default `reuseExistingServer: !CI` found *something* answering on 5173 —
     * another project of the author's, already running — and drove the whole
     * suite against it. Twelve tests failed, which was luck: they failed because
     * nothing matched, and an app that happened to share a button label would
     * have produced a green run against the wrong software.
     *
     * 5173 also cannot simply be taken: it is a registered Google OAuth origin,
     * so the dev server keeps it and `strictPort` makes a collision loud rather
     * than silently moving. The e2e suite needs no Google, so it gets its own.
     */
    baseURL: 'http://localhost:5190',
    trace: 'on-first-retry',
    // The floor from base.css. Running below it would test a layout the game
    // does not claim to support.
    viewport: { width: 1600, height: 900 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm dev --port 5190 --strictPort',
    url: 'http://localhost:5190',
    // Never inherit a stranger's server. See the note on `baseURL`.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
