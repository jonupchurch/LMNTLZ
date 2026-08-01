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
import { takeSpread } from '../../src/matchmaking/candidates.js';

const byId = new Map(getAllHeroes().map((h) => [h.id, h]));
const heroesOf = (seats: readonly BotSeat[]): Hero[] => seats.map((s) => byId.get(s.heroId)!);

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
  it('never goes backwards on gear', () => {
    const all = [...STARTER_BOTS, ...LEAGUE_BOTS];
    for (let i = 1; i < all.length; i += 1) {
      expect(
        all[i]!.gearScore,
        `${all[i]!.name} (pos ${all[i]!.position}) is weaker than ${all[i - 1]!.name}`,
      ).toBeGreaterThanOrEqual(all[i - 1]!.gearScore);
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
  const KNOWN_FROZEN = 1;

  it('has exactly one duplicate pair, the frozen one', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const bot of [...STARTER_BOTS, ...LEAGUE_BOTS]) {
      for (const [zone, seats] of [
        ['visible', bot.visible],
        ['hidden', bot.hidden],
      ] as const) {
        const key = seats
          .map((s) => s.heroId)
          .sort()
          .join(',');
        const previous = seen.get(key);
        if (previous) duplicates.push(`${bot.name}/${zone} == ${previous}`);
        else seen.set(key, `${bot.name}/${zone}`);
      }
    }

    expect(duplicates, duplicates.join(' · ')).toHaveLength(KNOWN_FROZEN);
    expect(duplicates[0]).toContain('Nine Stones');
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
 * **The offered list is capped at five** (Jon, 2026-08-01), and the interesting
 * half is *which* five.
 *
 * `takeSpread` is unit-tested here rather than through `candidates()` because the
 * property that matters is about the sampling, not the database: a rating-ordered,
 * bleed-mixed list truncated from the front returns five defenders from the league
 * above and none from the player's own band.
 */
describe('capping the offered list', () => {
  it('returns everything when the pool is already at or under the cap', () => {
    expect(takeSpread([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(takeSpread([1, 2, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never returns more than the cap', () => {
    for (let n = 0; n <= 40; n += 1) {
      const pool = Array.from({ length: n }, (_, i) => i);
      expect(takeSpread(pool, OFFER_LIMIT).length).toBeLessThanOrEqual(OFFER_LIMIT);
    }
  });

  it('keeps both ends, so the easiest and hardest are always on offer', () => {
    const pool = Array.from({ length: 22 }, (_, i) => i);
    const five = takeSpread(pool, OFFER_LIMIT);

    expect(five[0]).toBe(0);
    expect(five.at(-1)).toBe(21);
  });

  /**
   * ⚠️ **The bug `slice(0, 5)` would have shipped.** The list is sorted by rating
   * descending and mixed by `bleed()`; defenders from the league above sort highest.
   * Taking the head returns only them.
   */
  it('does not collapse onto the top of the list, which would undo the bleed', () => {
    /* Twelve own-band defenders, then four bled in from above sorting highest. */
    const pool = [...Array.from({ length: 4 }, (_, i) => `above-${i}`), ...Array.from({ length: 12 }, (_, i) => `own-${i}`)];

    const head = pool.slice(0, OFFER_LIMIT);
    expect(head.filter((p) => p.startsWith('own')), 'the naive slice is fine?').toHaveLength(1);

    const spread = takeSpread(pool, OFFER_LIMIT);
    expect(
      spread.filter((p) => p.startsWith('own')).length,
      `spread offered ${spread.join(', ')}`,
    ).toBeGreaterThanOrEqual(3);
  });

  /** Deterministic, so refreshing the screen cannot reroll a softer opponent. */
  it('gives the same five for the same pool, every time', () => {
    const pool = Array.from({ length: 17 }, (_, i) => i);
    expect(takeSpread(pool, OFFER_LIMIT)).toEqual(takeSpread(pool, OFFER_LIMIT));
  });

  it('is distinct — no defender is offered twice', () => {
    for (const n of [6, 7, 9, 13, 22, 40]) {
      const five = takeSpread(Array.from({ length: n }, (_, i) => i), OFFER_LIMIT);
      expect(new Set(five).size, `pool of ${n}`).toBe(five.length);
    }
  });
});
