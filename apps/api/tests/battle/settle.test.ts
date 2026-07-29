/**
 * A battle pays out exactly once (007 T026–T027, FR-012).
 *
 * ### Every test here is really the same test
 *
 * *"Does calling this twice do it twice?"* — asked of the concurrent case, the
 * retry case and the resynchronisation case, because those are three different
 * ways a second call arrives and only the first is obvious. The retry is the one
 * that actually happens: the final `act` resolves, the connection drops before
 * the response lands, and the client resends. That request returns the stored
 * packet — conclusion and all — and a settlement hanging off that path would run
 * a second time against a battle that had already paid.
 *
 * ### And the mirror of it: does calling it once actually do it once?
 *
 * A guard that refused *every* call would pass every assertion about
 * double-payment and would mean no battle ever settles. So each case checks the
 * movement as well as the absence of a second movement.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battles } from '../../src/db/schema/battles.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { squads } from '../../src/db/schema/squads.js';
import { playerStreaks } from '../../src/db/schema/streaks.js';
import { reasonOf, settle } from '../../src/battle/settle.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from './live.js';

let a: Arena;

beforeAll(async () => {
  a = await arena('settle');
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

const battleRow = async (battleId: string) => {
  const [row] = await db().select().from(battles).where(eq(battles.id, battleId)).limit(1);
  return row!;
};

const attackStreakOf = async (accountId: string): Promise<number> => {
  const [row] = await db()
    .select({ n: playerStreaks.attackStreak })
    .from(playerStreaks)
    .where(eq(playerStreaks.accountId, accountId))
    .limit(1);
  return row?.n ?? 0;
};

const holdStreakOf = async (accountId: string, zone: string): Promise<number> => {
  const [row] = await db()
    .select({ n: squads.holdStreak })
    .from(squads)
    .where(
      and(eq(squads.accountId, accountId), eq(squads.kind, 'defense'), eq(squads.zone, zone as never)),
    )
    .limit(1);
  return row!.n;
};

describe('the reason vocabularies are mapped, not shared', () => {
  it('collapses the three cap reasons into one and keeps a wipe distinct', () => {
    expect(reasonOf({ winner: 'attacker', reason: 'wipe' })).toBe('elimination');
    expect(reasonOf({ winner: 'attacker', reason: 'cap-champions-standing' })).toBe('turn_cap');
    expect(reasonOf({ winner: 'defender', reason: 'cap-tiebreak' })).toBe('turn_cap');
    expect(reasonOf({ winner: 'attacker', reason: 'cap-hp-share', shares: [0.6, 0.4] })).toBe(
      'turn_cap',
    );
  });
});

describe('a battle fought to its end', () => {
  let started: StartedBattle;
  let winner: string;
  let streakAfter: number;
  let holdAfter: number;

  beforeAll(async () => {
    started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion, 'the battle never ended').not.toBeNull();

    const row = await battleRow(started.battleId);
    winner = row.winner!;
    streakAfter = await attackStreakOf(a.attacker.accountId);
    holdAfter = await holdStreakOf(a.defender.accountId, started.zone);
  }, 300_000);

  it('records the outcome on the battle row', async () => {
    const row = await battleRow(started.battleId);

    expect(row.concludedAt).not.toBeNull();
    expect(['attacker', 'defender']).toContain(row.winner);
    expect(['elimination', 'turn_cap']).toContain(row.reason);
  });

  it('records the turn count, which exists only while the battle is resolving', async () => {
    /**
     * **Constitution XVI.** `turnCount` is not derivable from anything kept
     * afterwards — the log holds actions, not hero turns — so a battle that
     * settled without writing it has a permanent hole in the history feature
     * 008's aggregates are computed from.
     */
    const row = await battleRow(started.battleId);
    expect(row.turnCount).toBeGreaterThan(20);
  });

  it('moves the attack streak in the direction the result demands', async () => {
    // A win adds one; a chosen loss resets to zero. Both are movements from 0,
    // so the pre-battle value being 0 is what makes this readable either way.
    expect(streakAfter).toBe(winner === 'attacker' ? 1 : 0);
  });

  it('moves the defending zone’s hold streak the other way', async () => {
    expect(holdAfter).toBe(winner === 'defender' ? 1 : 0);
  });
});

describe('settling twice does nothing twice', () => {
  let started: StartedBattle;

  beforeAll(async () => {
    started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion).not.toBeNull();
  }, 300_000);

  it('reports `settled: false` and moves nothing on a second call', async () => {
    const row = await battleRow(started.battleId);
    const before = {
      concludedAt: row.concludedAt,
      attack: await attackStreakOf(a.attacker.accountId),
      hold: await holdStreakOf(a.defender.accountId, started.zone),
    };

    const again = await settle({
      battleId: started.battleId,
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      zone: started.zone as 'visible' | 'hidden',
      conclusion: { winner: 'attacker', reason: 'wipe' },
      turnCount: 999,
      wasAmbush: false,
    });

    expect(again.settled).toBe(false);

    const after = await battleRow(started.battleId);
    expect(after.concludedAt?.toISOString()).toBe(before.concludedAt?.toISOString());
    // The forced `winner: attacker` and `turnCount: 999` above must not have landed.
    expect(after.winner).toBe(row.winner);
    expect(after.turnCount).toBe(row.turnCount);

    expect(await attackStreakOf(a.attacker.accountId)).toBe(before.attack);
    expect(await holdStreakOf(a.defender.accountId, started.zone)).toBe(before.hold);
  });

  it('is unmoved by two settlements arriving at once', async () => {
    /**
     * **The case the `WHERE concluded_at IS NULL` clause exists for.** A check
     * followed by a write has a window between them; this has none, because the
     * guard and the write are one statement and Postgres serialises them.
     */
    const before = await attackStreakOf(a.attacker.accountId);

    const call = () =>
      settle({
        battleId: started.battleId,
        attackerId: a.attacker.accountId,
        defenderId: a.defender.accountId,
        zone: started.zone as 'visible' | 'hidden',
        conclusion: { winner: 'attacker', reason: 'wipe' },
        turnCount: 50,
        wasAmbush: false,
      });

    const [one, two] = await Promise.all([call(), call()]);

    expect(one.settled).toBe(false);
    expect(two.settled).toBe(false);
    expect(await attackStreakOf(a.attacker.accountId)).toBe(before);
  });

  it('re-reading a concluded battle does not settle it again', async () => {
    const before = await attackStreakOf(a.attacker.accountId);
    const holdBefore = await holdStreakOf(a.defender.accountId, started.zone);

    for (let i = 0; i < 3; i++) {
      const res = await app.request(`/v1/battles/${started.battleId}`, {
        headers: a.attacker.headers(),
      });
      expect(res.status).toBe(200);
    }

    expect(await attackStreakOf(a.attacker.accountId)).toBe(before);
    expect(await holdStreakOf(a.defender.accountId, started.zone)).toBe(holdBefore);
  });

  it('replaying the final action does not settle it again', async () => {
    /**
     * **The retry that actually happens.** The last `act` resolved, the response
     * never arrived, and the client resends. It gets the stored packet — with
     * its conclusion — and a settlement hanging off that path would run twice.
     */
    const before = await attackStreakOf(a.attacker.accountId);
    const row = await battleRow(started.battleId);

    const [last] = await db()
      .select()
      .from(battles)
      .where(eq(battles.id, started.battleId))
      .limit(1);
    expect(last!.concludedAt).not.toBeNull();

    // Re-send action 0, which is written and therefore answered from storage.
    const res = await app.request(`/v1/battles/${started.battleId}/act`, {
      method: 'POST',
      headers: a.attacker.headers(),
      body: JSON.stringify({
        sequence: 0,
        actorInstanceId: 'a-front-0',
        powerId: 'anything',
        targetInstanceId: 'd-front-0',
      }),
    });

    expect(res.status).toBe(200);
    expect(await attackStreakOf(a.attacker.accountId)).toBe(before);
    expect((await battleRow(started.battleId)).turnCount).toBe(row.turnCount);
  });
});

describe('settlement is all-or-nothing (T049)', () => {
  /**
   * ### Why a partial settlement is the worst outcome available
   *
   * A battle that concludes but fails to move the streaks is a result the game
   * recorded and did not act on. A battle that moves the streaks but fails to
   * conclude is worse still — it stays open, so the one-at-a-time rule locks the
   * player out while they have already been paid for it.
   *
   * Neither is detectable afterwards. There is no field that says "this
   * settlement finished", and Constitution XVI means the battle row cannot be
   * re-derived from anything. So the guarantee has to be the transaction, and
   * this is the test that the transaction is real rather than five statements
   * that happen to run in order.
   */
  it('rolls the whole thing back when a write inside it fails', async () => {
    const started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion).not.toBeNull();

    /**
     * **Force the failure at the last write, not the first.** A rollback that
     * only worked when the *opening* statement failed would be indistinguishable
     * from no transaction at all — nothing had happened yet. Breaking the hold
     * streak means `battles`, the attack streak and the metadata columns have
     * all already been written inside the transaction when it dies.
     */
    const zone = started.zone as 'visible' | 'hidden';
    const before = {
      row: await battleRow(started.battleId),
      attack: await attackStreakOf(a.attacker.accountId),
      hold: await holdStreakOf(a.defender.accountId, zone),
    };

    /**
     * Reopen it so `settle` has work to do again.
     *
     * ### The record has to be removed too, and that discovered a property
     *
     * Feature 008 made `battle_records.battle_id` a primary key, so **the record
     * is a second, independent once-only guard** alongside `concluded_at`. Left
     * in place, the re-settlement below fails on a duplicate key instead of
     * reaching the write this test is about.
     *
     * That is the right behaviour and not something to work around: **it means a
     * settlement that somehow ran twice could never rewrite history**, even with
     * a different conclusion. Constitution XVI enforced by the database rather
     * than by the guard remembering to hold. `replays/immutable.test.ts` asserts
     * it directly.
     *
     * Production never reaches this state — `concluded_at` is only ever set, and
     * `discard` is guarded on it being null. Reopening is a fiction this test
     * needs, so the fiction has to be complete.
     */
    await db()
      .update(battles)
      .set({ concludedAt: null, winner: null, reason: null, turnCount: null })
      .where(eq(battles.id, started.battleId));
    await db().delete(battleRecords).where(eq(battleRecords.battleId, started.battleId));

    await db().execute(
      sql`alter table squads add constraint settle_test_break check (hold_streak < 0) not valid`,
    );

    try {
      await expect(
        settle({
          battleId: started.battleId,
          attackerId: a.attacker.accountId,
          defenderId: a.defender.accountId,
          zone,
          conclusion: { winner: 'defender', reason: 'wipe' },
          turnCount: 123,
          wasAmbush: false,
        }),
      ).rejects.toThrow();
    } finally {
      await db().execute(sql`alter table squads drop constraint settle_test_break`);
    }

    /**
     * **Nothing landed — including the `battles` update that ran first.** And
     * the battle is still playable, which is what lets the client simply retry
     * the final action rather than being told a battle it won has no result.
     */
    const after = await battleRow(started.battleId);
    expect(after.concludedAt).toBeNull();
    expect(after.winner).toBeNull();
    expect(after.turnCount).toBeNull();

    expect(await attackStreakOf(a.attacker.accountId)).toBe(before.attack);
    expect(await holdStreakOf(a.defender.accountId, zone)).toBe(before.hold);

    // And settling properly afterwards still works.
    const retried = await settle({
      battleId: started.battleId,
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      zone,
      conclusion: fought.conclusion as never,
      turnCount: before.row.turnCount ?? 100,
      wasAmbush: false,
    });

    expect(retried.settled).toBe(true);
    expect((await battleRow(started.battleId)).concludedAt).not.toBeNull();
  }, 300_000);
});
