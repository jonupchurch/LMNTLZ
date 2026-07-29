/**
 * SplitMix64, **positionally addressable**.
 *
 * `draw(seed, index)` is `O(1)` for any index, which is what makes re-derivation
 * from the action log a *lookup* rather than a re-advance. A generator that had
 * to be stepped would make replaying a 300-turn battle quadratic in the number
 * of requests, and every request replays.
 *
 * **Implemented over `BigInt`, never over `Number`.** A 64-bit multiply in
 * doubles silently loses the low bits past 2^53. The result is still
 * deterministic and still plausible — it is simply a *different* sequence, and
 * potentially a different one on a different JavaScript engine. That is the
 * worst possible failure: it passes locally and diverges in production.
 */

import { seedValue, type Seed } from './seed.js';

const MASK64 = (1n << 64n) - 1n;

/** The SplitMix64 constants. Named in `engineVersion`; changing one is an engine change. */
const GAMMA = 0x9e3779b97f4a7c15n;
const MIX1 = 0xbf58476d1ce4e5b9n;
const MIX2 = 0x94d049bb133111ebn;

function mix(z0: bigint): bigint {
  let z = z0 & MASK64;
  z = ((z ^ (z >> 30n)) * MIX1) & MASK64;
  z = ((z ^ (z >> 27n)) * MIX2) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

/**
 * The `index`-th 64-bit output for this seed.
 *
 * Addressing is `seed + (index + 1) × GAMMA`, so index 0 is the first output of
 * a freshly-seeded SplitMix64 stream and any later index is one multiply away.
 */
export function draw(seed: Seed, index: bigint): bigint {
  if (index < 0n) throw new Error(`draw index must be non-negative, got ${index}`);
  return mix((seedValue(seed) + (index + 1n) * GAMMA) & MASK64);
}

/** The **only** float the generator produces. Uniform in `[0, 1)`. */
export function drawUnit(seed: Seed, index: bigint): number {
  // 53 bits is exactly what a double can hold without loss, so this conversion
  // is exact rather than nearly exact.
  return Number(draw(seed, index) >> 11n) / 2 ** 53;
}

/**
 * Uniform integer in `[1, n]`, **rejection sampled**.
 *
 * Modulo would bias the low values whenever `n` does not divide 2^64 — small for
 * a d20, but the accuracy contest runs on dice up to 112 and it compounds across
 * every attack in a battle. Rejection is unbiased and costs a variable number of
 * indices, which is exactly why `drawsConsumed` is **recorded rather than
 * assumed**.
 */
export function drawInt(
  seed: Seed,
  index: bigint,
  n: number,
): { value: number; consumed: bigint } {
  if (!Number.isInteger(n) || n < 1) throw new Error(`drawInt needs n >= 1, got ${n}`);

  const range = BigInt(n);
  // The largest multiple of `range` that fits in 64 bits. Anything at or above
  // it would fold unevenly, so it is redrawn.
  const limit = ((1n << 64n) / range) * range;

  let consumed = 0n;
  for (;;) {
    const value = draw(seed, index + consumed);
    consumed += 1n;
    if (value < limit) {
      return { value: Number(value % range) + 1, consumed };
    }
    // Practically unreachable: the rejection band is under 2^-57 of the space
    // for any n we use. The guard is here so an absurd n cannot spin forever.
    if (consumed > 64n) {
      return { value: Number(value % range) + 1, consumed };
    }
  }
}

/** True with probability `p`, consuming exactly one index. */
export function drawBelow(seed: Seed, index: bigint, p: number): boolean {
  return drawUnit(seed, index) < p;
}
