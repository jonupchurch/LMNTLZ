/**
 * `GET /v1/me/shards` and `POST /v1/heroes/:heroId/runes/:slot` (010 T017, T018).
 *
 * Both are per-player and meaningless without a session, so the guard sits on the
 * prefix rather than per handler — the same shape as `matchmaking/routes.ts`, and
 * for the same reason: it is what stops the next handler being added without one.
 *
 * ### The status table, and why `402` rather than `400`
 *
 * | | |
 * |---|---|
 * | `200` | the stage was committed |
 * | `402` | **insufficient shards** — the request was well-formed and the player simply cannot afford it |
 * | `409` | the slot holds a completed rune and `confirmed` was absent |
 * | `422` | the allocation is illegal — wrong point total, unknown slot, or past the 75 cap |
 *
 * `402 Payment Required` is the honest code for *"you understood the request, it
 * was valid, you just do not have enough"* — a `400` would tell a client to fix
 * the request, and there is nothing in the request to fix.
 *
 * **`409` is not boilerplate.** It is the only thing standing between a player and
 * the permanent destruction of a rune they spent 650 shards on, so it is refused by
 * default and confirmed explicitly.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import { UnknownHeroError } from '@lmntlz/content';
import { RUNE_SLOTS, type RuneAllocations, type RuneSlot } from '../db/schema/runes.js';
import { balance, lifetimeEarned, victoriesToday } from './ledger.js';
import { capDescription } from './cap.js';
import { dailyMultiplier } from './income.js';
import { ownedRunes } from './read.js';
import { placeStage, quoteRefund, rebuildRune, refundHero, RuneError } from './runes.js';
import { nextBoundaryAt, progressionConfig } from './config.js';
import { ratingOf } from './rating.js';

export const progressionRoutes = new Hono<AuthedEnv>();

progressionRoutes.use('/me/shards', requireSession);
progressionRoutes.use('/me/runes', requireSession);
progressionRoutes.use('/heroes/:heroId/runes/:slot', requireSession);
/**
 * **Registered before the `:slot` guard would ever see it.** Hono matches on the
 * concrete path, so `/heroes/:heroId/runes` and `/heroes/:heroId/runes/:slot` are
 * different routes and each needs its own `use` — a refund arriving unauthed
 * would otherwise reach the handler.
 */
progressionRoutes.use('/heroes/:heroId/runes', requireSession);

/**
 * The player's balance, today's position on the curve, and the cap.
 *
 * **`nextBoundaryAt` is the point of this route rather than a detail.** FR-018
 * wants the taper legible *before* it bites: a player who can see that they are
 * three victories from the 0.5× tier and that the day turns over in two hours can
 * decide what to do about it. Without it the curve is only discoverable by
 * noticing a smaller number after the fact, which reads as a bug.
 *
 * The cap ships as **both** the raw number and the rune count, because FR-017
 * requires it be *presented* as ten full runes and a client cannot derive that
 * from 6,500 without hard-coding the rune price it was told not to hard-code.
 */
progressionRoutes.get('/me/shards', async (c) => {
  const { accountId } = requireContext(c);
  const now = new Date();

  const [current, victories, lifetime, rating] = await Promise.all([
    balance(accountId),
    victoriesToday(accountId, now),
    lifetimeEarned(accountId),
    ratingOf(accountId),
  ]);

  return c.json(
    {
      balance: current,
      lifetimeEarned: lifetime,
      rating,
      today: {
        victories,
        /** The multiplier the **next** victory would earn, not the last one. */
        nextMultiplier: dailyMultiplier(victories + 1),
        nextBoundaryAt: nextBoundaryAt(now).toISOString(),
      },
      cap: capDescription(),
      config: progressionConfig(),
    },
    200,
  );
});

const isSlot = (value: string): value is RuneSlot =>
  (RUNE_SLOTS as readonly string[]).includes(value);

/** `{ might: 20 }` — every value a non-negative whole number. */
function parseAllocations(value: unknown): RuneAllocations | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value as Record<string, unknown>)) {
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) return null;
    out[key] = amount;
  }
  return out as RuneAllocations;
}

/**
 * **What the player has actually built** (018 T007).
 *
 * Feature 010 shipped runes as a **write-only resource**: a stage could be
 * committed, gear score summed them, the ledger recorded the spend, and no
 * response anywhere returned a player their own rune state. Every gate was
 * green, because every gate was about writing. This is the read.
 *
 * The whole roster, unpaged, for the same reason
 * `GET /v1/matchmaking/candidates` takes no parameters: 27 heroes × 3 slots is
 * small, and a paging contract is a thing to get wrong for no gain. It also
 * makes the Forge's *ALL 27 · OPEN · BARE* filter a client-side view of one
 * consistent list rather than three requests that can disagree.
 *
 * **There is no `404`.** A player always has 27 heroes; an empty slot is
 * `stage: 0`.
 */
progressionRoutes.get('/me/runes', async (c) => {
  const { accountId } = requireContext(c);
  return c.json({ heroes: await ownedRunes(accountId) }, 200);
});

/**
 * Commit a rune stage, or rebuild a completed rune.
 *
 * One route for both because they are the same player intent — *put a rune in this
 * slot* — and which one happens is a property of the slot's current state rather
 * than of the request. Splitting them would make the client responsible for
 * knowing the stage before it could choose a URL, and that knowledge is exactly
 * what goes stale between a page load and a click.
 */
progressionRoutes.post('/heroes/:heroId/runes/:slot', async (c) => {
  const { accountId } = requireContext(c);
  const heroId = c.req.param('heroId');
  const slot = c.req.param('slot');

  if (!isSlot(slot)) {
    return c.json(
      apiError('unprocessable', `No such rune slot: ${slot}. Expected one of ${RUNE_SLOTS.join(', ')}.`),
      422,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const payload = (body ?? {}) as { allocations?: unknown; confirmed?: unknown; rebuild?: unknown };
  const allocations = parseAllocations(payload.allocations);
  if (allocations === null) {
    return c.json(
      apiError('unprocessable', 'Allocations must map stat names to non-negative whole numbers.'),
      422,
    );
  }

  try {
    const result =
      payload.rebuild === true
        ? await rebuildRune(accountId, heroId, slot, allocations, payload.confirmed === true)
        : await placeStage(accountId, heroId, slot, allocations);

    return c.json(result, 200);
  } catch (err) {
    if (err instanceof UnknownHeroError) {
      return c.json(apiError('not_found', `No such hero: ${heroId}.`), 404);
    }
    if (err instanceof RuneError) {
      if (err.code === 'insufficient-shards') {
        return c.json(apiError('insufficient_shards', err.message), 402);
      }
      if (err.code === 'needs-confirmation') {
        return c.json(apiError('needs_confirmation', err.message), 409);
      }
      return c.json(apiError('unprocessable', err.message), 422);
    }
    throw err;
  }
});

/**
 * **Melt every rune on one hero** — `DELETE /v1/heroes/:heroId/runes`
 * (2026-08-01).
 *
 * ### `DELETE` on the collection, which is what this actually is
 *
 * The verb and the path together say the whole operation: every rune on this
 * hero, gone. A `POST .../refund` would have read as *create a refund* and left
 * the URL silent about scope — and scope is the part a player most needs to be
 * sure of, because there is no per-slot version and never will be
 * (`06-progression.md` still forbids piecemeal editing).
 *
 * The shard credit is a *consequence* of the deletion rather than the resource
 * being created, which is why the response carries the quote it acted on: what
 * was destroyed, what it was worth, and what came back.
 *
 * ### Confirmation travels as a query parameter, because DELETE has no body
 *
 * Some clients and intermediaries drop a body on `DELETE`. `?confirmed=true` is
 * the same gate the rebuild runs in its body, and the unconfirmed response is a
 * `409` carrying the full quote — so the dialog is populated by the refusal
 * rather than by a second round trip.
 */
progressionRoutes.delete('/heroes/:heroId/runes', async (c) => {
  const { accountId } = requireContext(c);
  const heroId = c.req.param('heroId');
  const confirmed = c.req.query('confirmed') === 'true';

  try {
    return c.json(await refundHero(accountId, heroId, confirmed), 200);
  } catch (err) {
    if (err instanceof UnknownHeroError) {
      return c.json(apiError('not_found', `No such hero: ${heroId}.`), 404);
    }
    if (err instanceof RuneError) {
      if (err.code === 'needs-confirmation') {
        return c.json(apiError('needs_confirmation', err.message), 409);
      }
      return c.json(apiError('unprocessable', err.message), 422);
    }
    throw err;
  }
});

/**
 * **What melting this champion would destroy and return** — read-only.
 *
 * The collection `GET` beside the collection `DELETE`: *what is here and what is
 * it worth*, then *take it*. It exists so the confirm dialog is populated by the
 * server's own arithmetic rather than the client's.
 *
 * That distinction is the whole point. `invested` and `refund` are the ladder's
 * arithmetic — a client computing `floor(invested × rate)` for the dialog would
 * be a second implementation, and the two would disagree **quietly** the first
 * time the rate moved: shown one number, paid another, with nothing failing.
 *
 * **Not `/runes/quote`**, which would collide with `/runes/:slot` and arrive at
 * that handler as a slot named "quote".
 */
progressionRoutes.get('/heroes/:heroId/runes', async (c) => {
  const { accountId } = requireContext(c);
  const heroId = c.req.param('heroId');

  try {
    return c.json(await quoteRefund(accountId, heroId), 200);
  } catch (err) {
    if (err instanceof UnknownHeroError) {
      return c.json(apiError('not_found', `No such hero: ${heroId}.`), 404);
    }
    throw err;
  }
});
