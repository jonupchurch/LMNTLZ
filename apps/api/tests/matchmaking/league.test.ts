/**
 * The five bands, their shared boundaries, and both clamps (009 T008, T009).
 *
 * These are arithmetic with no database in them, and they are here rather than
 * folded into the population suite because **a boundary is not a population
 * question.** T004's 20,000 accounts settle league *shares*; nothing about a crowd
 * tells you which league owns the score 2,500.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLETE_RUNE_SCORE,
  FULL_KIT_SCORE,
  LEAGUE_BANDS,
  LEAGUE_NAMES,
  STARTER_GRANT_SCORE,
  bandOf,
  leagueOf,
  positionInLeague,
} from '../../src/matchmaking/league.js';

describe('the anchors are derived, not typed in', () => {
  it('prices a complete rune at 125 — 2.5 × (20 + 10 + 5 + 15)', () => {
    expect(COMPLETE_RUNE_SCORE).toBe(2.5 * (20 + 10 + 5 + 15));
  });

  it('puts the starter grant exactly on the Bronze floor', () => {
    /**
     * **Not a coincidence to preserve by hand.** `06-progression.md` settled new
     * accounts at 1,500 *because* that is where Bronze starts, so a newcomer is
     * inside a league on their first battle rather than below every band. If the
     * grant or the floor is ever changed alone, this fails and says why.
     */
    expect(STARTER_GRANT_SCORE).toBe(1500);
    expect(bandOf('bronze').floor).toBe(STARTER_GRANT_SCORE);
  });

  it('puts a full kit exactly on the Diamond ceiling', () => {
    expect(FULL_KIT_SCORE).toBe(10_125);
    expect(bandOf('diamond').ceiling).toBe(FULL_KIT_SCORE);
  });
});

describe('the bands tile the range with no gap and no overlap', () => {
  it('runs in ascending order with each floor meeting the previous ceiling', () => {
    /**
     * A gap would leave scores in no league; an overlap would let `leagueOf`'s
     * first match differ from what a reader of the table expects. Either is
     * invisible until a specific score lands in the seam.
     */
    for (let i = 1; i < LEAGUE_BANDS.length; i++) {
      expect(LEAGUE_BANDS[i]!.floor, `${LEAGUE_BANDS[i]!.league} floor`).toBe(
        LEAGUE_BANDS[i - 1]!.ceiling,
      );
    }
  });

  it('names all five, in order', () => {
    expect(LEAGUE_BANDS.map((b) => b.league)).toEqual([...LEAGUE_NAMES]);
  });
});

describe('leagueOf', () => {
  it('gives a shared boundary to the league above, not below', () => {
    // 2,500 is Silver's first score, not Bronze's last. One number, one answer —
    // the alternative is a score that is simultaneously at a ceiling (bleeding up)
    // and at a floor (bleeding down), which is opposite behaviour from one input.
    expect(leagueOf(2499)).toBe('bronze');
    expect(leagueOf(2500)).toBe('silver');
    expect(leagueOf(3999)).toBe('silver');
    expect(leagueOf(4000)).toBe('gold');
    expect(leagueOf(6199)).toBe('gold');
    expect(leagueOf(6200)).toBe('platinum');
    expect(leagueOf(8699)).toBe('platinum');
    expect(leagueOf(8700)).toBe('diamond');
  });

  it('puts a new account in Bronze and a full kit in Diamond', () => {
    expect(leagueOf(STARTER_GRANT_SCORE)).toBe('bronze');
    expect(leagueOf(FULL_KIT_SCORE)).toBe('diamond');
  });

  it('clamps both ends instead of throwing', () => {
    /**
     * Both are unreachable today — every account is granted 12 complete runes, and
     * 81 runes is arithmetically the most there are. **"Unreachable by
     * construction" is the assumption that breaks when 010 changes the grant**, and
     * a throw here would mean a player who cannot be matched at all rather than one
     * matched at the edge. `06-progression.md` also names a fourth rune slot as
     * future work, which would lift every score past this ceiling.
     */
    expect(leagueOf(0)).toBe('bronze');
    expect(leagueOf(1)).toBe('bronze');
    expect(leagueOf(FULL_KIT_SCORE + 1)).toBe('diamond');
    expect(leagueOf(999_999)).toBe('diamond');
  });
});

describe('positionInLeague', () => {
  it('reads 0 at a floor and approaches 1 at a ceiling', () => {
    expect(positionInLeague(STARTER_GRANT_SCORE)).toBe(0);
    expect(positionInLeague(2500)).toBe(0); // Silver's floor, not Bronze's ceiling
    expect(positionInLeague(FULL_KIT_SCORE)).toBe(1);
  });

  it('measures against the league own range, never the population (FR-007)', () => {
    /**
     * Bronze spans 1,500–2,500, so its midpoint is 2,000 — regardless of how many
     * players sit anywhere. **A percentile within the league would move a
     * standing-still player's bleed mix because other people geared up**, which is
     * exactly what fixed thresholds removed at the boundaries; it must not come
     * back at the edges.
     */
    expect(positionInLeague(2000)).toBeCloseTo(0.5, 10);

    // Gold spans 4,000–6,200 — a 2,200-wide band, deliberately not the same width
    // as Bronze's 1,000. A position computed against a global range would agree
    // with this for Bronze and disagree here.
    expect(positionInLeague(5100)).toBeCloseTo(0.5, 10);
  });

  it('never leaves 0..1, so a bleed fraction cannot exceed everybody', () => {
    // `bleed.ts` reads this as "what share of opponents come from next door".
    // Above 1 would mean more than all of them.
    for (const score of [0, 1, 1499, FULL_KIT_SCORE + 5000]) {
      const p = positionInLeague(score);
      expect(p, `score ${score}`).toBeGreaterThanOrEqual(0);
      expect(p, `score ${score}`).toBeLessThanOrEqual(1);
    }
  });

  it('rises monotonically across the whole range', () => {
    /**
     * Swept rather than spot-checked because US3 plots this exact curve and
     * requires it **continuous at both edges**. A sign error inside one band would
     * pass every assertion above.
     */
    for (const { league, floor, ceiling } of LEAGUE_BANDS) {
      let previous = -1;
      for (let s = floor; s < ceiling; s += 25) {
        const p = positionInLeague(s);
        expect(p, `${league} at ${s}`).toBeGreaterThan(previous);
        previous = p;
      }
    }
  });
});
