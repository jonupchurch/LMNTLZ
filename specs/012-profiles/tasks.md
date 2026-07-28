# Tasks: Public Profiles & Data Export

**Input**: Design documents from `/specs/012-profiles/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/profiles-api.md](contracts/profiles-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) §§ 1, 4 · **features 005, 008, 009, 010 and 011 complete**

**Tests**: **Included, and one of them is task one.** The alternating-battles leak
test is the cheapest possible guard on the subtlest rule in the feature, and **no
amount of code review reliably catches** the bug it prevents.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3
- Exact file paths in every task

## Path Conventions

`apps/api/src/profiles/`, `apps/client/src/features/profile/`.

> **The organising rule**: the profile is **fixed**. A player chooses their name and
> avatar and nothing else about what is shown; only **time zone and languages** may
> be hidden. A configurable profile sounds friendlier and is worse here — every
> hidden field becomes a signal, and **an absence that can be measured is not an
> absence**.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/profiles/` and `apps/client/src/features/profile/`, and register `/v1/players/:targetId/profile`, `/v1/me/export`, `/v1/guilds/:id/export` and `/v1/me/avatar` in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `profiles` test project to `apps/api/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: **The leak test, before the query it tests.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Write `apps/api/tests/profiles/visibleRecord.test.ts` — a fixture whose last **40** battles alternate strictly Visible/Hidden. A **filtered** implementation returns ~10 entries; a **selected** one returns **20**
- [ ] T004 [P] Add the three sharper fixtures to `apps/api/tests/profiles/visibleRecord.test.ts` — fewer than 20 Visible ever returns **as many as exist, never padded**; the 20 most recent all Hidden returns 20 Visible **from further back**; a brand-new account returns an empty list and the profile **still renders**
- [ ] T005 [P] Add the timestamp assertion to `apps/api/tests/profiles/visibleRecord.test.ts` — entries carry `concludedOn` as a **day**, never a precise `concludedAt`

> **T003 is task one and it fails loudly on the wrong implementation.** Both queries
> read correctly and differ only in where `LIMIT` sits:
>
> ```sql
> -- WRONG: take 20, then drop Hidden. The gap is measurable.
> SELECT * FROM (SELECT … ORDER BY concluded_at DESC LIMIT 20) t WHERE zone='visible';
> -- RIGHT: select 20 Visible, however far back that reaches.
> SELECT … WHERE zone='visible' ORDER BY concluded_at DESC LIMIT 20;
> ```
>
> Under the filtered query a viewer who counts entries learns how many of the last
> 20 battles were Hidden. Repeated over days that yields the player's ambush rate,
> their Hidden hold rate, and roughly when they were ambushed.

> **T005 matters as much as T003.** Exact times leak the same information one step
> removed — the **intervals** between entries reveal how many battles happened in
> the gaps. A correct query with precise timestamps is a correct query that still
> leaks.

**Checkpoint**: The disclosure model has a test before it has an implementation

---

## Phase 3: User Story 1 - A player scouts an opponent honestly (Priority: P1) 🎯 MVP

**Goal**: The fixed profile, and the last 20 Visible battles **selected as such**.

**Independent Test**: View a profile whose recent battles include Hidden ones and confirm the list is exactly 20 Visible battles with no measurable gap.

### Tests for User Story 1 ⚠️

- [ ] T006 [P] [US1] Write `apps/api/tests/profiles/boundary.test.ts` — assert **absent** by searching the whole serialised response: email, provider identity, entitlements, shard balance, **either zone's composition**, **any Hidden battle**, and **any gap where one would be** (SC-001, SC-002)
- [ ] T007 [P] [US1] Add the structural check to `apps/api/tests/profiles/boundary.test.ts` — `profile` and feature 006's `scout` **must not share a serialiser**. Two routes, two disclosure rules; a shared serialiser is precisely how the Hidden squad leaks

### Implementation for User Story 1

- [ ] T008 [US1] Write `apps/api/src/profiles/visibleRecord.ts` as **its own module with one query in it** — `SELECT … WHERE zone = 'visible' ORDER BY concluded_at DESC LIMIT 20`. The difference between selecting and filtering is a single clause, and it is the clause the whole disclosure model rests on (FR-003)
- [ ] T009 [US1] Round displayed timestamps to the day in `apps/api/src/profiles/visibleRecord.ts` (FR-004)
- [ ] T010 [US1] Implement `apps/api/src/profiles/publicProfile.ts` with the **fixed** field set — username, avatar, account age, league, rating, gear score, **both** hold streaks, and guild name and role
- [ ] T011 [US1] Withhold everything on the research list in `apps/api/src/profiles/publicProfile.ts` — email, provider identity, entitlements, shard balance, **either zone's composition**, and anything about another player's guild application (FR-005)
- [ ] T012 [US1] Make **time zone and languages the only hideable fields** in `apps/api/src/profiles/publicProfile.ts` — with **no per-field visibility controls** anywhere else (FR-001, FR-002)
- [ ] T013 [US1] Implement `GET /v1/players/:targetId/profile` in `apps/api/src/profiles/routes.ts` — note `targetId`, per feature 005's convention
- [ ] T014 [P] [US1] Build `apps/client/src/features/profile/PublicProfile.tsx` and `BattleRecord.tsx`

> **Never render a Hidden squad on this surface, at any stage of development.** A
> temporary debug view is how it ends up in a screenshot.

**Checkpoint**: Scouting works, and the Hidden zone contributes exactly one number — its streak.

---

## Phase 4: User Story 2 - A player takes their own data with them (Priority: P2)

**Goal**: A complete export of a player's own data, in a form they can open — carrying no squad composition on either side.

**Independent Test**: Export as a player and confirm completeness; export as a guild officer and confirm the narrower scope.

### Tests for User Story 2 ⚠️

- [ ] T015 [US2] Write `apps/api/tests/profiles/export.test.ts` asserting the header **exactly** — `battleId · concludedAt · role · opponentUsername · opponentWasBot · zone · outcome · turnCount · leagueAtTime · ratingAfter`. **An exact match, never `toContain`**, so a widened export fails CI
- [ ] T016 [P] [US2] Add the composition scan to `apps/api/tests/profiles/export.test.ts` — export a player with 200 battles and grep the CSV for any hero name, row name or the word `squad`. **Nothing** (SC-004)
- [ ] T017 [P] [US2] Add the two-routes check to `apps/api/tests/profiles/export.test.ts` — `rg -n "scope|includeGuild" apps/api/src/profiles` returns **nothing**

### Implementation for User Story 2

- [ ] T018 [US2] Implement `GET /v1/me/export` in `apps/api/src/profiles/export.ts` as **a `SELECT` naming ten columns** — never `SELECT *` and never an object spread. **Default-deny by construction**: adding a column to `battle_records` is a schema change; adding one to the export is an edit to this list (FR-007)
- [ ] T019 [US2] **Drop both squad columns rather than conditionally emitting one** in `apps/api/src/profiles/export.ts`. A conditional is wrong twice — a player can publish their own export, so including their own Hidden squad is a **self-service leak**; and it is one inverted boolean from full disclosure, producing a plausible file nobody notices for months
- [ ] T020 [US2] Include a player's own **Hidden battles** in their export in `apps/api/src/profiles/export.ts` — the rows, never the compositions (FR-006)
- [ ] T021 [US2] Implement `GET /v1/guilds/:id/export` in `apps/api/src/profiles/export.ts` as **a second route with a different query**, officers only, **event data only** and no member battle detail — not even the officer's own (FR-008, SC-005)
- [ ] T022 [US2] Emit a plain tabular format from `apps/api/src/profiles/export.ts` that a player can open without special software (FR-009)
- [ ] T023 [US2] Rate-limit both export routes in `apps/api/src/profiles/routes.ts` — it is a bulk read (FR-010)

> **Two exports, two routes, not one parameterised route.** A `scope` parameter
> invites the bug where an officer requests the wider scope; two routes with two
> queries **cannot express that mistake**.

**Checkpoint**: A player can take everything of theirs, and nothing of anyone's squad.

---

## Phase 5: User Story 3 - A player presents an identity they chose (Priority: P2)

**Goal**: A name and an avatar, with clear costs and no way to present something harmful.

**Independent Test**: Change a name and an avatar, confirming both prices and the pre-moderation path.

> **Build the curated avatar path before the custom one.** Curated needs no review
> queue, so it delivers the whole feature's value without depending on feature 016
> existing yet.

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] Write `apps/api/tests/profiles/avatar.test.ts` — submission is **charged immediately** with state `pending`; the avatar URL is **not publicly reachable while pending**; a rejection **refunds nothing**; a resubmission is **charged again**
- [ ] T025 [P] [US3] Add the harm-gate structural check to `apps/api/tests/profiles/avatar.test.ts` — the rejection-reason enum has **no `low-quality` member**, so a reviewer who wants to reject on taste has no value to submit (Constitution XVIII enforced by the type)
- [ ] T026 [P] [US3] Write `apps/api/tests/profiles/pricing.test.ts` — a voluntary rename costs **325 shards**, a forced rename is **free**, and the avatar's shards-per-dollar is **worse than the best boost pass** as reported by feature 011's `bestShardsPerDollar()` (SC-007, SC-008)

### Implementation for User Story 3

- [ ] T027 [US3] Build the curated avatar set in `apps/client/src/features/profile/AvatarPicker.tsx` — **curated avatars need no review**
- [ ] T028 [US3] Implement `POST /v1/me/avatar` in `apps/api/src/profiles/avatar.ts` — **$5 or 1,350 shards, charged per change** rather than once to unlock (FR-012)
- [ ] T029 [US3] Charge **on submission, not on approval**, in `apps/api/src/profiles/avatar.ts` — otherwise a rejected submission is free and the throttle disappears. **A rejection refunds nothing and says so before payment.** That is harsh and it is the mechanism
- [ ] T030 [US3] Treat a resubmission as a new submission with a new fee in `apps/api/src/profiles/avatar.ts` — otherwise one purchase buys unlimited attempts
- [ ] T031 [US3] Hold every custom avatar **invisible to everyone until a human approves it** in `apps/api/src/profiles/avatar.ts` — a genuine harm gate: a bad image seen by every opponent cannot be undone by a later removal (FR-013)
- [ ] T032 [US3] Store avatars in **the same private Blob store as replays under a distinct prefix** — an unapproved avatar must not be reachable by URL while it sits in the queue, and a public store cannot express that
- [ ] T033 [US3] Notify the player of the decision in `apps/api/src/profiles/avatar.ts`, with a **free resubmission** on rejection (FR-014)
- [ ] T034 [US3] Confirm the review queue surface exists in feature 016's `apps/admin` — a review is a **~20-second glance** and the **$5 fee is the throughput control**, at ~180/hour and $900 of submissions per reviewer-hour

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Add the Playwright pass in `apps/client/e2e/profile.spec.ts` — view a heavy-Hidden player's profile and confirm 20 Visible entries with no measurable gap
- [ ] T036 [P] Write `apps/api/src/profiles/README.md` — the fixed-profile rationale, the selected-not-filtered rule, and the standing instruction that `profile` and `scout` never share a serialiser
- [ ] T037 Run the full quickstart manual pass, including the `rg` scans over an exported CSV

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 008, 009, 010, 011
- **Foundational (Phase 2)**: **the leak test, and it blocks everything**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: needs feature 008's `battle_records`
- **US3 (Phase 5)**: needs feature 010's shard charge and feature 011's `bestShardsPerDollar()`; the **custom** path additionally needs feature 016's queue
- **Polish (Phase 6)**: depends on US1 and US2

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P2)**: none beyond Phase 2 — **fully parallel with US1**
- **US3 (P2)**: none beyond Phase 2 for the **curated** path; the custom path waits on 016

### Within Each User Story

- Tests written and **failing** before implementation
- **The leak test before the query**
- The curated avatar path before the custom one

### Parallel Opportunities

- **US2 is fully parallel with US1** — the export touches no profile route
- T004, T005 in parallel with T003's implementation half
- T006, T007 in parallel · T015, T016, T017 in parallel
- T024, T025, T026 in parallel

---

## Parallel Example: User Story 2

```bash
# Three independent assertions, all red first:
Task: "export.test.ts — the header row, matched exactly"
Task: "export.test.ts — grep 200 battles' CSV for any composition"
Task: "export.test.ts — no scope parameter exists"
```

---

## Implementation Strategy

### MVP First (US1)

Scouting is how counter-building works and this is the surface it happens on. Stop
after Phase 3 and validate against the alternating-battles fixture — 20 entries,
day-rounded timestamps, and no shared serialiser with `scout`.

1. Phase 2: **the leak test first**
2. Phase 3: US1 — **STOP and VALIDATE** the boundary by searching the whole response
3. Phase 4: US2 — the export, header matched exactly
4. Phase 5: US3 — curated avatars, then custom

### Incremental Delivery

US3's **custom** avatar path is the only thing here that depends on feature 016.
Ship curated avatars with US1 and add custom submission when the admin queue exists;
the fee, the pre-moderation hold and the harm-only enum are all in place either way.

---

## Notes

- **A fixed profile is a design choice, not a limitation.** Configurable visibility
  would make every hidden field a signal — and in a game where everyone owns the
  same 27 heroes, absence is information.
- **Aggregation is a privacy change even when every row is individually public**,
  which is why a guild officer's export is narrowed to event data. That narrowing
  also decouples the export from profile visibility — the two no longer constrain
  each other.
- **Chat is text-only, which avoids the expensive half of moderation.** Custom
  avatars reintroduce image moderation **deliberately**, and the fee is what keeps
  the volume small enough for a human to handle.
- **Whether the last-20 window is right is not settled.** 20 is a legibility choice,
  changeable without a schema change, and it wants a look once the Battle Record
  screen has real use.
- Commit after each task or logical group; work goes straight to `main`.
