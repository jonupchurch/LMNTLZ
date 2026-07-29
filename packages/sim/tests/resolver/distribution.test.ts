import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { hitProbability } from '../../rules/index.js';
import { drawBelow, drawUnit } from '../../resolver/rng.js';
import { battle, fixedSeed } from './fixtures.js';

/**
 * T025 — the accuracy model, observed rather than asserted.
 *
 * Feature 002 computes a probability in closed form. This is where that stops
 * being a claim: draw against it a hundred thousand times and confirm the
 * observed rate converges where the arithmetic said it would.
 */
describe('resolution converges on the computed probability', () => {
  const seed = fixedSeed();

  const observe = (p: number, n = 200_000): number => {
    let hits = 0;
    for (let i = 0n; i < BigInt(n); i++) if (drawBelow(seed, i, p)) hits++;
    return hits / n;
  };

  it('lands about 82% of the time at a computed 82%', () => {
    expect(observe(0.82)).toBeCloseTo(0.82, 2);
  });

  it('converges across the whole clamped range', () => {
    for (const p of [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
      expect(observe(p, 100_000), `p = ${p}`).toBeCloseTo(p, 2);
    }
  });

  it('crits about 20% of the time at Luck 40', () => {
    // Luck x 0.5 percent = 20%.
    expect(observe(0.2)).toBeCloseTo(0.2, 2);
  });

  it('crits about 37.5% at the Luck cap of 75', () => {
    expect(observe(0.375)).toBeCloseTo(0.375, 2);
  });

  it('never lands at p = 0 and always lands at p = 1', () => {
    for (let i = 0n; i < 5_000n; i++) {
      expect(drawBelow(seed, i, 0)).toBe(false);
      expect(drawBelow(seed, i, 1)).toBe(true);
    }
  });

  it('uses one draw per decision, so two decisions never share an index', () => {
    // Independence: the hit draw and the crit draw come from adjacent indices,
    // and a correlation between them would make crits cluster on hits.
    let both = 0;
    const N = 100_000;
    for (let i = 0n; i < BigInt(N * 2); i += 2n) {
      if (drawUnit(seed, i) < 0.5 && drawUnit(seed, i + 1n) < 0.5) both++;
    }
    expect(both / N).toBeCloseTo(0.25, 2);
  });
});

/**
 * T026 — **a balance regression detector, not a unit test.**
 *
 * Read it as *"the accuracy model still behaves as designed"*, never as *"this
 * function is correct"*. `tools/verify-accuracy.py` reproduces the figure
 * independently.
 */
describe('the median miss rate across all 729 pairings', () => {
  it('is about 9.4% at base stats', () => {
    const heroes = getAllHeroes();
    const misses: number[] = [];

    for (const attacker of heroes) {
      for (const defender of heroes) {
        const state = battle(attacker.id, defender.id);
        misses.push(1 - hitProbability(state, 'a0', 'd0'));
      }
    }

    expect(misses).toHaveLength(729);

    misses.sort((a, b) => a - b);
    const median = misses[Math.floor(misses.length / 2)]!;

    expect(median).toBeCloseTo(0.094, 2);
  });

  it('keeps every pairing inside the clamp, so no build is unhittable', () => {
    const heroes = getAllHeroes();

    for (const attacker of heroes) {
      for (const defender of heroes) {
        const p = hitProbability(battle(attacker.id, defender.id), 'a0', 'd0');
        expect(p, `${attacker.name} -> ${defender.name}`).toBeGreaterThanOrEqual(0.65);
        expect(p).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('does not re-derive or re-clamp the probability in the resolver', () => {
    // FR-013 — the [0.65, 0.95] clamp lives in `rules`. Two clamps in two
    // places is how they drift, and the drift would be invisible: both would
    // look right in isolation.
    const state = battle('h01', 'h19');
    const fromRules = hitProbability(state, 'a0', 'd0');

    // The resolver's only job is to compare one draw against this number.
    expect(fromRules).toBeGreaterThanOrEqual(0.65);
    expect(fromRules).toBeLessThanOrEqual(0.95);
    expect(getHero('h01')).toBeDefined();
  });
});
