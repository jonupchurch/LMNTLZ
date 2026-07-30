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
import {
  AVATAR_COST_CENTS,
  AVATAR_COST_SHARDS,
  CURATED_AVATARS,
  UnknownAvatarError,
  currentAvatar,
  setCuratedAvatar,
} from './identity.js';

export const profileRoutes = new Hono<AuthedEnv>();

profileRoutes.use('/players/:targetId/profile', requireSession);
profileRoutes.use('/me/export', requireSession);
profileRoutes.use('/me/avatar', requireSession);

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
 * The curated set, and the player's current choice.
 *
 * **Curated avatars need no review**, which is why this is a plain read and a
 * plain write with no queue anywhere near it.
 */
profileRoutes.get('/me/avatar', async (c) => {
  const { accountId } = requireContext(c);

  return c.json(
    {
      curated: CURATED_AVATARS,
      current: await currentAvatar(accountId),
      customPrice: { shards: AVATAR_COST_SHARDS, cents: AVATAR_COST_CENTS },
      /**
       * **False until feature 016's review queue exists.** Stated in the payload
       * rather than only in the copy, so a client renders an honest screen
       * instead of offering an upload whose submission nobody can approve.
       */
      customAvailable: false,
    },
    200,
  );
});

profileRoutes.put('/me/avatar', async (c) => {
  const { accountId } = requireContext(c);
  const body = (await c.req.json().catch(() => null)) as { avatarKey?: unknown } | null;
  const key = body?.avatarKey;

  if (typeof key !== 'string') {
    return c.json(apiError('malformed_request', 'An `avatarKey` is required.'), 400);
  }

  try {
    await setCuratedAvatar(accountId, key);
  } catch (error) {
    if (error instanceof UnknownAvatarError) {
      return c.json(apiError('unknown_avatar', 'No such avatar.'), 422);
    }
    throw error;
  }

  return c.json({ current: await currentAvatar(accountId) }, 200);
});

/**
 * ### `POST /v1/me/avatar` (custom upload) is deliberately NOT here — T028–T033 blocked
 *
 * The charge is **on submission, not on approval**, and a rejection refunds
 * nothing. That is the throttle and it only works if somebody is actually
 * reviewing: without feature 016's queue, shipping the upload would charge
 * players $5 or 1,350 shards for an image that sits pending forever, with no
 * refund by design. **That is worse than not shipping it**, so it waits.
 *
 * Everything it needs is already in place — `avatar_submissions` with its
 * harm-only reason enum, the two prices, and the private-blob decision. What is
 * missing is the reviewer. `tasks.md`'s own incremental-delivery section says
 * exactly this: ship curated with US1, add custom when the admin queue exists.
 */

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
