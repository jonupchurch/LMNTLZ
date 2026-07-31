# Tasks: Guilds

**Input**: Design documents from `/specs/013-guilds/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/guilds-api.md](contracts/guilds-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § Social models ·
**features 005, 009, 010 and 012 complete**

> ### ⚠️ The prerequisite line was wrong: **014 is not built, and 013 ships before it**
>
> This list was generated claiming *"features 005, 009, 010, 012 **and 014**
> complete"*. Feature 014 is chat, it comes **after** this one in `specs/README.md`,
> and `apps/api/src/chat/` does not exist. The only task that genuinely needs it is
> **T039** (`/motd` announcing in guild chat) — see the note there. Nothing else in
> the feature touches chat, so 013 proceeds.

**Tests**: **Included.** Succession spans **21 days of wall-clock across two
timers**, so it cannot be tested by waiting — which means an implementation that
requires waiting is an implementation that ships untested. The clock is injectable
before succession exists.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/guilds/`, `apps/api/src/db/schema/`, `apps/client/src/features/guilds/`.

> **Guilds ship without anything to compete in yet.** Wings, events and guild funds
> are **deferred with their design** — a Wing exists only for an event, so deferring
> events defers Wings; they are not separable. Guilds still earn their place at 1.0
> because **joining and founding are two of the four starter-league exits**.

---

## ⚠️ The wiring pass, run 2026-07-30 before any code was written

This list was generated **before** `.specify/templates/tasks-template.md` grew its
mandatory wiring rule, so it has the shape that has now produced the same defect
**seven times across five features**: *"implement X in `path/to/x.ts`"* is satisfied
completely by code nothing calls. Every box gets checked honestly, every gate goes
green, and the feature does nothing.

Reading the repo rather than the spec turned up **four concrete wires this list did
not mention at all**. Three of them are seams **another feature already wrote and
left inert** — the highest-risk case, because the feature that wrote them
deliberately left them uncalled and this list never named them:

| Seam, already in the repo | Where | Callers today |
|---|---|---|
| `guildJoined(accountId)` | `apps/api/src/matchmaking/starterLeague.ts` | **none** — *"No caller yet. Feature 013 owns guilds and does not exist."* |
| `guildDoorConfirm(accountId, door, guildId)` | same file — the **only** constructor of a confirm | **none but tests** |
| `publicProfile.guild` | `apps/api/src/profiles/publicProfile.ts:149` returns a hard-coded `null` | **013 is the feature that fills it** |
| the whole **client surface** | `apps/client/src/App.tsx` | T017/T030/T031 build two components and **nothing renders either** |

The fourth is the one 006 was caught by exactly: the original list built
`ApplicationForm.tsx` and `EmblemDesigner.tsx` and never added a screen, a nav
entry, or a single `lib/api.ts` call. **A guild you cannot reach in the browser is
not a guild.**

**Wiring tasks are numbered T057+ and placed at the end of the phase they belong
to.** IDs are appended rather than renumbered so the phases above stay stable;
**read by phase, not by number.**

---

## Status, 2026-07-30 — **67 of 70**, and what the three are

**Guilds are reachable in a browser**: a Guild tab, a directory you can search,
founding with the emblem designer, a roster with role controls, and succession.

| Open | Why |
|---|---|
| **T007** | ⛔ **partial by decision.** The clock ban covers `src/guilds` and `sim/rules`. Extending it to *"every feature with a timer"* is **45 ambient clock calls across 24 files in 8 features** — bigger than this whole feature, and it touches deployed code. Named with the number in `eslint.config.js` rather than half-attempted. |
| **T039** | ⛔ `/motd` — the schema, the permission and the display exist; **there is no route to set one.** Its *"announce in guild chat"* half needs feature **014**, which ships after this. Left whole rather than half-built. |
| **T056** | The quickstart manual pass, which is a human at a keyboard. |

**Two more that are done but not finished**, and the distinction matters:

- **T059 and T067** — the expiry and succession jobs exist and are exposed as
  `POST /v1/jobs/guild-*`, but **no schedule points at them**, exactly as 008's
  replay cleanup has waited on 016 since feature 008. Both also run on the read
  path, so nothing silently stops working; succession additionally resolves lazily,
  because *"the job never ran"* freezing a guild forever is the failure the story
  exists to prevent.

**Added, and not in the original list:** `directory.ts` and `GuildBrowser.tsx`. The
contract specifies `POST /v1/guilds/:guildId/applications` and no way to learn a
`guildId`; the client shipped a form asking a human to type a UUID. Every route
worked and the feature was unusable.

**T021–T025 were merged into `found.test.ts`** rather than split across
`starterWarning.test.ts`, `found.test.ts` and `emblem.test.ts` — one `beforeAll`
seeds the authored bot all three need, and three files would have seeded it three
times or, worse, forgotten to.

---

## Phase 1: Setup

- [X] T001 Create `apps/api/src/guilds/` and `apps/client/src/features/guilds/`, and register `/v1/guilds`, `/v1/applications`, `/v1/invites` in `apps/api/src/index.ts`
- [X] T002 [P] Add a `guilds` test project to `apps/api/vitest.config.ts`
- [X] T003 Define the guild schema in `apps/api/src/db/schema/guilds.ts` — `guilds` (name permanent, emblem `{icon, ink, ground}`, pitch, motd, founded_at), `guild_members` with **`UNIQUE (account_id)`**, `guild_applications`, `guild_invites`, `guild_successions`
- [X] T004 Generate and apply the guilds migration from `apps/api/drizzle/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: An injectable clock, banned by lint rather than by convention.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Define `Clock` in `apps/api/src/guilds/clock.ts` — `interface Clock { now(): Date }`, with `systemClock` and `fixedClock(t)`, taken as a **constructor dependency** by every module in this feature
- [X] T006 **Ban the ambient calls by lint** in `apps/api/eslint.config.js` — `Date.now` and argument-less `new Date()` are errors inside `apps/api/src/guilds`. **A convention that says "inject the clock" is broken in a one-line bug fix at the worst possible moment**
- [ ] T007 Extend the same lint rule to every feature with a timer — application expiry (7 days), invitation expiry, and the starter week are all the same shape. **Share the configuration with `sim/rules`' clock ban** rather than each having its own

**Checkpoint**: Every timer in the feature is testable without waiting

---

## Phase 3: User Story 2 - A player joins a guild (Priority: P1) 🎯 the concurrency one

**Goal**: Apply to several, be accepted by one, and end up in exactly one — with the rules stated where the decision is made.

**Independent Test**: Apply to several guilds, have one accept, and confirm the others are withdrawn automatically.

> **Sequenced first among the P1s** because plan.md and research.md both say to
> confirm first-acceptance-wins **before building the happy path**. A concurrency
> test written afterwards is written against an implementation that already has a
> shape, and the shape is the thing being tested.

### Tests for User Story 2 ⚠️

- [X] T008 [US2] Write `apps/api/tests/guilds/firstAcceptance.test.ts` — **two guilds accept the same applicant simultaneously, under real concurrency across two connections**, and assert exactly **one** `guild_members` row, exactly **one** application `accepted`, every other open application `withdrawn`, and the loser receiving **`409 { reason: 'already-joined' }`, not `500`**
- [X] T009 [P] [US2] Add the right-row proof to `apps/api/tests/guilds/firstAcceptance.test.ts` — guild A accepting X while guild B accepts Y (**different players**) both succeed concurrently **with no serialisation**. Locking the guild row would serialise these for nothing
- [X] T010 [P] [US2] Add the wrong-grain proof to `apps/api/tests/guilds/firstAcceptance.test.ts` — guild A accepting application 1 from X while guild B accepts application 2 from X. **These are different rows**; without the membership constraint X joins twice
- [X] T011 [P] [US2] Write `apps/api/tests/guilds/limits.test.ts` — a 25th member is `409`; a 6th concurrent application is `409`; an application older than 7 days is `410`

### Implementation for User Story 2

- [X] T012 [US2] Implement acceptance as **one transaction** in `apps/api/src/guilds/applications.ts` — insert the membership (the contended resource, protected by `UNIQUE (account_id)`), withdraw every other open application, mark this one accepted, and graduate from the starter league
- [X] T013 [US2] Catch `23505` and return `409 { reason: 'already-joined', guildId }` in `apps/api/src/guilds/applications.ts` — the officer whose click lost sees *"Reyna joined The Long Reach a moment ago"* rather than a server error
- [X] T014 [US2] Keep withdrawal **in the same transaction as the membership** in `apps/api/src/guilds/applications.ts` — two operations leave a window where the player is in a guild **and** has open applications, and a second acceptance in that window is a second membership. **That is the whole bug**
- [X] T015 [US2] Implement the ≤5 concurrent cap in `apps/api/src/guilds/applications.ts`, **shown as a budget rather than discovered as an error** (FR-008)
- [X] T016 [US2] Implement 7-day application expiry as a scheduled job in `apps/api/src/guilds/applications.ts` — **driven from Postgres, resumable, safe to re-run**, the same shape as feature 008's replay cleanup (FR-009)
- [X] T017 [US2] State the **first-acceptance-wins** contract at the point of applying, in `apps/client/src/features/guilds/ApplicationForm.tsx` (FR-011)
- [X] T018 [US2] Implement invitations in `apps/api/src/guilds/invites.ts` — accepting joins **immediately with no second confirmation**, because the player is the one being asked and their yes is the decision; accepting one **withdraws the rest**, stated plainly (FR-012, FR-013)
- [X] T019 [US2] Show a dismissed application **as dismissed rather than vanishing**, with a **24-hour cooldown** before reapplying to that guild, in `apps/api/src/guilds/applications.ts` (FR-014)
- [X] T020 [US2] Enforce the **24-member** cap in `apps/api/src/guilds/membership.ts` (FR-005, SC-003)

### Wiring for User Story 2 ⚠️

- [X] T057 [US2] **WIRING** — the acceptance transaction in `apps/api/src/guilds/applications.ts` calls **`guildJoined(accountId)`** from `../matchmaking/starterLeague.js`, **not a hand-rolled `UPDATE accounts SET starter_exited_at`**. 009 wrote that function as *"one rule, two doors"* and it has had **no caller since the day it was written**. The SQL in `contracts/guilds-api.md` shows the raw `UPDATE` for illustration — the function is what enforces the `isNull` guard that makes the exit one-way and idempotent
- [X] T058 [US2] **WIRING** — `apps/client/src/features/guilds/GuildScreen.tsx` renders `ApplicationForm` (T017) and the invitation list, and calls `POST /v1/guilds/:id/applications` and `POST /v1/invites/:id/accept` through `apps/client/src/lib/api.ts`. **Without this, T017's form is a component nothing mounts and T018's routes have no client caller**
- [X] T059 [US2] **WIRING** — register T016's 7-day expiry job. ⛔ **This one is genuinely blocked and must not be quietly skipped**: 008's `cleanupExpired()` is the shape T016 copies, and `apps/api/src/replays/README.md` records *"The daily schedule is not registered"* — 008 T029 waits on 016's cron. So **copying the shape copies the non-registration**. Write the handler and an authenticated `POST /v1/jobs/guild-applications/expire` that runs it, so 016 has something to point a schedule at, and record the gap in `apps/api/src/guilds/README.md`. **An expiry that never runs means applications never expire and the 5-cap fills up permanently**

**Checkpoint**: A player accepted by one guild has zero remaining open applications, under concurrency — **and can do all of it from the browser**.

---

## Phase 4: User Story 1 - A player founds a guild (Priority: P1)

**Goal**: Pay, name, design an emblem, write a pitch, and start inviting.

**Independent Test**: Found a guild and confirm the charge, the permanence of the name, and that the founder holds the master role.

### Tests for User Story 1 ⚠️

- [X] T021 [US1] Write `apps/api/tests/guilds/starterWarning.test.ts` — **`POST /v1/guilds` first**, because founding is the door most likely to be missed. All three doors require **both** acknowledgements: founding, applying, and accepting an invitation (SC-002)
- [X] T022 [P] [US1] Add the negatives to `apps/api/tests/guilds/starterWarning.test.ts` — one acknowledgement is `409`; none is `409`; **a player not in the starter league needs none**
- [X] T023 [P] [US1] Add the timing case to `apps/api/tests/guilds/starterWarning.test.ts` — the player applies, a day passes, an officer accepts, and the assertion is that **the warning was shown at the application**. At acceptance the player is not present
- [X] T024 [P] [US1] Write `apps/api/tests/guilds/found.test.ts` — 650 charged, the name permanent, the founder holding master, and the fee **non-refundable on disband**
- [X] T025 [P] [US1] Write `apps/api/tests/guilds/emblem.test.ts` — a low-contrast combination **warns and saves**, never blocks (SC-004)

### Implementation for User Story 1

- [X] T026 [US1] Implement `POST /v1/guilds` in `apps/api/src/guilds/found.ts` — the **650-shard charge and the guild creation as one transaction**, for the same reason the rune rebuild is: a partial failure leaves a paid-for guild that does not exist, or a guild nobody paid for (FR-001)
- [X] T027 [US1] Require feature 009's `StarterExitWarning` payload on `POST /v1/guilds` in `apps/api/src/guilds/found.ts` — **the confirm cannot be constructed without it**, because it is a required field of the confirm's type (FR-015)
- [X] T028 [US1] Require the same payload on `POST /v1/guilds/:id/applications` and `POST /v1/invites/:id/accept` in `apps/api/src/guilds/` (FR-015, FR-016)
- [X] T029 [US1] Make the guild name **permanent** in `apps/api/src/guilds/found.ts`, changeable only by a moderation-forced rename which is **free** (FR-002)
- [X] T030 [US1] Build the emblem designer in `apps/client/src/features/guilds/EmblemDesigner.tsx` — **36 icons including one blank, 12 inks, 12 grounds**, with palettes chosen so illegibility is unreachable by accident (FR-003)
- [X] T031 [US1] **Warn, never block**, on low contrast in `apps/client/src/features/guilds/EmblemDesigner.tsx` — a solid block of colour is a permitted choice (FR-004, Constitution XVIII)
- [X] T032 [US1] Store the recruiting pitch as a **guild property validated for length**, not text typed per posting, in `apps/api/src/guilds/found.ts` (FR-007)
- [X] T033 [US1] **Build no guild tag** — no short abbreviation beside a player's name. Three characters cannot be read in context, and compression is exactly what defeats a blocklist (FR-006)
- [X] T034 [US1] Save an emblem **immediately, with no review queue, no pending state and no private storage**, in `apps/api/src/guilds/found.ts` — it is a triple of indices into a curated palette, validated as `icon ∈ 0..35`, `ink ∈ 0..11`, `ground ∈ 0..11`

> **Settled 2026-07-28: the emblem needs no review, because it is composed from
> preconfigured assets.** `research.md` and `quickstart.md` previously said it went
> through image review on the same surface as avatars; both have been corrected.
> **Composition is what removes the review, not a relaxed policy** — an avatar is an
> *upload* and is still pre-moderated (feature 012), while all 5,184 emblem
> combinations are vetted at authoring time and none of them is player-supplied
> content. The same reasoning as feature 014's embeds, which carry no moderation
> surface for the same reason.
>
> The guild **name** and **pitch** are text and **do** go through feature 015.

### Wiring for User Story 1 ⚠️

- [X] T060 [US1] **WIRING** — `POST /v1/guilds` in `apps/api/src/guilds/found.ts` calls **`guildDoorConfirm(accountId, 'founding', null)`** from `../matchmaking/starterLeague.js`, and the same for the two other doors in T028. It is documented as *"the only way to build a guild confirm"* — it fetches the warning itself, so **there is no version of the call that produces an unwarned confirm**. T027/T028 say *"require the `StarterExitWarning` payload"* without naming the function, which is exactly how a feature reimplements a seam beside the one already written for it
- [X] T061 [US1] **WIRING** — add `{ kind: 'guild' }` to the `Screen` union in `apps/client/src/App.tsx`, render `GuildScreen`, and give `ScreenNav` a **Guild** tab beside Squads / Attack / Profile. This is the mount point T058 and T062 both depend on
- [X] T062 [US1] **WIRING** — `GuildScreen.tsx` renders `EmblemDesigner` (T030, T031) inside a founding flow that calls `POST /v1/guilds`, and shows the shard balance beside the 650 price using `GET /v1/me/shards` — the same pattern 012 T043 established for the rename charge. **A designer that cannot submit is a colour picker**
- [X] T063 [US1] **WIRING** — `apps/api/src/profiles/publicProfile.ts` stops returning a hard-coded `guild: null` and reads the membership 013 now owns. The field, its type and its client rendering **already exist and have never once been non-null**; 012 wrote *"Null until feature 013 exists"* and this is that feature. Also delete that comment, so the next reader is not told a built thing is missing

**Checkpoint**: A guild exists, is paid for, its founder was warned before graduating, and **it shows on their profile**.

---

## Phase 5: User Story 3 - A guild runs itself (Priority: P2)

**Goal**: A master delegates to officers who can recruit and manage without being able to dissolve what they did not build.

**Independent Test**: Exercise each permission at each role and confirm the boundaries.

### Tests for User Story 3 ⚠️

- [X] T035 [P] [US3] Write `apps/api/tests/guilds/roles.test.ts` — the six-row permission grid: member invites `403`, officer invites `200`, officer succession `200`, officer sets emblem `403`, master disbands `200`, officer disbands `403`
- [X] T036 [P] [US3] Write `apps/api/tests/guilds/boundary.test.ts` — `GET /v1/guilds/:id` exposes **no** other player's guild applications, **no** member's shard balance and **no** squad composition (Constitution XVII)

### Implementation for User Story 3

- [X] T037 [US3] Implement the three roles in `apps/api/src/guilds/membership.ts` — **one** Guild Master, **at most 3** Officers, and Members (FR-017)
- [X] T038 [US3] Enforce the permission table **server-side** in `apps/api/src/guilds/membership.ts`, never by hiding a control (FR-018, Constitution XII)
- [ ] T039 [US3] Implement `/motd` in `apps/api/src/guilds/motd.ts` — it sets a **pin** rather than sending a message, usable by master and officers, plus a **login notice** derived from a last-seen comparison (FR-019). ⛔ **The "announce in guild chat" half is blocked on 014** and there is no chat module to call. Build the pin and the login notice — which are the parts FR-019 can satisfy without chat — and leave the announcement to 014, **named in `guilds/README.md` as an outstanding wire rather than silently absent**

### Wiring for User Story 3 ⚠️

- [X] T064 [US3] **WIRING** — `GuildScreen.tsx` renders the roster with per-member role controls that call the promote / demote / kick routes, and the motd editor that calls `PUT /v1/guilds/:guildId/motd`. **The permission table is enforced server-side (T038); the client renders what it is allowed to, and a control it wrongly shows must still 403** — that is the test, not the hiding

**Checkpoint**: A guild does not stop when one person does.

---

## Phase 6: User Story 4 - An absent master does not freeze a guild (Priority: P2)

**Goal**: A guild whose master stopped playing can continue, without letting anyone seize a guild from someone on holiday.

**Independent Test**: Run the full succession timeline and confirm both outcomes.

### Tests for User Story 4 ⚠️

- [X] T040 [US4] Write `apps/api/tests/guilds/succession.test.ts` with the injected clock — **all four branches**: master returns at day 13 (never available), day 20 (available and **cancels**), never returns (**completes at day 21**), and **day 22 (too late — they are no longer master)**
- [X] T041 [P] [US4] Add the money branch to `apps/api/tests/guilds/succession.test.ts` — an officer with 650 at day 14 who spends it and has 400 at day 21 **does not** complete. The 650 is checked **at completion**, not only at initiation
- [X] T042 [P] [US4] Add the neutrality assertion to `apps/api/tests/guilds/succession.test.ts` — 650 moves from one player to another and **nothing is created or destroyed** (SC-006)
- [X] T043 [P] [US4] Write `apps/api/tests/guilds/clock.test.ts` — `rg -n "Date\.now\(\)|new Date\(\)" apps/api/src/guilds` returns **nothing**, and adding `const t = Date.now()` to a guilds module **fails lint**

> **The day-22 branch is the one worth naming.** It is what a real person
> experiences as unfair, and it is the one nobody thinks to test. **Succession being
> final is a deliberate decision only if somebody wrote this test.**

### Implementation for User Story 4

- [X] T044 [US4] Implement succession as **requested, not claimed**, in `apps/api/src/guilds/succession.ts` — available only after the master has been inactive **14 days** (FR-020)
- [X] T045 [US4] Email the master on request via the sender interface, giving them **7 days**, in `apps/api/src/guilds/succession.ts` (FR-021)
- [X] T046 [US4] Make **logging in** lapse the request in `apps/api/src/guilds/succession.ts` — **presence is the reply**, so the email contains **no link that grants anything** and is phishing-resistant by construction (FR-022, Constitution XIX)
- [X] T047 [US4] Transfer on completion in `apps/api/src/guilds/succession.ts` — the requester pays **650** and the former master is **refunded 650** (FR-023)
- [X] T048 [US4] Refuse a request from an officer who cannot afford 650, in `apps/api/src/guilds/succession.ts` (FR-024)
- [X] T049 [US4] Leave a displaced master as a **Member**, not removed from the guild, in `apps/api/src/guilds/succession.ts` (FR-025)
- [X] T050 [US4] Make **14 and 7 config, not constants**, in `apps/api/src/guilds/config.ts` — the shape is decided; the numbers want a real population

### Wiring for User Story 4 ⚠️

- [X] T065 [US4] **WIRING — the one most likely to be missed.** T046 says *"logging in lapses the request"*, and **nothing in `apps/api/src/auth/` knows guilds exist**. Call the lapse from the sign-in path in `apps/api/src/auth/routes.ts` (or a single `noteSeen` hook it already runs), **not from a guilds route nobody hits while away**. *Presence is the reply* is a claim about the **auth** path; written only inside `succession.ts` it is a function the absent master never triggers, and **they lose their guild by logging in**
- [X] T066 [US4] **WIRING** — the succession email in T045 goes through the **already-installed** `Mailer` from `apps/api/src/payments/receipt.ts` (`setMailer`, installed at startup by `installMailer()` in `apps/api/src/index.ts`). Do **not** add a second sender: 011 built this behind the vendor interface for Constitution XIX and it is live. Resolve the master's address from `identities`, the same way the receipt path does
- [X] T067 [US4] **WIRING** — register completion. Like T059 this needs a schedule that does not exist yet, so expose `POST /v1/jobs/guild-successions/complete` and **also evaluate completion lazily whenever the guild is read**, so a succession still resolves with no cron at all. **Succession is the one timer where "the job never ran" means a guild is frozen forever, which is the exact failure the story exists to prevent**
- [X] T068 [US4] **WIRING** — `GuildScreen.tsx` shows an officer the succession control when it is available, the countdown while it is pending, and the master a plain statement that logging in has already cancelled it

**Checkpoint**: All four stories independently functional **and reachable by a player**.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T051 Implement activity in `apps/api/src/guilds/activity.ts` with *considered active for 14 days from founding regardless of headcount* **as part of the definition, not as a caller-side exception** — written as an exception it would need special-casing everywhere activity is read (FR-026, SC-007)
- [X] T052 Define guild activity by member activity within a stated window that **does not depend on when a member plays** (FR-027, SC-008)
- [X] T053 Write `apps/api/tests/guilds/deferred.test.ts` — `rg -in "wing|event|guildFund|treasury" apps/api/src/guilds` returns **nothing**. **A "harmless" Wing column now is a structure with no rules attached, and it will acquire wrong ones**
- [X] T054 Dissolve a guild whose last member leaves, in `apps/api/src/guilds/membership.ts` — the founding fee is **not** returned. Succession refunds where disbanding does not, and the rule is *a guild costs 650 to hold*, not *you get your money back*
- [X] T055 [P] Write `apps/api/src/guilds/README.md` — the three roles, the contended-row argument, the standing note that Wings are deferred with their design, and **the two unregistered schedules (T059, T067) named as outstanding wires**
- [ ] T056 Run the full quickstart manual pass
- [X] T069 **Assert the wires, then cut them.** `apps/api/tests/guilds/wiring.test.ts` + `apps/client/tests/guilds/wiring.test.tsx` fail if founding stops calling `guildDoorConfirm`, if acceptance stops calling `guildJoined`, if the sign-in path stops lapsing succession, if `publicProfile` goes back to a constant `null`, or if `GuildScreen` stops requesting the guild. **Mutate each of the five and confirm five failures** — *"is it called?"* is a testable claim, and a wiring task with no test is the same promise that failed seven times
- [X] T070 Update `apps/api/src/matchmaking/starterLeague.ts` and `apps/api/src/profiles/publicProfile.ts` to **delete their "no caller yet" / "null until 013" notes**. A stale *"this is not wired"* comment beside wired code is how the next reader concludes a built thing is missing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 009, 010, 012 — **not 014**
- **Foundational (Phase 2)**: the clock — **blocks all four stories**
- **US2 (Phase 3)**: Foundational only. **Sequenced first**
- **US1 (Phase 4)**: needs feature 010's charge and feature 009's `guildDoorConfirm`
- **US3 (Phase 5)**: needs membership (T012, T020). **Its chat announcement needs 014 and does not gate the phase** — the pin and the login notice do not touch chat
- **US4 (Phase 6)**: needs the clock (T005), roles (T037) and 011's installed `Mailer`
- **Polish (Phase 7)**: depends on US1 and US2

### The wiring tasks depend on the client mount point

**T061 comes before T058, T062, T064 and T068** even though it is numbered later:
it is the task that puts a Guild tab in `App.tsx`, and the other four render into
it. Build it first if you touch the client at all.

### User Story Dependencies

- **US2 (P1)**: none — but it needs *a* guild to exist, so use a fixture rather than sequencing US1 first
- **US1 (P1)**: none
- **US3 (P2)**: US2's membership
- **US4 (P2)**: US3's roles

### Within Each User Story

- Tests written and **failing** before implementation
- **Clock injection before succession exists**
- First-acceptance-wins **before** the happy path
- founding → membership and roles → applications and invites → succession → motd

### Parallel Opportunities

- **US1 and US2 can be worked in parallel** — founding and joining touch different modules, and US2's tests use a guild fixture
- T009, T010, T011 in parallel
- T022, T023, T024, T025 in parallel
- T035, T036 in parallel · T041, T042, T043 in parallel

---

## Parallel Example: User Story 2

```bash
# The concurrency test and its two proofs, all red first:
Task: "firstAcceptance.test.ts — two guilds, one applicant, real concurrency"
Task: "firstAcceptance.test.ts — different players do NOT serialise"
Task: "firstAcceptance.test.ts — two applications from one player still join once"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

Both are P1 and together they are the guild: **one exists, and people can get into
it exactly once.** Stop after Phase 4 and validate — five applications, one
acceptance, four withdrawals, and all three starter-league doors demanding both
acknowledgements.

1. Phase 2: **the clock, banned by lint**
2. Phase 3: US2 — **the concurrency test before the happy path**, then T057–T059
3. Phase 4: US1 — **STOP and VALIDATE** the starter warning on **founding first**, then T060–T063
4. Phase 5–6: roles, then succession with all four branches, then T064–T068

**"Validate" means in a browser, not in a test run.** 006 and 012 both reached a
complete, green, committed phase whose feature could not be reached by a player;
`.claude/skills` calls this out and `MEMORY.md` carries it as *"complete means
boxes, not playable"*. **Report the gates and the playability as two separate
lines.**

### Incremental Delivery

US4's succession is P2 but it is the feature with the longest untestable surface —
21 days across two timers. **The clock work in Phase 2 is what makes it a
half-day's work instead of untestable**, so do not defer Phase 2 even if succession
is deferred.

---

## Phase 8: The officer half — added 2026-07-30 by the gap audit

> ### Recruitment is one-directional and has been since 013 shipped
>
> `py tools/gap-audit.py` diffs every API route against every path the client can
> request. Six of 013's routes have **no caller at all**:
>
> ```
> GET  /guilds/:id/applications     an officer cannot see who applied
> POST /applications/:id/accept     AN APPLICATION CAN NEVER BE ACCEPTED
> POST /applications/:id/dismiss    nor declined
> POST /guilds/:id/invites          an invitation cannot be sent
> PUT  /guilds/:id/pitch            the recruiting pitch cannot be edited
> GET  /guilds/:id                  a guild has no page of its own
> ```
>
> Every one is implemented, authorised (`Officers and above only.`) and tested. The
> client built the **applicant's** side completely — browse, apply, view, withdraw —
> and none of the **officer's**. So today a player applies, no one can see it, and
> the application is swept after seven days.
>
> **The path-only audit missed this.** `GET /guilds/:id/applications` looked called,
> because the client POSTs to that same path to *apply*. Only matching on
> (verb, path) separates applying from reading your applicants — which is why the
> tool is verb-aware and why that is documented in its header.
>
> This is FR-008 and FR-011 — already specified, never decomposed. See
> [`../GAPS.md`](../GAPS.md).

- [ ] T071 [US2] **WIRING** — an **Applicants** panel in `apps/client/src/features/guilds/` calling `GET /v1/guilds/:id/applications`, rendered from `GuildScreen.tsx` for master and officer only. Members must not see it
- [ ] T072 [US2] **WIRING** — Accept and Decline controls on each applicant calling `POST /v1/applications/:id/accept` and `/dismiss`, refetching the roster afterwards rather than patching it from the response
- [ ] T073 [US2] Show **first-acceptance-wins** in the interface: an applicant accepted elsewhere disappears on the next load, and the copy must read as *"they joined another guild"* rather than as an error
- [ ] T074 [US2] Refuse Accept at 24 members **before** the request, with the seat count visible, so a full guild never sends a call it knows will fail
- [ ] T075 [US3] **WIRING** — an **Invite** control calling `POST /v1/guilds/:id/invites`, master and officer only
- [ ] T076 [US3] **WIRING** — a pitch editor calling `PUT /v1/guilds/:id/pitch` from `GuildRoster.tsx`, beside the emblem editor that already exists
- [ ] T077 [US1] **WIRING** — a guild page over `GET /v1/guilds/:id`, linked from `GuildBrowser.tsx`, so a guild can be read before applying to it
- [ ] T078 Add the caller assertion to `apps/client/tests/guilds/` for T071–T077 — **assert the caller, then cut the wire and watch it fail.** A rendering test cannot tell a wired control from an unwired one
- [ ] T079 **Delete `GET /v1/invites`** in `apps/api/src/guilds/routes.ts` — invitations arrive inside `/me/guild` and always have. A second route nothing calls is a maintenance cost and a false signal in the audit

**Checkpoint**: `py tools/gap-audit.py` reports no 013 route without a caller.

---

## Notes

- **The succession fee is not revenue.** It prices a manual support ticket, makes
  the displaced master whole, and is economically neutral overall. *Losing a guild
  you abandoned is not the same as being robbed.*
- **A permanent name is not a trap**, because founding a new guild is always
  available for 650 — you simply start over with no history.
- **Guild funds do not exist at 1.0**, so a newly founded guild cannot advertise
  using them. Feature 014's free daily posting credits are what make recruiting
  possible without them.
- **Do not oversell the starter-league loss.** The ×1.5 mostly replaces dormant hold
  income; only about **11%** is actual help.
- **Whether a disbanded guild's name is reclaimable is not settled**, and no
  contract here depends on it.
- Commit after each task or logical group; work goes straight to `main`.
