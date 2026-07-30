/**
 * A player's own standing — both axes, and the K band (009 T016).
 *
 * ### Why the band is named rather than the K value
 *
 * `06-progression.md` gives three decaying bands — 40 for the first 30 rated
 * battles, 20 to 200, then 10 — and calls them *"a starting point, not a decision"*,
 * because convergence speed is what a simulated population settles.
 *
 * So the response says **`provisional`**, not **`40`**. A client showing "your
 * rating is still settling" keeps working when the constant moves; a client shown
 * the number will eventually display it, and then the number is a compatibility
 * problem. The value is served under `config` for anyone who genuinely needs it.
 *
 * ### It reads defaults rather than requiring a row
 *
 * Pre-010 no account has a standing row at all, because `recordPlacement()` writes
 * nothing without a rune source. Answering `404` for a player who simply has not
 * geared up would be wrong, and answering `0` would be worse — so absence means
 * *1,000 rating, no rated battles, the starter grant of gear*, which is exactly
 * what a new account's standing is.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import {
  PROVISIONAL_BATTLES,
  SETTLING_BATTLES,
  STARTING_RATING,
  playerRatings,
} from '../db/schema/ratings.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { ambushChance } from '../squads/ambush.js';
import { STARTER_GRANT_SCORE, leagueOf, positionInLeague, type League } from './league.js';

export type ConvergenceBand = 'provisional' | 'settling' | 'established';

/** K decays in three steps. Counted in **rated** battles, never in all battles. */
export const K_BY_BAND: Readonly<Record<ConvergenceBand, number>> = {
  provisional: 40,
  settling: 20,
  established: 10,
};

/**
 * Which band a player is in.
 *
 * Boundaries are inclusive of the lower count — the **first 30** are provisional, so
 * battle 30 is still provisional and 31 is settling. A `>=`/`>` slip here shifts
 * every new player's convergence speed by one battle, which is invisible and
 * permanent.
 */
export function bandFor(ratedBattles: number): ConvergenceBand {
  if (ratedBattles <= PROVISIONAL_BATTLES) return 'provisional';
  if (ratedBattles <= SETTLING_BATTLES) return 'settling';
  return 'established';
}

export interface Standing {
  readonly league: League;
  readonly gearScore: number;
  readonly positionInLeague: number;
  readonly rating: number;
  readonly ratedBattles: number;
  readonly band: ConvergenceBand;
  readonly ambushChance: number;
  readonly consecutiveWins: number;
  /** Phase 5 fills this in. `active: false` is the honest answer until it does. */
  readonly starter: { readonly active: boolean };
}

export async function standing(accountId: string): Promise<Standing> {
  const [row] = await db()
    .select({
      gearScore: playerRatings.gearScore,
      rating: playerRatings.rating,
      ratedBattles: playerRatings.ratedBattles,
      attackStreak: playerStreaks.attackStreak,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    .leftJoin(playerStreaks, eq(playerStreaks.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!row) throw new Error(`no such account: ${accountId}`);

  const gearScore = row.gearScore ?? STARTER_GRANT_SCORE;
  const ratedBattles = row.ratedBattles ?? 0;
  const consecutiveWins = row.attackStreak ?? 0;

  return {
    league: leagueOf(gearScore),
    gearScore,
    positionInLeague: positionInLeague(gearScore),
    rating: row.rating ?? STARTING_RATING,
    ratedBattles,
    band: bandFor(ratedBattles),
    ambushChance: ambushChance(consecutiveWins),
    consecutiveWins,
    starter: { active: false },
  };
}
