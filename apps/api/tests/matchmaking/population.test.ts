/**
 * The harness is the design's economy, not an approximation of it (009 T004).
 *
 * **A model nobody checked is a number generator.** Everything downstream —
 * league shares, bleed continuity, whether bots are needed in Bronze — is read off
 * this population, so if the income model drifts from `06-progression.md` then
 * every conclusion drawn from it is confidently wrong.
 *
 * The check that matters is the first block: `06-progression.md` *What that pace
 * produces* publishes a 3 × 3 table of milestones by play level, derived
 * independently of this file, and the harness has to reproduce all nine cells.
 * That is a real agreement between two derivations rather than a self-consistency
 * test — if I have misread the rune cost, the grant size or the tiering, one of
 * these nine fails.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLETE_RUNE_SCORE,
  FULL_KIT_SCORE,
  STARTER_GRANT_SCORE,
  leagueOf,
  type League,
} from '../../src/matchmaking/league.js';
import {
  DEFAULT_MEAN_TENURE_DAYS,
  PASS_MULTIPLIER,
  RUNE_COST_SHARDS,
  SHARDS_PER_DAY,
  advance,
  daysToReach,
  gearScoreFor,
  leagueShares,
  population,
  type PlayLevel,
} from './population.js';

/** The average Gregorian month, so months and days agree to two decimals. */
const DAYS_PER_MONTH = 365.25 / 12;

/** A hero has three rune slots; the grant is 12 runes, not 12 heroes complete. */
const scoreForCompleteHeroes = (heroes: number): number =>
  STARTER_GRANT_SCORE + (heroes * 3 - 12) * COMPLETE_RUNE_SCORE;

describe('the model reproduces 06-progression.md What that pace produces', () => {
  /** The published table, verbatim. Months. */
  const PUBLISHED: ReadonlyArray<{
    readonly level: PlayLevel;
    readonly twelve: number;
    readonly eighteen: number;
    readonly twentySeven: number;
  }> = [
    { level: 'light', twelve: 2.3, eighteen: 4.0, twentySeven: 6.6 },
    { level: 'typical', twelve: 1.3, eighteen: 2.3, twentySeven: 3.8 },
    { level: 'heavy', twelve: 0.9, eighteen: 1.5, twentySeven: 2.4 },
  ];

  for (const row of PUBLISHED) {
    it(`${row.level}: 12 heroes at ${row.twelve} mo, 18 at ${row.eighteen}, 27 at ${row.twentySeven}`, () => {
      const months = (heroes: number) =>
        daysToReach(scoreForCompleteHeroes(heroes), row.level, false) / DAYS_PER_MONTH;

      /**
       * **Within 0.1 months — three days — and that tolerance is the published
       * table's own precision, not slack.**
       *
       * Eight of the nine cells land inside 0.02. The ninth, heavy / 12 heroes,
       * models at **0.85** against a published **0.9**: 15,600 shards at 603 a day
       * is 25.9 days, which is 0.85 of an average month and 0.86 of a 30-day one.
       * The table appears to have rounded that cell on a 30-day month, and 30-day
       * months break two other cells (light / 18 reads 4.1 against 4.0, typical /
       * 27 reads 3.9 against 3.8). So the document is internally rounded slightly
       * inconsistently, as a hand-computed table is, and **1.5 days of
       * disagreement in one cell of nine is agreement.** Tightening this to 0.05
       * would assert the rounding rather than the economy.
       */
      const agrees = (label: string, modelled: number, published: number) =>
        expect(
          Math.abs(modelled - published),
          `${label}: modelled ${modelled.toFixed(3)} vs published ${published}`,
        ).toBeLessThan(0.1);

      agrees('12 heroes', months(12), row.twelve);
      agrees('competitive 18', months(18), row.eighteen);
      agrees('full 27', months(27), row.twentySeven);
    });
  }

  it('agrees that 27 heroes is 81 runes and 44,850 shards past the grant', () => {
    // The arithmetic the table above rests on, asserted separately so a failure
    // says which half is wrong.
    expect(scoreForCompleteHeroes(27)).toBe(FULL_KIT_SCORE);
    expect((FULL_KIT_SCORE - STARTER_GRANT_SCORE) / COMPLETE_RUNE_SCORE).toBe(69);
    expect(69 * RUNE_COST_SHARDS).toBe(44_850);
  });

  it('does not apply the daily curve twice', () => {
    /**
     * **The rates are already tiered.** `06-progression.md` gives the untiered
     * figures as 165 / 330 / 545 against the tiered 223 / 388 / 603, so
     * re-applying the 1.5× would inflate income about 15% and lift the whole
     * population a league. This pins which set is in use.
     */
    expect(SHARDS_PER_DAY).toEqual({ light: 223, typical: 388, heavy: 603 });
  });

  it('doubles a pass holder and halves their runway', () => {
    expect(PASS_MULTIPLIER).toBe(2);
    expect(daysToReach(FULL_KIT_SCORE, 'typical', true)).toBeCloseTo(
      daysToReach(FULL_KIT_SCORE, 'typical', false) / 2,
      6,
    );
  });
});

describe('gearScoreFor', () => {
  it('starts every account at the grant, which is the Bronze floor', () => {
    expect(gearScoreFor(0, 'typical', false)).toBe(STARTER_GRANT_SCORE);
    expect(leagueOf(gearScoreFor(0, 'heavy', true))).toBe('bronze');
  });

  it('floors to whole runes, because a part-built stage grants nothing', () => {
    /**
     * One typical day is 388 shards — most of a rune and therefore none of one. A
     * linear score would put this player above the Bronze floor on power they do
     * not have.
     */
    expect(gearScoreFor(1, 'typical', false)).toBe(STARTER_GRANT_SCORE);
    expect(gearScoreFor(2, 'typical', false)).toBe(STARTER_GRANT_SCORE + COMPLETE_RUNE_SCORE);
  });

  it('caps at a full kit however long anybody plays', () => {
    // The shared ceiling — and the reason Diamond is crowded rather than
    // exclusive. Nobody can out-roster anybody.
    expect(gearScoreFor(10_000, 'heavy', true)).toBe(FULL_KIT_SCORE);
    expect(gearScoreFor(100_000, 'heavy', true)).toBe(FULL_KIT_SCORE);
  });

  it('treats negative tenure as zero rather than as debt', () => {
    expect(gearScoreFor(-5, 'typical', false)).toBe(STARTER_GRANT_SCORE);
  });
});

describe('the population', () => {
  it('is reproducible from its seed', () => {
    /**
     * **Not a nicety.** Every share assertion below is a statistic; a population
     * that differed run to run would make them flaky, and a flaky assertion gets
     * retried rather than read.
     */
    const a = population({ size: 500, seed: 42 });
     const b = population({ size: 500, seed: 42 });
    expect(a.map((x) => x.gearScore)).toEqual(b.map((x) => x.gearScore));

    const c = population({ size: 500, seed: 43 });
    expect(c.map((x) => x.gearScore)).not.toEqual(a.map((x) => x.gearScore));
  });

  it('honours its size and mixes play levels and passes', () => {
    const pop = population({ size: 20_000 });
    expect(pop).toHaveLength(20_000);

    /**
     * **A sample, not a guarantee.** 20,000 Bernoulli draws at p = 0.2 have a
     * standard deviation of 0.28 percentage points, so ±1 point is about 3.5σ —
     * tight enough to catch a wrong share, loose enough that a correct one is not
     * flaky. `toBeCloseTo(0.2, 2)` demands ±0.5 points, which this seed misses by
     * 0.1 for no reason worth chasing.
     */
    const passes = pop.filter((a) => a.hasPass).length / pop.length;
    expect(Math.abs(passes - 0.2), `20% pass holders, got ${passes}`).toBeLessThan(0.01);

    for (const level of ['light', 'typical', 'heavy'] as PlayLevel[]) {
      expect(pop.some((a) => a.playLevel === level), level).toBe(true);
    }
  });

  it('reproduces all five shares from the 09-matchmaking.md league table (T023)', () => {
    /**
     * **The recorded distribution, and it is five numbers rather than one.**
     * `09-matchmaking.md` § *Leagues* publishes a share for every band, simulated in
     * an earlier design pass over the same 20,000 accounts and 20% pass holders. Only
     * Diamond's ~31% made it into `spec.md`, so only Diamond was being checked here —
     * and Diamond is the one share the harness was *calibrated* to hit, which makes it
     * the least informative of the five.
     *
     * The other four are free. They fall out of the rune cost, the grant, the play
     * mix and the band widths with nothing tuned for them, so agreement across all
     * five is a real check between two derivations rather than a self-consistency one.
     *
     * ```
     * league     modelled  published  delta
     * bronze       16.16      15.6     +0.56
     * silver       18.88      19.6     -0.73
     * gold         20.14      18.9     +1.25
     * platinum     14.08      14.9     -0.82
     * diamond      30.75      31.0     -0.25
     * ```
     */
    const PUBLISHED: Readonly<Record<League, number>> = {
      bronze: 15.6,
      silver: 19.6,
      gold: 18.9,
      platinum: 14.9,
      diamond: 31.0,
    };

    const shares = leagueShares(population({ size: 20_000 }));

    for (const [league, published] of Object.entries(PUBLISHED) as Array<[League, number]>) {
      const modelled = shares[league] * 100;
      expect(
        Math.abs(modelled - published),
        `${league}: modelled ${modelled.toFixed(2)}% vs published ${published}%`,
      ).toBeLessThan(1.5);
    }

    /**
     * **What is deliberately NOT asserted: that Silver outranks Gold.** The published
     * table has them 0.7 points apart and the model has them 1.3 apart the other way,
     * so the two derivations disagree about the order of the two middle leagues while
     * agreeing about both magnitudes. Neither table is precise enough to settle it, and
     * an assertion either way would be pinning a rounding artefact as a design claim.
     * The ordering that *is* real — Diamond largest, Bronze and Platinum smallest — is
     * checked below, along with the reason.
     */
    expect(DEFAULT_MEAN_TENURE_DAYS).toBe(77);
  });

  it('produces those shares from the model rather than from the seed', () => {
    /**
     * The agreement above would be worth little if a different seed gave a different
     * distribution — it would mean the table was matched by luck. Across four seeds no
     * league moves a full percentage point, so the shares are a property of the income
     * model and the band widths.
     */
    const runs = [0x9e37_79b9, 1, 42, 12_345].map((seed) =>
      leagueShares(population({ size: 20_000, seed })),
    );

    for (const league of ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as League[]) {
      const values = runs.map((r) => r[league] * 100);
      const spread = Math.max(...values) - Math.min(...values);
      expect(
        spread,
        `${league} varies ${spread.toFixed(2)} points across seeds: ${values.map((v) => v.toFixed(2)).join(', ')}`,
      ).toBeLessThan(1);
    }
  });

  it('populates every league, so no band is untestable', () => {
    const shares = leagueShares(population({ size: 20_000 }));

    for (const [league, share] of Object.entries(shares)) {
      expect(share, `${league} is empty`).toBeGreaterThan(0);
    }
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('is NOT ordered by league, because band width in runes drives share', () => {
    /**
     * **I assumed this population would be bottom-heavy and it is not.** The
     * assertion here originally read `bronze > silver > gold`, on the reasoning
     * that exponential tenure means most accounts are recent. It failed —
     * Bronze 16% against Silver 19% — and the cause is worth recording rather
     * than asserting around.
     *
     * **A league's share is its width in runes, not its position.** The bands are
     * not equal: measured in completed runes past the grant they are
     *
     * ```
     * bronze     8   silver 12   gold 18   platinum 20   diamond 11 (then capped)
     * ```
     *
     * so Bronze is the narrowest band in the game and players fall out of it
     * fastest. Tenure decay and band width pull in opposite directions, and the
     * result peaks in the middle: Gold is the largest of the four climbing leagues
     * even though far fewer accounts are old enough to reach it, simply because it
     * takes the longest to cross.
     *
     * **This is direct evidence for a decision already made rather than a
     * problem.** `09-matchmaking.md` says inactivity *"thins Bronze the most, which
     * is where it hurts"*, and that bots therefore matter most there — and it turns
     * out Bronze is *already* the thinnest climbing league before a single account
     * goes inactive. The bot distribution putting 20% in Bronze is not padding a
     * hypothetical.
     */
    const shares = leagueShares(population({ size: 20_000 }));

    expect(shares.bronze, 'the narrowest band holds the fewest').toBeLessThan(shares.silver);
    expect(shares.bronze).toBeLessThan(shares.gold);

    // Diamond is the largest overall, and only because it is the terminus that
    // everybody accumulates into once the shared ceiling is reached.
    const largest = Math.max(...Object.values(shares));
    expect(shares.diamond).toBe(largest);
  });

  it('empties Bronze in under a fortnight of typical play', () => {
    /**
     * The deterministic half of the finding above — no sampling in it. Bronze is
     * 8 runes wide, which is `8 × 650 = 5,200` shards, which is **13.4 days** at
     * the typical rate. Whatever the population looks like, a player does not stay
     * in Bronze long enough for it to be populous.
     */
    expect(daysToReach(2500, 'typical', false)).toBeLessThan(15);
    expect(daysToReach(2500, 'heavy', true)).toBeLessThan(5);
  });
});

describe('advance', () => {
  it('gears the population up', () => {
    const pop = population({ size: 2_000, seed: 7 });
    const before = leagueShares(pop);

    advance(pop, 120);

    const after = leagueShares(pop);
    expect(after.diamond).toBeGreaterThan(before.diamond);
    expect(after.bronze).toBeLessThan(before.bronze);
  });

  it('leaves a frozen account untouched while everyone else climbs — the shape US2 needs', () => {
    /**
     * The harness half of T020. **US2's promise is that a player's league changes
     * only when they place runes**, and the only way to test that is to advance a
     * whole population around somebody standing still. If `advance` recomputed a
     * frozen account from its tenure, the test built on this would pass for the
     * wrong reason — or fail for one.
     */
    const pop = population({ size: 2_000, seed: 11 });
    const standingStill = pop[0]!;
    const scoreBefore = standingStill.gearScore;
    const leagueBefore = leagueOf(scoreBefore);

    advance(pop, 365, new Set([standingStill.id]));

    expect(standingStill.gearScore).toBe(scoreBefore);
    expect(leagueOf(standingStill.gearScore)).toBe(leagueBefore);
    // And the population really did move, or the assertion above is vacuous.
    expect(pop.filter((a) => leagueOf(a.gearScore) === 'diamond').length).toBeGreaterThan(
      pop.length / 2,
    );
  });
});
