# Tasks: Content Package

**Input**: Design documents from `/specs/001-content-package/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/content.d.ts](contracts/content.d.ts) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 2

**Tests**: **Included.** Principle VIII and the plan both require them, and this
package is the one place in the codebase where exhaustive property tests are
cheap — the data is 27 heroes and 9 types, and the rules are pure.

**Organization**: Tasks are grouped by user story so each can be implemented and
tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are given in every task

## Path Conventions

Monorepo, per [plan.md](plan.md) § Project Structure and
[specs/data-model.md](../data-model.md) § Build order:
`packages/content/src/`, `packages/content/tests/`, `tools/` at repository root.

> **Feature 001 carries the monorepo bootstrap.** LMNTLZ has no code yet, so
> Phase 1 here is the workspace itself and runs exactly once for the whole
> project. Features 002–016 inherit it and start at their own Foundational phase.

---

## Phase 1: Setup (Shared Infrastructure — the whole repo, once)

**Purpose**: Stand up the pnpm + Turborepo workspace and the `@lmntlz/content` package

- [x] T001 Create the pnpm workspace root — `pnpm-workspace.yaml` (packages: `packages/*`, `apps/*`), root `package.json`, and `.npmrc` with `shamefully-hoist=false`
- [x] T002 Add Turborepo — `turbo.json` at repo root with `build`, `test`, `typecheck` and `lint` pipelines, `build` declaring `^build` dependency
- [x] T003 [P] Create `tsconfig.base.json` at repo root — `strict: true`, `target: ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess: true`
- [x] T004 [P] Configure ESLint and Prettier at repo root — `eslint.config.js`, `.prettierrc`
- [x] T005 [P] Add Vitest workspace config `vitest.workspace.ts` at repo root
- [x] T006 Scaffold `packages/content/` — `package.json` named `@lmntlz/content` with `build`/`test` scripts, `tsconfig.json` extending `tsconfig.base.json`, empty `src/index.ts`
- [x] T007 Add dependencies — `zod` to `packages/content/package.json`; `exceljs` and `tsx` to root devDependencies for the build step in `tools/`

> **Why `exceljs`**: it is on the public npm registry with bundled types, and the
> reader is header-keyed (research.md Q2) so the library is swappable without
> touching the schema. Recorded here rather than in research.md because the
> decision is a tasks-level detail, not a Phase 0 question.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `counter` bijection and the removal of everything that can destroy the authored source

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Delete the five workbook mutators per research.md Q1 (FR-018) — `tools/build-hero-stats.py`, `tools/add-passives.py`, `tools/add-powers-sheet.py`, `tools/apply-power-balance.py`, `tools/apply-roster-fixes.py`
- [x] T009 Verify no writer survives — `rg -l "hero-stats.xlsx" tools/` must return only read-only scripts (`validate-matchups.ps1`, `characterize-orderings.py`, `verify-accuracy.py`)
- [x] T010 Define the nine damage types, the two families and `family(type)` in `packages/content/src/types.ts`
- [x] T011 Implement `counter(type)` in `packages/content/src/types.ts` — Earth↔Air, Fire↔Water, Light↔Dark, Crush→Slash→Pierce→Crush (FR-003)
- [x] T012 [P] Property test — `counter` is a bijection over all 9 types and never crosses families, in `packages/content/tests/counter.test.ts`

**Checkpoint**: The single source of every weakness in the game exists, and nothing in the repo can overwrite the workbook

---

## Phase 3: User Story 1 - An illegal hero cannot be created (Priority: P1) 🎯 MVP

**Goal**: Two authored type fields per hero; bane, fault and strengths derived; the 12 colliding pairings refused by name.

**Independent Test**: Author a hero at every one of the 72 `(primary, secondary)` pairs — exactly **60 accepted, 12 rejected**, each rejection naming which distinctness rule it broke.

### Tests for User Story 1 ⚠️

> **Write these FIRST and confirm they fail.** T013 in particular is a pure
> property of the rules — it needs no workbook and can be red before any reader
> exists, which is what proves FR-006 is a *consequence* rather than a check.

- [x] T013 [P] [US1] The 60-of-72 enumeration test in `packages/content/tests/derivation.test.ts` — a **count** assertion (FR-005), so a change to `counter` that silently widens the legal space fails here
- [x] T014 [P] [US1] Rejection-naming test in `packages/content/tests/schema.test.ts` — each of the 12 illegal pairs returns its specific `ValidationRule`
- [x] T015 [P] [US1] The melee⇒magic consequence test in `packages/content/tests/derivation.test.ts` — assert the property holds for all 27 heroes, **plus** a source scan proving no rule mentioning melee pairing exists (FR-006)

### Implementation for User Story 1

- [x] T016 [US1] Implement `isLegalPairing(primary, secondary)` with the three distinctness rules in `packages/content/src/derive.ts` (FR-004)
- [x] T017 [US1] Implement the derivation — `strengths`, `bane = counter(primary)`, `fault = counter(secondary)`, `family` — in `packages/content/src/derive.ts` (FR-002)
- [x] T018 [P] [US1] Zod schemas for `HeroStats`, `Power` and `Hero` in `packages/content/src/schema.ts`, matching `contracts/content.d.ts` — **no field accepts an authored bane, fault or strength list** (FR-001)
- [x] T019 [US1] Roster-wide rules in `packages/content/src/schema.ts` — exactly 27 heroes, exactly three per damage type, and the `legal-pairing-count` assertion (FR-010)
- [x] T020 [US1] Implement `validateRoster()` returning `ValidationFailure[]` that names the hero **and** the field in every message, in `packages/content/src/validate.ts` (FR-017)
- [x] T021 [US1] Startup guard in `packages/content/src/index.ts` — a non-empty `validateRoster()` throws at module load, so an invalid roster prevents startup rather than surfacing mid-battle (FR-015)
- [x] T022 [US1] Header-keyed workbook reader in `tools/build-content.ts` — resolve every column by header string once at load and fail loudly on a missing header; **never index a column by position** (research.md Q2)
- [x] T023 [US1] Power reading in `tools/build-content.ts` — match power columns by `startsWith('Power ')` (the first header carries a non-ASCII em dash), and reject a blank cooldown on an *active* power while accepting it on a passive
- [x] T024 [US1] Read the workbook's `Bane (derived)` / `Fault (derived)` columns **as an assertion, never as a source** — a mismatch emits `derived-column-disagrees` naming the hero (FR-008)
- [x] T025 [US1] Emit `packages/content/src/heroes.generated.ts` from `tools/build-content.ts` and commit it (FR-019)
- [x] T026 [US1] Emit `resources/characters/MATCHUPS.md` from the same build step, so the roster of record stops being hand-maintained (Constitution XX)
- [x] T027 [US1] Implement `getHero(id)` — throwing `UnknownHeroError`, not returning `undefined` — and `getAllHeroes()` returning a frozen array in stable roster order, in `packages/content/src/index.ts` (FR-011)

**Checkpoint**: The roster loads, validates, and refuses exactly the 12 illegal pairings. Nothing downstream exists yet, but "what is a hero" now has one answer.

---

## Phase 4: User Story 2 - The simulation reads effectiveness rather than computing it (Priority: P1)

**Goal**: One of five multipliers, derived from the defender's two authored types, with no second place the relationship is written down.

**Independent Test**: All 243 hero × attacking-type combinations resolve to one of exactly five values, and no source file in the repository contains a literal effectiveness table.

### Tests for User Story 2 ⚠️

- [x] T028 [P] [US2] The 243-combination test in `packages/content/tests/effectiveness.test.ts` — every result is one of `1.5 | 1.25 | 1.0 | 0.8 | 0.5` and matches the value derived from that hero's authored pair
- [x] T029 [P] [US2] No-literal-table test in `packages/content/tests/effectiveness.test.ts` — scan `packages/content/src` for any 9×9 matrix or hard-coded multiplier outside `effectiveness.ts` (FR-008, SC-001)

### Implementation for User Story 2

- [x] T030 [US2] Implement `effectiveness(attackType, defender: Hero)` in `packages/content/src/effectiveness.ts` — **the signature takes a Hero and there is no overload accepting a bare defending type**, because a 9×9 table cannot express Fault or the ×0.80 secondary case (FR-007)
- [x] T031 [US2] Implement `powerEffectiveness(power, defender)` in `packages/content/src/effectiveness.ts` — the better of a dual-typed power's two types, single-typed powers taking the same code path (FR-009)
- [x] T032 [US2] Export `counter`, `effectiveness` and `powerEffectiveness` from `packages/content/src/index.ts`

**Checkpoint**: Features 002 and 003 can now be started — the vocabulary they speak is complete.

---

## Phase 5: User Story 3 - A battle can be traced to the numbers that produced it (Priority: P2)

**Goal**: A content version distinct from the engine version, derived from the authored source.

**Independent Test**: Edit one workbook cell, rebuild — the stamp moves. Rebuild without editing — it does not.

> **P2 in urgency, P1 in deadline.** Constitution XVI makes this unbackfillable:
> it ships with the first battle ever recorded or never at all.

### Tests for User Story 3 ⚠️

- [x] T033 [P] [US3] Version-tracks-source test in `packages/content/tests/version.test.ts` — the stamp is a function of the workbook bytes, not of the emitted output (FR-020)

### Implementation for User Story 3

- [x] T034 [US3] Compute `"c" + sha256(bytes of resources/characters/hero-stats.xlsx)[0:12]` at build time in `tools/build-content.ts` (research.md Q3)
- [x] T035 [US3] Freeze the stamp into `packages/content/src/version.generated.ts` and expose `contentVersion()` from `packages/content/src/version.ts` — the `c` prefix is load-bearing, so a swapped `engineVersion`/`contentVersion` pair is visible on sight (FR-016)

**Checkpoint**: Any consumer can name the roster that produced an outcome.

---

## Phase 6: User Story 4 - A designer tunes numbers without touching structure (Priority: P3)

**Goal**: Stats, magnitudes and reach move freely; consumers never change; malformed values are refused with the hero and field named.

**Independent Test**: Replace every stat value in the workbook — all consumers work unchanged and validation still passes.

### Tests for User Story 4 ⚠️

- [x] T036 [P] [US4] Shape-rejection tests in `packages/content/tests/schema.test.ts` — a stat over the 75 cap, a fractional cooldown, a reach outside `{1, 2}`, and an unknown power reference each fail naming the hero and the field

### Implementation for User Story 4

- [x] T037 [US4] Stat validation in `packages/content/src/schema.ts` — the 75 cap and the authored stat budget, leaving the measured +10 levelling headroom before a +20 rune overflows (FR-014)
- [x] T038 [US4] Cooldown validation in `packages/content/src/schema.ts` — integer turn counts only; reject any fractional or time-based value (FR-013)
- [x] T039 [US4] Reach and flag validation in `packages/content/src/schema.ts` — `reach ∈ {1, 2}`, and accept the `reactive` flag now so the hero-numbers pass needs no migration (research.md § What is NOT settled)
- [x] T040 [US4] Power-reference integrity in `tools/build-content.ts` — a hero referencing a power absent from `Power List`, or two heroes sharing a name that must be unique, fails naming both

**Checkpoint**: All four stories are independently functional. The hero-numbers pass can now land without a second migration.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T041 CI regenerate-and-diff job in `.github/workflows/content.yml` — re-run `tools/build-content.ts` and **fail if the emitted output differs from what is committed** (FR-019). This is what makes the build step safe rather than merely convenient
- [x] T042 [P] Write `packages/content/README.md` — the public surface, and the standing warning that nothing may open the workbook for writing
- [x] T043 Run every check in [quickstart.md](quickstart.md) end to end, including the hand-edit-a-derived-column test and the "nothing else edited" `git status` check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — and it is the whole repo's bootstrap, so it runs once ever
- **Foundational (Phase 2)**: Depends on Setup — **blocks all four stories**
- **US1 (Phase 3)**: Depends on Foundational. Nothing else
- **US2 (Phase 4)**: Depends on Foundational for `counter`, and on T017 for the derived fields it reads
- **US3 (Phase 5)**: Depends on the build step existing (T022). Independent of US2
- **US4 (Phase 6)**: Depends on the schema (T018). Independent of US2 and US3
- **Polish (Phase 7)**: Depends on US1 and US3 — the CI job needs both the emitter and the stamp

### User Story Dependencies

- **US1 (P1)**: Foundational only
- **US2 (P1)**: Reads `Hero.bane` / `Hero.fault`, so needs T017. Otherwise independent
- **US3 (P2)**: Needs the build step from US1, nothing more
- **US4 (P3)**: Needs the schema from US1, nothing more

### Within Each User Story

- Tests are written and **fail** before implementation
- `counter` before derivation · derivation before schema · schema before the reader · reader before emission
- **T013 before T022** — the plan is explicit: the 60-of-72 test is a pure property and must be red before any workbook is read

### Parallel Opportunities

- T003, T004, T005 in parallel once T001/T002 land
- T012 alongside any of Phase 3's test tasks
- T013, T014, T015 all in parallel — three files, no shared state
- T028 and T029 in parallel
- Once T017 and T018 land, **US2, US3 and US4 can be worked in parallel** by different people

---

## Parallel Example: User Story 1

```bash
# Launch all three US1 tests together — they must all be red first:
Task: "The 60-of-72 enumeration test in packages/content/tests/derivation.test.ts"
Task: "Rejection-naming test in packages/content/tests/schema.test.ts"
Task: "The melee⇒magic consequence test in packages/content/tests/derivation.test.ts"

# Then the two independent implementation files:
Task: "isLegalPairing + derivation in packages/content/src/derive.ts"
Task: "Zod schemas in packages/content/src/schema.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Both are P1 and the pair is the real deliverable: **the roster is well-formed and
effectiveness is derived from it alone.** Stop after Phase 4 and validate — at
that point features 002 and 003 are unblocked, which is the point of building
this first.

1. Phase 1: Setup — the monorepo, once
2. Phase 2: Foundational — `counter`, and delete the shredders
3. Phase 3: US1 — **STOP and VALIDATE** the 60-of-72 enumeration
4. Phase 4: US2 — **STOP and VALIDATE** the 243 combinations
5. Phases 5–7 can follow while feature 002 is underway

### Incremental Delivery

US3 and US4 both extend a working package without changing its surface. US3 is
the one with a deadline rather than an urgency — do not let it slip past the
first recorded battle.

---

## Notes

- **Constitution XV is this feature.** Any task that would let a weakness be typed
  into a file is wrong even if it passes its tests. The workbook's two `(derived)`
  columns are read **as an assertion** (T024) precisely because reading them as a
  source would look identical and be a silent violation.
- **"Done" does not mean "balanced."** The values are still a Role-shaped
  template. This feature is done when the roster is well-formed and
  self-consistent; balance is checked against battles, which do not exist yet.
- Commit after each task or logical group; work goes straight to `main`.
