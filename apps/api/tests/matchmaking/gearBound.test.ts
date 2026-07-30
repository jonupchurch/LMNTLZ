/**
 * **Nobody is ever offered an opponent above 1.67× their own gear** (009 T011 · SC-001).
 *
 * `spec.md` calls this *"the bound that makes the whole thing defensible"*, and it
 * is the promise the entire league system exists to keep. So it is swept, not
 * sampled: every score from the Bronze floor to the Diamond ceiling, one point at a
 * time, against the strongest opponent its band can contain.
 *
 * ### Why this is arithmetic rather than a database test
 *
 * The bound is a property of **how the pool is defined**, not of how it is
 * fetched. `candidates()` filters `floor ≤ score < ceiling`, so the worst pairing
 * available to any player is their band's ceiling against their own score — and that
 * is decidable in closed form for all 8,626 scores in the game, which no fixture
 * population could cover. A database test would exercise the query against whatever
 * accounts happened to exist; this exercises the guarantee.
 *
 * It also survives 010. Every gear score is the 1,500 starter grant today, so a
 * query-based sweep would be testing one point pretending to be a range.
 *
 * **`candidates.test.ts` covers the query half** — that the SQL really does restrict
 * to the band, and that rating never removes anybody.
 */

import { describe, expect, it } from 'vitest';
import {
  FULL_KIT_SCORE,
  LEAGUE_BANDS,
  STARTER_GRANT_SCORE,
  bandOf,
  leagueOf,
} from '../../src/matchmaking/league.js';
import { GEAR_BOUND, WIDENED_GEAR_BOUND } from '../../src/matchmaking/config.js';

/** The strongest opponent `candidates()` can return for a player at `score`. */
const strongestInBand = (score: number): number => {
  const { ceiling } = bandOf(leagueOf(score));
  // The band is half-open, so the ceiling itself belongs to the league above —
  // except Diamond's, which is inclusive because a full kit is exactly 10,125.
  return ceiling === FULL_KIT_SCORE ? ceiling : ceiling - 1;
};

describe('the 1.67x bound holds at every score in the game', () => {
  it('sweeps the whole range one point at a time', () => {
    let worst = { score: 0, opponent: 0, ratio: 0 };

    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      const opponent = strongestInBand(score);
      const ratio = opponent / score;

      expect(
        ratio,
        `a player at ${score} could be offered ${opponent} — ${ratio.toFixed(4)}x`,
      ).toBeLessThanOrEqual(GEAR_BOUND);

      if (ratio > worst.ratio) worst = { score, opponent, ratio };
    }

    /**
     * **And the worst case is where the design says it is.** A bound that held only
     * because the sweep never reached the tight spot would pass while being wrong,
     * so this pins *which* pairing is the extreme: a player standing exactly on the
     * Bronze floor, offered the strongest Bronze account there can be.
     */
    expect(worst.score).toBe(STARTER_GRANT_SCORE);
    expect(worst.opponent).toBe(2499);
    expect(worst.ratio).toBeCloseTo(2499 / 1500, 10);
    expect(worst.ratio).toBeLessThan(GEAR_BOUND);
  });

  it('has zero exceptions, which is what SC-001 asks for', () => {
    // Stated as a count rather than as an absence of failures, so the test reports
    // how much it actually checked.
    const scores = FULL_KIT_SCORE - STARTER_GRANT_SCORE + 1;
    const breaches = [];

    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      if (strongestInBand(score) / score > GEAR_BOUND) breaches.push(score);
    }

    expect(scores).toBe(8626);
    expect(breaches).toEqual([]);
  });

  it('gets kinder as players climb, band by band', () => {
    /**
     * The shape behind the single number. Bronze is the only league where the bound
     * is even close to binding, which is why it is the one that sets it — and why
     * nobody would ever argue about gear fairness in Diamond, where every account is
     * within 1.16× of every other.
     */
    const worstPerBand = LEAGUE_BANDS.map(({ league, floor }) => ({
      league,
      ratio: Number((strongestInBand(floor) / floor).toFixed(3)),
    }));

    expect(worstPerBand).toEqual([
      { league: 'bronze', ratio: 1.666 },
      { league: 'silver', ratio: 1.6 },
      { league: 'gold', ratio: 1.55 },
      { league: 'platinum', ratio: 1.403 },
      { league: 'diamond', ratio: 1.164 },
    ]);

    // Monotonically kinder, with no band bucking the trend.
    for (let i = 1; i < worstPerBand.length; i++) {
      expect(worstPerBand[i]!.ratio).toBeLessThan(worstPerBand[i - 1]!.ratio);
    }
  });
});

describe('the bound a widened match makes instead', () => {
  it('is 2.67x, and it is a different promise rather than a broken one', () => {
    /**
     * **The domain of the claim, not just the claim.** `contracts/matchmaking-api.md`
     * says outright that *"the 1.67× gear guarantee does not hold on a widened
     * match"* — so a test asserting 1.67× everywhere would be asserting something
     * the design does not promise, and would have to be weakened later by somebody
     * who did not know why it was there.
     *
     * Widening reaches into the adjacent band, so the worst case is a player at a
     * league floor against the ceiling of the league above. Bronze floor 1,500
     * against Silver's 3,999 is 2.666×, which is where 2.67 comes from — the same
     * derivation as `GEAR_BOUND`, one band wider.
     */
    const bronzeFloor = STARTER_GRANT_SCORE;
    const silverCeiling = bandOf('silver').ceiling - 1;

    expect(silverCeiling / bronzeFloor).toBeCloseTo(2.666, 3);
    expect(WIDENED_GEAR_BOUND).toBeGreaterThanOrEqual(silverCeiling / bronzeFloor);
  });

  it('is why widening has to be disclosed rather than silent', () => {
    // A player told nothing would read a 2.6x fight as the 1.67x promise being a
    // lie. `candidates()` therefore returns `widened` on every response, not only
    // when it is true — an optional field is a field clients forget to read.
    expect(WIDENED_GEAR_BOUND / GEAR_BOUND).toBeGreaterThan(1.5);
  });
});
