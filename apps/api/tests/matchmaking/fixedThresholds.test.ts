/**
 * **A league is never taken away** (009 T020, T022 · FR-003, FR-004, SC-002).
 *
 * `09-matchmaking.md` *Fixed thresholds, not population quintiles* rejects
 * equal-population leagues for one reason: they would demote a player **because
 * other people geared up**, and *"nothing about that player changed."* SC-002 is the
 * promise that came out of it — *"a player who places no runes never changes league,
 * regardless of what the population does."*
 *
 * ### Why it takes a population to test at all
 *
 * The claim has a quantifier in it. A unit test on `leagueOf(4000)` proves the
 * function is deterministic, which nobody doubted; it says nothing about whether the
 * answer survives twenty thousand other accounts moving. So this file advances a
 * whole simulated population for a year **around** five players standing still, one
 * in each league, and checks their answer every month.
 *
 * ### And the counterfactual, which is what makes it non-vacuous
 *
 * A test that only asserts *"nothing moved"* passes just as happily if the
 * population never moved either. So the second block computes what the **rejected**
 * design would have answered over the very same population: a player frozen in Gold
 * falls to the bottom fifth without touching a rune. That number is the reason for
 * the design, measured rather than asserted — and it is also the proof that the
 * first block was checking something.
 *
 * T022 closes it structurally. The reason `leagueOf` *cannot* read a quantile is
 * that it takes one number and `league.ts` imports nothing at all — there is no
 * channel, not merely no call.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  LEAGUE_NAMES,
  leagueOf,
  positionInLeague,
  type League,
} from '../../src/matchmaking/league.js';
import { advance, leagueShares, population, type SimAccount } from './population.js';

/** Monthly steps across a year, so a failure names the month it first moved. */
const STEP_DAYS = 30;
const STEPS = 12;

/** One account per league. Every league is populated — `population.test.ts` pins that. */
function onePerLeague(pop: readonly SimAccount[]): SimAccount[] {
  const picked = new Map<League, SimAccount>();
  for (const account of pop) {
    const league = leagueOf(account.gearScore);
    if (!picked.has(league)) picked.set(league, account);
  }
  return [...picked.values()];
}

/**
 * **The design that was rejected**, implemented here only so it can be measured.
 *
 * Equal-population leagues: sort the population and a player's league is whichever
 * fifth their rank falls in. Returns the index, `0` for the weakest fifth.
 */
function quintileIndex(scores: readonly number[], score: number): number {
  let below = 0;
  for (const other of scores) if (other < score) below++;

  const fifths = LEAGUE_NAMES.length;
  return Math.min(fifths - 1, Math.floor((below / scores.length) * fifths));
}

describe('a player who places no runes never changes league (SC-002)', () => {
  it('holds for one player in every league across a year of everybody else gearing up', () => {
    const pop = population({ size: 20_000, seed: 0x5ea1ed });
    const standingStill = onePerLeague(pop);

    // All five, or four of the assertions below are about the same band.
    expect(standingStill.map((a) => leagueOf(a.gearScore)).sort()).toEqual([...LEAGUE_NAMES].sort());

    const frozen = new Set(standingStill.map((a) => a.id));
    const before = standingStill.map((account) => ({
      account,
      score: account.gearScore,
      league: leagueOf(account.gearScore),
      position: positionInLeague(account.gearScore),
    }));

    for (let step = 1; step <= STEPS; step++) {
      advance(pop, STEP_DAYS, frozen);
      const day = step * STEP_DAYS;

      for (const was of before) {
        expect(
          was.account.gearScore,
          `the ${was.league} player's score moved on day ${day}: ${was.score} → ${was.account.gearScore}`,
        ).toBe(was.score);

        expect(
          leagueOf(was.account.gearScore),
          `demoted on day ${day}: ${was.league} → ${leagueOf(was.account.gearScore)}`,
        ).toBe(was.league);

        /**
         * **And their position inside the band, not only the band.**
         * `positionInLeague` is what drives the bleed mix in Phase 6 — who a player
         * actually fights. A league that held while the position drifted would keep
         * the letter of SC-002 and break the sentence US2 is written from: *"their
         * league and matching mix are unchanged."*
         */
        expect(
          positionInLeague(was.account.gearScore),
          `the ${was.league} player's position in band moved on day ${day}`,
        ).toBe(was.position);
      }
    }

    /**
     * **The non-vacuity check, stated as an identity rather than a threshold.**
     *
     * A year of the *slowest* play is `223 × 360 = 80,280` shards, which buys 123
     * runes against the 69 a full kit needs — so every account that moved reaches
     * the cap, and the only accounts left outside Diamond are the ones that did not
     * move. Comparing the two lists proves both halves at once: the population
     * really geared up, and the freeze really held.
     */
    const outsideDiamond = pop
      .filter((a) => leagueOf(a.gearScore) !== 'diamond')
      .map((a) => a.id)
      .sort();
    const frozenBelowDiamond = before
      .filter((b) => b.league !== 'diamond')
      .map((b) => b.account.id)
      .sort();

    expect(
      outsideDiamond,
      'the only accounts left below Diamond should be the four standing still',
    ).toEqual(frozenBelowDiamond);
  });

  it('never moves anybody down, in a population where everybody is moving', () => {
    /**
     * The other half of *"score only rises as runes are placed"*. A real score **can**
     * fall — runes are destroyed on replacement and `gearScore.test.ts` covers that
     * deliberately — but it falls because the player replaced a rune, never because
     * the population shifted. Nothing here places or destroys anything, so every
     * score must be monotone.
     */
    const pop = population({ size: 5_000, seed: 0xc0ffee });
    const scoresBefore = pop.map((a) => a.gearScore);

    advance(pop, 90);

    const dropped = pop
      .map((account, i) => ({ id: account.id, from: scoresBefore[i]!, to: account.gearScore }))
      .filter((change) => change.to < change.from);

    expect(dropped, 'a score fell without a rune being touched').toEqual([]);
  });
});

describe('what population quintiles would have answered instead', () => {
  it('demotes a standing-still Gold player to the bottom fifth', () => {
    /**
     * **The measured cost of the rejected design.** Same population, same frozen
     * player, same year — only the league rule changes. Under quintiles this player
     * is told they have fallen several leagues having done nothing at all; under
     * fixed thresholds their answer is identical to the day before.
     *
     * Gold rather than Bronze deliberately: a frozen Bronze player is already in the
     * bottom fifth and has nowhere to fall, so the rejected design would look
     * harmless there. The damage is worst in the middle, which is where most players
     * are.
     */
    const pop = population({ size: 20_000, seed: 0x5ea1ed });
    const stillGold = pop.find((a) => leagueOf(a.gearScore) === 'gold')!;

    const quintileBefore = quintileIndex(
      pop.map((a) => a.gearScore),
      stillGold.gearScore,
    );

    advance(pop, 365, new Set([stillGold.id]));

    const quintileAfter = quintileIndex(
      pop.map((a) => a.gearScore),
      stillGold.gearScore,
    );

    expect(
      quintileAfter,
      `quintile league ${LEAGUE_NAMES[quintileBefore]} → ${LEAGUE_NAMES[quintileAfter]}, without placing a rune`,
    ).toBeLessThan(quintileBefore);
    expect(quintileAfter).toBe(0);

    // And the shipped rule did not move them one point.
    expect(leagueOf(stillGold.gearScore)).toBe('gold');
  });

  it('would keep demoting a player who never logged in again', () => {
    /**
     * The sharpest form of the objection, and the one the doc makes: a quintile
     * league changes for a player who is *not playing*. An abandoned account would be
     * demoted repeatedly, and would find a different league waiting every time it came
     * back — while the fixed answer is the one they left.
     */
    const pop = population({ size: 20_000, seed: 0x5ea1ed });
    const abandoned = pop[0]!;
    const frozen = new Set([abandoned.id]);
    const leagueOnLeaving = leagueOf(abandoned.gearScore);

    const quintiles: number[] = [];
    for (let step = 0; step <= 6; step++) {
      quintiles.push(
        quintileIndex(
          pop.map((a) => a.gearScore),
          abandoned.gearScore,
        ),
      );
      advance(pop, 60, frozen);
    }

    for (let i = 1; i < quintiles.length; i++) {
      expect(
        quintiles[i]!,
        `a quintile league rose for an idle account at step ${i}: ${quintiles.join(' → ')}`,
      ).toBeLessThanOrEqual(quintiles[i - 1]!);
    }
    expect(quintiles.at(-1)!, `quintiles over a year: ${quintiles.join(' → ')}`).toBeLessThan(
      quintiles[0]!,
    );

    // Fixed thresholds: the league they left is the league they come back to.
    expect(leagueOf(abandoned.gearScore)).toBe(leagueOnLeaving);
  });
});

describe('league.ts cannot read a population, structurally (T022)', () => {
  it('takes one number, and ignores anything a caller tries to add', () => {
    /**
     * **The signature is the enforcement** — the same argument `candidates()` rests
     * on. A function whose only input is a score has no access to a population, so
     * the guarantee does not depend on nobody deciding to look one up.
     *
     * The second half matters more than it looks: it checks that a caller smuggling a
     * population in as an extra argument changes nothing, which is how the first
     * quantile-aware version of this would arrive.
     */
    expect(leagueOf.length).toBe(1);
    expect(positionInLeague.length).toBe(1);

    const pop = population({ size: 200, seed: 3 });
    const smuggle = leagueOf as unknown as (score: number, ...rest: unknown[]) => League;

    expect(smuggle(4000, pop)).toBe(leagueOf(4000));
    expect(smuggle(4000, pop.map((a) => a.gearScore))).toBe('gold');
  });

  it('imports nothing at all, so it cannot reach a database or a count', async () => {
    /**
     * **Comments first, or this test can never fail.** `league.ts` argues *against*
     * quintiles at length in its own doc block — it names quintiles, percentiles and
     * the population explicitly, to explain why none of them appear. A grep-based ban
     * that its own explanation satisfies is decoration.
     *
     * So: strip comments, prove the strip left the file behind, and only then search.
     * The most useful assertion turns out to be about `import` rather than about any
     * forbidden word — a module with no imports has no channel to a population,
     * whatever anybody later writes inside it.
     */
    const source = await readFile(
      new URL('../../src/matchmaking/league.ts', import.meta.url),
      'utf8',
    );

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block and doc comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, sparing `://`

    expect(code, 'the comment strip ate the file').toContain('export function leagueOf');
    expect(code).toContain('LEAGUE_BANDS');
    expect(code.length).toBeGreaterThan(400);

    expect(code, 'league.ts acquired an import').not.toMatch(/^\s*import\b/m);

    for (const forbidden of [
      'population',
      'Population',
      'quantile',
      'quintile',
      'percentile',
      'db(',
      'select',
      'count',
    ]) {
      expect(code, `${forbidden} reaches the league decision`).not.toContain(forbidden);
    }
  });

  it('holds no module state that a population could have seeded', () => {
    /**
     * The structural test above would still pass for a module that cached a
     * distribution the first time it was asked. So: build the whole answer table,
     * shift the population as far as it can go, and rebuild it. Two identical tables
     * mean the module remembers nothing between calls.
     */
    const table = () => {
      const answers: Array<[number, League, number]> = [];
      for (let score = 1500; score <= 10_125; score += 137) {
        answers.push([score, leagueOf(score), positionInLeague(score)]);
      }
      return answers;
    };

    const sparse = population({ size: 50, seed: 1 });
    expect(leagueShares(sparse).diamond, 'a 50-account sample is not all Diamond').toBeLessThan(1);
    const beforeAnyPopulationExists = table();

    const dense = population({ size: 20_000, seed: 2 });
    advance(dense, 400);
    expect(leagueShares(dense).diamond, 'a year of play should cap everybody').toBe(1);

    expect(table(), 'the league table changed after a population was built').toEqual(
      beforeAnyPopulationExists,
    );
  });
});
