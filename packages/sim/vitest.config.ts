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
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'resolver',
          include: ['tests/resolver/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'ai',
          include: ['tests/ai/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
