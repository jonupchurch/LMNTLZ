import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES, counter, family } from '../src/types.js';
import { isLegalPairing } from '../src/derive.js';
import {
  FORBIDDEN_AUTHORED_FIELDS,
  STAT_CAP,
  authoredHeroSchema,
  heroStatsSchema,
  powerSchema,
  reachSchema,
} from '../src/schema.js';
import { getAllHeroes, getHero, UnknownHeroError, validateRoster } from '../src/index.js';
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

/**
 * T036 — malformed values are refused, naming the hero and the field (FR-013,
 * FR-014, FR-017).
 *
 * Each of these is a value a designer could plausibly type into a spreadsheet.
 * The point is not that the schema rejects nonsense; it is that a *near miss*
 * fails rather than being coerced into something that runs.
 */
describe('shape rejection', () => {
  const sample = getAllHeroes()[0]!;

  const heroWith = (patch: Record<string, unknown>): unknown => ({
    id: sample.id,
    name: sample.name,
    slug: sample.slug,
    primary: sample.primary,
    secondary: sample.secondary,
    role: sample.role,
    reach: sample.reach,
    stats: { ...sample.stats },
    powers: sample.powers.map((p) => ({ ...p })),
    passives: [...sample.passives],
    ...patch,
  });

  it('refuses a stat over the 75 cap', () => {
    const result = heroStatsSchema.safeParse({ ...sample.stats, might: STAT_CAP + 1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      expect(issue.path).toContain('might');
      expect(issue.message).toMatch(/75/);
    }
  });

  it('accepts a stat exactly at the cap — the cap is inclusive', () => {
    expect(heroStatsSchema.safeParse({ ...sample.stats, might: STAT_CAP }).success).toBe(true);
  });

  it('refuses a fractional stat rather than rounding it', () => {
    const result = heroStatsSchema.safeParse({ ...sample.stats, luck: 25.5 });
    expect(result.success).toBe(false);
  });

  it('refuses a fractional cooldown', () => {
    const result = powerSchema.safeParse({ ...sample.powers[0]!, cooldown: 1.5 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toContain('cooldown');
      expect(result.error.issues[0]!.message).toMatch(/whole turns/);
    }
  });

  it('does NOT catch a cooldown expressed as milliseconds — a recorded limit', () => {
    // Someone writes 1500 meaning 1.5 seconds. That is an integer, so the
    // integer rule passes it. The schema cannot distinguish "1500 turns" from
    // "1500 ms" because both are the same value, and inventing an upper bound
    // here would be a guess about how long a power may take to recharge.
    //
    // Recorded rather than fixed: the real guard is that no cooldown in the
    // workbook is anywhere near this, and the assertion below is what would
    // fail if one appeared.
    expect(powerSchema.safeParse({ ...sample.powers[0]!, cooldown: 1500 }).success).toBe(true);

    const cooldowns = getAllHeroes().flatMap((h) => h.powers.map((p) => p.cooldown));
    expect(Math.max(...cooldowns)).toBeLessThan(20);
  });

  it('refuses a reach outside {1, 2}', () => {
    expect(reachSchema.safeParse(1).success).toBe(true);
    expect(reachSchema.safeParse(2).success).toBe(true);
    expect(reachSchema.safeParse(0).success).toBe(false);
    expect(reachSchema.safeParse(3).success).toBe(false);
    expect(reachSchema.safeParse(1.5).success).toBe(false);
  });

  it('refuses an unknown damage type', () => {
    const result = authoredHeroSchema.safeParse(heroWith({ primary: 'holy' }));
    expect(result.success).toBe(false);
  });

  it('refuses a hero with fewer than six powers', () => {
    const result = authoredHeroSchema.safeParse(
      heroWith({ powers: sample.powers.slice(0, 5).map((p) => ({ ...p })) }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses a hero with fewer than three passives', () => {
    const result = authoredHeroSchema.safeParse({
      ...(heroWith({}) as object),
      passives: [sample.passives[0], sample.passives[1]],
    });
    expect(result.success).toBe(false);
  });

  it('names the hero and the field on an illegal pairing', () => {
    const result = authoredHeroSchema.safeParse(
      heroWith({ primary: 'earth', secondary: 'air' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ');
      expect(message).toContain(sample.id);
      expect(message).toContain('secondary');
    }
  });

  /**
   * FR-001, and the reason every object in the schema is strict.
   *
   * A source file offering a hand-authored weakness must be REJECTED. A
   * non-strict schema would strip the field silently and let the file look
   * valid, which is the same outcome as having no rule at all.
   */
  it('refuses a source that hand-authors a derived field', () => {
    for (const field of FORBIDDEN_AUTHORED_FIELDS) {
      const result = authoredHeroSchema.safeParse(heroWith({ [field]: 'air' }));

      expect(result.success, `authoring "${field}" was accepted`).toBe(false);
    }
  });
});

/**
 * The package surface (FR-011, FR-015).
 */
describe('the surface', () => {
  it('returns all 27 heroes in stable order, frozen', () => {
    const heroes = getAllHeroes();

    expect(heroes).toHaveLength(27);
    expect(Object.isFrozen(heroes)).toBe(true);
    expect(heroes.map((h) => h.id)).toEqual(getAllHeroes().map((h) => h.id));
  });

  it('throws UnknownHeroError rather than returning undefined', () => {
    expect(() => getHero('h99')).toThrow(UnknownHeroError);
    expect(() => getHero('h99')).toThrow(/content bug/);
  });

  it('resolves every id the roster carries', () => {
    for (const hero of getAllHeroes()) {
      expect(getHero(hero.id).id).toBe(hero.id);
    }
  });

  it('validates the shipped roster clean — the startup guard did not fire', () => {
    expect(validateRoster()).toEqual([]);
  });

  it('gives exactly three champions to each of the nine types', () => {
    for (const type of DAMAGE_TYPES) {
      expect(getAllHeroes().filter((h) => h.primary === type)).toHaveLength(3);
    }
  });
});
