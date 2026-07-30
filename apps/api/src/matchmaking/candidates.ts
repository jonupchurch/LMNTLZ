/**
 * Who a player is offered (009 T014 · FR-011).
 *
 * > **Gear restricts. Rating orders. Nothing else touches the pool.**
 *
 * ### The signature is the enforcement, and that is the whole design
 *
 * `candidates(accountId)` takes **one argument**. There is no `excludeIds`, no
 * `minRating`, no `maxAttempts`, no `limit`, no cursor — nothing a caller could
 * pass to remove somebody. `contracts/matchmaking-api.md` puts it plainly: *"every
 * eligible defender in the league is present, every time: no slate, no rotation, no
 * cooldown on re-attacking someone you have already fought."*
 *
 * That is not laziness about pagination. A rule restricting **who** you may attack
 * restricts the playing itself, and the daily income curve already bounds what
 * volume pays — 1.5× on the first five victories, base to twenty, half beyond. The
 * economy handles farming, so matchmaking does not have to, and adding a second
 * mechanism would be a second thing to keep in step.
 *
 * ### Two seams, both honest, both named
 *
 * **Gear score is null for everybody**, because 010 owns rune placement. The query
 * coalesces to the 1,500 starter grant, which is what `gearScore()` answers, so the
 * whole population is Bronze today. Every band boundary in the SQL is real; only the
 * scores feeding it are placeholders.
 *
 * **The standing row is often absent**, for the same reason — `recordPlacement()`
 * deliberately writes nothing pre-010. So this is a LEFT JOIN with defaults rather
 * than an INNER JOIN: an INNER JOIN would return an **empty pool for the entire
 * game**, which is exactly the shape of failure this project keeps meeting — no
 * error, no log, just nothing.
 *
 * **`last_activity_at` has no writer yet.** The column exists and the query uses it,
 * but nothing updates it, so it falls back to `accounts.created_at` and the pool
 * would quietly thin as accounts age past thirty days. `touchActivity()` below is
 * the writer; wiring it into battle settlement and defense-squad saves is its own
 * task and is **not** done here. Recorded because a pool that empties silently is
 * worse than one that errors.
 */

import { and, desc, eq, gte, lt, ne, or, isNull, sql } from 'drizzle-orm';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { playerRatings, STARTING_RATING } from '../db/schema/ratings.js';
import { squads, squadSeats } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { ambushChance } from '../squads/ambush.js';
import { INACTIVITY_DAYS } from './config.js';
import { STARTER_GRANT_SCORE, bandOf, leagueOf, positionInLeague, type League } from './league.js';

export interface Candidate {
  readonly playerId: string;
  readonly username: string;
  readonly isBot: boolean;
  readonly rating: number;
  readonly visibleHoldStreak: number;
  readonly hiddenHoldStreak: number;
}

export interface CandidateList {
  readonly league: League;
  readonly positionInLeague: number;
  readonly gearScore: number;
  /** True only when a thin league had to reach outside its band. See `config.ts`. */
  readonly widened: boolean;
  readonly candidates: readonly Candidate[];
  /** Percent, 0–90. **Always displayed** — the player is owed the reason. */
  readonly ambushChance: number;
  readonly consecutiveWins: number;
}

/** `coalesce(gear_score, 1500)` — the seam, in SQL. */
const effectiveGearScore = sql<number>`coalesce(${playerRatings.gearScore}, ${STARTER_GRANT_SCORE})`;

/**
 * Mark an account active, so it stays in the defender pool.
 *
 * **Activity is an attack battle or a defense-squad edit** — a bare login is not
 * enough, or an absent account keeps collecting hold income by opening the game and
 * doing nothing.
 *
 * Upserts, because the standing row may not exist yet: pre-010 nothing creates one.
 *
 * > **No caller yet.** Battle settlement (007) and defense-squad saves (006) are
 * > where this belongs, and neither calls it. Until they do, eligibility falls back
 * > to `accounts.created_at`.
 */
export async function touchActivity(accountId: string): Promise<void> {
  const now = new Date();
  await db()
    .insert(playerRatings)
    .values({ accountId, lastActivityAt: now })
    .onConflictDoUpdate({
      target: playerRatings.accountId,
      set: { lastActivityAt: now, updatedAt: now },
    });
}

/**
 * The pool, ordered.
 *
 * **Assembly then ORDER, never a filtered query.** Rating appears exactly once, in
 * the `ORDER BY`. If it ever appears in a `WHERE`, this function has stopped being
 * what its contract says it is.
 */
export async function candidates(accountId: string): Promise<CandidateList> {
  const [own] = await db()
    .select({
      gearScore: effectiveGearScore,
      attackStreak: sql<number>`coalesce(${playerStreaks.attackStreak}, 0)`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    .leftJoin(playerStreaks, eq(playerStreaks.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!own) throw new Error(`no such account: ${accountId}`);

  const gearScore = Number(own.gearScore);
  const league = leagueOf(gearScore);
  const band = bandOf(league);

  /**
   * **Counted as a subquery rather than joined and grouped.** A join to
   * `squad_seats` would multiply every defender by their seat count and need a
   * `GROUP BY` over every selected column — and the first person to add a column
   * would get a wrong answer rather than an error.
   */
  const seatedSix = sql`(
    select count(*) from ${squadSeats}
    where ${squadSeats.squadId} = ${squads.id}
  ) = ${SQUAD_SIZE}`;

  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 86_400_000);

  const rows = await db()
    .select({
      playerId: accounts.id,
      username: accounts.username,
      rating: sql<number>`coalesce(${playerRatings.rating}, ${STARTING_RATING})`,
      visibleHoldStreak: squads.holdStreak,
      hiddenHoldStreak: sql<number>`coalesce((
        select h.hold_streak from ${squads} h
        where h.account_id = ${accounts.id} and h.kind = 'defense' and h.zone = 'hidden'
        limit 1
      ), 0)`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    /**
     * The Visible squad is the join, not a filter afterwards: **it is the only
     * squad anybody can choose to attack**, so a player without a complete one is
     * not a candidate at all. Hidden is reachable only by ambush, which 007 rolls
     * after the choice is made.
     */
    .innerJoin(
      squads,
      and(eq(squads.accountId, accounts.id), eq(squads.kind, 'defense'), eq(squads.zone, 'visible')),
    )
    .where(
      and(
        ne(accounts.id, accountId),
        seatedSix,
        // Gear restricts — and this is the only place it does.
        gte(effectiveGearScore, band.floor),
        lt(effectiveGearScore, band.ceiling),
        /**
         * **In the query, not a nightly job.** A job leaves a returning player
         * invisible until it next runs. The `isNull` arm is the seam above: with no
         * standing row, fall back to when the account was created.
         */
        or(
          gte(playerRatings.lastActivityAt, cutoff),
          and(isNull(playerRatings.lastActivityAt), gte(accounts.createdAt, cutoff)),
        ),
      ),
    )
    // Rating appears here and nowhere else in this query.
    .orderBy(desc(sql`coalesce(${playerRatings.rating}, ${STARTING_RATING})`), accounts.id);

  return {
    league,
    positionInLeague: positionInLeague(gearScore),
    gearScore,
    // Widening is Phase 7's, once bots exist to pad with. Never persisted.
    widened: false,
    candidates: rows.map((r) => ({
      playerId: r.playerId,
      username: r.username,
      // Bots are Phase 7. No account is one yet, and the field is not optional
      // because a client that has to ask twice will forget the second time.
      isBot: false,
      rating: Number(r.rating),
      visibleHoldStreak: r.visibleHoldStreak,
      hiddenHoldStreak: Number(r.hiddenHoldStreak),
    })),
    ambushChance: ambushChance(Number(own.attackStreak)),
    consecutiveWins: Number(own.attackStreak),
  };
}
