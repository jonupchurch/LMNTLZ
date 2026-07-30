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
import { apiError } from '../errors.js';
import { matchmakingConfig } from './config.js';
import { REQUIRED_ACKNOWLEDGEMENTS, exitStarter } from './starterLeague.js';

export const matchmakingRoutes = new Hono<AuthedEnv>();

matchmakingRoutes.use('/matchmaking/candidates', requireSession);
matchmakingRoutes.use('/me/standing', requireSession);
matchmakingRoutes.use('/me/starter/exit', requireSession);

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

/**
 * Exit 3 of four — voluntary, and **permanent** (T031 · FR-022).
 *
 * **Both losses must be acknowledged or this refuses.** `409` rather than `400`, per
 * the contract, and the code is right for the reason a body-shape error would not be:
 * the request is *well formed*, it simply asserts a state — "the player has been told"
 * — that conflicts with what was actually shown them. A `400` would read as a
 * client-bug and get retried; a `409` reads as *this is not permitted yet*.
 *
 * The two acknowledgements are checked **by name, as a set**, never by counting. A
 * count is satisfied by sending the same string twice, which is exactly what a screen
 * that lost one of the two warnings would do.
 *
 * `confirmed` is separate from the acknowledgements on purpose: acknowledging is
 * *"I have read what this costs"* and confirming is *"do it"*. Collapsing them makes
 * reading the warning into the act of accepting it.
 */
matchmakingRoutes.post('/me/starter/exit', async (c) => {
  const { accountId } = requireContext(c);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  const raw = body?.['acknowledged'];
  const acknowledged: unknown[] = Array.isArray(raw) ? raw : [];
  const missing = REQUIRED_ACKNOWLEDGEMENTS.filter((required) => !acknowledged.includes(required));

  if (body?.['confirmed'] !== true || missing.length > 0) {
    return c.json(
      {
        // Named, so a client that dropped one of the two warnings is told which.
        ...apiError(
          'starter_exit_unacknowledged',
          `Leaving the starter league must acknowledge: ${REQUIRED_ACKNOWLEDGEMENTS.join(', ')}.`,
        ),
        required: REQUIRED_ACKNOWLEDGEMENTS,
        missing,
      },
      409,
    );
  }

  /**
   * Idempotent by way of `exitStarter`'s own `WHERE starter_exited_at IS NULL`, so a
   * double-click cannot relabel a guild exit as a voluntary one. It answers `200`
   * either way — a player who is already out asked for a state they are already in.
   */
  return c.json({ starter: await exitStarter(accountId, 'voluntary') }, 200);
});
