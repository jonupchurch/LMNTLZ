# Phase 0 Research: Payments

**Feature**: `011-payments` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. All answerable now; two of them are vendor-shaped and one is an
operational call.

**The context that makes this feature small**: there is **no subscription product**.
Nothing auto-renews, so there is no dunning ladder, no retry cascade, no grace
period, no cancellation flow, and no auto-renewal regulation to track across three
jurisdictions. One product — the boost pair — in seven durations, bought outright.

---

## Q1 — Notification authentication and retry semantics

**Decision: verify the signature on the raw body before parsing, dedupe on the
provider's own event id, and treat every notification as at-least-once.**

```
1  read the RAW request body — bytes, not a parsed object
2  verify the signature header against it, constant-time
3  reject on failure with 401, and log the attempt
4  parse
5  INSERT the event id ... ON CONFLICT DO NOTHING
6  no row inserted → already processed → 200, do nothing
7  row inserted    → process inside the same transaction
```

**Step 1 is the one that is easy to get wrong and impossible to notice.** A JSON
parse-and-re-serialise changes key order and whitespace, so the signature will not
match — or worse, a framework that re-serialises *consistently* makes it match today
and stop matching after a dependency bump. Verify the bytes that arrived.

**Step 5 is the whole idempotency story, and the key must be the provider's.**

> **The dedupe key comes from the provider's own event identifier, never from
> something we derive.** A key derived from `(accountId, sku, amount)` collapses two
> genuine purchases of the same pass a minute apart into one — and the design
> *explicitly expects* that, because passes stack additively and there is no reason
> to wait.

```sql
CREATE TABLE payment_events (
  provider_event_id text PRIMARY KEY,     -- THEIR id
  received_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  payload jsonb NOT NULL
);
```

**Retries are the normal case, not the exception.** Any timeout, any deploy, any
cold start produces one. The endpoint must return `200` fast and do the work
transactionally — and it must return `200` for an already-processed event, because
a `409` reads as a failure to the provider and earns more retries.

**Out-of-order delivery is also normal.** A cancellation can arrive before the
purchase it cancels. Entitlements are therefore computed from the **set** of
processed events, not mutated in arrival order — which falls out of the ledger shape
below.

---

## Q2 — The statement descriptor

**Decision: verify it before launch, in the provider dashboard, and record the exact
string in the purchase confirmation email and on the receipt page.**

Under merchant-of-record the **reseller's** name appears on the card statement, not
ours. That is the point of the arrangement — they are the seller of record, they
handle VAT/GST across every jurisdiction, and they carry the compliance.

**An unexplained line item is itself a chargeback trigger**, and it lands in exactly
the demographic that produces them: a game bought on a shared card, a player who
does not recognise a company they have never heard of, and a dispute that costs the
fee plus the ratio.

**Three mitigations, all cheap, and none of them is "hope they remember":**

1. **Show the descriptor at checkout, before payment.** *"This will appear on your
   statement as `PADDLE.NET* LMNTLZ`."* Not in the footer — adjacent to the button.
2. **Repeat it in the confirmation email** (Resend), which is the artifact a
   cardholder actually goes looking for.
3. **Make the receipt page reachable without signing in**, via a signed link in the
   email. Someone disputing a charge is frequently not the person who can sign in.

> **The exact string is provider- and account-dependent and must be read from the
> live dashboard, not guessed.** This is a pre-launch checklist item with a real
> cost attached, not a design decision.

**Chargeback ratio is an account-level risk**, not a per-transaction one — cross it
and the payment account itself is at risk, which would be a launch-stopping failure
for a self-funded project. That is why three mitigations for one line of text is
proportionate.

---

## Q3 — Reconciliation cadence

**Decision: daily, automated, alerting on any discrepancy; plus an on-demand run in
the ops tooling.**

```
for the previous 48 hours (a deliberate overlap):
    provider's completed transactions   ←  their API
    our granted entitlements            ←  our tables
    diff on (provider_event_id, accountId, sku, amount)
```

Three discrepancy classes, three different responses:

| Class | Meaning | Response |
|---|---|---|
| **they have it, we do not** | a notification was lost | **grant it**, automatically, and alert |
| **we have it, they do not** | we granted something unpaid | alert. **Never auto-revoke** — an entitlement taken back is worse than one given away |
| amounts disagree | currency or a partial refund | alert; human decides |

**Daily rather than hourly**: at LMNTLZ's volume an hourly job is 24× the API calls
to find the same zero rows. **The 48-hour window rather than 24** covers a
notification that arrives late and a job run that fails once — the overlap is free
because the comparison is idempotent.

**The asymmetry in the table is the decision.** Missing entitlements are granted
automatically because the player paid and is owed it; extra entitlements are only
ever alerted, because auto-revocation on a reconciliation bug takes something a
player is using and turns a data problem into a support incident and a chargeback.

---

## The catalog — settled, and recorded here so the implementation does not re-derive it

Seven durations of **one product**. Every price is a multiple of $5; there is no
second currency; **nothing auto-renews**.

| SKU | Price | Grants | $/day |
|---|---|---|---|
| `pass-3d` | $5 | 3 days | $1.67 |
| `pass-7d` | $10 | 7 days | $1.43 |
| `pass-12d` | $15 | 12 days | $1.25 |
| `pass-28d` | $20 | 28 days | $0.71 |
| `pass-91d` | $50 | 91 days | $0.55 |
| `pass-182d` | $90 | 182 days | $0.49 |
| **`pass-364d`** | **$160** | **364 days** | **$0.44** |

**Passes stack additively.** Buying while time remains **extends** it; it never
replaces or resets. So there is no penalty for topping up early and no reason to wait
for a lapse — the behaviour a renewal reminder would otherwise manufacture.

**The advantage cap is $160/year and it is arithmetic, not a rule.** Thirteen 4-week
passes cost $260; the annual is $160 for the same 364 days, so nobody rational pays
more. `maxPurchasableAdvantage()` **computes** this from the catalog rather than
returning a constant — the number is auditable *because* it is derived, and a new SKU
that broke the ceiling would change the answer instead of being silently outside it.

**`bestShardsPerDollar()` exists for the same reason** and covers the two SKUs where
the dual-price relationship matters.

**Entitlements are account-level, never storefront-level.** A pass bought in the
browser is live on Steam, and the reverse. Recorded in `docs/tech-stack.md` as a
1.0 requirement even though Steam does not ship at 1.0 — the seam is the deliverable.

---

## The one path that grants

**`handleNotification` is the only function that creates an entitlement.** There is
no internal grant reachable from a route — FR-011 enforced by **absence** rather than
by a check.

Two consequences worth stating:

- **Comped passes go through the same door.** An operator issuing a free pass
  (feature 016) writes a synthetic event through the same handler, with a distinct
  `kind`, so it is audited and reconciled like everything else. A second grant path
  is a second thing to secure.
- **A refusal at the shard cap happens before the rail is invoked** (feature 010).
  Never take money for shards that cannot be delivered.

---

## What is NOT settled here

- **The exact statement descriptor string.** Read it from the live dashboard.
- **Whether the provider's fee tier steps down as recorded** (25% above $10M
  lifetime, 20% above $50M). Verify at signup; it changes no design.
- **Cosmetics.** Recorded as the long-term monetization direction and explicitly
  outside the $160 advantage cap. Not in 1.0, and the catalog shape here
  accommodates a second product kind without a schema change.
