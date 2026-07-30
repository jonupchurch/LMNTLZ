/**
 * Twenty Visible battles — **selected**, never filtered (012 T008, T009).
 *
 * ### Its own module, with one query in it, on purpose
 *
 * The difference between selecting and filtering is a single clause, and it is
 * the clause the whole disclosure model rests on. Both queries read correctly;
 * both return battles this player fought; both are twenty-ish long. Buried among
 * a profile builder's other reads, the wrong one survives review indefinitely —
 * which is why it lives alone, with the wrong version written out below it so
 * nobody has to reconstruct the distinction from first principles.
 *
 * ```sql
 * -- RIGHT: twenty Visible, however far back that reaches.
 * SELECT … WHERE zone = 'visible' ORDER BY concluded_at DESC LIMIT 20;
 *
 * -- WRONG: twenty of anything, then drop the Hidden ones.
 * SELECT * FROM (SELECT … ORDER BY concluded_at DESC LIMIT 20) t WHERE zone='visible';
 * ```
 *
 * Under the wrong one a viewer who **counts entries** learns how many of the last
 * twenty battles were Hidden. Repeated over days that yields the player's ambush
 * rate, their Hidden hold rate, and roughly when they were ambushed — none of
 * which any screen ever showed them.
 *
 * ### The signature cannot express the wrong query
 *
 * There is **no `zone` parameter and no `limit` parameter**. A zone parameter
 * would let a caller ask for Hidden; a limit parameter invites a caller to ask
 * for more and then trim, which is the filtered query wearing a different hat.
 * The contract sketches `recentVisibleBattles(playerId, limit: 20)` — a parameter
 * whose only legal value is a constant is a constant, so it is one here.
 */

import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { battleRecords } from '../db/schema/battleRecords.js';

/** Twenty. A legibility choice, changeable without a schema change. */
export const VISIBLE_RECORD_LIMIT = 20;

export interface ProfileBattle {
  readonly battleId: string;
  /**
   * **A day, `YYYY-MM-DD`, and never an instant.**
   *
   * Exact times leak the same information one step removed: the *intervals*
   * between entries reveal how many battles happened in the gaps. A correct
   * query with precise timestamps is a correct query that still leaks.
   */
  readonly concludedOn: string;
  readonly role: 'attacker' | 'defender';
  /** The opponent's current name, or `null` if their account is gone. */
  readonly opponent: string | null;
  readonly opponentWasBot: boolean;
  readonly outcome: 'win' | 'loss';
  readonly turnCount: number;
}

/** UTC, so the same battle renders as the same day to every viewer. */
const dayOf = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * The last twenty Visible battles this player fought, from either side.
 *
 * Never padded and never a placeholder: a player with eight Visible battles ever
 * gets eight entries, and a player whose last twenty battles were all Hidden gets
 * twenty Visible ones from further back.
 */
export async function recentVisibleBattles(
  playerId: string,
): Promise<readonly ProfileBattle[]> {
  const rows = await db()
    .select({
      battleId: battleRecords.battleId,
      concludedAt: battleRecords.concludedAt,
      attackerId: battleRecords.attackerId,
      defenderIsBot: battleRecords.defenderIsBot,
      winner: battleRecords.winner,
      turnCount: battleRecords.turnCount,
      /**
       * Resolved per row, exactly as `replays/read.ts` does it and for the same
       * reason: the record keeps the opponent's *id*, never their name, because
       * a username is mutable and a record is permanent. Storing the name would
       * freeze one a player has since changed — and would quietly undo feature
       * 015's forced renames across all of history.
       */
      opponent: sql<string | null>`(
        select a.username from accounts a
        where a.id = case
          when ${battleRecords.attackerId} = ${playerId} then ${battleRecords.defenderId}
          else ${battleRecords.attackerId}
        end
      )`,
    })
    .from(battleRecords)
    .where(
      and(
        // The clause. It is inside the query, not applied to its result.
        eq(battleRecords.zone, 'visible'),
        or(eq(battleRecords.attackerId, playerId), eq(battleRecords.defenderId, playerId)),
      ),
    )
    .orderBy(desc(battleRecords.concludedAt))
    .limit(VISIBLE_RECORD_LIMIT);

  return rows.map((row): ProfileBattle => {
    const role = row.attackerId === playerId ? 'attacker' : 'defender';

    return {
      battleId: row.battleId,
      concludedOn: dayOf(row.concludedAt),
      role,
      opponent: row.opponent,
      /** Only ever true of a defender, so false when this player defended. */
      opponentWasBot: role === 'attacker' ? row.defenderIsBot : false,
      outcome: row.winner === role ? 'win' : 'loss',
      turnCount: row.turnCount,
    };
    /**
     * **Note what is absent: the zone.** Every entry here is Visible by
     * construction, so a `zone` field would carry no information — and a field
     * that always reads `"visible"` is an invitation to make it sometimes read
     * something else.
     */
  });
}
