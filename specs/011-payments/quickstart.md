# Quickstart: Payments

**Feature**: `011-payments` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test payments
```

## The golden path

1. Buy `pass-28d`. Confirm the entitlement runs 28 days.
2. Buy `pass-7d` **while the first is live**.
3. **Confirm the durations add to 35 — never the larger of the two.**

Step 3 is the test. Passes stack additively so there is no penalty for topping up
early and no reason to wait for a lapse — which is the behaviour a renewal reminder
would otherwise have to manufacture.

## Idempotency — replay the notification

```
POST /v1/webhooks/payments  (event E)        → 200, entitlement granted
POST /v1/webhooks/payments  (event E again)  → 200, NOTHING granted twice
```

Assert on `entitlement_grants`, not on the response: **exactly one row** for `E`.
Both responses are `200`, deliberately — a `409` reads as a failure to the provider
and earns more retries.

**Then the case a derived key would break:**

```
buy pass-7d at 12:00:00
buy pass-7d at 12:00:45     ← same account, same sku, same amount
→ TWO grants, 14 days total
```

A dedupe key derived from `(accountId, sku, amount)` collapses these into one. **The
key must be the provider's own event id.** This is a real purchase pattern, not a
contrived one — the design expects top-ups.

## Signature verification — verify the bytes that arrived

```
valid signature                          → 200
tampered body, original signature        → 401
valid body, signature from another event → 401
missing signature header                 → 401
```

Then the one that catches the silent failure:

```
send a body with unusual key ORDER and extra whitespace, correctly signed
→ 200
```

If this fails, the handler is parsing and re-serialising before verifying. That bug
either fails immediately or — worse — passes until a dependency bump changes the
serialiser.

Confirm by reading the code: the signature check takes `Uint8Array`, and `JSON.parse`
appears **after** it.

## The only grant path

```bash
rg -n "entitlement" apps/api/src --type ts -l
```

Read every hit. **`handleNotification` must be the only writer of
`entitlement_grants`.** No internal grant function reachable from a route — FR-011 is
enforced by absence, not by a permission check.

Then confirm the comp path goes through the same door:

```
operator issues a comped pass (feature 016)
→ a synthetic payment_event with kind 'comp'
→ processed by handleNotification
→ appears in reconciliation like every other grant
```

A second grant path is a second thing to secure.

## The shard cap refuses before the rail

```
1  earn to the 6,500 cap
2  POST /v1/checkout for a shard purchase
3  → 409, and the payment rail was NEVER invoked
```

Assert step 3 by injecting a failure into the rail and confirming it was not
reached. **Never take money for shards that cannot be delivered.**

## Out-of-order delivery

```
send the REFUND event for purchase P before P itself
→ neither is dropped; the final entitlement state is correct either way
```

Entitlements are computed from the **set** of processed grants, not mutated in
arrival order — so order-independence is by construction. This test proves the
construction is actually what shipped.

## The auditable ceiling

```
GET /v1/catalog → maxPurchasableAdvantagePerYear === 16000
```

Then the property that makes it worth having:

```
add a hypothetical pass-500d at $200 to the catalog fixture
→ maxPurchasableAdvantagePerYear CHANGES
```

**It is derived, not a constant.** The number is auditable *because* it is computed —
a SKU that broke the ceiling changes the answer rather than sitting silently outside
it. A hard-coded 16000 passes the first test and fails the promise.

Then the player-facing half:

```
GET /v1/me/entitlements → spentThisYear, against the ceiling
```

In a design whose distinctive claim is a cap players can check, the player has to be
able to check it.

## The statement descriptor

Not a unit test — a **pre-launch checklist item with a real cost attached**.

```
✓ read the EXACT string from the live provider dashboard — do not guess it
✓ it appears at checkout, adjacent to the pay button, not in a footer
✓ it appears in the confirmation email
✓ GET /v1/receipts/:token works WITHOUT SIGNING IN
```

The last line matters more than it looks: someone disputing a charge is frequently
not the person who can sign in. An unexplained line item is itself a chargeback
trigger, and chargeback ratio is an **account-level** risk — cross it and the payment
account is at risk, which for a self-funded project is launch-stopping.

## Reconciliation

```
1  process a purchase, then DELETE the entitlement_grants row
2  run reconciliation
3  → the grant is RESTORED automatically, and an alert fires
```

Then the opposite, which must behave differently:

```
1  insert an entitlement_grants row with no provider transaction behind it
2  run reconciliation
3  → an alert fires and NOTHING IS REVOKED
```

**The asymmetry is the decision.** A missing entitlement is owed to a player who
paid. An extra one is only alerted, because auto-revocation on a reconciliation bug
takes something a player is using and turns a data problem into a support incident.
