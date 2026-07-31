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
 * **No SKU hands over shards. This is the audit claim and it stays absolute.**
 *
 * The catalog is the surface anyone checks to confirm that money never *directly*
 * buys currency — which is why T038 forbids even a commented-out or feature-flagged
 * shard SKU, and why `catalogRules.test.ts` scans for one.
 *
 * Split out from `bestShardsPerDollar()` on **2026-07-30**, because that function
 * was answering this question and being consumed as though it answered a different
 * one. See below.
 *
 * ### It checks the id, because the type already checks the grant
 *
 * `Sku['grants']` is `EntitlementKind`, which is `'boost-pass'` and nothing else —
 * so `sku.grants !== 'shards'` is a comparison TypeScript rejects as having no
 * overlap. **The type makes a shard grant unrepresentable, which is the strongest
 * form of this guarantee and needs no test at all.**
 *
 * What a type cannot stop is a SKU that *is* shards wearing the pass's grant, so
 * the runtime check is on the id. That one can fail, which is the only reason to
 * write it.
 */
export const noShardSku = (): boolean =>
  CATALOG.every((sku) => !/shard|currency|coin|gem/i.test(sku.id));

/**
 * How many shards a day a boost pass is worth.
 *
 * **Published in `06-progression.md`, not chosen here**: *"Boosts double income
 * within the caps: **+388/day** × 28 = +10,864"*, for a typical day of 20 attacks
 * and 10 holds. It is an average over a modelled player, so it is an estimate of a
 * real quantity rather than a constant of the design — which is exactly why it is
 * named, sourced and used in one place instead of inlined.
 */
export const BOOST_SHARDS_PER_DAY = 388;

/**
 * The best shards-per-dollar any product offers — **computed over the catalog**
 * (T037).
 *
 * ### This returned `0` and it made FR-015 unfalsifiable
 *
 * The old body was `return 0`, on the reasoning that *"no product converts money
 * into shards; the doubling is on income the player still has to earn."* The first
 * half is true and is now `noShardSku()`. The second half is a real distinction and
 * **it is not the question either caller is asking.**
 *
 * 012's FR-015 requires a dual-priced item to be **worse** shards-per-dollar than
 * the best pass. Against `0`, *any* dual price is better, so the requirement forbids
 * dual pricing outright and SC-008 can never pass — and a check that cannot pass is
 * one everybody learns to ignore. **I reported SC-008 as unsatisfiable on the
 * strength of this number, and it was the number that was wrong.**
 *
 * Computed, the answer is **~883/$** on the 364-day pass, against the custom
 * avatar's implied **270/$**. FR-015 holds with a **3.3× margin**, for a reason.
 *
 * > **The realised rate depends on playing.** A pass only pays out on battles
 * > actually fought, so this is the rate for a *typical* day. Parity with the
 * > avatar arrives at about **31% of typical volume — roughly 6 attacks a day** —
 * > and below that the avatar really is the better money→shards path. That is a
 * > tuning fact worth knowing, not a violation: the players below the line are the
 * > ones least likely to be optimising it, and they would have to want avatar
 * > changes to realise it at all.
 *
 * Computed rather than stated for the same reason `maxPurchasableAdvantage` is: a
 * constant is a claim that stops being true the moment a price moves, silently.
 */
export function bestShardsPerDollar(catalog: readonly Sku[] = CATALOG): number {
  return Math.max(
    ...catalog.map((sku) => (BOOST_SHARDS_PER_DAY * sku.days) / (sku.price / 100)),
  );
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
  /**
   * **What appears on the card statement** (018 T027 · 011 FR-007).
   *
   * Served rather than written into the client, for the same reason the guild
   * founding cost is: it is an environment value (`STATEMENT_DESCRIPTOR`) that
   * must match what the provider dashboard is configured with, and a second
   * copy in a bundle would be correct until somebody changed one of them.
   *
   * It has to be **adjacent to the pay control**, not in a footer — an
   * unrecognised line on a statement is what a chargeback is made of, and the
   * moment to prevent one is while the player is looking at the button.
   */
  readonly statementDescriptor: string;
}
