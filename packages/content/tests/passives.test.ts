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
import { PARTIALLY_SETTLED, PASSIVES, getPassive } from '../src/passives.js';

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

describe('the written effects', () => {
  /**
   * ⚠️ **This assertion was inverted on 2026-08-01, and the inversion is the feature.**
   *
   * It used to read `toHaveLength(19)` and pin the number of passives the design had
   * *not* written — visible on purpose, so nobody could quietly add a twentieth. The
   * nineteen were drafted, approved line by line and written into `03-powers.md`, so
   * the honest claim is now the opposite one.
   *
   * **Zero rather than a smaller number** (SC-003). A count that merely went down would
   * have to be edited every time one was authored, and an assertion nobody can satisfy
   * by accident is worth more than one that tracks progress: from here, a hero whose
   * passive nobody wrote fails the build instead of reaching a player as *"effect not
   * yet specified"* on the roster drawer.
   */
  it('leaves no passive on the roster without an effect', () => {
    const blank = PASSIVES.filter((p) => p.effect === null);

    expect(blank, blank.map((p) => p.name).join(' · ')).toHaveLength(0);
  });

  /**
   * **A written effect is not the same as a running one**, and the catalog must not
   * blur them.
   *
   * `PARTIALLY_SETTLED` held `The Bone Beneath` while its stat was decided and its
   * trigger was not. It is empty now, and it stays as a shape rather than being
   * deleted — this asserts nothing has been parked in it *and* given effect text,
   * which would be a passive claiming to be both settled and unsettled at once.
   */
  it('parks nothing in PARTIALLY_SETTLED that already has an effect', () => {
    for (const name of Object.keys(PARTIALLY_SETTLED)) {
      expect(getPassive(name)?.effect, `${name} is both half-settled and written`).toBeNull();
    }
  });

  it('has an effect for every role and house passive', () => {
    for (const passive of PASSIVES) {
      if (passive.scope === 'unique') continue;
      expect(passive.effect, `${passive.name} has no effect text`).toBeTruthy();
    }
  });

  /**
   * The eight uniques the design has actually written must keep their text.
   *
   * ⚠️ **Three of these were missed on the first pass** and shipped as *"effect not yet
   * specified"* on a live screen, because that pass read `03-powers.md` only. A
   * passive's spec lives wherever its mechanic lives — these three are in
   * `05-status.md`. Listed by name so a future edit cannot quietly drop one back.
   */
  it('keeps every documented effect, from both source documents', () => {
    for (const name of [
      'Immovable',
      'Already Gone',
      'Nothing to Discuss',
      "The Duelist's Habit",
      'It All Comes Back',
      'Never Quite Out',
      'Written in Pencil',
      'Banked Coals',
    ]) {
      expect(getPassive(name)?.effect, `${name} lost its authored effect`).toBeTruthy();
    }
  });
});
