/**
 * `GET /v1/me/battles` — the list, and the `watchable` flag (008 T019, T021).
 *
 * ### TL;DR
 *
 * A player's last 50 battles, from either side, each carrying whether its replay
 * can still be opened. The flag is the point: **a client must never learn that a
 * replay is gone by clicking it and failing** (FR-013), because that failure lands
 * on a screen already promising a video and is indistinguishable from a bad
 * connection.
 *
 * The flag collapses four situations into one boolean, deliberately — the player
 * has the same option in all four, which is none.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { LIST_LIMIT, listBattles } from '../../src/replays/read.js';
import { REPLAY_TTL_DAYS } from '../../src/replays/retention.js';
import { arena, type Arena } from '../battle/live.js';

let a: Arena;
const synthetic: string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records inserted directly, because the four `watchable` cases cannot all be
 * reached by fighting: two of them need a battle that concluded over a week ago.
 * `write.test.ts` covers the fought path.
 */
async function record(over: {
  attackerId?: string | null;
  defenderId?: string | null;
  concludedAt: Date;
  replayBlobUrl?: string | null;
  replayDeletedAt?: Date | null;
  winner?: string;
  defenderIsBot?: boolean;
}): Promise<string> {
  const battleId = crypto.randomUUID();
  synthetic.push(battleId);

  await db()
    .insert(battleRecords)
    .values({
      battleId,
      startedAt: new Date(over.concludedAt.getTime() - 60_000),
      concludedAt: over.concludedAt,
      attackerId: over.attackerId ?? null,
      defenderId: over.defenderId ?? null,
      defenderIsBot: over.defenderIsBot ?? false,
      zone: 'visible',
      winner: over.winner ?? 'attacker',
      reason: 'wipe',
      turnCount: 88,
      attackerSquad: { seats: [{ row: 'front', index: 0, heroId: 'h1' }] },
      defenderSquad: { seats: [{ row: 'front', index: 0, heroId: 'h9' }] },
      engineVersion: 'test-engine',
      contentVersion: 'test-content',
      buildSha: null,
      replayBlobUrl: over.replayBlobUrl ?? null,
      replayDeletedAt: over.replayDeletedAt ?? null,
    });

  return battleId;
}

beforeAll(async () => {
  a = await arena('list');
}, 120_000);

afterAll(async () => {
  if (synthetic.length > 0) {
    await db().delete(battleRecords).where(inArray(battleRecords.battleId, synthetic));
  }
  await a.close();
  await closeDb();
});

describe('watchable covers all four cases', () => {
  it('distinguishes present · never-written · deleted · past-the-window', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60_000);
    const old = new Date(now.getTime() - (REPLAY_TTL_DAYS + 1) * DAY_MS);

    const present = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: recent,
      replayBlobUrl: 'https://s.private.blob.vercel-storage.com/present.json',
    });
    const neverWritten = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: new Date(recent.getTime() - 1000),
      replayBlobUrl: null,
      replayDeletedAt: null,
    });
    const deleted = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: new Date(recent.getTime() - 2000),
      replayBlobUrl: null,
      replayDeletedAt: new Date(),
    });
    const pastWindow = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: old,
      // Blob still present — cleanup has not run yet, or a hold is keeping it.
      replayBlobUrl: 'https://s.private.blob.vercel-storage.com/stale.json',
    });

    const { battles } = await listBattles(a.attacker.accountId, now);
    const flag = new Map(battles.map((b) => [b.battleId, b.watchable]));

    expect(flag.get(present), 'a fresh replay should be watchable').toBe(true);
    expect(flag.get(neverWritten), 'a failed put is not watchable').toBe(false);
    expect(flag.get(deleted), 'a swept replay is not watchable').toBe(false);
    /**
     * **The one a naive implementation gets wrong.** The blob is right there, so
     * `replay_blob_url !== null` says watchable — but the policy says seven days,
     * and cleanup runs daily. Deriving from the blob would make the answer depend
     * on when a job last ran.
     */
    expect(flag.get(pastWindow), 'past the window is not watchable, blob or no blob').toBe(false);
  });
});

describe('the list', () => {
  it('shows both roles with the outcome from the caller’s side', async () => {
    /**
     * The same battle is a win for one participant and a loss for the other, and
     * `winner` is stored as a side rather than an account. So the mapping from
     * `winner` to `outcome` depends on who is asking — the easiest thing in this
     * feature to get backwards, and invisible unless both sides are checked.
     */
    const now = new Date();
    const battleId = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: now,
      winner: 'defender',
    });

    const forAttacker = (await listBattles(a.attacker.accountId, now)).battles.find(
      (b) => b.battleId === battleId,
    )!;
    const forDefender = (await listBattles(a.defender.accountId, now)).battles.find(
      (b) => b.battleId === battleId,
    )!;

    expect(forAttacker.role).toBe('attacker');
    expect(forAttacker.outcome).toBe('loss');
    expect(forDefender.role).toBe('defender');
    expect(forDefender.outcome).toBe('win');
  });

  it('names the opponent by looking the username up, not by storing it', async () => {
    const now = new Date();
    const battleId = await record({
      attackerId: a.attacker.accountId,
      defenderId: a.defender.accountId,
      concludedAt: now,
    });

    const entry = (await listBattles(a.attacker.accountId, now)).battles.find(
      (b) => b.battleId === battleId,
    )!;

    expect(entry.opponent.id).toBe(a.defender.accountId);
    expect(entry.opponent.username, 'the opponent has no name').toBeTruthy();
  });

  it('caps at 50, newest first', async () => {
    const now = new Date();
    const made: string[] = [];
    for (let i = 0; i < LIST_LIMIT + 5; i++) {
      made.push(
        await record({
          attackerId: a.attacker.accountId,
          defenderId: a.defender.accountId,
          concludedAt: new Date(now.getTime() - i * 60_000),
        }),
      );
    }

    const { battles, total } = await listBattles(a.attacker.accountId, now);

    expect(battles.length).toBe(LIST_LIMIT);
    expect(total).toBe(LIST_LIMIT);

    // Newest first, strictly.
    for (let i = 1; i < battles.length; i++) {
      expect(
        new Date(battles[i - 1]!.concludedAt).getTime() >= new Date(battles[i]!.concludedAt).getTime(),
      ).toBe(true);
    }

    // And the newest of the batch is in there, not the oldest.
    expect(battles.some((b) => b.battleId === made[0])).toBe(true);
  }, 120_000);

  it('never carries either squad (Constitution XVII)', async () => {
    /**
     * **The exposing half of "storing is not exposing".** The record holds both
     * compositions so pick rates are computable; this response must carry neither —
     * not the defender's, and not the caller's own, because a list is not a
     * scouting surface. Scanned on the serialised body, which is what leaves.
     */
    const res = await app.request('/v1/me/battles', { headers: a.attacker.headers() });
    expect(res.status).toBe(200);

    const text = await res.text();
    for (const forbidden of ['attackerSquad', 'defenderSquad', 'seats', 'heroId']) {
      expect(text.includes(forbidden), `the list leaks ${forbidden}`).toBe(false);
    }

    // Not vacuous — there are entries in there.
    expect(text).toContain('"battles"');
    expect(text).toContain('"watchable"');
  });

  it('requires a session', async () => {
    const res = await app.request('/v1/me/battles');
    expect(res.status).toBe(401);
  });

  it('shows a player nothing but their own battles', async () => {
    const other = await arena('list-other');
    try {
      const now = new Date();
      const theirs = await record({
        attackerId: other.attacker.accountId,
        defenderId: other.defender.accountId,
        concludedAt: now,
      });

      const mine = await listBattles(a.attacker.accountId, now);
      expect(mine.battles.some((b) => b.battleId === theirs)).toBe(false);
    } finally {
      await other.close();
    }
  }, 120_000);
});

describe('a record whose accounts are gone', () => {
  it('still lists for the surviving participant, with a nameless opponent', async () => {
    /**
     * **Deletion is delinking, and this is what that looks like from the other
     * side of the battle.** The published privacy policy promises deletion removes
     * a player's identity from these records rather than deleting the records — so
     * the surviving player keeps their history, and the opponent becomes anonymous
     * rather than vanishing.
     */
    const now = new Date();
    const battleId = await record({
      attackerId: a.attacker.accountId,
      defenderId: null,
      concludedAt: now,
    });

    const entry = (await listBattles(a.attacker.accountId, now)).battles.find(
      (b) => b.battleId === battleId,
    )!;

    expect(entry).toBeDefined();
    expect(entry.opponent.id).toBeNull();
    expect(entry.opponent.username).toBeNull();
    /**
     * **And not reported as a bot.** `defender_is_bot` is its own column precisely
     * so a deleted account cannot be mistaken for one — the mistake would quietly
     * drop a real player's battles from every aggregate that filters bots out.
     */
    expect(entry.opponent.isBot).toBe(false);
  });
});
