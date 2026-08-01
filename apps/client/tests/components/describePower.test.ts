/**
 * The generated one-line description of a power.
 *
 * ### Why this is generated at all, and why that needs testing
 *
 * **No power in this game has an authored description.** A `Power` is
 * `{id, name, tier, multiplier, cooldown, gateTurn, types, targets, friendly,
 * reactive}` and nothing else, so the sentence in the roster's flyout is
 * assembled from those fields rather than written by hand.
 *
 * That is the honest choice, and it moves the risk: hand-written prose can go
 * stale, but generated prose can be **confidently wrong** — a clause that says
 * "heals" about a power that damages reads perfectly and is a lie the player
 * will act on. So the assertions below are about the three shapes a power can
 * take, checked against every power in the roster rather than a fixture.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, type Power } from '@lmntlz/content';
import { describePower } from '../../src/components/hero/PowerDetail.js';

const POWERS: readonly Power[] = getAllHeroes().flatMap((h) => h.powers);

/** The three shapes, found rather than assumed — if one vanishes, say so. */
const damaging = POWERS.filter((p) => p.multiplier !== null && !p.friendly);
const healing = POWERS.filter((p) => p.multiplier !== null && p.friendly);
const neither = POWERS.filter((p) => p.multiplier === null);

describe('the roster actually contains all three shapes', () => {
  /*
   * Without this, two of the three describe-blocks below could quietly iterate
   * an empty array and pass forever. An `it.each([])` is a green test that ran
   * nothing — the failure mode this repo has hit before.
   */
  it('has damaging, healing and non-scaling powers to describe', () => {
    expect(damaging.length, 'no damaging powers').toBeGreaterThan(0);
    expect(healing.length, 'no friendly powers with a multiplier').toBeGreaterThan(0);
    expect(neither.length, 'no powers with a null multiplier').toBeGreaterThan(0);
    expect(damaging.length + healing.length + neither.length).toBe(POWERS.length);
  });
});

describe('a damaging power', () => {
  it('says it deals damage, and never says it heals', () => {
    for (const power of damaging) {
      const text = describePower(power);
      expect(text, `${power.name}`).toMatch(/^Deals /);
      // The clause that would be a lie a player acts on.
      expect(text, `${power.name} claims to heal`).not.toMatch(/heals/i);
    }
  });

  it('names every Force it carries', () => {
    for (const power of damaging) {
      const text = describePower(power);
      for (const type of power.types) {
        expect(text, `${power.name} omits ${type}`).toContain(type);
      }
    }
  });
});

describe('a friendly power', () => {
  it('says it heals, and never says it deals damage', () => {
    for (const power of healing) {
      const text = describePower(power);
      expect(text, `${power.name}`).toMatch(/^Heals /);
      expect(text, `${power.name} claims to deal damage`).not.toMatch(/deals/i);
    }
  });
});

describe('a power that neither damages nor heals', () => {
  it('claims neither', () => {
    for (const power of neither) {
      const text = describePower(power);
      expect(text, `${power.name}`).not.toMatch(/deals|heals/i);
      // And it must not print `Might × null`, which is what a naive template does.
      expect(text, `${power.name} printed a null multiplier`).not.toContain('null');
    }
  });
});

describe('cadence and the gate', () => {
  /** Constitution XIII: cooldowns are integer turns, never a clock. */
  it('never expresses a cooldown in seconds', () => {
    for (const power of POWERS) {
      expect(describePower(power), `${power.name}`).not.toMatch(/second|ms\b|\dm?s\b/i);
    }
  });

  it('pluralises turns correctly', () => {
    const oneTurn = POWERS.filter((p) => p.cooldown === 1);
    expect(oneTurn.length, 'no single-turn cooldowns in the roster').toBeGreaterThan(0);
    for (const power of oneTurn) {
      // `turn` and then a boundary — not `turn,`, because the comma only exists
      // when a gate clause follows, and most one-turn powers are ungated.
      expect(describePower(power), `${power.name}`).toMatch(/once every 1 turn\b/);
      expect(describePower(power), `${power.name} says "turns" for one`).not.toContain(
        'every 1 turns',
      );
    }
  });

  it('states the gate only when there is one', () => {
    const gated = POWERS.filter((p) => p.gateTurn > 1);
    const ungated = POWERS.filter((p) => p.gateTurn === 1);
    expect(gated.length, 'no gated powers in the roster').toBeGreaterThan(0);
    expect(ungated.length, 'no ungated powers in the roster').toBeGreaterThan(0);

    for (const power of gated) {
      expect(describePower(power), `${power.name}`).toContain(`not before turn ${power.gateTurn}`);
    }
    for (const power of ungated) {
      // A gate of 1 is "available immediately" — printing it would be noise on
      // the majority of powers and would make the real gates less visible.
      expect(describePower(power), `${power.name}`).not.toContain('not before turn');
    }
  });
});

describe('it describes what it was given', () => {
  /**
   * The assertion that catches a template reading the wrong field. Two powers
   * differing only in `multiplier` must produce two different sentences — a
   * generator that hardcoded a number, or read `tier` where it meant
   * `multiplier`, passes every test above and fails this one.
   */
  it('two powers differing only in multiplier read differently', () => {
    const base = damaging[0]!;
    const twice: Power = { ...base, multiplier: (base.multiplier ?? 1) * 2 };
    expect(describePower(twice)).not.toBe(describePower(base));
    expect(describePower(twice)).toContain(String((base.multiplier ?? 1) * 2));
  });

  it('two powers differing only in targets read differently', () => {
    const single: Power = { ...damaging[0]!, targets: 'single' };
    const party: Power = { ...damaging[0]!, targets: 'party' };
    expect(describePower(single)).not.toBe(describePower(party));
    expect(describePower(party)).toContain('the whole squad');
  });
});
