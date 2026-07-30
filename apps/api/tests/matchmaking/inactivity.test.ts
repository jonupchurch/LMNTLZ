/**
 * Leaving the pool, coming back, and the second mechanism that must not exist
 * (T043 · T049 · T050 · T051 · FR-012).
 *
 * ### The whole rule is one `AND` in one query, and that is the design
 *
 * A defender must have been active inside thirty days to be offered. **Applied in the
 * candidate query, never by a nightly job** — a job leaves a returning player invisible
 * until it next runs, so somebody who comes back on a Tuesday is unattackable until the
 * sweep, and nothing anywhere says so.
 *
 * The consequence tested at the bottom is the one that is easy to get wrong by being
 * helpful: **there is deliberately no rule zeroing an idle account's hold income.**
 * Leaving the pool is its own enforcement — nobody can attack a defense nobody is offered
 * — and a second mechanism is a second thing to keep in step.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { squads, squadSeats } from '../../src/db/schema/squads.js';
import { candidates, touchActivity } from '../../src/matchmaking/candidates.js';
import { INACTIVITY_DAYS } from '../../src/matchmaking/config.js';
import { stripComments } from '../stripComments.js';

const DAY_MS = 86_400_000;
const RUN = `inact-${process.pid}-${Date.now()}`;
const created: string[] = [];
let seq = 0;

/**
 * A defender with a complete Visible squad and an explicit activity timestamp.
 *
 * `idleDays` writes `player_ratings.last_activity_at` directly rather than going through
 * `touchActivity()`, because the point is to observe the *query's* window — a helper that
 * could only produce "active now" could not test the boundary at all.
 */
async function defender(label: string, idleDays: number | null): Promise<string> {
  const key = `${label}-${RUN}-${seq++}`;

  const [account] = await db()
    .insert(accounts)
    .values({
      username: `${label}${seq}`,
      usernameKey: key,
      // Backdated well past the window, so `created_at` can never be what keeps this
      // account eligible — otherwise the fallback arm would mask the column under test.
      createdAt: new Date(Date.now() - 400 * DAY_MS),
    })
    .returning();

  const id = account!.id;
  created.push(id);

  /**
   * **`null` means *no standing row*, not a null column, and the database is what said
   * so:** `last_activity_at` is `NOT NULL`, so inserting a row with an explicit null
   * fails with `23502`. That is a useful correction rather than an obstacle — it means
   * the `isNull` arm in `candidates.ts` can only ever be reached through the LEFT JOIN
   * producing nulls for a **missing** row, which is exactly the pre-010 seam it exists
   * for. There is no such thing as a standing row that has never been active.
   */
  if (idleDays !== null) {
    await db()
      .insert(playerRatings)
      .values({ accountId: id, lastActivityAt: new Date(Date.now() - idleDays * DAY_MS) });
  }

  const [squad] = await db()
    .insert(squads)
    .values({ accountId: id, kind: 'defense', zone: 'visible' })
    .returning();

  const heroes = getAllHeroes();
  await db()
    .insert(squadSeats)
    .values(
      (
        [
          { row: 'front', index: 0 },
          { row: 'front', index: 1 },
          { row: 'middle', index: 0 },
          { row: 'middle', index: 1 },
          { row: 'middle', index: 2 },
          { row: 'back', index: 0 },
        ] as const
      ).map((seat, i) => ({ squadId: squad!.id, ...seat, heroId: heroes[i]!.id })),
    );

  return id;
}

/** The attacker. Backdated past the starter week so it is an ordinary league player. */
let viewer: string;
let recent: string;
let idle: string;
let returning: string;

beforeAll(async () => {
  viewer = await defender('iView', 1);
  recent = await defender('iRecent', INACTIVITY_DAYS - 1);
  idle = await defender('iIdle', INACTIVITY_DAYS + 1);
  returning = await defender('iBack', INACTIVITY_DAYS + 10);
}, 120_000);

afterAll(async () => {
  if (created.length > 0) await db().delete(accounts).where(inArray(accounts.id, created));
  await closeDb();
}, 60_000);

describe('the thirty-day window is a clause, not a job (T043 · T049)', () => {
  it('keeps a defender idle for twenty-nine days and drops one idle for thirty-one', async () => {
    const ids = (await candidates(viewer)).candidates.map((c) => c.playerId);

    /**
     * **Asserted as a pair in one read, because the boundary is the claim.** Either half
     * alone is satisfied by a broken window — "the idle one is absent" passes on an empty
     * pool, and "the recent one is present" passes on no filter at all.
     */
    expect(ids, `a defender idle ${INACTIVITY_DAYS - 1} days was dropped`).toContain(recent);
    expect(ids, `a defender idle ${INACTIVITY_DAYS + 1} days was still offered`).not.toContain(
      idle,
    );
  });

  it('re-enters the pool on the next request, with nothing run in between', async () => {
    const before = (await candidates(viewer)).candidates.map((c) => c.playerId);
    expect(before, 'the fixture was not actually out of the pool').not.toContain(returning);

    await touchActivity(returning);

    /**
     * **No job, no sweep, no cache invalidation — the very next query sees it.** This is
     * the property the clause buys and a nightly job cannot: a player who returns is
     * attackable immediately rather than at whatever hour the sweep runs.
     */
    const after = (await candidates(viewer)).candidates.map((c) => c.playerId);
    expect(after, 'a returning player is still invisible').toContain(returning);
  });

  it('treats a defender who has never been active as new rather than idle', async () => {
    /**
     * The seam, stated as behaviour. Pre-010 nothing writes `last_activity_at`, so a
     * missing row falls back to `created_at` — and this fixture is 400 days old, so it
     * must be **out**. An implementation that treated null as "always eligible" would
     * pass every other test in this file.
     */
    const never = await defender('iNever', null);
    const ids = (await candidates(viewer)).candidates.map((c) => c.playerId);

    expect(ids, 'an account with no activity row and no recent signup was offered').not.toContain(
      never,
    );
  });
});

describe('activity is a battle or a squad edit — never a bare login (T050 · T051)', () => {
  /**
   * ### Two structural claims, because neither can be observed behaviourally
   *
   * "A login does not count" cannot be tested by logging in and checking nothing moved —
   * that passes if the whole mechanism is broken. What it means is that **the auth code
   * does not call the writer**, which is a fact about the source.
   *
   * Same for T051: "add no rule zeroing an idle account's hold income" is an instruction
   * *not* to write something, and the only way to check it is to look.
   */
  const read = async (path: string) => {
    const raw = await readFile(new URL(path, import.meta.url), 'utf8');
    /**
     * **The strip-check is inside `stripComments`, not repeated here.** This file
     * had its own copy with its own threshold (20% of the original), and four
     * such copies existed across the suite with four different numbers. See
     * `tests/stripComments.ts` for why a ratio was the wrong instrument and what
     * replaced it — this file's careful `(^|[^:])` line-comment pattern is the
     * one that survived into the shared helper.
     */
    return stripComments(raw, path);
  };

  it('never touches activity from the auth module', async () => {
    for (const file of ['../../src/auth/routes.ts', '../../src/auth/tokens.ts']) {
      const src = await read(file);
      expect(src, `${file} marks a bare login as activity`).not.toContain('touchActivity');
    }
  });

  it('applies the window in exactly one place', async () => {
    /**
     * `INACTIVITY_DAYS` defines it and `candidates.ts` applies it. **A third reader would
     * be a second definition of "idle"** — and the two would drift, which for this
     * constant means one part of the game thinking a player is present while another
     * thinks they are gone.
     */
    const candidatesSrc = await read('../../src/matchmaking/candidates.ts');
    expect(candidatesSrc).toContain('INACTIVITY_DAYS');

    for (const file of [
      '../../src/matchmaking/standing.ts',
      '../../src/matchmaking/starterLeague.ts',
      '../../src/matchmaking/bleed.ts',
      '../../src/matchmaking/bots.ts',
    ]) {
      const src = await read(file);
      expect(src, `${file} applies the inactivity window a second time`).not.toContain(
        'INACTIVITY_DAYS',
      );
    }
  });

  it('has no second mechanism penalising an idle account (T051)', async () => {
    /**
     * There is no hold income yet — feature 010 owns the wallet — so what this guards is
     * the *shape* of the eventual implementation: nothing in matchmaking may carry a
     * concept of docking, zeroing or suspending an idle account's earnings. Leaving the
     * pool is the enforcement.
     */
    for (const file of [
      '../../src/matchmaking/candidates.ts',
      '../../src/matchmaking/standing.ts',
      '../../src/matchmaking/config.ts',
    ]) {
      const src = await read(file);
      for (const forbidden of ['holdIncome', 'zeroIncome', 'suspendIncome', 'forfeitHold']) {
        expect(src, `${file} adds a second idle penalty: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('a bot is never idle, however long it sits (T049)', () => {
  it('offers a bot whose account predates the window by a year', async () => {
    /**
     * **The arm that would have broken the entire bot layer silently.** A bot has no
     * activity row and never will — nothing signs into one — so without an explicit
     * `is_bot` arm it falls through to `created_at`, and every authored bot drops out of
     * every pool thirty days after seeding. No error, no log: the leagues would simply
     * empty a month after launch.
     */
    const [bot] = await db()
      .insert(accounts)
      .values({
        username: `iBot${seq++}`,
        usernameKey: `ibot-${RUN}-${seq}`,
        createdAt: new Date(Date.now() - 400 * DAY_MS),
        isBot: true,
        botBand: 'bronze',
      })
      .returning();

    created.push(bot!.id);

    const [squad] = await db()
      .insert(squads)
      .values({ accountId: bot!.id, kind: 'defense', zone: 'visible' })
      .returning();

    const heroes = getAllHeroes();
    await db()
      .insert(squadSeats)
      .values(
        (
          [
            { row: 'front', index: 0 },
            { row: 'front', index: 1 },
            { row: 'middle', index: 0 },
            { row: 'middle', index: 1 },
            { row: 'middle', index: 2 },
            { row: 'back', index: 0 },
          ] as const
        ).map((seat, i) => ({ squadId: squad!.id, ...seat, heroId: heroes[i]!.id })),
      );

    const ids = (await candidates(viewer)).candidates.map((c) => c.playerId);
    expect(ids, 'a 400-day-old bot with no activity row fell out of the pool').toContain(bot!.id);

    // And it is genuinely marked, so a caller can exclude bots from an aggregate.
    const [row] = await db()
      .select({ isBot: accounts.isBot })
      .from(accounts)
      .where(and(eq(accounts.id, bot!.id), eq(accounts.isBot, true)));
    expect(row?.isBot).toBe(true);
  });
});
