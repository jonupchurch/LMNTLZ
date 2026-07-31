/**
 * The store's wire types.
 *
 * **No price and no duration is written down here.** Seven durations at seven
 * prices are an economy decision in `06-progression.md`, they come off
 * `GET /v1/catalog`, and the store export prints them as literals in its own
 * script. Same rule as the Forge's stage table: a transcribed price is correct
 * until the first tuning pass and then it is a number the player reads that
 * differs from the number they are charged.
 */

export interface Sku {
  readonly id: string;
  /** Cents. `1000` is $10.00 — never dollars, never a formatted string. */
  readonly price: number;
  readonly days: number;
  readonly grants: string;
}

export interface CatalogResponse {
  readonly skus: readonly Sku[];
  readonly currency: string;
  readonly maxPurchasableAdvantagePerYear: number;
  readonly bestShardsPerDollar: number;
  /** **Nothing auto-renews**, and the payload says so rather than the copy. */
  readonly autoRenews: false;
  /**
   * False when **no payment rail is installed**.
   *
   * The store renders honestly on this rather than offering a control that
   * would fail on click (FR-009). `POST /checkout` answers `503` in that state,
   * and a button that produces a 503 is worse than no button: the player
   * assumes their card was the problem.
   */
  readonly available: boolean;
  /** What appears on the card statement. Served, never written down. */
  readonly statementDescriptor: string;
}

export interface EntitlementsResponse {
  readonly boostPass: {
    readonly active: boolean;
    readonly expiresAt: string | null;
    readonly daysRemaining: number;
  };
  readonly ceiling: { readonly maxPurchasableAdvantagePerYear: number };
  readonly autoRenews: false;
}

/** The slice of `GET /v1/me/shards` the store needs — the daily reset instant. */
export interface ShardsSlice {
  readonly today: {
    /**
     * **An absolute instant, and the store renders it rather than the string
     * `00:00 UTC`** (T026).
     *
     * `06-progression.md` settles the boundary as 00:00 UTC and
     * `config.ts` serves it as a timestamp precisely so that a per-player
     * boundary would not change the API shape — and so no screen would have to
     * be found and edited if it ever did.
     */
    readonly nextBoundaryAt: string;
  };
}

/** `1000` → `$10.00`. Cents in, never a rounded dollar figure. */
export const money = (cents: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

/**
 * Per-day price, **derived rather than served**.
 *
 * The one number the client is allowed to compute, because it is a
 * *presentation* of two served numbers rather than a third fact: it exists so a
 * player can compare seven durations without doing division, and it cannot drift
 * from the catalog because it is made of it.
 */
export const perDay = (sku: Sku, currency: string): string =>
  `${money(Math.round(sku.price / sku.days), currency)}/day`;
