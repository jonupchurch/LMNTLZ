/**
 * A reported battle outlives the window (008 T031–T032, US4).
 *
 * ### TL;DR
 *
 * Replays die at 7 days. A moderation report needs the evidence for longer, because
 * disputes routinely take longer than a week. So a **hold** keeps the blob alive,
 * and effective retention becomes `max(7 days from conclusion, 30 days from the
 * report's close)`.
 *
 * Two things are tested: the ladder end to end, and the case that decided the
 * schema — **two reports against one battle are two independent holds**, which a
 * boolean column on the record could not express.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { replayHolds } from '../../src/db/schema/replayHolds.js';
import { cleanupExpired, heldCount } from '../../src/replays/cleanup.js';
import { isHeld, placeHold, releaseHold } from '../../src/replays/retention.js';
import { memoryStorage, setReplayStorage } from '../../src/replays/storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let store = memoryStorage();
let restore = setReplayStorage(store);
const made: string[] = [];

/**
 * A concluded battle with a replay, aged by moving `concluded_at`.
 *
 * **The clock is moved rather than waited for**, which is the only way to test a
 * 37-day ladder. `concluded_at` is the input every retention decision reads, so
 * shifting it is a faithful simulation rather than a shortcut — nothing else in the
 * system derives age from anywhere else.
 */
async function battleConcludedDaysAgo(days: number) {
  const battleId = crypto.randomUUID();
  made.push(battleId);

  const concludedAt = new Date(Date.now() - days * DAY_MS);
  const { url } = await store.put(`battles/${battleId}.json`, JSON.stringify({ battleId }));

  await db()
    .insert(battleRecords)
    .values({
      battleId,
      startedAt: new Date(concludedAt.getTime() - 60_000),
      concludedAt,
      attackerId: null,
      defenderId: null,
      defenderIsBot: false,
      zone: 'visible',
      winner: 'attacker',
      reason: 'wipe',
      turnCount: 90,
      attackerSquad: { seats: [] },
      defenderSquad: { seats: [] },
      engineVersion: 'test-engine',
      contentVersion: 'test-content',
      buildSha: null,
      replayBlobUrl: url,
    });

  return { battleId, url };
}

/** Re-age a battle in place, so one ladder can walk forward through time. */
const ageTo = (battleId: string, daysAgo: number) =>
  db()
    .update(battleRecords)
    .set({ concludedAt: new Date(Date.now() - daysAgo * DAY_MS) })
    .where(eq(battleRecords.battleId, battleId));

/** Backdate a release, since `releaseHold` correctly stamps `now`. */
const releasedDaysAgo = (reportId: string, days: number) =>
  db()
    .update(replayHolds)
    .set({ releasedAt: new Date(Date.now() - days * DAY_MS) })
    .where(eq(replayHolds.reportId, reportId));

const clean = async () => {
  if (made.length === 0) return;
  await db().delete(replayHolds).where(inArray(replayHolds.battleId, made));
  await db().delete(battleRecords).where(inArray(battleRecords.battleId, made));
  made.length = 0;
};

beforeEach(async () => {
  await clean();
  restore();
  store = memoryStorage();
  restore = setReplayStorage(store);
});

afterAll(async () => {
  await clean();
  restore();
  await closeDb();
});

describe('the retention ladder (T031)', () => {
  it('walks report placed → +8 days survives → closed → +29 survives → +31 deleted', async () => {
    const { battleId, url } = await battleConcludedDaysAgo(1);
    const reportId = crypto.randomUUID();

    // 1. A report is filed while the replay is still ordinary.
    await placeHold(battleId, reportId);
    expect(await isHeld(battleId)).toBe(true);

    // 2. Eight days on, past the 7-day window — and it survives.
    await ageTo(battleId, 8);
    await cleanupExpired();
    expect(store.blobs.has(url), 'the hold did not protect the evidence').toBe(true);
    expect(await heldCount()).toBe(1);

    // 3. The report is closed. The grace period starts now, not at the battle.
    expect(await releaseHold(reportId)).toBe(1);
    expect(await isHeld(battleId)).toBe(false);

    // 4. Twenty-nine days after the close — still inside the grace, still there.
    await releasedDaysAgo(reportId, 29);
    await cleanupExpired();
    expect(store.blobs.has(url), 'deleted one day early').toBe(true);

    // 5. Thirty-one days after the close — collectable, and collected.
    await releasedDaysAgo(reportId, 31);
    await cleanupExpired();
    expect(store.blobs.has(url), 'the grace period never ended').toBe(false);

    // 6. And the record itself survived all of it intact.
    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, battleId));

    expect(record!.winner).toBe('attacker');
    expect(record!.turnCount).toBe(90);
    expect(record!.replayBlobUrl).toBeNull();
    expect(record!.replayDeletedAt).not.toBeNull();
  });

  it('measures the grace from the close, not from the battle', async () => {
    /**
     * **The distinction the design turns on.** A report opened on day six and closed
     * on day forty needs the replay until day seventy. A grace measured from the
     * battle would have deleted it around day thirty-seven — long before anybody
     * looked, and with no trace that it had ever existed.
     *
     * So: a very old battle whose report closed yesterday must still be protected.
     */
    const { battleId, url } = await battleConcludedDaysAgo(200);
    const reportId = crypto.randomUUID();

    await placeHold(battleId, reportId);
    await releaseHold(reportId);
    await releasedDaysAgo(reportId, 1);

    await cleanupExpired();

    expect(store.blobs.has(url), 'a 200-day-old battle lost evidence closed yesterday').toBe(true);
  });
});

describe('two reports are two holds (T032)', () => {
  it('survives closing one while the other is open', async () => {
    /**
     * ### The case that chose a table over a boolean
     *
     * `battle_records.retention_hold boolean` handles one report and fails on the
     * second: close the first and the flag reads "released" while the second dispute
     * is still open, so the evidence is deleted underneath an active case.
     *
     * Nothing about that failure is visible. The blob is simply gone when somebody
     * eventually looks, weeks later, and there is no record of why.
     *
     * `PRIMARY KEY (battle_id, report_id)` makes it unrepresentable: cleanup
     * requires that *none* of a battle's holds is open, and closing one changes
     * nothing about the other.
     */
    const { battleId, url } = await battleConcludedDaysAgo(30);
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();

    await placeHold(battleId, first);
    await placeHold(battleId, second);

    const holds = await db()
      .select({ reportId: replayHolds.reportId })
      .from(replayHolds)
      .where(eq(replayHolds.battleId, battleId));
    expect(holds.length, 'two reports collapsed into one hold').toBe(2);

    // Close the first, and put it well outside its own grace period so that
    // *only* the second hold can be what protects the blob.
    await releaseHold(first);
    await releasedDaysAgo(first, 60);

    expect(await isHeld(battleId), 'still held by the second report').toBe(true);

    await cleanupExpired();
    expect(store.blobs.has(url), 'closing one report deleted the other’s evidence').toBe(true);

    // Close the second too, aged past its grace — now it goes.
    await releaseHold(second);
    await releasedDaysAgo(second, 60);

    await cleanupExpired();
    expect(store.blobs.has(url)).toBe(false);
  });

  it('treats the same report placing a hold twice as one hold', async () => {
    /**
     * A retried request, or a moderator reopening a case. Two rows would have to be
     * released twice, and the second would keep protecting evidence nobody was
     * looking at — so `placeHold` is idempotent on `(battle_id, report_id)`.
     */
    const { battleId } = await battleConcludedDaysAgo(10);
    const reportId = crypto.randomUUID();

    await placeHold(battleId, reportId);
    await placeHold(battleId, reportId);

    const holds = await db()
      .select({ reportId: replayHolds.reportId })
      .from(replayHolds)
      .where(eq(replayHolds.battleId, battleId));

    expect(holds.length).toBe(1);
    expect(await releaseHold(reportId)).toBe(1);
    expect(await isHeld(battleId)).toBe(false);
  });

  it('keeps `placed_at` from the first claim, not the retry', async () => {
    const { battleId } = await battleConcludedDaysAgo(10);
    const reportId = crypto.randomUUID();

    await placeHold(battleId, reportId);
    const [firstRow] = await db()
      .select({ placedAt: replayHolds.placedAt })
      .from(replayHolds)
      .where(eq(replayHolds.reportId, reportId));

    await placeHold(battleId, reportId);
    const [afterRetry] = await db()
      .select({ placedAt: replayHolds.placedAt })
      .from(replayHolds)
      .where(eq(replayHolds.reportId, reportId));

    /**
     * `onConflictDoNothing` rather than an update, so the row records when the
     * evidence was **first** claimed. An update would rewrite the one timestamp
     * that answers "how long has this been under review".
     */
    expect(afterRetry!.placedAt.getTime()).toBe(firstRow!.placedAt.getTime());
  });
});

describe('one report can hold several battles', () => {
  it('releases every battle the report was holding', async () => {
    /**
     * A single report can cover a run of battles — a player suspected of scripting
     * is reported once, and the case needs all of that session's evidence. So
     * `releaseHold` works **by report**, not by battle, and returns how many holds
     * it closed.
     */
    const one = await battleConcludedDaysAgo(20);
    const two = await battleConcludedDaysAgo(21);
    const reportId = crypto.randomUUID();

    await placeHold(one.battleId, reportId);
    await placeHold(two.battleId, reportId);

    expect(await releaseHold(reportId)).toBe(2);
    expect(await isHeld(one.battleId)).toBe(false);
    expect(await isHeld(two.battleId)).toBe(false);
  });
});
