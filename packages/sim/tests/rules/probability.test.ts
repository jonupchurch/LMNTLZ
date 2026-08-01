import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import {
  ATTACKER_EDGE,
  MAX_HIT_PROBABILITY,
  MIN_HIT_PROBABILITY,
  contestProbability,
  critChance,
  dieSize,
  hitProbability,
  riderLandProbability,
  unclampedHitProbability,
} from '../../rules/probability.js';
import { allPairings, duel, percentile, withHero } from './fixtures.js';

describe('the folded contest', () => {
  it('floors the die and never goes below 1', () => {
    expect(dieSize(15)).toBe(22); // 15 x 1.5 = 22.5 -> 22, matching "rolls 1-22"
    expect(dieSize(45)).toBe(67);
    expect(dieSize(75)).toBe(112);
    expect(dieSize(0)).toBe(1); // the guard: a division by zero costs a battle
  });

  it('agrees with brute force over every small die pair and margin', () => {
    // The closed form replaces two draws. This is the proof that it is the SAME
    // distribution rather than a good approximation of it.
    for (let na = 1; na <= 12; na++) {
      for (let nd = 1; nd <= 12; nd++) {
        for (let m = -15; m <= 15; m++) {
          let wins = 0;
          for (let a = 1; a <= na; a++) {
            for (let d = 1; d <= nd; d++) {
              if (a > d + m) wins++; // ties to the defender
            }
          }
          expect(contestProbability(na, nd, m), `na=${na} nd=${nd} m=${m}`).toBeCloseTo(
            wins / (na * nd),
            12,
          );
        }
      }
    }
  });

  it('gives ties to the defender', () => {
    // One-sided dice, margin 0: A=1 vs D=1 is a tie, so the attacker never wins.
    expect(contestProbability(1, 1, 0)).toBe(0);
    // Margin -1 means A only needs to equal D, which it does.
    expect(contestProbability(1, 1, -1)).toBe(1);
  });

  it('is monotone in the margin', () => {
    let previous = 1;
    for (let m = -20; m <= 20; m++) {
      const p = contestProbability(30, 30, m);
      expect(p).toBeLessThanOrEqual(previous);
      previous = p;
    }
  });
});

describe('the clamp', () => {
  it('holds across all 729 pairings', () => {
    for (const { attacker, defender, state } of allPairings()) {
      const p = hitProbability(state, 'a', 'd');
      expect(p, `${attacker.name} vs ${defender.name}`).toBeGreaterThanOrEqual(
        MIN_HIT_PROBABILITY,
      );
      expect(p, `${attacker.name} vs ${defender.name}`).toBeLessThanOrEqual(MAX_HIT_PROBABILITY);
    }
  });

  /**
   * SC-008 — the case the clamp exists for.
   *
   * `01-stats.md` records that an `Agility` + `Luck` defender at the 75 cap is a
   * **98.2% miss rate unclamped**: a literal invincibility build. The clamp is
   * what survives runes.
   */
  it('survives a maxed Agility + Luck defender, which is 98%+ miss unclamped', () => {
    const base = duel('h01', 'h19');
    const attackerHero = getAllHeroes().find((h) => h.id === 'h01')!;
    const defenderHero = getAllHeroes().find((h) => h.id === 'h19')!;

    const runed = withHero(base, 'd', {
      statMods: {
        agility: 75 - defenderHero.stats.agility,
        luck: 75 - defenderHero.stats.luck,
      },
    });
    const weakAttacker = withHero(runed, 'a', {
      statMods: { perception: -attackerHero.stats.perception, luck: 1 - attackerHero.stats.luck },
    });

    const unclamped = unclampedHitProbability(weakAttacker, 'a', 'd');
    expect(1 - unclamped).toBeGreaterThan(0.95); // an invincibility build, unclamped

    expect(hitProbability(weakAttacker, 'a', 'd')).toBe(MIN_HIT_PROBABILITY);
  });

  it('caps a maxed attacker against a minimal defender at 95%', () => {
    const base = duel('h01', 'h19');
    const runed = withHero(withHero(base, 'a', { statMods: { perception: 35, luck: 40 } }), 'd', {
      statMods: { agility: -30, luck: -24 },
    });

    expect(unclampedHitProbability(runed, 'a', 'd')).toBe(1);
    expect(hitProbability(runed, 'a', 'd')).toBe(MAX_HIT_PROBABILITY);
  });

  it('is applied after the fold, not to the inputs', () => {
    // If the clamp ran on the margin instead, two very different runed defenders
    // would produce the same unclamped number. They must not.
    const base = duel('h01', 'h19');
    const a = withHero(base, 'd', { statMods: { agility: 20 } });
    const b = withHero(base, 'd', { statMods: { agility: 40 } });

    expect(unclampedHitProbability(a, 'a', 'd')).not.toBe(unclampedHitProbability(b, 'a', 'd'));
  });
});

/**
 * T015 — the recorded 729-pair distribution, locked as a regression.
 *
 * Every figure here is reproduced by `tools/verify-accuracy.py`, and
 * `research.md` Q2 records them against the analysis in `01-stats.md`. They are
 * asserted rather than described because the `+20` edge and the die convention
 * are both things somebody could plausibly "tidy up".
 */
describe('the recorded unclamped distribution over 729 pairings', () => {
  const misses = allPairings()
    .map(({ state }) => 1 - unclampedHitProbability(state, 'a', 'd'))
    .sort((x, y) => x - y);

  it('covers all 729 ordered pairs', () => {
    expect(misses).toHaveLength(729);
  });

  it('has a mean miss rate of 13.0%', () => {
    const mean = misses.reduce((s, m) => s + m, 0) / misses.length;
    expect(mean).toBeCloseTo(0.13, 2);
  });

  it('has a p90 miss rate of 28.9%', () => {
    expect(percentile(misses, 0.9)).toBeCloseTo(0.289, 2);
  });

  it('has zero pairs missing more than half the time', () => {
    expect(misses.filter((m) => m > 0.5)).toHaveLength(0);
  });

  it('has 42 auto-hits and 0 auto-misses', () => {
    expect(misses.filter((m) => m === 0)).toHaveLength(42);
    expect(misses.filter((m) => m === 1)).toHaveLength(0);
  });

  /**
   * The `+20` is what made the game playable, and this is the measurement that
   * says so: without it the median pairing was close to a coin flip.
   */
  it('is a coin flip without the +20 edge — which is why the edge exists', () => {
    const symmetric = allPairings()
      .map(({ state }) => {
        const attacker = state.heroes.find((h) => h.instanceId === 'a')!;
        const shifted = withHero(state, 'a', {
          statMods: { ...attacker.statMods, perception: -ATTACKER_EDGE },
        });
        return 1 - unclampedHitProbability(shifted, 'a', 'd');
      })
      .sort((x, y) => x - y);

    const median = percentile(symmetric, 0.5);
    expect(median).toBeGreaterThan(0.4);
    expect(median).toBeLessThan(0.5);

    const mean = symmetric.reduce((s, m) => s + m, 0) / symmetric.length;
    expect(mean).toBeCloseTo(0.426, 2);
  });
});

describe('riders and crits', () => {
  it('uses the same fold with no +20 edge', () => {
    const state = duel('h01', 'h19');
    // A rider at potency equal to the attacker's Perception should be strictly
    // harder to land than the attack, because it loses the edge.
    const attack = unclampedHitProbability(state, 'a', 'd');
    const rider = riderLandProbability(state, 'a', 'd', getAllHeroes()[0]!.stats.perception);

    expect(rider).toBeLessThanOrEqual(attack);
  });

  it('makes a rider easier to land as potency rises', () => {
    const state = duel('h01', 'h19');
    let previous = 0;
    for (let potency = 0; potency <= 60; potency += 10) {
      const p = riderLandProbability(state, 'a', 'd', potency);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  /**
   * **The rider contest is NOT clamped, and this is the test that proves it.**
   *
   * It ran through the 65–95% accuracy clamp until 2026-08-01. Nothing called it,
   * so nothing misbehaved — and the monotonic test above passes clamped, because
   * a floor is still non-decreasing. That is the shape of a test that cannot see
   * the bug it is next to.
   *
   * These numbers come from `05-status.md` itself: *"an average stick rate of 31%
   * at tier 1 rising to 87% at tier 5"*. Anything that reintroduces a floor moves
   * tier 1 to 65% and fails here immediately.
   */
  it('lands riders at the rates 05-status.md states, across all 729 pairs', () => {
    const heroes = getAllHeroes();
    const POTENCY = [20, 28, 36, 44, 52]; // tier 1..5

    const averages = POTENCY.map((potency) => {
      let sum = 0;
      for (const source of heroes) {
        for (const target of heroes) {
          const state = duel(source.id, target.id);
          sum += riderLandProbability(state, 'a', 'd', potency);
        }
      }
      return sum / (heroes.length * heroes.length);
    });

    /*
     * Pinned to the measured values, with the document's rounding noted, rather
     * than to the document's printed figures: tier 5 measures 86.5%, which `05`
     * prints as "87%". Asserting 0.87 to two places fails by 0.0001 — a test
     * that would read as an engine defect when the only disagreement is where
     * a percentage got rounded.
     */
    expect(averages[0], 'tier 1 — 05 prints 31%; a clamp puts this at 0.65').toBeCloseTo(0.312, 3);
    expect(averages[4], 'tier 5 — 05 prints 87%').toBeCloseTo(0.865, 3);

    /* Every tier strictly beats the one below — the sentence the catalog is
       written against, and the thing a floor destroys by flattening 1..3. */
    for (let i = 1; i < averages.length; i += 1) {
      expect(averages[i]!, `tier ${i + 1} vs ${i}`).toBeGreaterThan(averages[i - 1]! + 0.1);
    }
  });

  /**
   * The property `05-status.md` fits the 20–60 potency band to achieve:
   * *"nothing deterministic in either direction."* A rider that always lands is
   * not a contest, and one that never lands is a dead power.
   */
  it('is never certain in either direction, at any tier', () => {
    const heroes = getAllHeroes();

    for (const potency of [20, 28, 36, 44, 52]) {
      for (const source of heroes) {
        for (const target of heroes) {
          const p = riderLandProbability(duel(source.id, target.id), 'a', 'd', potency);
          expect(p, `${source.id}->${target.id} @${potency}`).toBeGreaterThan(0);
          expect(p, `${source.id}->${target.id} @${potency}`).toBeLessThan(1);
        }
      }
    }
  });

  it('computes crit as Luck x 0.5 percent', () => {
    const state = duel('h01', 'h19');
    const luck = getAllHeroes().find((h) => h.id === 'h01')!.stats.luck;
    expect(critChance(state, 'a')).toBeCloseTo((luck * 0.5) / 100, 10);
  });

  it('caps crit at 37.5% for a Luck-75 hero', () => {
    const state = duel('h01', 'h19');
    const luck = getAllHeroes().find((h) => h.id === 'h01')!.stats.luck;
    const maxed = withHero(state, 'a', { statMods: { luck: 75 - luck } });
    expect(critChance(maxed, 'a')).toBeCloseTo(0.375, 10);
  });
});
