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
import { contentVersion } from '@lmntlz/content';
import { engineVersion, type Conclusion, type Side } from '@lmntlz/sim/rules';
import { requireSession } from '../auth/middleware.js';
import { writeReplayBlob } from '../replays/record.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import {
  assertLegalIntent,
  currentState,
  expiryMs,
  IllegalIntentError,
  type CurrentState,
  type LiveBattle,
} from './act.js';
import {
  BattleAlreadyOpenError,
  CannotStartBattleError,
  createBattle,
  openBattleFor,
} from './create.js';
import { disclosePacket } from './disclose.js';
import { appendAction, SequenceGapError, type ActionPacket } from './idempotency.js';

/**
 * **Whose eyes these routes answer for.**
 *
 * Every one of them is behind `requireSession` and refuses a battle the caller
 * does not attack — `act.ts` checks `row.attackerId` — so the viewer is always
 * the attacking side. Named rather than inlined because it is a *fact about who
 * is asking*, and the day a spectator or a defender's review can read a packet,
 * this is the line that has to change rather than three call sites.
 */
const VIEWER: Side = 'attacker';
import { expiryHours } from './expiry.js';
import { resolveToNextChoice } from './packet.js';
import { discard, settle } from './settle.js';
import {
  canAct,
  canStartBattle,
  maintenanceState,
  MAINTENANCE_MESSAGE,
} from './maintenance.js';
import type { SquadZone } from '../db/schema/squads.js';
import { wasAmbushed } from '../squads/ambush.js';

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
/**
 * What the requesting player walked away with, or `null` when this request did
 * not settle the battle (`specs/GAPS.md` §2c).
 *
 * **Projected for the caller, never both sides.** A settlement moves two
 * players' shards and two ratings; sending the defender's payout to the attacker
 * would tell them exactly how much the person they just beat earns per hold,
 * which is a fact about somebody else's account. Constitution XVII: storing is
 * not exposing.
 */
export interface BattleSettlementWire {
  readonly winner: 'attacker' | 'defender';
  /** True when the requester is the one who won. */
  readonly won: boolean;
  readonly shards: number;
  readonly shardsEarned: number;
  readonly cappedAt: number | null;
  /**
   * How much of `shards` was the streak reward (2026-08-01).
   *
   * **The requester's own, never the opponent's.** A defender learning the
   * bounty learns the attacker's exact streak, which they may already scout; an
   * attacker learning the bounty *paid* would learn a fact about somebody else's
   * balance. Each side is told only its own number, like every other field here.
   */
  readonly streakShards: number;
  readonly ratingDelta: number;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  /** Consecutive attack wins after this battle — what drives the ambush odds. */
  readonly attackStreak: number;
  readonly holdStreak: number;
  readonly turnCount: number;
  readonly zone: SquadZone;
}

async function settleAndRecord(
  battle: LiveBattle,
  conclusion: Conclusion,
  turnCount: number,
  /** Who is asking, so the payout can be projected onto their side. */
  viewerId?: string,
): Promise<BattleSettlementWire | null> {
  const result = await settle({
    battleId: battle.id,
    attackerId: battle.attackerId,
    defenderId: battle.defenderId,
    zone: battle.zone,
    conclusion,
    turnCount,
    wasAmbush: wasAmbushed(battle.zone),
  });

  /**
   * **The replay blob, after the commit and only for the request that settled.**
   *
   * Two separate conditions, both load-bearing:
   *
   * - **After** `settle` returns, so the transaction is closed. A blob write is a
   *   network call to a third party; holding a Postgres transaction across it
   *   would turn a Blob outage into an inability to finish battles.
   * - Only when `settled` is true. Settlement is called by every request that
   *   observes a conclusion — the final `act`, a retry of it, a later `GET` — and
   *   all but the first match zero rows. Writing the blob on each of those would
   *   re-upload the same 5 KB for every subsequent read of a finished battle.
   *
   * `writeReplayBlob` never throws for an ordinary failure, so no `catch` here:
   * the battle is over and the only thing left to lose is the ability to watch
   * it, which is the same outcome as expiry.
   */
  if (result.settled) {
    await writeReplayBlob({
      battleId: battle.id,
      engineVersion: engineVersion(),
      contentVersion: contentVersion(),
      openingEvents: battle.openingEvents,
      conclusion,
    });
  }

  /**
   * **The return value, which four features never read.**
   *
   * `settle` has always computed all of this; this function read `result.settled`
   * to decide whether to write a replay blob and discarded the rest. So a player
   * won, was paid, had their rating moved — and the screen said `Victory` and
   * nothing else.
   */
  if (!viewerId) return null;

  const side: 'attacker' | 'defender' | null =
    battle.attackerId === viewerId ? 'attacker' : battle.defenderId === viewerId ? 'defender' : null;
  if (!side) return null;

  const payout = side === 'attacker' ? result.attacker : result.defender;
  /* `null` on a repair pass — see `SettleResult`. Zeroes here would print
     "0 shards" over a battle that paid 60. */
  if (!payout) return null;

  return {
    winner: result.winner,
    won: result.winner === side,
    shards: payout.shards,
    shardsEarned: payout.shardsEarned,
    cappedAt: payout.cappedAt,
    streakShards: payout.streakShards,
    ratingDelta: payout.ratingDelta,
    ratingBefore: payout.ratingBefore,
    ratingAfter: payout.ratingAfter,
    attackStreak: result.attackStreak,
    holdStreak: result.holdStreak,
    turnCount,
    zone: battle.zone,
  };
}

/**
 * The `GET` variant: settle only if this battle has ended and nobody has yet.
 *
 * **Both callers go through `settleAndRecord`, and that is the whole reason this
 * wrapper exists rather than a second `settle` call.** The two used to be
 * separate — the `act` route settled inline and only the `GET` used a helper —
 * and adding the replay write to the helper therefore reached the *repair* path
 * while missing the path that settles every real battle. Every battle got a
 * record and none got a replay, and nothing failed: the record is what the game
 * reads, so the gap was invisible until a test opened the blob store and found it
 * empty.
 *
 * A second call site for an operation that keeps acquiring steps is a defect
 * waiting for the next step.
 */
async function settleIfEnded(
  battle: LiveBattle,
  viewerId?: string,
): Promise<BattleSettlementWire | null> {
  if (!battle.conclusion || battle.concludedAt) return null;
  return settleAndRecord(battle, battle.conclusion, battle.state.heroTurn, viewerId);
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
          `This battle expired after ${expiryHours()} hours without an action. ` +
            'Nothing was won or lost.',
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
            'continued. It has been discarded — no win, no loss, nothing counted.',
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

  if (!result.ok) {
    /**
     * **Ownership is checked before the discard, and that ordering is a
     * security property rather than tidiness.** A refusal is safe to hand a
     * stranger; the *action* attached to it is not. Discarding first would let
     * anybody enumerate battle ids and destroy other players' fights in flight
     * — and because a discard is a complete no-op, the victim would see their
     * battle simply cease to exist with nothing recorded anywhere.
     */
    const mine = result.reason === 'not-found' || result.attackerId === accountId;

    if (mine && result.reason === 'expired') {
      /**
       * **Discarded on the player's own next touch, not only by the job.**
       *
       * `expiry.ts` sweeps the battles nobody comes back to; this handles the
       * one somebody *does* come back to, and it matters because the two
       * answers differ. Left for the job, a returning player would get `410`
       * now and `404` after the next sweep — the same event described two ways
       * depending on timing. Discarding here makes it `410` once and `404`
       * thereafter, which is at least a story.
       */
      await discard(battleId, 'expired', result.attackerId);
    }

    if (mine && result.reason === 'version-mismatch') {
      /**
       * **Reported, never resolved** (FR-017), and then discarded rather than
       * left. The battle is genuinely unresolvable — its engine no longer
       * exists — so "come back later" would be a lie about a fight that will
       * never work again. The discard is total, so nothing is lost by taking
       * it now rather than waiting 24 hours for expiry to do the same thing.
       */
      await discard(battleId, 'engine-version', result.attackerId);
    }

    return { refusal: refusal(result) };
  }

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

  /**
   * **Checked before anything is read, let alone written.** A `draining` window
   * refuses new battles and lets open ones finish (FR-015); `down` refuses
   * both. The order matters only in that a refusal must cost nothing — a
   * request that snapshotted two squads and minted a seed before noticing the
   * window would leave a battle row nobody can play.
   */
  const maintenance = await maintenanceState();
  if (!canStartBattle(maintenance)) {
    return c.json(
      apiError('maintenance', MAINTENANCE_MESSAGE[maintenance as 'draining' | 'down']),
      503,
    );
  }

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
        packet: disclosePacket(created.packet, VIEWER),
      },
      201,
    );
  } catch (err) {
    /**
     * **`409` carrying the open battle's id, which is why "resume" needs no
     * separate concept.** The client that gets this already knows where to go.
     */
    if (err instanceof BattleAlreadyOpenError) {
      return c.json(
        { ...apiError('battle_already_open', err.message), openBattleId: err.openBattleId },
        409,
      );
    }
    if (err instanceof CannotStartBattleError) {
      return c.json(apiError(err.reason.replaceAll('-', '_'), err.message), 422);
    }
    throw err;
  }
});

/**
 * `GET /v1/battles/open` — resume, or `204`.
 *
 * The other half of the one-at-a-time rule: a client that reconnects needs to
 * know whether it is mid-battle, and this is the question with no id to ask it
 * about.
 */
battleRoutes.get('/battles/open', async (c) => {
  const { accountId } = requireContext(c);
  const battleId = await openBattleFor(accountId);
  if (!battleId) return c.body(null, 204);

  const loaded = await loadForCaller(battleId, accountId);
  /**
   * **An expired open battle is discarded by the load above and reported as
   * nothing here.** Answering `410` to "do I have a battle?" would be strange —
   * the honest answer to that question is no.
   */
  if ('refusal' in loaded) return c.body(null, 204);

  return c.json({
    battleId: loaded.battle.id,
    startedAt: loaded.battle.startedAt.toISOString(),
    expiresAt: new Date(loaded.battle.lastActivityAt.getTime() + expiryMs()).toISOString(),
  });
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

  /**
   * **`draining` still resolves this**, which is the whole point of having a
   * third state. Only `down` refuses an action, and a battle refused here is
   * not lost — it stays open and its 24-hour window is untouched.
   */
  const maintenance = await maintenanceState();
  if (!canAct(maintenance)) {
    return c.json(apiError('maintenance', MAINTENANCE_MESSAGE.down), 503);
  }

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
      /**
       * **The replayed path redacts too, and it is the one easiest to miss.**
       * This packet was read back out of the idempotency table, where it is
       * stored *unredacted* on purpose: storing is not exposing, and that row is
       * what an investigation reads. A retry that disclosed more than the
       * original response would make the leak reachable by simply asking twice.
       */
      {
        sequence: intent.sequence,
        packet: disclosePacket(stored.packet, VIEWER),
        nextSequence: intent.sequence + 1,
      },
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
    const settlement = result.packet.conclusion
      ? await settleAndRecord(
          battle,
          result.packet.conclusion,
          result.packet.state.heroTurn,
          accountId,
        )
      : null;

    return c.json(
      {
        sequence: intent.sequence,
        packet: disclosePacket(result.packet satisfies ActionPacket, VIEWER),
        nextSequence: intent.sequence + 1,
        /**
         * **The one request that can ever say this.** The amounts are not
         * persisted, so the final `act` is the only response that knows them —
         * see `SettleResult`. Omitted rather than nulled on an ordinary turn, so
         * the client's check is "is it here" rather than "is it truthy".
         */
        ...(settlement ? { settlement } : {}),
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
  const settlement = await settleIfEnded(battle, accountId);

  return c.json({
    battleId: battle.id,
    zone: battle.zone,
    /**
     * **The one field the resume path was missing** — and its absence was not
     * cosmetic. `POST /battles` announces the ambush; this route did not carry
     * the fact at all, so the client hardcoded `false` and a single reload
     * erased the only notice a player ever received that the squad in front of
     * them was the Hidden six. Derived from the same helper as `create.ts` so
     * the two answers cannot diverge.
     */
    ambushed: wasAmbushed(battle.zone),
    sequence: battle.sequence,
    state: battle.state,
    conclusion: battle.conclusion,
    startedAt: battle.startedAt.toISOString(),
    concludedAt: battle.concludedAt?.toISOString() ?? null,
    /**
     * Present only when **this** request is what settled the battle — the repair
     * case where the final `act` died between appending the action and paying.
     * A `GET` on a battle somebody already settled omits it, because the amounts
     * are gone; see `SettleResult`. That is the follow-up in `specs/GAPS.md`.
     */
    ...(settlement ? { settlement } : {}),
  });
});
