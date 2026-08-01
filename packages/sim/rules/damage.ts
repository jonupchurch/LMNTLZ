/**
 * The damage pipeline (FR-016 … FR-022).
 *
 * ```
 * packet  = Might × power.multiplier            # Luck is NOT in this
 * E       = (Armor | MagicResist) − Penetration ; K = 75
 * final   = max(packet × 0.25, mitigated × typeMultiplier)
 * ```
 *
 * Everything here returns a *range and a probability*. Nothing decides whether
 * the swing landed.
 */

import { getHero, powerEffectiveness, type Effectiveness, type Power } from '@lmntlz/content';
import {
  effectiveStat,
  heroStateOf,
  type BattleState,
  type HeroState,
  type StatusInstance,
} from './state.js';
import { critChance, hitProbability } from './probability.js';
import { shieldOf, shredFactor } from './status.js';

/** `01-stats.md`. The same constant as the stat cap, and deliberately so. */
export const K = 75;

/** FR-019. A hit always lands for at least a quarter of its packet. */
export const DAMAGE_FLOOR_FRACTION = 0.25;

export const CRIT_MULTIPLIER = 2;

/**
 * `maxHp = Toughness × 8` (FR-016).
 *
 * **This constant is the game's pacing dial, and it was 50 until it was
 * measured.** At 50 the median battle ran **299 hero-turns into a 300-turn cap**
 * — 62% of battles never reached a wipe at all and were decided on pooled HP
 * share — while a typical hit took **3.8%** off a health bar and 90% of every
 * hit in the game landed under 10%. The hardest hit the roster could produce,
 * anywhere, was 28.7%.
 *
 * At 8, over 600 auto-played battles with both sides on the shipped AI:
 *
 * | | 50 | 8 |
 * |---|---|---|
 * | hero-turns, median | 299 (the cap) | **49** |
 * | ended on the cap | 62% | **0%** |
 * | normal hit | 3.8% | **26.3%** (p75 44%) |
 * | crit | 8.0% | **45.5%** (p90 100%) |
 * | hits under 10% of a bar | 90% | **10%** |
 *
 * **Nothing about relative balance moves.** Damage and healing are both
 * absolute — `Might × multiplier` — so scaling the pool scales both against it
 * identically, and every matchup ratio the design reasoned about is preserved.
 * That is precisely why this is the lever and `Might` is not: `Might` is capped
 * at 75 and tops out at 45 today, nowhere near the 6× of headroom needed.
 *
 * **The absolute damage numbers are unchanged** — a hit still lands for ~60. It
 * is the health bars that stopped being 1,250–2,000 points long.
 *
 * Two consequences are deliberate rather than overlooked, and both are asserted
 * in tests rather than left as prose: a tier-4 or tier-5 power can now one-shot
 * a full-health hero (`pairings.test.ts`), and a hero acts few enough times that
 * some of its six powers never fire (`firingProfile.ts`, `BATTLE_TURNS`).
 */
export const HP_PER_TOUGHNESS = 8;

export function maxHp(hero: HeroState): number {
  return effectiveStat(hero, getHero(hero.heroId).stats, 'toughness') * HP_PER_TOUGHNESS;
}

/**
 * `packet = Might × power.multiplier` (FR-017).
 *
 * **`Luck` is not in this.** Luck buys accuracy and crit chance; letting it also
 * scale the packet would make it the only stat worth buying.
 *
 * A power with no multiplier at all deals no damage — that is different from
 * dealing zero, and the null is what says so.
 */
export function packetOf(hero: HeroState, power: Power): number {
  if (power.multiplier === null) return 0;
  return effectiveStat(hero, getHero(hero.heroId).stats, 'might') * power.multiplier;
}

const isMartial = (type: string): boolean =>
  type === 'slash' || type === 'pierce' || type === 'crush';

/**
 * Which mitigation stat answers a power.
 *
 * A martial power meets `Armor`, an arcane one meets `Magic Resist`, and a
 * **mixed** power meets whichever of the two is *lower* (FR-018). That is the
 * defender's weaker wall, not their choice — a dual martial/arcane power finds
 * the gap rather than being averaged into the middle.
 */
export function resistedBy(power: Power): 'armor' | 'magicResist' | 'mixed' {
  const martial = power.types.some((t) => isMartial(t));
  const arcane = power.types.some((t) => !isMartial(t));
  return martial && arcane ? 'mixed' : martial ? 'armor' : 'magicResist';
}

/**
 * The mitigation curve.
 *
 *   E ≥ 0 :  1 − E/(E+K)          — resistance reduces damage, halving it at E=K
 *   E < 0 :  1 + (−E)/((−E)+K)    — penetration past zero *amplifies*, symmetrically
 *
 * Both branches are the same curve reflected, so a point of Penetration is worth
 * the same whether it is cancelling Armor or exceeding it. **Mitigation alone
 * never exceeds 50% reduction**, because `E` is bounded by the 75 stat cap and
 * `K` is also 75.
 */
export function mitigationFactor(effectiveResistance: number): number {
  const e = effectiveResistance;
  return e >= 0 ? 1 - e / (e + K) : 1 + -e / (-e + K);
}

export interface DamagePreview {
  readonly packet: number;
  readonly effectiveResistance: number;
  readonly mitigationFactor: number;
  readonly mitigated: number;
  readonly typeMultiplier: Effectiveness;
  readonly resistedBy: 'armor' | 'magicResist';
  readonly final: number;
  readonly floorApplied: boolean;
  readonly hitProbability: number;
  readonly critChance: number;
  readonly critFinal: number;
}

const powerOf = (hero: HeroState, powerId: string): Power => {
  const found = getHero(hero.heroId).powers.find((p) => p.id === powerId);
  if (!found) {
    throw new Error(`hero "${hero.heroId}" has no power "${powerId}"`);
  }
  return found;
};

/**
 * Everything about an attack **except whether it happened** (FR-004).
 *
 * Full precision is carried the whole way and rounded **once**, at the end
 * (FR-019). Rounding at each step would let the floor and the type multiplier
 * disagree with each other by a point, in a direction that depends on the order
 * somebody happened to write them.
 */
export function damagePreview(
  state: BattleState,
  attackerInstanceId: string,
  powerId: string,
  defenderInstanceId: string,
): DamagePreview {
  const attacker = heroStateOf(state, attackerInstanceId);
  const defender = heroStateOf(state, defenderInstanceId);
  const power = powerOf(attacker, powerId);
  const defenderHero = getHero(defender.heroId);

  const packet = packetOf(attacker, power);

  /**
   * **Shred is a percentage of the wall, taken before Penetration** (020).
   *
   * The order is fixed and `05-status.md` fixes it, because Vantric's kit stacks
   * four sources of one effect and nothing said how they compose:
   *
   *   1. shred multiplies the mitigation stat
   *   2. `Penetration` is subtracted from what is left
   *   3. the result feeds the curve, where a negative `E` **amplifies**
   *
   * Subtracting Penetration first would let a shred bite into an already-negative
   * `E` and *reduce* the amplification — a strip making an attack weaker.
   *
   * And it is a percentage rather than flat points for a reason the curve makes
   * unavoidable: mitigation is steepest at low `E`, so a flat shred is worth more
   * against a lightly armored target than a heavily armored one. That is exactly
   * backwards for an effect called "find the seam".
   */
  const armor = effectiveStat(defender, defenderHero.stats, 'armor') * shredFactor(defender, 'armor');
  const magicResist =
    effectiveStat(defender, defenderHero.stats, 'magicResist') * shredFactor(defender, 'magicResist');
  const penetration = effectiveStat(attacker, getHero(attacker.heroId).stats, 'penetration');

  const answering = resistedBy(power);
  const wall =
    answering === 'mixed' ? Math.min(armor, magicResist) : answering === 'armor' ? armor : magicResist;
  const answeredBy: 'armor' | 'magicResist' =
    answering === 'mixed' ? (armor <= magicResist ? 'armor' : 'magicResist') : answering;

  const effectiveResistance = wall - penetration;
  const factor = mitigationFactor(effectiveResistance);
  const mitigated = packet * factor;

  // FR-022, Constitution XIII — taken from @lmntlz/content, never recomputed.
  const typeMultiplier = powerEffectiveness(power, defenderHero);

  const afterType = mitigated * typeMultiplier;
  const floor = packet * DAMAGE_FLOOR_FRACTION;
  const floorApplied = floor > afterType;

  const critAfterType = afterType * CRIT_MULTIPLIER;
  const critFloor = floor * CRIT_MULTIPLIER;

  return {
    packet,
    effectiveResistance,
    mitigationFactor: factor,
    mitigated,
    typeMultiplier,
    resistedBy: answeredBy,
    final: Math.round(Math.max(floor, afterType)),
    floorApplied,
    hitProbability: hitProbability(state, attackerInstanceId, defenderInstanceId),
    critChance: critChance(state, attackerInstanceId),
    critFinal: Math.round(Math.max(critFloor, critAfterType)),
  };
}

/** What a shield ate, and what got through to the health pool. */
export interface AbsorbResult {
  /** Damage the shield took. Never more than the shield had. */
  readonly absorbed: number;
  /** Damage reaching HP. */
  readonly throughput: number;
  /** The bearer's statuses with the shield reduced, or dropped if it broke. */
  readonly statuses: readonly StatusInstance[];
}

/**
 * Spend a shield against an incoming hit (020, FR-013).
 *
 * **A shield that breaks mid-hit passes the remainder through in the same step.**
 * It never eats a whole strike for free, which is what keeps it from being
 * strictly better than mitigation — and shields already matter more than
 * mitigation does, because they are **the only thing that can fully negate a
 * landed hit**. Mitigation caps at 50% reduction and the damage floor guarantees
 * 25% gets through, so nothing else in the game can take a hit to zero.
 *
 * Applied **after** the type multiplier and the floor, not before: the floor is a
 * guarantee about what a *hit* delivers, and a shield is a thing standing in
 * front of the health pool. Absorbing first would let a shield shrink the packet
 * the floor is computed from, which would quietly make the floor a percentage of
 * the shield rather than of the blow.
 */
export function absorb(
  hero: HeroState,
  incoming: number,
): AbsorbResult {
  const pool = shieldOf(hero);
  if (pool <= 0) return { absorbed: 0, throughput: incoming, statuses: hero.statuses };

  const absorbed = Math.min(pool, incoming);
  let left = absorbed;

  const statuses: StatusInstance[] = [];
  for (const s of hero.statuses) {
    if (s.kind !== 'shield' || left <= 0) {
      statuses.push(s);
      continue;
    }
    const taken = Math.min(s.magnitude, left);
    left -= taken;
    // A spent shield is REMOVED, not kept at 0 — absent and zero mean the same
    // thing to every reader, and keeping both would be two states for one fact.
    if (s.magnitude - taken > 0) statuses.push({ ...s, magnitude: s.magnitude - taken });
  }

  return { absorbed, throughput: incoming - absorbed, statuses };
}

/**
 * A heal is the same operation with the sign reversed, and **almost none of the
 * attack pipeline applies to it** (03-powers.md).
 *
 * | Step | Applies? |
 * |---|---|
 * | Reach | **yes** — one rule, no exceptions |
 * | Evasion | no — an ally never dodges a heal |
 * | Mitigation | no — the target's own Armor never blunts it |
 * | Type effectiveness | no — friendly powers are never resisted |
 * | Resolve contest | no |
 * | Crit | **yes**, at the healer's own Luck |
 * | The 25% floor | no — the floor is a guarantee about hits |
 *
 * Capped at `maxHp`; overheal is lost.
 */
export function healPreview(
  state: BattleState,
  healerInstanceId: string,
  powerId: string,
  targetInstanceId: string,
): { readonly amount: number; readonly critAmount: number; readonly overheal: number } {
  const healer = heroStateOf(state, healerInstanceId);
  const target = heroStateOf(state, targetInstanceId);
  const power = powerOf(healer, powerId);

  const raw = packetOf(healer, power);
  const room = maxHp(target) - target.hp;

  const amount = Math.round(Math.min(raw, room));
  const critRaw = raw * CRIT_MULTIPLIER;

  return {
    amount,
    critAmount: Math.round(Math.min(critRaw, room)),
    overheal: Math.round(Math.max(0, raw - room)),
  };
}
