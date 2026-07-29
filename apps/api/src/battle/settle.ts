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
import { battles, type BattleReason } from '../db/schema/battles.js';
import { squads, type SquadZone } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { nextAttackStreak } from '../squads/ambush.js';

/**
 * The engine says how the *fight* ended; this column says how the *record*
 * ended. See the table in `db/schema/battles.ts` — the three cap reasons
 * collapse into one, and `abandoned`/`discarded` have no engine counterpart at
 * all because the engine never saw those battles finish.
 */
export function reasonOf(conclusion: Conclusion): BattleReason {
  return conclusion.reason === 'wipe' ? 'elimination' : 'turn_cap';
}

export interface SettleResult {
  /** `false` when the battle was already settled. **Not an error** — see above. */
  readonly settled: boolean;
  readonly winner: 'attacker' | 'defender';
  readonly attackStreak: number;
  readonly holdStreak: number;
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

  return db().transaction(async (tx) => {
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
      .returning({ id: battles.id });

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
      };
    }

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
       * **A hold increments; a loss resets — and this rule is an assumption.**
       *
       * The design documents state only that *editing* a defense resets its
       * streak (`02-squads.md`, `08-guilds.md`). What a defeat does is nowhere
       * written down. Implemented as a reset because the number is scouted and
       * read as *"their Closed Gate has held 9 times"* — a count that survived
       * being beaten would be a claim about a squad that has demonstrably not
       * held, which is the same defect the edit rule exists to prevent.
       *
       * Flagged rather than assumed silently: if holds are meant to pay
       * (`06-progression.md` proposes it), this decides how much defense earns,
       * and it belongs in that pass rather than here.
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
     * **Not yet: the shard award and the rating update.**
     *
     * Both belong to feature 010, which has no wallet table and no rating column
     * to write to — `06-progression.md` is the design blocker and is parked on
     * purpose. They go inside this transaction when they exist, which is why the
     * transaction is here now rather than being introduced along with them: the
     * once-only guard is the hard part and it is done.
     *
     * The battle row itself is the metadata row feature 008 reads — `turnCount`,
     * both compositions, `defenderIsBot`, the version stamps — and it is written
     * above, inside the transaction, because Constitution XVI cannot backfill a
     * battle that settled without recording itself.
     */

    return { settled: true, winner: conclusion.winner, attackStreak, holdStreak };
  });
}
