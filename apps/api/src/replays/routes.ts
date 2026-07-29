/**
 * `GET /v1/me/battles` and `GET /v1/replays/:battleId` (008 T002, T021, T022).
 *
 * ### Both routes require a session, with no anonymous variant to add later
 *
 * A battle record belongs to two accounts and a replay is readable only by a
 * participant. There is no version of either question that makes sense without
 * knowing who is asking, so the guard is declared over the whole prefix rather
 * than per handler — which is also what stops the next handler being added without
 * it.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import { getReplay, listBattles } from './read.js';

export const replayRoutes = new Hono<AuthedEnv>();

replayRoutes.use('/me/battles', requireSession);
replayRoutes.use('/replays/*', requireSession);

/**
 * The player's own battle history — most recent 50, either side.
 *
 * **Carries outcomes for both sides and neither composition.** A player is told
 * they lost to `reyna` and how long it took; they are not told what `reyna`
 * defended with. That is Constitution XVII at the place where data leaves the
 * system: the record stores both squads precisely so pick rates are computable,
 * and this response is one of the three surfaces that must not pass them on.
 */
replayRoutes.get('/me/battles', async (c) => {
  const { accountId } = requireContext(c);
  return c.json(await listBattles(accountId), 200);
});

/**
 * One replay, served **through this Function** from the private store.
 *
 * The blob is never handed over as a URL. A private store means each read is
 * authorised here against the requester, which is what lets a held replay be
 * readable by a moderator and by nobody else — a public URL could not express that
 * and could not be withdrawn once it leaked.
 */
replayRoutes.get('/replays/:battleId', async (c) => {
  const { accountId } = requireContext(c);
  const battleId = c.req.param('battleId');

  const result = await getReplay({ battleId, requesterId: accountId });

  if (result.ok) return c.json(result.log, 200);

  /**
   * **`404` for a battle that is not the caller's, indistinguishable from one that
   * does not exist.** A `403` would confirm the battle is real and that two
   * particular accounts fought it, which is a scouting signal in a game built on
   * not knowing. Same rule the battle routes follow.
   */
  if (result.reason === 'not-found') {
    return c.json(apiError('not_found', 'no such replay'), 404);
  }

  /**
   * `410 Gone` rather than `404`, and the reason is machine-readable. The
   * distinction is real and a client acts on it: **expired** is the ordinary end
   * of every replay's life and the UI should say so plainly, while **unavailable**
   * means the recording failed and the battle is otherwise intact. Collapsing them
   * would make a bug look like a normal lifecycle forever.
   */
  return c.json({ ...apiError('replay_gone', 'this replay is no longer available'), reason: result.reason }, 410);
});
