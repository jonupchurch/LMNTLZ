/**
 * A battle concludes exactly once (007 T026–T027, FR-012).
 *
 * ### This is a separate file from `act.ts`, and that is the task
 *
 * Folding settlement into the action path is how a battle pays out twice. The
 * action path is the one with a retry story: a client that loses its connection
 * resends, and the whole design of `idempotency.ts` exists so that resending is
 * safe. **A payout inside that path inherits none of those guarantees** — the
 * stored packet is returned identically, but any side effect the first call had
 * would run again on the second.
 *
 * ### "Exactly once" is enforced by the database, not by remembering
 *
 * ```sql
 * UPDATE battles SET concluded_at = now() ... WHERE id = ? AND concluded_at IS NULL
 * ```
 *
 * **Zero rows updated means somebody already settled**, and the whole
 * transaction stands down. Same shape as `(battle_id, sequence)` in the action
 * log, for the same reason: there is no window between a check and a write, and
 * two concurrent requests cannot both win.
 *
 * That makes settlement **self-healing** rather than fragile. Any request that
 * observes a concluded battle can call this — the final `act`, a retry of it, a
 * later `GET` — and only the first one does anything. So a settlement that fails
 * midway is retried by the next request instead of leaving a battle that ended
 * and never paid.
 *
 * ### What is inside the transaction and what is not
 *
 * Everything that must agree with the result is inside one transaction. The
 * replay blob (feature 008) goes **outside** it, and the asymmetry is
 * deliberate: a battle that settles but fails to record is invisible to every
 * aggregate, and the aggregate is the entire analytics product. A blob that
 * fails to write costs one replay.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { Conclusion } from '@lmntlz/sim/rules';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { battles, type BattleReason } from '../db/schema/battles.js';
import { squads, type SquadZone } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { insertRecord } from '../replays/record.js';
import { nextAttackStreak } from '../squads/ambush.js';
import { touchActivity } from '../matchmaking/candidates.js';
import { awardShards } from '../progression/income.js';
import { applyRating, ratingDeltas, standingFor } from '../progression/rating.js';
import { noteShardsEarned } from '../matchmaking/starterLeague.js';
import { lifetimeEarned } from '../progression/ledger.js';

/**
 * The engine says how the *fight* ended; this column says how the *record*
 * ended. See the table in `db/schema/battles.ts` — the three cap reasons
 * collapse into one, and `abandoned`/`discarded` have no engine counterpart at
 * all because the engine never saw those battles finish.
 */
export function reasonOf(conclusion: Conclusion): BattleReason {
  return conclusion.reason === 'wipe' ? 'elimination' : 'turn_cap';
}

/**
 * What one side walked away with — **the thing this function computed and threw
 * away for four features** (`specs/GAPS.md` §2c).
 *
 * A battle ended, `awardShards` credited the winner, `applyRating` moved both
 * ratings, and the only field any caller read was `settled`. So the end of a
 * fight said `Victory` and nothing else: no shards, no rating, no streak. The
 * seam was not missing — it was **called, and its answer discarded**, which is
 * why `rg settle` found a caller and the gap audit could not see it.
 */
export interface SettlePayout {
  /** Shards actually credited, after the daily cap. */
  readonly shards: number;
  /**
   * What the win was worth *before* the cap bit.
   *
   * Different from `shards` only when the player has hit their daily ceiling,
   * and that difference is the whole point of showing it: "you earned 60, you
   * banked 15" is information, while a silent 15 reads as a nerf.
   */
  readonly shardsEarned: number;
  /** The cap that truncated the award, or `null` if it did not. */
  readonly cappedAt: number | null;
  /** Signed, one decimal, already carrying the ×2 Hidden bonus on a win. */
  readonly ratingDelta: number;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
}

export interface SettleResult {
  /** `false` when the battle was already settled. **Not an error** — see above. */
  readonly settled: boolean;
  readonly winner: 'attacker' | 'defender';
  readonly attackStreak: number;
  readonly holdStreak: number;
  /**
   * **`null` on a repair pass, and that is deliberate.**
   *
   * Settlement is called by every request that observes a conclusion — the final
   * `act`, a retry of it, a later `GET` — and all but the first match zero rows.
   * Only the request that actually settled knows what was paid, because the
   * amounts are not persisted anywhere a later read could recover them.
   *
   * So a second reader gets `null`, never zeroes. **A zero would be a lie in the
   * shape of an answer**: indistinguishable from a genuinely capped-out player
   * who earned nothing, and the client would print "0 shards" over a battle that
   * paid 60. `null` says *"this request did not settle it"*, which is true.
   *
   * Persisting the amounts on `battle_records` so a refresh can reconstruct them
   * is a real follow-up and an XVI-class column addition — see `specs/GAPS.md`.
   */
  readonly attacker: SettlePayout | null;
  readonly defender: SettlePayout | null;
}

export interface SettleInput {
  readonly battleId: string;
  readonly attackerId: string | null;
  readonly defenderId: string | null;
  readonly zone: SquadZone;
  readonly conclusion: Conclusion;
  readonly turnCount: number;
  /** True when the server's ambush roll chose this battle, not the player. */
  readonly wasAmbush: boolean;
}

export async function settle(input: SettleInput, now: Date = new Date()): Promise<SettleResult> {
  const { battleId, attackerId, defenderId, zone, conclusion, turnCount, wasAmbush } = input;
  const attackerWon = conclusion.winner === 'attacker';

  const result = await db().transaction(async (tx) => {
    /**
     * **The guard and the write are one statement.** Reading `concluded_at`
     * first and updating after leaves a window that two requests fit through —
     * and the thing on the other side of that window is a double payout, which
     * is the one bug in this feature that costs real money to unwind.
     */
    const concluded = await tx
      .update(battles)
      .set({
        concludedAt: now,
        winner: conclusion.winner,
        reason: reasonOf(conclusion),
        turnCount,
      })
      .where(and(eq(battles.id, battleId), sql`${battles.concludedAt} is null`))
      /**
       * **Returning the record's source columns rather than selecting them.**
       *
       * Feature 008's permanent record is built from these, and a separate
       * `SELECT` would be a second observation of the same row — leaving the
       * record able to disagree with the settlement describing it. Since the
       * record is the analytics product and cannot be corrected after the fact,
       * "provably the same row" is worth more than a shorter returning clause.
       */
      .returning({
        id: battles.id,
        startedAt: battles.startedAt,
        attackerId: battles.attackerId,
        defenderId: battles.defenderId,
        defenderIsBot: battles.defenderIsBot,
        /**
         * **Returned rather than re-read**, which is why they had to live on `battles` at
         * all: `insertRecord` takes no second `SELECT`, so the permanent record can only
         * carry what the concluding `UPDATE` hands it. See the columns' own note.
         */
        attackerLeague: battles.attackerLeague,
        defenderLeague: battles.defenderLeague,
        attackerRating: battles.attackerRating,
        defenderRating: battles.defenderRating,
        zone: battles.zone,
        attackerSquad: battles.attackerSquad,
        defenderSnapshot: battles.defenderSnapshot,
        engineVersion: battles.engineVersion,
        contentVersion: battles.contentVersion,
        buildSha: battles.buildSha,
      });

    if (concluded.length === 0) {
      const [already] = await tx
        .select({ winner: battles.winner })
        .from(battles)
        .where(eq(battles.id, battleId))
        .limit(1);

      return {
        settled: false,
        winner: (already?.winner ?? conclusion.winner) as 'attacker' | 'defender',
        attackStreak: 0,
        holdStreak: 0,
        /* Nothing was paid by *this* call, and nothing that was paid earlier is
           recoverable from here. `null`, never zero — see `SettleResult`. */
        attacker: null,
        defender: null,
      };
    }

    /**
     * **The permanent record, inside this transaction** (008 T014).
     *
     * First among the writes that follow, and that ordering is deliberate: it is
     * the only one that can never be reconstructed. Streaks can be recomputed
     * from records; a record cannot be recomputed from anything.
     *
     * The **replay blob** is written by the caller *after* this commits — see
     * `replays/record.ts` for why the two must not share a code path. In short: a
     * blob write is a network call to a third party, and a transaction held open
     * across it makes a Blob outage into an inability to finish battles.
     */
    await insertRecord(tx, {
      source: { ...concluded[0]!, battleId },
      conclusion,
      turnCount,
      concludedAt: now,
    });

    let attackStreak = 0;

    if (attackerId) {
      const [row] = await tx
        .select({ current: playerStreaks.attackStreak, best: playerStreaks.bestAttackStreak })
        .from(playerStreaks)
        .where(eq(playerStreaks.accountId, attackerId))
        .limit(1);

      /**
       * **An ambushed loss does not reset the attack streak.** The player did
       * not choose that fight — the ambush chose them, and it is the harder one
       * because Hidden squads pay more. Resetting on it would make the reward
       * for a long streak be that the streak ends, and the correct play near the
       * cap would be to stop attacking. `nextAttackStreak` owns that rule; this
       * only supplies whether it was an ambush.
       */
      const next = nextAttackStreak(row?.current ?? 0, attackerWon ? 'win' : 'loss', wasAmbush);
      attackStreak = next.attackStreak;

      await tx
        .insert(playerStreaks)
        .values({
          accountId: attackerId,
          attackStreak,
          bestAttackStreak: Math.max(row?.best ?? 0, attackStreak),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: playerStreaks.accountId,
          set: {
            attackStreak,
            bestAttackStreak: sql`greatest(${playerStreaks.bestAttackStreak}, ${attackStreak})`,
            updatedAt: now,
          },
        });
    }

    let holdStreak = 0;

    if (defenderId) {
      /**
       * **A hold increments; a loss resets.** Settled 2026-07-29 and now written
       * down in `02-squads.md` — *"A defeat resets it too"*. It was implemented
       * here first and flagged as an assumption; the rule confirms it.
       *
       * The reason is the same one the edit rule has: the number is **scouted**,
       * and what it claims is that this squad turns attackers away. A count that
       * survived being beaten would keep asserting *"their Closed Gate has held
       * 9 times"* about a squad that just failed to hold.
       *
       * **Consequence for feature 010:** if holds pay, they pay *per hold*.
       * A milestone payout on streak length would be destroyed by a single
       * defeat the defender never chose to take — the same double punishment
       * `nextAttackStreak` refuses for an ambushed attacker.
       *
       * A **discard** never reaches here (see `discard` below): no fight
       * happened, so neither streak moves.
       */
      const [row] = await tx
        .select({ id: squads.id, holdStreak: squads.holdStreak })
        .from(squads)
        .where(
          and(
            eq(squads.accountId, defenderId),
            eq(squads.kind, 'defense'),
            eq(squads.zone, zone),
          ),
        )
        .limit(1);

      if (row) {
        holdStreak = attackerWon ? 0 : row.holdStreak + 1;
        await tx.update(squads).set({ holdStreak }).where(eq(squads.id, row.id));
      }
    }

    /**
     * **The shard award and the rating update** (010 T035, T051).
     *
     * Inside the transaction, and that placement is the whole point: settlement is
     * guarded by `WHERE concluded_at IS NULL`, so a battle settles exactly once,
     * and anything paid outside this block could be paid twice by a concurrent
     * request that lost the settlement race but still ran to completion.
     *
     * The battle row itself is the metadata row feature 008 reads — `turnCount`,
     * both compositions, `defenderIsBot`, the version stamps — and it is written
     * above, inside the transaction, because Constitution XVI cannot backfill a
     * battle that settled without recording itself.
     *
     * **A `null` account is skipped rather than defaulted.** Either id may be null
     * because a deleted account nulls the column instead of removing the battle;
     * there is nobody to pay and nobody whose rating means anything.
     */
    const incomeZone = zone === 'hidden' ? 'hidden' : 'visible';

    /*
     * **These two were already being computed and dropped on the floor.** The
     * only change below is that the awards are bound to names and the deltas are
     * held rather than passed straight through — the arithmetic, the ordering and
     * the transaction are untouched, so this cannot alter what any battle pays.
     */
    const attackerAward = attackerId
      ? await awardShards(
          attackerId,
          {
            kind: attackerWon ? 'attack-victory' : 'loss',
            /** An ambush pays as Hidden whichever zone the squad sits in. */
            zone: wasAmbush ? 'hidden' : incomeZone,
          },
          battleId,
          new Date(),
          tx,
        )
      : null;

    const defenderAward = defenderId
      ? await awardShards(
          defenderId,
          { kind: attackerWon ? 'loss' : 'defense-hold', zone: incomeZone },
          battleId,
          new Date(),
          tx,
        )
      : null;

    let deltas: { attacker: number; defender: number } | null = null;
    let before: { attacker: number; defender: number } | null = null;

    if (attackerId && defenderId) {
      const [attackerStanding, defenderStanding] = await Promise.all([
        standingFor(attackerId, tx),
        standingFor(defenderId, tx),
      ]);

      /*
       * **Captured before `applyRating`, because that is what "before" means.**
       * Re-reading the standing afterwards to compute a delta would be a second
       * observation of a row this transaction just wrote — the same mistake the
       * `.returning()` clause above exists to avoid.
       */
      before = { attacker: attackerStanding.rating, defender: defenderStanding.rating };
      deltas = ratingDeltas({
        attacker: attackerStanding.rating,
        defender: defenderStanding.rating,
        attackerRatedBattles: attackerStanding.ratedBattles,
        defenderRatedBattles: defenderStanding.ratedBattles,
        attackerWon,
        zone: incomeZone,
      });

      await applyRating(attackerId, defenderId, deltas, tx);
    }

    /**
     * One side's slice of what just happened, or `null` if there is no account.
     *
     * ### ⚠️ The reported rating must match what the DATABASE stores, not what
     * the formula produced
     *
     * `ratingDeltas` is deliberately fractional — *"integer rounding at K=10
     * would quantise a near-even battle to ±5 and erase the gradient"* — but
     * `applyRating` writes `round(rating + delta)::int`. So the stored rating is
     * an **integer**, and a payout reporting `+17.7 → 1197.7` would print a
     * number no row anywhere holds, against a rating the player's profile shows
     * as 1198.
     *
     * So `ratingAfter` reproduces the SQL exactly, and `ratingDelta` is derived
     * back out of it as the movement that *actually happened*. The banner then
     * adds up — `1180 +18 → 1198` — which it would not if the fractional delta
     * were shown beside the rounded rating.
     */
    const payoutFor = (side: 'attacker' | 'defender'): SettlePayout | null => {
      const award = side === 'attacker' ? attackerAward : defenderAward;
      if (!award) return null;
      const ratingBefore = before?.[side] ?? 0;
      const ratingAfter = Math.round(ratingBefore + (deltas?.[side] ?? 0));
      return {
        shards: award.credited,
        shardsEarned: award.earned,
        cappedAt: award.cappedAt,
        ratingDelta: ratingAfter - ratingBefore,
        ratingBefore,
        ratingAfter,
      };
    };

    return {
      settled: true,
      winner: conclusion.winner,
      attackStreak,
      holdStreak,
      attacker: payoutFor('attacker'),
      defender: payoutFor('defender'),
    };
  });

  /**
   * **Fighting a battle is activity** (009 `candidates.ts`), and this is the second
   * of the two callers `touchActivity()` shipped without.
   *
   * Both sides are stamped, not only the attacker. A defender who is being attacked
   * is demonstrably in somebody's pool and their squad is demonstrably worth
   * attacking — dropping them out of everyone else's pool thirty days later, because
   * they had not personally logged in, would thin the pool for no reason. And the
   * attacker's own defense stays offerable for the same reason.
   *
   * **Outside the transaction, and after it.** An activity timestamp is not part of
   * the settlement: a failure to write it must not roll back a concluded battle, and
   * a battle that concluded is a fact regardless. Awaited rather than floated,
   * because on this platform the function is torn down when the response returns and
   * an unawaited write may simply never run.
   */
  if (result.settled) {
    // Either id may be `null` — a deleted account nulls the column rather than
    // removing the battle, because the past is immutable.
    const present = [attackerId, defenderId].filter((id): id is string => id !== null);
    try {
      await Promise.all(present.map((id) => touchActivity(id)));
    } catch (err) {
      console.warn(`[battle] could not stamp activity for ${battleId}: ${String(err)}`);
    }

    /**
     * **The starter-league shard signal** (010 T051 · 009 FR-022, exit 2).
     *
     * A push rather than a pull, which is 009's own design: 010 calls in when it
     * credits shards rather than 009 reaching into an economy that did not exist.
     * `noteShardsEarned` is idempotent — it returns early unless the account is
     * still in the nursery and has crossed 3,250 lifetime — so calling it after
     * every settlement costs one query and nothing else.
     *
     * **Outside the transaction, for the same reason as the activity stamp.**
     * Graduating from the starter league is a consequence of a battle, not part of
     * it; a failure here must not roll back a concluded fight. Without this caller
     * exit 2 could never fire and a heavy player would serve the full week instead
     * of leaving on day 4.8.
     */
    try {
      await Promise.all(
        present.map(async (id) => noteShardsEarned(id, await lifetimeEarned(id))),
      );
    } catch (err) {
      console.warn(`[battle] could not check starter exit for ${battleId}: ${String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// T038, T045 — the discard, which is a no-op with a refund
// ---------------------------------------------------------------------------

export type DiscardCause = 'expired' | 'maintenance' | 'engine-version';

export interface DiscardResult {
  readonly discarded: boolean;
  /** True when this discard incremented the account's abandonment counter. */
  readonly counted: boolean;
}

/**
 * End a battle **without it having happened** (FR-013, FR-016).
 *
 * ### Three ways in, one behaviour
 *
 * A battle expires after 24 hours untouched, is dropped by a maintenance
 * window, or becomes unresolvable because the engine moved under it. In every
 * case the answer is the same and it is total: **no win, no loss, no shards, no
 * rating movement, no ambush-streak change, no hold-streak change.**
 *
 * FR-016 lists rating, rewards *and* the attempt, and the reason it enumerates
 * them is that a partial implementation refunding two of the three is the exact
 * support ticket the rule exists to prevent — and it is invisible, because the
 * two that worked look like the whole thing worked.
 *
 * ### Counting the discard is not recording the battle
 *
 * The battle row is deleted; the account's `abandonedBattles` counter goes up
 * on an expiry. Those are different claims. A discarded battle left in
 * `battles` would be counted by every aggregate feature 008 computes — and
 * since those aggregates *are* the analytics product, a fight nobody finished
 * would silently misreport the game forever. A counter says somebody walked
 * away, which is a real operational signal and a plausible client-bug detector,
 * without asserting that a battle took place.
 *
 * **Only `expired` counts.** A maintenance discard and a version discard are
 * the operator's doing, not the player's, and counting them would put a mark on
 * an account for something it did not do.
 */
export async function discard(
  battleId: string,
  cause: DiscardCause,
  accountId: string | null,
): Promise<DiscardResult> {
  return db().transaction(async (tx) => {
    /**
     * **Guarded on `concluded_at IS NULL` exactly as `settle` is.** A battle
     * that already paid out must never be deleted — that would erase a real
     * result and leave the rewards it produced with nothing behind them.
     */
    const removed = await tx
      .delete(battles)
      .where(and(eq(battles.id, battleId), sql`${battles.concludedAt} is null`))
      .returning({ id: battles.id });

    if (removed.length === 0) return { discarded: false, counted: false };

    /**
     * The action log goes with it, by `on delete cascade`. Nothing else needs
     * unwinding, and that is the design working rather than luck: a battle in
     * progress has written to exactly one table, because in-progress state is
     * never stored anywhere else.
     */
    if (cause === 'expired' && accountId) {
      await tx
        .update(accounts)
        .set({ abandonedBattles: sql`${accounts.abandonedBattles} + 1` })
        .where(eq(accounts.id, accountId));

      return { discarded: true, counted: true };
    }

    return { discarded: true, counted: false };
  });
}
