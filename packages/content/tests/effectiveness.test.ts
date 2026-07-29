import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES, counter } from '../src/types.js';
import { effectiveness, powerEffectiveness } from '../src/effectiveness.js';
import { getAllHeroes } from '../src/index.js';
import type { Effectiveness } from '../src/effectiveness.js';

const VALUES: readonly Effectiveness[] = [1.5, 1.25, 1.0, 0.8, 0.5];

/**
 * T028 — all 243 hero x attacking-type combinations (FR-007).
 */
describe('the 243 combinations', () => {
  const heroes = getAllHeroes();

  const all = heroes.flatMap((defender) =>
    DAMAGE_TYPES.map((attackType) => ({
      defender,
      attackType,
      value: effectiveness(attackType, defender),
    })),
  );

  it('is 27 heroes x 9 types', () => {
    expect(all).toHaveLength(243);
  });

  it('resolves every one to one of exactly five values', () => {
    for (const { value } of all) {
      expect(VALUES).toContain(value);
    }
  });

  it('matches the value derived from that hero’s authored pair', () => {
    for (const { defender, attackType, value } of all) {
      const expected =
        attackType === counter(defender.primary)
          ? 1.5
          : attackType === counter(defender.secondary)
            ? 1.25
            : attackType === defender.primary
              ? 0.5
              : attackType === defender.secondary
                ? 0.8
                : 1.0;

      expect(value).toBe(expected);
    }
  });

  /**
   * The distribution is perfectly uniform, and that is a consequence rather than
   * a coincidence: the distinctness rules guarantee all four of a hero's
   * relationship slots are different types, so every hero has exactly one of
   * each non-neutral value and five neutrals.
   *
   * If this ever comes out lopsided, a hero has two slots holding the same type
   * and the pairing rules let it through.
   */
  it('distributes as 27 / 27 / 135 / 27 / 27', () => {
    const count = (v: Effectiveness): number => all.filter((c) => c.value === v).length;

    expect(count(1.5)).toBe(27);
    expect(count(1.25)).toBe(27);
    expect(count(1.0)).toBe(135);
    expect(count(0.8)).toBe(27);
    expect(count(0.5)).toBe(27);
  });

  it('gives every hero exactly one bane and one fault', () => {
    for (const hero of heroes) {
      const values = DAMAGE_TYPES.map((t) => effectiveness(t, hero));
      expect(values.filter((v) => v === 1.5)).toHaveLength(1);
      expect(values.filter((v) => v === 1.25)).toHaveLength(1);
      expect(values.filter((v) => v === 0.5)).toHaveLength(1);
      expect(values.filter((v) => v === 0.8)).toHaveLength(1);
    }
  });
});

/**
 * T029 — no literal table anywhere (FR-008, SC-001).
 *
 * The claim is not "there is no table today". It is that the relationship is
 * written down in exactly one place, so a second one cannot drift from the
 * first. A hard-coded multiplier outside `effectiveness.ts` is the beginning of
 * the second place.
 */
describe('no literal effectiveness table', () => {
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));

  /**
   * Hand-written source only.
   *
   * `*.generated.ts` is excluded deliberately, and the reason is the point of the
   * test rather than an exception to it. The emitted roster contains the literal
   * `1.5` many times — as *power multipliers*, which are authored numbers that
   * happen to share a value with an effectiveness step. What this test forbids is
   * a second place where the type *relationship* is written down, and generated
   * data rebuilt from the workbook on every run cannot be that second place.
   */
  const sources = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.generated.ts'))
    .map((f) => ({ file: f, text: readFileSync(`${srcDir}/${f}`, 'utf8') }));

  const stripped = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('finds no effectiveness multiplier outside effectiveness.ts', () => {
    for (const { file, text } of sources) {
      if (file === 'effectiveness.ts') continue;

      const code = stripped(text);
      expect(code, `${file} carries an effectiveness multiplier`).not.toMatch(/\b1\.25\b/);
      expect(code, `${file} carries an effectiveness multiplier`).not.toMatch(/\b0\.8\b/);
      expect(code, `${file} carries an effectiveness multiplier`).not.toMatch(/\b1\.5\b/);
    }
  });

  it('finds no 9x9 structure anywhere in src', () => {
    for (const { file, text } of sources) {
      const code = stripped(text);
      // A matrix would show up as a type name keyed by two damage types, or as
      // nine rows of nine numbers.
      expect(code, `${file} looks like it holds a matrix`).not.toMatch(
        /Record<\s*DamageType\s*,\s*Record<\s*DamageType/,
      );
      expect(code, `${file} looks like it holds a matrix`).not.toMatch(
        /(\[\s*(?:[\d.]+\s*,\s*){8}[\d.]+\s*\]\s*,?\s*){3}/,
      );
    }
  });

  it('keeps effectiveness.ts free of a lookup keyed by attacker and defender type', () => {
    const eff = sources.find((s) => s.file === 'effectiveness.ts');
    expect(eff).toBeDefined();
    const code = stripped(eff!.text);

    // The five named constants are the only literals it may carry.
    expect(code).not.toMatch(/new Map\(/);
    expect(code).not.toMatch(/Record<\s*DamageType/);
  });
});

/**
 * FR-009 — a dual-typed power resolves as the better of its two types.
 */
describe('powerEffectiveness', () => {
  const heroes = getAllHeroes();

  it('takes the better of a dual-typed power’s two types', () => {
    for (const attacker of heroes) {
      for (const power of attacker.powers) {
        for (const defender of heroes) {
          const each = power.types.map((t) => effectiveness(t, defender));
          expect(powerEffectiveness(power, defender)).toBe(Math.max(...each));
        }
      }
    }
  });

  it('routes single-typed powers through the same path', () => {
    const single = heroes
      .flatMap((h) => h.powers)
      .filter((p) => p.types.length === 1);

    expect(single.length).toBeGreaterThan(0);

    for (const power of single) {
      for (const defender of heroes) {
        expect(powerEffectiveness(power, defender)).toBe(
          effectiveness(power.types[0]!, defender),
        );
      }
    }
  });

  /**
   * **A recorded correction.** `CLAUDE.md` and `03-powers.md` both state the
   * consequence as *"no tier-4 or tier-5 power is ever resisted."* Measured
   * against the real roster that is **false**: there are 24 resisted cases.
   *
   * The mechanism is a mirror pairing. A tier-4/5 power is dual-typed with the
   * attacker's own two types, so it is resisted only when BOTH of those types
   * are types the defender resists — which needs the defender's two types to be
   * the same pair. Six hero pairs carry exactly swapped types (Bramwen
   * earth/fire vs Cindara fire/earth, and five more), and each such ordered pair
   * costs both of the attacker's top powers a x0.80.
   *
   * The weaker claim IS true and is what this test locks: **a tier-4/5 power is
   * never strongly resisted.** It never resolves to x0.50, because the better of
   * two types can only be the x0.50 branch if both are the defender's primary,
   * and a type cannot be its own pair.
   */
  it('never resolves a tier-4/5 power to x0.50, though x0.80 does happen', () => {
    const resisted: string[] = [];

    for (const attacker of heroes) {
      for (const power of attacker.powers) {
        if (power.tier !== 4 && power.tier !== 5) continue;
        for (const defender of heroes) {
          if (defender.id === attacker.id) continue;
          const value = powerEffectiveness(power, defender);

          expect(value, `${power.name} vs ${defender.name} was strongly resisted`).not.toBe(0.5);

          if (value < 1.0) resisted.push(`${power.name} vs ${defender.name}`);
        }
      }
    }

    // Locked as a measurement, so a roster change that alters it is visible.
    expect(resisted).toHaveLength(24);
  });

  it('has six mirror pairs, which is where those 24 cases come from', () => {
    const key = (a: string, b: string): string => [a, b].sort().join('|');
    const groups = new Map<string, string[]>();

    for (const h of heroes) {
      const k = key(h.primary, h.secondary);
      groups.set(k, [...(groups.get(k) ?? []), h.name]);
    }

    const mirrors = [...groups.values()].filter((names) => names.length > 1);

    expect(mirrors).toHaveLength(6);
    for (const pair of mirrors) expect(pair).toHaveLength(2);

    // 6 unordered pairs -> 12 ordered -> x2 powers each (tier 4 and tier 5) = 24.
    expect(mirrors.length * 2 * 2).toBe(24);
  });
});
