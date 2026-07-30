/**
 * The bot population, and whether the starter ramp actually teaches (T041 · T042 · T048).
 *
 * ### Why this file asserts the ramp rather than the roster
 *
 * `starterBots.ts` derives 240 seat assignments from a 20-row authored table, and the
 * reason it derives them is that **hand-picked seats cannot be checked** — the claim
 * "stage 1 is exploitable" is a claim about type effectiveness across six champions,
 * and the only way to verify it by hand is to redo the derivation. So the tests here
 * check the *teaching properties*: that a single type beats every member of a stage-1
 * squad, that no type beats every member of a stage-3 one, and that the free answer
 * disappears monotonically in between.
 *
 * That is the difference between testing the data and testing the design. A wrong
 * theme in the table would still produce twenty valid squads, twelve distinct
 * champions each, seated legally — and would fail here.
 *
 * No database: every assertion is over pure functions and authored content.
 */

import { describe, expect, it } from 'vitest';
import { counter, DAMAGE_TYPES, effectiveness, getHero, type DamageType } from '@lmntlz/content';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import {
  STARTER_BOT_COUNT,
  RATING_SPREAD,
  botPopulation,
  botRating,
  expectedScore,
} from '../../src/matchmaking/bots.js';
import { STARTER_BOTS, ROW_CAPACITY, bestAnswerCoverage } from '../../src/matchmaking/starterBots.js';
import { BOT_DISTRIBUTION } from '../../src/matchmaking/config.js';
import { STARTER_GRANT_SCORE, leagueOf } from '../../src/matchmaking/league.js';
import { STARTING_RATING } from '../../src/db/schema/ratings.js';

/** How many of a squad's six champions type `t` is super-effective or effective against. */
const weakTo = (seats: readonly { heroId: string }[], t: DamageType): number =>
  seats.filter((s) => effectiveness(t, getHero(s.heroId)) >= 1.25).length;

/** Seats to champions, so the exported `bestAnswerCoverage` can be applied to a squad. */
const heroesOf = (seats: readonly { heroId: string }[]) => seats.map((s) => getHero(s.heroId));

describe('the bot distribution (T044)', () => {
  it('reproduces the published table from the shares alone', () => {
    const { counts, total } = botPopulation();

    // T047's numbers, as a consequence of 20 starter bots and the published shares —
    // not as a second copy of them.
    expect(counts).toEqual({ starter: 20, bronze: 13, silver: 13, gold: 13, platinum: 7 });
    expect(total, 'the bot population should come to 66').toBe(66);
  });

  it('gives Diamond no generated bots at all (T041, FR-016)', () => {
    // `spec.md`: "bots that were written, never bots that were needed". Diamond is
    // absent from the type as well as from the value, so this cannot regress quietly.
    expect(Object.keys(BOT_DISTRIBUTION)).not.toContain('diamond');
    expect(Object.keys(botPopulation().counts)).not.toContain('diamond');
  });

  it('weights the bottom of the ladder hardest', () => {
    // The weighting is upside-down from the player population on purpose. Asserting
    // the ordering rather than the values, because the values are launch tuning.
    const { counts } = botPopulation();
    expect(counts.starter).toBeGreaterThan(counts.bronze);
    expect(counts.bronze).toBeGreaterThanOrEqual(counts.gold);
    expect(counts.gold).toBeGreaterThan(counts.platinum);
  });

  it('sums its shares to one, which no type can check', () => {
    const sum = Object.values(BOT_DISTRIBUTION).reduce((a, b) => a + b, 0);
    expect(sum, `the bot shares sum to ${sum}, not 1`).toBeCloseTo(1, 10);
  });

  it('re-derives the whole table when the authored anchor moves', () => {
    // The point of deriving rather than hard-coding: a deeper ramp costs one number.
    const deeper = botPopulation(30);
    expect(deeper.counts.starter).toBe(30);
    expect(deeper.counts.bronze).toBe(20);
    expect(deeper.total).toBe(100);
  });

  it('refuses a nonsensical anchor rather than dividing by it', () => {
    expect(() => botPopulation(0)).toThrow(/positive integer/);
    expect(() => botPopulation(-3)).toThrow(/positive integer/);
    expect(() => botPopulation(2.5)).toThrow(/positive integer/);
  });
});

describe('bot ratings are a spread, not a midpoint (T042 · T048 · FR-017)', () => {
  it('spans the band instead of pegging to the centre', () => {
    const ratings = Array.from({ length: 20 }, (_, i) => botRating(i, 20));

    expect(new Set(ratings).size, 'every bot in a band shares one rating').toBeGreaterThan(15);
    expect(ratings[0]).toBe(STARTING_RATING - RATING_SPREAD);
    expect(ratings[19]).toBe(STARTING_RATING + RATING_SPREAD);

    // Monotonic, so ramp position and rating never disagree about which bot is harder.
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i], `bot ${i + 1} is not stronger than bot ${i}`).toBeGreaterThan(
        ratings[i - 1]!,
      );
    }
  });

  it('lets a fresh player beat the weakest and lose to the strongest', () => {
    /**
     * The design requirement in one assertion: *"a new player converging over ~30
     * provisional battles should be able to lose to a strong bot and beat a weak one
     * inside the same league."* Both ends have to be *possible*, which means neither
     * may be a certainty.
     */
    const weakest = expectedScore(STARTING_RATING, botRating(0, 20));
    const strongest = expectedScore(STARTING_RATING, botRating(19, 20));

    expect(weakest, 'the weakest bot is not a reliable win').toBeGreaterThan(0.8);
    expect(weakest, 'the weakest bot is a free win, which teaches nothing').toBeLessThan(0.95);
    expect(strongest, 'the strongest bot is not a real threat').toBeLessThan(0.2);
    expect(strongest, 'the strongest bot is a wall, which also teaches nothing').toBeGreaterThan(
      0.05,
    );
  });

  it('gets easier as the player climbs, which is what makes it a ramp', () => {
    // The property the ±300 spread was solved for: the top bot is 15% at 1000 and
    // materially kinder by the time provisional battles have moved the player up.
    const atStart = expectedScore(STARTING_RATING, botRating(19, 20));
    const converged = expectedScore(STARTING_RATING + 200, botRating(19, 20));

    expect(converged).toBeGreaterThan(atStart * 2);
    expect(converged).toBeGreaterThan(0.35);
  });

  it('answers the midpoint for a band of one, and refuses an impossible index', () => {
    expect(botRating(0, 1)).toBe(STARTING_RATING);
    expect(() => botRating(5, 5)).toThrow(/outside a band of 5/);
    expect(() => botRating(-1, 5)).toThrow(/outside a band of 5/);
    expect(() => botRating(0, 0)).toThrow(/positive integer/);
  });
});

describe('the starter ramp is legal content (T045 · T046)', () => {
  it('has the twenty bots the anchor promises', () => {
    expect(STARTER_BOTS).toHaveLength(STARTER_BOT_COUNT);
    expect(new Set(STARTER_BOTS.map((b) => b.name)).size, 'two bots share a name').toBe(20);
  });

  for (const bot of STARTER_BOTS) {
    it(`bot ${bot.position} (${bot.name}) seats two legal squads`, () => {
      for (const [zone, seats] of [
        ['visible', bot.visible],
        ['hidden', bot.hidden],
      ] as const) {
        expect(seats, `${zone} is not six champions`).toHaveLength(SQUAD_SIZE);

        for (const [row, capacity] of Object.entries(ROW_CAPACITY)) {
          const inRow = seats.filter((s) => s.row === row);
          expect(inRow, `${zone} ${row} holds ${inRow.length}, not ${capacity}`).toHaveLength(
            capacity,
          );
          expect(
            [...inRow.map((s) => s.index)].sort(),
            `${zone} ${row} indices are not 0…${capacity - 1}`,
          ).toEqual(Array.from({ length: capacity }, (_, i) => i));
        }

        /**
         * **A reach-1 champion in the back seat reaches nothing**, which is one of the
         * two warnings feature 006 shows a player. A bot shipping that seat would be
         * defending with five champions and one spectator.
         */
        const back = seats.find((s) => s.row === 'back')!;
        expect(getHero(back.heroId).reach, `${zone}'s back seat cannot reach`).toBe(2);
      }

      /**
       * **Twelve distinct champions, because one cannot defend both zones.** Bots are
       * saved through the players' own `PUT /v1/squads/defense/:zone`, which answers
       * `409` for a hero already on the other zone — so a reused champion is a seeding
       * failure, not an illegal squad.
       */
      const all = [...bot.visible, ...bot.hidden].map((s) => s.heroId);
      expect(new Set(all).size, 'a champion is on both of this bot’s zones').toBe(12);
    });
  }

  it('climbs in gear and crosses the Bronze floor inside stage 2', () => {
    const scores = STARTER_BOTS.map((b) => b.gearScore);

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i], `bot ${i + 1} is not geared at least as well as bot ${i}`)
        .toBeGreaterThanOrEqual(scores[i - 1]!);
    }

    // Below the grant at the bottom, above it at the top — which is what makes the
    // band filter unusable on this pool and the authored ramp the bound instead.
    expect(scores[0], 'bot 1 is not weaker than a fresh account').toBeLessThan(
      STARTER_GRANT_SCORE,
    );
    expect(scores[19], 'bot 20 is not Bronze-legal').toBeGreaterThan(STARTER_GRANT_SCORE);

    const crossing = STARTER_BOTS.find((b) => b.gearScore >= STARTER_GRANT_SCORE)!;
    expect(crossing.stage, 'the Bronze floor is not crossed inside stage 2').toBe(2);
  });

  it('keeps the whole ramp inside Bronze at the top, so graduation is not a cliff', () => {
    // A bot above the Bronze ceiling would be teaching a Silver fight to a player who
    // is about to be placed in Bronze.
    const top = STARTER_BOTS[19]!;
    expect(leagueOf(top.gearScore)).toBe('bronze');
  });
});

describe('the ramp removes the free answer, stage by stage', () => {
  it('stage 1 has exactly one type that beats every champion in the squad', () => {
    for (const bot of STARTER_BOTS.filter((b) => b.stage === 1)) {
      const answer = bot.invites;

      expect(
        weakTo(bot.visible, answer),
        `${bot.name} is stage 1 but ${answer} does not beat all six`,
      ).toBe(SQUAD_SIZE);

      // And the lesson is specific: it is *this* type, not any type.
      const total = DAMAGE_TYPES.filter((t) => weakTo(bot.visible, t) === SQUAD_SIZE);
      expect(total, `${bot.name} has more than one free answer: ${total.join(', ')}`).toEqual([
        answer,
      ]);
    }
  });

  it('stage 3 has no type that beats every champion in the squad', () => {
    for (const bot of STARTER_BOTS.filter((b) => b.stage === 3)) {
      const free = DAMAGE_TYPES.filter((t) => weakTo(bot.visible, t) === SQUAD_SIZE);
      expect(free, `${bot.name} is the graduation standard and ${free.join('/')} solves it`)
        .toEqual([]);
    }
  });

  it('no rung is solvable beyond its stage’s ceiling', () => {
    /**
     * **The assertion the first version of this file was missing, and it was missing the
     * one that mattered.** It checked only that the stage *average* coverage fell, which
     * a ramp reading 3, 3, 6 across rungs 10, 11, 12 satisfies — and that is what the
     * composer produced: the last fight before graduation was solvable 6/6 by Dark while
     * the two before it needed split damage. An average cannot see a rung.
     */
    for (const bot of STARTER_BOTS) {
      const coverage = bestAnswerCoverage(heroesOf(bot.visible));
      const ceiling = { 1: 6, 2: 5, 3: 4 }[bot.stage];
      expect(
        coverage,
        `${bot.name} is stage ${bot.stage} but one type solves ${coverage} of 6`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it('never repeats a squad within a zone', () => {
    /**
     * **Found by printing the composed ramp and reading it, not by a test.** Rung 12's
     * Visible squad was byte-identical to rung 3's — both led on `light`, both sorted the
     * three Light tanks forward, both took them — so the ramp shipped rung 3's fight
     * again with more gear on it. Three more squads repeated a fourth. The design doc
     * names this exact risk: the pool has to be *"deep enough that an authored ramp still
     * reads as a ramp rather than as the same six opponents on repeat."*
     *
     * ### Why this checks within a zone rather than across all forty
     *
     * The first version required all forty squads distinct and **that was a stronger bar
     * than either the design or the roster supports.** With 27 champions the themed pools
     * run six to nine deep, and a Hidden squad is *built to the next rung's standard* —
     * so resembling that rung's Visible squad is the design working, not failing. Worse,
     * `fire` has exactly six carriers, which makes some pairs mathematically forced.
     *
     * What actually matters is what a player *experiences*: they choose Visible squads and
     * meet them repeatedly, so those must all differ. Hidden squads are reached only by
     * ambush, so they must not repeat each other. Across the two zones, overlap is fine.
     */
    for (const zone of ['visible', 'hidden'] as const) {
      const seen = new Map<string, string>();

      for (const bot of STARTER_BOTS) {
        // Sorted, so two squads differing only in seating still count as the same six.
        const key = [...bot[zone].map((s) => s.heroId)].sort().join(',');
        const previous = seen.get(key);
        expect(
          previous,
          `${bot.name}'s ${zone} squad is the same six champions as ${previous}'s`,
        ).toBeUndefined();
        seen.set(key, bot.name);
      }
    }
  });

  it('the best available answer covers less of the squad as the ramp climbs', () => {
    /**
     * **The ramp as a number rather than as an adjective.** Difficulty here is not
     * bigger stats — it is how much of the squad one column of the matchup chart can
     * solve. That should fall, and it is the single strongest statement of what the
     * ramp is for.
     */
    const byStage = ([1, 2, 3] as const).map((stage) => {
      const bots = STARTER_BOTS.filter((b) => b.stage === stage);
      return bots.reduce((a, b) => a + bestAnswerCoverage(heroesOf(b.visible)), 0) / bots.length;
    });

    expect(byStage[0], `stage 1 should be fully solvable, averaged ${byStage[0]}`).toBe(6);
    expect(byStage[1], `stage 2 (${byStage[1]}) is not harder than stage 1`).toBeLessThan(
      byStage[0]!,
    );
    expect(byStage[2], `stage 3 (${byStage[2]}) is not harder than stage 2`).toBeLessThan(
      byStage[1]!,
    );
  });

  it('stage 3 Hidden squads resist the answer their Visible squad invited (T046)', () => {
    /**
     * The ambush tax, as arithmetic. A player who solved the Visible squad by stacking
     * `invites` meets six champions who all carry that type — where it reads ×0.50 as a
     * primary or ×0.80 as a secondary instead of ×1.50.
     */
    for (const bot of STARTER_BOTS.filter((b) => b.stage === 3)) {
      /**
       * **Two bars, because the trap's promise is about the attacker's experience rather
       * than about a roster predicate.** Requiring all six to *carry* the invited type
       * meant drawing six from a pool of seven — `air`, `water` and `earth` each have
       * exactly seven carriers — so there were only seven possible squads per theme and
       * the ramp needed two. The duplicates were unavoidable, not unlucky.
       *
       * So: **nobody is super-effectively hit** (the ×1.50 the player came for is gone
       * everywhere), and **at least half actively resist** at ×0.50 or ×0.80.
       */
      for (const seat of bot.hidden) {
        const hero = getHero(seat.heroId);
        const mult = effectiveness(bot.invites, hero);
        expect(
          mult,
          `${bot.name}'s Hidden ${hero.name} is still punished by ${bot.invites} (×${mult})`,
        ).toBeLessThanOrEqual(1.0);
      }

      const resisting = bot.hidden.filter((s) => effectiveness(bot.invites, getHero(s.heroId)) < 1);
      expect(
        resisting.length,
        `${bot.name}'s Hidden squad only has ${resisting.length} champions resisting ${bot.invites}`,
      ).toBeGreaterThanOrEqual(3);

      // And the tax is real: the same damage type went from best-in-slot to worthless.
      expect(weakTo(bot.hidden, bot.invites)).toBe(0);
    }
  });

  it('stages 1 and 2 are ambushed by the stage above, not by a trap', () => {
    // The distinction matters: for 1–12 the Hidden squad is *the next rung*, which is a
    // preview of what is coming. Only stage 3 inverts into a counter-trap.
    for (const bot of STARTER_BOTS.filter((b) => b.stage < 3)) {
      const hiddenFree = DAMAGE_TYPES.filter((t) => weakTo(bot.hidden, t) === SQUAD_SIZE);
      const visibleFree = DAMAGE_TYPES.filter((t) => weakTo(bot.visible, t) === SQUAD_SIZE);
      expect(
        hiddenFree.length,
        `${bot.name}'s Hidden squad is no harder than its Visible one`,
      ).toBeLessThanOrEqual(visibleFree.length);
    }
  });

  it('the invited answer really is counter(dominant type)', () => {
    /**
     * Guards the one derivation in `starterBots.ts` that could be silently wrong: if
     * `invites` were the theme itself rather than its counter, every assertion above
     * would still run and the ramp would teach the exact opposite lesson.
     *
     * **Checked against the carried `dominant`, not against seat order.** An earlier
     * version read `visible[0]` and broke the moment stage 3 started seating its Hidden
     * squad first — it was asserting about whoever happened to sort front-most, which
     * is a fact about `frontPriority` rather than about the ramp.
     */
    for (const bot of STARTER_BOTS) {
      expect(bot.invites, `${bot.name} invites the wrong answer for ${bot.dominant}`).toBe(
        counter(bot.dominant),
      );

      // And the dominant theme is genuinely dominant: most of the squad carries it.
      const carriers = bot.visible.filter((s) => {
        const h = getHero(s.heroId);
        return h.primary === bot.dominant || h.secondary === bot.dominant;
      });
      expect(
        carriers.length,
        `${bot.name}'s dominant type ${bot.dominant} is on only ${carriers.length} of six`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
