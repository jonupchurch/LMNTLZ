/**
 * Who may read a replay (008 T018, T035, Constitution XVII).
 *
 * ### TL;DR
 *
 * A participant may watch their own battle for 7 days. Nobody else may, and a
 * non-participant is told the replay **does not exist** rather than that they are
 * not allowed to see it. Past the window a held replay survives as evidence, and
 * that is the one case where the current answer is *nobody* — see the last block.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { replayHolds } from '../../src/db/schema/replayHolds.js';
import { getReplay } from '../../src/replays/read.js';
import { REPLAY_TTL_DAYS } from '../../src/replays/retention.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from '../battle/live.js';

let a: Arena;
let started: StartedBattle;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  a = await arena('access');
  started = await start(a);
  const fought = await fightToTheEnd(a, started);
  expect(fought.conclusion).not.toBeNull();
}, 300_000);

afterAll(async () => {
  await db().delete(replayHolds).where(eq(replayHolds.battleId, started.battleId));
  await a.close();
  await closeDb();
});

describe('the route', () => {
  it('serves a participant 200', async () => {
    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const body = (await res.json()) as { battleId: string; events: unknown[] };
    expect(body.battleId).toBe(started.battleId);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('serves the defender too — both sides were there', async () => {
    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.defender.headers(),
    });
    expect(res.status).toBe(200);
  });

  it('gives a non-participant 404, not 403', async () => {
    /**
     * **Deliberately indistinguishable from a battle that does not exist.** A
     * `403` confirms the battle is real *and* that these two accounts fought it,
     * which is a scouting signal in a game whose entire Hidden-squad mechanic
     * depends on not knowing. The battle routes already follow this rule; a replay
     * route that leaked it would undo them.
     */
    const stranger = await arena('access-stranger');
    try {
      const res = await app.request(`/v1/replays/${started.battleId}`, {
        headers: stranger.attacker.headers(),
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('not_found');
    } finally {
      await stranger.close();
    }
  }, 120_000);

  it('requires a session at all', async () => {
    const res = await app.request(`/v1/replays/${started.battleId}`);
    expect(res.status).toBe(401);
  });

  it('gives 404 for a battle that never existed', async () => {
    const res = await app.request('/v1/replays/00000000-0000-4000-8000-000000000000', {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(404);
  });
});

describe('410 carries a machine-readable reason', () => {
  it('says `unavailable` when the recording never happened', async () => {
    /**
     * The put failed. The battle is intact and everything about it is known — the
     * only loss is watching. Distinguished from expiry because collapsing the two
     * would make a bug look like a normal lifecycle forever.
     */
    const url = (
      await db()
        .select({ url: battleRecords.replayBlobUrl })
        .from(battleRecords)
        .where(eq(battleRecords.battleId, started.battleId))
        .limit(1)
    )[0]!.url;

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: null, replayDeletedAt: null })
      .where(eq(battleRecords.battleId, started.battleId));

    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(410);
    expect(((await res.json()) as { reason: string }).reason).toBe('unavailable');

    // Restore for the tests below.
    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: url })
      .where(eq(battleRecords.battleId, started.battleId));
  });

  it('says `expired` when cleanup has swept it', async () => {
    const url = (
      await db()
        .select({ url: battleRecords.replayBlobUrl })
        .from(battleRecords)
        .where(eq(battleRecords.battleId, started.battleId))
        .limit(1)
    )[0]!.url;

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: null, replayDeletedAt: new Date() })
      .where(eq(battleRecords.battleId, started.battleId));

    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(410);
    expect(((await res.json()) as { reason: string }).reason).toBe('expired');

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: url, replayDeletedAt: null })
      .where(eq(battleRecords.battleId, started.battleId));
  });

  it('says `expired` past the window even while the blob is still there', async () => {
    /**
     * **The case that proves availability is policy rather than blob presence.**
     * Cleanup runs daily, so a replay concluded eight days ago may not have been
     * swept yet. Serving it because the bucket still has it would make
     * availability depend on when a job last ran — the same battle watchable for
     * one player and not another, and a support question nobody could answer.
     */
    const read = () =>
      getReplay({ battleId: started.battleId, requesterId: a.attacker.accountId });

    /**
     * **The blob must still be present throughout, or this passes vacuously** —
     * an absent blob would return `expired` for an entirely different reason and
     * the test would prove nothing about the window.
     */
    const blobUrl = (
      await db()
        .select({ url: battleRecords.replayBlobUrl })
        .from(battleRecords)
        .where(eq(battleRecords.battleId, started.battleId))
        .limit(1)
    )[0]!.url;
    expect(blobUrl, 'no blob — the assertion below would be about the wrong thing').not.toBeNull();

    // Recent: watchable.
    expect((await read()).ok).toBe(true);

    // Nothing changes but the battle's age.
    await db()
      .update(battleRecords)
      .set({ concludedAt: new Date(Date.now() - (REPLAY_TTL_DAYS + 1) * DAY_MS) })
      .where(eq(battleRecords.battleId, started.battleId));

    const stale = await read();
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe('expired');

    // And it is the age doing the work: make it recent again and it returns.
    await db()
      .update(battleRecords)
      .set({ concludedAt: new Date() })
      .where(eq(battleRecords.battleId, started.battleId));

    expect((await read()).ok).toBe(true);
  });
});

describe('a held replay past its window (T035)', () => {
  it('is readable by nobody yet, because operator identity does not exist', async () => {
    /**
     * ### The one place feature 008 is knowingly incomplete, and why this direction
     *
     * T035 says a held replay is restricted to moderators: *retaining reported
     * content beyond its normal window is not a licence to publish it.* The
     * restriction is implemented. **The exception is not**, because there is no way
     * to be a moderator — feature 005 shipped with no role or permission of any
     * kind, and feature 015 builds operator identity (an env allowlist minting a
     * short-lived scoped token; see `specs/016-ops-admin/spec.md`).
     *
     * So today a held replay past its window is readable by **no one**: `getReplay`
     * takes an `asModerator` flag and no route can set it.
     *
     * **That is the correct direction to be wrong in.** The restriction is real
     * now, and 015 adds a grant to a rule that is already enforced — rather than
     * 015 discovering that held evidence had been served to participants all along,
     * which is a disclosure that cannot be taken back.
     */
    const eightDaysAgo = new Date(Date.now() - (REPLAY_TTL_DAYS + 1) * DAY_MS);

    await db()
      .update(battleRecords)
      .set({ concludedAt: eightDaysAgo })
      .where(eq(battleRecords.battleId, started.battleId));

    await db()
      .insert(replayHolds)
      .values({ battleId: started.battleId, reportId: crypto.randomUUID() });

    // A participant is refused, even though the blob is deliberately retained.
    const participant = await getReplay({
      battleId: started.battleId,
      requesterId: a.attacker.accountId,
    });
    expect(participant.ok).toBe(false);

    // And the grant works the moment something can set it — 015's job.
    const moderator = await getReplay({
      battleId: started.battleId,
      requesterId: a.attacker.accountId,
      asModerator: true,
    });
    expect(moderator.ok, 'the moderator path is broken before 015 can even use it').toBe(true);

    /**
     * The route cannot reach that path. Asserted so the day it can, somebody has
     * chosen to make it possible.
     */
    const viaRoute = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(viaRoute.status).toBe(410);
  });
});
