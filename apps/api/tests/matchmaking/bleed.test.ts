/**
 * **The difficulty curve is continuous at every boundary** (009 T036, T037 · SC-003).
 *
 * `quickstart.md` calls this the golden path and says *"the crossing is the
 * assertion"*. So the centre of this file is not the ramp's shape — it is that
 * expected opponent strength has **no step change** anywhere in the game's 8,626
 * scores, boundaries included.
 *
 * ### The model is the design's own, and it is what makes this checkable
 *
 * `09-matchmaking.md` supplies a player who *"beats league-mates below them ~65% of the
 * time and those above them ~40%"*. That is enough to turn a mix into a number:
 *
 * ```
 * ownRate(pos) = 0.40 + 0.25 × pos      // weakest in your band → 0.40; strongest → 0.65
 * winRate      = own × ownRate(pos) + down × 0.65 + up × 0.40
 * ```
 *
 * `ownRate` is the interpolation the document implies rather than states: at the top of
 * a band every league-mate is below you, at the bottom every one is above you. It is
 * the only reading under which the document's own table comes out right — and it does,
 * to five decimal places, which is the evidence that it is the intended one.
 *
 * ### The rejected designs are measured, not described
 *
 * The document publishes a *parking advantage* for four regimes — 25.0, 22.5, 12.5 and
 * 0 points. All four fall out of the model above, so all four are asserted. That turns
 * "both edges is better" from a claim into arithmetic, and it is what proves the tests
 * below are not vacuous: a sawtooth is 12.5 points tall, and this file can show it.
 */

import { describe, expect, it } from 'vitest';
import {
  FULL_KIT_SCORE,
  LEAGUE_BANDS,
  LEAGUE_NAMES,
  STARTER_GRANT_SCORE,
  bandOf,
  leagueOf,
  positionInLeague,
  type League,
} from '../../src/matchmaking/league.js';
import { BLEED_EDGE_MIX, BLEED_RAMP, GEAR_BOUND } from '../../src/matchmaking/config.js';
import { bleed, leagueAbove, leagueBelow, ramps } from '../../src/matchmaking/bleed.js';

/** The design's own two figures. */
const BEATS_BELOW = 0.65;
const BEATS_ABOVE = 0.4;

const ownRate = (pos: number) => BEATS_ABOVE + (BEATS_BELOW - BEATS_ABOVE) * pos;

/** Expected win rate at a score, under the shipped both-edges bleed. */
function winRate(score: number): number {
  const mix = bleed(score);
  return mix.own * ownRate(positionInLeague(score)) + mix.down * BEATS_BELOW + mix.up * BEATS_ABOVE;
}

describe('the published mix table', () => {
  /** `pos` for a score, and the score for a `pos`, inside a named band. */
  const scoreAt = (league: League, pos: number) => {
    const { floor, ceiling } = bandOf(league);
    return floor + pos * (ceiling - floor);
  };

  it('is 50% from below at the floor and 50% from above at the ceiling', () => {
    // Silver, so both neighbours exist and neither end is clipped.
    expect(bleed(scoreAt('silver', 0)).down).toBeCloseTo(0.5, 10);
    expect(ramps(1).up).toBeCloseTo(0.5, 10);
  });

  it('is 25% at the 5% and 95% marks', () => {
    expect(bleed(scoreAt('silver', 0.05)).down).toBeCloseTo(0.25, 10);
    expect(bleed(scoreAt('silver', 0.95)).up).toBeCloseTo(0.25, 10);
  });

  it('is pure league across the whole middle 80%', () => {
    /**
     * Swept rather than spot-checked at 0.1 and 0.9, because the interesting failure is
     * a ramp that starts slightly early — which two endpoints would miss.
     */
    // Stepped as integers over 100 rather than `pos += 0.01`: accumulating a float
    // overshoots 0.9 by 1e-16, and `max(0, …)` then returns 3e-15 instead of 0. The
    // ramp was correct and the loop was not.
    for (let hundredths = 10; hundredths <= 90; hundredths++) {
      const pos = hundredths / 100;
      const mix = bleed(scoreAt('silver', pos));

      expect(mix.own, `pos ${pos.toFixed(2)} is not pure league`).toBeCloseTo(1, 10);
      expect(mix.up, `pos ${pos.toFixed(2)} bleeds up`).toBe(0);
      expect(mix.down, `pos ${pos.toFixed(2)} bleeds down`).toBe(0);
    }
  });

  it('never bleeds both ways at once, at any score in the game', () => {
    /**
     * True only because `BLEED_RAMP` is 0.1 — a position cannot be in both the bottom
     * and top tenth of a band. It stops being true above 0.5, so it is asserted here
     * rather than assumed in `bleed.ts`, and it fails the moment somebody tunes it.
     */
    expect(BLEED_RAMP).toBeLessThan(0.5);

    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      const mix = bleed(score);
      expect(mix.up > 0 && mix.down > 0, `score ${score} bleeds both ways`).toBe(false);
      expect(mix.own + mix.up + mix.down, `score ${score} does not sum to 1`).toBeCloseTo(1, 10);
      expect(mix.own).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('caps either direction at the configured edge mix', () => {
    expect(BLEED_EDGE_MIX).toBe(0.5);

    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      const mix = bleed(score);
      expect(Math.max(mix.up, mix.down), `score ${score} exceeds the edge mix`).toBeLessThanOrEqual(
        BLEED_EDGE_MIX,
      );
    }
  });
});

describe('the crossing is the assertion (SC-003)', () => {
  it('is the same blend on both sides of the Bronze/Silver line', () => {
    /**
     * **The pair the whole design rests on.** 2,499 is the last Bronze score and 2,500 is
     * Silver's first — `league.ts` settled floor-inclusive bands, so the boundary belongs
     * to Silver. A player one rune apart sits at opposite ends of two different leagues,
     * and the two mixes are mirror images: half your opponents come from the other side
     * of the line either way.
     */
    const topOfBronze = bleed(2499);
    const bottomOfSilver = bleed(2500);

    expect(leagueOf(2499)).toBe('bronze');
    expect(leagueOf(2500)).toBe('silver');

    expect(topOfBronze.up).toBeCloseTo(0.495, 10);
    expect(topOfBronze.down).toBe(0);
    expect(bottomOfSilver.down).toBe(0.5);
    expect(bottomOfSilver.up).toBe(0);

    /**
     * **52.5% on both sides, and the residual is the score grid rather than the design.**
     *
     * In the continuum the two are *exactly* equal — the parking-advantage block below
     * proves that at `pos` 1 against `pos` 0. On the discrete grid the last Bronze score
     * is 2,499, which is `pos` 0.999 rather than 1.0, so it sits a thousandth of a band
     * short of the ceiling and reads 52.612% against Silver's 52.500%.
     *
     * That is **0.112 of a percentage point**, and the next test is what makes the number
     * meaningful: it is the same size as an ordinary one-point move inside a band.
     */
    expect(winRate(2499)).toBeCloseTo(0.526124, 6);
    expect(winRate(2500)).toBeCloseTo(0.525, 10);
    expect(Math.abs(winRate(2500) - winRate(2499))).toBeLessThan(0.0012);
  });

  it('steps less at every higher boundary, because the bands get wider', () => {
    /**
     * A boundary's residual step is set by the width of the band *below* it — one score
     * point is a larger fraction of Bronze's 1,000 than of Platinum's 2,500. So the
     * effect shrinks exactly where scores get large, which is the harmless direction.
     */
    const steps = LEAGUE_BANDS.slice(1).map((band) => ({
      league: band.league,
      points: Math.abs(winRate(band.floor) - winRate(band.floor - 1)) * 100,
    }));

    for (const step of steps) {
      expect(step.points, `${step.league}'s floor steps ${step.points.toFixed(3)} points`).toBeLessThan(
        0.12,
      );
    }

    for (let i = 1; i < steps.length; i++) {
      expect(
        steps[i]!.points,
        `${steps[i]!.league} steps more than ${steps[i - 1]!.league}`,
      ).toBeLessThan(steps[i - 1]!.points);
    }
  });

  it('makes a crossing cost no more than placing any other rune', () => {
    /**
     * **The strongest available form of SC-003, and it is stronger than "small".**
     *
     * On a discrete score grid nothing is exactly continuous, so "no step change" has to
     * mean *the boundary is not special*. That is checkable: measure the largest jump at
     * a league boundary and the largest jump anywhere inside a band, and compare them.
     *
     * They come out at **0.1124 and 0.1121 points** — a ratio of **1.002**. Crossing a
     * threshold is 0.2% more expensive than any other single rune, which is as close to
     * "costs nothing" as a grid of whole numbers permits. Set against the 12.5 points the
     * upward ramp alone left behind, that is the whole design working.
     */
    const boundaries = new Set(LEAGUE_BANDS.slice(1).map((b) => b.floor - 1));
    let worstBoundary = { score: 0, jump: 0 };
    let worstWithin = { score: 0, jump: 0 };

    for (let score = STARTER_GRANT_SCORE; score < FULL_KIT_SCORE; score++) {
      const jump = Math.abs(winRate(score + 1) - winRate(score));
      const target = boundaries.has(score) ? worstBoundary : worstWithin;
      if (jump > target.jump) {
        if (boundaries.has(score)) worstBoundary = { score, jump };
        else worstWithin = { score, jump };
      }
    }

    expect(
      worstBoundary.jump / worstWithin.jump,
      `boundary ${worstBoundary.score}→${worstBoundary.score + 1} jumps ${(worstBoundary.jump * 100).toFixed(4)} points ` +
        `against a within-band worst of ${(worstWithin.jump * 100).toFixed(4)} at ${worstWithin.score}`,
    ).toBeLessThan(1.05);

    // And in absolute terms both are a tenth of a point, against 12.5 for a sawtooth.
    expect(worstBoundary.jump).toBeLessThan(0.0012);
    expect(worstWithin.jump).toBeLessThan(0.0012);
  });
});

describe('what the rejected designs would have cost', () => {
  /**
   * The four regimes `09-matchmaking.md` publishes a parking advantage for. Each is the
   * win-rate drop a player takes by placing one rune at the top of Bronze — which is
   * exactly the incentive to park below the threshold.
   *
   * Computed in the limit (`pos` 1 against `pos` 0) rather than at 2499/2500, because
   * that is how the document's round numbers were derived and it makes them exact.
   */
  const atTop = (mixUp: number, mixDown = 0) =>
    (1 - mixUp - mixDown) * ownRate(1) + mixUp * BEATS_ABOVE + mixDown * BEATS_BELOW;
  const atBottom = (mixDown: number) =>
    (1 - mixDown) * ownRate(0) + mixDown * BEATS_BELOW;

  it('reproduces all four published parking advantages', () => {
    const published: ReadonlyArray<[string, number, number]> = [
      // label, points, computed
      ['no mixing', 25.0, (atTop(0) - atBottom(0)) * 100],
      ['flat 10% for the top decile', 22.5, (atTop(0.1) - atBottom(0)) * 100],
      ['upward ramp only', 12.5, (atTop(0.5) - atBottom(0)) * 100],
      ['both edges', 0, (atTop(0.5) - atBottom(0.5)) * 100],
    ];

    for (const [label, expected, computed] of published) {
      expect(computed, `${label}: computed ${computed.toFixed(2)} vs published ${expected}`).toBeCloseTo(
        expected,
        6,
      );
    }
  });

  it('shows that a half is the only edge mix that works, for any skill gradient', () => {
    /**
     * **Found by a mutant, and it changes what `BLEED_EDGE_MIX` *is*.** Retuning it from
     * 0.5 to 0.4 put a 5.1-point step back at the Bronze/Silver line — so it is not a
     * balance dial with a currently-chosen value, it is a **solved** one.
     *
     * Setting the top-of-band win rate equal to the bottom-of-next-band win rate:
     *
     * ```
     * (1 − m)·a + m·b = (1 − m)·b + m·a
     *          a − b = 2m(a − b)
     *              m = ½                    for any a ≠ b
     * ```
     *
     * The 65/40 pair the document illustrates with **drops out entirely**, which is the
     * part worth knowing: the continuity does not depend on having guessed the skill
     * gradient correctly. So this is swept over gradients that are nothing like 65/40,
     * and a half is the answer to all of them.
     *
     * `BLEED_RAMP` is the genuine dial — any width under a half keeps the curve
     * continuous, as the second half of this test shows.
     */
    const gradients: ReadonlyArray<[number, number]> = [
      [BEATS_BELOW, BEATS_ABOVE],
      [0.9, 0.1],
      [0.55, 0.45],
      [0.7, 0.2],
    ];

    for (const [below, above] of gradients) {
      const top = (m: number) => (1 - m) * below + m * above;
      const bottom = (m: number) => (1 - m) * above + m * below;

      expect(
        Math.abs(top(BLEED_EDGE_MIX) - bottom(BLEED_EDGE_MIX)),
        `gradient ${below}/${above} is not continuous at m = ${BLEED_EDGE_MIX}`,
      ).toBeLessThan(1e-12);

      // And no other mix is: 0.4 and 0.6 both leave a step, in opposite directions.
      expect(top(0.4) - bottom(0.4), `0.4 is continuous for ${below}/${above}`).toBeGreaterThan(0);
      expect(top(0.6) - bottom(0.6), `0.6 is continuous for ${below}/${above}`).toBeLessThan(0);
    }
  });

  it('stays continuous for any ramp width under a half', () => {
    /**
     * The other constant, and the contrast: `BLEED_RAMP` really is tunable. It sets how
     * *wide* the transition is, not how *deep*, so the endpoints — a full edge mix at the
     * band's edge — are unchanged by it. A wider ramp is a gentler slope over more
     * scores, and the crossing stays free at every width.
     */
    for (const width of [0.05, 0.1, 0.2, 0.4, 0.49]) {
      const rampAt = (pos: number) => BLEED_EDGE_MIX * Math.max(0, (pos - (1 - width)) / width);

      // Full mix at the edge regardless of width, which is why continuity survives.
      expect(rampAt(1), `ramp width ${width} does not reach the edge mix`).toBeCloseTo(
        BLEED_EDGE_MIX,
        10,
      );
      // And nothing at all outside the transition zone. Every width here is under a
      // half, so the midpoint of a band is always pure league.
      expect(rampAt(1 - width), `ramp width ${width} starts early`).toBe(0);
      expect(rampAt(0.5), `ramp width ${width} reaches the middle of the band`).toBe(0);
    }
  });

  it('shows the sawtooth the upward ramp alone left behind', () => {
    /**
     * **The measured cost of the design that was tried first.** With only the upward
     * ramp, 52.5% at the top of Bronze dropped to 40% the moment a rune was placed — and
     * *that step was the reason to park*. Removing the step removes the incentive rather
     * than taxing it, which is why there is no anti-parking rule anywhere in 009.
     */
    expect(atTop(0.5)).toBeCloseTo(0.525, 10);
    expect(atBottom(0)).toBeCloseTo(0.4, 10);
    expect((atTop(0.5) - atBottom(0)) * 100).toBeCloseTo(12.5, 10);

    // The shipped design: the same two numbers, and no gap between them.
    expect(atBottom(0.5)).toBeCloseTo(0.525, 10);
  });
});

describe('the end leagues bleed one way only (T037 · FR-010)', () => {
  it('never offers Bronze a league below it', () => {
    const { floor, ceiling } = bandOf('bronze');

    expect(leagueBelow('bronze')).toBeNull();
    for (let score = floor; score < ceiling; score++) {
      expect(bleed(score).down, `Bronze bled down at ${score}`).toBe(0);
    }

    // The raw ramp *would* have — so the clip is doing work rather than agreeing.
    expect(ramps(positionInLeague(floor)).down).toBe(0.5);
    expect(bleed(floor)).toEqual({ own: 1, up: 0, down: 0 });
  });

  it('never offers Diamond a league above it', () => {
    const { floor } = bandOf('diamond');

    expect(leagueAbove('diamond')).toBeNull();
    for (let score = floor; score <= FULL_KIT_SCORE; score++) {
      expect(bleed(score).up, `Diamond bled up at ${score}`).toBe(0);
    }

    // `toBeCloseTo`, not `toBe`: `1 - 0.1` is 0.09999999999999998, so the raw ramp at
    // `pos` 1 lands one ulp under a half. The clip below is exact regardless.
    expect(ramps(positionInLeague(FULL_KIT_SCORE)).up).toBeCloseTo(0.5, 10);
    expect(bleed(FULL_KIT_SCORE)).toEqual({ own: 1, up: 0, down: 0 });
  });

  it('keeps the unbled share in the player’s own league rather than redirecting it', () => {
    /**
     * The alternative would give a Bronze-*floor* player 50% Silver opponents — the exact
     * opposite of what a ramp at the bottom of a band is for, and a new account's first
     * fight against a league it has no business in.
     */
    expect(bleed(STARTER_GRANT_SCORE).own).toBe(1);
    expect(bleed(STARTER_GRANT_SCORE).up).toBe(0);
    expect(bleed(FULL_KIT_SCORE).own).toBe(1);
  });

  it('gives both neighbours to all three middle leagues', () => {
    for (const league of ['silver', 'gold', 'platinum'] as League[]) {
      const { floor, ceiling } = bandOf(league);

      expect(leagueAbove(league), `${league} has no league above`).not.toBeNull();
      expect(leagueBelow(league), `${league} has no league below`).not.toBeNull();
      expect(bleed(floor).down, `${league} does not bleed down at its floor`).toBe(0.5);
      expect(bleed(ceiling - 1).up, `${league} does not bleed up near its ceiling`).toBeGreaterThan(
        0.49,
      );
    }
  });

  it('walks the league chain end to end', () => {
    expect(LEAGUE_NAMES.map(leagueBelow)).toEqual([null, 'bronze', 'silver', 'gold', 'platinum']);
    expect(LEAGUE_NAMES.map(leagueAbove)).toEqual([
      'silver',
      'gold',
      'platinum',
      'diamond',
      null,
    ]);
  });
});

describe('bleeding cannot break the 1.67x gear bound', () => {
  it('holds at every score that bleeds upward', () => {
    /**
     * **The document makes this claim and it is worth verifying rather than trusting.**
     * *Considered and rejected: drawing only from the lower half above* argues that the
     * proposal was unnecessary because *"the upward bleed fires above pos 0.9 — score
     * 2,400 in Bronze — so the widest gap it can produce is 4,000 / 2,400 = 1.67×,
     * exactly the bound Leagues already"* keeps.
     *
     * That is a real coincidence rather than a designed one, so it deserves a sweep: the
     * ramp threshold and the band widths were chosen independently, and nothing would
     * have warned anybody if they had multiplied out to 1.8×.
     *
     * The worst case for a bleeding player is the **ceiling of the league above**, since
     * bleed reaches the whole neighbouring band.
     */
    let worst = { score: 0, opponent: 0, ratio: 0 };

    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      const mix = bleed(score);
      if (mix.up === 0) continue;

      const above = leagueAbove(leagueOf(score));
      if (above === null) continue;

      const { ceiling } = bandOf(above);
      const strongest = ceiling === FULL_KIT_SCORE ? ceiling : ceiling - 1;
      const ratio = strongest / score;

      expect(
        ratio,
        `bleeding up from ${score} could offer ${strongest} — ${ratio.toFixed(4)}x`,
      ).toBeLessThanOrEqual(GEAR_BOUND);

      if (ratio > worst.ratio) worst = { score, opponent: strongest, ratio };
    }

    /**
     * And the worst case is where the document says it is: the lowest score that bleeds
     * at all, against the top of the league above. 2,401 rather than the document's
     * round 2,400 — at `pos` exactly 0.9 the ramp is still zero, so 2,400 does not bleed.
     */
    expect(worst.score).toBe(2401);
    expect(worst.opponent).toBe(3999);
    expect(worst.ratio).toBeLessThan(GEAR_BOUND);
    expect(worst.ratio).toBeCloseTo(3999 / 2401, 10);
  });

  it('is never a problem downward, because bleeding down is punching down', () => {
    for (let score = STARTER_GRANT_SCORE; score <= FULL_KIT_SCORE; score++) {
      const mix = bleed(score);
      if (mix.down === 0) continue;

      const below = leagueBelow(leagueOf(score));
      if (below === null) continue;

      // The strongest opponent below is that band's ceiling, which is this band's floor.
      expect(bandOf(below).ceiling / score).toBeLessThanOrEqual(1);
    }
  });
});
