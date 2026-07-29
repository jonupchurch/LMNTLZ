# Tasks: Roster & Squads

**Input**: Design documents from `/specs/006-roster-and-squads/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/squads-api.md](contracts/squads-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 3 · **features 001, 002, 004 and 005 complete**

**Tests**: **Included.** The three-squad eviction case and the no-op streak save
are each the ordinary path rather than an edge case, and each is the thing a
plausible implementation gets backwards.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`apps/api/src/squads/`, `apps/api/src/db/schema/`, `apps/client/src/features/squads/`.

> **Feature 006 carries the client bootstrap.** It is the first feature with a real
> interface, so Phase 1 stands up Vite + React + Tailwind once for the rest of the set.

> **The counting constraint that shapes everything**: 27 heroes, all unlocked.
> **12 go to defense** and then cannot attack. Up to **3 attack squads** are drawn
> from the remaining **15** — and 3 × 6 = 18 > 15, so **overlap is forced, not
> optional**, and one defensive swap routinely breaks all three at once.

---

## Phase 1: Setup (the client app, once)

- [x] T001 Scaffold `apps/client/` — Vite + React + TypeScript, `package.json` named `@lmntlz/client`, dependencies on `@lmntlz/content` and `@lmntlz/sim/rules` **only** (never `/resolver` or `/ai`)
- [x] T002 Add Tailwind to `apps/client/` with the design tokens from `resources/designsystem/`
- [x] T003 [P] Set the viewport floor in `apps/client/src/styles/base.css` — minimum window **1280×720**, designed for **1600×900**, mouse and keyboard only, **mandatory keyboard focus rings**, no touch targets
- [x] T004 [P] Add a `squad-builder` test project to `apps/client/vitest.config.ts` and a `squads` project to `apps/api/vitest.config.ts`
- [x] T005 Create `apps/api/src/db/schema/squads.ts` — `squads` (accountId, kind, zone, slotIndex, name, valid, holdStreak, editedAt) and `squad_seats` (squadId, row, index, heroId), plus `squad_member_config` for the defense-only behaviour fields

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The allocation invariants. **Server rules with clear tests; the builder is a view onto them.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement squad-shape validation in `apps/api/src/squads/allocation.ts` — exactly **6 heroes as 2 front, 3 middle, 1 back**, rejecting anything else with `422` (FR-003)
- [x] T007 Implement the exclusivity rule in `apps/api/src/squads/allocation.ts` — a hero on **either** defense zone is unavailable to **every** offense squad, without exception (FR-007)
- [x] T008 Implement `evictionImpact(accountId, heroId)` in `apps/api/src/squads/allocation.ts` returning **every** attack squad containing the hero, **never truncated**
- [x] T009 Implement `canonicalForm(squad)` in `apps/api/src/squads/canonical.ts` — per seat in row then index order: `heroId · targeting[0] · targeting[1] · ranking · allyRule` (research.md Q1)
- [x] T010 Implement `streakResets(prev, next)` in `apps/api/src/squads/canonical.ts` as a hash comparison of canonical forms — **never a client-set dirty flag**, which is set by the editor and is therefore wrong the first time a re-render touches a field
- [x] T011 Generate and apply the squads migration from `apps/api/drizzle/`

**Checkpoint**: Eviction, invalidation and the streak reset are correct before any pixel exists

---

## Phase 3: User Story 1 - A player allocates twelve heroes to defense (Priority: P1) 🎯 MVP

**Goal**: Two defense zones of six, and exactly fifteen heroes left for offense.

**Independent Test**: Assign twelve heroes across both zones and confirm exactly fifteen remain available for offense.

### Tests for User Story 1 ⚠️

- [x] T012 [P] [US1] Write `apps/api/tests/squads/allocation.test.ts` — all 27 available with **no unlock, ownership or collection state anywhere in the schema** (SC-001); twelve committed leaves exactly fifteen (SC-002)
- [x] T013 [P] [US1] Write `apps/api/tests/squads/validation.test.ts` — five seats instead of six is `422`; a hero already on the other zone is `409`; a `ranking` that is not a permutation of 0–5 is `422`

### Implementation for User Story 1

- [x] T014 [US1] Implement `GET /v1/roster` in `apps/api/src/squads/routes.ts` — all 27 from `@lmntlz/content`, this player's assignments across both zones and all three offense slots, and `available.forOffense` as **the 15 not on either defense squad**
- [x] T015 [US1] Implement `PUT /v1/squads/defense/:zone` in `apps/api/src/squads/routes.ts` for `zone ∈ {visible, hidden}` — **one editor, one validator, one config shape, with `zone` as a parameter**, because the two zones differ only in visibility and reward (research.md § Settled)
- [x] T016 [US1] Implement `PUT /v1/squads/offense/:slot` in `apps/api/src/squads/routes.ts` for `slot ∈ {0,1,2}` — **no per-champion config**, because the player commands offense, and `409` if a named hero is on a defense squad
- [x] T017 [US1] Report a defense zone short of six as **unable to defend** in `apps/api/src/squads/allocation.ts`, rather than silently defending with five (FR-011)
- [x] T018 [P] [US1] Build `apps/client/src/features/squads/RosterView.tsx` — all 27 with assignment status and the player's remaining allocation (FR-002)
- [x] T019 [US1] Build `apps/client/src/features/squads/SquadBuilder.tsx` — 2/3/1 placement for both kinds, revalidating locally on every placement using `@lmntlz/sim/rules`
- [x] T020 [US1] Build `apps/client/src/features/squads/hooks/useAllocation.ts` — mirroring the server rules for immediate feedback, with **the server authoritative on every eviction and every streak reset**

**Checkpoint**: A player can commit twelve heroes and see the fifteen that remain.

---

## Phase 4: User Story 2 - A player understands what a defensive change costs (Priority: P1)

**Goal**: Before a hero moves to defense, the player is told which attack squads break and that the hold streak resets.

**Independent Test**: Move a hero used in all three offense squads onto defense and confirm all three are invalidated and the warning names all three.

### Tests for User Story 2 ⚠️

> **Write T021 first.** plan.md is explicit: it is the case the warning exists for
> and the one most likely to be built for a single squad and scaled badly.

- [x] T021 [US2] Write `apps/api/tests/squads/eviction.test.ts` — three complete attack squads with one hero in all three; `preview-move` lists **all three by name, untruncated**, and `poolAfter` reads `{ heroes: 14, squads: 3, seatsNeeded: 18 }` (SC-003)
- [x] T022 [P] [US2] Add the branches to `apps/api/tests/squads/eviction.test.ts` — a hero in **one** squad renders singular; a hero in **none** skips the confirm entirely. **The template is plural by default, so these are the paths that get less exercise**
- [x] T023 [P] [US2] Write `apps/api/tests/squads/streak.test.ts` from the quickstart table — a no-op save keeps the streak; a reorder back to the starting arrangement keeps it; **changing a targeting *fallback* resets it**; placing a rune on a defending hero keeps it

> **T023's fallback line catches a lazy implementation.** The fallback is the rule
> that actually fires 49–80% of the time, so it belongs in the hash as much as the
> primary does. **Test the hash, not the endpoint** — `canonicalForm` is a pure
> function, so drive it with pairs directly, then one integration test to confirm
> the endpoint uses it.

### Implementation for User Story 2

- [x] T024 [US2] Implement `POST /v1/squads/defense/:zone/preview-move` in `apps/api/src/squads/routes.ts` — called **before** committing, returning `evicts` and `poolAfter`
- [x] T025 [US2] Implement eviction on commit in `apps/api/src/squads/allocation.ts` — remove the hero from **every** offense squad containing it and set `valid = false` on each (FR-008)
- [x] T026 [US2] Refuse an attack with an invalidated squad until it is refilled to six, in `apps/api/src/squads/allocation.ts` (FR-009, SC-009)
- [x] T027 [US2] **No auto-repair** in `apps/api/src/squads/allocation.ts` — nothing substitutes another hero into a gap. The squad is the player's plan, and filling it replaces the plan with a guess while hiding that the player is now over-committed
- [x] T028 [US2] Exclude rune placement and gear score from `canonicalForm` in `apps/api/src/squads/canonical.ts` — the streak measures **how long a plan has held**, and gear is not the plan. Including it would make "improve a defending hero" and "keep a streak" mutually exclusive
- [x] T029 [US2] Build `apps/client/src/features/squads/EvictionWarning.tsx` — **count first, then name**; **name every squad, never "and 2 others"**; and **state the remaining pool** (`You have 14 heroes left for 3 squads of 6`), which is the sentence that makes the constraint legible
- [x] T030 [US2] Render the warning as a **confirm** in `apps/client/src/features/squads/EvictionWarning.tsx` — eviction is the one thing this feature blocks, because it is destructive and non-obvious, unlike a self-defeating ranking which is recoverable by reopening a dropdown
- [x] T031 [US2] State the streak reset **before** the player commits, in `apps/client/src/features/squads/SquadBuilder.tsx` (FR-014)

**Checkpoint**: No player loses three attack squads without being told first.

---

## Phase 5: User Story 3 - Three streaks, never conflated (Priority: P2)

**Goal**: One attack streak and two hold streaks, with only the attack streak feeding ambush.

**Independent Test**: Win with each of the three offense squads in turn and confirm one streak counting 3, unaffected by squad switching.

### Tests for User Story 3 ⚠️

- [x] T032 [P] [US3] Write `apps/api/tests/squads/streaks.test.ts` — exactly three streaks exist; consecutive wins **across different offense squads** all count (SC-005); ambush reads `+2%` per win and **never exceeds 90%** at 45 wins (SC-006); an **ambushed loss does not reset** the attack streak
- [x] T033 [P] [US3] Add the config-source assertion to `apps/api/tests/squads/streaks.test.ts` — grep `apps/client/src` for any literal `2`-per-win or `90` cap and assert **zero** matches (SC-008)

### Implementation for User Story 3

- [x] T034 [US3] Store `attackStreak` on the player and `holdStreak` per defense squad in `apps/api/src/db/schema/squads.ts` — **three numbers that look alike and must never be conflated** (FR-012)
- [x] T035 [US3] Make the attack streak universal across all three offense squads in `apps/api/src/squads/allocation.ts` — switching squads never resets it (FR-013)
- [x] T036 [US3] Compute ambush chance from the attack streak alone in `apps/api/src/squads/allocation.ts` — `+2%` per consecutive win, capped at **90%** (FR-015)
- [x] T037 [US3] Serve every streak and ambush constant from the server in `apps/api/src/squads/routes.ts` — **live-tunable, never a client constant** (FR-017, Constitution XII)
- [x] T038 [US3] Display the ambush chance **always** in `apps/client/src/features/squads/RosterView.tsx` (FR-015)

**Checkpoint**: Ambush odds are honest, visible, and tunable without a client build.

---

## Phase 6: User Story 4 - Scouting reveals a reputation, not a shape (Priority: P2)

**Goal**: The Visible squad in full, both hold streaks, and nothing whatever about Hidden composition.

**Independent Test**: Scout a player and confirm the Hidden hold streak is present while its composition is entirely absent.

### Tests for User Story 4 ⚠️

- [x] T039 [US4] Write `apps/api/tests/squads/scout.test.ts` — assert **present**: six Visible heroes, both types each, the 2/3/1 formation, rune slot elements and stages, **both** hold streaks
- [x] T040 [US4] Assert **absent** in `apps/api/tests/squads/scout.test.ts` **by searching the whole serialised response**, not by checking remembered fields — no stat value base or runed, no rune's boosted stat, no utility effect, **no targeting priority or power ranking in either zone**, and **no Hidden hero in any form** (SC-007)

### Implementation for User Story 4

- [x] T041 [US4] Implement `GET /v1/players/:targetId/scout` in `apps/api/src/squads/routes.ts` — note the parameter is **`targetId`, not `accountId`**, per feature 005's convention
- [x] T042 [US4] Give `scout` **its own serialiser** in `apps/api/src/squads/scoutSerializer.ts`, not shared with the profile read — **a shared serialiser is exactly how the Hidden squad leaks** (Constitution XVII)
- [x] T043 [US4] Return the Hidden zone as **the streak and nothing else** in `apps/api/src/squads/scoutSerializer.ts` (FR-018, FR-020)
- [x] T044 [US4] Disclose rune slot elements and stages **without** which stat they boost, in `apps/api/src/squads/scoutSerializer.ts` — rune fill shows **commitment, never power**, since at an identical 1,950-shard spend the best allocation scores ~3.35× the worst. That is what makes the disclosure safe and bluffing a real strategy

**Checkpoint**: The Hidden zone is a threat rather than a blank, and it leaks nothing.

---

## Phase 7: User Story 5 - Squad configuration carries defense behaviour (Priority: P3)

**Goal**: Targeting pair, power ranking and — where relevant — an ally rule, set on the squad-builder row.

**Independent Test**: Configure a defending champion and confirm the settings persist with the squad and are used when it is attacked.

### Tests for User Story 5 ⚠️

- [x] T045 [P] [US5] Write `apps/client/tests/squads/firingProfile.test.tsx` — **watch the network: nothing is requested** while a ranking widget is dragged; a ranking of `1·2·3·4·5·0` reports **both ultimates dead**; the profile is computed over **9 turns, not 60**
- [x] T046 [P] [US5] Write `apps/client/tests/squads/warnings.test.tsx` — a reach-1 hero in the back seat **warns and saves**; a ranking that kills two powers **warns and saves**

> **T045 step 2 is the assertion.** `firingProfile` lives in `@lmntlz/sim/rules`
> and the client imports it. **If a request appears, it moved back to `ai/`** — the
> exact regression feature 006's plan caught on paper.

### Implementation for User Story 5

- [x] T047 [US5] Build `apps/client/src/features/squads/DefenseConfig.tsx` — the targeting pair and power ranking on every defending row, and a **third** control only when the champion owns a friendly power (FR-021, FR-004 of feature 004)
- [x] T048 [US5] Build `apps/client/src/features/squads/FiringProfile.tsx` importing `firingProfile` from `@lmntlz/sim/rules` and **passing 9** — a hero takes ~8.5 turns in a real 6v6, and the number on the screen has to describe the game the player is about to play (FR-022)
- [x] T049 [US5] Apply `roleDefaults(role)` to any champion left unconfigured, in `apps/api/src/squads/allocation.ts` (FR-023)
- [x] T050 [US5] Emit the two non-blocking warnings from `PUT /v1/squads/defense/:zone` in `apps/api/src/squads/routes.ts` — `reach-1-back-seat` and `power-never-fires`, both naming the hero. **`warnings` never blocks** (Constitution XVIII)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T051 Add the Playwright end-to-end pass in `apps/client/e2e/squads.spec.ts` — build both defenses, build three overlapping attack squads, move one hero to defense, and assert all three invalidate with all three named
- [x] T052 [P] Add keyboard-navigation coverage to `apps/client/e2e/squads.spec.ts` — every control reachable and every focus ring visible, since mouse and keyboard are the only inputs
- [x] T053 [P] Write `apps/api/src/squads/README.md` — the allocation invariants, the canonical-form hash and what is deliberately outside it
- [ ] T054 Run the full quickstart manual pass, including the scout disclosure boundary checked by searching the serialised response

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 001, 002, 004 and 005
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: needs `evictionImpact` (T008) and `streakResets` (T010)
- **US3 (Phase 5)**: needs the squads schema (T005). Independent of US1 and US2
- **US4 (Phase 6)**: needs a saved defense squad from US1
- **US5 (Phase 7)**: needs feature 004's `firingProfile` and `roleDefaults`
- **Polish (Phase 8)**: depends on US1, US2 and US4

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P1)**: US1's saved squads
- **US3 (P2)**: none beyond the schema — **can run in parallel with US1 and US2**
- **US4 (P2)**: US1
- **US5 (P3)**: US1, plus feature 004

### Within Each User Story

- Tests written and **failing** before implementation
- **Allocation invariants before any interface** — plan.md § Phase 2
- `canonicalForm` before the endpoint that uses it

### Parallel Opportunities

- T003, T004 in parallel after T001/T002
- T012, T013 in parallel · T022, T023 in parallel
- **US3 in parallel with US1 and US2** — it touches streak columns and nothing else
- T045, T046 in parallel — two client test files
- T018 alongside T014–T017, since the roster view reads an endpoint the server tests already cover

---

## Parallel Example: User Story 2

```bash
# The eviction test first, then its two branches and the streak table:
Task: "eviction.test.ts — three squads, all three named, poolAfter correct"
Task: "eviction.test.ts branches — singular renders, zero skips the confirm"
Task: "streak.test.ts — no-op keeps, fallback change resets, rune keeps"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Both are P1 and together they are the allocation layer: **twelve heroes commit, and
the player knows what committing costs.** Stop after Phase 4 and validate the
golden path — build both defenses, build three overlapping attack squads, move one
hero, and confirm all three invalidate with all three named.

1. Phase 1–2: the client app and the allocation invariants
2. Phase 3: US1
3. Phase 4: US2 — **STOP and VALIDATE** the three-squad eviction
4. Phase 5–7: streaks, scouting, defense configuration

### Incremental Delivery

US4 is P2 but gates feature 009's attack flow — a player cannot choose a target
without a scout view. Sequence it before matchmaking starts.

---

## Notes

- **Zone allocation is a testable commitment and it is not yet tested.** Neither
  zone may dominate, and it rests on Hidden holding better than Visible. **If the
  hold rates converge, Visible wins both currencies and the choice collapses** —
  feature 008's recorded metadata is the only thing that can detect it.
- **Exposing one zone halves the information leak.** Because every player owns the
  same 27, a revealed defense also reveals what is *not* available to attack with —
  6 revealed rather than 12, leaving 21 unaccounted for.
- **The two zones are configured identically.** They differ **only** in visibility
  and reward, so `zone` is a parameter and never a branch.
- **The exact ally-targeting menu is not settled** and no contract here depends on
  the final list.
- Commit after each task or logical group; work goes straight to `main`.
