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

  /**
   * **Tiers 0–3 never one-shot, and that is still a hard bound.**
   *
   * This test used to say *no* power may take a full bar in one uncritted hit,
   * on the reasoning that a tier-5 doing so "would mean the packet or the
   * mitigation curve moved". Neither moved. The **bar** moved: the pacing pass
   * took `HP_PER_TOUGHNESS` from 50 to 8, and absolute damage is unchanged.
   *
   * So the bound is kept where it is still a statement about the pipeline —
   * the cheap, frequently-fired powers — and the tier-4/5 tail is measured
   * separately in the test below rather than asserted away.
   */
  it('never deals more than a full health bar with a tier 0–3 power', () => {
    for (const { attacker, state } of pairings) {
      const defenderState = state.heroes.find((h) => h.instanceId === 'd')!;
      const bar = maxHp(defenderState);

      for (const power of attacker.powers) {
        if (power.friendly || power.multiplier === null) continue;
        if (power.tier > 3) continue;
        const { final } = damagePreview(state, 'a', power.id, 'd');
        expect(final, `${attacker.name} "${power.name}" (tier ${power.tier})`).toBeLessThan(bar);
      }
    }
  });

  /**
   * **How much one-shotting the pacing dial actually bought — recorded, not
   * endorsed.**
   *
   * At `HP_PER_TOUGHNESS = 8` a big cooldown power can delete a full-health
   * hero, which is a design consequence somebody chose and not a bug. The
   * numbers are pinned so the *next* change to the dial or to a multiplier has
   * to look at them: a rise means one-shotting spread, and a fall means it was
   * tuned out and this test should say so.
   *
   * Only tiers 4 and 5 may do it at all — that part is an invariant, and it is
   * what keeps the floor of the game legible.
   */
  it('confines one-shots to tiers 4 and 5, at a recorded rate', () => {
    let total = 0;
    let oneShots = 0;
    let worst = 0;
    const tiers = new Set<number>();

    for (const { attacker, state } of pairings) {
      const defenderState = state.heroes.find((h) => h.instanceId === 'd')!;
      const bar = maxHp(defenderState);

      for (const power of attacker.powers) {
        if (power.friendly || power.multiplier === null) continue;
        total++;
        const { final } = damagePreview(state, 'a', power.id, 'd');
        const share = final / bar;
        worst = Math.max(worst, share);
        if (final >= bar) {
          oneShots++;
          tiers.add(power.tier);
        }
      }
    }

    expect(total).toBeGreaterThan(4_000);
    expect([...tiers].sort()).toEqual([4, 5]);

    // ~5.4% of every (power, defender) combination in the game.
    expect(oneShots / total).toBeGreaterThan(0.04);
    expect(oneShots / total).toBeLessThan(0.07);

    // Nothing reaches twice a bar, so overkill stays bounded.
    expect(worst).toBeLessThan(2);
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
