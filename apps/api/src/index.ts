/**
 * The API entry point. **Vercel's Hono preset finds this file by convention** —
 * `src/index.ts` exporting the app as the default export — so there is no
 * `api/` folder of individual functions and no per-route handler file.
 *
 * ### Everything lives under `/v1`
 *
 * The stack calls for a **versioned JSON REST** API, and versioning from the
 * first route is the cheap half of that promise. Retrofitting a prefix once
 * clients exist means either breaking them or serving both shapes forever.
 *
 * ### The error shape is shared by all sixteen features
 *
 * One JSON body for every failure, so a client writes one error path rather than
 * sixteen. Feature 016 reads the same shape for its maintenance response.
 */

import { Hono } from 'hono';
import { apiError } from './errors.js';
import { authRoutes } from './auth/routes.js';
import { squadRoutes } from './squads/routes.js';

export { apiError } from './errors.js';
export type { ApiError } from './errors.js';

const app = new Hono();

/**
 * `/v1` is the whole public surface. Everything else is a 404, including `/`,
 * because an unversioned route that happens to work is a route somebody will
 * depend on.
 */
const v1 = new Hono();

/**
 * Liveness only — it says the process is up, and deliberately nothing more.
 *
 * **It does not touch the database.** A health check that queries Postgres turns
 * a slow database into an outage on every platform that polls it, and it hands
 * an unauthenticated caller a way to generate load.
 */
v1.get('/health', (c) => c.json({ status: 'ok' }));

v1.route('/', authRoutes);
v1.route('/', squadRoutes);

app.route('/v1', v1);

app.notFound((c) => c.json(apiError('not_found', 'No such endpoint.'), 404));

/**
 * **The message is generic on purpose.** An exception's own text routinely
 * carries a connection string, a file path or a query — Sentry gets the detail
 * (feature 016), the caller gets a sentence.
 */
app.onError((err, c) => {
  console.error(err);
  return c.json(apiError('internal_error', 'Something went wrong on our end.'), 500);
});

export default app;
