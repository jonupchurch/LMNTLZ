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
import { effectiveStat, heroStateOf, type BattleState, type HeroState } from './state.js';
import { critChance, hitProbability } from './probability.js';

/** `01-stats.md`. The same constant as the stat cap, and deliberately so. */
export const K = 75;

/** FR-019. A hit always lands for at least a quarter of its packet. */
export const DAMAGE_FLOOR_FRACTION = 0.25;

export const CRIT_MULTIPLIER = 2;

/** `maxHp = Toughness × 50` (FR-016). */
export const HP_PER_TOUGHNESS = 50;

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

  const armor = effectiveStat(defender, defenderHero.stats, 'armor');
  const magicResist = effectiveStat(defender, defenderHero.stats, 'magicResist');
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
