# Tasks: Payments, Passes & Entitlements

**Input**: Design documents from `/specs/011-payments/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/payments-api.md](contracts/payments-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 5 · **features 005 and 010 complete**

**Tests**: **Included.** Retries are the **normal case**, so exactly-once is not an
edge case here — and granting twice is a revenue defect and a support case at once.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/payments/`, `apps/api/src/db/schema/`.

> **One product — the boost pair — in seven durations. Every price is a multiple of
> $5. There is no second currency. Nothing auto-renews. Shards cannot be bought.**
> The honest ceiling on purchasable advantage is **$160 a year**, because nobody
> rational buys thirteen 4-week passes at $260 for the same 364 days.

> **What makes this feature small**: there is no subscription product. No dunning
> ladder, no retry cascade, no grace period, no cancellation flow, and no
> auto-renewal regulation to track across three jurisdictions.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/payments/` and register `/v1/catalog`, `/v1/checkout`, `/v1/me/entitlements`, `/v1/receipts/:token` and `/v1/webhooks/payments` in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `payments` test project to `apps/api/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The rail interface and the schema. **The interface before any provider code** — written the other way round, the provider's shape *becomes* the interface and the second rail is a rewrite.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Define the `PaymentRail` interface in `apps/api/src/payments/rail.ts` — `createCheckout`, `verifyNotification(rawBody, signature)`, `parseNotification(rawBody)`, `listTransactions(since)`. **No feature code outside `provider/` names a vendor** (FR-016, Constitution XIX)
- [ ] T004 Define `payment_events` in `apps/api/src/db/schema/payments.ts` with `provider_event_id` as **PRIMARY KEY** — **their** id, never one we derive
- [ ] T005 Define `entitlement_grants` in `apps/api/src/db/schema/entitlements.ts` keyed on **`account_id`, never a storefront** — `kind`, `days_granted`, `provider_event_id`, `granted_at`, `revoked_at` (FR-007)
- [ ] T006 Write the catalog in `apps/api/src/payments/catalog.ts` — seven SKUs at `pass-3d` $5 · `pass-7d` $10 · `pass-12d` $15 · `pass-28d` $20 · `pass-91d` $50 · `pass-182d` $90 · `pass-364d` **$160**
- [ ] T007 Generate and apply the payments migration from `apps/api/drizzle/`

**Checkpoint**: A second rail is a new implementation of one interface, and nothing outside this feature moves

---

## Phase 3: User Story 3 - The purchase path cannot be spoofed (Priority: P1) 🎯 the one that must be right

**Goal**: Grants come only from an authenticated provider notification, exactly once.

**Independent Test**: Attempt to grant an entitlement from the client and confirm refusal; confirm grants originate only from a verified provider notification.

> **Sequenced first among the P1s** because plan.md is explicit: write the
> duplicate-notification test **before the grant path works**. A grant path that
> trusts the client is a free storefront.

### Tests for User Story 3 ⚠️

- [ ] T008 [US3] Write `apps/api/tests/payments/idempotency.test.ts` — the same event posted twice returns `200` **both times** and grants **exactly one** row. Assert on `entitlement_grants`, not on the response. **A `409` reads as a failure to the provider and earns more retries**
- [ ] T009 [P] [US3] Add the case a derived key would break to `apps/api/tests/payments/idempotency.test.ts` — the **same account, sku and amount** 45 seconds apart yields **two** grants and 14 days. This is a real purchase pattern; the design expects top-ups
- [ ] T010 [P] [US3] Write `apps/api/tests/payments/signature.test.ts` — a valid signature is `200`; a tampered body, a signature from another event, and a missing header are each `401`
- [ ] T011 [P] [US3] Add the silent-failure case to `apps/api/tests/payments/signature.test.ts` — a correctly-signed body with **unusual key order and extra whitespace** returns `200`. If it fails, the handler is parsing and re-serialising before verifying
- [ ] T012 [P] [US3] Write `apps/api/tests/payments/grantPath.test.ts` — read every hit of `rg -n "entitlement" apps/api/src --type ts -l` and assert **`handleNotification` is the only writer of `entitlement_grants`** (SC-005)

### Implementation for User Story 3

- [ ] T013 [US3] Implement `handleNotification(raw, signature)` in `apps/api/src/payments/webhook.ts` in the seven recorded steps — **verify the signature on the raw bytes constant-time before parsing**, `401` and log on failure, then parse, then `INSERT … ON CONFLICT DO NOTHING`, then process inside the same transaction
- [ ] T014 [US3] Take the signature check as `Uint8Array` in `apps/api/src/payments/webhook.ts` with `JSON.parse` appearing **after** it — a parse-and-re-serialise changes key order and whitespace, and a framework that re-serialises *consistently* makes it match today and stop matching after a dependency bump
- [ ] T015 [US3] **Provide no internal grant function reachable from a route** in `apps/api/src/payments/entitlements.ts` — FR-011 enforced by **absence**, not by a permission check
- [ ] T016 [US3] Route an operator's comped pass (feature 016) through **the same handler** with a synthetic event of kind `comp`, in `apps/api/src/payments/webhook.ts` — so it is audited and reconciled like everything else. **A second grant path is a second thing to secure**
- [ ] T017 [US3] Implement revocation on a refund or reversal in `apps/api/src/payments/entitlements.ts` (FR-014, SC-007)
- [ ] T018 [US3] Compute entitlements from the **set** of processed grants rather than mutating in arrival order, in `apps/api/src/payments/entitlements.ts` — **out-of-order delivery is normal** and a cancellation can arrive before the purchase it cancels

**Checkpoint**: The only door into an entitlement is an authenticated notification, processed exactly once.

---

## Phase 4: User Story 1 - A player buys a pass and it works immediately (Priority: P1)

**Goal**: Choose a duration, pay, and the boost is active — with the tax handled and the receipt legible.

**Independent Test**: Complete a purchase end to end and confirm the entitlement is granted, dated correctly, and visible.

### Tests for User Story 1 ⚠️

> **Write the additive-stacking test early.** Replacement is the natural
> implementation and would destroy time a player already paid for.

- [ ] T019 [US1] Write `apps/api/tests/payments/stacking.test.ts` — buy `pass-28d`, then buy `pass-7d` **while the first is live**, and confirm the durations **add to 35, never the larger of the two** (SC-009)
- [ ] T020 [P] [US1] Write `apps/api/tests/payments/lapse.test.ts` — a pass simply ends. **Nothing renews and nothing is charged again**, and no subscription product exists anywhere in the catalog (SC-002)
- [ ] T021 [P] [US1] Write `apps/api/tests/payments/outOfOrder.test.ts` — send the **refund** for purchase P before P itself; neither is dropped and the final entitlement state is correct either way

### Implementation for User Story 1

- [ ] T022 [US1] Implement `GET /v1/catalog` and `POST /v1/checkout` in `apps/api/src/payments/routes.ts`, reaching the provider **through `PaymentRail`**
- [ ] T023 [US1] Implement additive extension in `apps/api/src/payments/entitlements.ts` — a purchase while time remains **extends** whatever remains and never replaces or resets it (FR-002)
- [ ] T024 [US1] Implement `GET /v1/me/entitlements` in `apps/api/src/payments/routes.ts` — what the player holds and when it expires, plus `spentThisYear` against the ceiling (FR-009)
- [ ] T025 [US1] Call feature 010's `canAcceptPurchase` **before invoking the rail** in `apps/api/src/payments/routes.ts` — **never take money for shards that cannot be delivered**
- [ ] T026 [US1] Show the statement descriptor **at checkout, adjacent to the pay button and not in a footer**, in `apps/client/src/features/store/Checkout.tsx` (FR-018)
- [ ] T027 [US1] Repeat the descriptor in the confirmation email via Resend, in `apps/api/src/payments/receipt.ts` — it is the artifact a cardholder actually goes looking for
- [ ] T028 [US1] Implement `GET /v1/receipts/:token` in `apps/api/src/payments/routes.ts` reachable **without signing in**, via a signed link in the email — **someone disputing a charge is frequently not the person who can sign in**

> **An unexplained line item is itself a chargeback trigger**, and chargeback ratio
> is an **account-level** risk. Cross it and the payment account itself is at risk,
> which for a self-funded project is launch-stopping. Three mitigations for one
> line of text is proportionate.

**Checkpoint**: The only revenue in the game works, and the buyer can recognise the charge.

---

## Phase 5: User Story 2 - A purchase belongs to the account, not the store (Priority: P1)

**Goal**: Bought in a browser, present on Steam — and the reverse.

**Independent Test**: Grant an entitlement through one rail and confirm it is present when reached through another.

### Tests for User Story 2 ⚠️

- [ ] T029 [P] [US2] Write `apps/api/tests/payments/accountLevel.test.ts` — an entitlement granted through one rail is readable when the account is reached through another provider, **100% of the time** (SC-004)
- [ ] T030 [P] [US2] Add the vendor-name scan to `apps/api/tests/payments/accountLevel.test.ts` — grep `apps/api/src` outside `payments/provider/` for the provider's name and assert **zero** matches (SC-008)

### Implementation for User Story 2

- [ ] T031 [US2] Implement the single provider under `apps/api/src/payments/provider/` as one implementation of `PaymentRail` — the only place a vendor is named (FR-017)
- [ ] T032 [US2] Confirm `entitlement_grants` carries **no storefront column** in `apps/api/src/db/schema/entitlements.ts` — the entitlement belongs to the account, and a storefront is a property of the *event* that granted it (FR-007, FR-008)

**Checkpoint**: Adding Steam as a second rail touches this feature and nothing else.

---

## Phase 6: User Story 4 - The player can audit the ceiling (Priority: P2)

**Goal**: The maximum purchasable advantage is verifiable from the catalogue.

**Independent Test**: Enumerate every purchasable item and confirm none grants gameplay advantage beyond the pass, and no dual-priced item beats the best pass's shard rate.

### Tests for User Story 4 ⚠️

- [ ] T033 [US4] Write `apps/api/tests/payments/ceiling.test.ts` — `GET /v1/catalog` reports `maxPurchasableAdvantagePerYear === 16000`
- [ ] T034 [US4] Add the property that makes it worth having, in `apps/api/tests/payments/ceiling.test.ts` — add a hypothetical `pass-500d` at $200 to the catalog fixture and confirm the answer **changes**. **A hard-coded 16000 passes the first test and fails the promise**
- [ ] T035 [P] [US4] Write `apps/api/tests/payments/catalogRules.test.ts` — the only gameplay-affecting product is the boost pass; **no product converts money to shards**; any dual-priced item is worse value than the best pass (SC-003)

### Implementation for User Story 4

- [ ] T036 [US4] Implement `maxPurchasableAdvantage()` in `apps/api/src/payments/catalog.ts` as a **computation over the catalog, never a constant** — the number is auditable *because* it is derived, and a SKU that broke the ceiling would change the answer instead of sitting silently outside it (SC-001)
- [ ] T037 [US4] Implement `bestShardsPerDollar()` in `apps/api/src/payments/catalog.ts` as the **ratio** features 012 and 014 ask, rather than a threshold they hard-code and let go stale on the next repricing (FR-005)
- [ ] T038 [US4] **Build no shard product, not even as a stub**, in `apps/api/src/payments/catalog.ts` — the catalogue is the audit surface for SC-001 (FR-004)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 Implement `reconcile()` in `apps/api/src/payments/reconcile.ts` — **daily**, over a **48-hour** window, diffing on `(provider_event_id, accountId, sku, amount)`
- [ ] T040 Implement the three-class asymmetry in `apps/api/src/payments/reconcile.ts` — *they have it, we do not* → **grant automatically and alert**; *we have it, they do not* → **alert only, never auto-revoke**; amounts disagree → alert for a human
- [ ] T041 Write `apps/api/tests/payments/reconcile.test.ts` proving both directions — a deleted grant is **restored** with an alert; an unpaid grant fires an alert and **nothing is revoked**

> **The asymmetry is the decision.** A missing entitlement is owed to a player who
> paid. An extra one is only alerted, because auto-revocation on a reconciliation
> bug takes something a player is *using* and turns a data problem into a support
> incident and a chargeback.

- [ ] T042 **Pre-launch checklist item**: read the **exact** statement-descriptor string from the live provider dashboard and record it in `docs/launch-checklist.md`. **Do not guess it** — it is provider- and account-dependent
- [ ] T043 [P] Write `apps/api/src/payments/README.md` — the one grant path, the additive rule, and the standing note that the ceiling is computed
- [ ] T044 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005 and 010
- **Foundational (Phase 2)**: depends on Setup — **blocks all four stories**
- **US3 (Phase 3)**: Foundational only. **Sequenced first**
- **US1 (Phase 4)**: needs `handleNotification` (T013)
- **US2 (Phase 5)**: needs the rail interface (T003)
- **US4 (Phase 6)**: needs the catalog (T006)
- **Polish (Phase 7)**: depends on US3 and US1

### User Story Dependencies

- **US3 (P1)**: none
- **US1 (P1)**: US3 — nothing can be bought until the grant path is safe
- **US2 (P1)**: none beyond Phase 2 — **fully parallel with US1 and US3**
- **US4 (P2)**: none beyond Phase 2 — **fully parallel**

### Within Each User Story

- Tests written and **failing** before implementation
- **The rail interface before any provider code**
- The duplicate-notification test before the grant path works

### Parallel Opportunities

- **US2 and US4 are both fully parallel with US1 and US3** — different files
- T009, T010, T011, T012 in parallel — four test cases across three files
- T019, T020, T021 in parallel
- T029, T030 in parallel

---

## Parallel Example: User Story 3

```bash
# Four independent test cases, all red first:
Task: "idempotency.test.ts — replay grants once, both responses 200"
Task: "idempotency.test.ts — same sku 45s apart grants TWICE"
Task: "signature.test.ts — tampered, wrong-event, missing header"
Task: "signature.test.ts — odd key order and whitespace still verifies"
```

---

## Implementation Strategy

### MVP First (US3 + US1)

Together they are the storefront: **it cannot be spoofed, and it works.** Stop after
Phase 4 and validate — a replayed notification grants once, two purchases 45
seconds apart grant twice, and 28 + 7 is 35.

1. Phase 1–2: the rail interface and the catalog
2. Phase 3: US3 — **the safety before the sale**
3. Phase 4: US1 — **STOP and VALIDATE** additive stacking and the descriptor
4. Phase 5–6: the account-level seam and the auditable ceiling

### Incremental Delivery

US2 costs almost nothing now and would mean migrating **real money records** later.
US4 is P2 by urgency but is the design's distinctive promise — *a ceiling players
can audit* only holds if the storefront cannot quietly breach it.

---

## Notes

- **The exact statement descriptor string is not settled** and must be read from the
  live dashboard. It is a pre-launch checklist item with a real cost attached, not a
  design decision.
- **Whether the provider's fee tier steps down as recorded** (25% above $10M
  lifetime, 20% above $50M) should be verified at signup. It changes no design.
- **Cosmetics are not in 1.0** and are explicitly outside the $160 advantage cap.
  The catalog shape accommodates a second product kind without a schema change.
- **Any revenue number written before 2026-07-28 is stale** — ARPU figures were all
  revised down 38% when the ceiling fell from $260 to $160.
- Commit after each task or logical group; work goes straight to `main`.
