/**
 * The passive catalog against the roster that names them.
 *
 * ### The catalog is a second list, so it can drift — this is what stops it
 *
 * A hero's `passives` are three bare strings validated only for non-emptiness. Nothing
 * in the schema ties them to a meaning, so a renamed passive, a new hero, or a typo
 * would leave a screen rendering a name with no effect beside it and no error anywhere.
 * These tests make that a build failure.
 *
 * They also pin the **structure** `03-powers.md` states — slot 0 role, slot 1 house,
 * slot 2 unique, 4 · 9 · 27 — which was read off the roster rather than declared, and
 * is therefore exactly the kind of fact that is true until somebody authors a hero
 * without knowing it.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '../src/index.js';
import { PASSIVES, getPassive } from '../src/passives.js';

const heroes = getAllHeroes();

describe('every passive the roster names is in the catalog', () => {
  it('resolves all 81 slots', () => {
    const missing: string[] = [];

    for (const hero of heroes) {
      for (const name of hero.passives) {
        if (!getPassive(name)) missing.push(`${hero.name}: "${name}"`);
      }
    }

    expect(missing, missing.join(' · ')).toEqual([]);
  });

  /** The other direction: a catalog entry nobody has is an entry nobody maintains. */
  it('carries nothing the roster does not use', () => {
    const used = new Set(heroes.flatMap((h) => [...h.passives]));
    const orphans = PASSIVES.filter((p) => !used.has(p.name)).map((p) => p.name);

    expect(orphans, orphans.join(' · ')).toEqual([]);
  });

  it('holds 4 role, 9 house and 27 unique — forty in all', () => {
    const count = (scope: string) => PASSIVES.filter((p) => p.scope === scope).length;

    expect(count('role')).toBe(4);
    expect(count('house')).toBe(9);
    expect(count('unique')).toBe(27);
    expect(PASSIVES).toHaveLength(40);
  });
});

describe('the three slots mean what 03-powers.md says they mean', () => {
  it('gives every hero a role passive, a house passive and a unique, in that order', () => {
    for (const hero of heroes) {
      const scopes = hero.passives.map((n) => getPassive(n)?.scope);

      expect(scopes, `${hero.name}: ${hero.passives.join(', ')}`).toEqual([
        'role',
        'house',
        'unique',
      ]);
    }
  });

  it('matches the role passive to the hero’s own role', () => {
    for (const hero of heroes) {
      expect(getPassive(hero.passives[0])!.belongsTo, `${hero.name} is a ${hero.role}`).toBe(
        hero.role,
      );
    }
  });

  /** One per Force, and it is the hero's **primary** — the authored field, not the derived. */
  it('matches the house passive to the hero’s primary Force', () => {
    for (const hero of heroes) {
      expect(getPassive(hero.passives[1])!.belongsTo, `${hero.name} leads ${hero.primary}`).toBe(
        hero.primary,
      );
    }
  });

  it('gives every hero a unique nobody else has', () => {
    const uniques = heroes.map((h) => h.passives[2]);
    expect(new Set(uniques).size, 'two heroes share a "unique" passive').toBe(heroes.length);
  });
});

describe('the unwritten effects', () => {
  /**
   * ⚠️ **Pinned so it can only go down.**
   *
   * `03-powers.md` authors all 4 role effects and all 9 house effects, and describes 5
   * of the 27 uniques — the ones whose hook mechanics other rules depend on. The other
   * 22 are named on the roster and specified nowhere.
   *
   * They are `null` in the catalog rather than invented, because inventing them would
   * create a second source for 22 unmade design decisions. This test exists so that
   * number is visible and so nobody can quietly add a 23rd.
   */
  const UNWRITTEN = 22;

  it('leaves exactly the effects the design has not written', () => {
    const blank = PASSIVES.filter((p) => p.effect === null);

    expect(blank, blank.map((p) => p.name).join(' · ')).toHaveLength(UNWRITTEN);
    expect(blank.every((p) => p.scope === 'unique'), 'a role or house effect went missing').toBe(
      true,
    );
  });

  it('has an effect for every role and house passive', () => {
    for (const passive of PASSIVES) {
      if (passive.scope === 'unique') continue;
      expect(passive.effect, `${passive.name} has no effect text`).toBeTruthy();
    }
  });

  /** The five uniques other rules lean on must keep their text. */
  it('keeps the five documented hook mechanics', () => {
    for (const name of [
      'Immovable',
      'Already Gone',
      'Nothing to Discuss',
      "The Duelist's Habit",
      'It All Comes Back',
    ]) {
      expect(getPassive(name)?.effect, `${name} lost its authored effect`).toBeTruthy();
    }
  });
});
