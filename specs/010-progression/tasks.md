# Tasks: Progression — Shards, Runes & Rating

**Input**: Design documents from `/specs/010-progression/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/progression-api.md](contracts/progression-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) §§ 5–6 · **features 005, 007, 008 and 009 complete**

**Tests**: **Included.** The cap's three behaviours are written as **three separate
tests** — they differ, and a single "at the cap" test would pass while implementing
only one of them.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`apps/api/src/progression/`, `apps/api/src/db/schema/`.

> **All 27 heroes are unlocked from day one, so progression cannot be
> acquisition.** What a player accumulates is *rune investment* — permanent,
> destroyed on replacement — and what they demonstrate is *rating*, which measures
> whether they win with what they have.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/progression/` and register `/v1/me/shards` and `/v1/heroes/:heroId/runes` in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `progression` test project to `apps/api/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The append-only ledger and `config.ts`. **Everything reads them, and a rate hard-coded early is a rate hard-coded forever.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Define `shard_ledger` in `apps/api/src/db/schema/ledger.ts` — `account_id`, `delta`, `reason`, `battle_id?`, `created_at`. **Append-only**, with no `UPDATE` and no `DELETE` path anywhere
- [ ] T004 Implement `balance(accountId)` in `apps/api/src/progression/ledger.ts` as `SUM(delta)` — **derived, never a stored column**. A materialised balance is a cache, and a cache is an invalidation bug waiting for a concurrent write
- [ ] T005 Write `apps/api/src/progression/config.ts` holding **every** rate, cost, cap, tier boundary and K band — so no economy literal appears anywhere else. Under the no-nerf rule, tuning must never require a client release (SC-010)
- [ ] T006 Define `runes` in `apps/api/src/db/schema/runes.ts` — `account_id`, `hero_id`, `slot` (primary · secondary · common), `stage` 1–4, `allocations` (stat → points), `utility_effect` (stage 4 only)
- [ ] T007 Generate and apply the progression migration from `apps/api/drizzle/`

**Checkpoint**: One source of truth for the economy, and no tunable value outside `config.ts`

---

## Phase 3: User Story 1 - A player earns and invests (Priority: P1) 🎯 MVP

**Goal**: Win, accumulate, and commit to permanent rune investment.

**Independent Test**: Earn shards through each route and spend them through a full rune, confirming payouts and costs.

### Tests for User Story 1 ⚠️

- [ ] T008 [P] [US1] Write `apps/api/tests/progression/income.test.ts` — attack victory pays **20** through a chosen door and **40** through an ambush; a hold pays **10** Visible and **20** Hidden; a loss pays **0** and **takes nothing away** (SC-001)
- [ ] T009 [P] [US1] Write `apps/api/tests/progression/ledger.test.ts` — `rg -n "UPDATE shard_ledger|DELETE FROM shard_ledger" apps/api/src` returns **nothing**; `balance()` matches a hand-computed sum; there is **no `balance` column on `accounts`**
- [ ] T010 [P] [US1] Write `apps/api/tests/progression/runes.test.ts` — four stages at **150 · 150 · 150 · 200** for **650**, granting **+20 · +10 · +5 · a utility effect**; three slots per hero typed primary, secondary and common; planning is **free**

### Implementation for User Story 1

- [ ] T011 [US1] Implement `awardShards(accountId, reason, battleId)` in `apps/api/src/progression/income.ts` as **the only writer of positive battle income** (FR-001)
- [ ] T012 [US1] Ensure **nothing deducts shards as a cost of attempting a battle**, anywhere in `apps/api/src/progression/` — the sting of losing lives in the ladder, not the economy (FR-002)
- [ ] T013 [US1] Implement the three rune slots in `apps/api/src/progression/runes.ts` — one typed to the hero's primary, one to its secondary, one common (FR-005)
- [ ] T014 [US1] Implement the four stages in `apps/api/src/progression/runes.ts` with the utility slot **gated behind completion of the boost stages** — deliberately a bad buy early and a good buy late, which is the stage gate justifying itself economically (FR-006, FR-011)
- [ ] T015 [US1] Allow the three boosts to **stack on a single stat** in `apps/api/src/progression/runes.ts`, with the **75 cap as the only constraint** — preserving the **57 exact fills** on the roster, which is the most satisfying thing a rune can do (FR-007, SC-008)
- [ ] T016 [US1] Refuse a boost that would exceed the 75 cap in `apps/api/src/progression/runes.ts` (FR-012)
- [ ] T017 [US1] Implement `POST /v1/heroes/:heroId/runes/:slot` in `apps/api/src/progression/routes.ts` with the status table — `200`, `402` insufficient shards, `409` unconfirmed replacement, `422` element/slot mismatch
- [ ] T018 [US1] Implement `GET /v1/me/shards` in `apps/api/src/progression/routes.ts` carrying the balance, the day's victory count and **`nextBoundaryAt`**, so the taper is legible **before** it bites

**Checkpoint**: The progression loop turns — earn, plan freely, commit permanently.

---

## Phase 4: User Story 2 - Committing is permanent, and the player knows before they act (Priority: P1)

**Goal**: Destruction on replacement, warned every time, executed as one transaction.

**Independent Test**: Attempt a replacement and confirm the warning, the destruction, and that a rebuild is one transaction rather than four.

### Tests for User Story 2 ⚠️

> **Write the destruction warning path before the happy path.** FR-009's warning is
> the part a player experiences as fairness; the charge is the easy half.

- [ ] T019 [US2] Write `apps/api/tests/progression/rebuild.test.ts` — place a stage-4 rune, rebuild the same slot, and assert **exactly one row** with reason `rune-rebuild` and delta **−650**; the old rune is **gone, all four stages**; gear score is recomputed and the league may have moved
- [ ] T020 [P] [US2] Add the atomicity case to `apps/api/tests/progression/rebuild.test.ts` — inject a failure **after** the rune write and **before** commit, then assert balance unchanged, old rune intact, gear score unchanged
- [ ] T021 [P] [US2] Add the confirm-content case to `apps/api/tests/progression/rebuild.test.ts` — the confirm names that the old rune is gone **including its utility effect**, and that **the new one is not necessarily an upgrade** (SC-007)

### Implementation for User Story 2

- [ ] T022 [US2] Implement `rebuildRune` in `apps/api/src/progression/runes.ts` as **one transaction with one charge of 650** — assert balance, one ledger entry, destroy all stages, create at stage 4, recompute gear score (research.md Q3)
- [ ] T023 [US2] Put the gear-score recompute **inside** the transaction in `apps/api/src/progression/runes.ts` — a recompute outside it is exactly the window feature 009 exists to close: *"no window between deploying a month of shards and the league noticing"*
- [ ] T024 [US2] Return `409` when `confirmed` is absent and the slot is occupied, in `apps/api/src/progression/routes.ts` — a rebuild is destructive and the confirm is not boilerplate (FR-009)
- [ ] T025 [US2] **Provide no refund path** in `apps/api/src/progression/runes.ts`. Commitment is the mechanic, and destruction on replacement is why a nerf writes off real spend — the origin of the balance-upward rule (Constitution XIV)

**Checkpoint**: The load-bearing rule of the whole economy is enforced and always warned about.

---

## Phase 5: User Story 3 - The ladder measures skill, not hours (Priority: P1)

**Goal**: A strong player at two hours a week outranks a weaker one at twenty.

**Independent Test**: Simulate a strong low-volume player and a weak high-volume one; confirm the ranking.

### Tests for User Story 3 ⚠️

> **Rating convergence is verified against a simulated population, not a unit
> test.** SC-003 is a population property.

- [ ] T026 [US3] Write `apps/api/tests/progression/rating.test.ts` against feature 009's population harness — 2,000 players with known latent skill, asserting on **rank correlation**: ≥ **0.89** at 30 battles, ≥ **0.95** at 100, ≥ **0.98** at 400
- [ ] T027 [P] [US3] **Assert ordinally, never on absolute error**, in `apps/api/tests/progression/rating.test.ts` — absolute error bottoms out at ~100 battles and then grows, which is population drift rather than convergence failing, and asserting on it produces a test that fails for a reason that does not matter
- [ ] T028 [P] [US3] Write the non-zero-sum assertion **explicitly** in `apps/api/tests/progression/rating.test.ts` — at even ratings and K=10, a Visible battle is `+5.0 / −5.0` net **0** and a Hidden battle is `+10.0 / −5.0` net **+5.0**. It is deliberate, and it is a **discovered surprise only if nobody wrote it down**
- [ ] T029 [P] [US3] Add the no-absolute-threshold guard to `apps/api/tests/progression/rating.test.ts` — `rg -n "rating\s*[<>]=?\s*[0-9]" apps/api/src apps/client/src` returns **nothing**. Any absolute threshold on rating will drift

### Implementation for User Story 3

- [ ] T030 [US3] Implement `updateRating(battle)` in `apps/api/src/progression/rating.ts` as standard Elo on a 400-point logistic — `E_a = 1 / (1 + 10^((R_d − R_a)/400))`, `delta = K × (score − E_a)` (research.md Q2)
- [ ] T031 [US3] Implement the three K bands from `config.ts` — **40** for the first 30 rated battles, **20** through 200, **10** beyond. **They are a starting point, not a decision**, so they live in config (FR-021)
- [ ] T032 [US3] Double the **winner's positive delta** for a Hidden victory in `apps/api/src/progression/rating.ts`, leaving a loss costing the same in either zone (FR-022)
- [ ] T033 [US3] Start every account at **1000** in `apps/api/src/progression/rating.ts` (FR-020)
- [ ] T034 [US3] Confirm **gear is not an input** to `apps/api/src/progression/rating.ts` — the two axes stay separate (FR-023, SC-009)
- [ ] T035 [US3] Call `updateRating` **inside feature 007's conclusion transaction**, so rating and the battle record move together
- [ ] T036 [US3] Pay the weekly ladder on **standing at the close of the week**, never on volume accumulated during it, in `apps/api/src/progression/rating.ts` (FR-024)

**Checkpoint**: The ladder rewards skill. Neither farming a weak defender nor grinding bots is a rating strategy.

---

## Phase 6: User Story 4 - Income tapers within a day (Priority: P2)

**Goal**: The first victories pay full; later ones pay less, so a long session is worth playing but does not dominate.

**Independent Test**: Play past the tier boundaries and confirm the payout curve.

### Tests for User Story 4 ⚠️

- [ ] T037 [P] [US4] Write `apps/api/tests/progression/tiers.test.ts` — victories 1–5 pay **30 / 60**, 6–20 pay **20 / 40**, 21+ pay **10 / 20**, and **holds are never tiered at any victory count**
- [ ] T038 [P] [US4] Test the boundaries at **exactly** 5/6 and 20/21 in `apps/api/tests/progression/tiers.test.ts` — an off-by-one here is a silent, permanent overpay or underpay
- [ ] T039 [P] [US4] Assert the two stated properties in `apps/api/tests/progression/tiers.test.ts` — **play is never blocked** at any victory count, and **nothing is ever capped at zero**: the 21+ tier pays 0.5×, not nothing

### Implementation for User Story 4

- [ ] T040 [US4] Implement the daily tier curve in `apps/api/src/progression/income.ts` from `config.ts` — the boundaries are **recorded in canon**, not open, so implement `5`, `20` and the three multipliers as config values (research.md Q1)
- [ ] T041 [US4] Apply the ambush **2×** on top of the daily tier in `apps/api/src/progression/income.ts` (FR-004)
- [ ] T042 [US4] Reset the tier at the daily boundary in `apps/api/src/progression/income.ts` (FR-003)
- [ ] T043 [US4] Exclude holds from tiering in `apps/api/src/progression/income.ts` — a hold is driven by how often other people attack you, which the defender does not control, so there is nothing there to pace

**Checkpoint**: A heavy player cannot out-earn a typical one by hours rather than skill.

---

## Phase 7: User Story 5 - A balance never grows without limit (Priority: P2)

**Goal**: Saving stops at ten runes' worth — but a won prize is never lost.

**Independent Test**: Reach the cap and confirm the three asymmetric behaviours.

### Tests for User Story 5 ⚠️

> **Three separate tests.** An implementation with one `if (balance >= CAP)` gets at
> most one of the three right.

- [ ] T044 [US5] Write `apps/api/tests/progression/cap.test.ts` case one — at **6,500**, winning a battle awards **0**. Income **stops**: no overflow, no queue, no loss notification beyond the balance display (FR-014)
- [ ] T045 [US5] Write `apps/api/tests/progression/cap.test.ts` case two — at the cap, a **grant lands** and may carry the balance **above** it (FR-015)
- [ ] T046 [US5] Write `apps/api/tests/progression/cap.test.ts` case three — a purchase that would exceed the cap is **refused before the payment rail is touched**. Assert it by injecting a failure into the rail and confirming it was **never reached** (FR-016)

> **Case three has a money consequence.** Never take money for shards that cannot
> be delivered.

### Implementation for User Story 5

- [ ] T047 [US5] Apply the **6,500** cap inside `awardShards` in `apps/api/src/progression/cap.ts` — battle income silently stops (FR-013)
- [ ] T048 [US5] Implement `grantShards(accountId, amount, reason)` in `apps/api/src/progression/cap.ts` as a **deliberately different function that bypasses the cap** — so the cap cannot be forgotten in one place and applied in the other. **A cap that swallowed the apology would deny it to exactly the players most affected by a nerf**
- [ ] T049 [US5] Implement `canAcceptPurchase(accountId, amount)` in `apps/api/src/progression/cap.ts` returning `{ ok: false, reason: 'would-exceed-cap', headroom }`, for feature 011 to call **before** invoking the rail
- [ ] T050 [US5] Present the cap as **ten full runes**, never as a bare number, in `apps/api/src/progression/routes.ts` (FR-017)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T051 Signal the **3,250-shard** starter-league exit to feature 009 from `apps/api/src/progression/income.ts` — five full runes (feature 009 FR-022, exit 2)
- [ ] T052 Add the gear-score guard to `apps/api/tests/progression/gearScore.test.ts` — reads runes **currently on heroes**, never lifetime spend, so ten rebuilds of one slot is 6,500 shards spent for **125 of score, not 1,250**
- [ ] T053 Write the zone-asymmetry assertion in `apps/api/tests/progression/rating.test.ts` — a defender at 20 attacks/day, 85/15, holding 40%/60% at K=10 gives **Visible −17.0/day and Hidden +12.0/day**. **This asserts the arithmetic, not the premise**
- [ ] T054 [P] Put the zone-balance query in the ops runbook — `zone` + outcome + `defender_is_bot` on the battle record is the only thing that can detect the hold rates converging
- [ ] T055 [P] Write `apps/api/src/progression/README.md` — the three properties holding the economy together, and the standing note that every value lives in `config.ts`
- [ ] T056 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 007, 008, 009
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: needs `placeRune` (T013–T017)
- **US3 (Phase 5)**: needs feature 009's population harness and feature 007's conclusion transaction
- **US4 (Phase 6)**: needs `awardShards` (T011)
- **US5 (Phase 7)**: needs `awardShards` (T011) and `balance` (T004)
- **Polish (Phase 8)**: depends on US1, US3 and US5

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P1)**: US1
- **US3 (P1)**: none within this feature — **fully parallel with US1 and US2**
- **US4 (P2)**: US1
- **US5 (P2)**: US1

### Within Each User Story

- Tests written and **failing** before implementation
- **Ledger and `config.ts` first** — everything reads them
- The rune-destruction warning before the happy path

### Parallel Opportunities

- **US3 (rating) is fully parallel with US1, US2, US4 and US5** — it touches
  `rating.ts` and nothing in the shard path
- T008, T009, T010 in parallel · T037, T038, T039 in parallel
- T044, T045, T046 are three separate tests and can be written in parallel

---

## Parallel Example: User Story 5

```bash
# Three separate tests for three different behaviours at one number:
Task: "cap.test.ts case 1 — battle income stops at 6,500"
Task: "cap.test.ts case 2 — a grant lands and may exceed the cap"
Task: "cap.test.ts case 3 — a purchase is refused BEFORE the rail"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

All three are P1 and together they are the whole progression thesis: **earn, commit
permanently, and be measured on skill rather than hours.** Stop after Phase 5 and
validate — the rebuild is one ledger row, and rank correlation clears 0.89 at 30
battles.

1. Phase 1–2: the ledger and `config.ts`
2. Phase 3: US1
3. Phase 4: US2 — **STOP and VALIDATE** the one-transaction rebuild
4. Phase 5: US3 — **STOP and VALIDATE** against the simulated population
5. Phase 6–7: the daily taper and the cap

### Incremental Delivery

US5's cap is insurance rather than an exploit fix — hoarding was examined and
dismissed. It can land after the loop works, but before anything else in the design
needs the balance to be finite.

---

## Notes

- **The Hidden 2× bonus makes rating non-zero-sum**, injecting roughly **2,700
  points a year** into an active established account. Both stated jobs of the
  rating — standing, and the order league-mates are offered in — are **ordinal and
  survive it**. What stops being true is *"everyone starts at 1000"* meaning
  *"starts at average"*. **Starting new accounts at the population median is
  raised, not taken** — it is a canon change.
- **Whether the 20-victory shoulder is right rests on an untested assumption** about
  how long a battle takes in wall-clock. `turnCount` plus the wall-clock difference
  answers it from the first battle, using fields already mandatory.
- **Whether Hidden actually holds better than Visible is unverified and the whole
  zone choice rests on it.** If the hold rates converge, Visible wins both
  currencies and the choice collapses.
- **Shards cannot be bought.** This feature owns what shards do; feature 011 owns
  how money becomes entitlements.
- Commit after each task or logical group; work goes straight to `main`.
