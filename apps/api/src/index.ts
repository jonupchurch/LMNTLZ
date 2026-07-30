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
import { corsMiddleware } from './cors.js';
import { authRoutes } from './auth/routes.js';
import { squadRoutes } from './squads/routes.js';
import { battleRoutes } from './battle/routes.js';
import { replayRoutes } from './replays/routes.js';
import { matchmakingRoutes } from './matchmaking/routes.js';
import { progressionRoutes } from './progression/routes.js';
import { installRuneSource } from './progression/install.js';

export { apiError } from './errors.js';
export type { ApiError } from './errors.js';

/**
 * **Before any route can be served.** Installs 010's rune source into 009's
 * `gearScore` seam; without it every account scores the 1,500 starter grant no
 * matter how many runes it has placed, silently. See `progression/install.ts`.
 */
installRuneSource();

const app = new Hono();

/**
 * **First, and before `/v1` is mounted.** Hono composes middleware in
 * registration order, so registering this after the routes would let
 * `requireSession` answer a preflight — and a preflight carries no
 * `Authorization` header, because it is the request asking whether one may be
 * sent. The 401 that follows surfaces in the browser as a CORS error, which
 * sends you looking in the wrong file. See `cors.ts`.
 */
app.use('*', corsMiddleware());

/**
 * `/v1` is the whole public surface. Everything else is a 404, including `/`,
 * because an unversioned route that happens to work is a route somebody will
 * depend on.
 */
const v1 = new Hono();

/**
 * Liveness, **and which build is answering**.
 *
 * **It does not touch the database.** A health check that queries Postgres turns
 * a slow database into an outage on every platform that polls it, and it hands
 * an unauthenticated caller a way to generate load.
 *
 * ### Why it reports a commit, added 2026-07-29
 *
 * For two features it returned `{status: "ok"}` and nothing else, and that is
 * exactly as much as it could ever say — **this route has existed since the
 * first commit of the API, so its answer is identical in every build ever
 * made.** Production spent feature 006 serving a feature-005 build, `/v1/health`
 * answered 200 throughout, and the deploy failures were invisible because the
 * one thing anybody checked could not tell two builds apart.
 *
 * `VERCEL_GIT_COMMIT_SHA` is injected by the platform. **The repository is
 * public, so the SHA discloses nothing** — and locally there is no deployment to
 * identify, hence `dev`.
 */
v1.get('/health', (c) =>
  c.json({
    status: 'ok',
    commit: process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 7) ?? 'dev',
  }),
);

v1.route('/', authRoutes);
v1.route('/', squadRoutes);
v1.route('/', battleRoutes);
v1.route('/', replayRoutes);
v1.route('/', matchmakingRoutes);
v1.route('/', progressionRoutes);

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
