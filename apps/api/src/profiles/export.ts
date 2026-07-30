/**
 * `GET /v1/me/export` — a player's own data, as CSV (012 T018–T020, T022).
 *
 * ### TL;DR
 *
 * A player can take everything the game knows about them. The file lists every
 * battle they have ever fought, **including their Hidden ones** — and carries no
 * squad composition on either side of any of them.
 *
 * ### Default-deny by construction, not by vigilance
 *
 * The column list below is written out by hand and the query names exactly those
 * columns. **There is no `SELECT *` and no object spread anywhere in this file.**
 * `battle_records` is the analytics product and will keep growing; under a spread,
 * adding a column to that table would publish it here as a side effect of a
 * migration nobody connected to privacy. Under an explicit list, publishing a new
 * column is an edit to this file.
 *
 * `export.test.ts` asserts the header **exactly** — never `toContain` — so a
 * widened export fails CI rather than shipping.
 *
 * ### Both squads are dropped. Not one, not conditionally.
 *
 * A conditional — *"include your own squad, drop your opponent's"* — is wrong
 * twice over:
 *
 * 1. **A player can publish their own export.** Including their own composition
 *    means a self-service leak of their own Hidden squad, which is the one thing
 *    the whole zone design rests on being secret.
 * 2. **It is one inverted boolean away from full disclosure**, and the resulting
 *    file looks entirely plausible — nobody notices for months.
 *
 * Constitution XVII: the record *stores* both squads because balance needs them.
 * **Storing is not exposing.** This file is one of the three places the exposing
 * rule actually lives.
 */

import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { battleRecords } from '../db/schema/battleRecords.js';

/**
 * **The exact header. Asserted in CI.**
 *
 * ### `ratingAtBattle`, and why it is not the contract's `ratingAfter`
 *
 * `contracts/profiles-api.md` names the last column `ratingAfter`. **Nothing
 * stores a post-battle rating.** `player_ratings` holds one current value per
 * account with no history, and `battle_records.attacker_rating` is written by
 * `battle/create.ts` — at battle *creation*, so it is unambiguously the rating
 * the player went in with.
 *
 * Emitting it under the name `ratingAfter` would be a lie in a file whose entire
 * purpose is to tell a player the truth about their own data, and computing the
 * real post-battle value is impossible: the per-battle delta is not recorded
 * either. So the column is named what it is. **Recorded as a contract correction
 * rather than fixed silently** — see `specs/012-profiles/contracts/`.
 */
export const EXPORT_HEADER = [
  'battleId',
  'concludedAt',
  'role',
  'opponentUsername',
  'opponentWasBot',
  'zone',
  'outcome',
  'turnCount',
  'leagueAtTime',
  'ratingAtBattle',
] as const;

/**
 * RFC 4180 quoting: double the quotes, wrap anything containing a delimiter.
 *
 * A username can contain a comma — usernames are player-typed — and an unquoted
 * one would shift every subsequent column in that row by one. That is not a
 * privacy bug but it is a correctness one, and it lands in the file the player
 * opens in a spreadsheet.
 */
function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const row = (cells: readonly (string | number | boolean | null)[]): string =>
  cells.map(cell).join(',');

/**
 * Every battle this player fought, from either side, most recent first.
 *
 * **No limit.** This is the "take my data with me" route; capping it would make
 * the export incomplete, which is the one thing it must not be. The rate limit on
 * the route is what protects the database, not a `LIMIT` that silently truncates
 * somebody's history.
 */
export async function myDataCsv(accountId: string): Promise<string> {
  const rows = await db()
    .select({
      battleId: battleRecords.battleId,
      concludedAt: battleRecords.concludedAt,
      attackerId: battleRecords.attackerId,
      defenderIsBot: battleRecords.defenderIsBot,
      zone: battleRecords.zone,
      winner: battleRecords.winner,
      turnCount: battleRecords.turnCount,
      attackerLeague: battleRecords.attackerLeague,
      defenderLeague: battleRecords.defenderLeague,
      attackerRating: battleRecords.attackerRating,
      defenderRating: battleRecords.defenderRating,
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
    .orderBy(desc(battleRecords.concludedAt));

  /**
   * **The zone IS included here, unlike on a profile**, and the difference is the
   * whole disclosure model in one line: this file goes to the player about
   * themselves, where their own Hidden battles are theirs to know. A profile goes
   * to an opponent, where the same fact is the thing being protected.
   */
  const lines = rows.map((r) => {
    const role = r.attackerId === accountId ? 'attacker' : 'defender';
    const mine = role === 'attacker';

    return row([
      r.battleId,
      r.concludedAt.toISOString(),
      role,
      r.opponentUsername,
      /** Only a defender is ever a bot, so this is false when the player defended. */
      mine ? r.defenderIsBot : false,
      r.zone,
      r.winner === role ? 'win' : 'loss',
      r.turnCount,
      mine ? r.attackerLeague : r.defenderLeague,
      mine ? r.attackerRating : r.defenderRating,
    ]);
  });

  return [EXPORT_HEADER.join(','), ...lines].join('\r\n');
}
