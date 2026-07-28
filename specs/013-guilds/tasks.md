# Tasks: Guilds

**Input**: Design documents from `/specs/013-guilds/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/guilds-api.md](contracts/guilds-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § Social models ·
**features 005, 009, 010, 012 and 014 complete**

**Tests**: **Included.** Succession spans **21 days of wall-clock across two
timers**, so it cannot be tested by waiting — which means an implementation that
requires waiting is an implementation that ships untested. The clock is injectable
before succession exists.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/guilds/`, `apps/api/src/db/schema/`, `apps/client/src/features/guilds/`.

> **Guilds ship without anything to compete in yet.** Wings, events and guild funds
> are **deferred with their design** — a Wing exists only for an event, so deferring
> events defers Wings; they are not separable. Guilds still earn their place at 1.0
> because **joining and founding are two of the four starter-league exits**.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/guilds/` and `apps/client/src/features/guilds/`, and register `/v1/guilds`, `/v1/applications`, `/v1/invites` in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `guilds` test project to `apps/api/vitest.config.ts`
- [ ] T003 Define the guild schema in `apps/api/src/db/schema/guilds.ts` — `guilds` (name permanent, emblem `{icon, ink, ground}`, pitch, motd, founded_at), `guild_members` with **`UNIQUE (account_id)`**, `guild_applications`, `guild_invites`, `guild_successions`
- [ ] T004 Generate and apply the guilds migration from `apps/api/drizzle/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: An injectable clock, banned by lint rather than by convention.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Define `Clock` in `apps/api/src/guilds/clock.ts` — `interface Clock { now(): Date }`, with `systemClock` and `fixedClock(t)`, taken as a **constructor dependency** by every module in this feature
- [ ] T006 **Ban the ambient calls by lint** in `apps/api/eslint.config.js` — `Date.now` and argument-less `new Date()` are errors inside `apps/api/src/guilds`. **A convention that says "inject the clock" is broken in a one-line bug fix at the worst possible moment**
- [ ] T007 Extend the same lint rule to every feature with a timer — application expiry (7 days), invitation expiry, and the starter week are all the same shape. **Share the configuration with `sim/rules`' clock ban** rather than each having its own

**Checkpoint**: Every timer in the feature is testable without waiting

---

## Phase 3: User Story 2 - A player joins a guild (Priority: P1) 🎯 the concurrency one

**Goal**: Apply to several, be accepted by one, and end up in exactly one — with the rules stated where the decision is made.

**Independent Test**: Apply to several guilds, have one accept, and confirm the others are withdrawn automatically.

> **Sequenced first among the P1s** because plan.md and research.md both say to
> confirm first-acceptance-wins **before building the happy path**. A concurrency
> test written afterwards is written against an implementation that already has a
> shape, and the shape is the thing being tested.

### Tests for User Story 2 ⚠️

- [ ] T008 [US2] Write `apps/api/tests/guilds/firstAcceptance.test.ts` — **two guilds accept the same applicant simultaneously, under real concurrency across two connections**, and assert exactly **one** `guild_members` row, exactly **one** application `accepted`, every other open application `withdrawn`, and the loser receiving **`409 { reason: 'already-joined' }`, not `500`**
- [ ] T009 [P] [US2] Add the right-row proof to `apps/api/tests/guilds/firstAcceptance.test.ts` — guild A accepting X while guild B accepts Y (**different players**) both succeed concurrently **with no serialisation**. Locking the guild row would serialise these for nothing
- [ ] T010 [P] [US2] Add the wrong-grain proof to `apps/api/tests/guilds/firstAcceptance.test.ts` — guild A accepting application 1 from X while guild B accepts application 2 from X. **These are different rows**; without the membership constraint X joins twice
- [ ] T011 [P] [US2] Write `apps/api/tests/guilds/limits.test.ts` — a 25th member is `409`; a 6th concurrent application is `409`; an application older than 7 days is `410`

### Implementation for User Story 2

- [ ] T012 [US2] Implement acceptance as **one transaction** in `apps/api/src/guilds/applications.ts` — insert the membership (the contended resource, protected by `UNIQUE (account_id)`), withdraw every other open application, mark this one accepted, and graduate from the starter league
- [ ] T013 [US2] Catch `23505` and return `409 { reason: 'already-joined', guildId }` in `apps/api/src/guilds/applications.ts` — the officer whose click lost sees *"Reyna joined The Long Reach a moment ago"* rather than a server error
- [ ] T014 [US2] Keep withdrawal **in the same transaction as the membership** in `apps/api/src/guilds/applications.ts` — two operations leave a window where the player is in a guild **and** has open applications, and a second acceptance in that window is a second membership. **That is the whole bug**
- [ ] T015 [US2] Implement the ≤5 concurrent cap in `apps/api/src/guilds/applications.ts`, **shown as a budget rather than discovered as an error** (FR-008)
- [ ] T016 [US2] Implement 7-day application expiry as a scheduled job in `apps/api/src/guilds/applications.ts` — **driven from Postgres, resumable, safe to re-run**, the same shape as feature 008's replay cleanup (FR-009)
- [ ] T017 [US2] State the **first-acceptance-wins** contract at the point of applying, in `apps/client/src/features/guilds/ApplicationForm.tsx` (FR-011)
- [ ] T018 [US2] Implement invitations in `apps/api/src/guilds/invites.ts` — accepting joins **immediately with no second confirmation**, because the player is the one being asked and their yes is the decision; accepting one **withdraws the rest**, stated plainly (FR-012, FR-013)
- [ ] T019 [US2] Show a dismissed application **as dismissed rather than vanishing**, with a **24-hour cooldown** before reapplying to that guild, in `apps/api/src/guilds/applications.ts` (FR-014)
- [ ] T020 [US2] Enforce the **24-member** cap in `apps/api/src/guilds/membership.ts` (FR-005, SC-003)

**Checkpoint**: A player accepted by one guild has zero remaining open applications, under concurrency.

---

## Phase 4: User Story 1 - A player founds a guild (Priority: P1)

**Goal**: Pay, name, design an emblem, write a pitch, and start inviting.

**Independent Test**: Found a guild and confirm the charge, the permanence of the name, and that the founder holds the master role.

### Tests for User Story 1 ⚠️

- [ ] T021 [US1] Write `apps/api/tests/guilds/starterWarning.test.ts` — **`POST /v1/guilds` first**, because founding is the door most likely to be missed. All three doors require **both** acknowledgements: founding, applying, and accepting an invitation (SC-002)
- [ ] T022 [P] [US1] Add the negatives to `apps/api/tests/guilds/starterWarning.test.ts` — one acknowledgement is `409`; none is `409`; **a player not in the starter league needs none**
- [ ] T023 [P] [US1] Add the timing case to `apps/api/tests/guilds/starterWarning.test.ts` — the player applies, a day passes, an officer accepts, and the assertion is that **the warning was shown at the application**. At acceptance the player is not present
- [ ] T024 [P] [US1] Write `apps/api/tests/guilds/found.test.ts` — 650 charged, the name permanent, the founder holding master, and the fee **non-refundable on disband**
- [ ] T025 [P] [US1] Write `apps/api/tests/guilds/emblem.test.ts` — a low-contrast combination **warns and saves**, never blocks (SC-004)

### Implementation for User Story 1

- [ ] T026 [US1] Implement `POST /v1/guilds` in `apps/api/src/guilds/found.ts` — the **650-shard charge and the guild creation as one transaction**, for the same reason the rune rebuild is: a partial failure leaves a paid-for guild that does not exist, or a guild nobody paid for (FR-001)
- [ ] T027 [US1] Require feature 009's `StarterExitWarning` payload on `POST /v1/guilds` in `apps/api/src/guilds/found.ts` — **the confirm cannot be constructed without it**, because it is a required field of the confirm's type (FR-015)
- [ ] T028 [US1] Require the same payload on `POST /v1/guilds/:id/applications` and `POST /v1/invites/:id/accept` in `apps/api/src/guilds/` (FR-015, FR-016)
- [ ] T029 [US1] Make the guild name **permanent** in `apps/api/src/guilds/found.ts`, changeable only by a moderation-forced rename which is **free** (FR-002)
- [ ] T030 [US1] Build the emblem designer in `apps/client/src/features/guilds/EmblemDesigner.tsx` — **36 icons including one blank, 12 inks, 12 grounds**, with palettes chosen so illegibility is unreachable by accident (FR-003)
- [ ] T031 [US1] **Warn, never block**, on low contrast in `apps/client/src/features/guilds/EmblemDesigner.tsx` — a solid block of colour is a permitted choice (FR-004, Constitution XVIII)
- [ ] T032 [US1] Store the recruiting pitch as a **guild property validated for length**, not text typed per posting, in `apps/api/src/guilds/found.ts` (FR-007)
- [ ] T033 [US1] **Build no guild tag** — no short abbreviation beside a player's name. Three characters cannot be read in context, and compression is exactly what defeats a blocklist (FR-006)

> **Unreconciled: [research.md](research.md) and [quickstart.md](quickstart.md) both
> say the emblem "is an image and therefore goes through review", on the same
> surface as avatars.** The spec says it is composed from a fixed palette of 36 × 12
> × 12 curated parts, and FR-004 says contrast **warns and never blocks** with no
> review step. **Implement the spec** — a composition of curated parts has nothing
> to review — and raise the discrepancy rather than resolving it here. The **name**
> and the **pitch** are text and do go through feature 015's moderation.

**Checkpoint**: A guild exists, is paid for, and its founder was warned before graduating.

---

## Phase 5: User Story 3 - A guild runs itself (Priority: P2)

**Goal**: A master delegates to officers who can recruit and manage without being able to dissolve what they did not build.

**Independent Test**: Exercise each permission at each role and confirm the boundaries.

### Tests for User Story 3 ⚠️

- [ ] T034 [P] [US3] Write `apps/api/tests/guilds/roles.test.ts` — the six-row permission grid: member invites `403`, officer invites `200`, officer succession `200`, officer sets emblem `403`, master disbands `200`, officer disbands `403`
- [ ] T035 [P] [US3] Write `apps/api/tests/guilds/boundary.test.ts` — `GET /v1/guilds/:id` exposes **no** other player's guild applications, **no** member's shard balance and **no** squad composition (Constitution XVII)

### Implementation for User Story 3

- [ ] T036 [US3] Implement the three roles in `apps/api/src/guilds/membership.ts` — **one** Guild Master, **at most 3** Officers, and Members (FR-017)
- [ ] T037 [US3] Enforce the permission table **server-side** in `apps/api/src/guilds/membership.ts`, never by hiding a control (FR-018, Constitution XII)
- [ ] T038 [US3] Implement `/motd` in `apps/api/src/guilds/motd.ts` — it sets a **pin** rather than sending a message, usable by master and officers, announcing in **guild chat only**, plus a **login notice** derived from a last-seen comparison (FR-019)

**Checkpoint**: A guild does not stop when one person does.

---

## Phase 6: User Story 4 - An absent master does not freeze a guild (Priority: P2)

**Goal**: A guild whose master stopped playing can continue, without letting anyone seize a guild from someone on holiday.

**Independent Test**: Run the full succession timeline and confirm both outcomes.

### Tests for User Story 4 ⚠️

- [ ] T039 [US4] Write `apps/api/tests/guilds/succession.test.ts` with the injected clock — **all four branches**: master returns at day 13 (never available), day 20 (available and **cancels**), never returns (**completes at day 21**), and **day 22 (too late — they are no longer master)**
- [ ] T040 [P] [US4] Add the money branch to `apps/api/tests/guilds/succession.test.ts` — an officer with 650 at day 14 who spends it and has 400 at day 21 **does not** complete. The 650 is checked **at completion**, not only at initiation
- [ ] T041 [P] [US4] Add the neutrality assertion to `apps/api/tests/guilds/succession.test.ts` — 650 moves from one player to another and **nothing is created or destroyed** (SC-006)
- [ ] T042 [P] [US4] Write `apps/api/tests/guilds/clock.test.ts` — `rg -n "Date\.now\(\)|new Date\(\)" apps/api/src/guilds` returns **nothing**, and adding `const t = Date.now()` to a guilds module **fails lint**

> **The day-22 branch is the one worth naming.** It is what a real person
> experiences as unfair, and it is the one nobody thinks to test. **Succession being
> final is a deliberate decision only if somebody wrote this test.**

### Implementation for User Story 4

- [ ] T043 [US4] Implement succession as **requested, not claimed**, in `apps/api/src/guilds/succession.ts` — available only after the master has been inactive **14 days** (FR-020)
- [ ] T044 [US4] Email the master on request via the sender interface, giving them **7 days**, in `apps/api/src/guilds/succession.ts` (FR-021)
- [ ] T045 [US4] Make **logging in** lapse the request in `apps/api/src/guilds/succession.ts` — **presence is the reply**, so the email contains **no link that grants anything** and is phishing-resistant by construction (FR-022, Constitution XIX)
- [ ] T046 [US4] Transfer on completion in `apps/api/src/guilds/succession.ts` — the requester pays **650** and the former master is **refunded 650** (FR-023)
- [ ] T047 [US4] Refuse a request from an officer who cannot afford 650, in `apps/api/src/guilds/succession.ts` (FR-024)
- [ ] T048 [US4] Leave a displaced master as a **Member**, not removed from the guild, in `apps/api/src/guilds/succession.ts` (FR-025)
- [ ] T049 [US4] Make **14 and 7 config, not constants**, in `apps/api/src/guilds/config.ts` — the shape is decided; the numbers want a real population

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T050 Implement activity in `apps/api/src/guilds/activity.ts` with *considered active for 14 days from founding regardless of headcount* **as part of the definition, not as a caller-side exception** — written as an exception it would need special-casing everywhere activity is read (FR-026, SC-007)
- [ ] T051 Define guild activity by member activity within a stated window that **does not depend on when a member plays** (FR-027, SC-008)
- [ ] T052 Write `apps/api/tests/guilds/deferred.test.ts` — `rg -in "wing|event|guildFund|treasury" apps/api/src/guilds` returns **nothing**. **A "harmless" Wing column now is a structure with no rules attached, and it will acquire wrong ones**
- [ ] T053 Dissolve a guild whose last member leaves, in `apps/api/src/guilds/membership.ts` — the founding fee is **not** returned. Succession refunds where disbanding does not, and the rule is *a guild costs 650 to hold*, not *you get your money back*
- [ ] T054 [P] Write `apps/api/src/guilds/README.md` — the three roles, the contended-row argument, and the standing note that Wings are deferred with their design
- [ ] T055 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 009, 010, 012, 014
- **Foundational (Phase 2)**: the clock — **blocks all four stories**
- **US2 (Phase 3)**: Foundational only. **Sequenced first**
- **US1 (Phase 4)**: needs feature 010's charge and feature 009's `StarterExitWarning`
- **US3 (Phase 5)**: needs membership (T012, T020) and feature 014's guild chat for `/motd`
- **US4 (Phase 6)**: needs the clock (T005) and roles (T036)
- **Polish (Phase 7)**: depends on US1 and US2

### User Story Dependencies

- **US2 (P1)**: none — but it needs *a* guild to exist, so use a fixture rather than sequencing US1 first
- **US1 (P1)**: none
- **US3 (P2)**: US2's membership
- **US4 (P2)**: US3's roles

### Within Each User Story

- Tests written and **failing** before implementation
- **Clock injection before succession exists**
- First-acceptance-wins **before** the happy path
- founding → membership and roles → applications and invites → succession → motd

### Parallel Opportunities

- **US1 and US2 can be worked in parallel** — founding and joining touch different modules, and US2's tests use a guild fixture
- T009, T010, T011 in parallel
- T022, T023, T024, T025 in parallel
- T034, T035 in parallel · T040, T041, T042 in parallel

---

## Parallel Example: User Story 2

```bash
# The concurrency test and its two proofs, all red first:
Task: "firstAcceptance.test.ts — two guilds, one applicant, real concurrency"
Task: "firstAcceptance.test.ts — different players do NOT serialise"
Task: "firstAcceptance.test.ts — two applications from one player still join once"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

Both are P1 and together they are the guild: **one exists, and people can get into
it exactly once.** Stop after Phase 4 and validate — five applications, one
acceptance, four withdrawals, and all three starter-league doors demanding both
acknowledgements.

1. Phase 2: **the clock, banned by lint**
2. Phase 3: US2 — **the concurrency test before the happy path**
3. Phase 4: US1 — **STOP and VALIDATE** the starter warning on **founding first**
4. Phase 5–6: roles, then succession with all four branches

### Incremental Delivery

US4's succession is P2 but it is the feature with the longest untestable surface —
21 days across two timers. **The clock work in Phase 2 is what makes it a
half-day's work instead of untestable**, so do not defer Phase 2 even if succession
is deferred.

---

## Notes

- **The succession fee is not revenue.** It prices a manual support ticket, makes
  the displaced master whole, and is economically neutral overall. *Losing a guild
  you abandoned is not the same as being robbed.*
- **A permanent name is not a trap**, because founding a new guild is always
  available for 650 — you simply start over with no history.
- **Guild funds do not exist at 1.0**, so a newly founded guild cannot advertise
  using them. Feature 014's free daily posting credits are what make recruiting
  possible without them.
- **Do not oversell the starter-league loss.** The ×1.5 mostly replaces dormant hold
  income; only about **11%** is actual help.
- **Whether a disbanded guild's name is reclaimable is not settled**, and no
  contract here depends on it.
- Commit after each task or logical group; work goes straight to `main`.
