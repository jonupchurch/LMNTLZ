# Tasks: Moderation

**Input**: Design documents from `/specs/015-moderation/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/moderation-api.md](contracts/moderation-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § Social models ·
**features 005, 008, 012 and 014 complete**

**Tests**: **Included.** *"The classifier changed nothing"* is the constitutional
property of the feature and is trivial to assert — so it is written early.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/moderation/`, `apps/api/src/operator/`, `workers/classify.ts`,
`apps/api/src/db/schema/`.

> **This feature builds operator identity (T049–T053, Phase 2), because nothing
> else has.** Feature 005 supplies accounts, not moderators — it shipped with no
> role, no permission and no operator concept at all. This is the first feature
> that needs to *authorise* an action, so the mechanism lands here. **An
> environment allowlist mints a separate, short-lived operator token**; no
> moderation route ever accepts a gameplay JWT. The argument is in
> [016's spec](../016-ops-admin/spec.md#operator-identity--settled-2026-07-29-and-05-does-not-supply-it).

> **The governing rule**: *no automated action is ever taken on a message or an
> account. **A model scores; a human decides.*** That is a policy choice first — and
> it happens to be what makes the economics work, because **a flag blocks nothing,
> so latency stops mattering**.

> **The classifier ranks the queue; it does not create it.** At 60,000 messages a
> day a classifier at even **99% specificity produces 600 false flags** — ten times
> the ~60 player reports it was meant to triage. Used to *create* work, it makes
> moderation worse.

> **Nothing in this feature gates anything.** The blocklist belongs to feature 014
> and gates **there**.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/moderation/` and `workers/classify.ts`, and register the moderation routes in `apps/api/src/index.ts`
- [ ] T002 [P] Add a `moderation` test project to `apps/api/vitest.config.ts`
- [ ] T003 Define **two tables, not one with a `category` column**, in `apps/api/src/db/schema/reports.ts` — `reports_harm` (hate · sexual content · threats · impersonation) and `reports_friction` (rudeness · spam · salt)
- [ ] T004 Define `mutes`, `bans` and `moderation_history` in `apps/api/src/db/schema/moderation.ts` — per-account history is what escalation reads
- [ ] T005 Generate and apply the moderation migration from `apps/api/drizzle/`

> **A shared table with a filter is one forgotten `WHERE` from the drowning problem
> the split exists to prevent** — and the failure is silent and asymmetric: a harm
> queue polluted with friction buries the reports that matter under the reports that
> do not, and **it looks like a busy queue rather than like a bug**. Two tables make
> the mistake unrepresentable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Operator identity, a classifier with **no write access**, and an `issueBan` that cannot be called without an actor.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

#### Operator identity — T049–T053, first in build order

> **Numbered out of sequence on purpose.** These five were added on 2026-07-29,
> after this list was generated, when the decision recorded in `spec.md` settled.
> They take the **highest** ids and the **earliest** position because renumbering
> T006–T048 would silently invalidate every task id referenced in *Phase
> Dependencies* below. Read the ids as identifiers, not as order.
>
> **T009 already assumes these exist.** `issueBan` cannot be called without an
> actor — and until an operator can be identified, there is no actor to pass.

- [ ] T049 Define `OPERATOR_ACCOUNT_IDS` parsing in `apps/api/src/operator/allowlist.ts` — a comma-separated env list, **read fresh rather than cached at module load**, so revoking an operator does not wait for a deploy. Follow the fail-closed shape of `battle/maintenance.ts`, inverted: **an unparseable list grants nobody**
- [ ] T050 Define `OperatorCapability` and `mintOperatorToken(accountId, capabilities)` in `apps/api/src/operator/token.ts` — short TTL, scopes on the token, **and no path that produces one from a gameplay JWT alone** (016 FR-010)
- [ ] T051 Add `POST /v1/operator/session` in `apps/api/src/operator/routes.ts` — exchanges a gameplay session for an operator token **only** for an id in the allowlist; **404 rather than 403** for everyone else, matching the battle routes' rule that a refusal must not confirm what it refused
- [ ] T052 Implement `requireOperator(capability)` middleware in `apps/api/src/operator/require.ts` — **takes a capability argument from the first line written**, even while every operator holds every capability. Adding the parameter later means editing every call site; passing it now makes scoping a change to one function
- [ ] T053 Write `apps/api/tests/operator/boundary.test.ts` — a valid **gameplay JWT gets 401 on every moderation route**, an operator token gets through, an expired one does not, and `rg -n "requireAuth" apps/api/src/moderation` returns **nothing**. This is the assertion that cannot be retrofitted: the day one moderation endpoint accepts a player session, a stolen session is permanently full admin

**Checkpoint**: An operator exists, is distinguishable from a player, and no moderation route trusts a gameplay session

#### The classifier and the action boundary

- [ ] T006 Define the `Classifier` interface in `apps/api/src/moderation/classifier.ts` — **batching is an implementation detail**, and the interface returns scores and nothing else (FR-006, Constitution XIX)
- [ ] T007 Give `classify` **no write access to messages at all** in `apps/api/src/moderation/classifier.ts` — FR-003 **by capability rather than by discipline**. The cheapest way to guarantee a model never acts is to give it nothing to act with
- [ ] T008 Define `applyMute(accountId, duration)` and `issueBan(accountId, scope, until, actorId)` in `apps/api/src/moderation/actions.ts` as **separate functions with different signatures** — **a mute has no human-issued variant and a ban has no automatic one**, so no configuration mistake can promote automation into issuing a ban
- [ ] T009 **Provide no `issueBan` overload without an actor** in `apps/api/src/moderation/actions.ts` — FR-012 becomes a **type error** rather than a policy someone has to remember (FR-012)

**Checkpoint**: The model cannot act, and a ban cannot be issued without a human named on it

---

## Phase 3: User Story 1 - A player reports something and it is seen (Priority: P1) 🎯 MVP

**Goal**: A report reaches a queue where the genuinely serious items are at the top, and the score takes no action by itself.

**Independent Test**: File reports of varying severity and confirm the ordering puts genuine hate and NSFW first.

### Tests for User Story 1 ⚠️

> **Write T010 early.** It is the constitutional property of the feature.

- [ ] T010 [US1] Write `apps/api/tests/moderation/noAction.test.ts` — snapshot every message row, run a classifier batch over all of them, diff, and assert **identical, not one byte changed**. Then the version that keeps being true: `rg -n "UPDATE messages|DELETE FROM messages" apps/api/src/moderation workers/` returns **nothing** (SC-001)
- [ ] T011 [P] [US1] Write `apps/api/tests/moderation/noGate.test.ts` — stop the classifier entirely, post in every scope, and confirm **all succeed normally at full speed** (SC-003)
- [ ] T012 [P] [US1] Write `apps/api/tests/moderation/queues.test.ts` — mixed-severity reports rank by score within `harm`, and `rankQueue('friction')` **never** contains a harm report. Then the structural check: `rg -n "reports_harm|reports_friction" apps/api/src` shows **two tables**
- [ ] T013 [P] [US1] Add the reclassification case to `apps/api/tests/moderation/queues.test.ts` — moving a friction report to harm is a **DELETE and an INSERT, not an `UPDATE`**. Moving a report between queues is a decision and should look like one

### Implementation for User Story 1

- [ ] T014 [US1] Implement `report(targetType, targetId, reporterId)` in `apps/api/src/moderation/queue.ts` — routing **once, at report time, from the reporter's chosen category**, with a moderator able to reclassify
- [ ] T015 [US1] Ensure **the classifier's score never routes** in `apps/api/src/moderation/scoring.ts` — it ranks within a queue it did not choose. That is FR-003 extended to the queue itself
- [ ] T016 [US1] Implement `rankQueue(queue)` in `apps/api/src/moderation/scoring.ts`, ordering by score with **no action taken** (FR-005, SC-002)
- [ ] T017 [US1] Give `reports_harm` a **distinct SLA and distinct staffing** in `apps/api/src/moderation/queue.ts` — the split is pointless if both queues are worked by the same person in the same sitting, in arrival order (FR-009)
- [ ] T018 [US1] Narrow the watched categories to **racist/hate and overtly NSFW content** in `apps/api/src/moderation/classifier.ts` — **not general profanity, not rudeness**. A narrow bar is the only one a small team can actually enforce (FR-008, Constitution XVIII)

**Checkpoint**: A report is seen, ranked, and acted on by nobody automatically.

---

## Phase 4: User Story 3 - A human takes the action (Priority: P1)

**Goal**: A moderator issues a proportionate response with the account's history in front of them.

**Independent Test**: Work a case end to end through mute, ban and forced rename, confirming scope, duration and escalation.

### Tests for User Story 3 ⚠️

- [ ] T019 [US3] Write `apps/api/tests/moderation/muteThreshold.test.ts` with the five quickstart rows — 5 reports from **one** account is no mute; 5 accounts 8 days old is a **1-hour mute**; 5 accounts 2 days old is no mute; **5 accounts in one guild is NO MUTE, because they count as one**; 3 from one guild plus 4 unaffiliated **is** a mute
- [ ] T020 [P] [US3] Write `apps/api/tests/moderation/escalation.test.ts` — 1 hour · 24 hours · 72 hours · 7 days · **then the queue, where a human decides**. **Test the second offense after a service restart**, so history is genuinely read from storage
- [ ] T021 [P] [US3] Write `apps/api/tests/moderation/banType.test.ts` as a **type test, not a runtime test** — `issueBan(accountId, scope, until)` **must not compile**. FR-012 is a type error rather than a policy someone has to remember, and a runtime check tests a policy
- [ ] T022 [P] [US3] Write `apps/api/tests/moderation/noGameplayEffect.test.ts` — after a mute or a chat ban: rating, shards, league, guild membership and hold streaks are **all unchanged** and battles are **still playable**; only posting is blocked (SC-006)
- [ ] T023 [P] [US3] Write `apps/api/tests/moderation/envoys.test.ts` — an Envoy attempting to mute, ban or view a queue gets **403**; filing a report gets **201, like anyone else** (SC-006 of feature 014)

> **T019 line 4 is the one a naive distinct-account count gets wrong.** Five distinct
> accounts *is* the honest signal — unless they are eight people in a guild chat who
> agreed to it. That is the realistic multi-account attack.

### Implementation for User Story 3

- [ ] T024 [US3] Implement `applyMute` in `apps/api/src/moderation/actions.ts` — automatic at **5 distinct reporting accounts within 24 hours**, **1 hour** on the first occasion (FR-011)
- [ ] T025 [US3] Implement the three distinctness qualifiers in `apps/api/src/moderation/actions.ts` — the reporter must be **older than 7 days**; **at most one report per reporter per target per 24 h**; and **reports from one guild count as one** toward the threshold
- [ ] T026 [US3] Implement `issueBan(accountId, scope, until, actorId)` in `apps/api/src/moderation/actions.ts` — carrying a **scope** (Global only, or all chat) and a **duration** (FR-013)
- [ ] T027 [US3] Implement escalation from `apps/api/src/moderation/history.ts` — **1 hour · 24 hours · 7 days · 30 days · permanent**, starting where the last one left off. **History is needed from the first ban**, or the second offense starts at the bottom
- [ ] T028 [US3] Confirm a chat ban touches **no shards, no rating, no hold streak, no defense and no guild membership** in `apps/api/src/moderation/actions.ts` — **the player keeps playing the game and loses a room** (FR-014)
- [ ] T029 [US3] Implement `forceRename(accountId, actorId)` in `apps/api/src/moderation/actions.ts` — human-issued and **free to the player** (FR-015, SC-007)
- [ ] T030 [US3] Tell a muted player **what happened, when it expires, and how to appeal** — a silent mute is a bug report, and it generates exactly the support load the automation was supposed to save
- [ ] T031 [US3] Confirm no call site of `issueBan` exists in an automated path — `rg -n "issueBan" apps/api/src workers/`

**Checkpoint**: The policy is real rather than decorative.

---

## Phase 5: User Story 2 - Serious content is found even when nobody reports it (Priority: P2)

**Goal**: Something bad posted in a quiet channel is still caught.

**Independent Test**: Post high-confidence violating content that nobody reports and confirm it escalates.

### Tests for User Story 2 ⚠️

- [ ] T032 [P] [US2] Write `apps/api/tests/moderation/coverage.test.ts` — **every** message is classified and **nothing is sampled** (SC-004)
- [ ] T033 [P] [US2] Write `apps/api/tests/moderation/proactive.test.ts` — proactive escalation happens **only at very high confidence**, so it does not flood the queue, and Beginner chat is prioritised over every other scope

### Implementation for User Story 2

- [ ] T034 [US2] Implement `workers/classify.ts` as the batch job — reading in batches, **asynchronous**, delaying no message (FR-001, FR-002)
- [ ] T035 [US2] Make batch size **tunable without reducing coverage** in `apps/api/src/moderation/classifier.ts` — **the batch size is the knob, not the coverage** (FR-007)
- [ ] T036 [US2] Implement proactive escalation at very high confidence only, in `apps/api/src/moderation/scoring.ts` (FR-005)
- [ ] T037 [US2] Give Beginner chat **moderation priority over every other scope** in `apps/api/src/moderation/queue.ts` — a channel of brand-new players is precisely where scams and grooming are aimed (FR-010)

**Checkpoint**: The one thing a report-driven queue structurally cannot do now happens.

---

## Phase 6: User Story 4 - Outcomes reach the person (Priority: P2)

**Goal**: A player who has been banned, renamed or had an avatar rejected is told.

**Independent Test**: Trigger each outcome and confirm notification.

### Tests for User Story 4 ⚠️

- [ ] T038 [P] [US4] Write `apps/api/tests/moderation/notices.test.ts` — a ban, forced rename and avatar decision each notify the player; **AI drafts and a human sends**; and **no outbound notice contains an action link** (SC-010)
- [ ] T039 [P] [US4] Add the avatar case to `apps/api/tests/moderation/notices.test.ts` — a rejection comes with a **free resubmission** (FR-020)

### Implementation for User Story 4

- [ ] T040 [US4] Implement `notices.ts` in `apps/api/src/moderation/` — **AI may draft; a human must send** (FR-018)
- [ ] T041 [US4] Emit **no action link** in any outbound notice from `apps/api/src/moderation/notices.ts` — a notice with a one-click *"confirm ban"* turns a draft into an approval flow, and **an approval flow is where a human stops reading** (FR-019)
- [ ] T042 [US4] Route avatar review decisions from feature 012 through `apps/api/src/moderation/notices.ts`, with human approval **before** any visibility (FR-016, SC-008)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T043 Implement retention holds in `apps/api/src/moderation/retention.ts` — a report retains its content **independently of its channel's retention** and places a hold on any battle replay it depends on (FR-021, FR-022)
- [ ] T044 **Test across the seam** in `apps/api/tests/moderation/retentionSeam.test.ts` — conclude a battle, file a report, advance 8 days, run **feature 008's** cleanup, and confirm the replay survives; then close the report, advance 31 days, and confirm it is deleted

> **T044 is the cross-feature test and the one most likely to be skipped**, because
> it needs feature 008 running. **A hold only this feature knows about is a hold the
> cleanup job ignores** — testing within this feature alone passes while the blob is
> silently deleted on schedule.

- [ ] T045 **Build the 300-message hand-labelled evaluation set** — 150 clearly benign, 60 clearly harmful, **60 friction-not-harm** (the boundary Constitution XVIII draws), 30 adversarial (obfuscated slurs, leetspeak, unicode substitution). Build it **alongside feature 014's blocklist, not after** — the blocklist's own false positives are free training data for what the boundary looks like
- [ ] T046 **Run the batch-size measurement** at `batch = 1 · 20 · 50 · 100` over the identical set and prompt, reporting precision/recall/F1 on harm, **friction misclassified as harm**, the **position-in-batch effect bucketed by decile**, cost per 1,000, and latency

> **The position-in-batch effect is the one that matters and is easy to omit.**
> Aggregate accuracy can hold while the tail degrades, and item 97 being judged worse
> than item 3 is invisible in a mean.
>
> **The decision rule, fixed in advance: if quality at 100 is materially worse than
> at 20, the batch size is the knob — not the coverage.** Batch-20 costs ~2.3×
> batch-100 and stays near **1% of net revenue**, so the knob is affordable — worth
> knowing before the measurement, so the result is read honestly rather than against
> a budget.

- [ ] T047 [P] Write `apps/api/src/moderation/README.md` — *a model scores, a human decides*, the two-table split, and the standing note that nothing here gates
- [ ] T048 Run the full quickstart manual pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 008, 012, 014
- **Foundational (Phase 2)**: the capability boundaries — **blocks all four stories**.
  Within the phase, **operator identity (T049–T053) comes before T006–T009**: T009
  forbids an actorless ban, and until an operator can be identified there is no
  actor to pass
- **US1 (Phase 3)**: Foundational only
- **US3 (Phase 4)**: needs the action signatures (T008, T009) **and `requireOperator`
  (T052)** — a ban route with no operator gate is the one shortcut that cannot be
  taken back
- **US2 (Phase 5)**: needs the classifier interface (T006) and feature 014's enqueue
- **US4 (Phase 6)**: needs US3's actions and feature 012's avatar queue
- **Polish (Phase 7)**: depends on US1 and US3; **T044 additionally needs feature 008 running**

### User Story Dependencies

- **US1 (P1)**: none
- **US3 (P1)**: none beyond Phase 2 — **fully parallel with US1**
- **US2 (P2)**: US1's queue
- **US4 (P2)**: US3

### Within Each User Story

- Tests written and **failing** before implementation
- **The "classifier changed nothing" test early**
- Ban escalation needs history **from the first ban**

### Parallel Opportunities

- **US1 and US3 are fully parallel** — reports and actions touch different modules
- T011, T012, T013 in parallel
- T020, T021, T022, T023 in parallel — four independent test files
- T032, T033 in parallel · T038, T039 in parallel
- **T045 (the labelled set) is a content task** and should run alongside everything from feature 014 onward

---

## Parallel Example: User Story 3

```bash
# Four independent test files, all red first:
Task: "muteThreshold.test.ts — five rows, including the one-guild case"
Task: "escalation.test.ts — the ladder, re-read after a restart"
Task: "banType.test.ts — the three-argument call must not COMPILE"
Task: "noGameplayEffect.test.ts — a ban loses a room, not a game"
```

---

## Implementation Strategy

### MVP First (US1 + US3)

Both are P1 and together they are moderation: **reports are seen, and a human acts
on them.** Stop after Phase 4 and validate — a classifier run changes not one byte,
the harm queue cannot contain friction, and a three-argument `issueBan` does not
compile.

1. Phase 2: **an operator who is not a player, no write access, and no actorless ban**
2. Phase 3: US1 — the queue
3. Phase 4: US3 — **STOP and VALIDATE** the mute threshold's one-guild case
4. Phase 5–6: proactive scanning and notices
5. Phase 7: retention across the seam, then the measurement

### Incremental Delivery

**T046's measurement is the one pre-commitment the design explicitly calls for** and
it needs the live model. It does not block shipping — the batch size is config — but
it should run before the first real traffic, so the knob is turned on evidence rather
than on a guess.

---

## Notes

- **Human load is the real constraint** — ~2 hours a day at 10k players, ~10 at 100k.
  The single largest factor keeping it there is that **reports create the queue and
  the classifier only ranks**: 60 real reports a day instead of 660.
- **Cost is roughly 1% of net revenue at any scale**, because both sides scale with
  players. It is not a line worth optimising.
- **Whether 5 distinct accounts is the right threshold is not settled** — it wants
  real report volume, and it is config rather than a constant.
- **Appeal handling is not designed.** A ban must be appealable and the escalation
  ladder assumes the flow exists; feature 016 owns the surface.
- **Envoys have no powers**, named explicitly so nobody grants a moderation
  capability to a role designed not to have one.
- Commit after each task or logical group; work goes straight to `main`.
