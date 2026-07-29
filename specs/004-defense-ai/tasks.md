# Tasks: Defense AI

**Input**: Design documents from `/specs/004-defense-ai/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/defense-ai.d.ts](contracts/defense-ai.d.ts) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 3 · **features 001, 002 and 003 complete**

**Tests**: **Included.** SC-003 requires the builder's prediction and the engine's
behaviour to agree on **every** hero and ordering, which is a test before it is a
feature.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`packages/sim/ai/` — a **third server-only subtree**, alongside `resolver/`.
**One exception**: `firingProfile` lives in `packages/sim/rules/`, because the
squad builder needs it client-side and a firing profile is arithmetic, not a
choice. Sweep script at `tools/characterize-orderings.ts`.

> **The load-bearing hazard**: a power fires only when everything above it is on
> cooldown, and the tier-0 auto-attack has cooldown 0 and no gate — so anything
> ranked below tier 0 **never fires at all**. Handled well this is the deepest
> lever in the game; handled badly it quietly halves a player's defense and never
> tells them why.

---

## Phase 1: Setup

- [x] T001 Create the `packages/sim/ai/` subtree with `index.ts` and confirm the `./ai` subpath export from feature 002's T002 resolves
- [x] T002 [P] Add an `ai` test project to `packages/sim/vitest.config.ts`, Node-only
- [x] T003 Port `tools/characterize-orderings.py` to `tools/characterize-orderings.ts` reading from `@lmntlz/content` rather than the workbook — **and keep it out of CI**, because 19,440 pairs is an offline characterisation while CI runs 324 fast cases

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The sweep, and the safe set it produces. **The sweep is a prerequisite for the defaults, not a validation of them.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Make `tools/characterize-orderings.ts` report **both horizons** — 60 turns for continuity with the recorded analysis and **9** for the game people actually play (research.md Finding 3)
- [x] T005 Verify the sweep reproduces every recorded figure — greedy tier shares `5.4 · 18.8 · 23.6 · 23.6 · 16.7 · 11.9`, the `16.7/16.7/19.2/24.4/20.2/3.0%` histogram, **12** universally safe orderings, median **13** per hero
- [x] T006 Assert the **corrected** structural rule in `tools/characterize-orderings.ts` — **all 12 end in tier 0** and **the count is 12**

> **The plan's tripwire is miscalibrated and T006 supersedes it.** plan.md says
> *"every one of them ends `1·0`; if a re-derivation produces one that does not, the
> ladder changed."* One does not — `4·3·2·1·5·0`, which is the **published Tank
> default** — and the ladder has not changed. Following it literally sends someone
> to re-tune a correct ladder. *Tier 0 last* is provable rather than measured: a
> power fires only when everything above it is on cooldown, and tier 0 never is.

- [x] T007 Define `PowerRanking`, `TargetRule` and `SquadMemberConfig` in `packages/sim/ai/types.ts`, matching `contracts/defense-ai.d.ts` — **three** distance entries (nearest · middle · furthest), not two
- [x] T008 Freeze the 12 safe orderings into `packages/sim/ai/defaults.ts` and expose `safeOrderings()`, with the sweep's output as the source

**Checkpoint**: The safe set is measured rather than trusted, at both horizons

---

## Phase 3: User Story 2 - The builder shows which powers will actually fire (Priority: P1) 🎯 the one that must be right

**Goal**: A player reordering powers immediately sees which ones will never fire.

**Independent Test**: For any hero and any ordering, the builder's prediction matches what the engine actually does.

> **Sequenced first among the P1s** because plan.md § Phase 2 is explicit:
> `firingProfile` before the squad-builder UI. The display is useless if the
> computation is wrong, and the computation is testable with no interface at all.

### Tests for User Story 2 ⚠️

- [x] T009 [US2] Write `packages/sim/tests/rules/firingProfile.test.ts` half one — **the rank-1 closed form as the oracle**: for every hero and every ordering the simulated top-rank count equals `floor((T − gate)/(cooldown + 1)) + 1`. 19,440 exact assertions, and it catches an off-by-one in the cooldown tick, which is the thing most likely to be wrong
- [x] T010 [P] [US2] Write `packages/sim/tests/rules/firingProfile.test.ts` half two — assert the naive `1/(cooldown+1)` form **disagrees** with simulation for ranks 4–6, so nobody later "optimises" the simulation away. Bramwen under greedy: tier 1 is **0.183**, not 0.500; tier 0 is **0.033**, not 1.000

### Implementation for User Story 2

- [x] T011 [US2] Implement `firingProfile(hero, ranking, turns?)` in `packages/sim/rules/firingProfile.ts` — **it simulates**, using the engine's own cooldown-tick semantics imported from `rules` rather than reimplemented, which is how SC-003's agreement is met by construction (research.md Q2)
- [x] T012 [US2] Default the `turns` parameter to **9** in `packages/sim/rules/firingProfile.ts` — a hero takes ~8.5 turns in a real 6v6, and a 60-turn profile tells a player their auto-attack fires 5% of the time when in their actual battles it never fires at all
- [x] T013 [US2] Implement `rankOneFiringCount(cooldown, gateTurn, turns)` in `packages/sim/rules/firingProfile.ts` — **it exists as the test for `firingProfile`, not as a faster path**
- [x] T014 [US2] Implement `isSafeOrdering(hero, ranking, turns?)` in `packages/sim/rules/firingProfile.ts`, taking the horizon the **player** experiences, and export both from `packages/sim/rules/index.ts` so the client can import them
- [x] T015 [US2] Encode cooldown semantics once in `packages/sim/rules/firingProfile.ts` and reference it from the AI — a power fired on turn `t` with cooldown `c` is next available on `t + c + 1`; cooldown 0 is every turn; cooldowns tick in Resolution **unconditionally**

**Checkpoint**: A ranking that switches a power off is visible before it is saved. Feature 006's builder can now be built against a correct computation.

---

## Phase 4: User Story 1 - A defense behaves the way its builder intended (Priority: P1)

**Goal**: The engine plays a squad exactly as configured, and two squads of the same six heroes fight differently.

**Independent Test**: Configure two squads with identical heroes and different rules; confirm their behaviour diverges under the same attack.

### Tests for User Story 1 ⚠️

- [x] T016 [P] [US1] Write `packages/sim/tests/ai/powerChoice.test.ts` — the highest-ranked power off cooldown **and past its gate** fires; tier 4 is unavailable before turn 3 and tier 5 before turn 5
- [x] T017 [P] [US1] Write `packages/sim/tests/ai/divergence.test.ts` — two squads of the same six heroes with different configurations behave **measurably differently** under an identical attack (SC-002)
- [x] T018 [P] [US1] Write `packages/sim/tests/ai/replayability.test.ts` — the same seed and configuration reproduce the same choices exactly, **including the tiebreak-5 draws** (SC-009)

### Implementation for User Story 1

- [x] T019 [US1] Implement `choosePower(state, actorInstanceId, config)` in `packages/sim/ai/powerChoice.ts` — highest-ranked, off cooldown, past its gate; `pass` **only** when no power the hero owns has a legal target in reach (FR-006, FR-012)
- [x] T020 [US1] **Do not re-rank to chase a matchup** in `packages/sim/ai/powerChoice.ts` — it could notice a lower-ranked power would be super-effective and it must not, because the ranking is the defender's lever and an optimizer overriding it collapses every defense toward the same choice
- [x] T021 [US1] Resolve **power preference first, then targeting** in `packages/sim/ai/index.ts` — type effectiveness depends on the power, so the power must be known before a target can be scored
- [x] T022 [US1] Implement the five-step tiebreak in `packages/sim/ai/targeting.ts` — primary rule, fallback rule, best type matchup, nearest row, then **seeded random from the resolver** (FR-017)
- [x] T023 [US1] Take all randomness from the resolver's `draw(seed, index)` in `packages/sim/ai/targeting.ts` and return `drawsConsumed` — **never a local random source**, or a defense stops being replayable
- [x] T024 [US1] Confirm the engine plays Visible and Hidden **identically** — assert in `packages/sim/tests/ai/divergence.test.ts` that no code path in `packages/sim/ai/` reads a zone. The distinction is visibility and reward, never behaviour (FR-013)

**Checkpoint**: A defense plays its configuration, reproducibly, in either zone.

---

## Phase 5: User Story 3 - An unconfigured defense is competent, not incoherent (Priority: P1)

**Goal**: A brand-new player who has never opened the controls still fields a squad that fights sensibly.

**Independent Test**: Save a squad without touching any control; confirm role-derived defaults everywhere and that **no default switches off a power**.

### Tests for User Story 3 ⚠️

- [x] T025 [US3] Write `packages/sim/tests/ai/safeOrderings.test.ts` part one — 12 orderings × 27 heroes = **324 cases**, every power firing at least once at 60 turns
- [x] T026 [US3] Write `packages/sim/tests/ai/safeOrderings.test.ts` part two — **the assertion that describes a real game**: for each role default applied **only to that role's heroes** at **9 turns**, every tier 1–5 fires at least once and tier 0 may be zero, being the fallback

> **Verified during Phase 0: every hero fires its ultimate at least once under
> every default, at battle length.** If that stops being true, a default is
> deleting a power in the game rather than in the asymptote.

### Implementation for User Story 3

- [x] T027 [US3] Implement `roleDefaults(role)` in `packages/sim/ai/defaults.ts` — Striker `5·4·3·2·1·0`, Tank `4·3·2·1·5·0`, Ranged `3·5·4·2·1·0`, Buffer `4·5·2·3·1·0`, each drawn from the safe set (FR-014, FR-015)
- [x] T028 [US3] Set the default targeting pair and the default ally rule (**lowest HP percentage**) per role in `packages/sim/ai/defaults.ts`
- [x] T029 [US3] Make any explicit selection override the default in `packages/sim/ai/index.ts` (FR-016)
- [x] T030 [US3] Record the role→ordering mapping as **a proposal** in `packages/sim/ai/defaults.ts` — the *safety* is measured, the *assignment* is not, and the Buffer case assumes its mid tiers carry sustain (Constitution XX)

**Checkpoint**: A new account fields a competent defense without touching a control.

---

## Phase 6: User Story 4 - Priority never breaks targeting (Priority: P2)

**Goal**: A preferred target being unavailable, or a taunt dragging elsewhere, still leaves a legal action.

**Independent Test**: Apply priority against every combination of reach, fade and taunt; a legal action always results and taunt always wins.

### Tests for User Story 4 ⚠️

- [x] T031 [P] [US4] Write `packages/sim/tests/ai/taunt.test.ts` — a taunting Tank pulls a defender off its preferred target **100%** of the time, and a compulsion naming a hero **outside** the candidate set does not apply (SC-006)
- [x] T032 [P] [US4] Write `packages/sim/tests/ai/targeting.test.ts` — a priority ranking the only available target last still **takes it**, because priority sorts and never filters (SC-007)
- [x] T033 [P] [US4] Write the ally case in `packages/sim/tests/ai/allyChoice.test.ts` — stages 1 and 4 only, with reach limiting a heal exactly as it limits an attack (FR-011)

### Implementation for User Story 4

- [x] T034 [US4] Implement `chooseTarget(state, seed, drawIndex, actorInstanceId, config, candidates)` in `packages/sim/ai/targeting.ts` — `candidates` **arrives already filtered by stages 1–3**, and this function **sorts**. It has no parameter that could filter, which is what makes FR-009 unbreakable (FR-008, FR-009)
- [x] T035 [US4] Implement the primary-then-fallback sort in `packages/sim/ai/targeting.ts` — a single rule leaves the target undefined 49–80% of the time, so the fallback is the rule that usually fires
- [x] T036 [US4] Implement every `TargetRule` in `packages/sim/ai/targeting.ts` — by role, by state, by distance, and `best-type-matchup` as a **stated plan** rather than only as tiebreak 3
- [x] T037 [US4] Implement `chooseAlly` in `packages/sim/ai/allyChoice.ts` — stages 1 and 4 only; taunt and fade are properties of *enemy* targeting and do not apply (FR-011)
- [x] T038 [US4] Omit `allyRule` from the config of a champion owning no friendly power in `packages/sim/ai/types.ts`, so the interface stays honest about which champions face the decision (FR-004)

**Checkpoint**: Targeting cannot deadlock and a compulsion always wins.

---

## Phase 7: User Story 5 - Distance priorities work at any reach (Priority: P3)

**Goal**: A defender asking to strike past the front line does, including when a rune has widened its reach.

**Independent Test**: Grant +1 reach and confirm a third enemy row becomes reachable and selectable.

### Tests for User Story 5 ⚠️

- [x] T039 [US5] Write `packages/sim/tests/ai/reachWindow.test.ts` — a reach-2 front seat with no rune gives **2** reachable enemy rows with `middle == furthest`; with `+1` reach it gives **3** and `middle` selects row 5 (SC-008)
- [x] T040 [P] [US5] Add the same-family case to `packages/sim/tests/ai/reachWindow.test.ts` — Silka's `Quicker Than Told` chains *as many times as there are enemies in reach*: **2** at full formation, **3** once the enemy front row is wiped. A hard-coded 2 reproduces the arbitrary number this rule replaced

> **T039's second case fails on the natural implementation.** It is the whole
> reason FR-020 exists.

### Implementation for User Story 5

- [x] T041 [US5] Derive the reachable-row window from `rules`' `distance()` on **every** evaluation in `packages/sim/ai/targeting.ts` — **no constant `2` anywhere in `ai/`, and no array sized to two rows** (FR-020)
- [x] T042 [US5] Degrade `middle` to **`furthest`** when fewer than three rows are reachable, in `packages/sim/ai/targeting.ts` — a defender choosing *middle* is asking to get **past the front line**, so dropping them onto the front row inverts the instruction rather than approximating it (FR-021)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T043 Assert a defender's configuration is never exposed to an attacker — extend `packages/sim/tests/ai/divergence.test.ts` to confirm no `SquadMemberConfig` field appears in any scout view, battle response or replay payload (Constitution XVII)
- [x] T044 [P] Write `packages/sim/ai/README.md` — the two-list surface, the tier-0 hazard, and the standing instruction to **re-run the sweep after the hero-numbers pass**
- [x] T045 Run the manual pass in [quickstart.md](quickstart.md) — build a squad with the worst ranking (`1·2·3·4·5·0`) and confirm the builder reports **both ultimates dead**; set a champion to `middle` with no rune and confirm it behaves as `furthest`, not `nearest`; run the same battle twice from one seed and confirm every choice is identical

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 002 and 003 for `rules` and `Seed`
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US2 (Phase 3)**: Foundational only. Sequenced first among the P1s
- **US1 (Phase 4)**: needs the cooldown semantics from T015
- **US3 (Phase 5)**: needs the safe set from T008 and the profile from T011
- **US4 (Phase 6)**: needs feature 002's `legalTargets` for the candidate set
- **US5 (Phase 7)**: depends on US4's `chooseTarget`
- **Polish (Phase 8)**: depends on all five

### User Story Dependencies

- **US2 (P1)**: none. It is the computation everything else is judged against
- **US1 (P1)**: US2's cooldown semantics
- **US3 (P1)**: US2 (safety is measured with `firingProfile`)
- **US4 (P2)**: none within this feature — feature 002 supplies stages 1–3
- **US5 (P3)**: US4

### Within Each User Story

- Tests written and **failing** before implementation
- **defaults ← safe orderings ← the characterisation sweep**, in that order. The sweep is a prerequisite, not a check
- `firingProfile` before any squad-builder work in feature 006

### Parallel Opportunities

- **US4 can run entirely in parallel with US1, US2 and US3** — targeting touches none of their files
- T016, T017, T018 in parallel
- T031, T032, T033 in parallel
- T010 alongside T011's implementation

---

## Parallel Example: User Story 4

```bash
# Three independent test files, all red first:
Task: "taunt.test.ts — compulsion beats priority 100% of the time"
Task: "targeting.test.ts — priority sorts, it never filters"
Task: "allyChoice.test.ts — stages 1 and 4 only, reach applies unchanged"
```

---

## Implementation Strategy

### MVP First (US2 + US1 + US3)

All three are P1 and together they are the feature: **the profile is right, the
engine plays the configuration, and an unconfigured squad is still competent.**
Stop after Phase 5 and validate — the 324-case CI suite is green and the manual
`1·2·3·4·5·0` check reports both ultimates dead.

1. Phase 1–2: Setup, and **run the sweep**
2. Phase 3: US2 — the computation, before any interface
3. Phase 4: US1 — the engine
4. Phase 5: US3 — **STOP and VALIDATE** the defaults at 9 turns, not 60
5. Phases 6–7: targeting invariants and the reach window

### Incremental Delivery

US4 and US5 harden a system that already works. They are P2 and P3 for that
reason — but T041's *no constant 2* is cheap now and expensive once an array
sized to two rows exists in three places.

---

## Notes

- **Re-run the sweep before the hero-numbers pass locks.** A **one-point** reduction
  in the tier-4/5 cooldown ladder wipes the safe set from 12 to **zero**
  (research.md Finding 2). This is not a formality — it is the difference between
  four defaults that keep every power live and four that do not.
- **The "3% of orderings keep a whole kit working" figure is a 60-turn statement**
  and should not be quoted about a battle. At 9 turns the honest number is
  **32 of 720 keep tiers 1–5 live**, excluding the auto-attack.
- **Which ordering suits which role is a proposal and cannot be settled here** —
  the sweep can prove a power fires, never that firing it was worth doing. That
  needs the powers' *effects* read, and belongs with the hero-numbers pass.
- **A self-defeating ranking is surfaced, not blocked** (Constitution XVIII).
  Deliberate is fine; accidental is the failure.
- Commit after each task or logical group; work goes straight to `main`.
