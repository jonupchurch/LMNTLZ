# Tasks: Battle

**Input**: Design documents from `/specs/007-battle/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/battle-api.md](contracts/battle-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 4 · **features 002, 003, 004, 005 and 006 complete**

**Tests**: **Included.** The retry test asserts on the **action log**, not the
response — the response looks right in both the correct and the double-advanced
case, which is exactly why the bug survives review.

**Organization**: Grouped by user story, in spec priority order with one
deliberate choice inside it: **US2 first**, because plan.md § Phase 2 puts
idempotency before the loop works end to end. It is a schema constraint, so it is
cheap now and a migration later.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`apps/api/src/battle/`, `apps/api/src/db/schema/`, `apps/client/src/features/battle/`.

> **The two properties that shape every route**: in-progress state is **never
> stored** — it is re-derived from the append-only action log on every request; and
> **the seed never leaves the server**, enforced by the resolver's own type
> boundary rather than by remembering here.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/battle/` and `apps/client/src/features/battle/` and register the `/v1/battles` router in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `battle` test project to `apps/api/vitest.config.ts` and a `battle` Playwright spec directory

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, and the constraint that makes a duplicate impossible rather than detectable

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Define the `battles` table in `apps/api/src/db/schema/battles.ts` — attacker, defender, `defenderIsBot`, zone, seed (server-only), `engine_version`, `content_version`, `build_sha`, `started_at`, `concluded_at`, winner, reason (FR-010)
- [ ] T004 Define `battle_actions` in `apps/api/src/db/schema/battles.ts` with **`PRIMARY KEY (battle_id, sequence)`**, plus `draw_index_before`, `draws_consumed` and `resolved_packet` (research.md Q1)
- [ ] T005 Define the defender snapshot column in `apps/api/src/db/schema/battles.ts` — the frozen squad **and** its per-champion configuration, so a mid-battle edit cannot reach it (FR-001)
- [ ] T006 Generate and apply the battles migration from `apps/api/drizzle/`
- [ ] T007 Add an abandonment counter to the account in `apps/api/src/db/schema/accounts.ts` — **not a battle row**, because recording *that* a battle was abandoned is not the same as recording a battle, and only the second would pollute the aggregates Constitution XVI protects

**Checkpoint**: The log is the only in-progress state, and its uniqueness is enforced by the database

---

## Phase 3: User Story 2 - The same action never resolves twice (Priority: P1) 🎯 the property everything rests on

**Goal**: A dropped connection and a retry advance the battle once, not twice.

**Independent Test**: Submit the same intent repeatedly, including concurrently, and confirm the log grows by exactly one entry and the same packet is returned each time.

### Tests for User Story 2 ⚠️

- [ ] T008 [US2] Write `apps/api/tests/battle/idempotency.test.ts` from the quickstart ladder — `act(3)` gives packet P; `act(3)` again with the **same** body gives P **byte-identical**; `act(3)` again with a **different** body **still** gives P; `act(5)` skipping 4 gives `409` with `currentSequence: 4`

> **Line 3 is the one that catches a half-implementation.** Once `(battleId, 3)`
> exists the **stored** packet is returned and the request body is irrelevant. An
> implementation that recomputes on conflict passes lines 1–2 and fails line 3.

- [ ] T009 [P] [US2] Write the connection-kill case in `apps/api/tests/battle/idempotency.test.ts` — send `act(3)`, destroy the socket before the response, re-read state, resubmit, and **assert on the action log**: `SELECT count(*) FROM battle_actions WHERE battle_id = ? AND sequence = 3` is exactly **1**
- [ ] T010 [P] [US2] Write the concurrency case in `apps/api/tests/battle/idempotency.test.ts` — two identical submissions arriving simultaneously append exactly one entry (SC-004)

### Implementation for User Story 2

- [ ] T011 [US2] Implement `appendAction` in `apps/api/src/battle/idempotency.ts` as `INSERT … ON CONFLICT (battle_id, sequence) DO NOTHING RETURNING resolved_packet` — a row means first write; **no row means SELECT the stored packet and return that**
- [ ] T012 [US2] **Return the stored packet, never a recomputed one**, in `apps/api/src/battle/idempotency.ts` — recomputing would be correct *by argument*; returning the stored one is correct *by construction*, and it survives a version change between the two calls
- [ ] T013 [US2] Reject a skipped sequence in `apps/api/src/battle/idempotency.ts` — `sequence` must be exactly `max + 1`, and a gap returns `409` with `currentSequence` so the client resynchronises by re-reading

**Checkpoint**: A duplicate is a constraint violation, not a race to detect. There is no window between a check and a write.

---

## Phase 4: User Story 1 - A player fights a battle (Priority: P1)

**Goal**: Pick a target, act each turn, see everything that followed, until a winner.

**Independent Test**: Fight a battle start to finish and confirm it resolves with a winner, correct rewards and a recorded result.

### Tests for User Story 1 ⚠️

- [ ] T014 [P] [US1] Write `apps/api/tests/battle/goldenPath.test.ts` — start, act to conclusion, and **count the `act` calls: expect 20–40** (SC-001). Over ~45 means the packet boundary is too fine; under ~15 is worse, because turns that carried a decision are being folded and **the player is not being asked**
- [ ] T015 [P] [US1] Write `apps/api/tests/battle/noStoredState.test.ts` — play three actions, **restart the API process entirely**, re-read state, and assert it is identical. Plus a source scan for any table, cache key or in-memory map holding mid-battle state (SC-002)
- [ ] T016 [P] [US1] Write `apps/api/tests/battle/snapshot.test.ts` — a defender editing their squad mid-battle **never** affects the battle in progress (SC-009)
- [ ] T017 [P] [US1] Write `apps/api/tests/battle/seedBoundary.test.ts` — capture every response body across a full battle and assert none contains `seed`, `drawIndexBefore` or `drawsConsumed`, then search the serialised responses for **the actual seed bytes** from the database row

### Implementation for User Story 1

- [ ] T018 [US1] Implement `POST /v1/battles` in `apps/api/src/battle/create.ts` — snapshot the defender's squad and configuration, mint the seed via feature 003's `createSeed()`, stamp `engineVersion`, `contentVersion` and `buildSha`
- [ ] T019 [US1] **Decide the zone server-side** in `apps/api/src/battle/create.ts` — a client cannot request `hidden` and the field is **absent from the request body**, so a Hidden battle happens only by ambush rolled against the displayed chance. Enforcement by absence
- [ ] T020 [US1] Implement `currentState(battleId)` in `apps/api/src/battle/act.ts` — **re-derived from the log on every call**, returning `expired` or `versionMismatch` rather than a state when either applies (FR-007)
- [ ] T021 [US1] Implement `isChoicePoint(state, instanceId)` in `apps/api/src/battle/act.ts` — a choice exists **iff** the actor has more than one available power **or** the chosen power has more than one legal target (research.md Q3)
- [ ] T022 [US1] Implement `resolveToNextChoice(seed, log)` in `apps/api/src/battle/act.ts` — resolving forward through every forced turn and **every engine turn** until `isChoicePoint` or conclusion (FR-003)
- [ ] T023 [US1] Implement `POST /v1/battles/:battleId/act` in `apps/api/src/battle/routes.ts` with the full status table — `200` (resolved **or replayed; the two are indistinguishable by design**), `409`, `410`, `422`, `503`
- [ ] T024 [US1] Refuse an illegal intent with a reason and **append nothing** in `apps/api/src/battle/act.ts` — power on cooldown, target out of reach, or not this hero's turn (FR-005)
- [ ] T025 [US1] Implement `GET /v1/battles/:battleId` in `apps/api/src/battle/routes.ts` as the resynchronisation route after a `409`, re-derived every call and **never** carrying the seed or draw indices
- [ ] T026 [US1] Implement `settle` in `apps/api/src/battle/settle.ts` — outcome, rating, streaks and rewards applied **exactly once**, kept **separate from `act.ts`** because folding settlement into the action path is how a battle pays out twice (FR-012)
- [ ] T027 [US1] Make settlement **atomic** in `apps/api/src/battle/settle.ts` — one transaction covering `battles.concluded_at`/`winner`/`reason`, the **battle metadata row**, the shard award, the rating update, the ambush counter and the hold streak; with the replay blob written **outside** it
- [ ] T028 [P] [US1] Build `apps/client/src/features/battle/BattleScreen.tsx` — renders the returned packet and **decides nothing** (FR-004)
- [ ] T029 [P] [US1] Build `apps/client/src/features/battle/TurnQueue.tsx` projecting locally from `@lmntlz/sim/rules` — no request

> **T027's split is the point.** A battle that settles but fails to record is
> invisible to every aggregate, and **the aggregate is the entire analytics
> product**. A failed blob costs one replay; a failed metadata row costs a
> permanent hole in the history the first balance pass reads.

**Checkpoint**: The game is playable end to end and its result is recorded.

---

## Phase 5: User Story 3 - Latency is hidden, never waited on (Priority: P2)

**Goal**: The wind-up begins on the click, and the result arrives before the impact frame.

**Independent Test**: Confirm the client begins animating on click rather than on response, and that no animation blocks on the network.

### Tests for User Story 3 ⚠️

- [ ] T030 [P] [US3] Write `apps/client/tests/battle/useIntent.test.tsx` — the request fires **and** the wind-up starts on the same click; a delayed response waits at a natural point rather than freezing mid-motion; a response contradicting the optimistic display is **what gets shown** (SC-008)

### Implementation for User Story 3

- [ ] T031 [US3] Build `apps/client/src/features/battle/useIntent.ts` — firing the request and starting the wind-up **together on click**, never on response (FR-018)
- [ ] T032 [US3] Add the natural wait point before the impact frame in `apps/client/src/features/battle/BattleScreen.tsx` — no animation blocks on the network (FR-019)
- [ ] T033 [US3] Reconcile to the server's version wherever the optimistic display disagrees, in `apps/client/src/features/battle/BattleScreen.tsx` (FR-020)
- [ ] T034 [US3] Play the whole packet out client-side at its own pace in `apps/client/src/features/battle/BattleScreen.tsx` — **never round-trip on an animation**, and a player who alt-tabs mid-packet loses nothing because the server already resolved it

**Checkpoint**: A server-authoritative game that reads as responsive.

---

## Phase 6: User Story 4 - A maintenance window costs a player nothing (Priority: P2)

**Goal**: In-flight battles finish; anything that cannot is refunded completely.

**Independent Test**: Enter `draining` with battles in flight; confirm no new battles start, in-flight ones complete, and any discarded battle is a complete no-op.

### Tests for User Story 4 ⚠️

> **Test the discard refund explicitly.** FR-016 covers rating, rewards **and** the
> attempt; a partial implementation that refunds two of three is the exact support
> ticket the rule exists to prevent.

- [ ] T035 [US4] Write `apps/api/tests/battle/maintenance.test.ts` — `live` accepts; `draining` refuses `POST /v1/battles` with `503` **while `act` on an open battle still returns `200`**; `down` refuses both
- [ ] T036 [P] [US4] Write `apps/api/tests/battle/discard.test.ts` — a discarded battle leaves **no battle record, no shard movement, no rating movement, no ambush-streak change and no hold-streak change**, and refunds whatever it cost to start (SC-005)

### Implementation for User Story 4

- [ ] T037 [US4] Implement the three-state check in `apps/api/src/battle/maintenance.ts` reading feature 016's flag — `live` · `draining` · `down` (FR-015)
- [ ] T038 [US4] Implement the discard as a **complete no-op with a refund** in `apps/api/src/battle/settle.ts` (FR-016)
- [ ] T039 [US4] Report an engine-version mismatch rather than resolving it, in `apps/api/src/battle/act.ts` — feature 003's `reDerive` returns `VersionMismatch` and this route surfaces it (FR-017)

**Checkpoint**: A deploy window generates no support tickets.

---

## Phase 7: User Story 5 - A battle always ends (Priority: P2)

**Goal**: No battle stays open forever, by stalemate or by walking away.

**Independent Test**: Construct a stalemate and confirm the cap resolves it; abandon a battle and confirm it does not remain open indefinitely.

### Tests for User Story 5 ⚠️

- [ ] T040 [P] [US5] Write `apps/api/tests/battle/expiry.test.ts` — start a battle, act twice, advance the clock past 24 h, run the expiry job, and confirm `act` returns `410` with **nothing recorded** except the account's abandonment counter incrementing by 1
- [ ] T041 [P] [US5] Write `apps/api/tests/battle/oneAtATime.test.ts` — a second `POST /v1/battles` while one is open returns `409` carrying `openBattleId`; concluding the first allows a new one
- [ ] T042 [P] [US5] Write `apps/api/tests/battle/cap.test.ts` — a constructed stalemate reaching **300 hero-turns** resolves by pooled HP share and records normally

### Implementation for User Story 5

- [ ] T043 [US5] Enforce **one battle open at a time** in `apps/api/src/battle/create.ts` — several open battles lets a player start against many opponents and abandon the ones going badly, which turns the attack-income tiers and the ambush counter into something farmed by selection (research.md Q2)
- [ ] T044 [US5] Return the open battle's id in the `409` from `apps/api/src/battle/create.ts`, so **"resume" needs no separate concept**
- [ ] T045 [US5] Implement 24-hour expiry as a **discard** in `apps/api/src/battle/settle.ts` — no win, no loss, no shards, no rating movement, no ambush-streak change, **no battle record** (FR-013)
- [ ] T046 [US5] Make the expiry job resumable and safe to re-run in `apps/api/src/battle/expiry.ts`, **driven from Postgres and never from a scan** — the same shape as feature 008's replay cleanup, for the same reason
- [ ] T047 [US5] Make the 24-hour window **config, not a constant** in `apps/api/src/battle/expiry.ts`

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T048 **Instrument replay cost from day one** — record replay duration alongside `turnCount` in `apps/api/src/battle/act.ts`. It costs nothing to add now and it is what will tell you whether the no-stored-state decision is still correct (plan.md § Phase 2)
- [ ] T049 Write the conclusion-atomicity test in `apps/api/tests/battle/settle.test.ts` — force the metadata-row insert to fail and assert **the whole transaction rolled back**, no shards awarded, no rating movement, and **the battle is still playable** so the client can retry the final action
- [ ] T050 [P] Write `apps/api/src/battle/README.md` — the log-is-the-state property, the packet boundary rule, and the standing note that replay cost is the number to watch
- [ ] T051 Add the Playwright golden path in `apps/client/e2e/battle.spec.ts` — start, fight to conclusion, and kill the connection mid-action to confirm the retry does not double-advance
- [ ] T052 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 002–006
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US2 (Phase 3)**: Foundational only. **Sequenced first** — it is a schema constraint
- **US1 (Phase 4)**: needs `appendAction` (T011)
- **US3 (Phase 5)**: needs `act` returning packets (T023)
- **US4 (Phase 6)**: needs `settle` (T026)
- **US5 (Phase 7)**: needs `create` (T018) and `settle` (T026)
- **Polish (Phase 8)**: depends on US1, US2 and US5

### User Story Dependencies

- **US2 (P1)**: none
- **US1 (P1)**: US2
- **US3 (P2)**: US1 — but **the client work can start against a stubbed packet**
- **US4 (P2)**: US1's settlement path
- **US5 (P2)**: US1

### Within Each User Story

- Tests written and **failing** before implementation
- **Idempotency first, before the loop works end to end**
- create + snapshot → replay path → act → settle → maintenance states

### Parallel Opportunities

- T014, T015, T016, T017 in parallel — four test files
- T028, T029 alongside the server work in US1, against fixture packets
- **US3's client work in parallel with US4 and US5** — different apps entirely
- T040, T041, T042 in parallel

---

## Parallel Example: User Story 1

```bash
# Four independent test files, all red first:
Task: "goldenPath.test.ts — count the act calls, expect 20-40"
Task: "noStoredState.test.ts — restart the process, state identical"
Task: "snapshot.test.ts — a mid-battle edit never reaches the battle"
Task: "seedBoundary.test.ts — search responses for the actual seed bytes"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

Idempotency and the loop are the game. Stop after Phase 4 and validate: a full
battle in 20–40 requests, a cold API restart returning identical state, and a
killed connection that advances the log exactly once.

1. Phase 1–2: schema, and the `(battle_id, sequence)` primary key
2. Phase 3: US2 — **the constraint before the loop**
3. Phase 4: US1 — **STOP and VALIDATE** the request count and the cold restart
4. Phases 5–7: presentation, maintenance, termination

### Incremental Delivery

US4 and US5 both protect the player from the system rather than adding capability.
Neither can be deferred past the first real deploy — `draining` is the entire
reason a window costs nothing.

---

## Notes

- **The request count is a prediction, not a measurement.** 20–40 implies 40–80% of
  player turns present a real choice. **`turnCount` against action-log length
  answers it with no new field** — the field Constitution XVI already makes
  mandatory. Check it against the first real battles.
- **Replay cost is roughly linear per action** and the 300-turn cap is what bounds
  it. This is the one condition under which the no-stored-state decision stops
  being correct, which is why T048 instruments it from day one.
- **What happens to an in-flight battle on a version change is not settled here.**
  Discard is almost certainly right — it matches the abandonment and maintenance
  answers — but it needs feature 016's tooling to be observable.
- **There is no surrender or flee.** The player commands offense and the engine runs
  every defense, so there is nobody on the other side to concede.
- Commit after each task or logical group; work goes straight to `main`.
