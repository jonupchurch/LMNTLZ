# Tasks: Simulation — Rules

**Input**: Design documents from `/specs/002-sim-rules/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/rules.d.ts](contracts/rules.d.ts) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) §§ 3–4 · **feature 001 complete**

**Tests**: **Included, and this is where they earn most in the whole codebase.**
The rules half is pure, shared and RNG-free by construction, so it is exhaustively
testable **without mocks** (SC-005) — and under the no-nerf rule it is the last
moment a number moves freely.

**Organization**: Grouped by user story. Story order below follows spec priority
(US2 and US1 are both P1) with one deliberate choice inside it: **US2 first**,
because [plan.md](plan.md) § Phase 2 requires `purity.test.ts` to be red-then-green
*before any rule exists*, or it gets written to fit whatever got built.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`packages/sim/rules/` (isomorphic, this feature) · `packages/sim/tests/rules/`.
`packages/sim/resolver/` is feature 003 and **nothing here may reference it**.

---

## Phase 1: Setup

**Purpose**: The `@lmntlz/sim` package and the subpath export map that shapes the seam

- [x] T001 Scaffold `packages/sim/` — `package.json` named `@lmntlz/sim`, `tsconfig.json` extending `tsconfig.base.json`, dependency on `@lmntlz/content` only
- [x] T002 Declare the subpath exports in `packages/sim/package.json` per research.md Q1 — `./rules`, `./resolver`, `./ai`, and **deliberately no root export**, so `import from '@lmntlz/sim'` fails to resolve and nobody reaches the resolver through a barrel file
- [x] T003 [P] Add the `no-restricted-imports` ESLint rule in `apps/client/eslint.config.js` banning `@lmntlz/sim/resolver` and `@lmntlz/sim/ai` — the fast local signal; the CI graph test (T007) is the thing that is actually true
- [x] T004 [P] Add `packages/sim/vitest.config.ts` with a `rules` test project

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The state shape every rule reads, and the absolute row axis

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Define `Row`, `Side`, `HeroState`, `StatusInstance` and `BattleState` in `packages/sim/rules/state.ts`, matching `contracts/rules.d.ts` — all fields `readonly`, because **nothing here mutates the state it is given**
- [x] T006 Document and encode the absolute axis in `packages/sim/rules/state.ts` per research.md Q3 — **row 1 is the attacker's rearmost seat, row 3 its front; row 4 is the defender's front, row 6 its back.** Numbering ascends toward the enemy for the attacker and away for the defender

> **Getting T006 backwards inverts every reach test while still looking
> plausible.** research.md Q3 names it as the second thing to get wrong after the
> row-1 question. Encode the axis once, here, and derive everything from it.

**Checkpoint**: The vocabulary of a battle state exists

---

## Phase 3: User Story 2 - No outcome can be learned from the rules (Priority: P1) 🎯 the constitutional gate

**Goal**: Randomness is *unreachable*, not merely absent. Every question about an uncertain event returns a probability.

**Independent Test**: Search the rules half for any source of randomness — there is none. Ask about an attack and receive `0.82`, never `true`.

### Tests for User Story 2 ⚠️

> **These run before any rule exists.** T007 is Constitution XII expressed as an
> assertion rather than an intention.

- [x] T007 [US2] Write `packages/sim/tests/rules/purity.test.ts` — walk the module graph and assert (a) no module reachable from `packages/sim/rules` references `Math.random`, `crypto.getRandomValues`, `Date.now`, `new Date`, `performance.now` or `process.hrtime`; **and (b)** `apps/client`'s import graph contains neither `@lmntlz/sim/resolver` nor `@lmntlz/sim/ai` **at any depth**
- [x] T008 [P] [US2] Write `packages/sim/tests/rules/determinism.test.ts` — evaluate the same state 1,000 times through every exported function and assert byte-identical results (SC-003). This is the guard against a cache, a memo keyed on object identity, or `Set` iteration order
- [x] T009 [P] [US2] Write the no-outcome scan in `packages/sim/tests/rules/purity.test.ts` — assert no exported function's return type contains a boolean hit/miss or crit result (SC-004)

### Implementation for User Story 2

- [x] T010 [US2] Implement the folded hit probability in `packages/sim/rules/probability.ts` — `m = Agility_d − Perception_a − 20`, `P = (1/(Na·Nd))·Σ clamp(a − m − 1, 0, Nd)`, `Na = floor(Luck_a × 1.5)` with `Na ≥ 1` always (research.md Q2)
- [x] T011 [US2] Apply the `[0.65, 0.95]` clamp **after** the fold in `packages/sim/rules/probability.ts` — clamping earlier loses the property that makes runes safe (FR-020)
- [x] T012 [US2] Implement `riderLandProbability` in `packages/sim/rules/probability.ts` reusing the same fold with `m = Resolve_d − potency` and **no `+20`** — one implementation, the edge is a parameter (research.md Q2)
- [x] T013 [US2] Implement `critChance` in `packages/sim/rules/probability.ts` — `Luck × 0.5` percent as a fraction, rolled once per packet rather than per target (FR-021)
- [x] T014 [P] [US2] Write `packages/sim/tests/rules/probability.test.ts` — the clamp holds across all 729 pairings **and** across the runed extremes, where an `Agility` + `Luck` defender at the 75 cap is a 98.2% miss unclamped (SC-008)
- [x] T015 [US2] Regression-lock the unclamped distribution in `packages/sim/tests/rules/probability.test.ts` against research.md Q2 — mean miss **13.0%**, p90 **28.9%**, **0** pairs missing above 50%, **42** auto-hits, **0** auto-misses. `tools/verify-accuracy.py` reproduces every figure

**Checkpoint**: The seam is enforced by a failing build rather than a reviewer. A modified client can learn odds and nothing else.

---

## Phase 4: User Story 1 - The client tells the truth without asking the server (Priority: P1)

**Goal**: One implementation, imported by both sides, giving identical answers with no network call.

**Independent Test**: Run the same battle state through the rules in a browser context and a Node context and compare every answer.

### Tests for User Story 1 ⚠️

- [x] T016 [P] [US1] Write `packages/sim/tests/rules/parity.test.ts` — evaluate an identical `BattleState` under both the browser and Node Vitest environments and assert every exported function agrees exactly (SC-002). **Re-run at each later checkpoint** as the surface grows
- [x] T017 [P] [US1] Write `packages/sim/tests/rules/turnOrder.test.ts` — 10,000 ticks giving Speed 45 **1.46×** the acts of Speed 15 and Speed 75 **1.92×** (SC-007), plus the case FR-013 exists for: a Speed 75 hero **acts twice** before a Speed 15 hero acts once
- [x] T018 [P] [US1] Write `packages/sim/tests/rules/damage.test.ts` — sweep `E` from −75 to +150 asserting `final ≥ packet × 0.25` throughout, mitigation alone never exceeding 50% reduction, **and** that the floor currently *ties* at the worst case and never bites, so the day it starts binding a test says so (SC-009, research.md)

### Implementation for User Story 1

- [x] T019 [US1] Implement the bounded accumulator in `packages/sim/rules/turnOrder.ts` — `50 + Speed` per tick, acting at 100, **drained in a loop and never tested once** (FR-012, FR-013)
- [x] T020 [US1] Implement `turnQueue(state, lookahead)` in `packages/sim/rules/turnOrder.ts` — ticks stay internal; consumers get a projection (FR-014)
- [x] T021 [US1] Apply stat modifications as **flat points including Speed** in `packages/sim/rules/turnOrder.ts` — the base constant 50 already normalizes them, so a percentage would hand the fastest hero the largest absolute gain (FR-015)
- [x] T022 [P] [US1] Implement max HP and the packet in `packages/sim/rules/damage.ts` — `maxHp = Toughness × 50`; `packet = Might × power.multiplier` with **Luck absent** (FR-016, FR-017)
- [x] T023 [US1] Implement mitigation in `packages/sim/rules/damage.ts` — `E = (Armor | MagicResist) − Penetration` against `K = 75`, with the negative-`E` branch, and a mixed martial/arcane power answering the defender's **lower** mitigation stat (FR-018, FR-022)
- [x] T024 [US1] Implement the final-damage floor in `packages/sim/rules/damage.ts` — `max(packet × 0.25, mitigated × typeMultiplier)`, full precision throughout and rounded **once**, at the end (FR-019)
- [x] T025 [US1] Take the type multiplier from `@lmntlz/content`'s `powerEffectiveness` in `packages/sim/rules/damage.ts` — **never recomputed here** (FR-022, Constitution XIII)
- [x] T026 [US1] Implement `damagePreview` in `packages/sim/rules/damage.ts` returning packet, mitigation, multiplier, `resistedBy`, floor flag, final, crit final **and both probabilities** — everything except the outcome (FR-004)
- [x] T027 [US1] Implement `healPreview` in `packages/sim/rules/damage.ts` — skips evasion, mitigation, type effectiveness, the Resolve contest and the floor; keeps reach and crit; capped at `maxHp` with overheal lost
- [x] T028 [US1] Export the surface from `packages/sim/rules/index.ts`

**Checkpoint**: A client can price any attack without a request. The parity harness passes over turn order, probability and damage.

---

## Phase 5: User Story 3 - Reach opens up as the battle wears on (Priority: P2)

**Goal**: Distance is the count of *occupied* rows crossed, so a losing position hands the back seat a job.

**Independent Test**: A reach-2 hero in row 1 against a full enemy squad has no legal enemy target. Empty rows 2 and 3 — it now reaches row 4.

### Tests for User Story 3 ⚠️

- [x] T029 [P] [US3] Write `packages/sim/tests/rules/reach.test.ts` — the exhaustive enumeration: 30 ordered row pairs × 64 occupancy patterns = **1,920 cases**, no mocks
- [x] T030 [US3] Add the three named cases to `packages/sim/tests/rules/reach.test.ts` — row 1 → row 4 at full formation is distance **3**; the same with the attacker's row 3 empty is distance **2**; and a reach-2 front-seat hero with `+1` reach sees **three** enemy rows, not two

> **The third case is the one that fails on a natural implementation.** Feature
> 004 carries FR-020 specifically for it. `inReach` must never be bounded by a
> constant.

### Implementation for User Story 3

- [x] T031 [US3] Implement `distance(state, from, to)` in `packages/sim/rules/reach.ts` — counting **occupied** rows crossed, **including the target's row and excluding the actor's own**, with an empty row counting zero (FR-005, FR-006)
- [x] T032 [US3] Treat a row holding only fallen heroes as empty in `packages/sim/rules/reach.ts` — a fallen hero does not hold its row (FR-029)
- [x] T033 [US3] Implement `inReach(state, actorId, targetRow)` in `packages/sim/rules/reach.ts` as `distance ≤ hero.reach + reachMod` (FR-007)

**Checkpoint**: Reach is correct and exhaustively proven. The line collapsing changes who can fight.

---

## Phase 6: User Story 4 - Targeting always resolves to a legal choice (Priority: P2)

**Goal**: Restrictions and compulsions combine without ever producing a hero with no legal move or one forced onto an illegal target.

**Independent Test**: Apply every combination of restriction and compulsion to a hero and confirm a legal action always exists.

### Tests for User Story 4 ⚠️

- [x] T034 [P] [US4] Write `packages/sim/tests/rules/targeting.test.ts` — every combination of filter and compulsion over a sample of states, asserting a legal action always exists
- [x] T035 [P] [US4] Add the four interaction cases to `packages/sim/tests/rules/targeting.test.ts` — a filter that would empty the set is **ignored**; a compulsion naming a hero outside the set **does not apply**; a compulsion and a restriction naming the same hero **cancel**; a hero with no legal target **passes**
- [x] T036 [P] [US4] Add the ally case to `packages/sim/tests/rules/targeting.test.ts` — a healing power's legal targets obey the identical reach rule as an attack (FR-008)

### Implementation for User Story 4

- [x] T037 [US4] Implement the four ordered stages in `packages/sim/rules/targeting.ts` — **reach → filters → compulsion → choice**, with this function performing the first three and stopping (FR-009)
- [x] T038 [US4] Implement the two non-emptying invariants in `packages/sim/rules/targeting.ts` — an emptying filter is ignored and recorded in `filtersIgnored`; an out-of-set compulsion does not apply (FR-010)
- [x] T039 [US4] Select the candidate pool from the power's `friendly` flag in `packages/sim/rules/targeting.ts` — **nothing else about the path differs between allies and enemies** (FR-008)
- [x] T040 [US4] Implement `mustPass(state, actorInstanceId)` in `packages/sim/rules/targeting.ts` — true when no power the hero owns has a legal target, so it passes rather than stalling the battle (FR-011)

**Checkpoint**: Targeting cannot deadlock. `TargetingResult.candidates` is a set feature 004 will **sort** and never filter.

---

## Phase 7: User Story 5 - The battle ends, always (Priority: P2)

**Goal**: Every battle concludes with a determinate winner, including pairings that cannot finish each other.

**Independent Test**: Construct a pairing that cannot resolve by damage and confirm it terminates at the cap with a winner.

### Tests for User Story 5 ⚠️

- [x] T041 [P] [US5] Write `packages/sim/tests/rules/ending.test.ts` — a wipe, a cap resolved on pooled HP share, a cap tied on share and resolved on champions standing, a cap tied on both resolving to the defender, and a zero-damage squad losing at the cap
- [x] T042 [P] [US5] Write `packages/sim/tests/rules/phases.test.ts` — a hero losing its turn to crowd control skips phases 2–4 and **still reaches phase 5**, so cooldowns tick; a non-damaging, non-healing power skips the Defense phase; a reaction never triggers another reaction

### Implementation for User Story 5

- [x] T043 [US5] Implement the five-phase order in `packages/sim/rules/phases.ts` — **Upkeep · Attack · Defense · Additional effects · Resolution** (FR-023)
- [x] T044 [US5] Implement the phase skip conditions in `packages/sim/rules/phases.ts` — death during upkeep is the only early termination; crowd control skips 2–4 but never 5; a power dealing neither damage nor healing skips Defense (FR-025, FR-026)
- [x] T045 [US5] Implement the fixed order of additional effects in `packages/sim/rules/phases.ts` — riders → on-hit triggers → reactions → attacker self-effects → a second death check, with a reaction unable to trigger a reaction (FR-027, FR-028)
- [x] T046 [US5] Implement `cooldownsAfterResolution` in `packages/sim/rules/phases.ts` — integer turns, ticking in Resolution **unconditionally** (FR-024)
- [x] T047 [US5] Implement `availablePowers` in `packages/sim/rules/phases.ts` — off cooldown **and** past its gate: tier 4 from turn 3, tier 5 from turn 5
- [x] T048 [US5] Implement immediate departure at 0 HP in `packages/sim/rules/ending.ts` — the hero leaves the board, stops occupying its row, and is untargetable, unhealable and unrevivable (FR-029)
- [x] T049 [US5] Implement `battleEnded(state)` in `packages/sim/rules/ending.ts` — wipe, then at **300 hero-turns** pooled HP share, then champions standing, then the defender holds (FR-030, FR-031)

**Checkpoint**: All five stories independently functional. No constructed pairing runs past the cap.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T050 Write `packages/sim/tests/rules/pairings.test.ts` — property tests over all **729** hero-versus-hero pairings, with no mocks anywhere (SC-005)
- [x] T051 Re-run `packages/sim/tests/rules/parity.test.ts` over the **complete** surface now that targeting and ending exist — this closes US1 acceptance scenario 1, whose legal-target half could not be proven until Phase 6
- [x] T052 [P] Add `engineVersion` to `packages/sim/rules/index.ts` — the stamp that identifies this package, kept **separate from `contentVersion`** and never merged (Constitution XVI)
- [x] T053 [P] Write `packages/sim/README.md` documenting the seam — what belongs in `rules/`, what belongs in `resolver/`, and why a "temporary" `Math.random()` here would pass review once and be permanent
- [x] T054 Run the manual pass in [quickstart.md](quickstart.md) — import `@lmntlz/sim/rules` from a scratch client file and confirm it resolves; import `@lmntlz/sim/resolver` and confirm **the build fails**; read `damagePreview` against the worked example in `resources/mechanics/01-stats.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs feature 001 published as `@lmntlz/content`
- **Foundational (Phase 2)**: depends on Setup — blocks all five stories
- **US2 (Phase 3)**: Foundational only. **T007 must be written first of all**
- **US1 (Phase 4)**: needs T010–T013 for the probabilities `damagePreview` reports
- **US3 (Phase 5)**: Foundational only — independent of US1 and US2
- **US4 (Phase 6)**: depends on US3 — reach is targeting's stage 1
- **US5 (Phase 7)**: depends on US4 for phase-2 targeting and on US3 for row occupancy
- **Polish (Phase 8)**: depends on all five

### User Story Dependencies

- **US2 (P1)**: none. It is the gate
- **US1 (P1)**: probabilities from US2
- **US3 (P2)**: none
- **US4 (P2)**: US3
- **US5 (P2)**: US3, US4

### Within Each User Story

- Tests written and **failing** before implementation
- **Reach before targeting before phases** — plan.md § Phase 2
- Probability before `damagePreview`, which reports it

### Parallel Opportunities

- **US3 can run in parallel with US2 and US1 from the moment Phase 2 lands** — reach touches no file either of them touches
- T008, T009 in parallel with T007's implementation half
- T016, T017, T018 in parallel — three test files
- T022 in parallel with T019–T021 — different files
- T034, T035, T036 in parallel

---

## Parallel Example: User Story 1

```bash
# Three independent test files, all red first:
Task: "parity.test.ts — same state, browser and Node, identical answers"
Task: "turnOrder.test.ts — 1.46x and 1.92x, plus acts-twice"
Task: "damage.test.ts — sweep E from -75 to +150, floor never breached"

# Then the two independent implementation files:
Task: "turnOrder.ts — the bounded accumulator, drained in a loop"
Task: "damage.ts — maxHp and the packet"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

The two P1 stories are the architecture's payoff: **the seam holds, and the client
can price a move without asking.** Stop after Phase 4 and validate — the purity
test is green, the parity harness agrees, and the recorded 729-pair figures
reproduce.

1. Phase 1–2: Setup and the state shape
2. Phase 3: US2 — **T007 first, red, then green**
3. Phase 4: US1 — **STOP and VALIDATE** against `tools/verify-accuracy.py`
4. Phases 5–7: reach, targeting, ending
5. Phase 8: the 729-pairing property suite and the manual seam check

### Incremental Delivery

US3 → US4 → US5 is a strict chain and should be worked in that order by one
person. US1 and US2 can proceed alongside it independently.

---

## Notes

- **Do not implement anything the resolver owns, even temporarily.** A "temporary"
  `Math.random()` in this subtree would pass review once and be permanent.
  T007 exists so that it cannot.
- **The `+20` edge and the `[0.65, 0.95]` clamp are load-bearing and neither is a
  tuning knob.** Reducing `Luck`'s die multiplier is explicitly the wrong lever —
  it compresses rather than shifts, and at ×0.5 it creates 158 pairs that can never
  hit each other at all.
- **The 300-turn cap is provisional in its constant and settled in its mechanism.**
  Re-derive it from measured p99 once feature 008 is recording turn counts; do not
  change it now.
- Commit after each task or logical group; work goes straight to `main`.
