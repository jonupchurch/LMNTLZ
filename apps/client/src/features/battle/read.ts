/**
 * What a chosen power would do to a hovered defender (019).
 *
 * ### None of this is arithmetic this file performs
 *
 * `damagePreview` lives in `@lmntlz/sim/rules` — pure, shared, no RNG — and it
 * is the same function the server's resolver draws its ranges from. So the
 * number on screen and the number the battle rolls against come from one
 * implementation rather than two that agree. The client still decides nothing:
 * a preview is a range, the resolver draws from it, and the seed never leaves
 * the server (Constitution XII).
 *
 * The alternative was the screen re-deriving `Might × multiplier`, mitigation
 * and the type ladder in JSX, which is exactly the second rules engine the
 * architecture exists to prevent.
 *
 * ### Reach is asked, not assumed
 *
 * `legalTargets` already decides who may be hit, and this asks it rather than
 * re-implementing the row arithmetic. A defender the engine would refuse is
 * drawn as out of reach with the distance stated, because *why* is the part a
 * player can act on — an empty row between them is a fact that changes as the
 * battle wears on.
 */

import { getHero, type DamageType, type Effectiveness } from '@lmntlz/content';
import {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
} from '../../components/index.js';
import {
  damagePreview,
  distance,
  heroStateOf,
  legalTargets,
  type BattleState,
  type DamagePreview,
} from '@lmntlz/sim/rules';

export type Tier = 'bane' | 'fault' | 'neutral' | 'resisted' | 'immune-ish';

/**
 * The five rungs, named for a player rather than for the engine.
 *
 * **Keyed off the multiplier the preview reports**, not off a second comparison
 * of types — the preview already resolved dual-typed powers ("takes the better
 * of its two types") and the mixed martial/arcane rule, and a label computed
 * beside it would disagree with it on exactly those powers.
 */
export const TIER_OF: ReadonlyMap<Effectiveness, Tier> = new Map([
  [BANE, 'bane'],
  [FAULT, 'fault'],
  [NEUTRAL, 'neutral'],
  [RESISTED_SECONDARY, 'resisted'],
  [RESISTED_PRIMARY, 'immune-ish'],
]);

export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  bane: 'Super-effective',
  fault: 'Effective',
  neutral: 'Neutral',
  resisted: 'Resisted',
  'immune-ish': 'Heavily resisted',
};

export const TIER_CLASS: Readonly<Record<Tier, string>> = {
  bane: 'text-gold',
  fault: 'text-success',
  neutral: 'text-muted',
  resisted: 'text-warning',
  'immune-ish': 'text-slash-lit',
};

export interface TargetRead {
  readonly instanceId: string;
  readonly heroId: string;
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  /** The defender's derived profile, for the doors line. Free information. */
  readonly bane: DamageType;
  readonly fault: DamageType;
  readonly primary: DamageType;
  readonly secondary: DamageType;
  /** `null` when the engine would refuse this target — see `reason`. */
  readonly preview: DamagePreview | null;
  readonly tier: Tier | null;
  /** Rows between the two, on the shared 1–6 axis. Stated when out of reach. */
  readonly rows: number;
  readonly reachable: boolean;
}

/**
 * Read one defender, for one attacker holding one power.
 *
 * Returns `null` only when the ids do not resolve — a battle that has moved on
 * under a hover, which is a non-event rather than an error.
 */
export function readTarget(
  state: BattleState,
  actorInstanceId: string,
  powerId: string,
  targetInstanceId: string,
): TargetRead | null {
  let actor;
  let target;
  try {
    actor = heroStateOf(state, actorInstanceId);
    target = heroStateOf(state, targetInstanceId);
  } catch {
    return null;
  }

  const hero = getHero(target.heroId);
  const reachable = legalTargets(state, actorInstanceId, powerId).candidates.includes(
    targetInstanceId,
  );

  /**
   * **Only previewed when it is legal.** `damagePreview` will happily price a
   * shot that cannot be taken, and a number beside `OUT OF REACH` reads as a
   * promise the engine will refuse.
   */
  const preview = reachable ? damagePreview(state, actorInstanceId, powerId, targetInstanceId) : null;

  return {
    instanceId: targetInstanceId,
    heroId: target.heroId,
    name: hero.name,
    hp: target.hp,
    maxHp: target.maxHp,
    bane: hero.bane,
    fault: hero.fault,
    primary: hero.primary,
    secondary: hero.secondary,
    preview,
    tier: preview ? TIER_OF.get(preview.typeMultiplier) ?? null : null,
    rows: distance(state, actor.row, target.row),
    reachable,
  };
}
