import { describe, expect, it } from 'vitest';
import { getAllHeroes, powerEffectiveness } from '@lmntlz/content';
import {
  MAX_HIT_PROBABILITY,
  MIN_HIT_PROBABILITY,
  damagePreview,
  hitProbability,
  maxHp,
} from '../../rules/index.js';
import { allPairings } from './fixtures.js';

/**
 * T050 — property tests over all **729** hero-versus-hero pairings, no mocks.
 *
 * The whole point of the rules half being pure is that this is *cheap*. 27
 * heroes and 9 types is a world small enough to enumerate completely, so any
 * claim stated over "a hero" gets checked against every hero rather than three
 * representative ones.
 */
describe('every one of the 729 pairings', () => {
  const pairings = allPairings();

  it('is 27 x 27', () => {
    expect(pairings).toHaveLength(729);
    expect(getAllHeroes()).toHaveLength(27);
  });

  it('resolves a hit probability inside the clamp', () => {
    for (const { attacker, defender, state } of pairings) {
      const p = hitProbability(state, 'a', 'd');
      expect(p, `${attacker.name} -> ${defender.name}`).toBeGreaterThanOrEqual(
        MIN_HIT_PROBABILITY,
      );
      expect(p).toBeLessThanOrEqual(MAX_HIT_PROBABILITY);
    }
  });

  it('prices every hostile power without ever returning an outcome', () => {
    let priced = 0;

    for (const { attacker, defender, state } of pairings) {
      for (const power of attacker.powers) {
        if (power.friendly) continue;

        const preview = damagePreview(state, 'a', power.id, 'd');

        expect(Number.isFinite(preview.final)).toBe(true);
        expect(preview.final).toBeGreaterThanOrEqual(0);
        expect(preview.typeMultiplier).toBe(powerEffectiveness(power, defender));
        expect(preview).not.toHaveProperty('hit');
        priced++;
      }
    }

    // 27 attackers x 27 defenders x 6 powers, less the three friendly heals
    // (one each on the three Buffers) and Whisper from the High Reach.
    expect(priced).toBeGreaterThan(4_000);
  });

  it('never deals more than a full health bar in one uncritted hit', () => {
    // Not a rule — a sanity bound. A single tier-5 that one-shots a full-HP
    // defender would mean the packet or the mitigation curve moved.
    for (const { attacker, state } of pairings) {
      const defenderState = state.heroes.find((h) => h.instanceId === 'd')!;
      const bar = maxHp(defenderState);

      for (const power of attacker.powers) {
        if (power.friendly || power.multiplier === null) continue;
        const { final } = damagePreview(state, 'a', power.id, 'd');
        expect(final, `${attacker.name} "${power.name}"`).toBeLessThan(bar);
      }
    }
  });

  it('never returns a negative or fractional final', () => {
    for (const { attacker, state } of pairings) {
      for (const power of attacker.powers) {
        if (power.friendly) continue;
        const { final, critFinal } = damagePreview(state, 'a', power.id, 'd');
        expect(Number.isInteger(final)).toBe(true);
        expect(Number.isInteger(critFinal)).toBe(true);
        expect(final).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('always makes a crit worth strictly more than a normal hit', () => {
    for (const { attacker, state } of pairings) {
      for (const power of attacker.powers) {
        if (power.friendly || power.multiplier === null) continue;
        const { final, critFinal } = damagePreview(state, 'a', power.id, 'd');
        if (final > 0) expect(critFinal).toBeGreaterThan(final);
      }
    }
  });

  it('answers every power with exactly one mitigation stat', () => {
    for (const { attacker, state } of pairings) {
      for (const power of attacker.powers) {
        if (power.friendly) continue;
        expect(['armor', 'magicResist']).toContain(
          damagePreview(state, 'a', power.id, 'd').resistedBy,
        );
      }
    }
  });
});
