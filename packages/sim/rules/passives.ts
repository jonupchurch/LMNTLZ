/**
 * Passives — the thirteen Role and House rules, and the hooks they hang on
 * (`resources/mechanics/03-powers.md`, feature 020 US2).
 *
 * ### What this file ends
 *
 * `hero.passives` is a tuple of three names and **had no consumer anywhere in
 * `packages/sim` or `apps/api`**. The roster drawer printed the names; the engine
 * never read them. So `Role` set the stat budget and then vanished, and a House
 * was a colour. Forty passives, forty pieces of decoration.
 *
 * ### The invariant that shapes every one of them: **a passive never draws**
 *
 * Every trigger here is something that *already* passed a contest — a hit landed,
 * a crit came up, a rider stuck, a hero fell. Nothing in this file consumes
 * randomness, which buys three things at once:
 *
 * - `rules/` stays pure, so `purity.test.ts` and `determinism.test.ts` hold
 *   (Constitution XII);
 * - the **draw order is untouched**, so `goldenPath` and the three determinism
 *   suites keep reconstructing it exactly;
 * - the client's `damagePreview` and the server's resolution agree about what a
 *   swing is worth, because both read `damageMultiplierFor` from here.
 *
 * The engine version still moves — outcomes change, so an in-flight battle cannot
 * be re-derived across the boundary (Constitution XVI) — but no *index* moves.
 *
 * ### Magnitudes are anchored, not invented
 *
 * `03-powers.md` states what each passive does and, for eight of the thirteen, no
 * number at all. Every number below is pinned to something already settled and
 * the anchor is named at its definition, so a tuning pass edits {@link
 * PASSIVE_MAGNITUDES} rather than hunting through thirteen closures.
 *
 * **Passives are priced at tier 1**, the lowest rung of `05-status.md`'s ladder.
 * A passive costs nothing — no cooldown, no gate, no card — so it should sit
 * below a power of any tier; and Constitution XIV makes *too weak* the cheap
 * direction to be wrong in, because the fix is raising the other twenty-six
 * rather than writing off somebody's spend.
 */

import { getHero, type Power } from '@lmntlz/content';
import {
  effectiveStat,
  heroStateOf,
  type BattleState,
  type HeroState,
  type StatusInstance,
} from './state.js';
import { distance, inReach } from './reach.js';
import {
  PERMANENT,
  accumulateStatus,
  applyStatus,
  composeTargeting,
  definitionOf,
  dotTickForTier,
  durationForTier,
  markCount,
  statChangeForTier,
  targetingStatuses,
  type StatKey,
  type Tier,
} from './status.js';
import type { Compulsion, TargetFilter } from './targeting.js';

// ---------------------------------------------------------------------------
// The numbers, in one place
// ---------------------------------------------------------------------------

/** The rung of `05-status.md`'s ladder every passive is priced at. */
export const PASSIVE_TIER: Tier = 1;

export const PASSIVE_MAGNITUDES = Object.freeze({
  /**
   * `Finish It` and `Measured Shot` — **one step on the effectiveness ladder**
   * (×1.25, a Fault), which is the only conditional damage multiplier the game
   * already prices.
   *
   * One constant for both, deliberately: they differ in **uptime**, not in size.
   * `Finish It` pays on roughly the back half of a target's life; `Measured Shot`
   * pays whenever a reach-2 hero is at its natural station. If either turns out
   * wrong, uptime is the honest knob — the condition, not the number.
   */
  roleDamageBonus: 0.25,

  /** `Finish It` — "below half pool", read literally. */
  finishItThreshold: 0.5,

  /** `Measured Shot` — `03-powers.md` says distance 2, and reach caps at 2 + runes. */
  measuredShotDistance: 2,

  /**
   * `Never Where You Struck` — the tier-1 stat change, in `Agility`.
   *
   * **Bounded twice over without any cap of its own**: the 75 stat cap, and the
   * 65% floor on hit probability that exists precisely so an `Agility` build
   * cannot become invincible. Re-applying from one source refreshes rather than
   * stacks, so this is uptime rather than a ladder.
   */
  missedAgility: statChangeForTier(PASSIVE_TIER),

  /**
   * `The Deep Holds` — control on this hero is **one turn shorter**.
   *
   * ⚠️ **Control is priced at exactly one turn** (`CONTROL_DURATION`), so this is
   * effectively immunity to `stun` and `silence` for the three Earth champions.
   * That is what the text says, and the magnitude is *derived* — it is 1 because
   * `CONTROL_DURATION` is 1, not because a number was chosen.
   *
   * It is not absolute: `Banked Coals` puts Cindara's control at two turns, so she
   * can still stun an Earth hero for one. **The row most likely to want an edit**,
   * and cheap to change because it is this constant alone.
   */
  controlShortening: 1,

  /**
   * `The Veil Closes` — a nearby death restores `Might × 1.0`.
   *
   * Anchored to `SHIELD_FRACTION` at tier 1: the same quantity of hit points a
   * tier-1 shield is worth. Deaths are rare and late — a median battle has eleven
   * at most — so the trigger is its own limiter.
   *
   * *"Nearby"* is **within reach**, reusing `inReach` rather than inventing an
   * adjacency rule. It widens as the line collapses, which is the passive working
   * as its name reads.
   */
  veilHealFraction: 1.0,

  /** `Nothing Holds` — five points of `Armor` a strike, to the `large` shred band. */
  nothingHoldsStep: 0.05,
  nothingHoldsCap: 0.4,

  /**
   * `Find the Seam` — `Penetration` per prior strike on the same target, capped at
   * the top of the stat-change ladder (`statChangeForTier(5)` = 25).
   */
  findTheSeamStep: 5,
  findTheSeamCap: statChangeForTier(5),

  /** `It Catches` — `05-status.md` states this one outright: +50% of base a tick. */
  itCatchesEscalation: 0.5,
} as const);

// ---------------------------------------------------------------------------
// The hook surface
// ---------------------------------------------------------------------------

/** Everything a passive needs to know about one swing. */
export interface StrikeContext {
  readonly state: BattleState;
  readonly attacker: HeroState;
  readonly defender: HeroState;
  readonly power: Power;
  /**
   * `defender.hp / maxHp(defender)`.
   *
   * **Passed in rather than computed**, because `maxHp` lives in `damage.ts` and
   * `damage.ts` reads this module — importing it back would be a value-level
   * cycle between the two halves of one pipeline.
   */
  readonly defenderHpFraction: number;
}

/**
 * Something a passive does that is not a number: a status to place, or hit points
 * to restore.
 *
 * Returned as data rather than applied in place so the hooks stay pure and the
 * **order** of application belongs to the caller — `EFFECT_ORDER` in `phases.ts`
 * fixes it, and every one of these can kill.
 */
export type PassiveEffect =
  | {
      readonly kind: 'status';
      readonly bearerInstanceId: string;
      readonly status: StatusInstance;
    }
  | {
      readonly kind: 'accumulate';
      readonly bearerInstanceId: string;
      readonly status: StatusInstance;
      readonly step: number;
      readonly cap: number;
    }
  | { readonly kind: 'heal'; readonly instanceId: string; readonly amount: number };

export interface DeathContext {
  readonly state: BattleState;
  /** The hero holding the passive. */
  readonly witness: HeroState;
  readonly fallen: HeroState;
}

/**
 * What one passive can hook.
 *
 * **Named hooks rather than a `passive.apply(state)` interface or an event bus.**
 * A bus makes ordering emergent, and `EFFECT_ORDER` exists precisely because
 * every effect in that phase can kill and *"the order decides who is still
 * standing to act."* A single `apply` would hide which moment a passive cares
 * about, forcing the engine to offer all forty every opportunity. This surface is
 * auditable: `rg 'onStrike' rules/passives.ts` lists everything that fires on a
 * hit.
 */
export interface PassiveHooks {
  readonly name: string;
  /** Multiplies outgoing damage. Read by `damagePreview`, so previews match. */
  readonly damageMultiplier?: (ctx: StrikeContext) => number;
  /** Adds flat `Penetration` to an outgoing attack. Also read by `damagePreview`. */
  readonly penetrationBonus?: (ctx: StrikeContext) => number;
  /** Fires on the attacker after its payload connects. */
  readonly onStrike?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /**
   * Fires on the attacker after a **critical** blow connects, in addition to
   * `onStrike`.
   *
   * **A separate hook rather than a flag on `StrikeContext`**, and `purity.test.ts`
   * is why: `rules/` may never declare a `crit: boolean`, because the module that
   * knows whether a swing critted is by definition the resolver. Splitting the
   * hook moves that knowledge back where it belongs — the resolver decides *which*
   * hook to call, and the rule only says what happens when it is called.
   */
  readonly onCrit?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /** Fires on the **defender** after an attack against it misses. */
  readonly onMissed?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /** Fires on any standing hero when somebody falls within its reach. */
  readonly onDeathNearby?: (ctx: DeathContext) => readonly PassiveEffect[];
  /** Reshapes an effect this hero is **applying**, before it lands. */
  readonly shapeOutgoing?: (instance: StatusInstance) => StatusInstance;
  /** Reshapes an effect landing **on** this hero. `null` refuses it outright. */
  readonly shapeIncoming?: (instance: StatusInstance) => StatusInstance | null;
  /** Permanent taunt, permanent fade, and who sees through them. */
  readonly targeting?: {
    readonly taunts?: boolean;
    readonly fades?: boolean;
    readonly ignoresFade?: boolean;
    readonly immuneToTaunt?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

const M = PASSIVE_MAGNITUDES;

const passivePowerId = (name: string): string => `passive:${name}`;

/**
 * A status a passive places, at the passive tier.
 *
 * `sourcePowerId` is `passive:<name>` and never a real power id — that is what
 * keeps a `The Cut Reopens` bleed a *different source* from a bleed the same hero
 * applied by rider, so the two stack toward the cap of 3 instead of refreshing
 * each other into one.
 */
function fromPassive(
  name: string,
  applier: HeroState,
  kind: StatusInstance['kind'],
  fields: {
    readonly magnitude: number;
    readonly turnsRemaining: number;
    readonly stat?: StatKey | null;
    readonly escalation?: number;
    readonly cleansable?: boolean;
  },
): StatusInstance {
  return {
    kind,
    stat: fields.stat ?? null,
    magnitude: fields.magnitude,
    turnsRemaining: fields.turnsRemaining,
    sourceInstanceId: applier.instanceId,
    sourcePowerId: passivePowerId(name),
    escalation: fields.escalation ?? 0,
    ticksDealt: 0,
    cleansable: fields.cleansable ?? true,
  };
}

/**
 * **`effectiveStat`, not the authored number.** A passive that read base `Might`
 * would ignore both the player's runes and any buff standing on the hero — and
 * `instanceFor` in the resolver already reads it this way, so a rider-applied
 * bleed and a passive-applied one would otherwise disagree about the same hero.
 */
const mightOf = (hero: HeroState): number =>
  effectiveStat(hero, getHero(hero.heroId).stats, 'might');

// ---------------------------------------------------------------------------
// The four Role passives
// ---------------------------------------------------------------------------

const FINISH_IT: PassiveHooks = {
  name: 'Finish It',
  /**
   * **The target below half pool, not the attacker.** `07-defense-ai.md` pairs
   * this passive with the Striker's *lowest current HP* preference and calls it
   * *"pays for closing out — burst first"*; a self-referential reading would be a
   * comeback mechanic, which is the opposite kit.
   */
  damageMultiplier: (ctx) =>
    ctx.defenderHpFraction < M.finishItThreshold ? 1 + M.roleDamageBonus : 1,
};

const MEASURED_SHOT: PassiveHooks = {
  name: 'Measured Shot',
  /**
   * **Distance, not reach.** Distance counts *occupied* rows, so it shrinks as a
   * line collapses — a Ranged hero loses this bonus as the battle closes in, which
   * is the pressure the whole Role is built around.
   */
  damageMultiplier: (ctx) =>
    distance(ctx.state, ctx.attacker.row, ctx.defender.row) >= M.measuredShotDistance
      ? 1 + M.roleDamageBonus
      : 1,
};

/**
 * **Row-scoped taunt, and the scoping needs no code.**
 *
 * `legalTargets` drops a compulsion naming somebody the actor cannot reach, so a
 * tank compels exactly the attackers that could have hit it anyway — which is
 * what *"an attacker that cannot reach the tank chooses freely"* means. A row
 * test here would be a second implementation of reach.
 */
const HOLD_THE_LINE: PassiveHooks = {
  name: 'Hold the Line',
  targeting: { taunts: true },
};

/**
 * **Permanent fade, and self-limiting.** Once the Buffer is the only thing an
 * attacker can reach, the filter would empty the candidate set and `legalTargets`
 * ignores it. That invariant predates this passive by four features.
 */
const BEHIND_THE_LINE: PassiveHooks = {
  name: 'Behind the Line',
  targeting: { fades: true },
};

// ---------------------------------------------------------------------------
// The nine House passives
// ---------------------------------------------------------------------------

const THE_DEEP_HOLDS: PassiveHooks = {
  name: 'The Deep Holds',
  shapeIncoming: (instance) => {
    if (definitionOf(instance.kind).family !== 'control') return instance;
    const turns = instance.turnsRemaining - M.controlShortening;
    return turns > 0 ? { ...instance, turnsRemaining: turns } : null;
  },
};

const NEVER_WHERE_YOU_STRUCK: PassiveHooks = {
  name: 'Never Where You Struck',
  onMissed: (ctx) => [
    {
      kind: 'status',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Never Where You Struck', ctx.defender, 'buff', {
        stat: 'agility',
        magnitude: M.missedAgility,
        turnsRemaining: durationForTier(PASSIVE_TIER),
      }),
    },
  ],
};

/**
 * **Escalation, not a special case in the tick function** (T031).
 *
 * `upkeepDamage` already reads `escalation * ticksDealt` off the instance, and
 * `ticksDealt` counts ticks *dealt* rather than elapsed duration — which is what
 * makes this survive `Banked Coals` extending the burn by a turn.
 *
 * Scoped to `burn` alone, because `05-status.md` says *"a burn applied by a Fire
 * hero"*. Widening it to the whole damage-over-time family would be a buff, and
 * a buff is the cheap direction to move later.
 */
const IT_CATCHES: PassiveHooks = {
  name: 'It Catches',
  shapeOutgoing: (instance) =>
    instance.kind === 'burn'
      ? { ...instance, escalation: M.itCatchesEscalation }
      : instance,
};

const WEARS_THROUGH: PassiveHooks = {
  name: 'Wears Through',
  shapeOutgoing: (instance) =>
    instance.kind === 'shred' ? { ...instance, turnsRemaining: PERMANENT } : instance,
};

const NOTHING_STAYS_HIDDEN: PassiveHooks = {
  name: 'Nothing Stays Hidden',
  targeting: { ignoresFade: true },
};

const THE_VEIL_CLOSES: PassiveHooks = {
  name: 'The Veil Closes',
  onDeathNearby: (ctx) => [
    {
      kind: 'heal',
      instanceId: ctx.witness.instanceId,
      amount: Math.round(mightOf(ctx.witness) * M.veilHealFraction),
    },
  ],
};

/**
 * **A bleed from the crit itself, uncontested.**
 *
 * The crit already passed two draws — the hit and the crit — and a passive never
 * adds a third. Its magnitude comes from the power's own tier, floored at 1 so a
 * critical auto-attack still opens a cut.
 */
const THE_CUT_REOPENS: PassiveHooks = {
  name: 'The Cut Reopens',
  onCrit: (ctx) => {
    const tier = Math.max(ctx.power.tier, 1) as Tier;
    const magnitude = dotTickForTier(tier, mightOf(ctx.attacker));
    if (magnitude <= 0) return [];

    return [
      {
        kind: 'status',
        bearerInstanceId: ctx.defender.instanceId,
        status: fromPassive('The Cut Reopens', ctx.attacker, 'bleed', {
          magnitude,
          turnsRemaining: durationForTier(tier),
        }),
      },
    ];
  },
};

/**
 * **Sharpens against a repeat target**, counted with a `mark` the strike itself
 * places.
 *
 * The bonus is read in `damagePreview` and the mark is placed in `onStrike`, so
 * the count a swing reads is the count *before* that swing — the first strike on
 * a target is worth nothing extra, which is what "repeat" means.
 */
const FIND_THE_SEAM: PassiveHooks = {
  name: 'Find the Seam',
  penetrationBonus: (ctx) =>
    Math.min(
      markCount(ctx.defender, ctx.attacker.instanceId, passivePowerId('Find the Seam')) *
        M.findTheSeamStep,
      M.findTheSeamCap,
    ),
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Find the Seam', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      /**
       * **The mark counts; the passive caps.** Bounding the counter itself would
       * make it a `Find the Seam` field rather than bookkeeping, and the two
       * other passives that will read a mark — Reckoning and
       * `The Duelist's Habit` — want the raw total.
       */
      cap: PERMANENT,
    },
  ],
};

/**
 * **Crush removes the guard rather than piercing it**, and `03-powers.md` is
 * explicit that this one *stacks*.
 *
 * `accumulateStatus` rather than `applyStatus`, because the same source
 * refreshing is exactly what a stacking shred must not do. The cap is the `large`
 * shred band, so eight strikes reach 40% and the ninth adds nothing.
 */
const NOTHING_HOLDS: PassiveHooks = {
  name: 'Nothing Holds',
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Nothing Holds', ctx.attacker, 'shred', {
        stat: 'armor',
        magnitude: 0,
        turnsRemaining: PERMANENT,
      }),
      step: M.nothingHoldsStep,
      cap: M.nothingHoldsCap,
    },
  ],
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const REGISTRY: Readonly<Record<string, PassiveHooks>> = Object.freeze({
  [FINISH_IT.name]: FINISH_IT,
  [HOLD_THE_LINE.name]: HOLD_THE_LINE,
  [MEASURED_SHOT.name]: MEASURED_SHOT,
  [BEHIND_THE_LINE.name]: BEHIND_THE_LINE,
  [THE_DEEP_HOLDS.name]: THE_DEEP_HOLDS,
  [NEVER_WHERE_YOU_STRUCK.name]: NEVER_WHERE_YOU_STRUCK,
  [IT_CATCHES.name]: IT_CATCHES,
  [WEARS_THROUGH.name]: WEARS_THROUGH,
  [NOTHING_STAYS_HIDDEN.name]: NOTHING_STAYS_HIDDEN,
  [THE_VEIL_CLOSES.name]: THE_VEIL_CLOSES,
  [THE_CUT_REOPENS.name]: THE_CUT_REOPENS,
  [FIND_THE_SEAM.name]: FIND_THE_SEAM,
  [NOTHING_HOLDS.name]: NOTHING_HOLDS,
});

/** Every passive with an implementation, by name. */
export const IMPLEMENTED_PASSIVES: readonly string[] = Object.freeze(Object.keys(REGISTRY));

/**
 * The hooks a hero actually carries — **read from `hero.passives`, never from its
 * Role or House**.
 *
 * The roster is the source: a champion gets `Hold the Line` because its passive
 * tuple names it, not because it is a Tank. The two agree today, and deriving
 * from Role would make a re-authored roster silently disagree with itself.
 *
 * Unimplemented passives are skipped, not thrown on. Nineteen of the twenty-seven
 * uniques have no authored effect yet (US3), and a battle must not fail because
 * one of them is still a name.
 */
export function hooksFor(heroId: string): readonly PassiveHooks[] {
  const hooks: PassiveHooks[] = [];
  for (const name of getHero(heroId).passives) {
    const found = REGISTRY[name];
    if (found) hooks.push(found);
  }
  return hooks;
}

const hooksOf = (hero: HeroState): readonly PassiveHooks[] => hooksFor(hero.heroId);

// ---------------------------------------------------------------------------
// Readers — what the damage pipeline asks
// ---------------------------------------------------------------------------

/**
 * The product of every damage multiplier the attacker's passives contribute.
 *
 * **Multiplicative, so composition order cannot matter.** Nothing today stacks
 * two of these on one hero — a champion has one Role — but a unique could, and an
 * additive sum would make the order of `hero.passives` load-bearing.
 */
export function damageMultiplierFor(ctx: StrikeContext): number {
  let factor = 1;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.damageMultiplier) factor *= hooks.damageMultiplier(ctx);
  }
  return factor;
}

/** Flat `Penetration` the attacker's passives add against **this** defender. */
export function penetrationBonusFor(ctx: StrikeContext): number {
  let total = 0;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.penetrationBonus) total += hooks.penetrationBonus(ctx);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Targeting — the passive half of taunt and fade
// ---------------------------------------------------------------------------

/**
 * Taunt and fade **as passives grant them**, merged with the status layer and
 * composed once.
 *
 * This is what the resolver calls; `statusTargeting` no longer exists, because a
 * function answering *"who may this hero target"* from only half the board is a
 * seam waiting to disagree with the other half.
 */
export function targetingFor(
  state: BattleState,
  actorInstanceId: string,
): { readonly filters: readonly TargetFilter[]; readonly compulsion: Compulsion | null } {
  const fromStatuses = targetingStatuses(state);

  const taunting = [...fromStatuses.taunting];
  const faded = [...fromStatuses.faded];

  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      if (hooks.targeting?.taunts) taunting.push(hero.instanceId);
      if (hooks.targeting?.fades) faded.push(hero.instanceId);
    }
  }

  const actorHooks = hooksFor(heroStateOf(state, actorInstanceId).heroId);

  return composeTargeting(state, actorInstanceId, {
    taunting,
    faded,
    ignoresFade: actorHooks.some((h) => h.targeting?.ignoresFade === true),
    immuneToTaunt: actorHooks.some((h) => h.targeting?.immuneToTaunt === true),
  });
}

// ---------------------------------------------------------------------------
// Shaping an effect on its way in or out
// ---------------------------------------------------------------------------

/** Every `shapeOutgoing` the applier carries, applied in `hero.passives` order. */
export function shapeOutgoing(applier: HeroState, instance: StatusInstance): StatusInstance {
  let shaped = instance;
  for (const hooks of hooksOf(applier)) {
    if (hooks.shapeOutgoing) shaped = hooks.shapeOutgoing(shaped);
  }
  return shaped;
}

/**
 * Every `shapeIncoming` the bearer carries. **`null` means the effect does not
 * land at all** — `The Deep Holds` against a one-turn stun.
 */
export function shapeIncoming(bearer: HeroState, instance: StatusInstance): StatusInstance | null {
  let shaped: StatusInstance | null = instance;
  for (const hooks of hooksOf(bearer)) {
    if (!shaped || !hooks.shapeIncoming) continue;
    shaped = hooks.shapeIncoming(shaped);
  }
  return shaped;
}

// ---------------------------------------------------------------------------
// Triggers — pure state → state
// ---------------------------------------------------------------------------

/**
 * Fold one passive effect into the board.
 *
 * A heal is **clamped by the caller**, not here: the pool is `maxHp`, which lives
 * in `damage.ts`, and importing it would put a cycle between the damage pipeline
 * and the passives that modify it. `applyPassiveEffects` takes the clamp as a
 * function for exactly that reason.
 */
function fold(
  state: BattleState,
  effect: PassiveEffect,
  poolOf: (hero: HeroState) => number,
): BattleState {
  const id = effect.kind === 'heal' ? effect.instanceId : effect.bearerInstanceId;
  const hero = state.heroes.find((h) => h.instanceId === id);
  if (!hero || hero.hp <= 0) return state;

  let next: HeroState;

  if (effect.kind === 'heal') {
    next = { ...hero, hp: Math.min(hero.hp + effect.amount, poolOf(hero)) };
  } else if (effect.kind === 'accumulate') {
    next = {
      ...hero,
      statuses: accumulateStatus(hero.statuses, effect.status, effect.step, effect.cap),
    };
  } else {
    const shaped = shapeIncoming(hero, effect.status);
    if (shaped === null) return state;
    next = { ...hero, statuses: applyStatus(hero.statuses, shaped) };
  }

  return { ...state, heroes: state.heroes.map((h) => (h.instanceId === id ? next : h)) };
}

export function applyPassiveEffects(
  state: BattleState,
  effects: readonly PassiveEffect[],
  poolOf: (hero: HeroState) => number,
): BattleState {
  let next = state;
  for (const effect of effects) next = fold(next, effect, poolOf);
  return next;
}

/**
 * The attacker's on-hit passives, for one struck target.
 *
 * Called **per target** rather than per action, because `Nothing Holds` and
 * `Find the Seam` both mark the hero they hit and a party-wide power hits six.
 */
export function onStrike(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.onStrike) effects.push(...hooks.onStrike(ctx));
  }
  return effects;
}

/**
 * The attacker's on-crit passives, called **in addition to** `onStrike` and only
 * by the resolver, which is the one module allowed to know a swing critted.
 */
export function onCrit(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.onCrit) effects.push(...hooks.onCrit(ctx));
  }
  return effects;
}

/** The **defender's** own passives, after an attack against it misses. */
export function onMissed(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.defender)) {
    if (hooks.onMissed) effects.push(...hooks.onMissed(ctx));
  }
  return effects;
}

/**
 * Everyone who feeds on a death, in board order.
 *
 * **Both sides.** `The Veil Closes` does not ask whose champion fell — Dark's
 * signature is endings, not allegiance — and a rule that checked would make a
 * Dark hero's own squad safer to stand near, which is backwards.
 *
 * The fallen hero is read from the state **before** it left the board, so its row
 * is still known; reach is measured from the witness, using the same `inReach`
 * every other rule uses.
 */
export function onDeath(state: BattleState, fallen: HeroState): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];

  for (const witness of state.heroes) {
    if (witness.hp <= 0 || witness.instanceId === fallen.instanceId) continue;
    if (!inReach(state, witness.instanceId, fallen.row)) continue;

    for (const hooks of hooksOf(witness)) {
      if (hooks.onDeathNearby) effects.push(...hooks.onDeathNearby({ state, witness, fallen }));
    }
  }

  return effects;
}
