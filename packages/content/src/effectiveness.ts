/**
 * Type effectiveness (FR-007, FR-008, FR-009).
 *
 * **There is no 9x9 table here, and one could not be written.** Effectiveness
 * reads the *defender's two authored types*, not the defender's type — so the
 * same attacking type resolves differently against two heroes that share a
 * primary. A type-versus-type table has nowhere to put Fault or the x0.80
 * secondary case, which is why `effectiveness` takes a `Hero` and has no
 * overload accepting a bare defending type. The signature is the enforcement.
 */

import type { DamageType } from './types.js';
import type { Hero, Power } from './hero.js';

/** The five values. Nothing else is representable. */
export type Effectiveness = 1.5 | 1.25 | 1.0 | 0.8 | 0.5;

export const BANE: Effectiveness = 1.5;
export const FAULT: Effectiveness = 1.25;
export const NEUTRAL: Effectiveness = 1.0;
export const RESISTED_SECONDARY: Effectiveness = 0.8;
export const RESISTED_PRIMARY: Effectiveness = 0.5;

/**
 * Resolve one attacking type against one defender.
 *
 * Order matters and is not arbitrary. A hero's four relationship slots are
 * guaranteed distinct by the pairing rules, so at most one branch can match and
 * the order is unobservable — but writing the strongest first keeps the reading
 * order the same as the severity order.
 */
export function effectiveness(attackType: DamageType, defender: Hero): Effectiveness {
  if (attackType === defender.bane) return BANE;
  if (attackType === defender.fault) return FAULT;
  if (attackType === defender.primary) return RESISTED_PRIMARY;
  if (attackType === defender.secondary) return RESISTED_SECONDARY;
  return NEUTRAL;
}

/**
 * A dual-typed power resolves as the **better of its two types** (FR-009).
 *
 * Single-typed powers take the same path — a one-element array through the same
 * reduce, not a special case. The consequence is deliberate and recorded in
 * `03-powers.md`: no tier-4 or tier-5 power is ever resisted, because a hero's
 * two types can never both be something the defender resists.
 */
export function powerEffectiveness(power: Power, defender: Hero): Effectiveness {
  let best: Effectiveness = RESISTED_PRIMARY;
  for (const type of power.types) {
    const value = effectiveness(type, defender);
    if (value > best) best = value;
  }
  return best;
}
