import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '../src/index.js';

const allPowers = (): { hero: string; power: ReturnType<typeof getAllHeroes>[number]['powers'][number] }[] =>
  getAllHeroes().flatMap((h) => h.powers.map((power) => ({ hero: h.name, power })));

const distinct = (): Map<string, (typeof allPowers extends () => infer R ? R : never)[number]['power']> => {
  const map = new Map<string, ReturnType<typeof getAllHeroes>[number]['powers'][number]>();
  for (const { power } of allPowers()) map.set(power.id, power);
  return map;
};

/**
 * Who a power targets (`friendly`) versus what it happens to do (`buff`).
 *
 * These are different questions and the roster makes the difference load-bearing:
 * about twenty powers grant a buff, and all but one of them do it as a **rider on
 * an attack aimed at an enemy**, buffing the caster. Marking those friendly would
 * point a damaging strike at an ally.
 */
describe('friendly powers', () => {
  it('is exactly four powers, and every one of them targets an ally', () => {
    const friendly = [...distinct().values()]
      .filter((p) => p.friendly)
      .map((p) => p.name)
      .sort();

    expect(friendly).toEqual([
      // The three heals — 03-powers.md, "all healing sits in the three Buffers'
      // tier-4 slot, one at each scale".
      'Enough Light for Everyone',
      'Fair Weather',
      // The roster's only ally-targeting non-heal: "No direct damage. Grants the
      // whole squad a temporary Speed and Agility buff."
      'Unmake the Wound',
      'Whisper from the High Reach',
    ]);
  });

  it('marks no attack as friendly, however much it buffs the caster', () => {
    // Every one of these strikes an enemy and buffs its own caster. If any of
    // them ever reads friendly, the engine will aim it at an ally.
    const selfBuffRiders = [
      'Kneel and Raise',
      'The God-Bone Wakes',
      'The Bloom Lends Heat',
      'The Deep Lends Weight',
      'The Sky Lends Swiftness',
      'The Silence Lends Cover',
      'The Word Lends Sight',
      'The Tide Lends Patience',
      'Clear the Room',
      'The Wide Reaping',
      'Guards Break First',
      'The Undenied',
      'I Know Your Hour',
      'Shepherd of Endings',
    ];

    const powers = distinct();
    for (const name of selfBuffRiders) {
      const power = powers.get(name);
      expect(power, `${name} is not in the roster`).toBeDefined();
      expect(power!.friendly, `${name} is marked friendly but it strikes an enemy`).toBe(false);
    }
  });

  it('gives every friendly power to a Buffer', () => {
    for (const hero of getAllHeroes()) {
      const friendly = hero.powers.filter((p) => p.friendly);
      if (friendly.length > 0) {
        expect(hero.role, `${hero.name} carries a friendly power but is a ${hero.role}`).toBe(
          'buffer',
        );
      }
    }
  });
});

/**
 * `03-powers.md`: three powers deal neither damage nor healing, and their
 * multiplier is **blank, not zero** — "zero would read as 'deals no damage',
 * when the truth is that damage is not a thing these powers have".
 */
describe('the three powers with no number at all', () => {
  const NO_DAMAGE = ['Whisper from the High Reach', 'The Unhidden Hour', 'The Undoing'];

  it('carries null rather than a number', () => {
    const powers = distinct();
    for (const name of NO_DAMAGE) {
      const power = powers.get(name);
      expect(power, `${name} is not in the roster`).toBeDefined();
      expect(power!.multiplier, `${name} should have no multiplier at all`).toBeNull();
    }
  });

  it('is the complete set — nothing else has a null multiplier', () => {
    const nullish = [...distinct().values()]
      .filter((p) => p.multiplier === null)
      .map((p) => p.name)
      .sort();

    expect(nullish).toEqual([...NO_DAMAGE].sort());
  });

  it('never carries a zero, which would be a different and false claim', () => {
    for (const { power } of allPowers()) {
      expect(power.multiplier, `${power.name} has multiplier 0`).not.toBe(0);
    }
  });
});

describe('power shape across the whole roster', () => {
  it('gates tier 4 at turn 3, tier 5 at turn 5, everything else at 1', () => {
    for (const { power } of allPowers()) {
      const expected = power.tier === 4 ? 3 : power.tier === 5 ? 5 : 1;
      expect(power.gateTurn, `${power.name} (tier ${power.tier})`).toBe(expected);
    }
  });

  it('gives every hero one power at each tier 0 through 5', () => {
    for (const hero of getAllHeroes()) {
      expect(hero.powers.map((p) => p.tier)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it('keeps every cooldown a whole number of turns', () => {
    for (const { power } of allPowers()) {
      expect(Number.isInteger(power.cooldown), `${power.name}`).toBe(true);
    }
  });

  it('gives the tier-0 auto-attack a zero cooldown and everything else a real one', () => {
    for (const { power } of allPowers()) {
      if (power.tier === 0) expect(power.cooldown).toBe(0);
      else expect(power.cooldown, `${power.name}`).toBeGreaterThan(0);
    }
  });

  it('types every power with one of the hero’s own two types', () => {
    for (const hero of getAllHeroes()) {
      for (const power of hero.powers) {
        for (const type of power.types) {
          expect(
            [hero.primary, hero.secondary],
            `${hero.name}'s "${power.name}" is typed ${type}`,
          ).toContain(type);
        }
      }
    }
  });
});
