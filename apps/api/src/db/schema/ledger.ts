/**
 * The shard ledger — **append-only, and the balance is never stored** (010 T003).
 *
 * Every shard a player has ever earned, been granted or spent is one row here.
 * There is no `balance` column on `accounts` and there must never be one:
 * `progression/ledger.ts` derives the balance as `SUM(delta)` on read.
 *
 * ### Why a ledger rather than a counter
 *
 * A counter is one `UPDATE` per transaction and answers exactly one question —
 * *how much do they have right now* — while silently losing every other one. The
 * ledger answers all of them from the same rows: what the daily curve actually
 * paid, whether the cap is biting, how much of the economy is prizes rather than
 * play, and — the one that matters most under the no-nerf rule — **how much real
 * spend a proposed balance change would write off**. `06-progression.md` makes
 * granting shards to everybody the standard apology for a nerf, and the size of
 * that grant is a query against this table.
 *
 * That reasoning is the same one Constitution XVI makes about `battle_records`,
 * and it fails the same way: **a counter cannot be backfilled into a history**. If
 * this ships as a column, the answers are gone for every row written before
 * somebody notices.
 *
 * ### Append-only is enforced by there being no other path
 *
 * No `UPDATE`, no `DELETE`, anywhere. A correction is a **new compensating row**,
 * which is why `delta` is signed rather than an amount plus a direction. The rule
 * is scanned rather than trusted — `tests/progression/ledger.test.ts` greps
 * `apps/api/src` for `UPDATE shard_ledger` and `DELETE FROM shard_ledger` and
 * fails on a hit.
 *
 * > **A refund would be a compensating row and there is deliberately no code that
 * > writes one.** Rune destruction on replacement is the load-bearing rule of the
 * > economy (FR-008, Constitution XIV); a refund path would quietly undo it.
 *
 * ### `battle_id` is nullable because most rows have no battle
 *
 * Income rows carry the battle that produced them, which is what lets a payout be
 * audited back to the fight it came from. Grants, purchases and rune spend have no
 * battle and store `null` — **not a sentinel**, for the same reason 009 made
 * `gear_score` nullable: *"never had one"* and *"had one, it was zero"* are
 * different facts and a reader must be able to tell them apart.
 */

import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { battles } from './battles.js';

/**
 * Why a row exists. **Stored as text rather than a pg enum**: the set grows every
 * time a feature learns to pay or charge (011 buys, 013 pays guild events), and a
 * migration per addition buys nothing when the column is only ever read by
 * queries that already know the values they care about.
 */
export const LEDGER_REASONS = [
  /** Battle income — an attack victory. Tiered by the daily curve. */
  'attack-victory',
  /** Battle income — a successful defense. Never tiered. */
  'defense-hold',
  /**
   * **The tail of a long attack streak** (2026-08-01) — `streak − 100`, paid on
   * top of the ordinary victory award and written as its **own row**.
   *
   * A separate row rather than a larger `attack-victory`, because the two answer
   * different questions and a tuner needs to be able to ask them apart: *what
   * does a win pay* and *what is the streak tail costing the economy*. Folded
   * together, the only way to find out would be to reconstruct every player's
   * streak history from the battle table.
   */
  'streak-bonus',
  /**
   * **A defense that ended somebody's run** (2026-08-01), paid the whole streak.
   *
   * Distinct from `defense-hold` for the same reason: it is a bounty, it can be
   * an order of magnitude larger than the hold it accompanies, and an aggregate
   * that could not separate them would read as defensive income having exploded.
   */
  'streak-broken',
  /** Rune stage purchase, one row per stage. */
  'rune-stage',
  /** A rebuild: the single 650 charge that destroys and replaces a full rune. */
  'rune-rebuild',
  /**
   * **Melting a hero's runes down — the only positive row that is not income**
   * (2026-08-01).
   *
   * It reverses the player's own spend at `REFUND_RATE`, which makes it a
   * different kind of thing from every other credit here and is why it gets its
   * own reason rather than borrowing `grant`:
   *
   * - It **bypasses the balance cap**, like a grant. Capping it would confiscate
   *   shards a player had already paid, and confiscate them from exactly the
   *   heavily-invested players who are the ones with runes worth melting.
   * - It must **never count as lifetime earned**, or a player placing and
   *   refunding in a loop would graduate out of the starter league without ever
   *   winning a battle. `lifetimeEarned` is an **allowlist** of
   *   `attack-victory · defense-hold`, so this is excluded by construction rather
   *   than by anybody remembering to exclude it — which is the argument for
   *   adding a reason here instead of reusing `grant`.
   */
  'rune-refund',
  /** A prize — event placement, ladder finish, or blanket compensation. Bypasses the cap. */
  'grant',
  /** Bought with money (011). Refused *before* the rail if it would exceed the cap. */
  'purchase',
  /**
   * A voluntary rename (012). **A forced rename never writes a row at all** —
   * it is free, so there is nothing to record, and a zero-delta row would show
   * up in a player's history as a charge they can see and cannot explain.
   */
  'rename',
  /**
   * A custom avatar submission (012), charged **per change and on submission**.
   * A rejection refunds nothing, so there is never a matching credit — which is
   * the throttle, not an oversight.
   */
  'avatar',
  /**
   * Founding a guild (013), 650 — one full rune. **Non-refundable on disband**,
   * so there is never a matching credit. *A guild costs 650 to hold*, not *you
   * get your money back*.
   */
  'guild-founding',
  /**
   * Succession (013), and **the only reason that writes two rows for one event**:
   * −650 from the inheriting officer, +650 to the displaced master, same instant.
   *
   * It is a *transfer*, not revenue — it prices a manual support ticket and makes
   * the displaced master whole. SC-006 asserts the pair sums to zero, which is
   * checkable precisely because both rows carry this reason.
   */
  'guild-succession',
  /**
   * A chat embed (014) — 5 looking-for-guild · 10 own squad · 10 Visible replay ·
   * 25 an opponent's Visible wall.
   *
   * **Charged after the blocklist and before the write**, which is the ordering
   * FR-010 turns on: a player must never pay for a message that is then refused,
   * because refunding is a second mechanism and a second thing to get wrong.
   *
   * **Guild ads are not here, deliberately.** They are funded from a guild's own
   * daily credits and never from a member's shards (FR-019), so they touch no
   * personal ledger at all — the two economies do not meet, and a reason shared
   * between them is the first place that would stop being true.
   */
  'chat-embed',
] as const;

export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const shardLedger = pgTable(
  'shard_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /**
     * **Signed.** Positive credits, negative charges. A correction is a new row
     * with the opposite sign, never an edit to an existing one.
     */
    delta: integer('delta').notNull(),

    reason: text('reason').$type<LedgerReason>().notNull(),

    /**
     * The battle that produced this row, for income only. `null` everywhere else
     * and never `0`.
     *
     * **`onDelete: 'set null'` rather than cascade.** A battle can be expired by
     * 007's sweep; the shards it paid were still earned, and deleting the ledger
     * row with it would silently reduce a balance that a player already spent
     * against.
     */
    battleId: uuid('battle_id').references(() => battles.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * `balance()` sums every row for one account, and the daily curve counts one
     * account's victories since the day boundary. Both are account-then-time.
     */
    index('shard_ledger_account_created_idx').on(table.accountId, table.createdAt),
  ],
);

export type ShardLedgerRow = typeof shardLedger.$inferSelect;
