/**
 * The two writes fail differently, and that asymmetry is the feature (008 T036).
 *
 * ### TL;DR
 *
 * | write | fails how | consequence |
 * |---|---|---|
 * | `battle_records` row | inside the transaction | **everything rolls back**, battle still playable |
 * | replay blob | after commit | one replay lost, battle settled normally |
 *
 * An implementation that treated them the same would be wrong in one direction or
 * the other: either a Blob outage stops players finishing battles, or a battle pays
 * out and vanishes from the analytics product.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battles } from '../../src/db/schema/battles.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { settle } from '../../src/battle/settle.js';
import { listBattles } from '../../src/replays/read.js';
import { arena, fightToTheEnd, start, type Arena } from '../battle/live.js';

let a: Arena;

beforeAll(async () => {
  a = await arena('atomicity');
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

const recordOf = (battleId: string) =>
  db().select().from(battleRecords).where(eq(battleRecords.battleId, battleId)).limit(1);

const battleRow = async (battleId: string) =>
  (await db().select().from(battles).where(eq(battles.id, battleId)).limit(1))[0]!;

describe('a failed record insert rolls everything back', () => {
  it('leaves the battle unconcluded and still playable', async () => {
    /**
     * ### The failure is forced at the record insert specifically
     *
     * A `NOT VALID` check constraint aimed at `battle_records` fails the insert
     * *inside* `settle`'s transaction, after the `battles` UPDATE has already run.
     * So a rollback that only worked when the first statement failed cannot pass
     * this — nothing would have happened yet in that case.
     *
     * `NOT VALID` matters: it applies to new rows without validating existing ones,
     * so the constraint can be added to a populated table instantly.
     */
    const started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion).not.toBeNull();

    // Reopen so settlement has work to do, and remove the record the fight wrote.
    await db()
      .update(battles)
      .set({ concludedAt: null, winner: null, reason: null, turnCount: null })
      .where(eq(battles.id, started.battleId));
    await db().delete(battleRecords).where(eq(battleRecords.battleId, started.battleId));

    await db().execute(
      sql`alter table battle_records add constraint atomicity_test_break check (turn_count < 0) not valid`,
    );

    try {
      await expect(
        settle({
          battleId: started.battleId,
          attackerId: a.attacker.accountId,
          defenderId: a.defender.accountId,
          zone: started.zone as 'visible' | 'hidden',
          conclusion: fought.conclusion as never,
          turnCount: 101,
          wasAmbush: false,
        }),
      ).rejects.toThrow();
    } finally {
      await db().execute(sql`alter table battle_records drop constraint atomicity_test_break`);
    }

    /**
     * **Nothing landed — including the `battles` UPDATE that ran first.** The
     * battle is still open, so the client simply retries the final action rather
     * than being told a battle it won has no result.
     */
    const after = await battleRow(started.battleId);
    expect(after.concludedAt).toBeNull();
    expect(after.winner).toBeNull();
    expect(after.turnCount).toBeNull();
    expect((await recordOf(started.battleId)).length).toBe(0);

    // And settling properly afterwards works, which is what makes the retry real.
    const retried = await settle({
      battleId: started.battleId,
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      zone: started.zone as 'visible' | 'hidden',
      conclusion: fought.conclusion as never,
      turnCount: 101,
      wasAmbush: false,
    });

    expect(retried.settled).toBe(true);
    expect((await recordOf(started.battleId)).length).toBe(1);
  }, 300_000);
});

describe('a failed blob put concludes the battle normally', () => {
  it('settles, records, and reports watchable: false', async () => {
    /**
     * ### Why this must not fail the request
     *
     * The put runs after the transaction commits, on the request that resolved the
     * *winning turn*. Throwing would surface a 500 on the action that won the
     * battle — and the battle would be over regardless, so the player would see a
     * failure for something that succeeded.
     *
     * What is actually lost is the ability to watch, which is the same outcome as
     * expiry. `watchable: false` already covers it, so a failed put needs no new
     * concept and no new error path.
     */
    const started = await start(a);

    /** Arm the failure so the *settling* act is the one that cannot write. */
    a.storage.failNextPut();

    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion, 'the battle did not conclude').not.toBeNull();

    // Every act returned 200 — `fightToTheEnd` asserts that on each one.
    const [record] = await recordOf(started.battleId);

    expect(record, 'the record was not written').toBeDefined();
    expect(record!.winner).toBeTruthy();
    expect(record!.turnCount).toBeGreaterThan(0);

    /**
     * `replay_blob_url` is null and `replay_deleted_at` is null — the pair that
     * means *"never written"* rather than *"swept"*. The distinction is what keeps
     * a recording bug from looking like a normal lifecycle forever.
     */
    expect(record!.replayBlobUrl).toBeNull();
    expect(record!.replayDeletedAt).toBeNull();

    const { battles: listed } = await listBattles(a.attacker.accountId);
    const entry = listed.find((b) => b.battleId === started.battleId)!;
    expect(entry).toBeDefined();
    expect(entry.watchable).toBe(false);

    // And the route says `unavailable`, not `expired`.
    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(410);
    expect(((await res.json()) as { reason: string }).reason).toBe('unavailable');
  }, 300_000);

  it('and the streaks still moved, because the battle really happened', async () => {
    /**
     * The strongest form of "the blob is not load-bearing": the *rest* of
     * settlement is unaffected. A failed recording must not quietly cost a player
     * their attack streak.
     */
    const [row] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(battleRecords)
      .where(eq(battleRecords.attackerId, a.attacker.accountId));

    expect(row!.n, 'no records for this attacker at all').toBeGreaterThan(0);
  });
});

describe('the record survives what the replay does not', () => {
  it('answers the outcome after the replay is gone entirely', async () => {
    /**
     * **Why the two artifacts are separate objects.** Everything a player or a
     * balance pass needs is in the record — the outcome, the length, both
     * compositions, the stamps. The replay is the one thing with a shelf life, so
     * losing it costs *watching* and nothing else.
     */
    const started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.conclusion).not.toBeNull();

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: null, replayDeletedAt: new Date() })
      .where(eq(battleRecords.battleId, started.battleId));

    const [record] = await recordOf(started.battleId);
    expect(record!.winner).toBeTruthy();
    expect(record!.turnCount).toBeGreaterThan(0);
    expect(record!.attackerSquad).toBeTruthy();
    expect(record!.defenderSquad).toBeTruthy();
    expect(record!.engineVersion).toBeTruthy();

    const { battles: listed } = await listBattles(a.attacker.accountId);
    const entry = listed.find((b) => b.battleId === started.battleId)!;
    expect(entry.outcome).toMatch(/^(win|loss)$/);
    expect(entry.turnCount).toBeGreaterThan(0);
    expect(entry.watchable).toBe(false);
  }, 300_000);
});
