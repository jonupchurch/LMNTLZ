/**
 * The rating ladder — **one visible number that converges and then stops**
 * (010 T030–T036).
 *
 * Settled 2026-07-27. An earlier draft carried two numbers, a hidden matchmaking
 * rating and visible ladder points, and flagged its own cost: *the number shown to
 * the player is not the number the game acts on*, which sits badly in a design
 * where the Visible squad is scoutable, hold streaks are public and the ambush
 * chance is always displayed. Two later decisions removed the reason for the
 * split — leagues match on **gear**, and the pool is every league-mate, so there
 * is no selection left to game.
 *
 * **So the rating is what you see, what you brag about, and what the game acts
 * on**, and it does exactly two jobs: standing, and the order league-mates are
 * offered in. It never restricts the pool.
 *
 * ### It converges; it does not accumulate — and that is a requirement, not a style
 *
 * `06-progression.md` requires ladder payouts to *"reward sustained standing
 * rather than volume."* **Raw accumulating points do the opposite**: at equal
 * skill, more hours means a higher placement, which would make the ladder the one
 * part of the economy that pays for grinding — in a game whose whole thesis is
 * that nobody can out-roster anyone.
 *
 * Elo satisfies it by construction. **A strong player with two hours outranks a
 * weaker one with twenty**, and beating somebody far below you moves you almost
 * nothing — so neither farming one weak defender nor grinding curated bots is a
 * rating strategy. Both are handled by the *shape of the number* rather than by a
 * rule that would have to be written, tested and evaded.
 *
 * ### Gear is not an input, and this file must never learn what a gear score is
 *
 * `09-matchmaking.md` keeps the axes apart: **gear restricts** who is in the pool,
 * **rating orders** it. Collapsing them would treat a well-played weak account and
 * a badly-played strong one as identical, which is precisely the distinction the
 * ladder exists to make (FR-023, SC-009).
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { playerRatings } from '../db/schema/ratings.js';
import {
  ELO_SCALE,
  HIDDEN_RATING_MULTIPLIER,
  K_ESTABLISHED,
  K_PROVISIONAL,
  K_SETTLING,
  PROVISIONAL_BATTLES,
  SETTLING_BATTLES,
  STARTING_RATING,
} from './config.js';

/**
 * The K factor for a player who has completed `ratedBattles` rated battles.
 *
 * **Boundaries are inclusive-below**, matching 009's `leagueOf` convention: the
 * 30th rated battle is still provisional, the 31st is settling. One convention for
 * every band table in the codebase is worth more than either boundary being
 * individually the more natural reading.
 */
export function kFactor(ratedBattles: number): number {
  if (ratedBattles < PROVISIONAL_BATTLES) return K_PROVISIONAL;
  if (ratedBattles < SETTLING_BATTLES) return K_SETTLING;
  return K_ESTABLISHED;
}

/**
 * Expected score for `rating` against `opponent` — the standard 400-point
 * logistic, where a 400-point lead is a 10:1 expectation.
 */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / ELO_SCALE));
}

export interface RatingOutcome {
  /** The attacker's rating before the battle. */
  readonly attacker: number;
  /** The defender's rating before the battle. */
  readonly defender: number;
  readonly attackerRatedBattles: number;
  readonly defenderRatedBattles: number;
  readonly attackerWon: boolean;
  /** Hidden doubles the **winner's positive delta** only. */
  readonly zone: 'visible' | 'hidden';
}

export interface RatingDeltas {
  readonly attacker: number;
  readonly defender: number;
}

/**
 * The rating change for both sides. **Pure** — the population harness runs
 * millions of these with no database in sight.
 *
 * ### The Hidden bonus makes rating non-zero-sum, deliberately
 *
 * A Hidden victory pays **double**; a loss costs the same in either zone. At even
 * ratings and K=10 that is:
 *
 * ```
 * Visible   +5.0 / −5.0   net  0
 * Hidden   +10.0 / −5.0   net +5.0
 * ```
 *
 * **This is intended and it is written down here because it is a discovered
 * surprise only if nobody wrote it down.** It exists as a counterweight: the shard
 * economy says fortify Visible (a Visible hold is the income you can actually
 * farm), so without a rating incentive pointing the other way, Hidden — the zone
 * the entire ambush mechanic exists to reach — is strictly dominated.
 *
 * Rounding is to one decimal rather than to an integer. Integer rounding at K=10
 * would quantise a near-even battle to ±5 and erase the gradient that makes the
 * rating converge on *who* you beat rather than on how many.
 */
export function ratingDeltas(outcome: RatingOutcome): RatingDeltas {
  const expectedAttacker = expectedScore(outcome.attacker, outcome.defender);
  const attackerScore = outcome.attackerWon ? 1 : 0;

  const kA = kFactor(outcome.attackerRatedBattles);
  const kD = kFactor(outcome.defenderRatedBattles);

  let attacker = kA * (attackerScore - expectedAttacker);
  let defender = kD * (1 - attackerScore - (1 - expectedAttacker));

  if (outcome.zone === 'hidden') {
    /** The winner's **positive** delta only — a loss costs the same in either zone. */
    if (attacker > 0) attacker *= HIDDEN_RATING_MULTIPLIER;
    if (defender > 0) defender *= HIDDEN_RATING_MULTIPLIER;
  }

  return { attacker: round1(attacker), defender: round1(defender) };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Apply a concluded battle's rating change to both accounts.
 *
 * **Called inside feature 007's conclusion transaction** (T035), so rating and the
 * battle record move together. A rating written outside that transaction is a
 * battle whose recorded rating-at-the-time can disagree with the ladder — and
 * Constitution XVI makes the battle record permanent, so the disagreement would
 * be too.
 *
 * Stored as an integer column; the one-decimal deltas accumulate through the
 * `+` in SQL and are rounded once on write, so a long series of near-even battles
 * still moves the stored number rather than rounding to nothing each time.
 */
export async function applyRating(
  attackerId: string,
  defenderId: string,
  deltas: RatingDeltas,
  tx: Pick<ReturnType<typeof db>, 'insert' | 'update'> = db(),
): Promise<void> {
  await Promise.all([
    bump(attackerId, deltas.attacker, tx),
    bump(defenderId, deltas.defender, tx),
  ]);
}

async function bump(
  accountId: string,
  delta: number,
  tx: Pick<ReturnType<typeof db>, 'insert' | 'update'>,
): Promise<void> {
  await tx
    .insert(playerRatings)
    .values({ accountId, rating: Math.round(STARTING_RATING + delta), ratedBattles: 1 })
    .onConflictDoUpdate({
      target: playerRatings.accountId,
      set: {
        /**
         * **The delta is bound as text and cast, not bound as a number.**
         *
         * Drizzle infers a bound parameter's type from the column it sits beside,
         * so `+ ${delta}` binds a *fractional* delta as `integer` and Postgres
         * rejects `-17.7` before the surrounding `round()` can ever see it. The
         * fraction is deliberate — integer rounding at K=10 would quantise a
         * near-even battle to ±5 and erase the gradient the ladder converges on —
         * so the cast belongs here rather than the precision being thrown away.
         */
        rating: sql`round(${playerRatings.rating} + cast(${String(delta)} as numeric))::int`,
        ratedBattles: sql`${playerRatings.ratedBattles} + 1`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Both numbers `ratingDeltas` needs about one player, read through the caller's
 * transaction so a settlement sees a consistent pair.
 *
 * An account with no row is at the starting rating with zero rated battles —
 * which puts them in the **provisional** K band, exactly where a player who has
 * never been rated should be.
 */
export async function standingFor(
  accountId: string,
  tx: Pick<ReturnType<typeof db>, 'select'> = db(),
): Promise<{ readonly rating: number; readonly ratedBattles: number }> {
  const [row] = await tx
    .select({ rating: playerRatings.rating, ratedBattles: playerRatings.ratedBattles })
    .from(playerRatings)
    .where(eq(playerRatings.accountId, accountId))
    .limit(1);

  return {
    rating: row?.rating ?? STARTING_RATING,
    ratedBattles: row?.ratedBattles ?? 0,
  };
}

/**
 * A player's current rating, defaulting to the starting value for an account that
 * has never been rated.
 *
 * **`STARTING_RATING` is a real answer here, not a placeholder** — unlike
 * `gear_score`, where 009 was careful to keep "never computed" distinguishable
 * from a real Bronze score. Everyone genuinely starts at 1000 and an unrated
 * player genuinely is at 1000; there is no second state to confuse it with.
 */
export async function ratingOf(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ rating: playerRatings.rating })
    .from(playerRatings)
    .where(eq(playerRatings.accountId, accountId))
    .limit(1);

  return row?.rating ?? STARTING_RATING;
}
