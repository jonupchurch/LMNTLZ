import { defineConfig } from 'vitest/config';

/**
 * Two projects, and the split is not cosmetic.
 *
 * `rules` is isomorphic and must keep working in a browser. `resolver` is
 * **server only** — it reads `node:crypto` and holds the seed — so it is pinned
 * to the Node environment. Running it in a browser environment would either fail
 * loudly or, worse, quietly find a shim.
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
    ],
  },
});
