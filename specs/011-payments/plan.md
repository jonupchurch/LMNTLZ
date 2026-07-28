# Implementation Plan: Payments, Passes & Entitlements

**Feature**: `011-payments` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 5 · Entitlement

## Summary

One product in seven durations, sold through a merchant of record. **Entitlements
belong to the account, never the storefront**, and grants come only from an
authenticated provider notification. Nothing recurs.

## Technical Context

**Language**: TypeScript · **API**: Hono · **Storage**: Postgres
**Provider**: merchant of record, behind a rail interface · **Testing**: Vitest
**Constraints**: no client-originated grant, ever. Notifications are retried by
design, so **exactly-once is the normal case, not an edge case**.

**Scale**: low volume relative to gameplay. Correctness dominates throughput.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | A client claim of purchase is refused (FR-011) |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **PASS** | SC-001's auditable ceiling is what makes *spending is not effectiveness* sayable |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | Account-level entitlements retrofitted would mean migrating money records |
| XVII | Storing is not exposing | **PASS** | Payment detail is stored by the provider, not by us |
| XVIII | Harm is a gate | **PASS** | No subscription — a cancellation someone struggles with is the off-brand outcome |
| XIX | Vendors behind interfaces | **PASS** | **The whole feature.** FR-016, FR-017, SC-008 |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/payments/
├── rail.ts            the interface — no feature code names a vendor
├── provider/          one implementation at 1.0
├── webhook.ts         authenticate → dedupe → grant
├── entitlements.ts    grant, extend, revoke, read
├── catalog.ts         seven durations; the dual-price rule
└── reconcile.ts       compare against the provider's own record

apps/api/src/db/schema/entitlements.ts
```

**Structure decision**: `catalog.ts` owns the dual-price rule as a **ratio**
against the best pass, so features 12 and 14 ask it rather than hard-coding a
threshold that goes stale on the next repricing.

## Phase 0 — Research

1. **Confirm the provider's notification authentication and retry semantics.**
   Retries are the normal case; the dedupe key must come from the provider's own
   event identifier, not from something we derive.
2. **Confirm the statement descriptor.** Under merchant-of-record the reseller's
   name appears on the card statement, and **an unexplained line item is itself a
   chargeback trigger** — in exactly the demographic that produces them.
3. **Decide reconciliation cadence.** FR-015 requires it be possible; how often it
   runs is an operational call.

## Phase 1 — Design

**Contracts**:

```
catalog()                              → the seven durations
checkoutUrl(accountId, sku)            → via the rail
handleNotification(payload, signature) → authenticate, dedupe, grant/revoke
entitlements(accountId)                → what they hold and until when
maxPurchasableAdvantage()              → the auditable ceiling
bestShardsPerDollar()                  → the dual-price ceiling for 12 and 14
```

**`handleNotification` is the only path that grants.** There is no internal grant
function reachable from a route, which is FR-011 enforced by absence rather than
by a check.

**Extension, not replacement**: granting adds duration to whatever remains. The
test is that two purchases in one minute yield the sum, never the larger.

**Quickstart**: buy a pass, buy a second while the first is live, confirm the
durations add; replay the notification, confirm nothing is granted twice.

## Phase 2 — Notes for `speckit-tasks`

**The rail interface before any provider code.** Written the other way around, the
provider's shape becomes the interface and the second rail is a rewrite.

**Write the duplicate-notification test before the grant path works.** Retries are
normal, and granting twice is a revenue defect and a support case at once.

**Write the additive-stacking test early too.** Replacement is the natural
implementation and would destroy time a player already paid for.

**Do not build a shard product**, even as a stub. The catalogue is the audit
surface for SC-001.
