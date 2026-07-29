/**
 * **The same seed and configuration reproduce the same choices exactly** (SC-009).
 *
 * A defense is replayed on every request — in-progress battle state is never
 * stored, so the engine re-derives its own past turns from the action log before
 * it plays the next one. If a single choice came from a live entropy source, the
 * battle would change underneath the player between one action and the next, and
 * neither side would have any way to notice.
 *
 * The dangerous case is **tiebreak 5**, the one place a defense draws at all.
 * The four rules above it are pure and would look deterministic in any test; a
 * `Math.random()` at the bottom would sit there passing every check that never
 * forced a tie.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decideAmong } from '../../ai/targeting.js';
import { decideAction } from '../../ai/decide.js';
import { atTurn, board, bytes, config, fixedSeed, powerOfTier } from './fixtures.js';

const AI_DIR = join(import.meta.dirname, '../../ai');

/** Six identical champions at identical HP in identical rows: nothing above
 *  tiebreak 5 can separate them, so the draw is forced to decide. */
const tied = () => atTurn(board(['h19'], ['h01']), 5);

describe('a forced tiebreak', () => {
  it('really is forced — every rule above it leaves more than one candidate', () => {
    const state = tied();
    const seed = fixedSeed();
    const candidates = state.heroes.filter((h) => h.side === 'attacker').map((h) => h.instanceId);

    // Two rows are reachable and every champion in them is identical, so the
    // set that reaches the draw is larger than one.
    const noTiebreak = decideAmong(state, seed, 0n, 'd0', powerOfTier('h01', 0), candidates, []);
    expect(noTiebreak.drawsConsumed).toBeGreaterThan(0n);
  });

  it('reproduces the identical choice from the same seed and index, 200 times', () => {
    const state = tied();
    const first = decideAction(state, fixedSeed(), 7n, 'd0', config());

    for (let i = 0; i < 200; i++) {
      expect(bytes(decideAction(state, fixedSeed(), 7n, 'd0', config()))).toBe(bytes(first));
    }
  });

  it('chooses differently from a different seed — the draw is real, not a constant', () => {
    const state = tied();
    const seen = new Set<string>();

    for (let n = 1n; n <= 40n; n++) {
      seen.add(decideAction(state, fixedSeed(n * 0x9e3779b97f4a7c15n), 0n, 'd0', config()).targetInstanceId!);
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it('chooses differently at a different draw index, which is what replay advances', () => {
    const state = tied();
    const seed = fixedSeed();
    const seen = new Set<string>();

    for (let i = 0n; i < 40n; i++) {
      seen.add(decideAction(state, seed, i, 'd0', config()).targetInstanceId!);
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it('reports drawsConsumed, and reports 0 when the rules already decided', () => {
    const state = tied();
    const seed = fixedSeed();
    const candidates = state.heroes.filter((h) => h.side === 'attacker').map((h) => h.instanceId);

    // Handed exactly one candidate, there is nothing to decide and nothing to
    // draw. Consuming an index anyway would desynchronise every later action.
    const single = decideAmong(state, seed, 0n, 'd0', powerOfTier('h01', 0), [candidates[0]!], []);
    expect(single.drawsConsumed).toBe(0n);
    expect(single.targetInstanceId).toBe(candidates[0]);
  });

  it('does not depend on the order the candidate array was built in', () => {
    const state = tied();
    const seed = fixedSeed();
    const power = powerOfTier('h01', 0);
    const candidates = state.heroes.filter((h) => h.side === 'attacker').map((h) => h.instanceId);

    const forward = decideAmong(state, seed, 0n, 'd0', power, candidates, []);
    const reversed = decideAmong(state, seed, 0n, 'd0', power, [...candidates].reverse(), []);

    // Feature 002 documents `candidates` as being "in no meaningful order", so
    // a decision that read that order would be a replay hazard that only shows
    // up when an unrelated filter changes what it emits first.
    expect(bytes(forward)).toBe(bytes(reversed));
  });
});

describe('the AI never reaches for entropy of its own', () => {
  const sources = readdirSync(AI_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(AI_DIR, f), 'utf8') }));

  it('reads every file in ai/', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it.each([
    ['Math.random', /Math\s*\.\s*random/],
    ['Date.now', /Date\s*\.\s*now/],
    ['new Date', /new\s+Date\b/],
    ['crypto', /\bcrypto\b/],
    ['performance', /\bperformance\s*\./],
  ])('contains no %s', (_name, pattern) => {
    for (const { file, text } of sources) {
      const code = text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
      expect(pattern.test(code), `${file}`).toBe(false);
    }
  });

  it('takes its randomness from the resolver and nowhere else', () => {
    const targeting = readFileSync(join(AI_DIR, 'targeting.ts'), 'utf8');
    expect(targeting).toContain("from '../resolver/rng.js'");
  });
});
