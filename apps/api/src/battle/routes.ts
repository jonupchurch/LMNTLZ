/**
 * The battle routes (007 T001).
 *
 * ### Two properties shape every route in this file
 *
 * **In-progress state is never stored.** Each request replays the append-only
 * log, applies its action, and appends — so there is no state to fetch, expire
 * or reconcile, and none of these handlers may cache anything between calls.
 *
 * **The seed never leaves the server.** Constitution XII. The resynchronisation
 * route re-derives everything on each call and carries neither the seed nor the
 * draw indices; a serialiser here that forgets is the one bug that hands a
 * player the ability to predict every roll for the rest of the battle.
 *
 * Handlers arrive with their user stories — US2 (idempotency) first, because a
 * duplicated append silently corrupts every turn after it, and that has to be
 * impossible before anything is built on top of it.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import {
  assertLegalIntent,
  currentState,
  IllegalIntentError,
  type CurrentState,
  type LiveBattle,
} from './act.js';
import { CannotStartBattleError, createBattle } from './create.js';
import { appendAction, SequenceGapError, type ActionPacket } from './idempotency.js';
import { resolveToNextChoice } from './packet.js';
import { settle } from './settle.js';
import type { SquadZone } from '../db/schema/squads.js';

/**
 * Settle a battle that has ended, if nobody has yet.
 *
 * **Called from every route that observes a conclusion, and that is the design.**
 * `settle` guards on `concluded_at IS NULL` in the same statement that writes
 * it, so extra calls cost one `UPDATE` matching zero rows. What that buys is
 * repair: a settlement interrupted by a cold serverless instance or a dropped
 * connection is completed by whatever request comes next, instead of leaving a
 * battle that finished and never paid.
 */
async function settleIfEnded(battle: LiveBattle): Promise<void> {
  if (!battle.conclusion || battle.concludedAt) return;

  await settle({
    battleId: battle.id,
    attackerId: battle.attackerId,
    defenderId: battle.defenderId,
    zone: battle.zone as SquadZone,
    conclusion: battle.conclusion,
    turnCount: battle.state.heroTurn,
    wasAmbush: battle.zone === 'hidden',
  });
}

export const battleRoutes = new Hono<AuthedEnv>();

/**
 * **Every battle route requires a session, with no exceptions to add later.**
 *
 * A battle belongs to an account: it is created by one, its rewards settle to
 * one, and its record is kept forever against one. There is no anonymous
 * variant of any of that, so the guard is declared once over the whole prefix
 * rather than per route — which is also what stops the next handler being added
 * without it.
 */
battleRoutes.use('/battles', requireSession);
battleRoutes.use('/battles/*', requireSession);

/**
 * The four ways `currentState` can refuse, mapped once.
 *
 * **`404` for both "no such battle" and "not yours."** A distinguishable
 * response would let anybody enumerate battle ids and learn who is fighting
 * whom, which is a scouting signal in a game where the whole point is not
 * knowing what the other player has.
 */
function refusal(result: CurrentState & { ok: false }) {
  switch (result.reason) {
    case 'not-found':
      return { status: 404 as const, body: apiError('not_found', 'No such battle.') };
    case 'expired':
      return {
        status: 410 as const,
        body: apiError(
          'battle_expired',
          'This battle expired after 24 hours without an action. Nothing was won or lost.',
        ),
      };
    case 'version-mismatch':
      /**
       * **Reported, never resolved** (FR-017). Continuing under a different
       * engine would produce a battle neither the log nor the player agrees
       * with, and `503` says "come back" rather than "you lost".
       */
      return {
        status: 503 as const,
        body: apiError(
          'engine_updated',
          'The game was updated while this battle was open, so it cannot be ' +
            'continued. It will be discarded and nothing will be counted.',
        ),
      };
  }
}

/**
 * Load a battle the caller is entitled to act on.
 *
 * **Ownership is checked against the session, never the path.** The battle id is
 * client-supplied and a UUID is not a secret; the attacker on the row is what
 * decides.
 */
async function loadForCaller(
  battleId: string,
  accountId: string,
): Promise<{ readonly battle: LiveBattle } | { readonly refusal: ReturnType<typeof refusal> }> {
  const result = await currentState(battleId);
  if (!result.ok) return { refusal: refusal(result) };

  if (result.battle.attackerId !== accountId) {
    return { refusal: { status: 404 as const, body: apiError('not_found', 'No such battle.') } };
  }

  return { battle: result.battle };
}

/**
 * `POST /v1/battles` — start one (T018, T019).
 *
 * **`zone` is not read from the body and there is no code path that could.**
 * `createBattle` decides it from the caller's own attack streak. A client that
 * sends one is ignored, which is the intended shape of "enforcement by absence".
 */
battleRoutes.post('/battles', async (c) => {
  const { accountId } = requireContext(c);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  const opponentId = body?.['opponentId'];
  const slot = body?.['attackSquadSlot'];

  if (typeof opponentId !== 'string' || opponentId === '') {
    return c.json(apiError('invalid_request', 'An `opponentId` is required.'), 400);
  }
  if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > 2) {
    return c.json(apiError('invalid_request', '`attackSquadSlot` must be 0, 1 or 2.'), 400);
  }

  try {
    const created = await createBattle(accountId, opponentId, slot as number);
    return c.json(
      {
        battleId: created.battleId,
        zone: created.zone,
        ambushed: created.ambushed,
        sequence: created.sequence,
        packet: created.packet,
      },
      201,
    );
  } catch (err) {
    if (err instanceof CannotStartBattleError) {
      return c.json(apiError(err.reason.replaceAll('-', '_'), err.message), 422);
    }
    throw err;
  }
});

/**
 * `POST /v1/battles/:battleId/act` — resolve one intent and everything after it
 * (T023).
 *
 * **`200` whether this resolved or replayed, and the two bodies are identical.**
 * That is the point of the whole idempotency design: a client that retried
 * cannot tell, so it has no reason to branch, and a branch is where the
 * double-advance bug would live.
 *
 * The order below is load-bearing:
 *
 * 1. re-derive from the log,
 * 2. **check legality against that state and refuse without writing** (T024),
 * 3. hand `appendAction` a thunk that resolves only if a write will happen.
 *
 * Step 2 before step 3 is what makes an illegal action leave no trace. Step 3's
 * thunk is what keeps the seed out of `idempotency.ts` entirely.
 */
battleRoutes.post('/battles/:battleId/act', async (c) => {
  const { accountId } = requireContext(c);
  const battleId = c.req.param('battleId');
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  const sequence = body?.['sequence'];
  const actorInstanceId = body?.['actorInstanceId'];
  const powerId = body?.['powerId'];
  const targetInstanceId = body?.['targetInstanceId'] ?? null;

  if (
    !Number.isInteger(sequence) ||
    (sequence as number) < 0 ||
    typeof actorInstanceId !== 'string' ||
    typeof powerId !== 'string' ||
    (targetInstanceId !== null && typeof targetInstanceId !== 'string')
  ) {
    return c.json(
      apiError('invalid_request', 'An action needs a sequence, an actor, a power and a target.'),
      400,
    );
  }

  const intent = {
    sequence: sequence as number,
    actorInstanceId,
    powerId,
    targetInstanceId: targetInstanceId as string | null,
  };

  const loaded = await loadForCaller(battleId, accountId);
  if ('refusal' in loaded) return c.json(loaded.refusal.body, loaded.refusal.status);

  const battle = loaded.battle;

  /**
   * **The sequence is settled before the intent is judged, and the order is not
   * cosmetic.**
   *
   * A client that is out of sync sends *both* a stale intent and a stale
   * sequence — it formed the move against a board several turns old. Checking
   * legality first answers `422 illegal move`, which is true of that board and
   * useless: the client's move was fine, its *history* is wrong, and `422` gives
   * it nothing to do about that. `409` with `currentSequence` says resynchronise,
   * which is the only recovery there is.
   *
   * A sequence already written is a retry and skips the check entirely — the
   * board it was legal against is in the past, and re-judging it against today's
   * would reject exactly the retries this design exists to make safe.
   */
  if (intent.sequence < battle.sequence) {
    const stored = await appendAction(battleId, intent, () => {
      throw new Error('unreachable: a written sequence never resolves');
    });
    return c.json(
      { sequence: intent.sequence, packet: stored.packet, nextSequence: intent.sequence + 1 },
      200,
    );
  }

  if (intent.sequence > battle.sequence) {
    return c.json(
      {
        ...apiError(
          'sequence_gap',
          `This battle expects action ${battle.sequence}, not ${intent.sequence}. ` +
            'Re-read the battle and continue from there.',
        ),
        currentSequence: battle.sequence,
      },
      409,
    );
  }

  try {
    assertLegalIntent(battle, intent);

    const result = await appendAction(battleId, intent, () => {
      const resolved = resolveToNextChoice(
        battle.seed,
        battle.state,
        intent,
        battle.drawIndex,
        battle.configs,
      );

      return {
        packet: resolved.packet,
        drawIndexBefore: battle.drawIndex,
        drawsConsumed: resolved.drawsConsumed,
      };
    });

    /**
     * **Settlement is awaited, not fired and forgotten.** A serverless function
     * is frozen the moment its response is returned, so a promise left running
     * here is a promise that may never finish — and the thing it was finishing
     * is the record every aggregate is computed from.
     */
    if (result.packet.conclusion) {
      await settle({
        battleId: battle.id,
        attackerId: battle.attackerId,
        defenderId: battle.defenderId,
        zone: battle.zone as SquadZone,
        conclusion: result.packet.conclusion,
        turnCount: result.packet.state.heroTurn,
        wasAmbush: battle.zone === 'hidden',
      });
    }

    return c.json(
      {
        sequence: intent.sequence,
        packet: result.packet satisfies ActionPacket,
        nextSequence: intent.sequence + 1,
      },
      200,
    );
  } catch (err) {
    if (err instanceof SequenceGapError) {
      return c.json(
        { ...apiError(err.code, err.message), currentSequence: err.currentSequence },
        409,
      );
    }
    if (err instanceof IllegalIntentError) {
      return c.json(apiError(err.reason.replaceAll('-', '_'), err.message), 422);
    }
    throw err;
  }
});

/**
 * `GET /v1/battles/:battleId` — the resynchronisation route (T025).
 *
 * **Re-derived on every call, and it carries neither the seed nor a draw
 * index.** Those live on `LiveBattle` and are named explicitly here rather than
 * spread, so adding a field to that interface cannot silently add it to this
 * response. A spread would have been shorter and is precisely the shape of the
 * bug: the seed would then leave the server the day somebody widened the type.
 */
battleRoutes.get('/battles/:battleId', async (c) => {
  const { accountId } = requireContext(c);
  const loaded = await loadForCaller(c.req.param('battleId'), accountId);
  if ('refusal' in loaded) return c.json(loaded.refusal.body, loaded.refusal.status);

  const { battle } = loaded;

  /**
   * **A read that repairs.** Ordinarily settlement happens on the final `act`;
   * this catches the battle whose last request died between the append and the
   * payout. Guarded to a no-op when there is nothing to do, so a `GET` on an
   * ordinary battle in progress writes nothing.
   */
  await settleIfEnded(battle);

  return c.json({
    battleId: battle.id,
    zone: battle.zone,
    sequence: battle.sequence,
    state: battle.state,
    conclusion: battle.conclusion,
    startedAt: battle.startedAt.toISOString(),
    concludedAt: battle.concludedAt?.toISOString() ?? null,
  });
});
