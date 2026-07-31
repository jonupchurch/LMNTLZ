# Tasks: Replays & the Battle Record

**Input**: Design documents from `/specs/008-replays/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/replays-api.md](contracts/replays-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 4 · **features 006 and 007 complete**

> ### ⚠️ US2's client half is not in this list — it is feature 018
>
> **US2 is *"a player watches a recent battle"* and every task below it is
> server-side.** `GET /v1/replays/:id` is implemented, access-controlled and tested,
> and the 2026-07-30 gap audit found **no client caller**: there is no viewer, and
> no task here ever asked for one. The story could never have been delivered by
> this list.
>
> The viewer is [018 US3](../018-client-halves/spec.md). This note stays so nobody
> reads a fully-checked list as a delivered user story. See [`../GAPS.md`](../GAPS.md).

**Tests**: **Included.** The metadata-row test is written as a **schema
assertion**, not field-by-field — a field-by-field test grows a hole the moment
someone adds a column and forgets it.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/replays/`, `apps/api/src/db/schema/`, `apps/api/tests/replays/`.

> **Two objects, deliberately separated.** The **record** is permanent (~200 B, in
> Postgres) and the **replay** expires after 7 days (~5 KB, in a **private** blob
> store). Nothing breaks when a replay expires — the outcome, the rating change and
> the streak all live in the record. Only *watching* has a shelf life.

> **This feature carries the constraint that cannot be retrofitted.** LMNTLZ runs
> no analytics vendor, so **the record *is* the analytics product**, and a field
> missing from the first battle ever written is missing from the history the first
> balance pass reads.

---

## Phase 1: Setup

- [x] T001 **Create the Vercel Blob store as PRIVATE and verify it before writing any other code** — public means "anyone with the URL", which makes a replay URL a permanent bearer capability. **The access mode cannot be changed after store creation**; getting it wrong is a migration of every blob, not a config fix
- [x] T002 Create `apps/api/src/replays/` and register `/v1/replays` and `/v1/me/battles` in `apps/api/src/index.ts`
- [x] T003 [P] Add a `replays` test project to `apps/api/vitest.config.ts`
- [x] T004 Define the blob interface in `apps/api/src/replays/storage.ts` with one implementation — if the provider ever gains lifecycle expiry, `cleanup.ts` becomes a *verification* rather than a mechanism, and that is a change **behind** the interface (Constitution XIX)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The metadata row. **Task one, and it blocks features 009, 010 and 012.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

> **All four unbackfillable field groups land in the first migration. There is no
> later.**

- [x] T005 Define `battle_records` in `apps/api/src/db/schema/battleRecords.ts` with the **complete** column set from the contract — `started_at`, `concluded_at`, `attacker_id`, `defender_id`, `defender_is_bot`, `zone`, `winner`, `reason`, `turn_count`, `attacker_squad`, `defender_squad`, `attacker_league`, `defender_league`, `attacker_rating`, `defender_rating`, `engine_version`, `content_version`, `build_sha`, `replay_blob_url`, `replay_deleted_at`
- [x] T006 Keep `started_at` and `concluded_at` as **wall-clock** columns distinct from `turn_count` in `apps/api/src/db/schema/battleRecords.ts` — `turn_count` is **engine** length and feature 016's drain needs the wall-clock difference. **Check they survive the migration**; the risk is dropping them as redundant
- [x] T007 Keep **three separate version stamps** in `apps/api/src/db/schema/battleRecords.ts` — `engine_version` (rules + generator), `content_version` (the roster), `build_sha` (everything else). A single merged column cannot answer *"did this move because the roster changed or because the engine did"*, which is the first question any balance investigation asks
- [x] T008 Define `replay_holds` in `apps/api/src/db/schema/replayHolds.ts` with `PRIMARY KEY (battle_id, report_id)` — **two reports are two independent holds**, which a boolean flag cannot express
- [x] T009 Generate and apply the records migration from `apps/api/drizzle/`

**Checkpoint**: The analytics product exists, complete, before the first battle is recorded

---

## Phase 3: User Story 1 - The record carries what balance will need (Priority: P1) 🎯 the unretrofittable one

**Goal**: Every design commitment answerable from records alone, with no vendor and no extra instrumentation.

**Independent Test**: Write a battle record and confirm every field is present, then answer each design commitment from records alone.

### Tests for User Story 1 ⚠️

- [x] T010 [US1] Write the metadata-row test in `apps/api/tests/replays/record.test.ts` as a **schema assertion over the full column set**, not as field-by-field checks — so adding a column and forgetting the test **fails loudly** instead of growing a hole
- [x] T011 [P] [US1] Give `defender_is_bot` its own test in `apps/api/tests/replays/record.test.ts` — fight a bot, fight a human, confirm the flag distinguishes them. **It is the field most likely to be dropped as obviously unnecessary**, and without it every aggregate measures our own curation rather than the meta (SC-002)
- [x] T012 [P] [US1] Assert `engine_version ≠ content_version ≠ build_sha` in `apps/api/tests/replays/record.test.ts` on a build where all three genuinely differ
- [x] T013 [P] [US1] Write `apps/api/tests/replays/commitments.test.ts` — answer each design commitment **from records alone**: Visible versus Hidden hold rates, battle length, league thresholds against the real population, and hero pick rates, each with bot defenders excludable (SC-001)

### Implementation for User Story 1

- [x] T014 [US1] Implement `recordBattle(conclusion)` in `apps/api/src/replays/record.ts` — the metadata row **inside** feature 007's conclusion transaction
- [x] T015 [US1] Write the replay blob **after commit**, never inside the transaction, in `apps/api/src/replays/record.ts` — a blob write is a network call to a third party, and holding a Postgres transaction across it turns every Blob latency spike into lock contention on the battles table and a Blob outage into an inability to *finish battles*
- [x] T016 [US1] Handle a failed `put` in `apps/api/src/replays/record.ts` by leaving `replay_blob_url` NULL — one retry on the next request touching the battle, then it stays **unwatchable**, which is the same surface as expiry and needs no new concept

> **T014 and T015 must not share a code path.** A failed metadata row is
> unrecoverable and rolls everything back; a failed blob costs one replay and is
> ignored. An implementation that treats them the same is wrong in one direction
> or the other.

**Checkpoint**: The first recorded battle carries everything the first balance pass will need.

---

## Phase 4: User Story 2 - A player watches a recent battle (Priority: P1)

**Goal**: Recorded packets played back exactly as they happened, regardless of later balance changes.

**Independent Test**: Watch a battle recorded before a balance change and confirm it plays identically afterwards.

### Tests for User Story 2 ⚠️

- [x] T017 [P] [US2] Write `apps/api/tests/replays/playback.test.ts` — a replay recorded before a balance patch plays **identically** after it, and **no simulation runs** during playback (SC-003, SC-004)
- [x] T018 [P] [US2] Write `apps/api/tests/replays/access.test.ts` — a participant gets `200`; a **non-participant gets `404`, not `403`** (do not confirm it exists); a moderator gets a held replay; a non-moderator does not; **an unauthenticated request to the raw blob URL is blocked**
- [x] T019 [P] [US2] Write `apps/api/tests/replays/list.test.ts` — most recent **50** with a `watchable` flag per entry, and the flag correctly covering **expired · held · deleted · never-written**

> **T018's last line is the private-store check.** If it succeeds, the store was
> created public and a replay URL is a permanent bearer capability.

### Implementation for User Story 2

- [x] T020 [US2] Implement `listBattles(accountId)` in `apps/api/src/replays/read.ts` — most recent 50, **`watchable` per entry**, because letting a client discover expiry by *failing to open a replay* is exactly the behaviour FR-013 exists to prevent
- [x] T021 [US2] Implement `GET /v1/me/battles` in `apps/api/src/replays/routes.ts` — showing both sides' outcomes and **never** the defender's composition (Constitution XVII)
- [x] T022 [US2] Implement `getReplay(battleId, requesterId)` in `apps/api/src/replays/read.ts` — served **through a Function** from the private store, with `410` carrying `{ reason: 'expired' | 'unavailable' }`
- [x] T023 [US2] **Build no re-simulation path** in `apps/api/src/replays/read.ts`. The seed is stored for investigation only. The moment a replay endpoint can re-derive, someone will use it as a fallback for an expired replay and **a balance patch will change a past result**

**Checkpoint**: The immutability guarantee is kept structurally — there is nothing to recompute with.

---

## Phase 5: User Story 3 - Storage stops growing with time (Priority: P2)

**Goal**: The bill tracks how many people play, not how long the game has been running.

**Independent Test**: Run past the retention window and confirm steady-state storage is 7× the daily rate rather than an accumulating pile.

### Tests for User Story 3 ⚠️

> **Write `expiredButUndeletedCount` alongside `cleanupExpired`, not after.** It is
> the detector for the failure mode where cleanup silently stops, and a detector
> added later is written by someone who has not yet seen the failure.

- [x] T024 [US3] Write `apps/api/tests/replays/cleanup.test.ts` — deletes blobs older than 7 days; leaves every `battle_records` row untouched; **safe to run twice**; **resumable** when killed mid-batch, with no double-delete and no skipped rows
- [x] T025 [P] [US3] Add the automated grep to `apps/api/tests/replays/cleanup.test.ts` — `rg "\blist\(" apps/api/src/jobs apps/api/src/replays apps/admin` **must return nothing**
- [x] T026 [P] [US3] Write the monitoring test in `apps/api/tests/replays/cleanup.test.ts` — stop the job, advance the clock, and confirm `expiredButUndeletedCount()` **grows** (SC-008)

> **`list()` must not appear anywhere in this feature** — not in the job, not in
> monitoring, not in an admin view. **`del()` is free; `list()` is a billed
> advanced operation.** Listing 100k blobs at 1,000/page is 100 billed operations
> per run against zero for the Postgres query. Chosen on correctness grounds; the
> billing model happens to agree.

### Implementation for User Story 3

- [x] T027 [US3] Implement `cleanupExpired(batchSize?)` in `apps/api/src/replays/cleanup.ts` with the contract's SQL — concluded past 7 days, `replay_blob_url` not null, `replay_deleted_at` null, and **no open retention hold**. Batched, resumable, idempotent, **driven entirely from Postgres**
- [x] T028 [US3] Implement `expiredButUndeletedCount()` in `apps/api/src/replays/cleanup.ts` — the monitoring signal alarms on **observed state**, never on the job reporting success (FR-017)
- [ ] T029 [US3] **BLOCKED on feature 016 — `cleanupExpired` is written, batched and tested; only the cron registration is missing, so storage grows until then and `expiredButUndeletedCount()` is what will say so.** Set the cadence to **daily, off-peak** in feature 016's schedule — storage is billed on a monthly average of 15-minute snapshots, so hourly and daily differ by a rounding error. Cadence is an operational choice, not a cost one
- [x] T030 [US3] Ensure deleting a replay never alters its record, in `apps/api/src/replays/cleanup.ts` — only `replay_blob_url` and `replay_deleted_at` move (FR-018)

**Checkpoint**: Steady-state storage is 7× the daily rate — ~7 GB at 10k daily players, ~70 GB at 100k.

---

## Phase 6: User Story 4 - A reported battle outlives the window (Priority: P2)

**Goal**: Evidence survives a dispute that is longer than the retention window.

**Independent Test**: Attach a report to a battle, pass the window, confirm the replay survives; close the report, confirm it is released.

### Tests for User Story 4 ⚠️

- [x] T031 [US4] Write `apps/api/tests/replays/retention.test.ts` — the six-step ladder: report placed, +8 days survives, report closed, +29 days survives, **+31 days deleted**
- [x] T032 [P] [US4] Add the case a boolean flag cannot express to `apps/api/tests/replays/retention.test.ts` — **two** reports against one battle, close **one**, run cleanup, and the blob survives because the other hold is open

### Implementation for User Story 4

- [x] T033 [US4] Implement `placeHold(battleId, reportId)` in `apps/api/src/replays/retention.ts` — retention becomes `max(7 days from conclusion, 30 days from the report's close)` (research.md Q2)
- [x] T034 [US4] Implement `releaseHold(reportId)` in `apps/api/src/replays/retention.ts` as a **state change, not a delete** — it sets `released_at` and the next cleanup run does the deleting, which keeps deletion in exactly one place and is what makes "safe to re-run" true
- [x] T035 [US4] **Restriction implemented; the moderator exception is not — nothing can grant it until feature 015 builds operator identity, so a held replay past its window is currently readable by nobody. Deliberate direction: 015 adds a grant to an enforced rule rather than discovering the rule was never enforced.** Restrict a held replay to moderators in `apps/api/src/replays/read.ts` — **retaining reported content beyond its normal window is not a licence to publish it** (Constitution XVII)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T036 Write the two atomicity tests in `apps/api/tests/replays/atomicity.test.ts` — a failed `battle_records` INSERT rolls **everything** back with the battle still playable; a failed blob `put()` concludes the battle **normally** with `replay_blob_url` NULL and `watchable: false`
- [x] T037 [P] Add the Constitution XVII assertions to `apps/api/tests/replays/exposure.test.ts` — `defender_squad` is populated, and it appears in **no** response from `GET /v1/me/battles`, **no** CSV export (feature 012) and **no** profile view
- [x] T038 [P] Write `apps/api/src/replays/README.md` — the two lifetimes, the transaction split, and the standing rule that `list()` never appears
- [ ] T039 **PARTIAL — the load-bearing half is done and automated: the store is verified private by an unauthenticated GET (403) in `tests/replays/store.test.ts`, which is the check T018 and the quickstart both name. The remaining walkthrough needs a client surface that does not exist yet (see the note below).** Run the full quickstart manual pass, including the unauthenticated raw-blob-URL check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: **T001 before anything else** — the store's access mode cannot be changed later
- **Foundational (Phase 2)**: depends on Setup — **blocks all four stories, and features 009, 010 and 012**
- **US1 (Phase 3)**: needs feature 007's conclusion transaction
- **US2 (Phase 4)**: needs US1's written artifacts
- **US3 (Phase 5)**: needs US1's records and the hold table (T008)
- **US4 (Phase 6)**: needs US3's cleanup query and feature 015's reports
- **Polish (Phase 7)**: depends on all four

### User Story Dependencies

- **US1 (P1)**: none within this feature
- **US2 (P1)**: US1
- **US3 (P2)**: US1
- **US4 (P2)**: US3 — the hold only means something against a cleanup query

### Within Each User Story

- Tests written and **failing** before implementation
- **The record schema is task one** — it is what blocks three other features
- `expiredButUndeletedCount` alongside `cleanupExpired`, never after

### Parallel Opportunities

- T011, T012, T013 in parallel — different assertions, one test file plus one new
- T017, T018, T019 in parallel — three test files
- **US3 in parallel with US2** — cleanup touches no route
- T025, T026 in parallel

---

## Parallel Example: User Story 2

```bash
# Three independent test files, all red first:
Task: "playback.test.ts — identical after a balance patch, no simulation"
Task: "access.test.ts — 404 not 403, and the raw blob URL is blocked"
Task: "list.test.ts — 50 entries, watchable covers all four cases"
```

---

## Implementation Strategy

### MVP First (US1)

The record is the only thing here that cannot be added later. Stop after Phase 3
and validate against the complete column list — then feature 007 can start writing
real battles without leaving a permanent hole.

1. Phase 1: **the private store, verified first**
2. Phase 2: the record schema — **task one, blocking 009, 010 and 012**
3. Phase 3: US1 — **STOP and VALIDATE** the schema assertion and `defender_is_bot`
4. Phase 4–6: playback, cleanup, retention holds

### Incremental Delivery

US3 is P2 by urgency and near-P1 by cost: nothing in the design deletes a replay
without it, and unbounded retention is 3.65 TB a year at 100k daily players. It
does not have to ship on day one, but it has to ship inside the first week of real
traffic.

---

## Notes

- **No player can reach any of this yet, and that is the third feature in a row
  with the same shape.** This task list is entirely server-side — `GET
  /v1/me/battles` and `GET /v1/replays/:battleId` work, are tested, and have no UI
  in front of them. US2 is *"a player watches a recent battle"*, and today no player
  can.

  It is scoped correctly rather than forgotten: this spec's own Independent Test for
  US2 is satisfiable from the API (`playback.test.ts` does exactly it), and
  **Dependencies names 12 (`profiles`) as the feature that reads records**. So the
  screen belongs to 012, not here.

  Recorded because the pattern has now cost time twice. Feature 006 ended with
  components nothing routed to; 007's task list had the same hole and it was closed
  by `ResumeBattle`, which was not a task either. **The difference here is that
  nothing built in 008 is dead code** — every endpoint is exercised, and 012 is the
  named consumer. If 012 slips, the visible consequence is that the battle history
  a player has been accumulating stays invisible; nothing breaks.

  Worth deciding deliberately whether a minimal battle-list screen lands before 012.
- **Whether 7 days is right is not settled.** It is a cost decision made before any
  usage data exists. `expiredButUndeletedCount` and the watch rate together answer
  it later — if almost nobody opens a replay older than two days, 7 is generous; if
  the Battle Record screen turns out to be how players study opponents, it is short.
- **Replay compression is deliberately deferred.** ~5 KB is an estimate; at 7-day
  retention the total is small enough that compression is not worth the complexity
  until the estimate is checked against real logs.
- **Storing is not exposing.** The row carries both squads; the CSV export drops
  both and the profile never shows a Hidden squad. Those rules live where the data
  leaves the system, and they are not weakened by what is recorded here.
- Commit after each task or logical group; work goes straight to `main`.
