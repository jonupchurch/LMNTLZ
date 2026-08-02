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
import { maxHp, type HeroState, type StatusInstance } from './state.js';
import { PERMANENT, definitionOf, markCount, statusFrom, type StatKey } from './status.js';

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
  readonly pool: PoolKey;
  readonly role: EffectRole;
  readonly shape: EffectShape;
  readonly hooks: PassiveHooks;
}

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

// ---------------------------------------------------------------------------
// Air
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pierce
// ---------------------------------------------------------------------------

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
    pool: 'common',
    role: 'offense',
    shape: 'trigger',
    hooks: CORNERED,
  },
  'the-point-proven': {
    id: 'the-point-proven',
    name: 'The Point Proven',
    pool: 'common',
    role: 'offense',
    shape: 'trigger',
    hooks: THE_POINT_PROVEN,
  },
  'the-line-shortens': {
    id: 'the-line-shortens',
    name: 'The Line Shortens',
    pool: 'common',
    role: 'tempo',
    shape: 'trigger',
    hooks: THE_LINE_SHORTENS,
  },

  // -- Earth ---------------------------------------------------------------
  'made-heavy': {
    id: 'made-heavy',
    name: 'Made Heavy',
    pool: 'earth',
    role: 'offense',
    shape: 'trigger',
    hooks: MADE_HEAVY,
  },
  'weight-tells': {
    id: 'weight-tells',
    name: 'Weight Tells',
    pool: 'earth',
    role: 'defense',
    shape: 'trigger',
    hooks: WEIGHT_TELLS,
  },

  // -- Air -----------------------------------------------------------------
  'harder-to-follow': {
    id: 'harder-to-follow',
    name: 'Harder to Follow',
    pool: 'air',
    role: 'defense',
    shape: 'trigger',
    hooks: HARDER_TO_FOLLOW,
  },

  // -- Fire ----------------------------------------------------------------
  'it-spreads': {
    id: 'it-spreads',
    name: 'It Spreads',
    pool: 'fire',
    role: 'offense',
    shape: 'trigger',
    hooks: IT_SPREADS,
  },

  // -- Light ---------------------------------------------------------------
  'nowhere-to-stand': {
    id: 'nowhere-to-stand',
    name: 'Nowhere to Stand',
    pool: 'light',
    role: 'defense',
    shape: 'trigger',
    hooks: NOWHERE_TO_STAND,
  },

  // -- Dark ----------------------------------------------------------------
  'it-lingers': {
    id: 'it-lingers',
    name: 'It Lingers',
    pool: 'dark',
    role: 'tempo',
    shape: 'trigger',
    hooks: IT_LINGERS,
  },

  // -- Slash ---------------------------------------------------------------
  'again-there': {
    id: 'again-there',
    name: 'Again, There',
    pool: 'slash',
    role: 'offense',
    shape: 'trigger',
    hooks: AGAIN_THERE,
  },

  // -- Pierce --------------------------------------------------------------
  'the-way-in': {
    id: 'the-way-in',
    name: 'The Way In',
    pool: 'pierce',
    role: 'offense',
    shape: 'trigger',
    hooks: THE_WAY_IN,
  },

  // -- Crush ---------------------------------------------------------------
  'the-floor-comes-up': {
    id: 'the-floor-comes-up',
    name: 'The Floor Comes Up',
    pool: 'crush',
    role: 'defense',
    shape: 'trigger',
    hooks: THE_FLOOR_COMES_UP,
  },
});

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

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
