/**
 * `/v1/players/:targetId/profile` and the export routes (012 T013, T023).
 *
 * ### `targetId`, per feature 005's convention
 *
 * The path parameter is never `:id`. An account id in a path is always the
 * *target* of the action and never the actor — the actor comes from the verified
 * session and from nowhere else. Naming it `targetId` is what makes a handler
 * that reads it as the caller look wrong on sight.
 *
 * ### A session is required to read somebody's profile
 *
 * Scouting is a signed-in activity, and the profile is the scouting surface. An
 * anonymous profile route would also be a free, unauthenticated enumeration of
 * every player's league, rating and gear score — which is a scraper's shopping
 * list, not a public good.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import { PlayerNotFoundError, publicProfile } from './publicProfile.js';
import { EXPORT_HEADER, myDataCsv } from './export.js';
import { exportAllowed, noteExport } from './rateLimit.js';

export const profileRoutes = new Hono<AuthedEnv>();

profileRoutes.use('/players/:targetId/profile', requireSession);
profileRoutes.use('/me/export', requireSession);

profileRoutes.get('/players/:targetId/profile', async (c) => {
  const targetId = c.req.param('targetId');

  try {
    return c.json(await publicProfile(targetId), 200);
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return c.json(apiError('not_found', 'No such player.'), 404);
    }
    throw error;
  }
});

/**
 * A player's own data, as CSV.
 *
 * **Rate-limited because it is a bulk read** (FR-010) — one request walks every
 * battle the player has ever fought, and nothing else in this API does that.
 */
profileRoutes.get('/me/export', async (c) => {
  const { accountId } = requireContext(c);

  if (!exportAllowed(accountId)) {
    return c.json(apiError('rate_limited', 'Exports are limited. Try again shortly.'), 429);
  }
  noteExport(accountId);

  const csv = await myDataCsv(accountId);

  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="lmntlz-battles.csv"',
  });
});

/**
 * ### `GET /v1/guilds/:guildId/export` is deliberately NOT here — 012 T021 is blocked
 *
 * It exports **event data only**, and guild-event design is deferred with Wings
 * and guild funds (`STATUS.md`, `08-guilds.md`). There is no membership table to
 * check a role against and no event to export, so every honest implementation of
 * this route today returns an empty file or a `403` — and a route that always
 * refuses is worse than an absent one, because it reads as a permissions bug.
 *
 * Recorded blocked rather than stubbed, the same way feature 008 records its
 * cron registration as waiting on 016. When it does land, **the rule that
 * matters is already written down**: it is a *second route running a second
 * query*, never a `scope` parameter on the route above. A scope parameter invites
 * the bug where an officer requests the wider scope; two routes cannot express
 * that mistake. `export.ts` therefore has no `scope` anywhere in it, and
 * `export.test.ts` asserts the word is absent from this whole directory.
 */

export { EXPORT_HEADER };
