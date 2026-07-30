/**
 * What a finished battle records about the matchup (009 T055 · FR-013, SC-008).
 *
 * ### This is the one thing in the project that cannot be fixed afterwards
 *
 * Constitution XVI: the past is immutable and some records cannot be backfilled.
 * `battle_records` carries `defender_is_bot`, both leagues and both ratings precisely so a
 * balance question can be asked years later — and **for two features every one of those
 * five columns was written as a constant.** `record.ts` wrote `null` into the four league
 * and rating columns because 009 had not shipped, and `create.ts` hard-coded
 * `defenderIsBot: false` because no bot existed.
 *
 * Both were true when written. Neither is true now, and neither can be repaired for the
 * battles already recorded. So this file exists to make the *next* silent constant fail a
 * test instead of quietly filling a permanent table with a plausible wrong answer.
 *
 * **`defenderIsBot` is not cosmetic.** 008's `commitments.test.ts` measured the Visible
 * hold rate at **40% human-only and 60% with bots counted** — the flag changes the answer
 * to the question the table exists for.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battles } from '../../src/db/schema/battles.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { playerRatings, STARTING_RATING } from '../../src/db/schema/ratings.js';
import { squads, squadSeats, squadMemberConfig } from '../../src/db/schema/squads.js';
import {
  LEAGUE_NAMES,
  STARTER_GRANT_SCORE,
  bandOf,
  leagueOf,
} from '../../src/matchmaking/league.js';
import { arena, formation, start, fightToTheEnd, type Arena } from '../battle/live.js';

const DAY_MS = 86_400_000;
let a: Arena;
const extra: string[] = [];

beforeAll(async () => {
  a = await arena('rec');
}, 180_000);

afterAll(async () => {
  if (extra.length > 0) await db().delete(accounts).where(inArray(accounts.id, extra));
  await a.close();
  await closeDb();
}, 120_000);

/** A bot defender with a Visible squad, so a real battle can be fought against one. */
async function botDefender(gear: number): Promise<string> {
  const [account] = await db()
    .insert(accounts)
    .values({
      username: `RecBot${extra.length}`,
      usernameKey: `recbot-${process.pid}-${Date.now()}-${extra.length}`,
      createdAt: new Date(Date.now() - 30 * DAY_MS),
      isBot: true,
      // Bronze rather than starter: the starter band is reserved and unfarmable by
      // design, so a starter bot could not be attacked by this arena's attacker.
      botBand: 'bronze',
    })
    .returning();

  const id = account!.id;
  extra.push(id);

  await db().insert(playerRatings).values({ accountId: id, gearScore: gear });

  const heroes = getAllHeroes().map((h) => h.id);
  for (const zone of ['visible', 'hidden'] as const) {
    const [squad] = await db()
      .insert(squads)
      .values({ accountId: id, kind: 'defense', zone })
      .returning();

    // Distinct halves of the roster, because one champion cannot defend both zones.
    const six = zone === 'visible' ? heroes.slice(0, 6) : heroes.slice(6, 12);
    const seats = formation(six, true);

    await db()
      .insert(squadSeats)
      .values(seats.map((s) => ({ squadId: squad!.id, row: s.row, index: s.index, heroId: s.heroId })));

    await db()
      .insert(squadMemberConfig)
      .values(
        seats.map((s) => ({
          squadId: squad!.id,
          heroId: s.heroId,
          targetPrimary: s.config!.targeting[0],
          targetFallback: s.config!.targeting[1],
          allyRule: s.config!.allyRule ?? null,
          powerRanking: s.config!.ranking.join('.'),
        })),
      );
  }

  return id;
}

describe('the permanent record carries the matchup, not placeholders (T055)', () => {
  it('writes both leagues and both ratings, and never null', async () => {
    const started = await start(a);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect(record, 'the battle recorded nothing at all').toBeDefined();

    /**
     * **Asserted as "not null" *and* as a legal value.** A sentinel would satisfy the
     * first check and be indistinguishable from a real reading afterwards — which is the
     * exact reason the columns were left null rather than defaulted in the first place.
     */
    expect(record!.attackerLeague, 'attacker league is still null').not.toBeNull();
    expect(record!.defenderLeague, 'defender league is still null').not.toBeNull();
    expect(LEAGUE_NAMES).toContain(record!.attackerLeague);
    expect(LEAGUE_NAMES).toContain(record!.defenderLeague);

    expect(record!.attackerRating, 'attacker rating is still null').not.toBeNull();
    expect(record!.defenderRating, 'defender rating is still null').not.toBeNull();
    expect(record!.attackerRating).toBe(STARTING_RATING);
    expect(record!.defenderRating).toBe(STARTING_RATING);

    // Pre-010 everybody sits on the gear seam, so both sides must be Bronze — which is
    // also the check that these are derived rather than copied from one another's side.
    expect(record!.attackerLeague).toBe(leagueOf(STARTER_GRANT_SCORE));
  });

  it('reads the league from each side rather than recording one twice', async () => {
    /**
     * **The mistake this catches is a copy-paste, and it would be invisible.** Writing
     * `attackerLeague` into both columns produces a record that looks entirely sensible —
     * two leagues, both legal, both non-null — and destroys the only question the columns
     * exist to answer, which is always about the *gap*.
     */
    const silver = await botDefender(bandOf('silver').floor + 100);

    const started = await start(a, silver);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect(record!.attackerLeague, 'the attacker is not on the gear seam').toBe('bronze');
    expect(record!.defenderLeague, 'the defender’s own league was not recorded').toBe('silver');
  });

  it('marks a bot defender as a bot', async () => {
    /**
     * `create.ts` hard-coded this `false` for two features, correctly — there were no
     * bots. There are twenty now, and a battle against one recorded as a battle against a
     * player is a permanently wrong row in the table every balance question reads.
     */
    const bot = await botDefender(STARTER_GRANT_SCORE + 200);

    const started = await start(a, bot);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect(record!.defenderIsBot, 'a battle against a bot was recorded as a player battle').toBe(
      true,
    );

    // And on the working row too, since that is where the flag is captured.
    const [row] = await db()
      .select({ isBot: battles.defenderIsBot })
      .from(battles)
      .where(eq(battles.id, started.battleId));
    expect(row?.isBot).toBe(true);
  });

  it('still marks a human defender as human', async () => {
    /**
     * The other half, and it is not redundant: `defenderIsBot: true` unconditionally would
     * pass every assertion above. A flag that is always set is as useless as one that is
     * never set, and rather harder to notice.
     */
    const started = await start(a);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect(record!.defenderIsBot, 'a human defender was recorded as a bot').toBe(false);
  });

  it('captures the standing at creation, not at settlement', async () => {
    /**
     * **A battle can stay open for hours, and placing a rune can move a player across a
     * threshold.** Reading the league when the battle *ends* would record the band the
     * player finished in rather than the one the matchmaking decision was made in, and the
     * record's whole purpose is to explain the matchup that was offered.
     *
     * Checked by moving the defender's gear after the battle starts and before it settles:
     * the record must show the old league.
     */
    const mover = await botDefender(STARTER_GRANT_SCORE + 300);

    const started = await start(a, mover);
    a.createdBattles.push(started.battleId);

    // Mid-battle: the defender crosses into Gold.
    await db()
      .update(playerRatings)
      .set({ gearScore: bandOf('gold').floor + 100 })
      .where(eq(playerRatings.accountId, mover));

    await fightToTheEnd(a, started);

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect(
      record!.defenderLeague,
      'the league was read at settlement, so a mid-battle rune rewrote history',
    ).toBe('bronze');
  });
});

describe('a settled battle marks both sides active', () => {
  it('stamps the attacker and the defender, not only the caller', async () => {
    /**
     * ### Why both, and why this is not symmetry for its own sake
     *
     * `candidates.ts` requires activity inside thirty days to be offered as a
     * defender, and `touchActivity()` shipped with **no caller at all** — every
     * account would have aged out of every pool a month after signing up, silently.
     * The defense save closed one half; this is the other.
     *
     * Stamping the **defender** is the half that is easy to leave out and matters
     * most: they did not make the request. But a player who is being attacked is
     * demonstrably in somebody's pool and their squad is demonstrably worth
     * attacking — dropping them out of everyone else's pool because they had not
     * personally logged in would thin the population for no reason.
     */
    const bot = await botDefender(STARTER_GRANT_SCORE + 400);

    // Cleared first, so a stamp found afterwards was written by this battle.
    await db()
      .update(playerRatings)
      .set({ lastActivityAt: new Date(Date.now() - 200 * DAY_MS) })
      .where(inArray(playerRatings.accountId, [a.attacker.accountId, bot]));

    const started = await start(a, bot);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const rows = await db()
      .select({ id: playerRatings.accountId, at: playerRatings.lastActivityAt })
      .from(playerRatings)
      .where(inArray(playerRatings.accountId, [a.attacker.accountId, bot]));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(
        Date.now() - row.at.getTime(),
        `${row.id === bot ? 'the defender' : 'the attacker'} was not marked active`,
      ).toBeLessThan(120_000);
    }
  });
});

describe('the working row and the record agree', () => {
  it('copies all five values through settlement unchanged', async () => {
    /**
     * `insertRecord` is forbidden a second `SELECT` — that rule is what stops the record
     * disagreeing with the settlement describing it — so these five arrive through the
     * concluding `UPDATE`'s `RETURNING`. **A field added to `battles` and forgotten in the
     * `RETURNING` list is silently null in the record**, which is how the four league
     * columns spent two features.
     */
    const started = await start(a);
    a.createdBattles.push(started.battleId);
    await fightToTheEnd(a, started);

    const [row] = await db()
      .select({
        isBot: battles.defenderIsBot,
        al: battles.attackerLeague,
        dl: battles.defenderLeague,
        ar: battles.attackerRating,
        dr: battles.defenderRating,
      })
      .from(battles)
      .where(eq(battles.id, started.battleId));

    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId));

    expect({
      isBot: record!.defenderIsBot,
      al: record!.attackerLeague,
      dl: record!.defenderLeague,
      ar: record!.attackerRating,
      dr: record!.defenderRating,
    }).toEqual(row);
  });

  it('leaves no legacy column pretending to hold the answer', async () => {
    /**
     * `battles.league_at_battle` and `rating_at_battle` are the superseded single columns —
     * they cannot say *whose*. They are kept because dropping two empty nullable columns
     * buys nothing, and they must stay empty: a half-populated pair is worse than an empty
     * one, because a query would find data and trust it.
     */
    const rows = await db()
      .select({ league: battles.leagueAtBattle, rating: battles.ratingAtBattle })
      .from(battles)
      .where(and(inArray(battles.id, a.createdBattles)));

    for (const row of rows) {
      expect(row.league, 'the superseded league column was written to').toBeNull();
      expect(row.rating, 'the superseded rating column was written to').toBeNull();
    }
  });
});
