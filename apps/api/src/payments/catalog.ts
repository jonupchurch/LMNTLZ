/**
 * The whole storefront (011 T006, T036–T038).
 *
 * > **One product — the boost pair — in seven durations. Every price is a multiple
 * > of $5. There is no second currency. Nothing auto-renews. Shards cannot be
 * > bought.**
 *
 * What is sold is **speed, never ceiling**. A full kit is a common ceiling every
 * player reaches, so selling *time to reach it* is a categorically different thing
 * from selling power: a paying player and a free player who are both fully kitted
 * are exactly equal. The longest pass grants precisely the à la carte cap and
 * never more — it is a discount and a convenience, not a higher tier.
 *
 * ### There is no shard product, not even as a stub
 *
 * T038, and it is a real instruction rather than a caution. **This file is the
 * audit surface** for the claim that money never becomes shards: anyone checking
 * reads the catalog, and a commented-out or feature-flagged shard SKU makes that
 * check answer *"almost"*. `tests/payments/catalogRules.test.ts` scans for it.
 */

import { ENTITLEMENT_KINDS, type EntitlementKind } from '../db/schema/entitlements.js';

export interface Sku {
  readonly id: string;
  /** Cents, always a multiple of 500. */
  readonly price: number;
  readonly days: number;
  readonly grants: EntitlementKind;
}

/**
 * Seven durations of one product.
 *
 * The prices are **set 2026-07-27, converted to passes 2026-07-28**, and the
 * per-day rate falls as duration rises — which is what makes the long pass a
 * discount rather than a tier.
 */
export const CATALOG: readonly Sku[] = [
  { id: 'pass-3d', price: 500, days: 3, grants: 'boost-pass' },
  { id: 'pass-7d', price: 1_000, days: 7, grants: 'boost-pass' },
  { id: 'pass-12d', price: 1_500, days: 12, grants: 'boost-pass' },
  { id: 'pass-28d', price: 2_000, days: 28, grants: 'boost-pass' },
  { id: 'pass-91d', price: 5_000, days: 91, grants: 'boost-pass' },
  { id: 'pass-182d', price: 9_000, days: 182, grants: 'boost-pass' },
  { id: 'pass-364d', price: 16_000, days: 364, grants: 'boost-pass' },
];

export const skuById = (id: string): Sku | undefined => CATALOG.find((s) => s.id === id);

/**
 * **The honest ceiling on purchasable advantage in one year — computed, never a
 * constant** (T036).
 *
 * `$160`, because nobody rational buys thirteen 4-week passes at $260 for the same
 * 364 days. That reasoning is *arithmetic over the catalog*, so this walks the
 * catalog and finds the cheapest way to cover a year rather than restating the
 * answer.
 *
 * > **Why it must be computed.** A constant is a claim that stops being true the
 * > moment somebody adds a SKU, and it stops being true **silently** — the number
 * > on the pricing page keeps saying $160 while the real ceiling has moved.
 * > `tests/payments/ceiling.test.ts` adds a hypothetical `pass-500d` and asserts
 * > this answer changes; a constant would pass the first test and fail the world.
 *
 * Greedy by best rate is exact here because every SKU grants the same thing and
 * days are additive with no cap — the cheapest cost-per-day, repeated, is optimal,
 * and the final partial period is covered by whichever single SKU is cheapest for
 * the remainder.
 */
export function maxPurchasableAdvantage(days = 364, catalog: readonly Sku[] = CATALOG): number {
  if (catalog.length === 0) return 0;

  /** Cheapest total cost to cover at least `d` days. */
  const best = new Array<number>(days + 1).fill(Infinity);
  best[0] = 0;

  for (let d = 1; d <= days; d += 1) {
    for (const sku of catalog) {
      const remaining = Math.max(0, d - sku.days);
      const candidate = best[remaining]! + sku.price;
      if (candidate < best[d]!) best[d] = candidate;
    }
  }

  return best[days]!;
}

/**
 * The best shards-per-dollar any product offers — **the ratio features 012 and 014
 * ask for, rather than a threshold** (T037).
 *
 * A boost pass doubles shard income for the first 10 victories and 10 holds a day.
 * Returning the ratio rather than a yes/no keeps the judgment where it belongs:
 * 012 wants it to show what a purchase is worth, 014 wants it to reason about
 * whether a chat posting cost is meaningful, and a boolean here would force both
 * to re-derive it from prices they should not be reading.
 *
 * **Zero is the honest answer, and it is the important one**: no product converts
 * money into shards. The doubling is on income the player still has to *earn*.
 */
export function bestShardsPerDollar(): number {
  return 0;
}

/** Whether any product grants something other than the one gameplay-affecting kind. */
export function nonPassProducts(): readonly Sku[] {
  return CATALOG.filter((sku) => !ENTITLEMENT_KINDS.includes(sku.grants));
}

/** What `GET /v1/catalog` serves. */
export interface CatalogResponse {
  readonly skus: readonly Sku[];
  readonly currency: 'USD';
  readonly maxPurchasableAdvantagePerYear: number;
  readonly bestShardsPerDollar: number;
  /** **Nothing auto-renews**, stated in the payload rather than only in the copy. */
  readonly autoRenews: false;
  /** False when no rail is installed — the store is honest instead of erroring at checkout. */
  readonly available: boolean;
}
