/**
 * Status effects — everything a power does beyond its damage number
 * (`resources/mechanics/05-status.md`, feature 020).
 *
 * ### What this file ends
 *
 * The engine was built to have a status system and then never given one.
 * `StatusInstance` and `HeroState.statuses` have existed since 002; **nothing has
 * ever written one.** `applyResolution` has been ticking durations down on an
 * empty array, `isIncapacitated` has been reading a field that is always `[]`,
 * `legalTargets` has accepted taunt and fade filters no caller passes, and
 * `resolve.ts` has returned `ridersLanded: []` hardcoded at every exit.
 *
 * So combat has been pure damage arithmetic, and every stun, burn, shield, slow,
 * shred and buff a power's text promises has been decoration. This file is the
 * missing middle: a catalog, an applier, and the readers.
 *
 * ### Two rules that shape the whole design
 *
 * **1. No magnitude is authored.** Everything derives from the tier of the power
 * applying it (Constitution XV). A rider says *which family, which stat, at
 * whom*; how much and how long come from the tables below. That is what lets a
 * rebalance edit one table instead of 87 power entries — and it is why
 * `powerSchema` rejects a rider carrying a number.
 *
 * **2. This file is pure.** No RNG, no clock, no I/O. The *contest* that decides
 * whether a hostile rider sticks is a draw, so it lives in `resolver/` beside the
 * hit and crit draws (Constitution XII). `determinism.test.ts` evaluates rules a
 * thousand times and demands byte-identical answers; a die in here would end
 * that.
 *
 * ### ⚠️ The trap this file is built around
 *
 * `HeroState.statMods` looks like the obvious home for a `+10 Might` buff. **It
 * already holds rune points** — `board.ts` writes a player's allocations there.
 * One shared bag makes a buff and a rune indistinguishable, so expiring a 2-turn
 * buff would subtract 10 from what the player *bought*: silent, permanent, and
 * only for players who own runes.
 *
 * So the status contribution is **derived, never stored**. `statusPoints` sums it
 * off `hero.statuses` and `effectiveStat` adds it on top of `statMods`. Expiry is
 * then correct by construction — dropping the status is the entire operation, and
 * nothing has to remember to subtract anything.
 */

import type { Hero } from '@lmntlz/content';
import type { HeroState, StatusInstance } from './state.js';

export type StatKey = keyof Hero['stats'];

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export type StatusKind =
  | 'burn'
  | 'bleed'
  | 'poison'
  | 'buff'
  | 'debuff'
  | 'shred'
  | 'shield'
  | 'taunt'
  | 'fade'
  | 'stun'
  | 'silence';

export type StatusFamily =
  | 'damage-over-time'
  | 'stat-modifier'
  | 'mitigation-shred'
  | 'shield'
  | 'targeting'
  | 'control';

/**
 * How a kind behaves when it meets another of its own kind.
 *
 * **`refresh-only` is not `capped` with a limit of 1.** A second stun does not
 * replace the first, it re-arms its duration — and the difference matters,
 * because `05-status.md` calls one turn of stun *"the strongest single effect in
 * the game"* and says it should never scale past that. A cap of 1 that let a
 * larger stun displace a smaller one would be a way to scale it.
 */
export type StackRule =
  | { readonly mode: 'capped'; readonly limit: number }
  | { readonly mode: 'largest-wins' }
  | { readonly mode: 'refresh-only' }
  | { readonly mode: 'unbounded' };

export interface StatusDefinition {
  readonly kind: StatusKind;
  readonly family: StatusFamily;
  readonly stacking: StackRule;
  /** Ticks damage in the bearer's Upkeep. Only the damage-over-time family does. */
  readonly ticksDamage: boolean;
  /** Requires a stat named on the rider. */
  readonly needsStat: boolean;
  /** Negative effects are what a cleanse removes; positive ones are what a strip removes. */
  readonly polarity: 'negative' | 'positive';
}

const define = (
  kind: StatusKind,
  family: StatusFamily,
  stacking: StackRule,
  polarity: 'negative' | 'positive',
  options: { readonly ticksDamage?: boolean; readonly needsStat?: boolean } = {},
): StatusDefinition => ({
  kind,
  family,
  stacking,
  polarity,
  ticksDamage: options.ticksDamage ?? false,
  needsStat: options.needsStat ?? false,
});

/**
 * The six families of `05-status.md`, and every kind in them.
 *
 * **Stat buffs are `unbounded` and that is not an oversight.** The 75 stat cap
 * already is the ceiling: a hero at `Might` 45 taking three +10 buffs reaches 75,
 * not 85, because `cappedStat` clamps. That is exactly why runic gear can be
 * generous about stacking without anything running away, so a second limit here
 * would be a rule with no work to do.
 */
export const STATUS_CATALOG: Readonly<Record<StatusKind, StatusDefinition>> = Object.freeze({
  // Damage over time — 3 instances per target.
  burn: define('burn', 'damage-over-time', { mode: 'capped', limit: 3 }, 'negative', {
    ticksDamage: true,
  }),
  bleed: define('bleed', 'damage-over-time', { mode: 'capped', limit: 3 }, 'negative', {
    ticksDamage: true,
  }),
  poison: define('poison', 'damage-over-time', { mode: 'capped', limit: 3 }, 'negative', {
    ticksDamage: true,
  }),

  // Stat modifiers — the 75 cap is the ceiling.
  buff: define('buff', 'stat-modifier', { mode: 'unbounded' }, 'positive', { needsStat: true }),
  debuff: define('debuff', 'stat-modifier', { mode: 'unbounded' }, 'negative', { needsStat: true }),

  // Mitigation shred — a percentage of the stat, never flat points.
  shred: define('shred', 'mitigation-shred', { mode: 'unbounded' }, 'negative', { needsStat: true }),

  // Shields — one at a time, the larger replacing the smaller.
  shield: define('shield', 'shield', { mode: 'largest-wins' }, 'positive'),

  // Targeting — they cancel on the same hero, which is Tank vs Buffer.
  taunt: define('taunt', 'targeting', { mode: 'refresh-only' }, 'negative'),
  fade: define('fade', 'targeting', { mode: 'refresh-only' }, 'positive'),

  // Control — never stack; duration refreshes only.
  stun: define('stun', 'control', { mode: 'refresh-only' }, 'negative'),
  silence: define('silence', 'control', { mode: 'refresh-only' }, 'negative'),
});

export const STATUS_KINDS: readonly StatusKind[] = Object.freeze(
  Object.keys(STATUS_CATALOG) as StatusKind[],
);

/** The crowd-control kinds — what `isIncapacitated` and `phasesFor` act on. */
export const CROWD_CONTROL: ReadonlySet<StatusKind> = new Set<StatusKind>(['stun']);

export const definitionOf = (kind: StatusKind): StatusDefinition => STATUS_CATALOG[kind];

// ---------------------------------------------------------------------------
// Magnitudes, derived from tier
// ---------------------------------------------------------------------------

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The indexed scale. **Every tier strictly beats the one below on at least one
 * axis, alternating between magnitude and duration**, and that is load-bearing
 * rather than decorative: the authored prompts write tier-2 powers as escalations
 * of their tier-1 counterpart — *"the slow from Root and Hold, extended to 2
 * turns"* — which only makes sense if tier 1 lasts exactly one turn.
 *
 * An earlier draft banded tiers 1–2 together at 2 turns, which silently made
 * every tier-2 rider identical to its tier-1 original.
 *
 * Index 0 is the tier-0 auto-attack, which carries no rider at all.
 */
const STAT_CHANGE: readonly number[] = Object.freeze([0, 10, 15, 15, 20, 25]);
const DURATION: readonly number[] = Object.freeze([0, 1, 2, 3, 3, 4]);
const DOT_FRACTION: readonly number[] = Object.freeze([0, 0.25, 0.35, 0.4, 0.5, 0.6]);
const SHIELD_FRACTION: readonly number[] = Object.freeze([0, 1, 1.5, 1.5, 2, 2.5]);

/**
 * 20 · 28 · 36 · 44 · 52, contested against `Resolve` on the `Luck` die.
 *
 * **The ladder is tuned to the die and breaks outside it.** An earlier version ran
 * 20–70, fitted to a `d100`. Against a Luck-sized die of 22–60 a potency of 70 is
 * unbridgeable — a tier-5 rider landed automatically against **243 of 729 pairs**.
 * The usable band is roughly 20 to 60: below it low tiers can never land, above it
 * high tiers can never be resisted. **Any change to `Luck`'s die multiplier has to
 * refit this table.**
 */
const POTENCY: readonly number[] = Object.freeze([0, 20, 28, 36, 44, 52]);

const at = (table: readonly number[], tier: Tier): number => table[tier] ?? 0;

/** Points a tier-`n` buff or debuff moves a stat by. */
export const statChangeForTier = (tier: Tier): number => at(STAT_CHANGE, tier);

/** Turns a tier-`n` effect lasts. */
export const durationForTier = (tier: Tier): number => at(DURATION, tier);

/** Per-tick damage of a tier-`n` damage-over-time effect, from the applier's `Might`. */
export const dotTickForTier = (tier: Tier, might: number): number =>
  Math.round(might * at(DOT_FRACTION, tier));

/** Absorbable HP of a tier-`n` shield, from the applier's `Might`. */
export const shieldForTier = (tier: Tier, might: number): number =>
  Math.round(might * at(SHIELD_FRACTION, tier));

/** The rider contest's attacking value. */
export const potencyForTier = (tier: Tier): number => at(POTENCY, tier);

/**
 * **Crowd control is priced separately**, because losing a turn is worth far more
 * than any stat change. A stun does not get longer because it came off a tier-5.
 */
export const CONTROL_DURATION = 1;

/**
 * Shred is the one magnitude **not** derived from tier.
 *
 * **A percentage of the stat, never flat points**, and the arithmetic is why:
 * mitigation is `75 / (75 + E)`, steepest at low `E`, so a *flat* shred is worth
 * more against a lightly armored target than a heavily armored one — exactly
 * backwards for an effect called "find the seam". A percentage scales
 * monotonically.
 */
export type ShredBand = 'small' | 'moderate' | 'large';

const SHRED: Readonly<Record<ShredBand, number>> = Object.freeze({
  small: 0.2,
  moderate: 0.3,
  large: 0.4,
});

export const shredFraction = (band: ShredBand): number => SHRED[band];

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * **The identity of "the same source".**
 *
 * `05-status.md`: *different sources stack, the same source refreshes*. Sameness
 * is the triple — bearer-agnostic, since a status list belongs to one hero.
 *
 * **`sourcePowerId` is not optional here.** Keying on the instance alone would
 * make two *different* powers on one hero refresh each other, quietly turning a
 * designed combo into a no-op — and it would read as a balance problem rather
 * than a bug.
 */
const sameSource = (a: StatusInstance, b: StatusInstance): boolean =>
  a.kind === b.kind &&
  a.sourceInstanceId === b.sourceInstanceId &&
  a.sourcePowerId === b.sourcePowerId;

/**
 * Apply one effect, honouring its kind's stacking rule.
 *
 * Returns the **whole list** rather than the instance, because stacking is a
 * decision about the set: a fourth burn is refused outright, and a smaller shield
 * does not displace a larger one. A caller that only got an instance back would
 * have to re-implement those rules to know what to do with it.
 *
 * Refreshing takes the **longer** of the two durations rather than always the
 * incoming one, so re-applying a power cannot *shorten* an effect that something
 * else extended — `Banked Coals` adds a turn, and a re-cast should not take it
 * away.
 */
export function applyStatus(
  existing: readonly StatusInstance[],
  incoming: StatusInstance,
): readonly StatusInstance[] {
  const rule = definitionOf(incoming.kind).stacking;

  const refreshed = existing.map((s) =>
    sameSource(s, incoming)
      ? { ...s, turnsRemaining: Math.max(s.turnsRemaining, incoming.turnsRemaining) }
      : s,
  );

  // The same source is always a refresh, whatever the mode.
  if (refreshed.some((s) => sameSource(s, incoming))) return refreshed;

  const sameKind = refreshed.filter((s) => s.kind === incoming.kind);

  switch (rule.mode) {
    case 'refresh-only': {
      /*
       * A different source of a non-stacking effect re-arms the one already
       * there rather than adding a second. Two stuns on one hero must never be
       * representable, not merely never produced.
       */
      if (sameKind.length === 0) return [...refreshed, incoming];
      let done = false;
      return refreshed.map((s) => {
        if (done || s.kind !== incoming.kind) return s;
        done = true;
        return { ...s, turnsRemaining: Math.max(s.turnsRemaining, incoming.turnsRemaining) };
      });
    }

    case 'largest-wins': {
      const strongest = sameKind.reduce<StatusInstance | null>(
        (best, s) => (best === null || s.magnitude > best.magnitude ? s : best),
        null,
      );
      if (strongest && strongest.magnitude >= incoming.magnitude) return refreshed;
      return [...refreshed.filter((s) => s.kind !== incoming.kind), incoming];
    }

    case 'capped':
      // **Refused, not rotated.** Displacing the oldest would let spam replace a
      // strong effect with a weak one, which is the opposite of what a cap is for.
      if (sameKind.length >= rule.limit) return refreshed;
      return [...refreshed, incoming];

    case 'unbounded':
    default:
      return [...refreshed, incoming];
  }
}

/**
 * One unconditional countdown, dropping anything that reaches zero.
 *
 * Runs in the bearer's **Resolution**, on the same clock as cooldowns — so a
 * hero that lost its whole turn to control still ticks, because skipping it would
 * make a one-turn stun cost two.
 */
export function tickDurations(
  statuses: readonly StatusInstance[],
): readonly StatusInstance[] {
  return statuses
    .map((s) => ({ ...s, turnsRemaining: s.turnsRemaining - 1 }))
    .filter((s) => s.turnsRemaining > 0);
}

/**
 * Remove negative effects from an ally (**cleanse**) or positive ones from an
 * enemy (**strip**).
 *
 * **`cleansable: false` survives.** Ember Saelith's burns and Umbriel's debuffs
 * cannot be removed early — they still expire on their own clock. That is the
 * whole of their two passives, and it is why the flag is on the instance rather
 * than on the kind.
 */
export function cleanse(
  statuses: readonly StatusInstance[],
  polarity: 'negative' | 'positive',
): readonly StatusInstance[] {
  return statuses.filter(
    (s) => !s.cleansable || definitionOf(s.kind).polarity !== polarity,
  );
}

// ---------------------------------------------------------------------------
// Readers — the derived layer
// ---------------------------------------------------------------------------

/**
 * The status contribution to one stat, summed — **re-exported, not reimplemented.**
 *
 * It lives in `state.ts` because `effectiveStat` is its only real caller and every
 * other rule module imports `state.ts`; defining it here and importing it there
 * would put a value-level cycle between the two files.
 *
 * Exported from this module as well because *this* is where a reader looks for it,
 * and a second copy — however short — is how the temporary and permanent stat
 * layers would quietly start disagreeing.
 */
export { statusPoints } from './state.js';

/**
 * The surviving fraction of a mitigation stat after every shred on the bearer.
 *
 * **Composed multiplicatively**, which is what stops four sources of one effect
 * from double-counting — the defect the balance review found on Vantric, whose
 * kit stacks `Seams Everywhere` (×0.70) with a unique (×0.60). Multiplication is
 * commutative, so composition order cannot affect the result and no ordering rule
 * is needed here.
 *
 * `Penetration` is subtracted *after* this, by `damage.ts`, where a negative `E`
 * amplifies rather than merely cancelling.
 */
export function shredFactor(hero: HeroState, stat: 'armor' | 'magicResist'): number {
  let factor = 1;
  for (const s of hero.statuses) {
    if (s.kind === 'shred' && s.stat === stat) factor *= 1 - s.magnitude;
  }
  return factor;
}

/**
 * Total absorbable HP. At most one shield exists, so this is `0` or that shield.
 *
 * Shields matter because they are **the only thing that can fully negate a landed
 * hit** — mitigation caps at 50% and the damage floor guarantees 25% gets through.
 */
export function shieldOf(hero: HeroState): number {
  let total = 0;
  for (const s of hero.statuses) if (s.kind === 'shield') total += s.magnitude;
  return total;
}

/**
 * What every damage-over-time effect on the bearer deals **this** Upkeep.
 *
 * Ticks resolve before the hero acts, so a champion can die to a burn without
 * ever taking its turn.
 *
 * **Escalation reads `ticksDealt`, not the elapsed duration.** The Fire House
 * passive `It Catches` grows a burn by 50% of its base tick each turn, and
 * `Banked Coals` extends durations by +1 — so `initialDuration - turnsRemaining`
 * would be wrong for exactly the champion most likely to have both. Counting the
 * ticks actually dealt is the only quantity that survives an extension.
 */
export function upkeepDamage(hero: HeroState): number {
  let total = 0;

  for (const s of hero.statuses) {
    if (!definitionOf(s.kind).ticksDamage) continue;
    total += Math.round(s.magnitude * (1 + s.escalation * s.ticksDealt));
  }

  return total;
}

/**
 * Advance every damage-over-time effect's tick counter.
 *
 * Separate from `upkeepDamage` so the reader stays pure in the strict sense — a
 * caller can ask *"what would this Upkeep cost?"* without changing anything,
 * which the turn queue projection needs and a combined function could not offer.
 */
export function afterUpkeep(
  statuses: readonly StatusInstance[],
): readonly StatusInstance[] {
  return statuses.map((s) =>
    definitionOf(s.kind).ticksDamage ? { ...s, ticksDealt: s.ticksDealt + 1 } : s,
  );
}
