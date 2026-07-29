/**
 * Re-deriving a battle from its log (007 T020).
 *
 * ### There is no stored state, so every request replays
 *
 * `battles` has no `current_hp` column and never will. `currentState` rebuilds
 * the board from the frozen snapshots and the append-only action log on **every**
 * call — `act`, `GET`, the expiry job, all of them. One source of truth, no
 * cache, no TTL, no invalidation to get wrong, and state that cannot drift from
 * the log because there is no state *to* drift.
 *
 * ### What the replay drives from, and the claim that was too strong
 *
 * Each stored packet carries the intent behind every turn it folded, engine
 * turns included. It is tempting to say that a replay therefore never runs the
 * defense AI — **it does, and it has to.**
 *
 * The obstacle is draw accounting. `decideAction` spends draws breaking
 * targeting ties, and those draws sit *between* the resolution draws of one turn
 * and the next. Skipping the decision would leave every later resolution reading
 * indices the original battle had already spent, and the replay would produce a
 * coherent battle that is not the one that was fought. Recording a per-event
 * draw cursor would fix that — and the packet is handed back to the client
 * verbatim on a retry, so a draw index inside an event is a draw index on the
 * wire, which is the one thing T017 exists to forbid.
 *
 * So the fold is re-run, and the recorded intents become a **check** rather than
 * the authority. That is a weaker claim than "the AI never runs twice", and it is
 * the true one. Two things make it safe:
 *
 * - **The version stamps gate it.** A battle whose `engineVersion` or
 *   `contentVersion` no longer matches the running build is refused here rather
 *   than replayed — which is exactly why FR-007 asks for `versionMismatch` as a
 *   result and not as an exception. Re-derivation is only ever attempted against
 *   the engine that produced it.
 * - **Divergence is loud.** `drawIndexBefore` and `drawsConsumed` were recorded
 *   per action, and the replay recomputes both. A ranking function that answered
 *   differently would move the draw cursor, and the mismatch throws instead of
 *   quietly handing back a different battle.
 *
 * Concluded battles are never replayed at all: their replay artifact is a stored
 * event log that is played back and never re-simulated (Constitution XVI), so a
 * balance patch is structurally unable to change a past battle's outcome.
 */

import { asc, eq } from 'drizzle-orm';
import { contentVersion } from '@lmntlz/content';
import {
  engineVersion,
  legalTargets,
  sideOfRow,
  type BattleState,
  type Conclusion,
} from '@lmntlz/sim/rules';
import type { ActionIntent, Seed } from '@lmntlz/sim/resolver';
import { db } from '../db/client.js';
import { battleActions, battles } from '../db/schema/battles.js';
import { buildInitialState } from './board.js';
import { expiryMs } from './expiry.js';
import { usablePowers } from './choicePoint.js';
import { openingPacket, resolveToNextChoice, type DefenderConfigs } from './packet.js';
import { decodeSeed } from './seedStore.js';
import {
  configsOf,
  parseAttackerSnapshot,
  parseDefenderSnapshot,
  type AttackerSnapshot,
  type DefenderSnapshot,
} from './snapshot.js';

/**
 * How long an untouched battle stays open.
 *
 * **A window, not a deadline from the start.** A player who is actively
 * fighting never meets it; a player who walked away meets it 24 hours after
 * they walked away. The value lives in `expiry.ts` because the sweep and this
 * check must agree — two copies of the number is how a battle gets refused here
 * and left behind by the job, or the reverse.
 */
export { expiryMs };

/** Everything a request needs about a battle in flight. Never serialised whole. */
export interface LiveBattle {
  readonly id: string;
  readonly attackerId: string | null;
  readonly defenderId: string | null;
  readonly defenderIsBot: boolean;
  readonly zone: string;
  /**
   * **Present, and structurally unable to reach a response.** `Seed.toJSON`
   * throws, so a handler that spread this object into `c.json` fails loudly
   * rather than leaking every roll for the rest of the battle.
   */
  readonly seed: Seed;
  readonly attacker: AttackerSnapshot;
  readonly defender: DefenderSnapshot;
  readonly configs: DefenderConfigs;
  readonly state: BattleState;
  readonly conclusion: Conclusion | null;
  /** The sequence the next action must carry: one past the highest written. */
  readonly sequence: number;
  /** Where the next packet's draws begin. Server-only, like the seed. */
  readonly drawIndex: bigint;
  readonly startedAt: Date;
  readonly concludedAt: Date | null;
  /** The clock expiry runs against: the last action, or the start if there is none. */
  readonly lastActivityAt: Date;
}

export type CurrentState =
  | { readonly ok: true; readonly battle: LiveBattle }
  | { readonly ok: false; readonly reason: 'not-found' }
  | { readonly ok: false; readonly reason: 'expired'; readonly attackerId: string | null }
  | {
      readonly ok: false;
      readonly reason: 'version-mismatch';
      readonly field: 'engine' | 'content';
      readonly was: string;
      readonly now: string;
      /**
       * **Carried so the caller can check ownership before acting on this.**
       *
       * A version mismatch ends in a discard, and a discard deletes a row. If
       * that ran before the caller knew whose battle it was, anybody could
       * enumerate ids and destroy other players' battles in flight — a
       * refusal that is safe to return to a stranger is not the same as an
       * action that is safe to take for one.
       */
      readonly attackerId: string | null;
    };

/**
 * The replay produced a different battle from the one on record.
 *
 * **Unreachable if the version stamps are doing their job**, which is why it
 * throws rather than degrading. The alternative — carrying on with the
 * re-derived state — hands the player a plausible battle that is not theirs, and
 * nothing downstream would ever notice.
 */
export class ReplayDivergenceError extends Error {
  constructor(battleId: string, sequence: number, detail: string) {
    super(
      `battle ${battleId} diverged replaying action ${sequence}: ${detail}. ` +
        'The engine version stamp says this build resolved it; it no longer does.',
    );
    this.name = 'ReplayDivergenceError';
  }
}

/**
 * Rebuild a battle from `(seed, snapshots, log)`.
 *
 * Checked in this order, and the order matters: **a version mismatch is reported
 * before the replay is attempted**, because attempting it is the failure. Expiry
 * comes first of all, since an expired battle is not going to be resolved either
 * way and replaying it is wasted work.
 */
/**
 * How slow a replay has to be before it is worth a log line.
 *
 * Measured over a full battle on 2026-07-29: **~70ms per request, and only 1.1×
 * from the first ten to the last ten** across 81 actions — the two database
 * round trips dominate, not the fold. So anything past this is a battle that has
 * grown beyond what the design assumes, which is the signal worth having.
 */
const REPLAY_WARN_MS = 400;

export async function currentState(battleId: string, now: Date = new Date()): Promise<CurrentState> {
  const startedReplayAt = Date.now();
  const rows = await db().select().from(battles).where(eq(battles.id, battleId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: 'not-found' };

  const log = await db()
    .select()
    .from(battleActions)
    .where(eq(battleActions.battleId, battleId))
    .orderBy(asc(battleActions.sequence));

  const lastActivityAt = log[log.length - 1]?.createdAt ?? row.startedAt;

  /**
   * **A concluded battle never expires.** It is history, and history is kept
   * forever (Constitution XVI). Only an open battle has a window to miss.
   */
  if (!row.concludedAt && now.getTime() - lastActivityAt.getTime() > expiryMs()) {
    return { ok: false, reason: 'expired', attackerId: row.attackerId };
  }

  const engineNow = engineVersion();
  if (row.engineVersion !== engineNow) {
    return {
      ok: false,
      reason: 'version-mismatch',
      field: 'engine',
      was: row.engineVersion,
      now: engineNow,
      attackerId: row.attackerId,
    };
  }

  const contentNow = contentVersion();
  if (row.contentVersion !== contentNow) {
    return {
      ok: false,
      reason: 'version-mismatch',
      field: 'content',
      was: row.contentVersion,
      now: contentNow,
      attackerId: row.attackerId,
    };
  }

  const attacker = parseAttackerSnapshot(row.attackerSquad);
  const defender = parseDefenderSnapshot(row.defenderSnapshot);
  const configs = configsOf(defender);
  const seed = decodeSeed(battleId, row.seed);

  const versions = { engineVersion: row.engineVersion, contentVersion: row.contentVersion };
  let state = buildInitialState(attacker.seats, defender.seats, versions);
  let drawIndex = 0n;

  /**
   * **The opening fold is re-derived, not stored.** A battle does not begin with
   * the player acting — whoever turn order puts first may be a defender, and
   * several turns may resolve before anybody is asked anything. Those turns are
   * a function of `(seed, snapshots)` alone, so writing them as a row would
   * store something derivable and give action 0 two possible meanings.
   */
  const opening = openingPacket(seed, state, drawIndex, configs);
  state = opening.packet.state;
  let conclusion = opening.packet.conclusion;
  drawIndex += opening.drawsConsumed;

  for (const action of log) {
    if (conclusion) {
      throw new ReplayDivergenceError(battleId, action.sequence, 'the battle had already ended');
    }
    if (action.drawIndexBefore !== drawIndex) {
      throw new ReplayDivergenceError(
        battleId,
        action.sequence,
        `draws begin at ${drawIndex}, recorded ${action.drawIndexBefore}`,
      );
    }

    const intent: ActionIntent = {
      sequence: action.sequence,
      actorInstanceId: action.actorInstanceId,
      powerId: action.powerId,
      targetInstanceId: action.targetInstanceId,
    };

    const result = resolveToNextChoice(seed, state, intent, drawIndex, configs);

    /**
     * **The cheapest divergence signal there is.** Every draw the original
     * battle spent is accounted for in this one number; a defense AI that broke
     * a tie differently, a rider that rolled where it used to be certain, or a
     * turn that folded where it used to stop all move it.
     */
    if (result.drawsConsumed !== action.drawsConsumed) {
      throw new ReplayDivergenceError(
        battleId,
        action.sequence,
        `consumed ${result.drawsConsumed} draws, recorded ${action.drawsConsumed}`,
      );
    }

    state = result.packet.state;
    conclusion = result.packet.conclusion;
    drawIndex += result.drawsConsumed;
  }

  /**
   * **The number that decides whether no-stored-state stays correct** (T048).
   *
   * Every request replays the whole log, so cost is quadratic in the action
   * count by construction. That is a known, accepted trade — one source of
   * truth, no cache, no invalidation — and the thing that would change the
   * answer is a battle long enough that the replay stops being cheap.
   *
   * Recorded from the first battle ever fought rather than added when somebody
   * notices latency, because by then there is nothing to compare against.
   * `console.info` is the whole implementation: Vercel captures stdout, and a
   * metrics vendor for one number would be a vendor to price, gate and mock.
   * The threshold keeps a healthy battle silent so the log means something.
   */
  const replayMs = Date.now() - startedReplayAt;
  if (replayMs > REPLAY_WARN_MS) {
    console.info(
      `[replay] battle=${battleId} actions=${log.length} turns=${state.heroTurn} ms=${replayMs}`,
    );
  }

  return {
    ok: true,
    battle: {
      id: row.id,
      attackerId: row.attackerId,
      defenderId: row.defenderId,
      defenderIsBot: row.defenderIsBot,
      zone: row.zone,
      seed,
      attacker,
      defender,
      configs,
      state,
      conclusion,
      sequence: log.length === 0 ? 0 : log[log.length - 1]!.sequence + 1,
      drawIndex,
      startedAt: row.startedAt,
      concludedAt: row.concludedAt,
      lastActivityAt,
    },
  };
}

// ---------------------------------------------------------------------------
// T024 — refusing an illegal intent, and appending nothing when it is refused
// ---------------------------------------------------------------------------

export type IllegalReason =
  | 'battle-over'
  | 'not-your-turn'
  | 'not-your-hero'
  | 'unknown-hero'
  | 'power-unavailable'
  | 'illegal-target';

/**
 * The intent cannot be resolved against this board.
 *
 * **Thrown before `appendAction`, so nothing is written.** That ordering is the
 * whole task: an illegal action that reached the log would be replayed on every
 * subsequent request, and there is no way to remove a row from an append-only
 * log without rewriting history that other rows are keyed against.
 */
export class IllegalIntentError extends Error {
  readonly reason: IllegalReason;

  constructor(reason: IllegalReason, message: string) {
    super(message);
    this.name = 'IllegalIntentError';
    this.reason = reason;
  }
}

/**
 * Check an intent against the re-derived board.
 *
 * **The client is not trusted about any of it** — not whose turn it is, not
 * whether a power is off cooldown, not whether a target is in reach. Every
 * answer comes from the state this server just rebuilt from the log.
 *
 * Refusal is deliberately *not* silent correction. Resolving the nearest legal
 * move instead would hide a client bug behind a battle that played itself, and
 * the player would watch their champion do something they did not ask for.
 */
export function assertLegalIntent(battle: LiveBattle, intent: ActionIntent): void {
  if (battle.conclusion) {
    throw new IllegalIntentError('battle-over', 'This battle has already finished.');
  }

  if (battle.state.turnOfInstance !== intent.actorInstanceId) {
    throw new IllegalIntentError(
      'not-your-turn',
      `It is ${battle.state.turnOfInstance ?? 'nobody'}'s turn, not ${intent.actorInstanceId}'s.`,
    );
  }

  const hero = battle.state.heroes.find((h) => h.instanceId === intent.actorInstanceId);
  if (!hero) {
    throw new IllegalIntentError('unknown-hero', `No hero ${intent.actorInstanceId} in this battle.`);
  }

  /**
   * **A backstop against a broken fold, not against a crafted request.**
   *
   * Worth being exact about: a packet only ever stops at an attacker choice
   * point, so `turnOfInstance` is always an attacker and the turn check above
   * already refuses every defender id a client could send. This branch is
   * unreachable while `packet.ts` is correct.
   *
   * It stays because the day it *is* reachable, the packet boundary has broken
   * in a way that hands the attacker control of the squad defending against
   * them — and that failure should be a `422` rather than a resolved turn.
   */
  if (sideOfRow(hero.row) !== 'attacker') {
    throw new IllegalIntentError(
      'not-your-hero',
      `${intent.actorInstanceId} is defending. The engine plays every defense squad.`,
    );
  }

  /**
   * **`usablePowers`, not "does the hero own it".** Cooldowns and tier gates are
   * both in here, and so is "the power has somewhere to point" — the same
   * predicate the packet boundary used to decide this was a choice at all, so
   * the set the player was offered and the set the server accepts are the same
   * set by construction.
   */
  const usable = usablePowers(battle.state, intent.actorInstanceId);
  if (!usable.some((power) => power.id === intent.powerId)) {
    throw new IllegalIntentError(
      'power-unavailable',
      `${intent.powerId} is on cooldown, still gated, or has no legal target.`,
    );
  }

  const targeting = legalTargets(battle.state, intent.actorInstanceId, intent.powerId);

  /**
   * **A compulsion overrides the request rather than filtering it.** A taunted
   * hero has exactly one legal target, and a client that offered the old list
   * must be told no — not quietly redirected, which would look like the taunt
   * had failed.
   */
  const allowed = targeting.compelled !== null ? [targeting.compelled] : targeting.candidates;
  if (intent.targetInstanceId === null || !allowed.includes(intent.targetInstanceId)) {
    throw new IllegalIntentError(
      'illegal-target',
      `${intent.targetInstanceId ?? 'no target'} is not a legal target for ${intent.powerId}.`,
    );
  }
}
