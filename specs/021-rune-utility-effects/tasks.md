# Tasks: Rune Utility Effects

**Input**: Design documents from `/specs/021-rune-utility-effects/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/runes-and-battle.md](./contracts/runes-and-battle.md), [quickstart.md](./quickstart.md)

**Tests**: included and non-optional. The premise of this feature is that a player
pays 200 shards for a column that is written `null`, so a task list without tests
would be indistinguishable from the state it is fixing.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — can run in parallel (different files, no dependencies)
- Every user-story phase ends with a **WIRING** task naming the caller

---

## ⚠️ Read this before starting

**Two failure modes have already happened here and both are silent.**

| Failure | Where it bit | Guard in this list |
|---|---|---|
| A seam nobody calls | 5× across 4 features | wiring tasks T027/T028, T047, T056, T061 |
| A guard that hand-lists its subjects | 020's anti-vacuity check went stale the moment US3 added 11 hooks | T005, T014, T015 must **scan**, never list |

**The single highest-value task in this list is T004.** `passives.ts:1498` is the
one registry lookup that bypasses `hooksOf`, and it decides `ignoresFade` for the
*acting* hero. Skip it and `Nowhere to Stand` is read for every hero on the board
except the one taking a turn — a rune that works for everybody but its owner, with
nothing failing.

**T003 is the keystone.** Widening `hooksOf` gives 21 readers rune support at once.
If T003 is right, most of US1 and US2 is writing effect bodies rather than wiring.

---

## Phase 1 — Foundations (blocks every story)

- [X] **T001** [P] Create `packages/sim/rules/runeEffects.ts` with the frozen `RUNE_MAGNITUDES` object and the `RuneEffect` type (`id`, `name`, `pool`, `role`, `shape`, `hooks`) per [data-model.md](./data-model.md). Reuse `PassiveHooks` from `packages/sim/rules/passives.ts` verbatim — do **not** rename it to `EffectHooks` ([research.md](./research.md) Decision 1). Registry starts empty.
- [X] **T002** [P] Add `readonly runeEffects: readonly string[]` and `readonly hasActed: boolean` to `HeroState` in `packages/sim/rules/state.ts`, defaulting to `[]` and `false` so every existing fixture and stored snapshot constructs unchanged.
- [X] **T003** Widen `hooksOf` in `packages/sim/rules/passives.ts:1322` to return passive hooks **plus** the hooks of the hero's `runeEffects`, looked up in `RUNE_EFFECTS`. Keyed **per instance**, never by `heroId` — two players fielding the same champion carry different runes.
- [X] **T004** Fix the single bypass at `packages/sim/rules/passives.ts:1498` in `targetingFor` — replace `hooksFor(heroStateOf(state, actorInstanceId).heroId)` with the widened `hooksOf(...)`, so the acting hero's rune targeting flags are read.
- [X] **T005** [P] Add `packages/sim/tests/rules/hookReach.test.ts` — read the `passives.ts` **source** and fail if any registry lookup other than `hooksOf`'s own definition calls `hooksFor` directly. **Derive by scanning; never hand-list today's readers.** Mutation-check by restoring the T004 bypass and confirming it goes red. ✅ *Both mutants killed, by different tests — restoring the bypass fails the offenders check, and stripping the rune half from `hooksOf` slips past that one and fails the composition check.*
- [X] **T006** Add `poolOf(heroId, slot)` to `packages/sim/rules/runeEffects.ts`, derived from the hero's authored `primary`/`secondary`. Never stored (Constitution XV). ✅ *Went further than planned: `slotAccepts` in `apps/api` now **delegates** to it rather than deriving the same answer beside it. The two would have been a live disagreement — the Forge offers a pool from the engine's answer while the server validates against the API's.*
- [X] **T007** ~~Add a `stubborn?: boolean` flag to `StatusInstance`.~~ **Not needed — dropped.** `cleansable: false` already exists on `StatusInstance` and already does exactly this; Ember Saelith's burns and Umbriel's debuffs use it. `It Stays Open` and `Stays Broken` will set it through `shapeOutgoing`. A second name for a rule that has one is the drift this project keeps producing.
- [X] **T008** [P] Add the **rune duration class** to `resources/mechanics/05-status.md`. Constitution XX. ✅ *Sharper than expected: `PERMANENT = Number.POSITIVE_INFINITY` has existed in the engine since 020 and was documented **nowhere** — a rule living only in TypeScript. Now written down with its two legal sources, why no power may author it, and that `PERMANENT` and `cleansable` are independent flags.*
- [X] **T009** Export `RUNE_EFFECTS`, `RUNE_MAGNITUDES`, `poolOf` and the `RuneEffect` type from `packages/sim/rules/index.ts` so `apps/client` can import them (`@lmntlz/sim/rules` is client-legal; `/resolver` and `/ai` are not).

**Checkpoint**: ✅ `pnpm -r typecheck` clean on all 4 projects · sim + content **624 passed** (617 + 7 new) · no behaviour change yet. Six `HeroState` construction sites needed the two new fields: 3 sim fixtures, 2 client fixtures, and `reachPreview.ts`.

---

## Phase 2 — US1 (P1): the purchase is honest, and 12 effects run

**Goal**: a player reaches stage 4, is offered the right pool, commits, and that
effect changes the next battle.

**Independent test**: take a fresh account to stage 4 on one slot, commit an
effect, fight, and see it fire — with the stored row carrying a non-null
`utility_effect` for the first time in the project's history.

### Catalog — the 12 that need no new engine capability

- [X] **T010** [US1] Implement the 3 common-pool effects in `packages/sim/rules/runeEffects.ts`: `Cornered` (first below 50% HP → `Might`, rest of battle), `The Point Proven` (first Bane hit landed → `Penetration`), `The Line Shortens` (an ally falls → `Speed`). All magnitudes from `RUNE_MAGNITUDES`.
- [X] **T011** [US1] Implement the Earth pair in `packages/sim/rules/runeEffects.ts`: `Made Heavy` (Bane hits you land permanently cost the target `Speed`) and `Weight Tells` (below 50% → `Armor` + `Magic Resist`). **The "cannot be moved" clause is inert and documented as such** — no displacement mechanic exists, and none is being invented (spec A-03).
- [X] **T012** [US1] Implement `Harder to Follow` (Air, first Bane hit taken → `Agility`) and `It Spreads` (Fire, killing blow → `Might`, stacking to the authored cap via the existing `accumulate` effect kind) in `packages/sim/rules/runeEffects.ts`.
- [X] **T013** [US1] Implement `Nowhere to Stand` (Light, fade-piercing + `Perception`) and `It Lingers` (Dark, debuffs you apply last one turn longer, via `shapeOutgoing`) in `packages/sim/rules/runeEffects.ts`.
- [X] **T014** [US1] Implement the 3 martial effects in `packages/sim/rules/runeEffects.ts`: `Again, There` (Slash, consecutive attacks on one target escalate, resetting on switch), `The Way In` (Pierce, `Penetration` against an already-struck enemy), `The Floor Comes Up` (Crush, below 50% → stun every enemy in reach, once).

### Catalog guards — all three must scan, not list

- [X] **T015** [P] [US1] Add `packages/sim/tests/rules/runeEffects.test.ts` completeness block — derive expectations from `Object.keys(RUNE_EFFECTS)` and the content package's own damage-type list, **never from a hand-written list of 33 names**. Assert: 6 common, 3 per element, and within each element pool the three `role` values are distinct. A missing effect must **fail**, not pass silently.
- [X] **T016** [P] [US1] Add the no-magic-numbers guard to `packages/sim/tests/rules/runeEffects.test.ts` — read the `runeEffects.ts` source and fail on any numeric literal inside an effect body. Every magnitude comes from `RUNE_MAGNITUDES` (FR-002), because the battle-length flag means these numbers **will** move.
- [X] **T017** [P] [US1] Add the name-collision guard to `packages/sim/tests/rules/runeEffects.test.ts` — assert no `RuneEffect.name` collides with any authored power or passive name, read from `packages/content`. Assert every `id` is unique.
- [X] **T018** [P] [US1] Add `packages/sim/tests/rules/runeEffects.test.ts` behaviour cases for the 12 — each with the condition met and the authored consequence observed, plus `Cornered` **not** re-triggering after a heal back above half (FR-014). Include the acting-hero case for `Nowhere to Stand` specifically, which is what T004 fixes.

### The write path — where the 200 shards currently vanish

- [X] **T019** [US1] Change `placeStage` in `apps/api/src/progression/runes.ts` to take a utility effect id **only on the 3→4 edge**, store it, and refuse it by name on a 1/2/3 advance.
- [X] **T020** [US1] Change `rebuildRune` in `apps/api/src/progression/runes.ts` to take a utility id **unconditionally** and stop writing `utilityEffect: null` at line 377 — a rebuild lands directly on stage 4 in one transaction, so it cannot lean on a later advance.
- [X] **T021** [US1] Add server-side pool validation to `apps/api/src/progression/runes.ts`, derived from `slotAccepts(heroId, slot)` — refuse an out-of-pool id **by name**, naming the id, the slot and the pool the slot offers. Never trust the client (Constitution XII); never store the pool (XV).
- [X] **T022** [US1] Parse and validate the new `utility` body field in `apps/api/src/progression/routes.ts` for `POST /v1/heroes/:heroId/runes/:slot`, mapping refusals through the existing `RuneError` → HTTP table. **No new status codes.**
- [X] **T023** [P] [US1] Add `apps/api/tests/progression/runeUtility.test.ts` — the 3→4 advance stores the id; the rebuild path stores one; an out-of-pool id is refused by name; 200 shards debited exactly once; a stage-4 effect cannot be swapped in place (FR-009). **Go through the real write path — no hand-inserted rows.**

### The Forge

- [X] **T024** [US1] Add the stage-4 step to the Forge in `apps/client/src/features/forge/` — offer the pool for that slot by importing `RUNE_EFFECTS` and `poolOf` from `@lmntlz/sim/rules` and filtering by the `element` that `GET /v1/me/runes` already returns. **No client copy of the catalog** (Constitution XIII).
- [X] **T025** [US1] Send the chosen `utility` id on commit from `apps/client/src/features/forge/`, and surface the four new refusals as readable messages rather than a generic failure.
- [X] **T026** [P] [US1] Add `apps/client/tests/forge/stageFour.test.tsx` — the right pool is offered per slot, selecting is free and reversible until commit (FR-010), and committing sends the id.

### Wiring

- [X] **T027** [US1] **WIRING** — `apps/api/src/battle/board.ts` populates `HeroState.runeEffects` from the snapshot's existing `RuneLoadout.utility`, and **throws loudly** on an id absent from the catalog (FR-021, R-16). An absent loadout still means none (Constitution XVI).
- [X] **T028** [US1] **WIRING** — prove the chain end to end in `apps/api/tests/battle/runeEffects.test.ts`: buy → snapshot → `HeroState.runeEffects` → effect fires in a resolved battle. Mutation-check by restoring `utilityEffect: null` at `runes.ts:377` and confirming the store assertion fails. *That null is production behaviour today, so the mutant is the live bug.*

**Checkpoint**: ✅ the overcharge is closed. 12 effects live and a player can buy one.
sim 578 · apps/api 1185 (6 pre-existing matchmaking) · client 1045 · client build clean.
Water still empty and seven pools hold one — that is US2.

---

## Phase 3 — US2 (P2): the designed catalog, via 9 hook-surface changes

**Goal**: all 33 effects exist. Without this, **Water holds zero** and seven of the
ten pools hold exactly one — the *"fixed single effect per pool"* outcome the
design named as the one to avoid.

**Independent test**: for each of the 17, a battle where the condition is met and
the authored consequence is observable.

### Hook-surface changes

- [X] **T029** [US2] Give the `shapeIncoming` and `shapeOutgoing` **callbacks** a `StatContext` second argument in `packages/sim/rules/passives.ts`. The exported wrappers already hold the hero (`:1513`, `:1525`) and simply do not pass it down. Unblocks both wards and both cleanse-immunity effects.
- [X] **T030** [P] [US2] Allow `PassiveHooks.targeting` to take a predicate form `(ctx: StatContext) => TargetingFlags` alongside today's static object, in `packages/sim/rules/passives.ts`. Needed by `No One Saw`, which is gated below 50% HP.
- [X] **T031** [P] [US2] Add the `'damage'` and `'cleanse'` kinds to `PassiveEffect` in `packages/sim/rules/passives.ts` and fold them in `applyPassiveEffects`. Both are ordered by the existing `EFFECT_ORDER` because **each can kill** (FR-019).
- [X] **T032** [P] [US2] Add `healMultiplier?: (ctx) => number` to `PassiveHooks` and read it in `healPreview` in `packages/sim/rules/damage.ts:369` — which reads no hooks today, so this is an insertion rather than a refactor. Both directions: healing *received* and a reduction placed by an attacker.
- [X] **T033** [P] [US2] Add `critImmune` and `critDowngrade` to `PassiveHooks` and read them in the crit path in `packages/sim/rules/damage.ts`.
- [X] **T034** [P] [US2] Add `ignoresShields?: boolean` to `PassiveHooks` and read it in `spendShield` in `packages/sim/rules/damage.ts:312`.
- [X] **T035** [P] [US2] Add `hitFloor?: (ctx: StrikeContext) => number | null` to `PassiveHooks` and read it in `packages/sim/rules/probability.ts`. **This is the one narrow exception to the 65–95% clamp** (spec A-02) — document it at the clamp, where a reader will look.
- [X] **T036** [US2] Set `HeroState.hasActed` when a hero takes its first turn, in `packages/sim/resolver/resolve.ts`. Needed only by `Before It Knew`.
- [X] **T037** [US2] Add the **bounded** extra action in `packages/sim/resolver/resolve.ts` — one extra, and an extra cannot itself grant another (spec A-04, FR-020). Add the re-tick pass for damage-over-time on the acting hero's upkeep.

### The 17 effects

- [X] **T038** [US2] Implement `Before the First Blow` — the battle-start shield resolves in `apps/api/src/battle/board.ts`, beside where Toughness runes already resolve eagerly before `maxHp`. **No `onBattleStart` hook is needed** ([research.md](./research.md) Decision 2).
- [X] **T039** [US2] Implement the two wards in `packages/sim/rules/runeEffects.ts`: `Not This Time` (ignore the first Stun **or Silence** — a named class, not whatever lands first) and `Turned Aside` (first crit lands as a normal hit). Both express *once per battle* by returning the effects that pay for it, as `lethalGuard` already does — **no new field on `HeroState`**.
- [X] **T040** [US2] Implement the **Water pool** in `packages/sim/rules/runeEffects.ts` — `Runs Dry`, `It Passes Through`, `Draws It Up`. This is the pool that is empty without US2.
- [X] **T041** [US2] Implement `All One Piece` (Earth), `On the Same Breath` (Air), `Too Close` and `The Draft` (Fire) in `packages/sim/rules/runeEffects.ts`.
- [X] **T042** [US2] Implement `Held in the Light` and `The Lamp Lifted` (Light), `Before It Knew` and `No One Saw` (Dark) in `packages/sim/rules/runeEffects.ts`.
- [X] **T043** [US2] Implement `It Stays Open` (Slash), `Straight Past` (Pierce), `Stays Broken` (Crush) in `packages/sim/rules/runeEffects.ts`.

### Tests

- [X] **T044** [P] [US2] Extend `packages/sim/tests/rules/runeEffects.test.ts` with behaviour cases for all 17, including the ward spent-then-second-lands case (FR-015) and `Too Close` reflecting into a 1-HP attacker (ordering, FR-019).
- [X] **T045** [P] [US2] Add the counter-pair precedence cases — `Nowhere to Stand` versus `No One Saw`, and `Straight Past` versus `Before the First Blow`. Assert the negating effect wins (spec A-05) so the order is a rule rather than an accident of evaluation.
- [X] **T046** [P] [US2] Add the pool-completeness assertion to `packages/sim/tests/rules/runeEffects.test.ts`: **every pool offers its designed count**, with Water explicitly at 3. This is the test that would have caught the US1-only state.

### Wiring

- [X] **T047** [US2] **WIRING** — confirm every new hook is actually read: for each of the 9 surface changes, `rg` its symbol in `packages/sim` and assert a non-test, non-export call site. Add this as a source-scanning test in `packages/sim/tests/rules/hookReach.test.ts`, **derived from `Object.keys` of the hook interface**, not a hand-written list. *A declared hook with no collector is exactly how 14 passives read as inert in 020.*

**Corrections found while building, recorded rather than silently absorbed:**

| Task | Said | Is |
|---|---|---|
| T032 | one hook, `healMultiplier` | **two** — `Runs Dry` says *"next heal"*, and spending a charge needs `onHealed` as well. `healMultiplierFor` scans every standing hero, like `cooldownExtensionFor`, because the two effects sit on opposite sides of the heal |
| T034 | `spendShield` at `damage.ts:312` | the function is `absorb`. The flag is a **required** third parameter, not a defaulted one — a default nobody overrides is how this repo has shipped inert seams before |
| T035 | `hitFloor?: (ctx: StrikeContext)` | `ContestContext` — `hitProbability` is asked long before a power is chosen, so a hook needing `power` could not be read there |
| T036/T037 | `packages/sim/resolver/resolve.ts` | **`apps/api/src/battle/turnLoop.ts`.** `resolveOne` touches only HP; the turn loop owns Resolution, the accumulator and the Upkeep, and it lives in `apps/api` |
| T037 | *"re-tick pass for damage-over-time on the acting hero's upkeep"* | needed **no new hook** — `The Draft` returns `damage` effects from the existing `onUpkeep`, restricted to its own source by `upkeepDamageFrom` |
| T047 | scan for each hook's symbol in `packages/sim` | split in two: the sim half parses the hook names **out of the interface** and proves each is read; the API half proves each *reader* has a caller, because the callers are split across both trees |

**Three things this phase moved to keep one implementation of a rule:**
`mightOf` and `packetOf` into `state.ts` (`runeEffects.ts` cannot import a value from
`damage.ts` or `passives.ts` without a module cycle) · `upkeepDamage` now delegates to
`upkeepDamageFrom` · `slotAccepts` already delegated to `poolOf` in US1.

**Checkpoint**: ✅ 29 of 33 effects live and every pool is full but the four US3 owes.
sim + content **646** · apps/api battle **15** on the rune guards · client typecheck and
build clean. `engineVersion` **unchanged at e0.5.0** — US2 adds no draws.

---

## Phase 4 — US3 (P3): the four dice-rollers, behind the version gate

**Goal**: `Take It Back`, `Both Ways`, `Knocked Loose` and `Further Than It Looks`
work, with every added draw accounted for and the past untouched.

**Independent test**: a fixed seed resolves identically a thousand times with all
four live; a battle recorded at `e0.5.0` replays to the outcome it was fought with.

- [ ] **T048** [US3] Implement `Take It Back` (25% per attack, strip one active buff) and `Knocked Loose` (15% per attack, stun **routed through the existing potency-versus-`Resolve` contest**, not a parallel one — FR-018) in `packages/sim/rules/runeEffects.ts`.
- [ ] **T049** [US3] Implement `Both Ways` (25% when struck → bleed the attacker) in `packages/sim/rules/runeEffects.ts`. *This is the fourth probabilistic effect; the feature description originally counted three.*
- [ ] **T050** [US3] Implement `Further Than It Looks` in `packages/sim/rules/runeEffects.ts` — 25% **at turn start** for +1 reach that turn, reading through the existing `reachMod`/reach-bonus path.
- [ ] **T051** [US3] Thread the four draws in `packages/sim/resolver/resolve.ts` at the points named in [research.md](./research.md) Decision 4. **A hero carrying none of the four draws nothing**, which is what keeps existing fixtures green.
- [ ] **T052** [US3] Roll the reach at turn-packet build time and carry `reachGranted` in the packet from `apps/api/src/battle/routes.ts`, so the enlarged target list is what the player is offered. **Server rolls, client displays** (Constitution XII) — a roll at resolution time would change the list after the player chose.
- [ ] **T053** [US3] Bump `engineVersion` `e0.5.0` → `e0.6.0` in `packages/sim/rules/index.ts:308`. **In this commit, not earlier** — US1 and US2 add no draws. The drain-deploy note already exists in `docs/tech-stack.md`; obey it rather than rewriting it.
- [ ] **T054** [P] [US3] Add a determinism fixture that **actually fields all four dice-rolling effects** to `packages/sim/tests/`. Today's fixtures field no runes at all, so the existing suite would prove determinism of a board where nothing rolls. Then run the `determinism`, `drawOrder` and `seedCustody` suites.
- [ ] **T055** [P] [US3] Add `apps/api/tests/battle/turnPacket.test.ts` — assert the **legal target list is larger** when `reachGranted` is set, not merely that the flag is present. A flag with an unchanged list is the failure, and it would pass a presence check.
- [ ] **T056** [US3] **WIRING** — prove the version gate: a stored replay recorded at `e0.5.0` replays to its recorded outcome (`apps/api/tests/replays/`). Mutation-check by moving one draw from before the hit contest to after it — draw order must go red while per-effect behaviour stays green.

**Checkpoint**: all 33 live. ⚠️ **The deploy from here must DRAIN before the engine bump reaches production.**

---

## Phase 5 — US4 (P4): the player can see what they bought

**Goal**: the effect is described before purchase, visible on the board, and named
in the log when it fires.

- [ ] **T057** [US4] Render each offered effect's condition and consequence in the stage-4 builder in `apps/client/src/features/forge/`, sourced from `RUNE_EFFECTS` — **not retyped client text** (FR-022, Constitution XIII).
- [ ] **T058** [P] [US4] Show an active persistent rune effect on the champion on the battle board in `apps/client/src/features/battle/`, reusing 020's status row rather than inventing a second indicator. **020's disclosure rule applies unchanged** (FR-025).
- [ ] **T059** [P] [US4] Name the effect and what it did in the battle log in `apps/client/src/features/battle/BattleScreen.tsx`, extending the existing rider-description path.
- [ ] **T060** [US4] Add Playwright coverage to `apps/client/e2e/` for the Forge at stage 4 and a battle board with an active rune effect. **Assert element counts before indexing** — never `.first()` on a selector that matches more than one card. *That exact hole let status pips sit on the text of all 12 rail cards past 1,034 unit tests and 3 e2e tests.*
- [ ] **T061** [US4] **WIRING** — take a real screenshot of both surfaces and look at them. `fullPage` does **not** scroll. The screenshot is the instrument; no unit test has ever caught a layout defect on this project.

---

## Phase 6 — Polish & close-out

- [ ] **T062** Run the full gate as **separate calls**, reading each result: `pnpm -r typecheck`, the sim + content suites, the `apps/api` suites, and `pnpm --filter @lmntlz/client build`. **Vitest does not typecheck** — a green suite says nothing about whether the client compiles.
- [ ] **T063** Confirm the matchmaking failure count is still exactly **6** (pre-existing, proven at HEAD). If it differs, prove cause by **stashing and re-running**, never by reasoning about the diff.
- [ ] **T064** Deploy, wait for **READY on both projects**, then prove the deployed code by fetching the production bundle and grepping it for the new effect ids. A push is not a deploy; a SHA is not proof.

---

## Dependencies

```
Phase 1 (T001–T009)  ─── blocks everything
        │
        ├─▶ Phase 2 US1 (T010–T028)   ships alone; closes the overcharge
        │           │
        │           └─▶ Phase 3 US2 (T029–T047)   needs T003/T004 + the write path
        │                       │
        │                       └─▶ Phase 4 US3 (T048–T056)   engineVersion gate
        │                                   │
        └───────────────────────────────────┴─▶ Phase 5 US4 (T057–T061)
                                                        │
                                                        └─▶ Phase 6 (T062–T064)
```

**T003 → T004 → T005 is the critical path.** Everything downstream assumes one
lookup point.

US4 depends only on *some* effects existing, so T057–T059 could start after Phase
2 if a shorter first release is wanted.

## Parallel opportunities

| Phase | Parallel set |
|---|---|
| 1 | T001, T002, T005, T007, T008 (different files) |
| 2 | T015, T016, T017, T018 (test file sections) · T023, T026 |
| 3 | T030–T035 (six independent hook additions) · T044, T045, T046 |
| 4 | T054, T055 |
| 5 | T058, T059 |

**Not parallel**: T010–T014 and T038–T043 all edit `runeEffects.ts`. Same file,
sequential.

## Implementation strategy

**MVP = Phase 1 + Phase 2 (T001–T028).** That alone stops charging players 200
shards for nothing, which is the defect the feature exists to fix. It leaves seven
pools at one effect and Water at zero, so it is a stopgap rather than a
destination — but it is honest, shippable, and adds no RNG draws, so it needs no
engine-version bump and no drain.

Then US2 for the real catalog, US3 behind the version gate, US4 to make it legible.

## Not tasks, deliberately

Recorded so nobody adds them mid-flight:

- **Retuning the 33 magnitudes.** They are sized against a battle 3.6× longer than
  the engine currently produces. T016 keeps the correction a one-file edit.
- **The hero-numbers pass**, reactive powers, the tier-5 Reckoning spender, 019's
  remaining treatments, any displacement mechanic.
- **What existing stage-4 rune rows are owed.** Every one paid 200 shards for
  nothing. Grant, refund or leave is a **product** decision in
  [plan.md](./plan.md) § *Open, deliberately* — and the rows must be **enumerated
  and shown** before anyone reasons about them, never inferred from a predicate.
