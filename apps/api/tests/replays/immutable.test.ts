/**
 * A record cannot be rewritten, and the database is what guarantees it
 * (Constitution XVI).
 *
 * ### Why this test exists at all
 *
 * It was not on the task list. It was written because `settle.test.ts` started
 * failing when feature 008 landed: that test artificially reopens a settled battle
 * to exercise a rollback, and the second settlement hit a duplicate key on
 * `battle_records`.
 *
 * The instinct is to reach for `onConflictDoNothing` and move on. The right read is
 * the opposite — **that duplicate key is a guarantee nobody had written down.**
 * `battle_records.battle_id` being a primary key means a settlement that somehow
 * ran twice cannot overwrite what the first one recorded, *even with a different
 * conclusion*. The past is immutable because the schema refuses, not because every
 * caller remembers to guard.
 *
 * So the finding got a test instead of a workaround. That is the whole file.
 *
 * ### Why `onConflictDoNothing` would be wrong
 *
 * It would turn the one failure that matters into silence. Settlement is already
 * guarded by `WHERE concluded_at IS NULL` in the same statement that writes it, so
 * a second insert reaching here means that guard did not hold — which is a bug in
 * the once-only guarantee that pays out shards. Absorbing it quietly would leave
 * the game paying twice and reporting nothing.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';

const ids: string[] = [];

const baseRecord = (battleId: string) => ({
  battleId,
  startedAt: new Date('2026-07-01T00:00:00Z'),
  concludedAt: new Date('2026-07-01T00:05:00Z'),
  attackerId: null,
  defenderId: null,
  defenderIsBot: false,
  zone: 'visible',
  winner: 'attacker',
  reason: 'wipe',
  turnCount: 96,
  attackerSquad: { seats: [] },
  defenderSquad: { seats: [] },
  engineVersion: 'test-engine',
  contentVersion: 'test-content',
  buildSha: null,
});

afterAll(async () => {
  for (const id of ids) await db().delete(battleRecords).where(eq(battleRecords.battleId, id));
  await closeDb();
});

describe('the record refuses to be rewritten', () => {
  it('rejects a second insert for the same battle, with a different outcome', async () => {
    const battleId = crypto.randomUUID();
    ids.push(battleId);

    await db().insert(battleRecords).values(baseRecord(battleId));

    /**
     * A second settlement claiming the **other side won**. This is the shape of
     * the bug that matters: not a duplicate of the same result, which would be
     * harmless, but a *different* result overwriting a recorded one.
     */
    const rejected = await db()
      .insert(battleRecords)
      .values({ ...baseRecord(battleId), winner: 'defender', reason: 'cap-tiebreak' })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(rejected, 'the second insert succeeded — history is rewritable').not.toBeNull();

    /**
     * **Asserted on the SQLSTATE, not the message.** Drizzle wraps driver errors
     * in its own `Failed query: …` text, so a message match here would test the
     * ORM's phrasing rather than the constraint — and would break on any version
     * that reworded it. `23505` is `unique_violation`, and the constraint name
     * pins it to *this* key rather than any other uniqueness in the row.
     */
    const cause = (rejected as { cause?: { code?: string; constraint?: string } }).cause;
    expect(cause?.code, 'not a unique violation').toBe('23505');
    expect(cause?.constraint).toBe('battle_records_pkey');
  });

  it('leaves the original values untouched after the rejected write', async () => {
    /**
     * **The assertion that makes the one above mean something.** A constraint
     * violation inside a statement that had already modified the row would still
     * throw — and would still have corrupted history. This confirms the refusal
     * was total.
     */
    const [row] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, ids[0]!))
      .limit(1);

    expect(row!.winner).toBe('attacker');
    expect(row!.reason).toBe('wipe');
    expect(row!.turnCount).toBe(96);
  });

  it('still allows the replay columns to move, because those are not history', async () => {
    /**
     * **Immutability here is about the battle, not the row.** `replay_blob_url`
     * and `replay_deleted_at` are the replay's lifecycle and must change: written
     * after commit, then cleared when the blob is deleted seven days later.
     *
     * Worth asserting explicitly, because "the record is immutable" read too
     * literally would make expiry unimplementable — and the distinction is exactly
     * what FR-018 turns on: deleting a replay never alters its record.
     */
    const battleId = ids[0]!;

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: 'https://example.private.blob.vercel-storage.com/x.json' })
      .where(eq(battleRecords.battleId, battleId));

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: null, replayDeletedAt: new Date() })
      .where(eq(battleRecords.battleId, battleId));

    const [row] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, battleId))
      .limit(1);

    expect(row!.replayBlobUrl).toBeNull();
    expect(row!.replayDeletedAt).not.toBeNull();

    // And the battle itself is still exactly what it was.
    expect(row!.winner).toBe('attacker');
    expect(row!.turnCount).toBe(96);
  });
});
