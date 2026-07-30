/**
 * The payment rail — **the interface, written before any provider code**
 * (011 T003 · FR-016, Constitution XIX).
 *
 * The order matters and is the whole point. Written the other way round, the
 * provider's shape *becomes* the interface: its field names leak into the schema,
 * its event taxonomy becomes ours, and the second rail is not an implementation
 * but a rewrite. **No file outside `payments/provider/` names a vendor**, and
 * `tests/payments/accountLevel.test.ts` greps for it rather than trusting this
 * sentence.
 *
 * ### Four methods, and `verifyNotification` takes bytes
 *
 * `verifyNotification(raw: Uint8Array, signature)` deliberately does **not** take a
 * parsed object. A signature covers the exact bytes that were sent, so any
 * parse-then-verify ordering checks a signature against a re-serialisation that may
 * differ in key order, whitespace or unicode escaping — and the failure is silent
 * and intermittent, which is the worst combination available. `webhook.ts` keeps
 * `JSON.parse` strictly after the check for the same reason.
 *
 * ### `listTransactions` exists for reconciliation, not for reads
 *
 * Nothing in a request path calls it. It is the provider half of the daily diff in
 * `reconcile.ts`, which exists because a webhook that never arrives leaves a paying
 * customer with nothing and no error anywhere in our logs.
 */

/** What a player is buying. One product, seven durations. */
export interface CheckoutRequest {
  readonly accountId: string;
  readonly sku: string;
  /** Cents. Read from our catalog, never from the client. */
  readonly amount: number;
  readonly currency: 'USD';
}

export interface CheckoutSession {
  /** Where to send the player to pay. */
  readonly url: string;
  /** The provider's handle for this attempt, for support and reconciliation. */
  readonly reference: string;
}

/**
 * A notification, normalised out of whatever the provider sent.
 *
 * **`providerEventId` is theirs, never derived.** See `schema/payments.ts` — a key
 * we compute from `(account, sku, amount)` collides on the legitimate case of the
 * same person buying the same pass twice, and de-duplicates away a real purchase.
 */
export interface RailNotification {
  readonly providerEventId: string;
  readonly kind: 'purchase' | 'refund' | 'chargeback' | 'comp';
  readonly accountId: string;
  readonly sku: string;
  readonly amount: number;
  /** The provider's own timestamp, so out-of-order arrival can be ordered. */
  readonly occurredAt: Date;
  /** For a refund or chargeback: the purchase being reversed, when they say. */
  readonly reverses?: string;
}

export interface PaymentRail {
  /**
   * Which request header carries the signature.
   *
   * **The provider names its own header**, because the route must not. A route
   * reading `paddle-signature` directly is a vendor name outside `provider/` —
   * Constitution XIX — and `tests/payments/grantPath.test.ts` caught exactly that
   * in the first draft of `routes.ts`.
   */
  readonly signatureHeader: string;

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;

  /** **Bytes in, never an object.** See the header. */
  verifyNotification(raw: Uint8Array, signature: string): Promise<boolean>;

  parseNotification(raw: Uint8Array): RailNotification;

  /** Everything the provider recorded since `since`, for the daily reconcile. */
  listTransactions(since: Date): Promise<readonly RailNotification[]>;
}

/**
 * The installed rail. **Injected rather than imported**, the same shape 008 used
 * for blob storage and 009 for the rune source — which is what lets every test in
 * this feature run without a vendor account, and what makes the vendor swappable
 * rather than load-bearing.
 */
let rail: PaymentRail | null = null;

export class NoRailError extends Error {
  constructor() {
    super('No payment rail is installed. Payments are unavailable.');
    this.name = 'NoRailError';
  }
}

/** Install a rail. **Returns the undo**, so a test cannot leak one into the next file. */
export function setRail(next: PaymentRail | null): () => void {
  const previous = rail;
  rail = next;
  return () => {
    rail = previous;
  };
}

/**
 * The installed rail, or a thrown `NoRailError`.
 *
 * **There is deliberately no default rail and no no-op fallback.** A payments
 * feature that silently does nothing when unconfigured is one that takes a
 * checkout request in production and drops it; failing loudly is the only safe
 * behaviour for money.
 */
export function getRail(): PaymentRail {
  if (!rail) throw new NoRailError();
  return rail;
}

/** Whether payments are available at all — for `/v1/catalog` to answer honestly. */
export function railInstalled(): boolean {
  return rail !== null;
}
