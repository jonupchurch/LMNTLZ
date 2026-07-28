import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES, MELEE_TYPES, counter, family } from '../src/types.js';
import { derive, isLegalPairing } from '../src/derive.js';
import { getAllHeroes } from '../src/index.js';

const src = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8');

/**
 * T013 — the 60-of-72 enumeration (FR-005).
 *
 * This is a **count** assertion on purpose. A change to `counter` that silently
 * widened the legal space would still satisfy a spot check of known-bad pairs;
 * it cannot satisfy a count.
 *
 * 72 is `9 x 9` minus the nine `secondary === primary` pairs. Of those 72,
 * exactly 12 break one of the two remaining distinctness rules:
 *
 *   - 9 have `secondary === counter(primary)`
 *   - 9 have `primary === counter(secondary)`
 *   - 6 are the same pair counted twice, because `counter` is an involution on
 *     the six magic types
 *
 * so `9 + 9 - 6 = 12` rejected and 60 accepted.
 */
describe('the legal pairing space', () => {
  const allPairs = DAMAGE_TYPES.flatMap((primary) =>
    DAMAGE_TYPES.map((secondary) => ({ primary, secondary })),
  );

  const distinct = allPairs.filter((p) => p.primary !== p.secondary);

  it('has 81 total pairs and 72 with a distinct secondary', () => {
    expect(allPairs).toHaveLength(81);
    expect(distinct).toHaveLength(72);
  });

  it('accepts exactly 60 of the 72 and rejects exactly 12', () => {
    const legal = distinct.filter((p) => isLegalPairing(p.primary, p.secondary).legal);
    const illegal = distinct.filter((p) => !isLegalPairing(p.primary, p.secondary).legal);

    expect(legal).toHaveLength(60);
    expect(illegal).toHaveLength(12);
  });

  it('rejects all nine self-pairings', () => {
    for (const t of DAMAGE_TYPES) {
      const result = isLegalPairing(t, t);
      expect(result.legal).toBe(false);
    }
  });

  it('keeps all four relationship slots distinct on every legal pairing', () => {
    const legal = distinct.filter((p) => isLegalPairing(p.primary, p.secondary).legal);

    for (const { primary, secondary } of legal) {
      const slots = [primary, secondary, counter(primary), counter(secondary)];
      expect(new Set(slots).size).toBe(4);
    }
  });
});

/**
 * T015 — melee heroes always take a magic secondary (FR-006).
 *
 * The point of this test is not that the property holds. It is that the property
 * is a **consequence** of the three distinctness rules rather than a fourth rule
 * someone wrote down — which is why the source scan below matters as much as the
 * enumeration above.
 */
describe('the melee consequence', () => {
  it('rejects every one of the nine melee+melee pairings', () => {
    for (const primary of MELEE_TYPES) {
      for (const secondary of MELEE_TYPES) {
        expect(isLegalPairing(primary, secondary).legal).toBe(false);
      }
    }
  });

  it('leaves every melee primary exactly six legal secondaries, all magic', () => {
    for (const primary of MELEE_TYPES) {
      const legal = DAMAGE_TYPES.filter((s) => isLegalPairing(primary, s).legal);

      expect(legal).toHaveLength(6);
      for (const s of legal) {
        expect(family(s)).toBe('magic');
      }
    }
  });

  it('holds for all 27 authored heroes', () => {
    const heroes = getAllHeroes();
    expect(heroes).toHaveLength(27);

    for (const hero of heroes) {
      if (family(hero.primary) === 'melee') {
        expect(family(hero.secondary)).toBe('magic');
      }
    }
  });

  it('is a consequence, not a rule — the pairing rule never mentions a family', () => {
    // Scoped to `isLegalPairing`, not the whole file. `derive()` legitimately
    // calls `family()` to populate a hero's derived `family` field; that is a
    // derivation, not a pairing rule. The FR-006 claim is specifically that
    // *legality* is decided without ever asking what family a type belongs to.
    const file = src('derive.ts');
    const start = file.indexOf('export function isLegalPairing');
    expect(start).toBeGreaterThan(-1);

    const rest = file.slice(start);
    const end = rest.indexOf('\n}');
    expect(end).toBeGreaterThan(-1);

    const body = rest
      .slice(0, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(body).not.toMatch(/\bmelee\b/i);
    expect(body).not.toMatch(/\bmagic\b/i);
    expect(body).not.toMatch(/\bMELEE_TYPES\b/);
    expect(body).not.toMatch(/\bfamily\b/);

    // And it decides legality using nothing but equality and `counter`.
    expect(body).toMatch(/counter\(/);
  });
});

/**
 * The derivation itself (FR-002). Four fields, none of them ever authored.
 */
describe('derive', () => {
  it('derives strengths, bane, fault and family from the two authored fields', () => {
    const d = derive('earth', 'fire');

    expect(d.strengths).toEqual(['earth', 'fire']);
    expect(d.bane).toBe(counter('earth'));
    expect(d.fault).toBe(counter('fire'));
    expect(d.family).toBe('magic');
  });

  it('agrees with counter on every legal pairing', () => {
    const legal = DAMAGE_TYPES.flatMap((primary) =>
      DAMAGE_TYPES.filter((secondary) => isLegalPairing(primary, secondary).legal).map(
        (secondary) => ({ primary, secondary }),
      ),
    );

    expect(legal).toHaveLength(60);

    for (const { primary, secondary } of legal) {
      const d = derive(primary, secondary);
      expect(d.bane).toBe(counter(primary));
      expect(d.fault).toBe(counter(secondary));
      expect(d.strengths).toEqual([primary, secondary]);
      expect(d.family).toBe(family(primary));
    }
  });

  it('refuses to derive from an illegal pairing rather than returning nonsense', () => {
    expect(() => derive('earth', 'air')).toThrow();
  });
});
