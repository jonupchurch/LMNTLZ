# API Contract: Payments

**Feature**: `011-payments` | Versioned JSON REST under `/v1`.

**No subscription product exists.** Nothing auto-renews. One product — the boost
pair — in seven durations, bought outright. That removes dunning, retry ladders,
grace periods, cancellation flows and auto-renewal regulation from this feature
entirely.

---

## `GET /v1/catalog`

```jsonc
{
  "skus": [
    { "sku": "pass-3d",   "price": 500,   "currency": "USD", "days": 3,   "perDay": 1.67 },
    { "sku": "pass-7d",   "price": 1000,  "days": 7,   "perDay": 1.43 },
    { "sku": "pass-12d",  "price": 1500,  "days": 12,  "perDay": 1.25 },
    { "sku": "pass-28d",  "price": 2000,  "days": 28,  "perDay": 0.71 },
    { "sku": "pass-91d",  "price": 5000,  "days": 91,  "perDay": 0.55 },
    { "sku": "pass-182d", "price": 9000,  "days": 182, "perDay": 0.49 },
    { "sku": "pass-364d", "price": 16000, "days": 364, "perDay": 0.44 }
  ],
  "maxPurchasableAdvantagePerYear": 16000,   // COMPUTED from the catalog
  "statementDescriptor": "PADDLE.NET* LMNTLZ"
}
```

Prices in minor units. **`maxPurchasableAdvantagePerYear` is derived, never a
constant** — the cheapest way to buy 364 days. It is auditable *because* it is
computed: a new SKU that broke the ceiling would change the answer rather than
sitting silently outside it.

**`statementDescriptor` is served from config and shown at checkout.**

## `POST /v1/checkout`

```jsonc
{ "sku": "pass-28d" }
```

```jsonc
// 200
{ "checkoutUrl": "https://...", "sku": "pass-28d", "price": 2000,
  "statementDescriptor": "PADDLE.NET* LMNTLZ" }
```

| Status | When |
|---|---|
| `200` | session created via the rail |
| `422` | unknown sku |
| `409` | shard-cap refusal — **checked before the rail is invoked** |
| `503` | the rail is unavailable |

**The descriptor is returned so the client can show it adjacent to the pay button,
not in a footer.** Under merchant-of-record the reseller's name appears on the
statement, and **an unexplained line item is itself a chargeback trigger** — in
exactly the demographic that produces them.

## `POST /v1/webhooks/payments` — the only path that grants

```
1  read the RAW body — bytes, not a parsed object
2  verify the signature against those bytes, constant-time
3  401 on failure, and log it
4  parse
5  INSERT provider_event_id ... ON CONFLICT DO NOTHING
6  no row → already processed → 200, do nothing
7  row   → process in the SAME transaction → 200
```

**Step 1 is the silent one.** Parse-and-re-serialise changes key order and
whitespace; the signature stops matching — or matches today and stops after a
dependency bump.

**Step 5's key is the provider's event id and never one we derive.** A key derived
from `(accountId, sku, amount)` would collapse two genuine purchases of the same
pass a minute apart — and the design **expects** that, because passes stack and
there is no reason to wait.

**Always `200`, including for a duplicate.** A `409` reads as a failure and earns
more retries.

| Status | When |
|---|---|
| `200` | processed, or already processed |
| `401` | signature verification failed |
| `500` | processing failed — **the provider should retry** |

### Granting extends; it never replaces

```
entitlement_until = max(now, current entitlement_until) + sku.days
```

**Two purchases in one minute yield the sum, never the larger.** That is the test.

## `GET /v1/me/entitlements`

```jsonc
{
  "boostPair": { "active": true, "until": "2026-09-14T00:00:00Z", "daysRemaining": 48 },
  "history": [ { "sku": "pass-28d", "grantedAt": "...", "days": 28 } ],
  "spentThisYear": 4000,
  "maxPurchasableAdvantagePerYear": 16000
}
```

**`spentThisYear` against the ceiling is the auditable promise made visible.** In a
design whose distinctive claim is a cap players can check, the player has to be able
to check it.

## `GET /v1/receipts/:token`

**Reachable without signing in**, via a signed link in the confirmation email.
Someone disputing a charge is frequently not the person who can sign in.

---

## Data

```sql
CREATE TABLE payment_events (
  provider_event_id text PRIMARY KEY,        -- THEIRS, never derived
  received_at timestamptz NOT NULL DEFAULT now(),
  kind    text NOT NULL,                     -- 'purchase' | 'refund' | 'comp'
  payload jsonb NOT NULL
);

CREATE TABLE entitlements (
  account_id uuid NOT NULL,                  -- ACCOUNT-level, never storefront
  kind       text NOT NULL,                  -- 'boost-pair'
  until      timestamptz NOT NULL,
  PRIMARY KEY (account_id, kind)
);

CREATE TABLE entitlement_grants (            -- append-only; `entitlements` is derived
  provider_event_id text NOT NULL REFERENCES payment_events(provider_event_id),
  account_id uuid NOT NULL,
  sku text NOT NULL,
  days integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
```

**Entitlements are computed from the set of processed grants, not mutated in arrival
order.** Out-of-order delivery is normal — a cancellation can arrive before the
purchase it cancels — and a derived value is order-independent by construction.

**Account-level, never storefront-level.** A pass bought in the browser is live on
Steam and the reverse. Steam does not ship at 1.0; the seam does.

---

## Internal contracts

```ts
/** Constitution XIX. Paddle is one implementation. */
interface PaymentRail {
  createCheckout(accountId: string, sku: Sku): Promise<{ url: string }>;
  verifyNotification(rawBody: Uint8Array, signature: string): boolean;
  parseNotification(rawBody: Uint8Array): PaymentEvent;
  listTransactions(since: Date): Promise<ProviderTransaction[]>;   // reconciliation
}

/** THE ONLY function that creates an entitlement. There is no internal grant
 *  reachable from a route — FR-011 by ABSENCE, not by a check.
 *  An operator comping a pass (feature 016) writes a synthetic event through THIS
 *  handler with kind 'comp', so it is audited and reconciled like everything else. */
async function handleNotification(raw: Uint8Array, signature: string): Promise<void>;

/** Derived from the catalog. Never a constant. */
function maxPurchasableAdvantage(): number;
function bestShardsPerDollar(): { sku: Sku; shardsPerDollar: number };
```

## Reconciliation — daily, 48-hour window

```
provider's completed transactions (last 48 h)  vs  our entitlement_grants
diff on (provider_event_id, accountId, sku, amount)
```

| Discrepancy | Response |
|---|---|
| **they have it, we do not** | **grant automatically**, and alert |
| **we have it, they do not** | **alert only — NEVER auto-revoke** |
| amounts disagree | alert; a human decides |

**The asymmetry is the decision.** A missing entitlement is owed to a player who
paid. An extra one is only ever alerted, because auto-revocation on a reconciliation
bug takes something a player is *using* and turns a data problem into a support
incident and a chargeback.

**48 hours, not 24** — the overlap covers a late notification and one failed job
run, and it is free because the comparison is idempotent.
