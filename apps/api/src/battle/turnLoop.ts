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
  SURVIVAL_HP,
  afterTick,
  afterUpkeep,
  applyPassiveEffects,
  battleEnded,
  cooldownExtensionFor,
  cooldownsAfterResolution,
  gainPerTick,
  heroStateOf,
  isIncapacitated,
  isStanding,
  lethalGuard,
  maxHp,
  onAct,
  onDeath,
  onUpkeep,
  tickDurations,
  upkeepDamage,
  type BattleState,
  type Conclusion,
  type HeroState,
  type PassiveEffect,
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
    /**
     * **`Nothing Casts Twice` — the only passive that reaches a cooldown** (020
     * US3). Lucen adds a turn to whatever an enemy just spent.
     *
     * Applied to the power going **on** cooldown rather than to the tick, so it
     * lengthens the one power that was cast rather than freezing the whole hand
     * — and a power with no cooldown at all stays free, because a tier-0
     * auto-attack that could be locked out would leave a silenced hero with
     * nothing to do.
     */
    if (power && power.cooldown > 0) {
      ticked[firedPowerId] = power.cooldown + cooldownExtensionFor(state, instanceId);
    }
  }

  /**
   * **`tickDurations` rather than the inline copy this used to hold** (020).
   *
   * The arithmetic was identical and had been correct for four features — on an
   * array that was always empty, because nothing could create a status. Now that
   * effects exist, expiry is a rule with real consequences, and a rule gets one
   * implementation.
   */
  const statuses = tickDurations(hero.statuses);

  const resolved: BattleState = {
    ...state,
    heroes: state.heroes.map((h) =>
      h.instanceId === instanceId
        ? clampToPool({ ...h, cooldowns: ticked, statuses })
        : h,
    ),
    /**
     * **Counted per hero turn, not per round**, because that is what the tier
     * gates and the 300-turn cap are both measured in.
     */
    heroTurn: state.heroTurn + 1,
  };

  /**
   * **`Out of Reach` — granted after the tick, and the order is the passive**
   * (020 US3).
   *
   * A one-turn effect written before `tickDurations` would be counted down by the
   * same Resolution that created it and never exist. Placed here, Zephyrine
   * carries the extra row from her second action onward — and loses it the moment
   * she misses a turn, which is what makes a stun on her cost more than a turn.
   *
   * A hero that fell during its own turn gets nothing: `applyPassiveEffects`
   * refuses to fold onto a hero at 0 HP.
   */
  return applyPassiveEffects(
    resolved,
    onAct(resolved, heroStateOf(resolved, instanceId)),
    maxHp,
  );
}

/**
 * **A `Toughness` buff is temporary hit points, and losing it must not kill.**
 *
 * `maxHp` is `Toughness × 8` read through `effectiveStat`, so a `Toughness` buff
 * raises the pool for free while it lasts — and `05-status.md` additionally
 * grants the same amount as *current* HP, which is what makes it useful the
 * moment it lands rather than only after the next heal.
 *
 * When it expires the pool falls, and current HP has to come down with it.
 * **Clamped to a minimum of 1**, deliberately: a champion whose entire remaining
 * health was temporary would otherwise die to the expiry of its own buff, which
 * is a death with no killer, no event and no way for a player to read what
 * happened. Losing the buff should return it to the brink, not past it.
 */
function clampToPool(hero: HeroState): HeroState {
  if (hero.hp <= 0) return hero;
  const pool = maxHp(hero);
  return hero.hp > pool ? { ...hero, hp: Math.max(1, pool) } : hero;
}

/**
 * **Upkeep — the phase that did not exist** (020 T019).
 *
 * `takeTurn` was `resolveOne` followed by Resolution, with no Upkeep at all. That
 * was correct while nothing could apply a damage-over-time effect and is the
 * reason `upkeepDamage` would otherwise have been another uncalled seam.
 *
 * Two rules, both from `05-status.md` and `04-turns.md`:
 *
 * - **Ticks resolve before the hero acts**, so a champion can die to a burn
 *   without ever taking its turn.
 * - **Death during Upkeep is the only early termination of a turn.** `phasesFor`
 *   has always returned `['upkeep']` for that case; nothing has ever reached it.
 *
 * The tick is **snapshotted** — computed when the effect landed — so this
 * consumes no randomness and needs no seed.
 */
export function applyUpkeep(
  state: BattleState,
  instanceId: string,
): { readonly state: BattleState; readonly damage: number; readonly died: boolean } {
  /**
   * **The passive tick runs first, and it runs whether or not anything is
   * burning** (020 US3).
   *
   * `The Long Patience` grows on a turn where *nothing happened*, which is
   * precisely the turn the early return below used to skip. So it is folded
   * before the guard rather than after it — the guard is an optimization about
   * damage-over-time effects, and treating it as the definition of "an Upkeep"
   * would make Bramwen's build depend on whether she happened to be poisoned.
   */
  const grown = applyPassiveEffects(
    state,
    onUpkeep(state, heroStateOf(state, instanceId)),
    maxHp,
  );

  const hero = heroStateOf(grown, instanceId);
  const damage = upkeepDamage(hero);

  if (damage <= 0 && hero.statuses.length === 0) {
    return { state: grown, damage: 0, died: false };
  }

  let hp = Math.max(0, hero.hp - damage);

  /**
   * **The second doorway `Still Burning` has to watch.** A champion can fall to a
   * burn without anyone swinging at it, and a guard that only saw the killing
   * blow in `resolveOne` would be silently conditional on *how* she died.
   */
  let guardPaid: readonly PassiveEffect[] = [];
  if (hp === 0 && hero.hp > 0) {
    const paid = lethalGuard(grown, hero);
    if (paid !== null) {
      hp = SURVIVAL_HP;
      guardPaid = paid;
    }
  }

  const next: HeroState = { ...hero, hp, statuses: afterUpkeep(hero.statuses) };

  let ticked: BattleState = {
    ...grown,
    heroes: grown.heroes.map((h) => (h.instanceId === instanceId ? next : h)),
  };
  if (guardPaid.length > 0) ticked = applyPassiveEffects(ticked, guardPaid, maxHp);

  const died = hp === 0 && hero.hp > 0;

  /**
   * **A burn kills, and `The Veil Closes` still feeds** (020 US2).
   *
   * A death has two doorways — a blow in `resolveOne` and a tick here — and a
   * passive that only saw the first would be silently conditional on *how* the
   * champion fell. `hero` rather than `next` is passed, because reach needs the
   * row it stood in.
   */
  return {
    state: died ? applyPassiveEffects(ticked, onDeath(ticked, hero), maxHp) : ticked,
    damage,
    died,
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
  /**
   * **Phase 1 — Upkeep, before anything else** (020). Damage-over-time ticks
   * here, so a champion can die to a burn without ever taking its turn.
   */
  const upkeep = applyUpkeep(state, intent.actorInstanceId);
  const afterUpkeepState = upkeep.state;

  if (upkeep.died) {
    /*
     * **The only early termination of a turn**, and the case `phasesFor` has
     * described since 002 without anything ever reaching it. No Resolution: the
     * hero is off the board, so there are no cooldowns left to tick.
     */
    return {
      state: { ...afterUpkeepState, heroTurn: afterUpkeepState.heroTurn + 1 },
      outcome: {
        ...passOutcome(afterUpkeepState),
        damage: upkeep.damage,
        deaths: [intent.actorInstanceId],
        conclusion: battleEnded(afterUpkeepState),
      },
      drawsConsumed: 0n,
    };
  }

  const hero = heroStateOf(afterUpkeepState, intent.actorInstanceId);

  if (isIncapacitated(hero)) {
    return {
      state: applyResolution(afterUpkeepState, intent.actorInstanceId, null),
      outcome: passOutcome(afterUpkeepState),
      drawsConsumed: 0n,
    };
  }

  const resolved = resolveOne(seed, afterUpkeepState, intent, drawIndex);

  return {
    state: applyResolution(resolved.state, intent.actorInstanceId, intent.powerId),
    /*
     * Upkeep damage is added to the turn's reported damage rather than hidden.
     * A burn that took 14 off a champion is something the battle log has to be
     * able to say, or a player watches their health fall for no stated reason.
     */
    outcome: { ...resolved.packet, damage: resolved.packet.damage + upkeep.damage },
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
