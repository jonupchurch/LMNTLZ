/**
 * The balance cap — **one number, three deliberately different behaviours**
 * (010 T047–T050).
 *
 * | At the cap | | |
 * |---|---|---|
 * | **Battle income** | stops | FR-014 — silently: no overflow, no queue, no notification beyond the balance |
 * | **A grant** | lands, and may carry the balance **above** the cap | FR-015 |
 * | **A purchase** | is refused, **before the payment rail is touched** | FR-016 |
 *
 * **They are three functions, not one function with a flag.** An implementation
 * with a single `if (balance >= CAP)` gets at most one of the three right, and the
 * two it gets wrong fail in opposite directions — one denies a player shards they
 * were promised, the other takes money for shards that cannot be delivered.
 * `tests/progression/cap.test.ts` is three separate tests for the same reason.
 *
 * ### Why a grant must bypass it, which is the whole point of the cap's asymmetry
 *
 * Runes are destroyed on replacement, so a balance change writes off real spend —
 * that is the origin of the balance-upward rule (Constitution XIV). When a nerf is
 * genuinely the answer, `06-progression.md` makes **granting shards to everybody**
 * the compensating mechanism.
 *
 * A cap that applied to grants would swallow the apology, and it would swallow it
 * **for exactly the players most affected** — the heavily-invested ones, who are
 * the likeliest to be sitting near the cap when the patch lands. The asymmetry is
 * not an exception to the cap; it is the reason the cap can exist at all.
 */

import { BALANCE_CAP, CAP_IN_RUNES } from './config.js';
import { append, balance } from './ledger.js';
import type { LedgerReason } from '../db/schema/ledger.js';

/**
 * How much more this account can receive from **battle income** before the cap.
 *
 * Never negative: a balance carried above the cap by a grant reports `0` headroom
 * rather than a negative one, so `Math.min(earned, headroom)` in `awardShards`
 * cannot turn into a charge.
 */
export async function headroom(accountId: string): Promise<number> {
  return Math.max(0, BALANCE_CAP - (await balance(accountId)));
}

/**
 * Credit shards that **ignore the cap** — prizes, event placements, ladder
 * finishes and blanket compensation (FR-015).
 *
 * **A deliberately separate function from `awardShards`**, and the separation is
 * the safety property: the cap cannot be forgotten in one place and applied in the
 * other, because neither function can express the other's behaviour.
 */
export async function grantShards(
  accountId: string,
  amount: number,
  reason: LedgerReason = 'grant',
): Promise<number> {
  if (amount <= 0) return balance(accountId);

  await append(accountId, amount, reason);
  return balance(accountId);
}

/** Why a purchase cannot be accepted. One member today; 011 may add more. */
export type PurchaseRefusal = 'would-exceed-cap';

export type PurchaseVerdict =
  | { readonly ok: true; readonly headroom: number }
  | { readonly ok: false; readonly reason: PurchaseRefusal; readonly headroom: number };

/**
 * Whether `amount` shards may be sold to this account — **for feature 011 to call
 * before invoking the payment rail** (FR-016).
 *
 * > **This one has a money consequence.** Never take money for shards that cannot
 * > be delivered. `tests/progression/cap.test.ts` asserts it by injecting a
 * > failure into the rail and confirming the rail was **never reached** — checking
 * > that the purchase was refused is not the same claim, and only one of them is
 * > the one that matters to a customer's card.
 *
 * Unlike income, a purchase is **refused whole rather than truncated**. Selling
 * somebody a partial quantity they did not choose is worse than declining, and a
 * player told their headroom can decide for themselves.
 */
export async function canAcceptPurchase(
  accountId: string,
  amount: number,
): Promise<PurchaseVerdict> {
  const room = await headroom(accountId);
  if (amount > room) return { ok: false, reason: 'would-exceed-cap', headroom: room };
  return { ok: true, headroom: room };
}

/**
 * The cap as a player is shown it — **ten full runes, never a bare 6,500**
 * (FR-017).
 *
 * `06-progression.md`: *"A cap of 6,500 is unmemorable; ten full runes is a
 * quantity a player can reason about without being told, and it moves
 * automatically if a rune's price ever does."*
 */
export function capDescription(): { readonly shards: number; readonly runes: number } {
  return { shards: BALANCE_CAP, runes: CAP_IN_RUNES };
}
