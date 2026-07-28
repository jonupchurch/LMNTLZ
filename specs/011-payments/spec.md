# Feature Specification: Payments, Passes & Entitlements

**Feature Branch**: `011-payments` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 11 of the LMNTLZ 1.0 set (`specs/README.md`). The storefront — one product in seven durations, sold through a merchant of record, granting entitlements that belong to the account.

---

## What is being sold, and what is not

> **One product — the boost pair — in seven durations. Every price is a multiple
> of $5. There is no second currency. Nothing auto-renews. Shards cannot be
> bought.**

| Price | Grants | $/day |
|---|---|---|
| **$5** | 3 days | $1.67 |
| **$10** | 7 days | $1.43 |
| **$15** | 12 days | $1.25 |
| **$20** | 4 weeks (28 days) | $0.71 |
| **$50** | 3 months (91 days) | $0.55 |
| **$90** | 6 months (182 days) | $0.49 |
| **$160** | **1 year (364 days)** | **$0.44** |

**Passes stack additively** — buying while time remains *extends* it, never
replaces or resets it. So there is no penalty for topping up early and no reason
to wait for a lapse, which is exactly the behaviour a renewal reminder would
otherwise have to manufacture.

**The honest ceiling on purchasable advantage is $160 a year**, because nobody
rational buys thirteen 4-week passes at $260 for the same 364 days.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player buys a pass and it works immediately (Priority: P1)

A player chooses a duration, pays, and the boost is active — with the tax handled
and the receipt legible.

**Why this priority**: It is the only revenue in the game.

**Independent Test**: Complete a purchase end to end and confirm the entitlement
is granted, dated correctly, and visible to the player.

**Acceptance Scenarios**:

1. **Given** a completed purchase, **When** it settles, **Then** the entitlement is granted and the boost becomes active.
2. **Given** an existing pass with time remaining, **When** another is bought, **Then** the durations **add**; nothing is replaced or reset.
3. **Given** a purchase, **When** the player checks, **Then** they can see what they hold and when it expires.
4. **Given** a purchase, **When** it appears on the player's card statement, **Then** the descriptor is recognisable — an unexplained line item is itself a chargeback trigger.
5. **Given** any pass, **When** it ends, **Then** it simply ends — **nothing renews, nothing is charged again**.

---

### User Story 2 - A purchase belongs to the account, not the store (Priority: P1)

A player who bought in a browser later signs in through Steam and still has
everything they paid for.

**Why this priority**: Equal-first *as a seam*. Retrofitting account-level
entitlements after purchases exist means migrating real money records.

**Independent Test**: Grant an entitlement through one rail and confirm it is
present when reached through another.

**Acceptance Scenarios**:

1. **Given** an entitlement, **When** it is stored, **Then** it belongs to the **account**, never to the storefront that sold it.
2. **Given** a player reaching their account through any provider, **When** entitlements are read, **Then** they see everything they own.
3. **Given** the payment provider, **When** it is called, **Then** it is reached **through an interface**; feature code MUST NOT name a vendor.
4. **Given** a second rail added later, **When** it grants an entitlement, **Then** no code outside this feature changes.

---

### User Story 3 - The purchase path cannot be spoofed (Priority: P1)

A player who tampers with their client cannot grant themselves a pass.

**Why this priority**: Equal-first. A grant path that trusts the client is a free
storefront.

**Independent Test**: Attempt to grant an entitlement from the client and confirm
refusal; confirm grants originate only from a verified provider notification.

**Acceptance Scenarios**:

1. **Given** a client-originated claim of purchase, **When** received, **Then** it is **refused** — entitlements are granted only from verified provider notification.
2. **Given** a provider notification, **When** received, **Then** its authenticity is verified before anything is granted.
3. **Given** the same notification delivered twice, **When** processed, **Then** the entitlement is granted **once**.
4. **Given** a refunded or reversed payment, **When** notified, **Then** the entitlement is revoked.

---

### User Story 4 - The player can audit the ceiling (Priority: P2)

A player can determine what the maximum purchasable advantage is, and confirm
nothing sold exceeds it.

**Why this priority**: *A ceiling players can audit* is the design's distinctive
promise. It only holds if the storefront cannot quietly breach it.

**Independent Test**: Enumerate every purchasable item and confirm none grants
gameplay advantage beyond the pass, and no dual-priced item beats the best pass's
shard rate.

**Acceptance Scenarios**:

1. **Given** the catalogue, **When** enumerated, **Then** the only gameplay-affecting product is the boost pass.
2. **Given** any dual-priced item, **When** its shards-per-dollar is computed, **Then** it is **worse value than the best boost pass**.
3. **Given** shards, **When** a player attempts to buy them, **Then** there is **no such product**.
4. **Given** a cosmetic item, **When** sold, **Then** it affects no battle.

---

### Edge Cases

- **A purchase completing while the player is at the shard cap.** Passes grant time, not shards, so the cap does not apply. A shard-priced cosmetic bought with money is not a shard grant either.
- **A notification arriving before the player's session returns.** The entitlement must be granted regardless of whether the player is present.
- **A notification that never arrives.** Reconciliation must be possible from the provider's record.
- **A chargeback.** Under merchant-of-record the loss is absorbed by the reseller; the entitlement is still revoked.
- **A purchase made in one currency and read in another.** Entitlements are duration, not money — currency is a checkout concern only.
- **A pass bought during maintenance.** Purchase and gameplay availability are independent; a player may buy while unable to play.
- **A player buying a long pass then quitting.** No refund obligation beyond the provider's own policy; prepaid revenue is a stated benefit.

## Requirements *(mandatory)*

**The catalogue**

- **FR-001**: The storefront MUST sell exactly one gameplay-affecting product — the boost pair — in **seven durations** at **$5, $10, $15, $20, $50, $90 and $160**.
- **FR-002**: Passes MUST stack **additively**; a purchase while time remains MUST extend it.
- **FR-003**: **Nothing MAY auto-renew.** No subscription product may exist.
- **FR-004**: Shards MUST NOT be purchasable.
- **FR-005**: No dual-priced item MAY offer better shards-per-dollar than the best boost pass.
- **FR-006**: No product other than the boost pass MAY affect a battle.

**Entitlements**

- **FR-007**: An entitlement MUST belong to the **account**, never to a storefront.
- **FR-008**: Entitlements MUST be readable regardless of which provider the player signed in with.
- **FR-009**: A player MUST be able to see what they hold and when it expires.
- **FR-010**: An expired pass MUST simply lapse, with no charge and no renewal.

**Integrity**

- **FR-011**: Entitlements MUST be granted **only** from a verified provider notification. A client claim MUST be refused.
- **FR-012**: Provider notifications MUST be authenticated before acting.
- **FR-013**: Duplicate notifications MUST grant **exactly once**.
- **FR-014**: A refund or reversal MUST revoke the corresponding entitlement.
- **FR-015**: It MUST be possible to reconcile entitlements against the provider's own record.

**The rail**

- **FR-016**: The payment provider MUST be reached through an interface. Feature code MUST NOT name a vendor.
- **FR-017**: Adding a second rail MUST require no change outside this feature.
- **FR-018**: The statement descriptor MUST be recognisable to the buyer.

### Key Entities

- **Pass** — a purchasable duration of the boost pair. Seven variants.
- **Entitlement** — what a player owns, attached to the account: what and until when.
- **Payment rail** — an interface over a provider. One at 1.0.
- **Provider notification** — the authenticated message that a payment settled, reversed or refunded. The sole source of grants.

## Success Criteria *(mandatory)*

- **SC-001**: The maximum purchasable gameplay advantage is **$160 per year**, and a player can verify it from the catalogue.
- **SC-002**: **Zero** products auto-renew.
- **SC-003**: **Zero** products convert money to shards.
- **SC-004**: A purchase made on one rail is present on every other — **100%** of the time.
- **SC-005**: A client can grant itself **no** entitlement.
- **SC-006**: A duplicated provider notification grants **exactly one** entitlement.
- **SC-007**: A reversed payment revokes its entitlement.
- **SC-008**: Adding a second payment rail requires changes in **this feature only**.
- **SC-009**: Buying while a pass is active **always** extends and **never** resets.

## Assumptions

- **A merchant of record is used**, so tax across roughly forty jurisdictions and chargeback absorption are the provider's obligation rather than ours. The crossover where fees stop being cheaper than doing it ourselves is around **$150k/year** of direct revenue.
- **Removing subscriptions removed a category of problems**: auto-renewal regulation in three jurisdictions, dunning, *"I forgot I was subscribed"* chargebacks — which land on an account whose ratio matters — and the 4-week billing-interval problem, since a one-time purchase has no cycle.
- **The cost is real and accepted**: no recurring revenue, no renewal by inertia, and a repurchase requires an active decision. Against that, a repurchase is a **signal** rather than an oversight, and long passes are **prepaid revenue**, worth materially more to a self-funded project.
- **A hard currency was considered and rejected** — it would improve roughly 1% of total revenue while costing a second currency to explain.
- **Steam is a second rail later**, not at 1.0. Its 30% is accepted as buying back time, the same argument as merchant-of-record.
- **Cosmetic pricing lives in feature 12 and 14**; this feature enforces only the dual-price rule against them.
- **ARPU figures were all revised down 38%** when the ceiling fell from $260 to $160. Any revenue number written before 2026-07-28 is stale.

## Dependencies

**Upstream**: 05 (`auth`) for the account, 10 (`progression`) for what a boost
affects.

**Downstream**: 10 consumes the boost; 12 and 14 sell dual-priced cosmetics
subject to FR-005.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XIX** | Vendors behind interfaces | **The whole feature.** FR-007, FR-016, FR-017, SC-008 — the rail interface and account-level entitlements are what keep Steam cheap |
| **XII** | Server authority | FR-011 — a client claim of purchase is refused; grants come only from verified notification |
| **XIV** | Balance upward | SC-001 — an auditable ceiling is what makes *spending is not effectiveness* sayable |
| **XVIII** | Harm is a gate, taste is a note | FR-003 — no subscription, because a cancellation someone struggles with would be the most off-brand thing shippable |
