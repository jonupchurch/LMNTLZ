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
  cappedStat,
  effectiveStat,
  heroStateOf,
  maxHp,
  packetOf,
  type BattleState,
  type HeroState,
  type StatusInstance,
} from './state.js';
import { critChance, hitProbability } from './probability.js';
import { shieldOf, shredFactor } from './status.js';
import {
  critMultiplierFor,
  damageMultiplierFor,
  healMultiplierFor,
  incomingMultiplierFor,
  mitigationMultiplierFor,
  penetrationBonusFor,
  statBonusFor,
  type StrikeContext,
} from './passives.js';

export { HP_PER_TOUGHNESS, maxHp } from './state.js';

/** `01-stats.md`. The same constant as the stat cap, and deliberately so. */
export const K = 75;

/** FR-019. A hit always lands for at least a quarter of its packet. */
export const DAMAGE_FLOOR_FRACTION = 0.25;

export const CRIT_MULTIPLIER = 2;

/**
 * `packet = Might × power.multiplier` (FR-017).
 *
 * **Defined in `state.ts` and re-exported here**, the same arrangement
 * `statusPoints` already uses: `runeEffects.ts` needs the packet for `Too Close`
 * and cannot import a value from this module, because this one reads `passives.ts`
 * and `passives.ts` reads the rune catalog. One implementation, found where a
 * reader expects it.
 */
export { packetOf } from './state.js';

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
  /**
   * What the **attacker's** passives multiplied the landed blow by. `1` when none
   * apply.
   *
   * The defender's own reduction is not in this: it is taken before the floor, so
   * it arrives inside `mitigated`'s successor rather than beside it. Two numbers
   * would suggest they compose, and they do not — see the note at the floor.
   */
  readonly passiveMultiplier: number;
  /** What the **defender's** passives multiplied the incoming blow by, before the floor. */
  readonly incomingMultiplier: number;
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
  /**
   * **The defender's own passives raise the wall before shred takes a bite**
   * (020 US3).
   *
   * `The Bone Beneath` grants `Magic Resist` below half pool and `Room to Swing`
   * grants `Armor` per enemy in reach. Both are *conditional* and neither can be a
   * status: nothing applies them, they simply hold while the condition does. So
   * they are added to the base stat, which is the one place a shred can still
   * answer them — a bonus added after the shred would be a wall no strip could
   * reach.
   *
   * ### ⚠️ `cappedStat`, and the first draft did not have it
   *
   * Adding the bonus straight onto `effectiveStat` **bypasses the 75 cap**, because
   * `effectiveStat` clamps and then the bonus lands on top. `Room to Swing` on a
   * runed defender reached `Armor` 105, and the note on `mitigationFactor` — *"never
   * exceeds 50% reduction, because `E` is bounded by the 75 stat cap"* — stopped
   * being true. Caught by the floor test, which asserts the floor never binds against
   * a defender pushed to the cap on both walls.
   *
   * **The cap is the ceiling for every source, or it is not a cap.** That is the same
   * rule runes are priced against.
   */
  const armor =
    cappedStat(
      effectiveStat(defender, defenderHero.stats, 'armor'),
      statBonusFor(state, defender, 'armor'),
    ) * shredFactor(defender, 'armor');
  const magicResist =
    cappedStat(
      effectiveStat(defender, defenderHero.stats, 'magicResist'),
      statBonusFor(state, defender, 'magicResist'),
    ) * shredFactor(defender, 'magicResist');
  /**
   * **The passive layer, read here so a preview cannot disagree with a
   * resolution** (020 US2).
   *
   * `damagePreview` is what the client shows a player *and* what the resolver
   * spends, so `Finish It`, `Measured Shot` and `Find the Seam` have to enter the
   * pipeline at the one point both paths pass through. A passive applied in
   * `resolveOne` instead would make every projected swing on screen a lie by
   * exactly its own bonus.
   *
   * None of these draw — see the invariant at the top of `passives.ts`.
   */
  const strike: StrikeContext = {
    state,
    attacker,
    defender,
    power,
    defenderHpFraction: maxHp(defender) > 0 ? defender.hp / maxHp(defender) : 0,
  };

  const penetration =
    effectiveStat(attacker, getHero(attacker.heroId).stats, 'penetration') +
    penetrationBonusFor(strike);

  const answering = resistedBy(power);
  const wall =
    answering === 'mixed' ? Math.min(armor, magicResist) : answering === 'armor' ? armor : magicResist;
  const answeredBy: 'armor' | 'magicResist' =
    answering === 'mixed' ? (armor <= magicResist ? 'armor' : 'magicResist') : answering;

  /**
   * **`Seams Everywhere` and `Gravity Is a Suggestion` — a fraction of the wall,
   * taken in the same place a shred is and for the same reason** (020 US3).
   *
   * Both read as *"ignores 30% of Armor"* in the approval table, and both are
   * implemented against **whichever mitigation stat answers the attack**. A
   * literal `Armor`-only reading would make `Gravity Is a Suggestion` inert:
   * Vael is an Air champion whose whole kit is arcane, so it would have answered
   * `Armor` on none of her own powers.
   *
   * Multiplied before `Penetration` is subtracted, exactly like shred — see the
   * note above for why that order is not interchangeable.
   */
  const effectiveResistance = wall * mitigationMultiplierFor(strike) - penetration;
  const factor = mitigationFactor(effectiveResistance);
  const mitigated = packet * factor;

  // FR-022, Constitution XIII — taken from @lmntlz/content, never recomputed.
  const typeMultiplier = powerEffectiveness(power, defenderHero);

  /**
   * **The defender's own reduction is taken before the floor; the attacker's
   * bonus after it.** The asymmetry is deliberate and it is the floor's whole
   * meaning.
   *
   * `final = max(packet × 0.25, mitigated × typeMultiplier)` is a **guarantee
   * about what a hit delivers** — `CLAUDE.md` states it in that form. A defensive
   * passive that multiplied the already-floored result would breach it: measured,
   * `First Guard` took the worst case to **0.213 of a packet** against a floor of
   * 0.25. So `First Guard` reduces what mitigation delivers and then the floor
   * catches it, exactly like `Armor` does.
   *
   * The attacker's side keeps the opposite treatment for the reason recorded
   * below: a Striker closing out a kill should not lose its bonus on precisely
   * the blows that were reduced to their floor.
   */
  const incoming = incomingMultiplierFor(strike);
  const afterType = mitigated * typeMultiplier * incoming;
  const floor = packet * DAMAGE_FLOOR_FRACTION;
  const floorApplied = floor > afterType;

  /**
   * **Applied last, to the floored result.** `Finish It` and `Measured Shot` pay
   * on a blow that was reduced to its floor too — the floor is a guarantee about
   * what a *hit* delivers, and a Striker closing out a kill should not be the one
   * case it stops applying.
   */
  const passiveFactor = damageMultiplierFor(strike);
  const landed = Math.max(floor, afterType) * passiveFactor;

  return {
    packet,
    effectiveResistance,
    mitigationFactor: factor,
    mitigated,
    typeMultiplier,
    resistedBy: answeredBy,
    passiveMultiplier: passiveFactor,
    incomingMultiplier: incoming,
    final: Math.round(landed),
    floorApplied,
    hitProbability: hitProbability(state, attackerInstanceId, defenderInstanceId),
    critChance: critChance(state, attackerInstanceId),
    /**
     * **`No Warning` is the only thing that moves this**, and it moves the
     * multiplier rather than the damage: Boldrek's crits land at ×2.5. Read here
     * so the number a player sees on a projected crit is the number the resolver
     * spends — `resolveOne` takes `critFinal` straight off this preview.
     */
    critFinal: Math.round(landed * (critMultiplierFor(strike) ?? CRIT_MULTIPLIER)),
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
  /**
   * **Required, not defaulted** (021). `Straight Past` passes an attack through a
   * shield without spending it, and a parameter with a default nobody overrides is
   * exactly how this project has shipped inert seams before — the one call site
   * that forgot would compile, pass, and quietly never grant the effect.
   *
   * *Through*, not *around*: the shield keeps its magnitude and the whole packet
   * reaches HP. Consuming it as well would make the rune strictly better than
   * simply removing the shield, which is not what the design bought.
   */
  attackerIgnoresShields: boolean,
): AbsorbResult {
  const pool = shieldOf(hero);
  if (attackerIgnoresShields || pool <= 0) {
    return { absorbed: 0, throughput: incoming, statuses: hero.statuses };
  }

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

  /**
   * **The one place a heal's size can be changed** (021 US2).
   *
   * This function read no hooks at all until now, so the insertion is a new step
   * rather than a re-ordering of existing ones. It multiplies the *raw* heal
   * before the room clamp, which is what makes `Draws It Up` worth something to a
   * champion that is badly hurt and worth nothing to one that is nearly full —
   * clamping first and multiplying after would let it exceed the pool.
   */
  const raw = packetOf(healer, power) * healMultiplierFor(state, healer, target);
  const room = maxHp(target) - target.hp;

  const amount = Math.round(Math.min(raw, room));
  const critRaw = raw * CRIT_MULTIPLIER;

  return {
    amount,
    critAmount: Math.round(Math.min(critRaw, room)),
    overheal: Math.round(Math.max(0, raw - room)),
  };
}
