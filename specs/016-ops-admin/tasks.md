# Tasks: Operations & Admin Tooling

**Input**: Design documents from `/specs/016-ops-admin/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/ops-api.md](contracts/ops-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) — reads across all of it ·
**features 005, 007, 008, 011, 013 and 015 complete**

**Tests**: **Included.** Two are type tests rather than runtime tests, deliberately:
`execute` refusing an irreversible action is a **compile error**, and a runtime test
would be testing a branch that should not exist.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/ops/`, `apps/api/src/ops/jobs/`, `apps/admin/` (**deliberately small**).

> **Reversible actions execute; irreversible ones propose.** Matching risk to
> reversibility rather than applying a blanket rule is **what makes this usable at
> all** — a blanket confirm-everything rule makes routine triage tedious enough to be
> avoided; a blanket execute-everything rule puts permanent consequences one mistake
> away.

> **The intended operator may be an agent, not a person at a console.** That is why
> scoping and logging are structural rather than procedural — an agent working
> directly against production has every capability and leaves no record.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/ops/` and `apps/api/src/ops/jobs/`, and register the ops routes in `apps/api/src/index.ts`
- [ ] T002 Scaffold `apps/admin/` — a Vite + React app whose routes are **only** the pending-action queue, the moderation queues (feature 015) and the **avatar** review queue (feature 012, **uploads only**), **and nothing else**. A guild emblem is composed from preconfigured assets and never reaches a queue
- [ ] T003 [P] Add an `ops` test project to `apps/api/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The audit log and the maintenance flag. **The two things needed before any other feature can be operated safely — and the audit log is unreconstructable.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Define `admin_audit` in `apps/api/src/db/schema/audit.ts` — `actor_id`, **`actor_kind` distinguishing human · agent · system**, `action`, `target`, `outcome`, `at`. **Append-only**, with no `UPDATE` and no `DELETE` path
- [ ] T005 Implement `audit()` in `apps/api/src/ops/audit.ts` recording **every** `execute`, `propose`, `confirm`, expiry **and refusal** — **a refusal is a signal, and an unaudited one is a signal that was thrown away** (FR-009, SC-004)
- [ ] T006 Define `ReversibleAction` and `IrreversibleAction` as **distinct types** in `apps/api/src/ops/actions.ts` — the split is expressed in the types, so there is no runtime branch to forget
- [ ] T007 Implement `maintenanceState()` in `apps/api/src/ops/maintenance.ts` reading from **edge config**, holding exactly one of `live` · `draining` · `down` (FR-001, FR-005)
- [ ] T008 Generate and apply the audit migration from `apps/api/drizzle/`

**Checkpoint**: Nothing an operator does is unrecorded, and the one control that must work when deploys are broken is in place

---

## Phase 3: User Story 1 - A deploy costs nobody anything (Priority: P1) 🎯 MVP

**Goal**: In-flight battles finish, new ones are refused, and nobody loses anything they had.

**Independent Test**: Move through all three states with battles in flight and confirm the behaviour and the refunds.

### Tests for User Story 1 ⚠️

- [ ] T009 [US1] Write `apps/api/tests/ops/maintenance.test.ts` — `live` accepts both; `draining` refuses `POST /v1/battles` with `503` **while `act` on an open battle still returns `200`**; `down` refuses both
- [ ] T010 [P] [US1] Add the no-deploy assertion to `apps/api/tests/ops/maintenance.test.ts` — flip the state in edge config and confirm the API picks it up **with no deploy** (SC-002)
- [ ] T011 [P] [US1] Add the discard case to `apps/api/tests/ops/maintenance.test.ts` — a battle still open past the drain window is **discarded as a genuine no-op**: no win, no loss, no shards, no rating, **no record** (SC-001)

> **The drain is an optimisation, not a correctness requirement** — which is what
> makes shipping an unmeasured 15 minutes acceptable. **Assert the discard is a
> genuine no-op, because that is the property the 15 rests on.**

### Implementation for User Story 1

- [ ] T012 [US1] Wire `maintenanceState()` into feature 007's battle routes — `draining` refuses new battles and permits in-flight ones to finish; `down` refuses everything and discards (FR-002, FR-003)
- [ ] T013 [US1] Set the drain duration to **15 minutes as a config value**, labelled in `apps/api/src/ops/config.ts` as *a defensible starting point built on an unmeasured input* rather than as a derived figure
- [ ] T014 [US1] Keep the **engine version mismatch check in place** in feature 007's act path even though the drain policy should prevent it firing — **which is what makes it useful**: if it fires, something genuinely went wrong rather than routinely (FR-006)
- [ ] T015 [US1] **Check that `started_at` and `ended_at` survive into the migration** on `battle_records` — `SELECT started_at, ended_at FROM battle_records LIMIT 1`. Both are already in the shared model; the risk is dropping them as redundant because `turn_count` sits next to them and looks like it covers battle length

> **`turn_count` covers *engine* length. The drain needs *wall-clock* length**, and
> the two differ by however long a player spends thinking. Unbackfillable like
> everything else on that row, so a migration that drops them is a migration that
> makes the drain **permanently unmeasurable**.

**Checkpoint**: A release generates no support tickets from players who did nothing wrong.

---

## Phase 4: User Story 2 - An operator works the queue (Priority: P1)

**Goal**: The most serious cases first, with the risky actions requiring a deliberate second step.

**Independent Test**: Perform one reversible and one irreversible action and confirm the different paths.

### Tests for User Story 2 ⚠️

- [ ] T016 [US2] Write `apps/api/tests/ops/actionSplit.test.ts` as a **type test** — `execute({ kind: 'delete-account', … }, actor)` **must not compile**. FR-008 is enforced by `execute` accepting only `ReversibleAction`, and a runtime test would be testing a branch that should not exist
- [ ] T017 [P] [US2] Add the behavioural ladder to `apps/api/tests/ops/actionSplit.test.ts` — a **timed** ban executes immediately and is audited; a **permanent** ban creates a pending record with **nothing applied** and is audited; `confirm` without the operator credential is `403`; `confirm` with it applies and is audited
- [ ] T018 [US2] Write `apps/api/tests/ops/confirmSurface.test.ts` — take the API token (everything an agent holds), attempt `confirm` with it (`403`), **then attempt it via the admin UI driven by a browser tool with the same token (`403`)**
- [ ] T019 [P] [US2] Add the three supporting rules to `apps/api/tests/ops/confirmSurface.test.ts` — a pending action **expires at 24 hours**; **the proposer cannot be the confirmer**; and **a refused confirm appears in the audit log**
- [ ] T020 [P] [US2] Add the credential scan to `apps/api/tests/ops/confirmSurface.test.ts` — `rg -in "operator|admin_key|ADMIN_TOKEN" .env* apps/api vercel.json .github/` returns **nothing**
- [ ] T021 [P] [US2] Write `apps/api/tests/ops/audit.test.ts` — `rg -n "UPDATE admin_audit|DELETE FROM admin_audit" apps/` returns **nothing**, and `actor_kind` distinguishes human, agent and system

> **T018 step 2 is the one that matters.** *"An agent will not navigate a web page"*
> is not a guarantee — an agent with a browser tool can click a button. **The
> control is a separate credential the tooling never holds**, backed by a **hardware
> key**: a password ends up in a `.env` for convenience at 2am, and a TOTP seed is a
> string an agent can be handed. A hardware key is a physical object that cannot be
> copied into a config file.

### Implementation for User Story 2

- [ ] T022 [US2] Implement `execute(action: ReversibleAction, actorId)` in `apps/api/src/ops/actions.ts` — accepting **only** reversible actions, applying immediately, and auditing (FR-007)
- [ ] T023 [US2] Implement `propose(action: IrreversibleAction, actorId)` in `apps/api/src/ops/pending.ts` — creating a pending record, applying **nothing**, and auditing (FR-008)
- [ ] T024 [US2] Implement `confirm(pendingId, humanActorId)` in `apps/api/src/ops/pending.ts` requiring a session minted from **a different authentication path** — not a role flag on an ordinary session, so **no permission misconfiguration can grant it** (SC-003)
- [ ] T025 [US2] Expire a pending action at **24 hours** in `apps/api/src/ops/pending.ts` — closing the accumulated-backlog-of-pre-approved-destruction bypass (FR-011)
- [ ] T026 [US2] Refuse a confirmation from the proposer in `apps/api/src/ops/pending.ts` — closing the rubber-stamp bypass for an operator holding both credentials
- [ ] T027 [US2] Record the reversible/irreversible line in `apps/api/src/ops/actions.ts` — **reversible**: set maintenance state, issue/lift a mute, issue a **timed** ban, grant shards, comp a pass, discard an in-flight battle. **Irreversible**: delete an account, delete a guild, issue a **permanent** ban, purge a replay early, roll back a migration, **anything touching the battle record**
- [ ] T028 [US2] Scope operator capability in `apps/api/src/ops/actions.ts` — **narrow tools rather than unrestricted access**; an operator tool is not a bypass of the rules (FR-010, Constitution XII)
- [ ] T029 [US2] Prevent or conspicuously log an operator acting on their own account, in `apps/api/src/ops/actions.ts`
- [ ] T030 [P] [US2] Build the pending-action queue and its confirm button in `apps/admin/src/routes/pending.tsx`

> **"Reversible" means reversible *in the product*, not reversible in principle.** A
> timed ban expires on its own; a permanent ban requires another action to undo and,
> more importantly, **the player has already been told**. A granted shard is
> reversible because **the ledger is append-only** — a compensating entry is a
> first-class thing, not a repair. **The battle record is irreversible by
> construction** (Constitution XVI), so nothing touching it is ever in the left column.

**Checkpoint**: Feature 015's policy is enactable, and no irreversible action can be taken without a human.

---

## Phase 5: User Story 3 - Scheduled work runs, and is noticed when it stops (Priority: P2)

**Goal**: Jobs run on schedule, and a silent failure is detected from observed state.

**Independent Test**: Disable a scheduled job and confirm the alarm fires from observed state rather than from the job's own reporting.

> **Build `health()` alongside the first job, not after.** The whole point is
> detecting a job that silently stopped, and **a detector written later is written
> by someone who has not seen the failure**.

### Tests for User Story 3 ⚠️

- [ ] T031 [US3] Write `apps/api/tests/ops/health.test.ts` — stop the replay cleanup job, advance the clock 9 days, and confirm `health()` reports `expiredButUndeletedCount > 0` and **fails** (SC-005)
- [ ] T032 [P] [US3] Add the structural check to `apps/api/tests/ops/health.test.ts` — `rg -in "lastRunAt|lastSuccessAt|heartbeat" apps/api/src/ops` returns **nothing**. **A health check that reads a job's own timestamp reports on a job that is running and says nothing about one that is not**
- [ ] T033 [P] [US3] Write `apps/api/tests/ops/successionTimers.test.ts` — a master past the window causes the outcome to be **surfaced**, with ownership **not transferred**, and completion going through `execute`

### Implementation for User Story 3

- [ ] T034 [US3] Implement `jobs/cleanupReplays.ts` in `apps/api/src/ops/` as the scheduled wrapper around feature 008's `cleanupExpired()` — **query-driven, resumable, safe to re-run**, and **never listing stored files** (FR-012, FR-013, SC-008)
- [ ] T035 [US3] Implement `health()` in `apps/api/src/ops/jobs/health.ts` from **observed state** — `expiredButUndeletedCount` (008), `openBattlesOlderThan24h` (007), `expiredApplicationsStillOpen` (013), `unclassifiedMessagesOlderThan1h` (015), `unreconciledPaymentsOlderThan48h` (011). **Each is a query against the state the job is supposed to maintain** (FR-014)
- [ ] T036 [US3] Implement `jobs/successionTimers.ts` in `apps/api/src/ops/` — it **surfaces an outcome for confirmation and executes nothing**. A job that transfers guild ownership on a timer is an irreversible action running unattended (FR-015)
- [ ] T037 [US3] Register the schedules on platform cron behind an interface — replay cleanup **daily off-peak**, battle expiry, application expiry, payment reconciliation daily, and succession timers

**Checkpoint**: A job that silently stops is caught by the state it failed to maintain.

---

## Phase 6: User Story 4 - A problem in a player's browser is visible (Priority: P2)

**Goal**: A client-side crash reaches us without the player filing a ticket.

**Independent Test**: Trigger a client error and confirm it is reported, grouped and legible.

### Tests for User Story 4 ⚠️

- [ ] T038 [US4] **Break it on purpose** — deploy, throw a deliberate error from a nested client module, and read the trace in the error reporter. It must name **the original file and line**, not `index-a3f9.js:1:48213`. **Silent failure is the normal mode here, because nothing else changes when it breaks**
- [ ] T039 [P] [US4] Assert the maps are not served — `curl -I https://<deployed>/assets/index-*.js.map` returns **404**
- [ ] T040 [P] [US4] Assert the join — the error report's release tag **equals** the battle record's `build_sha` (SC-007)

### Implementation for User Story 4

- [ ] T041 [US4] Configure the client build with `sourcemap: 'hidden'` in `apps/client/vite.config.ts` — emitting maps while omitting the `//# sourceMappingURL` comment, so they are **not served**
- [ ] T042 [US4] Upload the maps to the error reporter tagged with the release, then **delete them from the deployed output**, in the deploy pipeline. **Step three is the one that gets skipped and it is a real disclosure** — `sim/rules` ships to the client and its exact constants are a scouting advantage nobody should get for free (FR-017)
- [ ] T043 [US4] Tag the release with **`buildSha` — the same stamp on the battle record** — so *"which build produced this error, and what were those players fighting under"* is a **join rather than an investigation** (FR-018)
- [ ] T044 [US4] Install the reporter behind an interface for **unhandled client errors with no player action**, and report **server errors to the same place** (FR-016, FR-019, SC-006)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T045 Verify `apps/admin/src/routes` holds **exactly three things** — the pending-action queue, the moderation queues, the avatar review queue — and that `rg -in "emblem" apps/admin/src` returns **nothing**. **Every capability added here is a capability that must then be secured** behind the one credential automation deliberately does not hold, which is a stronger reason to keep it small than build cost is
- [ ] T046 [P] Write `apps/api/src/ops/README.md` — the reversible/irreversible line, the hardware-key argument, and the standing rule that health checks observe rather than self-report
- [ ] T047 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 007, 008, 011, 013, 015
- **Foundational (Phase 2)**: the audit log and the flag — **blocks all four stories**
- **US1 (Phase 3)**: needs feature 007's battle routes
- **US2 (Phase 4)**: needs the action types (T006) and feature 015's actions
- **US3 (Phase 5)**: needs each job's owning feature to expose its state query
- **US4 (Phase 6)**: needs a deployed client
- **Polish (Phase 7)**: depends on US2

### User Story Dependencies

- **US1 (P1)**: none beyond Phase 2
- **US2 (P1)**: none beyond Phase 2 — **fully parallel with US1**
- **US3 (P2)**: US2's `execute`, for succession completion
- **US4 (P2)**: none — **fully parallel with everything**

### Within Each User Story

- Tests written and **failing** before implementation
- **Maintenance and the audit log first** — the audit log is unreconstructable
- **`health()` alongside the first job, never after**

### Parallel Opportunities

- **US4 is fully parallel with everything else** — it touches the build pipeline and the client
- **US1 and US2 are fully parallel** — different modules entirely
- T017, T019, T020, T021 in parallel
- T032, T033 in parallel · T039, T040 in parallel

---

## Parallel Example: User Story 2

```bash
# Five independent assertions, all red first:
Task: "actionSplit.test.ts — the irreversible call must not COMPILE"
Task: "actionSplit.test.ts — timed executes, permanent proposes"
Task: "confirmSurface.test.ts — API token fails, including via a browser tool"
Task: "confirmSurface.test.ts — 24h expiry, no self-confirm, refusals audited"
Task: "audit.test.ts — no UPDATE or DELETE anywhere"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Both are P1 and together they are operations: **a deploy costs nobody anything, and
somebody can act on the queue safely.** Stop after Phase 4 and validate — the flag
flips without a deploy, a discard is a genuine no-op, and `confirm` fails against a
browser-driven agent holding the API token.

1. Phase 2: **the audit log first** — it is unreconstructable
2. Phase 3: US1 — **STOP and VALIDATE** the discard's no-op property
3. Phase 4: US2 — **STOP and VALIDATE** the browser-tool bypass attempt
4. Phase 5–6: scheduled work and error reporting

### Incremental Delivery

**This feature is not on the critical path and should not block anything** — but
**banning a cheater must be possible before the ladder means anything**, so US2
cannot slip past the first competitive week. US4's source maps are a build-config
item that should land with the first deploy, since retrofitting them means every
error before that point is unreadable.

---

## Notes

- **The drain duration's real value is not settled.** 15 minutes rests on a ~3s
  per-hero-turn **estimate** that nobody has measured. **What is genuinely unknown is
  the tail, not the median** — a player who starts a battle and walks away is the case
  that decides the number, and that is a player-behaviour distribution, not a
  simulation one. Re-derive from **p99 `ended_at − started_at`** once feature 008 is
  recording.
- **The appeal surface for bans is not designed.** It belongs in `apps/admin` and
  feature 015's escalation ladder assumes it exists.
- **Alerting destinations and thresholds are operational** and want a running system.
- **`apps/admin` exists and is small — the opposite was claimed earlier and is
  wrong.** Propose-don't-execute *requires* somewhere to confirm. What good tooling
  avoids is the **expensive half** of an admin console — dashboards, search, bulk
  editing — not the whole of it.
- Commit after each task or logical group; work goes straight to `main`.
