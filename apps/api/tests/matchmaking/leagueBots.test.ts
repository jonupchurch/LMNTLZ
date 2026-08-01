/**
 * The twenty-four authored opponents above the starter league.
 *
 * ### TL;DR
 *
 * Every league except Bronze had **no bots at all**, so anybody past Bronze fought
 * the same handful of real accounts forever. These are the opponents that fill
 * Silver, Gold, Platinum and Diamond, and this file checks the properties that
 * cannot be eyeballed: every league clears the pool floor, gear never goes
 * backwards, and no two squads are the same six champions.
 *
 * ### Composition only — nothing here touches the database
 *
 * `LEAGUE_BOTS` is content, derived from an authored ramp the way `STARTER_BOTS`
 * is. Seeding is a separate concern with a separate test, and keeping them apart is
 * what lets this run in milliseconds against the real roster.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, type Hero } from '@lmntlz/content';
import { validateUsername } from '../../src/auth/username.js';
import { LEAGUE_BOTS } from '../../src/matchmaking/leagueBots.js';
import { bestAnswerCoverage, STARTER_BOTS, type BotSeat } from '../../src/matchmaking/starterBots.js';
import { LEAGUE_NAMES, leagueOf } from '../../src/matchmaking/league.js';
import { MIN_POOL, OFFER_LIMIT } from '../../src/matchmaking/config.js';
import { drawOffers } from '../../src/matchmaking/candidates.js';

const byId = new Map(getAllHeroes().map((h) => [h.id, h]));
const heroesOf = (seats: readonly BotSeat[]): Hero[] => seats.map((s) => byId.get(s.heroId)!);

/**
 * Both ramps as one list, with the starter twenty carrying their band explicitly.
 *
 * `StarterBot` has no `band` field — every one of them is `'starter'`, written by
 * `seedStarterBots` rather than stored on the content — so it is supplied here. That
 * band is not cosmetic: it is what the nursery clause keys on to keep the beginner ramp
 * out of every ordinary pool.
 */
const everyBot = () => [
  ...STARTER_BOTS.map((b) => ({ ...b, band: 'starter' as const })),
  ...LEAGUE_BOTS,
];

describe('every league has opponents', () => {
  /**
   * **The bug this whole file exists for.** `runes × COMPLETE_RUNE_SCORE` tops out
   * at 2,375 for the starter ramp and Silver's floor is 2,500 — so four of the five
   * leagues were empty, `candidates()` fell below `MIN_POOL`, and matchmaking
   * widened, which `config.ts` calls breaking a published promise.
   */
  it('clears MIN_POOL in every league, on authored bots alone', () => {
    const perLeague = new Map(LEAGUE_NAMES.map((n) => [n, 0]));
    for (const bot of [...STARTER_BOTS, ...LEAGUE_BOTS]) {
      const l = leagueOf(bot.gearScore);
      perLeague.set(l, perLeague.get(l)! + 1);
    }

    for (const league of LEAGUE_NAMES) {
      expect(
        perLeague.get(league),
        `${league} has ${perLeague.get(league)} authored bots, below MIN_POOL of ${MIN_POOL} — matchmaking will widen`,
      ).toBeGreaterThanOrEqual(MIN_POOL);
    }
  });

  it('puts each bot in the league its own band claims', () => {
    /* `band` is a label and `gearScore` is the arithmetic the game actually reads.
       A disagreement would seed a Diamond-labelled bot into Gold's pool. */
    for (const bot of LEAGUE_BOTS) {
      expect(leagueOf(bot.gearScore), `${bot.name} claims ${bot.band}`).toBe(bot.band);
    }
  });
});

describe('the ramp is progressive', () => {
  /**
   * ⚠️ **Per band, not across the whole list, and the change is a correction.**
   *
   * This used to walk `[...STARTER_BOTS, ...LEAGUE_BOTS]` as one sequence. That held
   * only while the league ramp was a single hand-authored run starting above Bronze —
   * it was reading a property of the *file order*, not of the difficulty curve.
   *
   * The ramps are **parallel ladders, not one sequence**: the starter twenty are the
   * nursery, reserved by `band: 'starter'` and excluded from every ordinary pool, and
   * they already climb to 19 runes against Bronze's own ceiling of 19. A Bronze bot
   * cannot be authored "above" them without leaving a one-value window. What a player
   * actually experiences is their own band's spread, and that is what is asserted.
   */
  it('never goes backwards on gear inside a band, within one authoring run', () => {
    /**
     * **Scoped to a band AND a run, because there are now three runs.** The starter
     * twenty, the authored twenty-four and the generated hundred are each written
     * ascending, and each restarts at its band's floor — so a band holds two ascending
     * sequences rather than one. What this guards is an authoring slip inside a run: a
     * hand-typed rune count lower than the line above it.
     */
    const runOf = (position: number) =>
      position <= STARTER_BOTS.length ? 'starter' : position <= 44 ? 'authored' : 'generated';

    const groups = new Map<string, Array<{ name: string; position: number; gearScore: number }>>();
    for (const bot of everyBot()) {
      const key = `${bot.band}/${runOf(bot.position)}`;
      groups.set(key, [...(groups.get(key) ?? []), bot]);
    }

    for (const [group, bots] of groups) {
      for (let i = 1; i < bots.length; i += 1) {
        expect(
          bots[i]!.gearScore,
          `${group}: ${bots[i]!.name} (pos ${bots[i]!.position}) is weaker than ${bots[i - 1]!.name}`,
        ).toBeGreaterThanOrEqual(bots[i - 1]!.gearScore);
      }
    }
  });

  it('spreads every band across its own gear range rather than bunching', () => {
    /* A band whose bots all share one gear score offers no range to climb through. */
    for (const band of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
      const scores = new Set(
        LEAGUE_BOTS.filter((b) => b.band === band).map((b) => b.gearScore),
      );
      expect(scores.size, `${band} offers ${scores.size} distinct gear scores`).toBeGreaterThan(3);
    }
  });

  it('continues the starter ramp rather than restarting the numbering', () => {
    expect(LEAGUE_BOTS[0]!.position).toBe(STARTER_BOTS.length + 1);
    expect(LEAGUE_BOTS.at(-1)!.position).toBe(STARTER_BOTS.length + LEAGUE_BOTS.length);
  });

  /**
   * **Coverage cannot go below 3 and that is arithmetic, not tuning.**
   * `DOMINANT_SEATS = 3`, so three of the six always carry the lead theme and
   * `counter(lead)` is super-effective against all three by construction. The first
   * draft asked for 2 across Diamond; `select` does not fail on an impossible
   * ceiling, it silently returns the best it can — so six "hardest in the game"
   * squads came out identical in shape to Gold's. This pins the floor so nobody
   * asks for 2 again and believes they got it.
   */
  it('holds every squad to at most 4 answers, and never claims better than 3', () => {
    for (const bot of LEAGUE_BOTS) {
      const cov = bestAnswerCoverage(heroesOf(bot.visible));
      expect(cov, `${bot.name} visible`).toBeLessThanOrEqual(4);
      expect(cov, `${bot.name} visible — 3 is the composable floor`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('what the seeder would otherwise discover at write time', () => {
  /**
   * ⚠️ **This failed for real.** `The Answered Question` derives
   * `Answered_Question`, 17 characters against a 16-character cap — and it was
   * found by the seeder's own guard **mid-run**, after twenty bots had already been
   * written to the live database. A squad name is not a username; the derivation
   * between them is exactly where that gets forgotten.
   */
  it('gives every bot a player-legal username', () => {
    for (const bot of LEAGUE_BOTS) {
      expect(
        validateUsername(bot.username),
        `${bot.name} → "${bot.username}" (${bot.username.length} chars)`,
      ).toBeNull();
    }
  });

  it('never reuses a username, within this ramp or against the starter ramp', () => {
    const all = [...STARTER_BOTS, ...LEAGUE_BOTS].map((b) => b.username.toLowerCase());
    expect(new Set(all).size, 'two bots share a username').toBe(all.length);
  });
});

describe('no squad is a repeat of another squad', () => {
  /**
   * A bot whose six are another bot's six is the same fight with a different name,
   * and the ramp shipped exactly that twice before this check existed: `The Shut
   * Gate`'s Hidden six was `The Slow Tide`'s Visible six, so the final ambush of
   * Diamond was the fourth fight a new player ever takes.
   *
   * ### ⚠️ One pre-existing collision is asserted as PRESENT, deliberately
   *
   * `The Nine Stones`' Hidden six and `The Windward Gate`'s Visible six are the same
   * squad, and both bots are seeded in production. `battle_records` stores squad
   * composition and Constitution XVI makes it permanent, so recomposing either would
   * leave recorded battles describing a squad that no longer exists. It is a known,
   * frozen defect — pinned here so that fixing it becomes a deliberate act rather
   * than an accident, and so this test does not simply fail forever.
   */
  const squadKey = (seats: readonly BotSeat[]): string =>
    seats
      .map((s) => s.heroId)
      .sort()
      .join(',');

  const everySquad = () =>
    [...STARTER_BOTS, ...LEAGUE_BOTS].flatMap((bot) => [
      { bot, zone: 'visible' as const, key: squadKey(bot.visible) },
      { bot, zone: 'hidden' as const, key: squadKey(bot.hidden) },
    ]);

  /**
   * ⚠️ **The roster cannot supply a distinct squad per bot, and that is arithmetic.**
   *
   * `DOMINANT_SEATS = 3` with exactly three champions per type means the lead theme
   * *fixes* three seats, so a composed squad is a function of `(lead, {second, third})`
   * — **9 × C(8,2) = 252 squads in the entire game.** 144 bots need 288. The pigeonhole
   * is not close: repeats are mandatory above 126 bots.
   *
   * So the rule that survives is the one a player can actually perceive. **Inside a
   * band, two identical Visible sixes are the same fight offered twice** and that is
   * forbidden. Across bands it is not: the same six at 12 runes and at 81 runes differ
   * by 6.75× gear, which is a different fight by the widest margin the game has.
   */
  it('never offers the same Visible six twice inside one band', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const bot of everyBot()) {
      const key = `${bot.band}:${squadKey(bot.visible)}`;
      const previous = seen.get(key);
      if (previous) collisions.push(`${bot.band}: ${bot.name} == ${previous}`);
      else seen.set(key, bot.name);
    }

    expect(collisions, collisions.join(' · ')).toEqual([]);
  });

  /**
   * The global count is **pinned rather than forbidden**, so the number cannot drift
   * upward unnoticed while nobody is looking at it.
   *
   * ### One of them is frozen and is asserted as PRESENT
   *
   * `The Nine Stones`' Hidden six and `The Windward Gate`'s Visible six are the same
   * squad, and both bots are seeded. `battle_records` stores composition and
   * Constitution XVI makes it permanent, so recomposing either would leave recorded
   * battles describing a squad that no longer exists.
   */
  const KNOWN_REPEATS = 11;

  it('holds the total number of repeated squads to a pinned figure', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const { bot, zone, key } of everySquad()) {
      const previous = seen.get(key);
      if (previous) duplicates.push(`${bot.name}/${zone} == ${previous}`);
      else seen.set(key, `${bot.name}/${zone}`);
    }

    expect(duplicates, duplicates.join(' · ')).toHaveLength(KNOWN_REPEATS);
    expect(duplicates.join(' · '), 'the frozen pair is gone').toContain('Nine Stones');
  });

  it('gives every bot twelve distinct champions across its two zones', () => {
    /* The zones cannot share a champion — `PUT /squads/defense/:zone` answers 409 —
       so an overlap is a seeding failure rather than an illegal squad. */
    for (const bot of LEAGUE_BOTS) {
      const ids = new Set([...bot.visible, ...bot.hidden].map((s) => s.heroId));
      expect(ids.size, `${bot.name} seats a champion in both zones`).toBe(12);
    }
  });
});

/**
 * **Five, drawn at random from the pool** (Jon, 2026-08-01).
 *
 * > *"randomly chosen from the pool. It should not surface the same opponents over
 * > and over."*
 *
 * ⚠️ **This block previously asserted the exact opposite** — *"gives the same five for
 * the same pool, every time"*, with a comment explaining that determinism was what
 * stopped a player rerolling for a soft opponent. That is a reversed decision, not a
 * bug, and it is recorded here rather than quietly deleted: the reroll is now possible
 * and was judged an acceptable price for variety.
 *
 * `drawOffers` is unit-tested rather than driven through `candidates()` because the
 * properties are about the sampling, not the database — and with an injected `random`
 * they can be exact instead of statistical.
 */
describe('drawing the offered five', () => {
  /** A generator cycling fixed values, so a draw is reproducible without being trivial. */
  const rng = (...values: number[]): (() => number) => {
    let i = 0;
    return () => values[i++ % values.length]!;
  };

  const pool = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

  it('returns everything when the pool is already at or under the cap', () => {
    expect(drawOffers([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(drawOffers([1, 2, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never returns more than the cap, and never a duplicate', () => {
    for (let n = 0; n <= 40; n += 1) {
      const five = drawOffers(pool(n), OFFER_LIMIT);
      expect(five.length, `pool of ${n}`).toBeLessThanOrEqual(OFFER_LIMIT);
      expect(new Set(five).size, `pool of ${n} offered a duplicate`).toBe(five.length);
    }
  });

  /**
   * **Membership is random; sequence is not.** The contract promises rating order, and
   * a randomly *ordered* rail would jump around between draws even when it offered the
   * same people.
   */
  it('returns the draw in the pool’s own order', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const five = drawOffers(pool(30), OFFER_LIMIT);
      expect([...five], 'the offered five came back out of rating order').toEqual(
        [...five].sort((a, b) => a - b),
      );
    }
  });

  /**
   * The requirement, stated as a property: **the same pool must not keep producing the
   * same five.** Sixty draws from a pool of thirty; a deterministic sampler yields one
   * distinct result and fails here.
   */
  it('does not surface the same five over and over', () => {
    const seen = new Set(
      Array.from({ length: 60 }, () => drawOffers(pool(30), OFFER_LIMIT).join(',')),
    );

    expect(seen.size, 'sixty draws produced one lineup — the draw is not random').toBeGreaterThan(
      10,
    );
  });

  /** And every defender in the pool is genuinely reachable, not just a lucky subset. */
  it('can reach every defender in the pool', () => {
    const reached = new Set<number>();
    for (let i = 0; i < 400; i += 1) for (const p of drawOffers(pool(22), OFFER_LIMIT)) reached.add(p);

    expect(reached.size, `only ${reached.size} of 22 were ever offered`).toBe(22);
  });

  /**
   * ⚠️ **The bug `slice(0, 5)` would have shipped.** The list is sorted by rating
   * descending and mixed by `bleed()`; defenders from the league above sort highest,
   * so taking the head returns only them. A uniform draw samples the pool in the
   * pool's own proportions, which is exactly the bleed mix.
   */
  it('does not collapse onto the top of the list, which would undo the bleed', () => {
    const mixed = [
      ...Array.from({ length: 4 }, (_, i) => `above-${i}`),
      ...Array.from({ length: 12 }, (_, i) => `own-${i}`),
    ];

    const head = mixed.slice(0, OFFER_LIMIT);
    expect(head.filter((p) => p.startsWith('own')), 'the naive slice is fine?').toHaveLength(1);

    /* Averaged over many draws the own-band share tracks the pool's 12/16, and the
       assertion is deliberately loose — this is a claim about proportion, not luck. */
    let own = 0;
    const draws = 200;
    for (let i = 0; i < draws; i += 1) {
      own += drawOffers(mixed, OFFER_LIMIT).filter((p) => p.startsWith('own')).length;
    }

    expect(own / draws, 'the draw is biased toward the league above').toBeGreaterThan(3);
  });

  /** Reproducible given its randomness, which is what makes the above testable at all. */
  it('is a pure function of the pool and the numbers it is handed', () => {
    const a = drawOffers(pool(17), OFFER_LIMIT, rng(0.1, 0.9, 0.4, 0.6, 0.25));
    const b = drawOffers(pool(17), OFFER_LIMIT, rng(0.1, 0.9, 0.4, 0.6, 0.25));

    expect(a).toEqual(b);
  });
});
