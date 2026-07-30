/**
 * `GET /v1/matchmaking/candidates`, `GET /v1/me/standing` and
 * `GET /v1/matchmaking/config` (009 T001, T015, T016).
 *
 * ### Both player routes require a session, declared over the prefix
 *
 * Neither question means anything without knowing who is asking — a candidate list
 * is *this* player's league, and standing is *this* player's rating. So the guard
 * sits on the prefix rather than per handler, which is also what stops the next
 * handler being added without it.
 *
 * `config` is deliberately **not** behind the guard: it is the same set of
 * constants for everybody, the client needs the league table to render a landing
 * page before anyone signs in, and Constitution XII wants these served rather than
 * compiled in. Nothing in it is per-player.
 *
 * ### An opponent's league is not named (FR-006)
 *
 * `contracts/matchmaking-api.md`: matchmaking offers same-league defenders, so
 * **knowing your own league already tells you every opponent's band** — repeating it
 * per candidate is redundant on an ordinary match. It **is** named on a widened one,
 * because there the shared-band assumption is exactly what stopped being true.
 *
 * Since widening arrives with bots in Phase 7, no candidate carries a league today
 * and `widened` is always `false`. The field is present regardless: an optional
 * field is a field clients forget to read.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { candidates } from './candidates.js';
import { standing } from './standing.js';
import { matchmakingConfig } from './config.js';

export const matchmakingRoutes = new Hono<AuthedEnv>();

matchmakingRoutes.use('/matchmaking/candidates', requireSession);
matchmakingRoutes.use('/me/standing', requireSession);

/**
 * Who the player may attack, ordered.
 *
 * **No query parameters, and that is the contract rather than an omission.** There
 * is no `?page=`, no `?exclude=`, no `?minRating=` — every eligible defender in the
 * league is returned every time. See `candidates.ts` for why the economy handles
 * farming and matchmaking does not have to.
 */
matchmakingRoutes.get('/matchmaking/candidates', async (c) => {
  const { accountId } = requireContext(c);
  return c.json(await candidates(accountId), 200);
});

/**
 * The player's own league, score, rating and band.
 *
 * Separate from `candidates` even though the numbers overlap, because a client
 * showing a standing header should not have to fetch and discard a full opponent
 * list to do it.
 */
matchmakingRoutes.get('/me/standing', async (c) => {
  const { accountId } = requireContext(c);
  return c.json(await standing(accountId), 200);
});

/**
 * Every threshold, bleed constant and ambush number, served.
 *
 * **Unauthenticated on purpose.** A client that cannot read the league table until
 * it holds a session is a client that will hard-code the league table.
 */
matchmakingRoutes.get('/matchmaking/config', (c) => c.json(matchmakingConfig(), 200));
