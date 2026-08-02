/**
 * Reading the shard ledger (010 T004).
 *
 * **The balance is `SUM(delta)` and is never stored.** A materialised balance is a
 * cache, and a cache is an invalidation bug waiting for a concurrent write — two
 * battles settling at once, a purchase landing mid-rebuild. The ledger has no such
 * failure mode: rows are appended and the sum is whatever the rows say.
 *
 * The cost of that is one aggregate per read, over an index that is already
 * `(account_id, created_at)`. For a per-account row count that grows by a handful
 * a day, this is not the query that will ever need attention.
 *
 * > **If a balance column is ever proposed, the argument to answer first is
 * > `schema/ledger.ts`'s**: the ledger's other answers — what the curve paid, how
 * > much of the economy is prizes, and *how much real spend a nerf would write
 * > off* — cannot be backfilled from a counter.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { shardLedger, type LedgerReason } from '../db/schema/ledger.js';
import { dayStart } from './config.js';

/** Reasons that represent battle income, for the daily victory count. */
const VICTORY_REASONS: readonly LedgerReason[] = ['attack-victory'];

/** The defense half, for the boost pass's separate ten-a-day cap. */
const HOLD_REASONS: readonly LedgerReason[] = ['defense-hold'];

/**
 * A player's current spendable balance.
 *
 * Returns `0` for an account with no rows — which here is honest rather than a
 * placeholder, because a player with no ledger rows genuinely has no shards. (The
 * `null`-vs-`0` care that `gear_score` needs does not apply: there is no
 * "never computed" state for a sum over zero rows.)
 */
export async function balance(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`coalesce(sum(${shardLedger.delta}), 0)::int` })
    .from(shardLedger)
    .where(eq(shardLedger.accountId, accountId));

  return row?.total ?? 0;
}

/**
 * **Lifetime earned, never the current balance** — positive income rows only.
 *
 * This is what feature 009's `noteShardsEarned()` wants: spending must not put a
 * graduated player back in the starter league, so the starter exit is keyed to
 * what a player has *made*, not to what they have left.
 *
 * Grants are excluded deliberately. A compensation grant after a balance change is
 * an apology, and it should not graduate somebody out of the nursery as a side
 * effect of a patch they did not cause.
 */
export async function lifetimeEarned(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`coalesce(sum(${shardLedger.delta}), 0)::int` })
    .from(shardLedger)
    .where(
      and(
        eq(shardLedger.accountId, accountId),
        /**
         * **The allowlist gained the two streak reasons** (2026-08-01), because
         * both are battle income: won in a fight, on the same cap, from the same
         * settlement.
         *
         * It cannot change any behaviour today and is done for the classification
         * rather than the effect — this figure gates starter-league graduation,
         * and a hundred consecutive attack wins is thousands of shards past that
         * exit. Leaving them out would be a rule that happens to be unreachable,
         * which is the kind that is wrong the first time a threshold moves.
         */
        sql`${shardLedger.reason} in ('attack-victory', 'defense-hold', 'streak-bonus', 'streak-broken')`,
      ),
    );

  return row?.total ?? 0;
}

/**
 * How many attack victories this account has been paid for **since the day
 * boundary** — the input to the daily curve.
 *
 * Counted from the ledger rather than from a column on the account, so the tier a
 * payout landed in stays auditable after the fact. A counter would answer *how
 * many today* and lose *what each one actually paid*.
 */
export async function victoriesToday(accountId: string, now: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(shardLedger)
    .where(
      and(
        eq(shardLedger.accountId, accountId),
        gte(shardLedger.createdAt, dayStart(now)),
        sql`${shardLedger.reason} in ${VICTORY_REASONS}`,
      ),
    );

  return row?.n ?? 0;
}

/**
 * How many defense holds this account has been paid for **since the day
 * boundary** (011 T046).
 *
 * A separate counter from `victoriesToday` rather than one function with a
 * `reason` parameter, because the two answer questions with different rules:
 * victories drive the daily *tier*, and holds are never tiered. This one exists
 * only for the boost pass's ten-a-day cap, which the storefront table states
 * separately for attacking and defending — *first 10 victories* and *first 10
 * holds*, so ten attack wins do not consume the defense allowance.
 */
export async function holdsToday(accountId: string, now: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(shardLedger)
    .where(
      and(
        eq(shardLedger.accountId, accountId),
        gte(shardLedger.createdAt, dayStart(now)),
        sql`${shardLedger.reason} in ${HOLD_REASONS}`,
      ),
    );

  return row?.n ?? 0;
}

/**
 * Append one row. **The only write path to the ledger**, and there is deliberately
 * no update and no delete beside it.
 *
 * `tx` is accepted so a caller inside a transaction — settlement, a rune rebuild —
 * writes through the same path rather than opening a second connection and
 * escaping the transaction's atomicity.
 */
export async function append(
  accountId: string,
  delta: number,
  reason: LedgerReason,
  battleId: string | null = null,
  tx: Pick<ReturnType<typeof db>, 'insert'> = db(),
): Promise<void> {
  await tx.insert(shardLedger).values({ accountId, delta, reason, battleId });
}
