/**
 * Reading battle history and replays (008 T020, T022, T023, T035).
 *
 * ### TL;DR
 *
 * Two reads. `listBattles` gives a player their last 50 battles with a per-entry
 * `watchable` flag; `getReplay` serves one event log if the caller is entitled to
 * it. Neither exposes the defender's composition, and **neither can re-simulate
 * anything.**
 *
 * ### There is no re-simulation path, and that is a structural decision (T023)
 *
 * A replay is a stored event log, played back verbatim. Nothing in this module
 * imports the resolver, the seed store or `packet.ts`, and that absence is the
 * feature.
 *
 * The temptation is obvious and would arrive as a kindness: a replay has expired,
 * but the battle row still has its seed and its action log, so the events could be
 * *recomputed* and the player could watch after all. The moment that exists,
 * **a balance patch changes a past battle's outcome** — because a recomputation
 * runs today's rules over yesterday's inputs. Replays would silently diverge from
 * the results already paid out, and the divergence would be invisible: both the
 * old and the new version look like a perfectly ordinary battle.
 *
 * So expiry is answered with `410` and nothing else. The seed is retained for
 * investigation, not for reconstruction.
 */

import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { battleRecords } from '../db/schema/battleRecords.js';
import { replayHolds } from '../db/schema/replayHolds.js';
import { replayStorage } from './storage.js';
import { withinWindow } from './retention.js';
import type { ReplayLog } from './record.js';

/** The contract's cap. Most recent first. */
export const LIST_LIMIT = 50;

export interface BattleListEntry {
  readonly battleId: string;
  readonly concludedAt: string;
  readonly role: 'attacker' | 'defender';
  readonly opponent: {
    readonly id: string | null;
    readonly username: string | null;
    readonly isBot: boolean;
  };
  readonly zone: string;
  readonly outcome: 'win' | 'loss';
  readonly turnCount: number;
  readonly watchable: boolean;
}

/**
 * A player's most recent battles, from either side.
 *
 * ### `watchable` is computed here rather than discovered by the client
 *
 * FR-013 exists to stop a client learning that a replay is gone by **trying to
 * open it and failing**. That sounds like a nicety and is not: the failure would
 * arrive after a click, on a screen that had already promised a video, and it would
 * be indistinguishable from a network problem. So availability is part of the list.
 *
 * One flag covers four different situations, and collapsing them is deliberate —
 * a player has the same option in all four, which is none:
 *
 * | situation | `replay_blob_url` | `replay_deleted_at` |
 * |---|---|---|
 * | never written (a failed put) | null | null |
 * | deleted by cleanup | null | set |
 * | past the window, not yet swept | set | null |
 * | held for a report, past the window | set | null |
 *
 * The third and fourth rows are why the window is checked against `concluded_at`
 * rather than against the blob's existence. See `retention.ts`.
 */
export async function listBattles(accountId: string, now: Date = new Date()): Promise<{
  readonly battles: readonly BattleListEntry[];
  readonly total: number;
}> {
  /**
   * **The opponent's username is looked up, not stored.** The record carries the
   * opponent's *id* and deliberately not their name: a username is mutable and the
   * record is permanent, so storing it would freeze a name the player has since
   * changed — and feature 015's forced rename would then be undone in every
   * historical list, which is the opposite of what a forced rename is for.
   */
  const rows = await db()
    .select({
      battleId: battleRecords.battleId,
      concludedAt: battleRecords.concludedAt,
      attackerId: battleRecords.attackerId,
      defenderId: battleRecords.defenderId,
      defenderIsBot: battleRecords.defenderIsBot,
      zone: battleRecords.zone,
      winner: battleRecords.winner,
      turnCount: battleRecords.turnCount,
      replayBlobUrl: battleRecords.replayBlobUrl,
      /**
       * The opponent's current name, resolved per row by whichever side the
       * caller is not. `null` when the opponent's account is gone — the record
       * outlives it, and a deleted player has no name to show.
       */
      opponentUsername: sql<string | null>`(
        select a.username from accounts a
        where a.id = case
          when ${battleRecords.attackerId} = ${accountId} then ${battleRecords.defenderId}
          else ${battleRecords.attackerId}
        end
      )`,
    })
    .from(battleRecords)
    .where(
      or(eq(battleRecords.attackerId, accountId), eq(battleRecords.defenderId, accountId)),
    )
    .orderBy(desc(battleRecords.concludedAt))
    .limit(LIST_LIMIT);

  const battles = rows.map((row): BattleListEntry => {
    const role = row.attackerId === accountId ? 'attacker' : 'defender';
    const won = row.winner === role;

    return {
      battleId: row.battleId,
      concludedAt: row.concludedAt.toISOString(),
      role,
      opponent: {
        id: role === 'attacker' ? row.defenderId : row.attackerId,
        username: row.opponentUsername,
        /** Only ever true of a defender, so it is false when the caller defended. */
        isBot: role === 'attacker' ? row.defenderIsBot : false,
      },
      zone: row.zone,
      outcome: won ? 'win' : 'loss',
      turnCount: row.turnCount,
      watchable: row.replayBlobUrl !== null && withinWindow(row.concludedAt, now),
    };
    /**
     * **Note what is absent: both squads.** The record carries them and this
     * response carries neither — not the defender's, and not the attacker's own,
     * because a list is not a scouting surface (Constitution XVII). Storing is not
     * exposing, and this is one of the three places the exposing rule lives.
     */
  });

  return { battles, total: battles.length };
}

// ---------------------------------------------------------------------------
// One replay
// ---------------------------------------------------------------------------

export type ReplayResult =
  | { readonly ok: true; readonly log: ReplayLog }
  | { readonly ok: false; readonly reason: 'not-found' }
  /** Past its window, deleted, or the put failed. `410` with a machine reason. */
  | { readonly ok: false; readonly reason: 'expired' | 'unavailable' };

export interface ReplayRequest {
  readonly battleId: string;
  readonly requesterId: string;
  /**
   * **Set only for a moderator, and nothing can currently set it.**
   *
   * A replay held past its ordinary window is evidence for a moderation report,
   * and T035 restricts it to moderators: *retaining reported content beyond its
   * normal window is not a licence to publish it.* The grant needs an operator
   * identity, which feature 015 builds — an env allowlist minting a short-lived
   * scoped token.
   *
   * Until then this stays `false` on every call and a held replay past its window
   * is readable by **nobody**. That is the correct direction to be wrong in: the
   * restriction is real now, and 015 adds the exception rather than having to
   * discover the restriction was never enforced.
   */
  readonly asModerator?: boolean;
}

export async function getReplay(
  request: ReplayRequest,
  now: Date = new Date(),
): Promise<ReplayResult> {
  const { battleId, requesterId, asModerator = false } = request;

  const [row] = await db()
    .select({
      attackerId: battleRecords.attackerId,
      defenderId: battleRecords.defenderId,
      concludedAt: battleRecords.concludedAt,
      replayBlobUrl: battleRecords.replayBlobUrl,
      replayDeletedAt: battleRecords.replayDeletedAt,
      engineVersion: battleRecords.engineVersion,
      contentVersion: battleRecords.contentVersion,
      /** Whether any hold is still open — the same condition cleanup uses. */
      held: sql<boolean>`exists (
        select 1 from ${replayHolds} h
        where h.battle_id = ${battleRecords.battleId} and h.released_at is null
      )`,
    })
    .from(battleRecords)
    .where(eq(battleRecords.battleId, battleId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };

  /**
   * **A non-participant gets `not-found`, not `forbidden`.** A `403` confirms the
   * battle exists and that these two accounts fought — a scouting signal in a game
   * built on not knowing who is fighting whom, and the same rule the battle routes
   * already follow. A moderator is exempt because their whole job is looking at
   * battles that are not theirs.
   */
  const isParticipant = row.attackerId === requesterId || row.defenderId === requesterId;
  if (!isParticipant && !asModerator) return { ok: false, reason: 'not-found' };

  if (row.replayBlobUrl === null) {
    /**
     * `replay_deleted_at` is what separates *"it expired and was swept"* from
     * *"the put failed and there never was one"*. Both are `410`; a player who
     * expected to watch something deserves to know which, and support needs the
     * difference to tell a bug from a normal lifecycle.
     */
    return { ok: false, reason: row.replayDeletedAt ? 'expired' : 'unavailable' };
  }

  /**
   * **Past the window is expired even though the blob is still there.** Cleanup
   * runs daily, so the sweep lags the policy by up to a day, and a replay held for
   * a report may be retained for weeks. Serving on blob presence would make
   * availability depend on when a job last ran — and would publish held evidence
   * to a participant.
   */
  if (!withinWindow(row.concludedAt, now) && !asModerator) {
    return { ok: false, reason: 'expired' };
  }

  const body = await replayStorage().get(row.replayBlobUrl);
  /**
   * The blob is gone even though the row still points at it: cleanup deleted it
   * between the query above and this read, or a delete half-succeeded. Same
   * answer as expiry, because it is expiry.
   */
  if (body === null) return { ok: false, reason: 'expired' };

  return { ok: true, log: JSON.parse(body) as ReplayLog };
}
