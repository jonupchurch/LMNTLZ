import { describe, expect, it } from 'vitest';
import {
  DAMAGE_TYPES,
  MAGIC_TYPES,
  MELEE_TYPES,
  counter,
  family,
  type DamageType,
} from '../src/types.js';

/**
 * T012 — `counter` is a bijection over all nine types and never crosses families.
 *
 * These are exhaustive rather than sampled. The domain is nine values, so there
 * is no reason to test anything less than all of it.
 */
describe('counter', () => {
  it('has exactly nine damage types, six magic and three melee', () => {
    expect(DAMAGE_TYPES).toHaveLength(9);
    expect(MAGIC_TYPES).toHaveLength(6);
    expect(MELEE_TYPES).toHaveLength(3);
    expect(new Set(DAMAGE_TYPES).size).toBe(9);
  });

  it('is total — every type has a counter', () => {
    for (const t of DAMAGE_TYPES) {
      expect(() => counter(t)).not.toThrow();
    }
  });

  it('is injective — no two types share a counter', () => {
    const images = DAMAGE_TYPES.map(counter);
    expect(new Set(images).size).toBe(DAMAGE_TYPES.length);
  });

  it('is surjective — every type is some type’s counter', () => {
    const images = new Set(DAMAGE_TYPES.map(counter));
    for (const t of DAMAGE_TYPES) {
      expect(images.has(t)).toBe(true);
    }
  });

  it('never crosses the magic/melee families', () => {
    for (const t of DAMAGE_TYPES) {
      expect(family(counter(t))).toBe(family(t));
    }
  });

  it('never maps a type to itself — nothing is its own weakness', () => {
    for (const t of DAMAGE_TYPES) {
      expect(counter(t)).not.toBe(t);
    }
  });

  it('is an involution on magic — the oppositions are symmetric', () => {
    for (const t of MAGIC_TYPES) {
      expect(counter(counter(t))).toBe(t);
    }
  });

  it('is a 3-cycle on melee — never an involution', () => {
    for (const t of MELEE_TYPES) {
      expect(counter(counter(t))).not.toBe(t);
      expect(counter(counter(counter(t)))).toBe(t);
    }
  });

  it('matches the authored oppositions and triangle exactly', () => {
    const expected: Record<DamageType, DamageType> = {
      earth: 'air',
      air: 'earth',
      fire: 'water',
      water: 'fire',
      light: 'dark',
      dark: 'light',
      // The triangle, verified against resources/characters/MATCHUPS.md:
      // a Slash hero's Bane is Crush, a Pierce hero's is Slash, a Crush hero's
      // is Pierce.
      slash: 'crush',
      pierce: 'slash',
      crush: 'pierce',
    };

    for (const t of DAMAGE_TYPES) {
      expect(counter(t)).toBe(expected[t]);
    }
  });

  it('rejects a non-type rather than returning undefined', () => {
    expect(() => counter('holy' as DamageType)).toThrow(/not a damage type/);
  });
});
