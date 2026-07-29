/**
 * Cleanup, and the monitor for cleanup silently stopping (008 T024–T026, T030).
 *
 * ### TL;DR
 *
 * Storage has to stop growing with the age of the game. This proves the job deletes
 * the right blobs, touches nothing else on the record, survives being run twice,
 * survives being killed halfway, and that a *stopped* job is detectable from
 * observed state rather than from the job's own reporting.
 *
 * The last one is the failure that actually happens. A job that never runs reports
 * nothing, which looks exactly like a job with nothing to do.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { replayHolds } from '../../src/db/schema/replayHolds.js';
import {
  cleanupExpired,
  expiredButUndeletedCount,
  heldCount,
} from '../../src/replays/cleanup.js';
import { placeHold, releaseHold, REPLAY_TTL_DAYS } from '../../src/replays/retention.js';
import { memoryStorage, setReplayStorage } from '../../src/replays/storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let store = memoryStorage();
let restore = setReplayStorage(store);
const made: string[] = [];

/**
 * A record with a blob, concluded `daysAgo` days ago.
 *
 * The blob goes through the store so `blobs` and `replay_blob_url` agree — a
 * fixture that invented a URL would let a bug that mangles the URL between the two
 * pass unnoticed, which is the one bug that would orphan blobs permanently.
 */
async function expiredRecord(daysAgo: number): Promise<{ battleId: string; url: string }> {
  const battleId = crypto.randomUUID();
  made.push(battleId);

  const concludedAt = new Date(Date.now() - daysAgo * DAY_MS);
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

/** Only this test's rows, so a shared database cannot make it flaky. */
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

/**
 * The counts below are scoped by cleaning between tests rather than by filtering,
 * because `cleanupExpired` intentionally has no "only these battles" parameter — a
 * job that could be scoped is a job somebody will scope by accident.
 */
describe('cleanupExpired', () => {
  it('deletes blobs past the window and leaves recent ones alone', async () => {
    const old = await expiredRecord(REPLAY_TTL_DAYS + 1);
    const recent = await expiredRecord(1);

    const result = await cleanupExpired();

    expect(result.deleted).toBe(1);
    expect(store.blobs.has(old.url), 'the expired blob survived').toBe(false);
    expect(store.blobs.has(recent.url), 'a recent blob was deleted').toBe(true);
  });

  it('leaves every other column on the record untouched (FR-018, T030)', async () => {
    /**
     * **Deleting a replay is not editing history.** The outcome, the turn count,
     * both compositions and all three stamps must read identically afterwards —
     * only the two replay columns move. A player who can no longer watch a battle
     * has lost nothing about *what happened*, which is why nothing breaks when a
     * replay expires.
     */
    const { battleId } = await expiredRecord(REPLAY_TTL_DAYS + 2);

    const before = (
      await db().select().from(battleRecords).where(inArray(battleRecords.battleId, [battleId]))
    )[0]!;

    await cleanupExpired();

    const after = (
      await db().select().from(battleRecords).where(inArray(battleRecords.battleId, [battleId]))
    )[0]!;

    expect(after.replayBlobUrl).toBeNull();
    expect(after.replayDeletedAt).not.toBeNull();

    // Everything else, compared wholesale rather than field by field.
    const strip = (row: typeof before) => {
      const { replayBlobUrl: _u, replayDeletedAt: _d, ...rest } = row;
      return rest;
    };
    expect(strip(after)).toEqual(strip(before));
  });

  it('is safe to run twice', async () => {
    await expiredRecord(REPLAY_TTL_DAYS + 1);

    const first = await cleanupExpired();
    const second = await cleanupExpired();

    expect(first.deleted).toBe(1);
    /**
     * Zero, not one — the first run cleared `replay_blob_url`, so the second run's
     * predicate no longer selects the row. Nothing has to remember what was done.
     */
    expect(second.deleted).toBe(0);
  });

  it('resumes after being killed mid-batch, with no double-delete and no skipped rows', async () => {
    /**
     * ### The ordering test, and it is the reason blobs are deleted before rows
     *
     * A real kill is simulated by running with a batch size smaller than the work:
     * the first call handles some rows and returns `more: true`, exactly as an
     * interrupted schedule leaves things.
     *
     * The stronger half is the *other* interruption — dying between the blob delete
     * and the row update. That state is constructed directly below, because it is
     * the one that would orphan blobs forever if the order were reversed.
     */
    for (let i = 0; i < 5; i++) await expiredRecord(REPLAY_TTL_DAYS + 1 + i);

    const first = await cleanupExpired(2);
    expect(first).toEqual({ deleted: 2, more: true });

    const second = await cleanupExpired(2);
    expect(second).toEqual({ deleted: 2, more: true });

    const third = await cleanupExpired(2);
    expect(third).toEqual({ deleted: 1, more: false });

    expect(await expiredButUndeletedCount()).toBe(0);
    expect(store.blobs.size, 'blobs left behind after a full drain').toBe(0);
  });

  it('recovers when a previous run deleted the blob but never marked the row', async () => {
    /**
     * **The crash window, reproduced.** Blobs are deleted first precisely so this
     * state is recoverable: the row still points at a URL that is already gone.
     *
     * The next run selects it again and re-deletes a blob that does not exist,
     * which the vendor documents as a success — and which
     * `tests/replays/store.test.ts` asserts against the live store rather than
     * taking on trust. So the row gets marked and the backlog drains.
     *
     * Under the opposite ordering this state would instead be an orphaned blob with
     * no row pointing at it, and with `list()` forbidden nothing could ever find
     * it again.
     */
    const { battleId, url } = await expiredRecord(REPLAY_TTL_DAYS + 1);

    // Exactly what a crash between the two writes leaves behind.
    store.blobs.delete(url);
    expect(await expiredButUndeletedCount()).toBe(1);

    const result = await cleanupExpired();

    expect(result.deleted).toBe(1);
    expect(await expiredButUndeletedCount()).toBe(0);

    const [row] = await db()
      .select({ url: battleRecords.replayBlobUrl, deletedAt: battleRecords.replayDeletedAt })
      .from(battleRecords)
      .where(inArray(battleRecords.battleId, [battleId]));
    expect(row!.url).toBeNull();
    expect(row!.deletedAt).not.toBeNull();
  });

  it('never touches a replay with an open hold', async () => {
    const held = await expiredRecord(REPLAY_TTL_DAYS + 3);
    const free = await expiredRecord(REPLAY_TTL_DAYS + 3);

    await placeHold(held.battleId, crypto.randomUUID());

    const result = await cleanupExpired();

    expect(result.deleted).toBe(1);
    expect(store.blobs.has(held.url), 'held evidence was deleted').toBe(true);
    expect(store.blobs.has(free.url)).toBe(false);

    // And the two counters keep the two situations apart.
    expect(await expiredButUndeletedCount()).toBe(0);
    expect(await heldCount()).toBe(1);
  });
});

describe('expiredButUndeletedCount is the stopped-job detector (SC-008)', () => {
  it('grows while the job does not run, and returns to zero when it does', async () => {
    /**
     * **This is the shape of the real failure.** A schedule that was never
     * registered, or a cron removed in a config edit, reports nothing at all — which
     * is indistinguishable from a job with nothing to do. A success counter cannot
     * tell those apart. A count of outstanding work can.
     *
     * Note what healthy looks like: **not zero**. Cleanup runs daily, so this
     * legitimately holds up to a day of newly-expired replays and is expected to
     * rise and fall. The alarm belongs on sustained growth, not on `> 0`.
     */
    expect(await expiredButUndeletedCount()).toBe(0);

    await expiredRecord(REPLAY_TTL_DAYS + 1);
    expect(await expiredButUndeletedCount()).toBe(1);

    await expiredRecord(REPLAY_TTL_DAYS + 2);
    await expiredRecord(REPLAY_TTL_DAYS + 3);
    expect(await expiredButUndeletedCount()).toBe(3);

    await cleanupExpired();
    expect(await expiredButUndeletedCount()).toBe(0);
  });

  it('does not count held replays as a backlog', async () => {
    /**
     * Kept separate so a growing hold count cannot be mistaken for a broken job.
     * A single "not deleted yet" number would conflate the retention feature
     * working with the cleanup job failing, and the two need opposite responses.
     */
    const held = await expiredRecord(REPLAY_TTL_DAYS + 1);
    await placeHold(held.battleId, crypto.randomUUID());

    expect(await expiredButUndeletedCount()).toBe(0);
    expect(await heldCount()).toBe(1);
  });

  it('does NOT count a just-released hold — the 30-day grace still protects it', async () => {
    /**
     * ### This test found a real gap in the implementation
     *
     * The first version of `dueForDeletion` excluded only holds with
     * `released_at IS NULL`, so closing a report made the evidence collectable that
     * same night. Retention is `max(7 days from conclusion, **30 days from the
     * report's close**)`, and the grace exists because closed cases get reopened
     * and appeals arrive after decisions.
     *
     * Written while building the ladder below, which is why the ladder was worth
     * building rather than assuming.
     */
    const held = await expiredRecord(REPLAY_TTL_DAYS + 1);
    const reportId = crypto.randomUUID();
    await placeHold(held.battleId, reportId);

    expect(await expiredButUndeletedCount()).toBe(0);

    expect(await releaseHold(reportId)).toBe(1);

    // Still protected, and still counted as held rather than as a backlog.
    expect(await expiredButUndeletedCount()).toBe(0);
    expect(await heldCount()).toBe(1);

    await cleanupExpired();
    expect(store.blobs.has(held.url), 'evidence deleted inside its grace period').toBe(true);
  });

  it('counts it once the grace period has passed, and then deletes it', async () => {
    const held = await expiredRecord(REPLAY_TTL_DAYS + 40);
    const reportId = crypto.randomUUID();
    await placeHold(held.battleId, reportId);

    /**
     * Released 31 days ago. `releaseHold` stamps `now`, so the timestamp is moved
     * directly — the alternative is a test that takes a month.
     */
    await releaseHold(reportId);
    await db()
      .update(replayHolds)
      .set({ releasedAt: new Date(Date.now() - 31 * DAY_MS) })
      .where(eq(replayHolds.reportId, reportId));

    expect(await expiredButUndeletedCount()).toBe(1);
    expect(await heldCount()).toBe(0);

    await cleanupExpired();
    expect(store.blobs.has(held.url)).toBe(false);
  });

  it('releases twice without extending the grace by another month', async () => {
    /**
     * **`releaseHold` is guarded on `released_at IS NULL`.** Unguarded, a second
     * call would stamp a fresh `now` and quietly buy the replay another thirty
     * days — and a moderator closing an already-closed case is an ordinary
     * double-click.
     */
    const held = await expiredRecord(REPLAY_TTL_DAYS + 40);
    const reportId = crypto.randomUUID();
    await placeHold(held.battleId, reportId);
    await releaseHold(reportId);

    const longAgo = new Date(Date.now() - 31 * DAY_MS);
    await db()
      .update(replayHolds)
      .set({ releasedAt: longAgo })
      .where(eq(replayHolds.reportId, reportId));

    // A second release finds nothing to do.
    expect(await releaseHold(reportId)).toBe(0);

    const [row] = await db()
      .select({ releasedAt: replayHolds.releasedAt })
      .from(replayHolds)
      .where(eq(replayHolds.reportId, reportId));
    expect(row!.releasedAt!.getTime()).toBe(longAgo.getTime());
    expect(await expiredButUndeletedCount()).toBe(1);
  });
});

describe('`list()` appears nowhere in this feature (T025)', () => {
  /**
   * ### The task asked for a raw grep, and a raw grep cannot pass
   *
   * T025 specifies `rg "\blist\(" apps/api/src/replays …` returning nothing. Run
   * literally it fails on **four matches, every one of them a comment explaining
   * that `list()` must never be called** — including the sentence in `storage.ts`
   * that states the rule.
   *
   * That is the same defect `noStoredState.test.ts` hit in feature 007, where a
   * scan for `current_hp` matched the schema's own promise that no such column
   * exists. And it is the same defect that made CI permanently red for two
   * features, when a check for workbook writes matched `new Workbook()` — the line
   * used to *read* it. **A check that cannot pass teaches people to ignore the
   * colour**, which is worse than having no check.
   *
   * So the scan strips comments first and then looks at code. The claim being made
   * is about calls, not about prose, and the implementation now matches the claim.
   */
  const sources = (): { file: string; code: string }[] => {
    const roots = ['src/replays', 'src/jobs', '../admin'].map((p) =>
      join(import.meta.dirname, '../../', p),
    );

    return roots
      .filter((root) => existsSync(root))
      .flatMap((root) =>
        readdirSync(root, { recursive: true, encoding: 'utf8' })
          .filter((f) => f.endsWith('.ts'))
          .map((f) => ({
            file: join(root, f),
            code: readFileSync(join(root, f), 'utf8')
              .replaceAll(/\/\*[\s\S]*?\*\//g, '')
              .replaceAll(/\/\/.*$/gm, ''),
          })),
      );
  };

  it('is absent from the code, comments excluded', () => {
    /**
     * `ReplayStorage` has no `list` member, so a call through the interface does not
     * typecheck. This catches the other route in: importing `list` straight from
     * `@vercel/blob`.
     *
     * **Why it matters enough to scan for.** The bucket cannot answer the question
     * cleanup asks — *which replays belong to concluded battles older than seven
     * days with no open hold* — so a listing would be a second and worse source of
     * truth. `del()` is also free while `list()` is a billed advanced operation, so
     * paging 100k blobs would be 100 billed operations per run against zero for one
     * indexed query.
     */
    const files = sources();
    expect(files.length, 'nothing was scanned — the paths are wrong').toBeGreaterThan(0);

    for (const { file, code } of files) {
      expect(/\blist\(/.test(code), `${file} calls list()`).toBe(false);
      expect(/\blist\b[^(]*\bfrom ['"]@vercel\/blob/.test(code), `${file} imports list`).toBe(
        false,
      );
    }
  });

  it('and the comment strip did not eat the files', () => {
    /**
     * Without this the test above passes vacuously the moment the strip regex
     * over-matches — which is exactly how a scan quietly stops checking anything.
     */
    const all = sources()
      .map((s) => s.code)
      .join('\n');

    expect(all).toContain('cleanupExpired');
    expect(all).toContain('ReplayStorage');
    expect(all).toContain('del(');
  });
});
