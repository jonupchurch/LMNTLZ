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
import app from './index.js';

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`  api  http://localhost:${info.port}/v1/health`);
});
