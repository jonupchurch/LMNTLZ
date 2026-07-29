import { describe, expect, it } from 'vitest';
import { draw, drawInt, drawUnit } from '../../resolver/rng.js';
import { createSeed } from '../../resolver/seed.js';
import { fixedSeed } from './fixtures.js';

/**
 * T011 — the generator.
 *
 * **The portability check is the one that matters and the one that is easy to
 * skip.** A `Number`-based 64-bit multiply silently loses the low bits past
 * 2^53. It still produces a deterministic, plausible-looking sequence — just a
 * *different* one, potentially a different one on a different JavaScript
 * engine. It passes locally and diverges in production.
 */
describe('SplitMix64', () => {
  const seed = fixedSeed();

  it('produces 64-bit values', () => {
    for (let i = 0n; i < 100n; i++) {
      const value = draw(seed, i);
      expect(value).toBeGreaterThanOrEqual(0n);
      expect(value).toBeLessThan(1n << 64n);
    }
  });

  it('is positionally addressable — O(1) at any index', () => {
    // The property that makes re-derivation a lookup rather than a re-advance.
    // A generator that had to be stepped would make replaying a 300-turn battle
    // quadratic in the number of requests, and every request replays.
    const far = 10n ** 18n;

    const start = process.hrtime.bigint();
    const value = draw(seed, far);
    const elapsed = process.hrtime.bigint() - start;

    expect(value).toBeGreaterThanOrEqual(0n);
    expect(Number(elapsed)).toBeLessThan(5_000_000); // well under 5ms
    expect(draw(seed, far)).toBe(value);
  });

  it('computes entirely in BigInt — never truncated through a double', () => {
    // If any step passed through Number, values would collide once the stream
    // exceeded 2^53 of distinct outputs. Two indices 2^53 apart must differ.
    expect(draw(seed, 0n)).not.toBe(draw(seed, 2n ** 53n));
    expect(draw(seed, 1n)).not.toBe(draw(seed, 2n ** 53n + 1n));
  });

  it('gives different sequences for different seeds', () => {
    const a = fixedSeed(1n);
    const b = fixedSeed(2n);
    const differing = Array.from({ length: 64 }, (_, i) => BigInt(i)).filter(
      (i) => draw(a, i) !== draw(b, i),
    );
    expect(differing).toHaveLength(64);
  });

  it('rejects a negative index rather than wrapping', () => {
    expect(() => draw(seed, -1n)).toThrow(/non-negative/);
  });

  it('is reproducible from a persisted seed', () => {
    const values = Array.from({ length: 32 }, (_, i) => draw(fixedSeed(), BigInt(i)));
    const again = Array.from({ length: 32 }, (_, i) => draw(fixedSeed(), BigInt(i)));
    expect(again).toEqual(values);
  });
});

describe('drawUnit', () => {
  const seed = fixedSeed();

  it('stays inside [0, 1)', () => {
    for (let i = 0n; i < 10_000n; i++) {
      const u = drawUnit(seed, i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('is uniform — chi-squared over 100 buckets, 1,000,000 draws', () => {
    const BUCKETS = 100;
    const N = 1_000_000;
    const counts = new Array<number>(BUCKETS).fill(0);

    for (let i = 0n; i < BigInt(N); i++) {
      counts[Math.floor(drawUnit(seed, i) * BUCKETS)]! += 1;
    }

    const expectedPerBucket = N / BUCKETS;
    const chiSquared = counts.reduce(
      (sum, observed) => sum + (observed - expectedPerBucket) ** 2 / expectedPerBucket,
      0,
    );

    // 99 degrees of freedom: the 0.999 critical value is ~148.2. A generator
    // this far off would be visibly patterned.
    expect(chiSquared).toBeLessThan(148.2);
  });

  it('has a mean close to 0.5', () => {
    let sum = 0;
    const N = 200_000;
    for (let i = 0n; i < BigInt(N); i++) sum += drawUnit(seed, i);
    expect(sum / N).toBeCloseTo(0.5, 2);
  });
});

describe('drawInt', () => {
  const seed = fixedSeed();

  it('stays inside [1, n]', () => {
    for (const n of [1, 2, 6, 20, 22, 67, 112]) {
      for (let i = 0n; i < 2_000n; i++) {
        const { value } = drawInt(seed, i, n);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(n);
      }
    }
  });

  it('is unbiased across the die faces', () => {
    // Modulo would bias the low faces whenever n does not divide 2^64. Small for
    // a d20 and compounding across every attack in a battle.
    const n = 22; // the Luck-15 die
    const counts = new Array<number>(n).fill(0);
    const N = 220_000;

    let index = 0n;
    for (let i = 0; i < N; i++) {
      const { value, consumed } = drawInt(seed, index, n);
      counts[value - 1]! += 1;
      index += consumed;
    }

    const expectedPerFace = N / n;
    for (const [face, count] of counts.entries()) {
      expect(count / expectedPerFace, `face ${face + 1}`).toBeCloseTo(1, 1);
    }
  });

  it('reports how many indices it consumed', () => {
    // Rejection sampling makes the cost variable, which is exactly why
    // `drawsConsumed` is recorded on every action rather than assumed.
    const { consumed } = drawInt(seed, 0n, 22);
    expect(consumed).toBeGreaterThanOrEqual(1n);
  });

  it('is deterministic at a given index', () => {
    for (const n of [6, 20, 112]) {
      const first = drawInt(seed, 42n, n);
      for (let i = 0; i < 50; i++) expect(drawInt(seed, 42n, n)).toEqual(first);
    }
  });

  it('rejects a non-positive or fractional n', () => {
    expect(() => drawInt(seed, 0n, 0)).toThrow();
    expect(() => drawInt(seed, 0n, -3)).toThrow();
    expect(() => drawInt(seed, 0n, 2.5)).toThrow();
  });

  it('always returns 1 for n = 1 without spinning', () => {
    expect(drawInt(seed, 0n, 1)).toEqual({ value: 1, consumed: 1n });
  });
});

describe('createSeed', () => {
  it('takes no parameters — there is nothing a client value could be passed as', () => {
    expect(createSeed.length).toBe(0);
  });

  it('produces uncorrelated seeds from identical circumstances', () => {
    // T023 — seed shopping. Abandoning a battle and restarting must gain
    // nothing, so seeds generated back to back under identical conditions must
    // show no relationship.
    const first = Array.from({ length: 200 }, () => draw(createSeed(), 0n));
    expect(new Set(first).size).toBe(first.length);

    const lowBits = first.map((v) => Number(v & 1n));
    const ones = lowBits.filter((b) => b === 1).length;
    expect(ones).toBeGreaterThan(60);
    expect(ones).toBeLessThan(140);
  });
});
