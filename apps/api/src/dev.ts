/**
 * The local development server. **Not the deployed artifact.**
 *
 * Vercel imports the default export of `index.ts` and supplies its own HTTP
 * server, so nothing here ships. This exists only so the API can be exercised
 * on a laptop.
 *
 * **Why not `vercel dev`.** It was the original `dev` script and it cannot run:
 * `vercel dev` reads the project's Development Command, which for the Hono
 * preset is `pnpm dev` — which is this script — so it refuses with
 * *"must not recursively invoke itself"*. Breaking that loop means editing a
 * setting in the Vercel dashboard, and `vercel dev` additionally needs a linked
 * project and a logged-in CLI. A local server needs none of that, works
 * offline, and boots in a second. `vercel dev` is still the right tool for
 * checking routing and headers as Vercel will actually serve them; it is kept
 * as `pnpm dev:vercel` for that, with the caveat above.
 */

import { serve } from '@hono/node-server';
import { CORS_ORIGINS_VAR } from './cors.js';
import app from './index.js';

const port = Number(process.env.PORT ?? 3000);

/**
 * **The local origins are defaulted here and nowhere else.**
 *
 * `cors.ts` has no defaults on purpose: an unset allowlist in production must
 * mean *nothing is allowed*, not *localhost is allowed*, because a developer
 * with something running on port 5173 is otherwise a cross-origin caller of the
 * live API. This file never ships — Vercel imports `index.ts` — so a default
 * here reaches a laptop and cannot reach production.
 *
 * The three ports: Vite's dev server, Vite's `preview`, and the dedicated
 * Playwright port from `apps/client/playwright.config.ts`.
 */
process.env[CORS_ORIGINS_VAR] ??=
  'http://localhost:5173,http://localhost:4173,http://localhost:5190';

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`  api  http://localhost:${info.port}/v1/health`);
});
