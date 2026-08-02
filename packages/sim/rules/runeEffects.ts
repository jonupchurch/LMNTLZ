/**
 * Rune utility effects — the thirty-three abilities stage 4 of a rune buys
 * (`resources/mechanics/06-progression.md` § *The utility catalog*, feature 021).
 *
 * ### What this file ends
 *
 * Stage 4 is the **most expensive stage of a rune at 200 shards** and grants zero
 * stat points, deliberately: the effect *is* what completing a rune buys. It has
 * never existed. `apps/api/src/progression/runes.ts` wrote `utilityEffect: null`
 * on the forge path and never assigned one on the rebuild path, and
 * `grep -rn utility packages/sim` returned nothing at all — so roughly a third of
 * every completed rune's price bought silence.
 *
 * ### Why these reuse `PassiveHooks` rather than a surface of their own
 *
 * A rune effect and a passive are the same *kind* of thing: something conditional
 * that watches a battle and changes it. `PassiveHooks` already names sixteen hook
 * points, and 21 of the 22 readers in `passives.ts` reach them through a single
 * `hooksOf(hero)`. Widening that one function is what makes every effect below
 * work in the damage path, the stat path, the targeting path and the turn loop at
 * once, rather than twenty edits that can each be forgotten.
 *
 * **What is not shared is the lookup key, and that is the load-bearing
 * difference.** A passive is keyed by `heroId`, which is correct because every
 * copy of a champion carries the same three. Runes are per *account*, so an
 * attacker and a defender fielding the same champion carry different ones —
 * keying these by `heroId` would hand one player's runes to their opponent. They
 * are therefore carried per instance, on `HeroState.runeEffects`.
 *
 * ### The magnitudes will move, and that is planned for
 *
 * `06-progression.md` sizes every effect against a 6v6 running **~102 hero-turns**
 * — 8.5 turns per champion. The engine currently produces **~28**, i.e. 2.3 turns
 * per champion (`apps/api/tests/battle/goldenPath.test.ts`). The doc argues a
 * once-firing trigger must be worth 5.7 turns of a champion's output to justify
 * 200 shards over 150 for a stat; at 2.3 turns there are not 5.7 turns to be
 * worth. **So the trigger-then-persistent family under-delivers by roughly 3.6×
 * until the hero-numbers pass lands, and the immediate effects do not** — which
 * moves value between them rather than scaling them evenly.
 *
 * Every number therefore lives in {@link RUNE_MAGNITUDES} and nowhere else, so the
 * correction is a single-file edit. A test reads this module's source and fails on
 * a numeric literal inside an effect body.
 */

import { DAMAGE_TYPES, getHero, type DamageType } from '@lmntlz/content';
import type { PassiveEffect, PassiveHooks } from './passives.js';
import { inReach } from './reach.js';
import { maxHp, packetOf, type HeroState, type StatusInstance } from './state.js';
import {
  PERMANENT,
  definitionOf,
  markCount,
  statusFrom,
  upkeepDamageFrom,
  type StatKey,
} from './status.js';

// ---------------------------------------------------------------------------
// Slots and pools
// ---------------------------------------------------------------------------

/**
 * The three rune slots on every champion.
 *
 * **Declared here because which pool a slot offers is a rule**, and rules live in
 * this package (Constitution XIII). `apps/api` holds an identically-shaped array
 * for its database enum — a storage concern — and its `slotAccepts` delegates to
 * {@link poolOf} rather than deriving the same answer a second time.
 */
export const RUNE_SLOTS = Object.freeze(['primary', 'secondary', 'common'] as const);

export type RuneSlot = (typeof RUNE_SLOTS)[number];

/** Ten pools: the common one, plus one per damage type. */
export type PoolKey = 'common' | DamageType;

export const POOL_KEYS: readonly PoolKey[] = Object.freeze(['common', ...DAMAGE_TYPES]);

/**
 * Which pool a slot offers on a given champion.
 *
 * **Derived from the hero's two authored fields, never stored** (Constitution XV).
 * `primary` and `secondary` are the only authored relationship data a hero has;
 * writing the pool onto the rune row would create a second source for a derived
 * value, and one that goes stale the moment a champion is re-authored.
 *
 * A consequence worth stating because it looks like a bug and is not: since
 * `secondary ≠ primary` is enforced at authoring, **a champion's three slots
 * always offer three different pools.**
 */
export function poolOf(heroId: string, slot: RuneSlot): PoolKey {
  const hero = getHero(heroId);
  if (slot === 'primary') return hero.primary;
  if (slot === 'secondary') return hero.secondary;
  return 'common';
}

// ---------------------------------------------------------------------------
// The numbers, in one place
// ---------------------------------------------------------------------------

/**
 * Every magnitude, fraction, threshold and probability the catalog uses.
 *
 * Authored in `06-progression.md`; transcribed, not invented. Where the doc gives
 * a number this holds that number. Nothing here is a tuning decision made in code
 * — see the file header for why they are all in one object.
 */
export const RUNE_MAGNITUDES = Object.freeze({
  /**
   * **The half-health line, and it is one constant rather than six.**
   * `Cornered`, `Weight Tells`, `No One Saw`, `The Floor Comes Up` and
   * `Held in the Light` all pivot on *below half*. Six copies of `0.5` is six
   * places for a tuning pass to miss one.
   */
  halfHealth: 0.5,

  // -- common pool ---------------------------------------------------------
  /** `Before the First Blow` — a shield worth this fraction of max HP. */
  firstBlowShieldFraction: 0.3,
  /** `Cornered` — flat `Might`, rest of battle. */
  corneredMight: 20,
  /** `The Point Proven` — flat `Penetration`, rest of battle. */
  pointProvenPenetration: 10,
  /** `Take It Back` — chance per landed attack to strip one buff. */
  takeItBackChance: 0.25,
  /** `The Line Shortens` — flat `Speed` when an ally falls. */
  lineShortensSpeed: 15,

  // -- Earth ---------------------------------------------------------------
  /** `Made Heavy` — `Speed` the target permanently loses. */
  madeHeavySpeed: 10,
  /** `Weight Tells` — `Armor` and `Magic Resist` below half. */
  weightTellsMitigation: 20,

  // -- Air -----------------------------------------------------------------
  /** `Harder to Follow` — `Agility` on the first Bane hit taken. */
  harderToFollowAgility: 20,
  /**
   * `On the Same Breath` — turns the chain guard stands for.
   *
   * **The bound, not a flavour number** (spec A-04). One turn is exactly long
   * enough to cover the extra turn it granted: the guard is placed *after*
   * Resolution has already ticked durations, so it survives into the extra turn
   * and is dropped by that turn's own Resolution. A champion that keeps killing
   * therefore gets one extra turn, not an unbounded run of them.
   */
  sameBreathGuardTurns: 1,
  /** `Further Than It Looks` — chance at turn start. */
  furtherThanItLooksChance: 0.25,
  /** `Further Than It Looks` — rows of reach granted for that turn. */
  furtherThanItLooksReach: 1,

  // -- Fire ----------------------------------------------------------------
  /** `It Spreads` — `Might` per killing blow. */
  itSpreadsMight: 15,
  /**
   * `It Spreads` — the stack ceiling.
   *
   * **3 × 15 = 45 is chosen so a `Might` 30 champion lands exactly on the 75
   * cap.** The design calls that ceiling *"meant to be legible"*, which is why the
   * two numbers are held separately rather than as one total.
   */
  itSpreadsStacks: 3,
  /** `Too Close` — fraction of the incoming packet reflected at the attacker. */
  tooCloseFraction: 0.15,

  // -- Water ---------------------------------------------------------------
  /** `Runs Dry` — multiplier on the target's next heal. */
  runsDryHealMultiplier: 0.5,
  /** `It Passes Through` — flat `Resolve`. */
  passesThroughResolve: 20,
  /** `Draws It Up` — multiplier on healing received. */
  drawsItUpHealMultiplier: 1.4,

  // -- Light ---------------------------------------------------------------
  /** `Nowhere to Stand` — flat `Perception`. */
  nowhereToStandPerception: 10,
  /**
   * `Held in the Light` — the chance to hit a target below half, as a fraction.
   *
   * **Certainty, and it is the only thing in the game that passes
   * `MAX_HIT_PROBABILITY`** (spec A-02). The design says *"cannot dodge"*, and
   * 95% is not *cannot*; expressing it as a large `Perception` bonus instead would
   * be a number a bigger `Agility` simply out-buys, which is precisely what the
   * catalog's *capability, never magnitude* rule forbids.
   */
  heldInTheLightFloor: 1,

  // -- Dark ----------------------------------------------------------------
  /** `Before It Knew` — multiplier against a target that has not yet acted. */
  beforeItKnewMultiplier: 2,
  /** `It Lingers` — extra turns on debuffs this champion applies. */
  itLingersExtraTurns: 1,

  // -- Slash ---------------------------------------------------------------
  /** `Again, There` — damage added per consecutive attack on one target. */
  againThereStep: 0.1,
  /** `Both Ways` — chance to bleed the attacker when struck. */
  bothWaysChance: 0.25,
  /** `Both Ways` — the bleed's magnitude rung. */
  bothWaysBleedMagnitude: 2,

  // -- Pierce --------------------------------------------------------------
  /** `The Way In` — `Penetration` against an already-struck enemy. */
  theWayInPenetration: 15,

  // -- Crush ---------------------------------------------------------------
  /** `Knocked Loose` — chance per landed attack to attempt a stun. */
  knockedLooseChance: 0.15,
  /**
   * `Knocked Loose` — the potency rung its stun is contested at.
   *
   * **Routed through the existing potency-versus-`Resolve` contest**, not a
   * parallel one. The design notes this is what finally gives `Resolve` a job; it
   * is the least exercised of the ten stats.
   */
  knockedLooseTier: 3,
  /** `The Floor Comes Up` — turns of stun on every enemy in reach. */
  floorComesUpTurns: 1,
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export type EffectRole = 'offense' | 'defense' | 'tempo';

/**
 * The three condition shapes `06-progression.md` allows, and **no fourth**.
 *
 * Every effect is conditional; none is a flat always-on bonus, because that is
 * what the 35 stat points are for.
 *
 * - `trigger` — fires at most once, and its consequence lasts the rest of the
 *   battle. Nothing re-arms: at 36 live effects in a battle, an effect on a short
 *   cooldown would put a proc on nearly every turn.
 * - `chance` — rolls per qualifying event and leaves no lasting state. **Grants
 *   capability, never magnitude**: a 25% chance of more damage is worth exactly
 *   25% of that damage and always loses to a flat stat, whereas a 25% chance to
 *   reach a target you otherwise cannot is not a fraction of anything.
 * - `ward` — holds exactly one charge, silently, until it is spent.
 */
export type EffectShape = 'trigger' | 'chance' | 'ward';

export interface RuneEffect {
  /**
   * Stable and kebab-case. **This is what is written to `runes.utility_effect`**,
   * never {@link RuneEffect.name} — a display name is prose and may be re-worded,
   * and a stored rune must survive that.
   */
  readonly id: string;
  /** The authored display name. Collision-checked against every power and passive. */
  readonly name: string;
  /**
   * What it does, in the player's words — **built from `RUNE_MAGNITUDES`, so it
   * cannot go stale.**
   *
   * It lives here rather than in the client because the Forge has to describe an
   * effect *before* 200 shards are committed, and a description retyped on a
   * screen is a second source for a rule (Constitution XIII). It cannot live in
   * `packages/content` either: that package cannot import `packages/sim`, so a
   * magnitude quoted there could never be kept honest — which is exactly the state
   * the passive text is already in.
   */
  readonly description: string;
  readonly pool: PoolKey;
  readonly role: EffectRole;
  readonly shape: EffectShape;
  readonly hooks: PassiveHooks;
}

/** Percentages read better than fractions in a description. */
const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

// ---------------------------------------------------------------------------
// Small builders, shared by every effect below
// ---------------------------------------------------------------------------

const M = RUNE_MAGNITUDES;

/**
 * The synthetic power id a rune's effects are attributed to.
 *
 * **Namespaced, and never a real power id**, exactly as `passive:<name>` is. It is
 * what makes a bleed from a rune a *different source* from a bleed the same
 * champion applied by rider, so the two stack toward the cap of 3 rather than
 * refreshing each other into one.
 */
const runePowerId = (id: string): string => `rune:${id}`;

/**
 * An effect instance placed by a rune. Defaults live in `status.ts`, once.
 *
 * Parameters are spelled out rather than borrowed with `Parameters<typeof …>[n]`:
 * the indices read as magnitudes to the no-magic-numbers guard below, and a type
 * that has to be excused by a test is worse than a type written twice.
 */
const fromRune = (
  id: string,
  applier: HeroState,
  kind: StatusInstance['kind'],
  fields: {
    readonly magnitude: number;
    readonly turnsRemaining: number;
    readonly stat?: StatKey | null;
    readonly escalation?: number;
    readonly cleansable?: boolean;
  },
): StatusInstance => statusFrom(runePowerId(id), applier, kind, fields);

/**
 * The once-per-battle latch, expressed as a mark rather than a field.
 *
 * `HeroState` gains nothing: *"has this already fired"* is a zero-magnitude,
 * uncleansable mark capped at one, which is how `Still Burning` and
 * `The Duelist's Habit` already say the same thing. A boolean on the state would
 * have to be snapshotted, replayed and disclosed; a mark is none of those.
 */
const latch = (id: string, hero: HeroState): PassiveEffect => ({
  kind: 'accumulate',
  bearerInstanceId: hero.instanceId,
  status: fromRune(id, hero, 'mark', {
    magnitude: 0,
    turnsRemaining: PERMANENT,
    cleansable: false,
  }),
  step: 1,
  cap: 1,
});

/** Whether this latch has already fired for this champion. */
const spent = (id: string, hero: HeroState): boolean =>
  markCount(hero, hero.instanceId, runePowerId(id)) > 0;

const belowHalf = (hero: HeroState): boolean => {
  const pool = maxHp(hero);
  return pool > 0 && hero.hp / pool < M.halfHealth;
};

/**
 * Whether a power is a **Bane** hit against this champion.
 *
 * Reads `hero.bane` directly rather than comparing `powerEffectiveness` against
 * `1.5`. The ladder's constants are not exported, and a literal `1.5` here would
 * be a second copy of the effectiveness table — the derived-data rule
 * (Constitution XV) applies to reading it as much as to writing it.
 *
 * A dual-typed power answers with the **better** of its two types, so `some` is
 * the right quantifier and it agrees with `powerEffectiveness` by construction.
 */
const isBaneHit = (types: readonly DamageType[], defender: HeroState): boolean => {
  const bane = getHero(defender.heroId).bane;
  return types.some((t) => t === bane);
};

// ---------------------------------------------------------------------------
// Common pool — one of six, every champion, the `common` slot
// ---------------------------------------------------------------------------

/**
 * *"battle start: gain a shield worth 30% of max HP"*
 *
 * **The only effect in the catalog with no hooks at all, and that is correct.**
 * It resolves in `apps/api/src/battle/board.ts` at board construction, beside
 * where a player's `Toughness` runes are already folded in before `maxHp` is
 * computed — a shield sized as a fraction of the pool has to be placed after the
 * pool is known and before the first turn, and that is the only place which is
 * both. An `onBattleStart` hook would be a seam with exactly one caller, in the
 * one module that does not need it.
 *
 * A test asserts this entry's inertness is *deliberate* rather than an unwritten
 * effect, by proving the shield exists on a real board.
 */
const BEFORE_THE_FIRST_BLOW: PassiveHooks = {
  name: 'Before the First Blow',
};

/** *"ward, one charge: ignore the first Stun **or Silence** applied to you"* */
const NOT_THIS_TIME: PassiveHooks = {
  name: 'Not This Time',
  /**
   * **A named class, never whatever lands first**, and `06-progression.md` argues
   * the case: magnitudes run 1–5, so an untargeted *"ignore the first debuff"* is
   * spent on a minor tick roughly 60% of the time and the Stun three turns later
   * lands anyway. Stun and Silence are the two that cost an entire action.
   *
   * The charge is spent by **returning what pays for it** — the same channel
   * `lethalGuard` uses — so *one charge* needs no field on `HeroState`, nothing to
   * snapshot and nothing to disclose. The refusal and the payment are one return
   * value because they are one decision; deciding them separately is how a ward
   * ends up refusing every Stun in the battle.
   */
  shapeIncoming: (instance, ctx) => {
    if (instance.kind !== 'stun' && instance.kind !== 'silence') return { instance, paid: [] };
    if (spent('not-this-time', ctx.hero)) return { instance, paid: [] };
    return { instance: null, paid: [latch('not-this-time', ctx.hero)] };
  },
};

/** *"first time below 50% HP: +20 `Might`, rest of battle"* */
const CORNERED: PassiveHooks = {
  name: 'Cornered',
  /**
   * **`onStruck`, which the resolver calls with the defender read off the board
   * *after* the blow landed** — so `hp` is already the post-damage value and the
   * threshold is tested against the state the player would see. Testing the
   * pre-damage hero would delay every trigger by one hit.
   */
  onStruck: (ctx) => {
    const hero = ctx.defender;
    if (spent('cornered', hero) || !belowHalf(hero)) return [];

    return [
      latch('cornered', hero),
      {
        kind: 'status',
        bearerInstanceId: hero.instanceId,
        status: fromRune('cornered', hero, 'buff', {
          stat: 'might',
          magnitude: M.corneredMight,
          turnsRemaining: PERMANENT,
        }),
      },
    ];
  },
};

/** *"first Bane hit you land: +10 `Penetration`, rest of battle"* */
const THE_POINT_PROVEN: PassiveHooks = {
  name: 'The Point Proven',
  onStrike: (ctx) => {
    const hero = ctx.attacker;
    if (spent('the-point-proven', hero)) return [];
    if (!isBaneHit(ctx.power.types, ctx.defender)) return [];

    return [
      latch('the-point-proven', hero),
      {
        kind: 'status',
        bearerInstanceId: hero.instanceId,
        status: fromRune('the-point-proven', hero, 'buff', {
          stat: 'penetration',
          magnitude: M.pointProvenPenetration,
          turnsRemaining: PERMANENT,
        }),
      },
    ];
  },
};

/** *"an ally falls: +15 `Speed`, rest of battle"* */
const THE_LINE_SHORTENS: PassiveHooks = {
  name: 'The Line Shortens',
  /**
   * **`onAnyDeath`, so reach never gates it** — the squad is shorter whether or
   * not you could have reached the one who fell.
   *
   * `step === cap` is how *"fires once"* is said without a latch: the second ally
   * to fall accumulates nothing, because the buff is already at its ceiling.
   */
  onAnyDeath: (ctx) => {
    if (ctx.fallen.side !== ctx.witness.side) return [];

    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.witness.instanceId,
        status: fromRune('the-line-shortens', ctx.witness, 'buff', {
          stat: 'speed',
          magnitude: 0,
          turnsRemaining: PERMANENT,
        }),
        step: M.lineShortensSpeed,
        cap: M.lineShortensSpeed,
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Earth
// ---------------------------------------------------------------------------

/** *"Bane hits you land permanently cost the target 10 `Speed`"* */
const MADE_HEAVY: PassiveHooks = {
  name: 'Made Heavy',
  /**
   * **One permanent debuff that refreshes, not a stack that climbs.** The design
   * says the target *"permanently costs 10 Speed"*, singular — and an uncapped
   * stacking slow would run a champion to zero `Speed` over a long battle, which
   * is a stun by another name and is priced nowhere. Same source refreshing is
   * exactly what `applyStatus` already does.
   */
  onStrike: (ctx) => {
    if (!isBaneHit(ctx.power.types, ctx.defender)) return [];

    return [
      {
        kind: 'status',
        bearerInstanceId: ctx.defender.instanceId,
        status: fromRune('made-heavy', ctx.attacker, 'debuff', {
          stat: 'speed',
          magnitude: -M.madeHeavySpeed,
          turnsRemaining: PERMANENT,
        }),
      },
    ];
  },
};

/** *"below 50%: +20 `Armor`, +20 `Magic Resist`, and you cannot be moved"* */
const WEIGHT_TELLS: PassiveHooks = {
  name: 'Weight Tells',
  /**
   * **A conditional stat, not a status** — nothing applies it and nothing expires
   * it, so it is worth more as the champion is worn down and worth nothing again
   * if it is healed, on the same turn, with nothing written to the board.
   *
   * ⚠️ *"and you cannot be moved from your row"* is **inert**, deliberately.
   * **LMNTLZ has no displacement mechanic at all** — reach gates targeting and
   * nothing relocates a champion — so there is nothing for the clause to refuse.
   * It is recorded here rather than answered by inventing forced movement, which
   * would be a combat system arriving as a side effect of one rune. Flagged in
   * `specs/021-rune-utility-effects/spec.md` as A-03.
   */
  statBonus: (ctx, stat) => {
    if (stat !== 'armor' && stat !== 'magicResist') return 0;
    return belowHalf(ctx.hero) ? M.weightTellsMitigation : 0;
  },
};

/** *"you cannot be critically hit"* */
const ALL_ONE_PIECE: PassiveHooks = {
  name: 'All One Piece',
  /**
   * **The crit is still rolled; it simply does not apply here.** One draw per
   * packet is shared by every target the payload reaches, so a defender's rune
   * cancelling the draw would shift the draw sequence for the whole board — an
   * `engineVersion` concern arising from one champion's private business.
   */
  critImmune: true,
};

// ---------------------------------------------------------------------------
// Air
// ---------------------------------------------------------------------------

/** *"on a killing blow, act again immediately"* */
const ON_THE_SAME_BREATH: PassiveHooks = {
  name: 'On the Same Breath',
  /**
   * **Bounded to one extra, and the bound is the payment** (spec A-04).
   *
   * The guard is a one-turn mark placed *after* Resolution has already ticked
   * durations, so it stands through the extra turn and is dropped by that turn's
   * own Resolution. An extra turn therefore cannot grant another, and a champion
   * clearing a squad does not take six turns in a row.
   *
   * Uncleansable, because a cleanse that unlocked a second extra turn would make
   * an enemy's helpful effect the strongest thing on the board.
   */
  actsAgain: (ctx) => {
    if (!ctx.killed || spent('on-the-same-breath', ctx.hero)) return null;

    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.hero.instanceId,
        status: fromRune('on-the-same-breath', ctx.hero, 'mark', {
          magnitude: 0,
          turnsRemaining: M.sameBreathGuardTurns,
          cleansable: false,
        }),
        step: 1,
        cap: 1,
      },
    ];
  },
};

/** *"first Bane hit taken: +20 `Agility`"* */
const HARDER_TO_FOLLOW: PassiveHooks = {
  name: 'Harder to Follow',
  onStruck: (ctx) => {
    const hero = ctx.defender;
    if (spent('harder-to-follow', hero)) return [];
    if (!isBaneHit(ctx.power.types, hero)) return [];

    return [
      latch('harder-to-follow', hero),
      {
        kind: 'status',
        bearerInstanceId: hero.instanceId,
        status: fromRune('harder-to-follow', hero, 'buff', {
          stat: 'agility',
          magnitude: M.harderToFollowAgility,
          turnsRemaining: PERMANENT,
        }),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Fire
// ---------------------------------------------------------------------------

/** *"killing blow: +15 `Might`, stacks 3×"* */
const IT_SPREADS: PassiveHooks = {
  name: 'It Spreads',
  /**
   * **The killing blow is readable from `onStrike` alone**, and that is why this
   * effect needed no new engine capability. The resolver builds the strike context
   * from the board *after* damage is folded, so a defender that just died is
   * present at `hp <= 0` — `onDeath` would have been the wrong hook twice over,
   * since `DeathContext` carries the witness and the fallen and never the killer.
   *
   * **The ceiling is 3 × 15 = 45**, which takes a `Might` 30 champion to exactly
   * the 75 cap. The design calls that legibility, which is why the step and the
   * stack count are separate constants rather than one total.
   */
  onStrike: (ctx) => {
    if (ctx.defender.hp > 0) return [];

    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.attacker.instanceId,
        status: fromRune('it-spreads', ctx.attacker, 'buff', {
          stat: 'might',
          magnitude: 0,
          turnsRemaining: PERMANENT,
        }),
        step: M.itSpreadsMight,
        cap: M.itSpreadsMight * M.itSpreadsStacks,
      },
    ];
  },
};

/** *"when struck, the attacker takes 15% of the packet"* */
const TOO_CLOSE: PassiveHooks = {
  name: 'Too Close',
  /**
   * **Of the packet, not of the damage that landed.** `packet = Might ×
   * power.multiplier` (`CLAUDE.md`) — before mitigation, before the type
   * multiplier, before the floor. A fraction of the *landed* number would make the
   * rune worth less exactly against the attackers it is meant to punish, since a
   * well-mitigated blow would reflect almost nothing.
   *
   * It is not an attack: no accuracy contest, no crit, no mitigation on the way
   * back. A defensive rune that swung would be a second attack the defender never
   * aimed, and would need a whole pipeline behind it.
   *
   * **It can kill** (FR-019), and the resolver treats that as a death like any
   * other — `lethalGuard` runs inside the fold and the caller sweeps for whoever
   * fell.
   */
  onStruck: (ctx) => [
    {
      kind: 'damage',
      bearerInstanceId: ctx.attacker.instanceId,
      amount: Math.round(packetOf(ctx.attacker, ctx.power) * M.tooCloseFraction),
    },
  ],
};

/** *"your damage-over-time effects tick again when you act"* */
const THE_DRAFT: PassiveHooks = {
  name: 'The Draft',
  /**
   * **Your effects on other champions, not the ones burning you.**
   *
   * `onUpkeep` fires at the top of the bearer's own turn, which is when *"when you
   * act"* begins. Every standing enemy carrying a damage-over-time effect this
   * champion applied takes its tick a second time, through `upkeepDamageFrom` —
   * the same arithmetic the ordinary Upkeep uses, restricted to a source, so
   * escalation and `Banked Coals` extensions are handled once rather than twice.
   *
   * Returned as `damage` effects rather than applied here, so `lethalGuard` and
   * the caller's death sweep both see it. A re-tick can finish somebody.
   */
  onUpkeep: (ctx) =>
    ctx.state.heroes
      .filter((h) => h.hp > 0 && h.instanceId !== ctx.hero.instanceId)
      .map((h) => ({ hero: h, extra: upkeepDamageFrom(h, ctx.hero.instanceId) }))
      .filter(({ extra }) => extra > 0)
      .map(({ hero, extra }) => ({
        kind: 'damage' as const,
        bearerInstanceId: hero.instanceId,
        amount: extra,
      })),
};

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

/** *"Bane hits you land halve the target's next heal"* */
const RUNS_DRY: PassiveHooks = {
  name: 'Runs Dry',
  onStrike: (ctx) => {
    if (!isBaneHit(ctx.power.types, ctx.defender)) return [];

    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.defender.instanceId,
        status: fromRune('runs-dry', ctx.attacker, 'mark', {
          magnitude: 0,
          turnsRemaining: PERMANENT,
          cleansable: false,
        }),
        step: 1,
        cap: 1,
      },
    ];
  },
  /**
   * **Read on the enemy who placed the mark, not on the champion being healed.**
   * That is why `healMultiplierFor` scans the whole board: a hook consulted only
   * on the target could express `Draws It Up` and could not express this at all.
   */
  healMultiplier: (ctx) =>
    markCount(ctx.target, ctx.holder.instanceId, runePowerId('runs-dry')) > 0
      ? M.runsDryHealMultiplier
      : 1,
  /** *"next heal"* — so the mark is spent the moment one lands, not on a clock. */
  onHealed: (ctx) =>
    markCount(ctx.target, ctx.holder.instanceId, runePowerId('runs-dry')) > 0
      ? [
          {
            kind: 'clear',
            bearerInstanceId: ctx.target.instanceId,
            sourceInstanceId: ctx.holder.instanceId,
            sourcePowerId: runePowerId('runs-dry'),
          },
        ]
      : [],
};

/** *"the first debuff applied is cleansed at end of turn, +20 `Resolve`"* */
const IT_PASSES_THROUGH: PassiveHooks = {
  name: 'It Passes Through',
  statBonus: (_ctx, stat) => (stat === 'resolve' ? M.passesThroughResolve : 0),
  /**
   * **`onAct` is *"at end of turn"*, and it runs after durations have ticked** —
   * so a one-turn debuff that was going to expire anyway is already gone and the
   * charge is not wasted on it.
   *
   * ⚠️ **A reading recorded rather than assumed.** The design says *"the first
   * debuff"*, singular; a status carries no arrival order, so *which* one is not
   * answerable from the board. This clears **every** negative effect standing at
   * the end of that turn, once per battle. It differs from the authored text only
   * when two or more debuffs are carried at that moment, and it differs in the
   * generous direction — which is the cheap one to correct under the
   * balance-upward rule, where a nerf writes off a player's spend.
   */
  onAct: (ctx) => {
    if (spent('it-passes-through', ctx.hero)) return [];
    if (!ctx.hero.statuses.some((s) => definitionOf(s.kind).polarity === 'negative')) return [];

    return [
      latch('it-passes-through', ctx.hero),
      { kind: 'cleanse', bearerInstanceId: ctx.hero.instanceId, polarity: 'negative' },
    ];
  },
};

/** *"healing you receive is increased by 40%"* */
const DRAWS_IT_UP: PassiveHooks = {
  name: 'Draws It Up',
  healMultiplier: (ctx) =>
    ctx.holder.instanceId === ctx.target.instanceId ? M.drawsItUpHealMultiplier : 1,
};

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/** *"enemies below half HP cannot dodge your attacks"* */
const HELD_IN_THE_LIGHT: PassiveHooks = {
  name: 'Held in the Light',
  /**
   * ⚠️ **The one thing in the game that goes above the 95% accuracy clamp** (spec
   * A-02). The clamp is documented at `hitProbability` and so is this exception;
   * *"cannot dodge"* is a statement about what is possible, and 95% is not it.
   *
   * Only when the bearer is the attacker. A floor read for the whole board would
   * make a Light champion standing behind you improve your accuracy, which is a
   * different effect nobody bought.
   */
  hitFloor: (ctx) =>
    ctx.holder.instanceId === ctx.attacker.instanceId && belowHalf(ctx.defender)
      ? M.heldInTheLightFloor
      : null,
};

/** *"the first ally to fall cleanses all debuffs from every survivor"* */
const THE_LAMP_LIFTED: PassiveHooks = {
  name: 'The Lamp Lifted',
  /**
   * **`onAnyDeath`, so reach never gates it** — the squad has lost somebody
   * whether or not the bearer could have reached them, exactly as
   * `The Line Shortens` reads it.
   *
   * Every *survivor* on the bearer's side, the bearer included. The fallen hero is
   * already at 0 HP and `fold` refuses to touch a hero that is down, so nothing has
   * to remember to exclude them.
   */
  onAnyDeath: (ctx) => {
    if (ctx.fallen.side !== ctx.witness.side) return [];
    if (spent('the-lamp-lifted', ctx.witness)) return [];

    const effects: PassiveEffect[] = [latch('the-lamp-lifted', ctx.witness)];

    for (const ally of ctx.state.heroes) {
      if (ally.side !== ctx.witness.side || ally.hp <= 0) continue;
      effects.push({ kind: 'cleanse', bearerInstanceId: ally.instanceId, polarity: 'negative' });
    }

    return effects;
  },
};

/** *"enemies cannot conceal or become untargetable against you; +10 `Perception`"* */
const NOWHERE_TO_STAND: PassiveHooks = {
  name: 'Nowhere to Stand',
  /**
   * **This is the effect the `targetingFor` bypass hid.** `ignoresFade` is read
   * for the *acting* champion, and that lookup called `hooksFor(...heroId)`
   * directly until 021 — so a rune granting it was consulted for every champion
   * on the board except the one taking a turn. It is also one half of a
   * deliberate counter-pair with Dark's `No One Saw`.
   */
  targeting: { ignoresFade: true },
  statBonus: (_ctx, stat) => (stat === 'perception' ? M.nowhereToStandPerception : 0),
};

// ---------------------------------------------------------------------------
// Dark
// ---------------------------------------------------------------------------

/** *"your first attack against a target that has not yet acted deals double"* */
const BEFORE_IT_KNEW: PassiveHooks = {
  name: 'Before It Knew',
  /**
   * Two conditions, and both are needed: the target has never taken a turn, and
   * **this** attacker has not hit it before. `hasActed` is written once, at
   * Resolution, so it means *"has had a turn"* rather than *"did something"* — a
   * chain-stunned defender is not permanently unaware.
   *
   * The mark is read here and placed in `onStrike`, so a swing is worth double
   * only when the count *before* it is zero — the same ordering `Again, There`
   * uses in the opposite direction.
   */
  damageMultiplier: (ctx) =>
    !ctx.defender.hasActed &&
    markCount(ctx.defender, ctx.attacker.instanceId, runePowerId('before-it-knew')) === 0
      ? M.beforeItKnewMultiplier
      : 1,
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromRune('before-it-knew', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: 1,
    },
  ],
};

/** *"below 50%: untargetable until your next turn"* */
const NO_ONE_SAW: PassiveHooks = {
  name: 'No One Saw',
  /**
   * **The predicate form of `targeting`, which is what it was added for** (021).
   * A static object cannot say *"below half"*, and reading a function as an object
   * would take it as truthy and fade its bearer for the whole battle.
   *
   * *"Until your next turn"* is the load-bearing half and is honoured by the latch
   * below: without it, a champion below half could never be finished off, which is
   * a different and much larger effect than the one that was priced. So the fade
   * covers the window between dropping low and getting to act — the escape the
   * design describes — and then it is done for the battle.
   *
   * One half of a deliberate counter-pair: Light's `Nowhere to Stand` sees through
   * it, and `composeTargeting` gives the negation precedence (spec A-05).
   */
  targeting: (ctx) => ({ fades: belowHalf(ctx.hero) && !spent('no-one-saw', ctx.hero) }),
  onUpkeep: (ctx) =>
    belowHalf(ctx.hero) && !spent('no-one-saw', ctx.hero) ? [latch('no-one-saw', ctx.hero)] : [],
};

/** *"debuffs you apply last one turn longer"* */
const IT_LINGERS: PassiveHooks = {
  name: 'It Lingers',
  /**
   * **Negative effects only**, so this never extends a shield or a buff the
   * champion hands an ally. `PERMANENT` is `Infinity` and `Infinity + 1` is
   * `Infinity`, so a permanent effect passes through unchanged rather than
   * becoming a finite duration — which is the arithmetic accident this would
   * otherwise be.
   */
  shapeOutgoing: (instance) =>
    definitionOf(instance.kind).polarity === 'negative'
      ? { ...instance, turnsRemaining: instance.turnsRemaining + M.itLingersExtraTurns }
      : instance,
};

// ---------------------------------------------------------------------------
// Slash
// ---------------------------------------------------------------------------

/** *"consecutive attacks on the same target deal +10% each, resetting on switch"* */
const AGAIN_THERE: PassiveHooks = {
  name: 'Again, There',
  damageMultiplier: (ctx) =>
    1 + markCount(ctx.defender, ctx.attacker.instanceId, runePowerId('again-there')) * M.againThereStep,
  /**
   * **The reset is what makes it *consecutive* rather than cumulative**, and it
   * costs one clear per other enemy. Reading the count in `damageMultiplier` and
   * placing the mark in `onStrike` means a swing is worth the count *before*
   * itself — so the first blow on a target is worth nothing extra, which is what
   * "consecutive" has to mean to not be a free bonus.
   */
  onStrike: (ctx) => {
    const effects: PassiveEffect[] = ctx.state.heroes
      .filter((h) => h.side !== ctx.attacker.side && h.instanceId !== ctx.defender.instanceId)
      .map((other) => ({
        kind: 'clear' as const,
        bearerInstanceId: other.instanceId,
        sourceInstanceId: ctx.attacker.instanceId,
        sourcePowerId: runePowerId('again-there'),
      }));

    effects.push({
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromRune('again-there', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: PERMANENT,
    });

    return effects;
  },
};

/** *"damage-over-time you apply cannot be cleansed or reduced"* */
const IT_STAYS_OPEN: PassiveHooks = {
  name: 'It Stays Open',
  /**
   * **`cleansable: false` says both halves of it.** *"Cannot be cleansed"* is what
   * the flag has always meant; *"or reduced"* is the rule 021 wrote down at
   * `The Deep Holds` — an effect nothing may end early is also an effect nothing
   * may clip a turn off. One flag, one rule, checked in one place.
   *
   * The whole damage-over-time family, because the design says *"damage-over-time
   * you apply"* rather than naming a kind — unlike Fire's `It Catches`, which
   * `05-status.md` restricts to burns specifically.
   */
  shapeOutgoing: (instance) =>
    definitionOf(instance.kind).ticksDamage ? { ...instance, cleansable: false } : instance,
};

// ---------------------------------------------------------------------------
// Pierce
// ---------------------------------------------------------------------------

/** *"the first critical hit against you lands as a normal hit"* */
const TURNED_ASIDE: PassiveHooks = {
  name: 'Turned Aside',
  /**
   * A ward, and it pays the same way `Not This Time` and `lethalGuard` do —
   * `null` means the charge is gone, and a non-null result is what spending it
   * costs. The crit **draw** is untouched; only its application to this defender
   * is refused.
   */
  critDowngrade: (ctx) =>
    spent('turned-aside', ctx.hero) ? null : [latch('turned-aside', ctx.hero)],
};

/** *"your attacks ignore shields"* */
const STRAIGHT_PAST: PassiveHooks = {
  name: 'Straight Past',
  /**
   * **Through, not around.** The shield keeps its magnitude and the whole packet
   * reaches HP — consuming it as well would make this strictly better than simply
   * removing the shield, which is more than 200 shards bought.
   *
   * The deliberate answer to `Before the First Blow`, which the design expects to
   * be the most-taken effect in the common pool.
   */
  ignoresShields: true,
};

/** *"+15 `Penetration` against any enemy you have already struck"* */
const THE_WAY_IN: PassiveHooks = {
  name: 'The Way In',
  penetrationBonus: (ctx) =>
    markCount(ctx.defender, ctx.attacker.instanceId, runePowerId('the-way-in')) > 0
      ? M.theWayInPenetration
      : 0,
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromRune('the-way-in', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: 1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Crush
// ---------------------------------------------------------------------------

/** *"mitigation shred you apply cannot be cleansed and lasts the battle"* */
const STAYS_BROKEN: PassiveHooks = {
  name: 'Stays Broken',
  /**
   * Two clauses, two fields, and they are **independent** (`05-status.md`):
   * `PERMANENT` says when it ends, `cleansable` says whether anything may end it
   * early. Water's `Wears Through` sets only the first, which is why a Water shred
   * still washes off under a cleanse and this one does not.
   */
  shapeOutgoing: (instance) =>
    instance.kind === 'shred'
      ? { ...instance, turnsRemaining: PERMANENT, cleansable: false }
      : instance,
};

/** *"below 50%: Stun every enemy in reach for 1 turn"* */
const THE_FLOOR_COMES_UP: PassiveHooks = {
  name: 'The Floor Comes Up',
  onStruck: (ctx) => {
    const hero = ctx.defender;
    if (spent('the-floor-comes-up', hero) || !belowHalf(hero)) return [];

    const effects: PassiveEffect[] = [latch('the-floor-comes-up', hero)];

    for (const other of ctx.state.heroes) {
      if (other.side === hero.side || other.hp <= 0) continue;
      if (!inReach(ctx.state, hero.instanceId, other.row)) continue;

      effects.push({
        kind: 'status',
        bearerInstanceId: other.instanceId,
        status: fromRune('the-floor-comes-up', hero, 'stun', {
          magnitude: 0,
          turnsRemaining: M.floorComesUpTurns,
        }),
      });
    }

    return effects;
  },
};

/**
 * The catalog, by id.
 *
 * Filled across 021's four stories. A test derives its expectations from
 * `Object.keys` of this object and from `DAMAGE_TYPES`, so an effect that is
 * missing **fails** rather than quietly shrinking a pool — which is the
 * *"fixed single effect per pool"* outcome the design names as the one to avoid,
 * because it strands half the elemental shard sink.
 */
export const RUNE_EFFECTS: Readonly<Record<string, RuneEffect>> = Object.freeze({
  // -- common --------------------------------------------------------------
  cornered: {
    id: 'cornered',
    name: 'Cornered',
    description: `The first time you drop below half health, gain ${M.corneredMight} Might for the rest of the battle.`,
    pool: 'common',
    role: 'offense',
    shape: 'trigger',
    hooks: CORNERED,
  },
  'the-point-proven': {
    id: 'the-point-proven',
    name: 'The Point Proven',
    description: `The first Bane hit you land grants ${M.pointProvenPenetration} Penetration for the rest of the battle.`,
    pool: 'common',
    role: 'offense',
    shape: 'trigger',
    hooks: THE_POINT_PROVEN,
  },
  'the-line-shortens': {
    id: 'the-line-shortens',
    name: 'The Line Shortens',
    description: `When an ally falls, gain ${M.lineShortensSpeed} Speed for the rest of the battle.`,
    pool: 'common',
    role: 'tempo',
    shape: 'trigger',
    hooks: THE_LINE_SHORTENS,
  },

  'before-the-first-blow': {
    id: 'before-the-first-blow',
    name: 'Before the First Blow',
    description: `Begin every battle with a shield worth ${pct(M.firstBlowShieldFraction)} of your maximum health.`,
    pool: 'common',
    role: 'defense',
    shape: 'trigger',
    hooks: BEFORE_THE_FIRST_BLOW,
  },
  'not-this-time': {
    id: 'not-this-time',
    name: 'Not This Time',
    description: 'Ignore the first Stun or Silence applied to you.',
    pool: 'common',
    role: 'defense',
    shape: 'ward',
    hooks: NOT_THIS_TIME,
  },

  // -- Earth ---------------------------------------------------------------
  'made-heavy': {
    id: 'made-heavy',
    name: 'Made Heavy',
    description: `Bane hits you land cost the target ${M.madeHeavySpeed} Speed for the rest of the battle.`,
    pool: 'earth',
    role: 'offense',
    shape: 'trigger',
    hooks: MADE_HEAVY,
  },
  'weight-tells': {
    id: 'weight-tells',
    name: 'Weight Tells',
    description: `Below half health, gain ${M.weightTellsMitigation} Armor and ${M.weightTellsMitigation} Magic Resist.`,
    pool: 'earth',
    role: 'defense',
    shape: 'trigger',
    hooks: WEIGHT_TELLS,
  },

  'all-one-piece': {
    id: 'all-one-piece',
    name: 'All One Piece',
    description: 'You cannot be critically hit.',
    pool: 'earth',
    role: 'tempo',
    shape: 'ward',
    hooks: ALL_ONE_PIECE,
  },

  // -- Air -----------------------------------------------------------------
  'on-the-same-breath': {
    id: 'on-the-same-breath',
    name: 'On the Same Breath',
    description: 'Land a killing blow and take another turn immediately. Once per battle.',
    pool: 'air',
    role: 'offense',
    shape: 'trigger',
    hooks: ON_THE_SAME_BREATH,
  },
  'harder-to-follow': {
    id: 'harder-to-follow',
    name: 'Harder to Follow',
    description: `The first Bane hit you take grants ${M.harderToFollowAgility} Agility for the rest of the battle.`,
    pool: 'air',
    role: 'defense',
    shape: 'trigger',
    hooks: HARDER_TO_FOLLOW,
  },

  // -- Fire ----------------------------------------------------------------
  'it-spreads': {
    id: 'it-spreads',
    name: 'It Spreads',
    description: `Each killing blow grants ${M.itSpreadsMight} Might, up to ${M.itSpreadsStacks} times.`,
    pool: 'fire',
    role: 'offense',
    shape: 'trigger',
    hooks: IT_SPREADS,
  },

  'too-close': {
    id: 'too-close',
    name: 'Too Close',
    description: `When you are struck, the attacker takes ${pct(M.tooCloseFraction)} of the packet.`,
    pool: 'fire',
    role: 'defense',
    shape: 'trigger',
    hooks: TOO_CLOSE,
  },
  'the-draft': {
    id: 'the-draft',
    name: 'The Draft',
    description: 'Damage-over-time effects you applied tick again when you act.',
    pool: 'fire',
    role: 'tempo',
    shape: 'trigger',
    hooks: THE_DRAFT,
  },

  // -- Water ---------------------------------------------------------------
  'runs-dry': {
    id: 'runs-dry',
    name: 'Runs Dry',
    description: `Bane hits you land cut the target's next heal to ${pct(M.runsDryHealMultiplier)}.`,
    pool: 'water',
    role: 'offense',
    shape: 'trigger',
    hooks: RUNS_DRY,
  },
  'it-passes-through': {
    id: 'it-passes-through',
    name: 'It Passes Through',
    description: `Gain ${M.passesThroughResolve} Resolve, and shed the debuffs on you at the end of your turn. Once per battle.`,
    pool: 'water',
    role: 'defense',
    shape: 'ward',
    hooks: IT_PASSES_THROUGH,
  },
  'draws-it-up': {
    id: 'draws-it-up',
    name: 'Draws It Up',
    description: `Healing you receive is increased by ${pct(M.drawsItUpHealMultiplier - 1)}.`,
    pool: 'water',
    role: 'tempo',
    shape: 'trigger',
    hooks: DRAWS_IT_UP,
  },

  // -- Light ---------------------------------------------------------------
  'held-in-the-light': {
    id: 'held-in-the-light',
    name: 'Held in the Light',
    description: 'Enemies below half health cannot dodge your attacks.',
    pool: 'light',
    role: 'offense',
    shape: 'trigger',
    hooks: HELD_IN_THE_LIGHT,
  },
  'the-lamp-lifted': {
    id: 'the-lamp-lifted',
    name: 'The Lamp Lifted',
    description: 'The first ally to fall clears every debuff from the survivors.',
    pool: 'light',
    role: 'tempo',
    shape: 'trigger',
    hooks: THE_LAMP_LIFTED,
  },
  'nowhere-to-stand': {
    id: 'nowhere-to-stand',
    name: 'Nowhere to Stand',
    description: `Enemies cannot conceal themselves from you, and you gain ${M.nowhereToStandPerception} Perception.`,
    pool: 'light',
    role: 'defense',
    shape: 'trigger',
    hooks: NOWHERE_TO_STAND,
  },

  // -- Dark ----------------------------------------------------------------
  'before-it-knew': {
    id: 'before-it-knew',
    name: 'Before It Knew',
    description: `Your first attack on a target that has not yet taken a turn deals ${M.beforeItKnewMultiplier}× damage.`,
    pool: 'dark',
    role: 'offense',
    shape: 'trigger',
    hooks: BEFORE_IT_KNEW,
  },
  'no-one-saw': {
    id: 'no-one-saw',
    name: 'No One Saw',
    description: 'Drop below half health and nothing can target you until your next turn. Once per battle.',
    pool: 'dark',
    role: 'defense',
    shape: 'ward',
    hooks: NO_ONE_SAW,
  },
  'it-lingers': {
    id: 'it-lingers',
    name: 'It Lingers',
    description: `Debuffs you apply last ${M.itLingersExtraTurns} turn longer.`,
    pool: 'dark',
    role: 'tempo',
    shape: 'trigger',
    hooks: IT_LINGERS,
  },

  // -- Slash ---------------------------------------------------------------
  'again-there': {
    id: 'again-there',
    name: 'Again, There',
    description: `Each consecutive attack on the same target deals ${pct(M.againThereStep)} more. Switching targets resets it.`,
    pool: 'slash',
    role: 'offense',
    shape: 'trigger',
    hooks: AGAIN_THERE,
  },

  'it-stays-open': {
    id: 'it-stays-open',
    name: 'It Stays Open',
    description: 'Damage-over-time you apply cannot be cleansed or shortened.',
    pool: 'slash',
    role: 'tempo',
    shape: 'trigger',
    hooks: IT_STAYS_OPEN,
  },

  // -- Pierce --------------------------------------------------------------
  'turned-aside': {
    id: 'turned-aside',
    name: 'Turned Aside',
    description: 'The first critical hit against you lands as an ordinary one.',
    pool: 'pierce',
    role: 'defense',
    shape: 'ward',
    hooks: TURNED_ASIDE,
  },
  'straight-past': {
    id: 'straight-past',
    name: 'Straight Past',
    description: 'Your attacks pass through shields without spending them.',
    pool: 'pierce',
    role: 'tempo',
    shape: 'trigger',
    hooks: STRAIGHT_PAST,
  },
  'the-way-in': {
    id: 'the-way-in',
    name: 'The Way In',
    description: `Gain ${M.theWayInPenetration} Penetration against any enemy you have already struck.`,
    pool: 'pierce',
    role: 'offense',
    shape: 'trigger',
    hooks: THE_WAY_IN,
  },

  // -- Crush ---------------------------------------------------------------
  'stays-broken': {
    id: 'stays-broken',
    name: 'Stays Broken',
    description: 'Mitigation shred you apply cannot be cleansed and lasts the whole battle.',
    pool: 'crush',
    role: 'tempo',
    shape: 'trigger',
    hooks: STAYS_BROKEN,
  },
  'the-floor-comes-up': {
    id: 'the-floor-comes-up',
    name: 'The Floor Comes Up',
    description: `The first time you drop below half health, stun every enemy in reach for ${M.floorComesUpTurns} turn.`,
    pool: 'crush',
    role: 'defense',
    shape: 'trigger',
    hooks: THE_FLOOR_COMES_UP,
  },
});

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/**
 * The effects whose implementation is **not a hook**, declared so the
 * anti-vacuity guard can tell a deliberate exception from a forgotten one.
 *
 * A catalog entry with no hooks is normally decoration — a name a player pays 200
 * shards for and nothing runs. Exactly one is legitimately empty:
 * `Before the First Blow` places its shield at board construction, where `maxHp`
 * is already known and no turn has been taken.
 *
 * **Declaring it is only half the guard.** A list in the source can be extended to
 * excuse anything, so `apps/api` holds the other half: a test there asserts every
 * id named here is mentioned in `board.ts` *and* that the shield is really on a
 * built board. An effect that quietly lost its hooks would have to be added here
 * and implemented there before the suite goes green again.
 */
export const RESOLVED_AT_BOARD_BUILD: readonly string[] = Object.freeze([
  'before-the-first-blow',
]);

/** Every effect a pool offers, in catalog order. */
export function effectsInPool(pool: PoolKey): readonly RuneEffect[] {
  return Object.values(RUNE_EFFECTS).filter((e) => e.pool === pool);
}

/** What a slot offers on a champion — the pool derivation and the lookup, composed. */
export function effectsForSlot(heroId: string, slot: RuneSlot): readonly RuneEffect[] {
  return effectsInPool(poolOf(heroId, slot));
}

export class UnknownRuneEffectError extends Error {
  constructor(id: string) {
    super(`no rune utility effect "${id}" in the catalog`);
    this.name = 'UnknownRuneEffectError';
  }
}

/**
 * The hooks a set of chosen effects carries.
 *
 * **Throws on an id it does not know**, rather than skipping it. An unknown id
 * resolving to an inert battle is the exact failure this feature exists to end —
 * a player would have paid 200 shards and be told nothing. Unimplemented *passives*
 * are skipped for the opposite reason: nineteen were still unwritten when that code
 * shipped, and a battle must not fail because a name has no effect yet. Here every
 * id in the catalog has an implementation by construction, so an unknown one is
 * corruption rather than an unfinished feature.
 */
export function runeHooksFor(ids: readonly string[]): readonly PassiveHooks[] {
  const hooks: PassiveHooks[] = [];
  for (const id of ids) {
    const found = RUNE_EFFECTS[id];
    if (!found) throw new UnknownRuneEffectError(id);
    hooks.push(found.hooks);
  }
  return hooks;
}
