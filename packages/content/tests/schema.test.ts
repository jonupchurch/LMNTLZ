import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES, counter, family } from '../src/types.js';
import { isLegalPairing } from '../src/derive.js';
import type { DamageType } from '../src/types.js';
import type { ValidationRule } from '../src/schema.js';

/**
 * T014 — every rejection names the rule it broke (FR-004, FR-017).
 *
 * A boolean would satisfy the enumeration in `derivation.test.ts` and tell an
 * author nothing. These assertions are what make the failure message actionable.
 */
describe('rejection naming', () => {
  const rejectionsFor = (primary: DamageType, secondary: DamageType): ValidationRule => {
    const result = isLegalPairing(primary, secondary);
    if (result.legal) {
      throw new Error(`expected ${primary}/${secondary} to be rejected`);
    }
    return result.rule;
  };

  it('names secondary-equals-primary on all nine self-pairings', () => {
    for (const t of DAMAGE_TYPES) {
      expect(rejectionsFor(t, t)).toBe('secondary-equals-primary');
    }
  });

  it('names secondary-is-counter-of-primary when the secondary is the bane', () => {
    for (const t of DAMAGE_TYPES) {
      expect(rejectionsFor(t, counter(t))).toBe('secondary-is-counter-of-primary');
    }
  });

  it('names primary-is-counter-of-secondary on the three melee pairs that only break rule 3', () => {
    // On magic types the two rules collide on the same pair, so rule 2 is
    // reported and rule 3 is unreachable there. Melee is a 3-cycle, so its
    // rule-3 violations are distinct pairs and the rule is reachable.
    const inverse = (t: DamageType): DamageType => {
      const found = DAMAGE_TYPES.find((x) => counter(x) === t);
      if (!found) throw new Error(`no inverse for ${t}`);
      return found;
    };

    const meleeOnly = DAMAGE_TYPES.filter((t) => family(t) === 'melee');
    expect(meleeOnly).toHaveLength(3);

    for (const t of meleeOnly) {
      expect(rejectionsFor(t, inverse(t))).toBe('primary-is-counter-of-secondary');
    }
  });

  it('rejects exactly twelve distinct-secondary pairs, each with a named rule', () => {
    const rejected = DAMAGE_TYPES.flatMap((primary) =>
      DAMAGE_TYPES.filter((s) => s !== primary)
        .map((secondary) => ({ primary, secondary, result: isLegalPairing(primary, secondary) }))
        .filter((r) => !r.result.legal),
    );

    expect(rejected).toHaveLength(12);

    for (const r of rejected) {
      expect(r.result.legal).toBe(false);
      if (!r.result.legal) {
        expect([
          'secondary-equals-primary',
          'secondary-is-counter-of-primary',
          'primary-is-counter-of-secondary',
        ]).toContain(r.result.rule);
      }
    }
  });

  it('splits the twelve as six magic and six melee', () => {
    const rejected = DAMAGE_TYPES.flatMap((primary) =>
      DAMAGE_TYPES.filter((s) => s !== primary)
        .filter((secondary) => !isLegalPairing(primary, secondary).legal)
        .map((secondary) => ({ primary, secondary })),
    );

    const magic = rejected.filter((r) => family(r.primary) === 'magic');
    const melee = rejected.filter((r) => family(r.primary) === 'melee');

    expect(magic).toHaveLength(6);
    expect(melee).toHaveLength(6);

    // All six melee rejections are melee-versus-melee, which IS the FR-006
    // consequence stated as a count.
    for (const r of melee) {
      expect(family(r.secondary)).toBe('melee');
    }
  });
});
