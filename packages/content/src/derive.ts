/**
 * The pairing rule and the derivation (FR-002, FR-004).
 *
 * A hero authors exactly two relationship fields, `primary` and `secondary`.
 * Everything else about how it relates to the other eight types is computed here
 * and can be computed nowhere else.
 */

import { counter, family, type DamageType, type Family } from './types.js';
import type { ValidationRule } from './schema.js';

export class IllegalPairingError extends Error {
  readonly rule: ValidationRule;

  constructor(primary: DamageType, secondary: DamageType, rule: ValidationRule) {
    super(`illegal pairing ${primary}/${secondary}: ${rule}`);
    this.name = 'IllegalPairingError';
    this.rule = rule;
  }
}

/**
 * The three distinctness rules, and **only** the three (FR-004).
 *
 * All four relationship slots — `primary`, `secondary`, `counter(primary)` and
 * `counter(secondary)` — must be different types.
 *
 * There is deliberately no fourth rule about melee. That melee heroes can never
 * take a melee secondary is a **consequence** of these three meeting a 3-cycle
 * that is too small to dodge: of a melee primary's two other melee options, one
 * is already its Bane and the other would make its Fault its own primary. Adding
 * a rule to say so would let the rule and the arithmetic drift apart.
 *
 * Rule order is reportable, not arbitrary: on the six magic types `counter` is an
 * involution, so rules 2 and 3 land on the same pair and rule 2 is what gets
 * named. On melee they are distinct pairs and both are reachable.
 */
/**
 * **`rule` is present on both arms, `null` when legal.** The obvious shape is
 * `{ legal: true } | { legal: false; rule }`, and it reads better — but reading
 * `.rule` off it then depends on the compiler narrowing the union, which is a
 * *setting*. Vercel compiles this package with `strict` off (it names the
 * entrypoint on the command line, so no tsconfig is read at all), narrowing
 * stops, and every `.rule` access becomes an error that exists in no other
 * configuration. That is what kept a broken API deploy invisible for two
 * features.
 *
 * Discriminating on `legal` still works exactly as before for anyone who wants
 * to; this only removes the *requirement* to.
 */
export function isLegalPairing(
  primary: DamageType,
  secondary: DamageType,
): { legal: true; rule: null } | { legal: false; rule: ValidationRule } {
  if (secondary === primary) {
    return { legal: false, rule: 'secondary-equals-primary' };
  }
  if (counter(primary) === secondary) {
    return { legal: false, rule: 'secondary-is-counter-of-primary' };
  }
  if (counter(secondary) === primary) {
    return { legal: false, rule: 'primary-is-counter-of-secondary' };
  }
  return { legal: true, rule: null };
}

/** The four fields that are never present in any source file (FR-002). */
export interface DerivedProfile {
  readonly family: Family;
  readonly strengths: readonly [DamageType, DamageType];
  readonly bane: DamageType;
  readonly fault: DamageType;
}

/**
 * Derive the whole relationship profile from the two authored fields.
 *
 * Throws on an illegal pairing rather than deriving something plausible from it.
 * A hero that broke a distinctness rule would still produce four values here;
 * they would simply be wrong in a way nothing downstream could detect.
 */
export function derive(primary: DamageType, secondary: DamageType): DerivedProfile {
  const legality = isLegalPairing(primary, secondary);
  if (!legality.legal) {
    throw new IllegalPairingError(primary, secondary, legality.rule);
  }

  return Object.freeze({
    family: family(primary),
    strengths: Object.freeze([primary, secondary]) as readonly [DamageType, DamageType],
    bane: counter(primary),
    fault: counter(secondary),
  });
}
