# Tasks: Simulation — Resolver

**Input**: Design documents from `/specs/003-sim-resolver/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/resolver.d.ts](contracts/resolver.d.ts) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 4 · **features 001 and 002 complete**

**Tests**: **Included.** Two of them — `determinism.test.ts` and
`seedCustody.test.ts` — are constitutional properties rather than unit tests, and
both are cheap now and **impossible to add convincingly later**.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`packages/sim/resolver/` (server only) · `packages/sim/tests/resolver/`.
Sibling subtree to `rules/`, excluded from the client build by the subpath export
map and the import-graph test built in feature 002.

> **The load-bearing fact of the whole architecture**: the resolver consumes
> randomness and is nonetheless a **pure function of `(seed, action log)`**.
> In-progress state is never stored, so every request replays. If a draw came from
> a live entropy source, a battle would change underneath the player between one
> action and the next.

---

## Phase 1: Setup

- [ ] T001 Create the `packages/sim/resolver/` subtree with `index.ts` and confirm the `./resolver` subpath export from feature 002's T002 resolves
- [ ] T002 [P] Add a `resolver` test project to `packages/sim/vitest.config.ts`, configured **Node-only** — the resolver must never be exercised in a browser environment

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The seed type and the generator. Both become part of the engine contract.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Define the opaque `Seed` type in `packages/sim/resolver/seed.ts` — a unique-symbol brand, `toJSON()` that **throws `SeedLeakError`**, `toString()` returning `'[seed]'`, and a non-enumerable branded field
- [ ] T004 Implement `createSeed()` in `packages/sim/resolver/seed.ts` from `node:crypto`'s CSPRNG — server entropy only, with **no client-supplied value as an input** (FR-006, FR-007)
- [ ] T005 Implement `persistSeed` / `restoreSeed` in `packages/sim/resolver/seed.ts` and **do not export them from the package root** — they exist for the single repository function that writes the battle row (FR-008)
- [ ] T006 Implement `draw(seed, index)` as SplitMix64 in `packages/sim/resolver/rng.ts` over **`BigInt` or explicit 32-bit lanes, never `Number`** — a silently-truncated multiply is deterministic, plausible, and different on a different engine (research.md Q1)
- [ ] T007 Implement `drawUnit` and rejection-sampled `drawInt` in `packages/sim/resolver/rng.ts`, with `drawInt` returning `{ value, consumed }` because rejection sampling makes the index cost variable
- [ ] T008 Name the generator in `engineVersion` — extend feature 002's stamp in `packages/sim/rules/index.ts` so a generator change is an engine change (FR-004)

**Checkpoint**: A seed exists, cannot be serialised, and indexes its sequence in O(1)

---

## Phase 3: User Story 1 - A battle does not change underneath the player (Priority: P1) 🎯 MVP

**Goal**: The same seed and log produce the same battle, every time, on every machine.

**Independent Test**: Replay one battle's action log a thousand times — all thousand runs byte-identical.

### Tests for User Story 1 ⚠️

> **Write T009 before any real resolution logic**, against a stub. plan.md is
> explicit: it is cheap to write now and impossible to retrofit honestly.

- [ ] T009 [US1] Write `packages/sim/tests/resolver/determinism.test.ts` — 1,000 replays of one log asserting **byte-identical serialisation, not deep equality**, because deep equality passes on a `Set` that iterates differently
- [ ] T010 [P] [US1] Extend `packages/sim/tests/resolver/determinism.test.ts` with the fresh-process case (catching module-load order and warmed caches) and the **out-of-order arrival** case — same `sequence` values delivered in a different order must give an identical result
- [ ] T011 [P] [US1] Write `packages/sim/tests/resolver/rng.test.ts` — `draw(seed, n)` is O(1) for any `n`, identical under Node and a headless browser, and passes a chi-squared uniformity check over 10⁷ indices

> **The portability check is the one that matters and the one that is easy to
> skip.** A `Number`-based multiply passes locally and diverges in production —
> deterministically, plausibly, and only sometimes.

- [ ] T012 [P] [US1] Write `packages/sim/tests/resolver/drawOrder.test.ts` — the draw sequence is a stable function of history; re-derive a concluded battle action by action from each recorded `drawIndexBefore` and match every packet

### Implementation for User Story 1

- [ ] T013 [US1] Define `BattleAction` in `packages/sim/resolver/replay.ts` carrying `drawIndexBefore` and `drawsConsumed` — **one global monotonic counter per battle**, not per turn, because per-turn scoping makes a reorder-within-a-turn bug produce identical cursors and different outcomes (research.md Q2)
- [ ] T014 [US1] Implement `replay(seed, log)` in `packages/sim/resolver/replay.ts` as **the primitive** — pure in `(seed, log)`, no I/O, no clock, no ambient state (FR-001, FR-002)
- [ ] T015 [US1] Implement `resolveAction` in `packages/sim/resolver/resolve.ts` as **`replay` plus one appended action**, not the reverse — every request replays, so replay is the hot path and must be the simple one
- [ ] T016 [US1] Fix the within-action draw order in `packages/sim/resolver/resolve.ts` — hit, then crit **only if the hit landed**, then one rider contest per rider **only if the payload connected**, then a targeting tiebreak only if tiebreaks 1–4 left more than one candidate (research.md Q2)
- [ ] T017 [US1] Sort every per-target loop explicitly in `packages/sim/resolver/resolve.ts` — **by row then instance id, never by `Set` or object key order** — and roll crit **once per packet, not per target**

> **Iteration order is a replay hazard that does not look like one.** A `Map`
> preserves insertion order and a plain object does not, across engines, for
> integer-like keys. This is what research.md means by *"the detail that silently
> breaks replay."*

- [ ] T018 [US1] Record `drawsConsumed` per action in `packages/sim/resolver/resolve.ts` — recorded rather than assumed, because rejection sampling makes it variable and a mismatch is the cheapest divergence signal there is

**Checkpoint**: Re-derivation is exact. A battle can be replayed from its log without changing.

---

## Phase 4: User Story 2 - A hostile client cannot predict a roll (Priority: P1)

**Goal**: The seed appears in no payload and no client-visible value permits deriving it.

**Independent Test**: Inspect every payload the server sends across a complete battle — the seed is in none of them.

### Tests for User Story 2 ⚠️

- [ ] T019 [US2] Write `packages/sim/tests/resolver/seedCustody.test.ts` — `JSON.stringify(seed)` **throws `SeedLeakError`**; serialising any value returned by `replay`, `resolveAction` or `resolveDefenderTurn` contains no seed material, asserted by searching the serialised output for the seed's bytes
- [ ] T020 [P] [US2] Add the structural scan to `packages/sim/tests/resolver/seedCustody.test.ts` — walk every exported return type and assert none transitively contains `Seed`, so **the test fails loudly the day someone adds a debug field**

### Implementation for User Story 2

- [ ] T021 [US2] Confirm no exported function in `packages/sim/resolver/index.ts` returns a value containing a `Seed`, and that `persistSeed` / `restoreSeed` are absent from the package root export (FR-005)
- [ ] T022 [US2] Verify `rg "@lmntlz/sim/resolver" apps/client` returns nothing and that feature 002's `purity.test.ts` covers the transitive case (FR-014, SC-009)

**Checkpoint**: Constitution XII holds by construction. A careless `res.json(state)` cannot leak the seed.

---

## Phase 5: User Story 3 - A player cannot shop for a good seed (Priority: P2)

**Goal**: Abandoning and restarting gains nothing.

**Independent Test**: Start many battles against the same opponent with identical squads — the seeds show no pattern and none is derivable from anything supplied.

### Tests for User Story 3 ⚠️

- [ ] T023 [P] [US3] Write `packages/sim/tests/resolver/seedGeneration.test.ts` — generate many seeds from identical inputs and assert no correlation, and assert `createSeed()` takes **no parameters at all**, so there is nothing a client value could be passed as

### Implementation for User Story 3

- [ ] T024 [US3] Confirm `createSeed()` in `packages/sim/resolver/seed.ts` has an empty parameter list — **the signature is the enforcement** (FR-007, SC-008)

**Checkpoint**: Seed shopping has no surface to attack.

---

## Phase 6: User Story 4 - Accuracy behaves as designed (Priority: P2)

**Goal**: Attacks land about as often as the interface said, one draw decides each, and the attacker's edge is present.

**Independent Test**: Resolve a large sample at a known probability and confirm the observed rate converges on it.

### Tests for User Story 4 ⚠️

- [ ] T025 [P] [US4] Write `packages/sim/tests/resolver/distribution.test.ts` — an attack at a computed 82% converges on 82% over a large sample, and criticals at `Luck` 40 occur about **20%** of the time (SC-004, SC-006)
- [ ] T026 [P] [US4] Write `packages/sim/tests/resolver/medianMiss.test.ts` — across all **729** pairings at base stats the median miss rate is **~9.4%** (SC-005). `tools/verify-accuracy.py` reproduces the figure
- [ ] T027 [P] [US4] Add the one-draw assertion to `packages/sim/tests/resolver/drawOrder.test.ts` — a **missed** attack consumes 1 index and a **landed** one consumes 2, which is what proves consumption is genuinely lazy rather than eager-with-discards (SC-007)

> **T026 is a balance regression detector, not a unit test.** It belongs in CI but
> should be read as *"the accuracy model still behaves as designed"*, never as
> *"this function is correct."*

### Implementation for User Story 4

- [ ] T028 [US4] Implement hit resolution in `packages/sim/resolver/resolve.ts` — **exactly one draw** compared against the probability `@lmntlz/sim/rules` supplies (FR-009)
- [ ] T029 [US4] **Do not re-derive the probability and do not apply a second clamp** in `packages/sim/resolver/resolve.ts` — the `[0.65, 0.95]` clamp lives in `rules` and two clamps in two places is how they drift (research.md Q3, FR-013)
- [ ] T030 [US4] Implement crit resolution in `packages/sim/resolver/resolve.ts` — `Luck × 0.5` percent, doubling the packet, **one draw per packet** (FR-010)
- [ ] T031 [US4] Implement contested status application in `packages/sim/resolver/statuses.ts` per `resources/mechanics/05-status.md`, calling `rules`' `riderLandProbability` and drawing once per rider (FR-011)
- [ ] T032 [US4] Implement reactions firing on an evaded attack in `packages/sim/resolver/resolve.ts` — a miss is **not** the end of a turn's draws
- [ ] T033 [US4] Implement `resolveDefenderTurn` in `packages/sim/resolver/resolve.ts` — delegating every **choice** to `@lmntlz/sim/ai` (feature 004) and every **draw** to this module, so a defense plays reproducibly (FR-012)

**Checkpoint**: The accuracy model is verified rather than assumed. The defense AI has a replayable source of randomness to consume.

---

## Phase 7: User Story 5 - A battle can be re-derived when something looks wrong (Priority: P3)

**Goal**: An investigator can reconstruct a past battle — without that being how replays reach players.

**Independent Test**: Take a stored battle, re-derive it from seed and log, and confirm it matches the recorded packets.

### Tests for User Story 5 ⚠️

- [ ] T034 [P] [US5] Write `packages/sim/tests/resolver/reDerive.test.ts` — resolve three actions, bump `engineVersion`, and assert `reDerive` returns `{ ok: false, reason: 'engine-version' }`. **It does not throw and it does not return a state.** Repeat for `contentVersion`, checked **separately** (Constitution XVI)
- [ ] T035 [P] [US5] Write `packages/sim/tests/resolver/replayLog.test.ts` — the artifact carries **no seed and no draw indices**, and survives an `engineVersion` change unaltered

### Implementation for User Story 5

- [ ] T036 [US5] Implement `reDerive(provenance, log)` in `packages/sim/resolver/replay.ts` returning `ReDeriveResult` — **`VersionMismatch` is returned, never thrown and never papered over**; feature 007 decides what happens next (FR-016)
- [ ] T037 [US5] Implement `toReplayLog(seed, log)` in `packages/sim/resolver/replay.ts` — a record of what happened, **not a recipe for recomputing it** (FR-015)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T038 Add the adversarial iteration-order test to `packages/sim/tests/resolver/drawOrder.test.ts` — shuffle the internal collection the resolver iterates, re-resolve, and confirm the result is unchanged. **If it changes, an implicit iteration order is load-bearing somewhere**
- [ ] T039 [P] Write `packages/sim/resolver/README.md` — the three consequences of `(seed, log)` purity, and the standing rule that draw order is part of the engine contract
- [ ] T040 Run the manual pass in [quickstart.md](quickstart.md) — play one battle end to end through `resolveAction`, then confirm `toReplayLog` carries no seed and no draw indices

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs feature 002's export map (T002 there)
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: Foundational only — can run fully in parallel with US1
- **US3 (Phase 5)**: Foundational only — trivially small
- **US4 (Phase 6)**: depends on US1's `resolveAction` skeleton (T015)
- **US5 (Phase 7)**: depends on US1's `replay` (T014)
- **Polish (Phase 8)**: depends on US1 and US4

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P1)**: none — **genuinely independent of US1**, which is why both are P1
- **US3 (P2)**: none
- **US4 (P2)**: US1
- **US5 (P3)**: US1

### Within Each User Story

- Tests written and **failing** before implementation
- **T009 before everything** — determinism against a stub, per plan.md
- rng → seed generation → hit/miss → crit → statuses → replay → re-derivation

### Parallel Opportunities

- **US2 and US3 can be completed entirely in parallel with US1** — different files, no shared state
- T010, T011, T012 in parallel
- T025, T026, T027 in parallel
- T034, T035 in parallel

---

## Parallel Example: User Story 1

```bash
# Three independent test files, all red first:
Task: "determinism.test.ts — fresh process + out-of-order arrival"
Task: "rng.test.ts — O(1) indexing, Node/browser parity, chi-squared"
Task: "drawOrder.test.ts — re-derive from each recorded drawIndexBefore"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Determinism and seed custody are the two properties everything downstream rests
on, and neither can be retrofitted honestly. Stop after Phase 4 and validate:
1,000 byte-identical replays, and a seed that throws when serialised.

1. Phase 1–2: Setup, the seed type, SplitMix64
2. Phase 3: US1 — **T009 first, against a stub**
3. Phase 4: US2 — **STOP and VALIDATE** the three quickstart seed checks
4. Phases 5–7: seed shopping, accuracy, re-derivation
5. Phase 8: the adversarial shuffle test

### Incremental Delivery

US4's accuracy suite is where feature 002's closed form stops being a claim.
Do not defer it past the point where feature 007 starts running real battles —
`tools/verify-accuracy.py` gives the expected figures today.

---

## Notes

- **Draw order is part of the engine contract.** Adding, removing or reordering a
  draw changes every in-flight battle's future. That is what `engineVersion`
  identifies and why deploys drain before switching (feature 016).
- **Re-derivation is for investigation, never for replay playback.** Replays are
  recorded packets. Re-simulating them would let a balance patch change a past
  result — the exact thing Constitution XVI forbids.
- **The abandoned-battle timeout and what a version mismatch does** are feature
  007's calls, not this feature's. The resolver's job is to give the answer.
- Commit after each task or logical group; work goes straight to `main`.
