/**
 * The daily curve and the published rate table (010 T008, T037–T039).
 *
 * `payoutFor` is pure, so the table in `06-progression.md` can be asserted against
 * it directly rather than through a database. **That is the point of the split** —
 * the rates are the part a player can check against the wiki, and a test that has
 * to settle a battle to read one is a test nobody updates when the table moves.
 *
 * The boundaries get their own cases. An off-by-one at 5/6 or 20/21 is a **silent,
 * permanent** overpay or underpay: nothing errors, every battle looks normal, and
 * the only evidence is a number that disagrees with the published table by 10.
 */

import { describe, expect, it } from 'vitest';
import { dailyMultiplier, payoutFor, type IncomeEvent } from '../../src/progression/income.js';
import { DAILY_TIERS } from '../../src/progression/config.js';

const attack = (zone: IncomeEvent['zone']): IncomeEvent => ({ kind: 'attack-victory', zone });
const hold = (zone: IncomeEvent['zone']): IncomeEvent => ({ kind: 'defense-hold', zone });

describe('the published rate table', () => {
  it('pays 20 through a chosen door and 40 through an ambush', () => {
    expect(payoutFor(attack('visible'), 6)).toBe(20);
    expect(payoutFor(attack('hidden'), 6)).toBe(40);
  });

  it('pays 10 for a Visible hold and 20 for a Hidden one', () => {
    expect(payoutFor(hold('visible'), 6)).toBe(10);
    expect(payoutFor(hold('hidden'), 6)).toBe(20);
  });

  it('pays nothing for a loss in either zone', () => {
    expect(payoutFor({ kind: 'loss', zone: 'visible' }, 1)).toBe(0);
    expect(payoutFor({ kind: 'loss', zone: 'hidden' }, 1)).toBe(0);
  });

  it('makes a hold exactly half an attack victory, which is load-bearing', () => {
    // At parity, passive income reaches 47% of a typical player's shards. At half
    // it is 30%. The ratio is the decision, so it is asserted as a ratio.
    expect(payoutFor(hold('visible'), 6) * 2).toBe(payoutFor(attack('visible'), 6));
    expect(payoutFor(hold('hidden'), 6) * 2).toBe(payoutFor(attack('hidden'), 6));
  });
});

describe('the daily curve', () => {
  it('walks the whole published table', () => {
    const table = [
      { victory: 1, chosen: 30, ambush: 60 },
      { victory: 5, chosen: 30, ambush: 60 },
      { victory: 6, chosen: 20, ambush: 40 },
      { victory: 20, chosen: 20, ambush: 40 },
      { victory: 21, chosen: 10, ambush: 20 },
      { victory: 200, chosen: 10, ambush: 20 },
    ];

    for (const row of table) {
      expect(payoutFor(attack('visible'), row.victory), `victory ${row.victory}, chosen`).toBe(
        row.chosen,
      );
      expect(payoutFor(attack('hidden'), row.victory), `victory ${row.victory}, ambush`).toBe(
        row.ambush,
      );
    }
  });

  it('turns over at exactly 5/6', () => {
    expect(dailyMultiplier(5)).toBe(1.5);
    expect(dailyMultiplier(6)).toBe(1.0);
  });

  it('turns over at exactly 20/21', () => {
    expect(dailyMultiplier(20)).toBe(1.0);
    expect(dailyMultiplier(21)).toBe(0.5);
  });

  it('never blocks play and never pays zero, at any victory count', () => {
    for (const n of [1, 5, 6, 20, 21, 100, 1_000, 10_000]) {
      expect(dailyMultiplier(n), `multiplier at victory ${n}`).toBeGreaterThan(0);
      expect(payoutFor(attack('visible'), n), `payout at victory ${n}`).toBeGreaterThan(0);
    }
  });

  it('never tiers a hold, at any victory count', () => {
    // A hold is driven by how often OTHER people attack you. There is nothing
    // there for the defender to pace, so their own attacking must not devalue it.
    for (const n of [1, 5, 6, 20, 21, 500]) {
      expect(payoutFor(hold('visible'), n), `Visible hold at victory ${n}`).toBe(10);
      expect(payoutFor(hold('hidden'), n), `Hidden hold at victory ${n}`).toBe(20);
    }
  });

  it('descends — every tier pays less than the one before it', () => {
    const multipliers = DAILY_TIERS.map((t) => t.multiplier);
    for (let i = 1; i < multipliers.length; i += 1) {
      expect(multipliers[i]!, `tier ${i} vs ${i - 1}`).toBeLessThan(multipliers[i - 1]!);
    }
  });
});

describe('the starter multiplier', () => {
  it('lifts attack income by 1.5x and leaves holds alone', () => {
    expect(payoutFor(attack('visible'), 6, 1.5)).toBe(30);
    expect(payoutFor(hold('visible'), 6, 1.5)).toBe(10);
  });

  it('compounds with the daily curve rather than replacing it', () => {
    // 20 x 1.5 (first five) x 1.5 (starter) = 45. A flat 1.5x replacing the curve
    // was considered and rejected — it pays a heavy player more than a typical one.
    expect(payoutFor(attack('visible'), 1, 1.5)).toBe(45);
    expect(payoutFor(attack('visible'), 21, 1.5)).toBe(15);
  });

  it('floors once at the end rather than at each step', () => {
    // 10 x 0.5 x 1.5 = 7.5 exactly. Rounding per step would make the answer depend
    // on the order of the factors, which is a defect nobody can diagnose from a
    // balance that is one shard short.
    expect(payoutFor({ kind: 'attack-victory', zone: 'visible' }, 21, 1.5)).toBe(15);
    expect(payoutFor({ kind: 'attack-victory', zone: 'hidden' }, 21, 1.5)).toBe(30);
  });
});
