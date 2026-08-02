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
import type { PassiveHooks } from './passives.js';

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

/**
 * The catalog, by id.
 *
 * Filled across 021's four stories. A test derives its expectations from
 * `Object.keys` of this object and from `DAMAGE_TYPES`, so an effect that is
 * missing **fails** rather than quietly shrinking a pool — which is the
 * *"fixed single effect per pool"* outcome the design names as the one to avoid,
 * because it strands half the elemental shard sink.
 */
export const RUNE_EFFECTS: Readonly<Record<string, RuneEffect>> = Object.freeze({});

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
