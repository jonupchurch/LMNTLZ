/**
 * The turn engine (007, feeding T020 and T022).
 *
 * ### Why this lives here and not in `packages/sim`
 *
 * Three packages each own a piece of a turn and **none of them owns the loop**:
 *
 * | | Owns | Does not own |
 * |---|---|---|
 * | `sim/rules` | pure predicates — reach, targeting, cooldown arithmetic, endings | anything that changes state |
 * | `sim/resolver` | one intent resolved against a state, draws counted | accumulators, cooldowns, statuses, `heroTurn` |
 * | `sim/ai` | which power and which target a defender picks | when it is that defender's turn |
 *
 * `resolveOne` touches **only HP**. It does not drain an accumulator, does not
 * put the power it just fired on cooldown, and does not advance the turn
 * counter — which is correct for a primitive and means somebody has to do those
 * things. That somebody is this file.
 *
 * It sits in `apps/api` because it consumes randomness, so Constitution XII
 * puts it server-side, and because **the client never needs it**: replays are
 * stored event logs and are never re-simulated (XVI), and the only forward
 * projection the client makes is the turn queue, which `sim/rules` already
 * exports as a pure function.
 *
 * ### A tick is internal; the player sees a queue
 *
 * Every standing hero gains `50 + Speed` per tick and acts at 100. **The
 * accumulator is drained in a loop, never tested once** — a hero fast enough to
 * cross 200 in one tick acts twice, and a single `if` would silently give the
 * fastest champions fewer turns than their Speed paid for.
 */

import { getHero } from '@lmntlz/content';
import {
  afterTick,
  battleEnded,
  cooldownsAfterResolution,
  gainPerTick,
  heroStateOf,
  isIncapacitated,
  isStanding,
  type BattleState,
  type Conclusion,
  type HeroState,
} from '@lmntlz/sim/rules';
import { resolveOne, type ActionIntent, type ResolvedPacket, type Seed } from '@lmntlz/sim/resolver';

/**
 * **A hard ceiling on ticks between two hero turns.**
 *
 * Every standing hero gains at least `TICK_BASE` per tick, so somebody reaches
 * 100 within a handful. A bound is here anyway because the alternative to a
 * loop that cannot terminate is a serverless function that runs until the
 * platform kills it, and the request that triggered it looks like a timeout
 * rather than a bug.
 */
const MAX_TICKS_BETWEEN_TURNS = 64;

export class BattleStalledError extends Error {
  constructor() {
    super('no hero reached the act threshold within the tick bound');
    this.name = 'BattleStalledError';
  }
}

/**
 * Advance the clock until somebody acts, and hand back who — with the board
 * already carrying the new accumulators.
 *
 * **Ordering when several heroes cross at once** matches `turnQueue`'s
 * projection exactly: more acts first, then the higher accumulator, then board
 * order. The player is shown that queue and plans against it, so an engine that
 * ordered ties differently would be quietly lying on every screen.
 */
export function nextActor(
  state: BattleState,
): { readonly state: BattleState; readonly instanceId: string } | null {
  const standing = state.heroes.filter(isStanding);
  if (standing.length === 0) return null;

  let accumulators = new Map(standing.map((h) => [h.instanceId, h.accumulator]));
  const order = new Map(standing.map((h, i) => [h.instanceId, i]));
  const gains = new Map(standing.map((h) => [h.instanceId, gainPerTick(h)]));

  for (let tick = 0; tick <= MAX_TICKS_BETWEEN_TURNS; tick++) {
    const ready = [...accumulators]
      .map(([instanceId, accumulator]) => ({
        instanceId,
        accumulator,
        acts: Math.floor(accumulator / 100),
      }))
      .filter((r) => r.acts > 0)
      .sort(
        (a, b) =>
          b.acts - a.acts ||
          b.accumulator - a.accumulator ||
          order.get(a.instanceId)! - order.get(b.instanceId)!,
      );

    const actor = ready[0];

    /**
     * **The clock only moves when nobody can act.**
     *
     * Ticking unconditionally and letting one hero act per tick is the version
     * that looks right and is not: every hero gains on every tick while only
     * one spends, so the pool grows without bound and turns stop being
     * proportional to Speed. Measured, that mistake gave the fastest champion
     * **2.82×** the slowest one's turns against a designed ceiling of 1.92×.
     *
     * With the tick conditional, the arithmetic is forced: over `T` ticks the
     * board gains `T · Σgain` and spends `100` per turn, so a hero's share of
     * turns is exactly its share of gain — which is what `50 + Speed` was
     * chosen to bound.
     */
    if (!actor) {
      accumulators = new Map(
        [...accumulators].map(([id, value]) => [id, value + gains.get(id)!] as const),
      );
      continue;
    }

    /**
     * **Only the actor's accumulator is drained**, by exactly 100. Everybody
     * else keeps what they gained, which is what makes a fast hero's second
     * turn arrive before a slow hero's first — and what makes the drain a loop
     * across turns rather than a reset.
     */
    accumulators.set(actor.instanceId, actor.accumulator - 100);

    return {
      state: {
        ...state,
        heroes: state.heroes.map((h) =>
          accumulators.has(h.instanceId)
            ? { ...h, accumulator: accumulators.get(h.instanceId)! }
            : h,
        ),
        turnOfInstance: actor.instanceId,
      },
      instanceId: actor.instanceId,
    };
  }

  throw new BattleStalledError();
}

/**
 * Everything after the payload lands: **Resolution, which is unconditional.**
 *
 * A hero that lost its whole turn to crowd control still reaches this, so its
 * cooldowns still tick — skipping it would make a one-turn stun cost two.
 *
 * Three things happen here and `resolveOne` does none of them:
 *
 * 1. the fired power goes **on** cooldown,
 * 2. every cooldown the hero holds ticks **down** one turn,
 * 3. the hero's statuses lose a turn, and expired ones are dropped.
 *
 * Order matters: the tick runs first and the new cooldown is written after, or
 * a power with a 3-turn cooldown would come back after 2.
 */
export function applyResolution(
  state: BattleState,
  instanceId: string,
  firedPowerId: string | null,
): BattleState {
  const hero = heroStateOf(state, instanceId);
  const ticked = { ...cooldownsAfterResolution(state, instanceId) };

  if (firedPowerId) {
    const power = getHero(hero.heroId).powers.find((p) => p.id === firedPowerId);
    if (power && power.cooldown > 0) ticked[firedPowerId] = power.cooldown;
  }

  const statuses = hero.statuses
    .map((s) => ({ ...s, turnsRemaining: s.turnsRemaining - 1 }))
    .filter((s) => s.turnsRemaining > 0);

  return {
    ...state,
    heroes: state.heroes.map((h) =>
      h.instanceId === instanceId ? { ...h, cooldowns: ticked, statuses } : h,
    ),
    /**
     * **Counted per hero turn, not per round**, because that is what the tier
     * gates and the 300-turn cap are both measured in.
     */
    heroTurn: state.heroTurn + 1,
  };
}

export interface TakenTurn {
  readonly state: BattleState;
  readonly outcome: ResolvedPacket;
  readonly drawsConsumed: bigint;
}

/**
 * One whole hero turn: resolve the intent, then run Resolution.
 *
 * **An incapacitated hero skips straight to Resolution** and consumes no draws
 * — it reached the end of its turn without acting, which is different from
 * passing and different again from being skipped.
 */
export function takeTurn(
  seed: Seed,
  state: BattleState,
  intent: ActionIntent,
  drawIndex: bigint,
): TakenTurn {
  const hero = heroStateOf(state, intent.actorInstanceId);

  if (isIncapacitated(hero)) {
    return {
      state: applyResolution(state, intent.actorInstanceId, null),
      outcome: passOutcome(state),
      drawsConsumed: 0n,
    };
  }

  const resolved = resolveOne(seed, state, intent, drawIndex);

  return {
    state: applyResolution(resolved.state, intent.actorInstanceId, intent.powerId),
    outcome: resolved.packet,
    drawsConsumed: resolved.drawsConsumed,
  };
}

/** A turn where nothing happened. Still a turn; still reaches Resolution. */
function passOutcome(state: BattleState): ResolvedPacket {
  return {
    hit: false,
    crit: false,
    damage: 0,
    healing: 0,
    overheal: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
    conclusion: battleEnded(state),
  };
}

/** Convenience for callers that only want the ending. */
export const endingOf = (state: BattleState): Conclusion | null => battleEnded(state);

export type { HeroState };
export { afterTick };
