# Tasks: Status Effects and Passives

**Input**: Design documents from `/specs/020-status-and-passives/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/status.d.ts](./contracts/status.d.ts)

**Tests**: included and non-optional. This feature's entire premise is that code
exists and does nothing, so a task list without tests would be indistinguishable
from the state it is fixing.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — can run in parallel (different files, no dependencies)
- Every user-story phase ends with a **WIRING** task naming the caller

---

## ⚠️ Read this before starting

**This feature is the archetype of the failure the template warns about.** Every
piece named below already has a sibling that was built correctly and never
called:

| Built | Called | Result |
|---|---|---|
| `StatusInstance`, `HeroState.statuses` | never written | every effect inert |
| `legalTargets(…, filters, compulsion)` | resolver passes 3 of 5 args | Role has no mechanics |
| `riderLandProbability` | nothing | correct number, discarded |
| duration tick in `applyResolution` | ticks an empty array | correct code, no input |

So the wiring tasks here are not ceremony. **T019, T033, T041 and T050 are the
tasks that make this feature exist**; everything before them is a seam.

---

## Phase 1 — Foundations (blocks every story)

- [ ] **T001** [P] Widen `StatusInstance` in `packages/sim/rules/state.ts` per
  [data-model.md](./data-model.md): typed `kind`, `magnitude`, `stat`,
  `sourcePowerId`, `escalation`, `cleansable`. Keep `turnsRemaining` and
  `sourceInstanceId`.
- [ ] **T002** Create `packages/sim/rules/status.ts` with `STATUS_CATALOG` — the
  11 kinds across 6 families, each declaring its `StackRule` and whether it
  ticks damage.
- [ ] **T003** [P] Add the tier-derived magnitude functions to `status.ts`:
  `statChangeForTier`, `durationForTier`, `dotTickForTier`, `shieldForTier`,
  `potencyForTier`, `shredFraction`. **Values come from `05-status.md` only** —
  no magnitude is authored anywhere else (Constitution XV).
- [ ] **T004** Test `packages/sim/tests/rules/status.test.ts`: assert each tier
  strictly beats the one below on at least one axis, and that the potency ladder
  sits inside the usable 20–60 band. *This is the property the authored prompts
  depend on — tier-2 powers are written as escalations of tier-1.*
- [ ] **T005** Update every `HeroState` fixture that constructs `statuses: []`
  — `packages/sim/tests/{rules,ai,resolver}/fixtures.ts` — for the widened type.

**Checkpoint**: `pnpm --filter @lmntlz/sim test` green, types compile.

---

## Phase 2 — US1: A power does what its text says (P1) 🎯 MVP

### The core

- [ ] **T006** Implement `applyStatus(existing, incoming)` in `status.ts`,
  honouring every `StackRule`. Identity is **(`sourceInstanceId`,
  `sourcePowerId`, `kind`)** — see [data-model.md](./data-model.md) for why
  dropping `sourcePowerId` silently converts a designed combo into a no-op.
- [ ] **T007** [P] Implement `tickDurations` and `cleanse` in `status.ts`.
  `cleansable: false` survives a cleanse and still expires.
- [ ] **T008** Test the six stacking rows from
  [quickstart.md](./quickstart.md) scenario 3, including *three +10 Might buffs
  on a Might-45 hero compute at 75, not 85*.

### The derived readers — ⚠️ the rune trap

- [ ] **T009** Add `statusPoints(hero, key)` to `status.ts` and make
  `effectiveStat` in `state.ts` sum it **on top of** `hero.statMods`.
- [ ] **T010** 🔴 Test [quickstart.md](./quickstart.md) scenario 4: a hero with a
  `+10 Might` **rune** receives and loses a `+10 Might` **buff**, and ends at
  `base + 10`. **Mutation-check it** — write status points into `statMods`
  instead and confirm this test goes red. `board.ts` already writes runes there;
  a shared bag makes an expiring buff eat what a player bought, silently, only
  for players who own runes.
- [ ] **T011** [P] Add `shredFactor`, `shieldOf`, `upkeepDamage` to `status.ts`.
- [ ] **T012** Read the shred layer in `packages/sim/rules/damage.ts` where `E`
  is computed. **A percentage of the stat, never flat points** — flat is worth
  *more* against a lightly armored target, which is backwards for an effect
  called "find the seam".
- [ ] **T013** Deplete `shieldOf` before the health pool, passing the remainder
  of a breaking hit through in the same step.

### The rider data

- [ ] **T014** Add `riders` to `powerSchema` in `packages/content/src/schema.ts`
  as an **array** (order is contested order; object iteration order is a replay
  hazard). Reject any entry carrying a magnitude or duration.
- [ ] **T015** Create `tools/power-riders.json`. **Author all 87 active powers**
  by reading each `Prompt` — a power with none gets `[]`, so "deliberately none"
  and "not yet authored" stay distinguishable (FR-018). **Do not regex this**:
  the `Rider:` marker is a tier-1/2 convention and tiers 3–5 fold effects into
  prose.
- [ ] **T016** Read and drift-check the file in `tools/build-content.ts`, failing
  the build when it names a power the workbook does not have — same check
  `power-targeting.json` already uses.
- [ ] **T017** Test `packages/content/tests/riders.test.ts`: every active power
  appears exactly once; no rider carries a magnitude; every `buff`/`debuff`/
  `shred` names a stat.

### Resolution

- [ ] **T018** Populate **step 3** of `resolveOne` in
  `packages/sim/resolver/resolve.ts`: one contest per rider, in authored order,
  only if the payload connected. **Friendly powers consume zero draws** (FR-005)
  — skipped, never drawn-and-discarded.
- [ ] **T019** ⭐ **WIRING** — `apps/api/src/battle/turnLoop.ts` `takeTurn`
  invokes a new **Upkeep** step that calls `status.upkeepDamage` before the
  hero acts. *There is no Upkeep in the turn loop today; without this task every
  damage-over-time effect is a number nobody reads.* Death during Upkeep ends
  the turn — `phasesFor` already returns `['upkeep']` and has never been
  exercised.
- [ ] **T020** ⭐ **WIRING** — `resolveOne` passes the statuses' taunt and fade
  into `legalTargets` as `filters` and `compulsion`. *It currently calls it with
  three of five arguments, so the whole targeting-effect layer is unreachable.*
- [ ] **T021** Apply the `Toughness`-buff rule in `turnLoop.ts`: raise max HP
  **and** grant the same amount as current HP; on expiry lower max HP and clamp
  current down to it.
- [ ] **T022** Bump `engineVersion()` in `packages/sim/rules/index.ts` to
  `e0.3.0`. **Constitution XVI.**
- [ ] **T023** 🔴 Verify the four determinism suites — `drawOrder`,
  `seedCustody`, `determinism`, `reDerive` — are green, and add a case asserting
  a **friendly** power consumes no rider draw.
- [ ] **T024** 🔴 Test [quickstart.md](./quickstart.md) scenario 7: a replay
  recorded pre-020 plays back byte-identically and reports the *old* engine
  version.
- [ ] **T025** Document the drain-before-switch step in the deploy notes. An
  in-flight battle consumed zero draws at step 3 and would re-derive differently.

**Checkpoint**: quickstart scenarios 1–4 and 7 pass. `ridersLanded` carries real
contest results. This is the MVP — the game's combat now does what its text says.

---

## Phase 3 — US2: Role and House mean something (P2)

- [X] **T026** Create `packages/sim/rules/passives.ts` with the `PassiveHooks`
  shape and `hooksFor(heroId)`.
- [X] **T027** [P] Implement `Finish It` and `Measured Shot` — the only two
  passives that are pure damage math and need no status.
- [X] **T028** Implement `Hold the Line` (row-scoped taunt → `Compulsion`) and
  `Behind the Line` (permanent fade → `TargetFilter`).
- [X] **T029** Test that taunt and fade **cancel on the same hero**, and that a
  fade which would empty the candidate set is **ignored**. *Both are already
  emergent from `legalTargets`'s filter-then-compulsion ordering — this is a
  test with no implementation behind it, deliberately.*
- [X] **T030** [P] Implement the 9 House passives: `The Deep Holds`,
  `Never Where You Struck`, `It Catches`, `Wears Through`,
  `Nothing Stays Hidden`, `The Veil Closes`, `The Cut Reopens`,
  `Find the Seam`, `Nothing Holds`.
- [X] **T031** `It Catches` uses the `escalation` field rather than a special
  case in the tick function.
- [X] **T032** Test all 13: same board, same seed, suppressed vs active → the
  event logs differ (SC-002).
- [X] **T033** ⭐ **WIRING** — `resolveOne` and the Upkeep step invoke
  `hooksFor` at each trigger point. *Verify with
  `rg -n "hooksFor" packages/sim apps/api | rg -v "\.test\.|export "` — zero
  hits outside its definition is the defect.*

**Checkpoint**: the four Roles have mechanical existence for the first time.

---

## Phase 4 — US3: Each champion plays differently (P3)

- [X] **T034** 🚦 **GATE** — draft all **19** unwritten unique passives as one
  table: trigger, effect, magnitude, and **what each is priced against**. Anchors
  in [research.md](./research.md) §5. `The Bone Beneath` starts from its settled
  constraint — **Magic Resist, not Armor**.
- [X] **T035** 🚦 **BLOCKING** — Jon accepts / rejects / edits line by line.
  **No row is implemented before it is approved.** Constitution XIV: an
  over-tuned passive can only be corrected by raising the other twenty-six.
- [X] **T036** Write the approved 19 into `resources/mechanics/03-powers.md`.
  **Same commit as the implementation** — a magnitude that exists only in
  TypeScript is not canon (Constitution XX).
- [X] **T037** [P] Add the 19 to `UNIQUE_EFFECTS` in
  `packages/content/src/passives.ts`; retire `PARTIALLY_SETTLED`.
- [X] **T038** [P] Implement the 8 already-authored uniques. They are unchanged
  by T034–T036.
- [X] **T039** Implement the 19 approved uniques.
- [X] **T040** Test: no passive reports a null effect (SC-003), and all 27
  diverge under suppression (SC-002).
- [X] **T041** ⭐ **WIRING** — every unique is reachable from `hooksFor`, and the
  roster drawer's flyout shows real text for all 27.

---

## Phase 5 — US4: The player can see the board (P4)

- [ ] **T042** Carry statuses on the action packet in
  `apps/api/src/battle/packet.ts` **under the visibility rule** — exact duration
  for effects the viewer caused and effects on the viewer's own champions;
  an enemy's self-applied effect is **presence only**.
- [ ] **T043** 🔴 Test the **payload**, not the render: an enemy self-effect's
  duration is **absent from the response**. Hiding it client-side would leak it
  to anyone reading the network tab and would contradict scouting, which already
  shows filled rune slots but never what they do.
- [ ] **T044** [P] Add the status icon mapping to
  `apps/client/src/features/battle/` from `resources/status-icons.md`, importing
  kinds from the shared catalog — **no client-side magnitude table**
  (Constitution XIII).
- [ ] **T045** Build `StatusRow.tsx`: a pip per effect, a numeral only where the
  rule permits.
- [ ] **T046** Reserve the height of the part that **varies**, and never clear on
  `mouseleave`. *A panel that resizes as effects come and go shakes everything
  below it.*
- [ ] **T047** [P] Unit-test the three visibility classes.
- [ ] **T048** Playwright: a real browser sees the pips, because jsdom does no
  layout.
- [ ] **T049** Show a burning champion's remaining ticks in the battle log line,
  so the transcript and the board agree.
- [ ] **T050** ⭐ **WIRING** — `BattleScreen` renders `StatusRow` for every hero
  on the board, both sides.

---

## Dependencies

```
Phase 1 (T001–T005)
   └─> Phase 2 / US1 (T006–T025)        ← MVP; everything else waits on it
          ├─> Phase 3 / US2 (T026–T033)
          │      └─> Phase 4 / US3 (T034–T041)
          └─> Phase 5 / US4 (T042–T050)
```

US4 depends only on US1 populating state, so it can run beside US2/US3 once the
MVP checkpoint is green.

## Parallel opportunities

- **T003 + T005** after T001.
- **T011 + T014/T015** — the readers and the authoring are different files.
- **T015 is the long pole of US1** (87 prompts, read individually) and blocks
  nothing until T018. Start it early and run it alongside T006–T013.
- **T027 + T030** — role and house passives are independent.
- **T037 + T038** while T034/T035 are with Jon.

## Definition of done

| Story | Done when |
|---|---|
| **US1** | quickstart 1–4, 7 pass; `ridersLanded` real; all 87 accounted for; 4 determinism suites green |
| **US2** | quickstart 5, 6 pass for the 13 authored |
| **US3** | 19 approved; all 27 diverge; `resources/mechanics/` updated in the same commit |
| **US4** | quickstart 8 passes **including the payload assertion**; verified in a browser |
