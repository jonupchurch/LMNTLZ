# Tasks: The Client Halves — Forge, Store and Replays

**Input**: Design documents from `/specs/018-client-halves/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/runes-read.md](contracts/runes-read.md) ·
[quickstart.md](quickstart.md) · **017 complete** · **011 Phase 8 complete before US2**

**Tests**: **Included.** Every screen here sits over a backend with a full suite
already, so the new tests are about **reachability and refusal** — that a player can
do the thing, and that the two irreversible actions (destroying a rune, spending
money) refuse before they charge.

> ### The acceptance test is the audit that found these gaps
>
> ```bash
> py tools/gap-audit.py     # 16 gaps on 2026-07-30
> ```
> When 018 is done, five routes must be gone from its output: `/catalog`,
> `/checkout`, `/me/entitlements`, `/heroes/:id/runes/:slot`, `/replays/:id`.

---

## Phase 1: Setup

- [X] T001 [P] Create `apps/client/src/features/{forge,store,replays}/` — **`store/` uses the exact path 011 T026 already names**, so that task is satisfied here rather than duplicated
- [X] T002 [P] Create `apps/client/tests/{forge,store,replays}/`
- [X] T003 Add `{ kind: 'forge' }`, `{ kind: 'store' }` and `{ kind: 'replays' }` to the `Screen` union in `apps/client/src/App.tsx` — **entries appear in the rail only as their screens land** (FR-015), matching the store export's `SQUADS · ROSTER · RUNE FORGE · MATCHMAKING · THE COURT · THE STORE · CODEX`

---

## Phase 2: Foundational

**⚠️ US1 is unbuildable without T005–T008.** Nothing reads a rune back today.

- [X] T004 Write the UTC reset rule into `resources/mechanics/06-progression.md` — **the code implements it** (`dayStart()` uses `Date.UTC`) **and serves it** (`today.nextBoundaryAt`), and canon never states it. Constitution XX: a `.dc.html` is not canon, so the rule is written down **before a screen shows it** (research R3)
- [X] T005 [P] Write `apps/api/tests/progression/runesRead.test.ts` — all 27 heroes returned including bare ones, `stage: 0` for empty, `utility: null` below stage 4, and **`allocations` present for the owner**
- [X] T006 Implement the owner serialiser in `apps/api/src/progression/read.ts` — **a new file that shares no code with `apps/api/src/squads/scoutSerializer.ts`** (Constitution XVII; see [contracts/runes-read.md](contracts/runes-read.md))
- [X] T007 Register `GET /v1/me/runes` in `apps/api/src/progression/routes.ts`, session-guarded
- [X] T008 Write `apps/api/tests/squads/scoutBoundary.test.ts` — **after this route ships, the scout response still omits `allocations`.** The temptation is one shared function with an `includeAllocations` flag, and that flag would default wrong exactly once, publishing every player's build

**Checkpoint**: a player's own rune state is readable, and an opponent's still is not.

---

## Phase 3: User Story 1 — A player places a rune (Priority: P1) 🎯 MVP

**Goal**: The Forge — choose a hero and a slot, see what a stage costs and grants,
commit shards, and be told plainly before acting that replacing destroys.

**Independent Test**: Place a rune end to end; the balance falls by the stage cost,
the stat rises by the stage boost, and **gear score moves**.

**Why P1**: the game's entire permanent-progression system and the thing shards
exist for. Until it exists, gear score never changes and **every player stays in
Bronze forever**.

### Tests first

- [X] T009 [P] [US1] Write `apps/client/tests/forge/planning.test.tsx` — **planning charges nothing and stores nothing** (FR-002): move points, navigate away, assert no request was sent
- [X] T010 [P] [US1] Write `apps/client/tests/forge/refusal.test.tsx` — over the **75 cap** and under the balance both refuse **before** any charge, each naming why (FR-004)
- [X] T011 [P] [US1] Write `apps/client/tests/forge/destroy.test.tsx` — the destroy warning appears **before** confirmation, names the consequence, and **is not the default action** (FR-003)

### The screen

- [X] T012 [US1] `features/forge/ForgeScreen.tsx` — hero list with the export's *ALL 27 / OPEN / BARE* filter, over `GET /v1/me/runes`
- [X] T013 [US1] `features/forge/StageLadder.tsx` — the four stages with cost and boost **read from `GET /v1/me/shards` → `config.stageCosts` / `config.stageBoosts`**. Not one number is a literal (FR-001, research R2)
- [X] T014 [US1] `features/forge/SlotPlanner.tsx` — three slots (primary · secondary · common) per `slotAccepts()`, each boost targeting **a distinct stat**, the utility slot **gated behind all three**
- [X] T015 [US1] The stat line — base · placed · draft · total, against **`STAT_CAP` from `@lmntlz/content`**, never a literal 75
- [X] T016 [US1] `features/forge/DestroyConfirm.tsx` — the **650** rebuild, priced from `config.fullRuneCost`, stating that the existing rune is destroyed and rebuilding starts at stage one
- [X] T017 [US1] Commit a stage via `POST /v1/heroes/:heroId/runes/:slot`, then **refetch** rather than patching state from the response
- [X] T018 [US1] Show the balance beside every price, and re-derive it after a commit — the balance is a ledger sum, so a screen that trusts what it rendered with goes stale
- [X] T019 [P] [US1] Write `apps/client/e2e/forge.spec.ts` — place a rune, assert the balance, the stat and gear score all move
- [X] T020 [US1] **WIRING** — render `ForgeScreen` from `App.tsx`, add `RUNE FORGE` to the rail, and give the screen a way out that needs no page reload (FR-016). Assert the caller, then cut it and watch the test fail

**Checkpoint**: a player can spend shards on a rune. Report **two claims
separately** — tasks closed and gates green, and *a player can actually do this*.

---

## Phase 4: User Story 2 — A player buys a pass (Priority: P1)

**Goal**: Seven durations, a completed purchase, and a readout of what is held.

**Independent Test**: With a test rail installed, buy each duration and see the
entitlement appear.

> ### ⛔ HARD PREREQUISITE: 011 Phase 8 (T045–T049)
>
> **The boost pass currently does nothing.** `awardShards()` computes
> `base × zone × dailyTier × starter` and never reads the entitlement, so a bought
> pass pays exactly normal income. **Do not ship this screen before that is fixed** —
> a store selling a pass that pays nothing is worse than no store, because unlike
> the missing adapter it fails silently and takes the money.
>
> **Paddle itself is not a blocker** (research R5). `PaymentRail` is injected, so
> everything below builds and tests against a test rail. Only a live card waits.

### Tests first

- [X] T021 [P] [US2] Write `apps/client/tests/store/catalog.test.tsx` — all seven durations render **from `GET /v1/catalog`**, and no price is hardcoded
- [X] T022 [P] [US2] Write `apps/client/tests/store/noRail.test.tsx` — with **no rail installed** the store says purchasing is unavailable and **offers no control that would fail on click** (FR-009)
- [X] T023 [P] [US2] Write `apps/client/tests/store/ceiling.test.tsx` — a purchase breaching the spend ceiling is refused **before the rail is reached** (FR-010)

### The screens

- [X] T024 [US2] `features/store/StoreScreen.tsx` — one product, seven durations, per-day pricing, against `LMNTLZ Store.dc.html`
- [X] T025 [US2] Render the pass's own claims from served data, not prose: *double shards on the **first ten** attack victories and first ten defense holds each day* (`06-progression.md`)
- [X] T026 [US2] Render the daily reset from **`today.nextBoundaryAt`**, never the string `00:00 UTC` — `config.ts` serves an absolute instant precisely so a per-player boundary would not change the API shape (research R3)
- [X] T027 [US2] `features/store/Checkout.tsx` — **the statement descriptor adjacent to the pay control and not in a footer** (FR-007). This satisfies **011 T026**
- [X] T028 [US2] Show stacking honestly: buying while active **adds to the end date**; show *ends now* and *ends after purchase* as the export does
- [X] T029 [US2] `features/store/Entitlements.tsx` — what the player holds and when it ends, from `GET /v1/me/entitlements`
- [X] T030 [US2] Call `POST /v1/checkout` and handle every outcome, including `NoRailError` as an unavailability state rather than an error page
- [X] T031 [P] [US2] Write `apps/client/e2e/store.spec.ts` against a test rail — buy, see the entitlement, buy again, see the days add
- [X] T032 [US2] **WIRING** — render `StoreScreen` from `App.tsx`, add `THE STORE` to the rail, and link `Entitlements` from the profile. Assert the caller, then cut it and watch the test fail

**Checkpoint**: a pass can be bought **and it pays**. Do not tick this without T045–T049 of 011.

---

## Phase 5: User Story 3 — A player watches a replay (Priority: P2)

**Goal**: Open the battle list, pick a fight from the last seven days, watch it.

**Independent Test**: Watch a battle recorded before a balance change and confirm it
plays identically afterwards.

### Tests first

- [X] T033 [P] [US3] Write `apps/client/tests/replays/watchable.test.tsx` — the list uses **the server's `watchable` flag** and never computes expiry from a date (FR-011)
- [X] T034 [P] [US3] Write `apps/client/tests/replays/expired.test.tsx` — an expired replay reads as **"no longer watchable"**, with the outcome and record intact. It must never look deleted (FR-012)

### The screens

- [X] T035 [US3] `features/replays/BattleListScreen.tsx` over `GET /v1/me/battles` — both sides' outcomes, a **WATCH** control only where `watchable`
- [X] T036 [US3] `features/replays/ReplayViewer.tsx` — **drive the existing `BattleScreen` and `TurnQueue` from the stored log** (research R4). No second board, no second turn queue
- [X] T037 [US3] ⛔ **Build no re-simulation path** (FR-014, Constitution XVI, 008 T023). Playback reads events; it never derives one. The client cannot import `@lmntlz/sim/resolver` at all — the ESLint ban and `purity.test.ts` already enforce it, and this task is to **not** work around them
- [X] T038 [US3] Handle `expired` and `unavailable` distinctly from `not-found`, and surface a **non-participant's `404` as "not found"** — never as "forbidden", which would confirm the battle exists (FR-013, Constitution XVII)
- [X] T039 [P] [US3] Write `apps/client/e2e/replays.spec.ts` — watch a battle, then assert playback is byte-identical after a simulated balance change (SC-007)
- [X] T040 [US3] **WIRING** — reach the battle list from **The Court** (it sits beside Battle Record), render `ReplayViewer` from it, and give a finished replay a way out. Assert the caller, then cut it and watch the test fail

> **T036 deviates from research R4, deliberately and with the reason recorded.**
> R4 says to drive `BattleScreen` and `TurnQueue` from the stored log. **The log
> has no `BattleState` in it** — `record.ts` writes `{ events, conclusion }`, and
> both components take a state (`TurnQueue` projects from `accumulator`; the
> board needs `maxHp` and a `heroId` per seat). An event names its actor by
> *seat*, because `instanceIdOf()` mints ids from side and seat.
>
> So the viewer plays the log by turn and builds **neither** a second board nor a
> second turn queue. Restoring the board means putting the opening state into the
> log, which is a one-field server change **with a disclosure consequence**: it
> would show a defender the attacker's six champions, which nothing else in the
> game reveals. `apps/client/src/features/replays/README.md` states it in full.
> **Open for Jon; it blocks nothing.**

**Checkpoint**: a player can watch a battle back, and a past battle cannot change.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T041 **Run `py tools/gap-audit.py` and confirm the five routes are gone** — `/catalog`, `/checkout`, `/me/entitlements`, `/heroes/:id/runes/:slot`, `/replays/:id` (SC-008). The audit that found them is the test that closes them
- [X] T042 [P] Scan `features/forge/` and `features/store/` for transcribed numbers — every `150`, `200`, `650`, `75`, `20`, `10`, `5` and every price must come from `config.*`, `STAT_CAP` or `/v1/catalog` (SC-002)
- [X] T043 [P] Confirm all three screens use **017's components** — no private button, no colour literal
- [X] T044 [P] Update [`../GAPS.md`](../GAPS.md) — move the five closed routes out of §1 and record the count the audit now reports
- [X] T045 [P] Write `apps/api/src/progression/README.md` — why the owner and scout rune views are two serialisers and must stay two
- [X] T046 **(automated portion)** Run the full [quickstart.md](quickstart.md) pass —
      §0 gap audit ✓ (5 routes gone, 16 → 10) · §1 forge literals ✓ · §2 store prices and
      `00:00 UTC` ✓ · §3 replay date/resolver scans ✓ · §4 scout boundary ✓ (18 tests) ·
      §5 rail, exits and tokens ✓. **Every grep in the quickstart was re-run on
      comment-stripped source**, because three of the four match the prose explaining
      the ban and would otherwise read as violations. The eyes-on walkthrough — placing
      a real rune against a live balance, a sandbox purchase — is still owed and is the
      same outstanding item as 017 T073.

---

## Dependencies

```
017 (component layer) ─┐
                        ├─→ Setup (1) ─→ Foundational (2) ─→ US1 Forge (3) ──┐
011 Phase 8 (boost) ───┼──────────────────────────────────→ US2 Store (4) ──┼─→ Polish (6)
                        └──────────────────────────────────→ US3 Replays (5) ┘
```

- **US1 needs Phase 2** — `GET /v1/me/runes` does not exist yet.
- **US2 needs 011 Phase 8**, and does **not** need Paddle.
- **US3 depends on nothing here** and can run in parallel with either.

## Parallel opportunities

| Phase | Parallel |
|---|---|
| 3 | T009–T011 (tests), then T019 |
| 4 | T021–T023, then T031 |
| 5 | T033, T034, T039 |
| — | **US3 in full, alongside US1 or US2** |
| 6 | T042–T045 |

## Implementation strategy

**MVP is US1.** The Forge is the core loop — shards exist to be spent on runes, and
gear score reads placed runes, so without it the ladder itself is inert.

**US3 is the cheapest and can go any time.** It needs no new route and no
prerequisite outside 017.

**US2 last of the three**, because it waits on 011 Phase 8. Build it against a test
rail; do not wait for Paddle, which is deferred to the end by decision.

---

## Notes

- **No migration, no new table, no new column.** If a task appears to need one, the
  task is wrong.
- **Two irreversible actions live here** — destroying a rune and spending money.
  Both must refuse before they charge, and neither may be the default action.
- **The Rune Forge export is canon-accurate** and needed no discrepancy logged,
  unlike four others in the library. The store export is too, with one rule it
  states that canon did not — closed by T004.
- Commit after each task or logical group; work goes straight to `main`.
