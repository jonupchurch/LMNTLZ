# Feature Specification: Operations & Admin Tooling

**Feature Branch**: `016-ops-admin` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 16 of the LMNTLZ 1.0 set (`specs/README.md`). Running the game — maintenance windows, scheduled jobs, and the tools an operator uses to act on what features 08 and 15 surface.

---

## What this feature is for

Everything else in the set produces work: a moderation queue, an avatar review, a
succession request, a replay to expire, a maintenance window to open. **This
feature is where a person — or an agent acting for them — does that work safely.**

> **Reversible actions execute; irreversible ones propose.**

A 24-hour mute, an avatar rejection with a free resubmit, a queue triage — done
directly, because the worst case is an inconvenience undone in a click. **A
permanent ban, a forced rename, a guild succession** — written as *pending*
actions confirmed on a small surface that automation cannot reach.

**Matching risk to reversibility rather than applying a blanket rule is what makes
this usable at all.** A blanket confirm-everything rule makes routine triage
tedious enough to be avoided; a blanket execute-everything rule puts permanent
consequences one mistake away.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deploy costs nobody anything (Priority: P1)

An operator opens a maintenance window. Battles in flight finish, new ones are
refused, and nobody loses anything they had.

**Why this priority**: It happens on every release, and getting it wrong generates
support tickets from players who did nothing wrong.

**Independent Test**: Move through all three states with battles in flight and
confirm the behaviour and the refunds.

**Acceptance Scenarios**:

1. **Given** the flag, **When** read, **Then** it holds exactly one of **`live`**, **`draining`** or **`down`**.
2. **Given** `draining`, **When** it is set, **Then** new battles are refused and in-flight battles are allowed to finish.
3. **Given** a drain period before a window, **When** it is long enough, **Then** nearly every in-flight battle finishes on its own and almost nothing is discarded.
4. **Given** `down`, **When** a battle is discarded, **Then** it is a **complete no-op** with a full refund of whatever it cost to start.
5. **Given** the flag, **When** it is changed, **Then** it takes effect **without a deploy**.

---

### User Story 2 - An operator works the queue (Priority: P1)

A moderator opens the queue, sees the most serious cases first, and resolves them
— with the risky actions requiring a deliberate second step.

**Why this priority**: Equal-first. Feature 15's policy is only real if there is
somewhere to enact it, and banning a cheater must be possible before the ladder
means anything.

**Independent Test**: Perform one reversible and one irreversible action and
confirm the different paths.

**Acceptance Scenarios**:

1. **Given** a reversible action — a temporary mute, an avatar rejection, a triage — **When** taken, **Then** it **executes directly**.
2. **Given** an irreversible action — a permanent ban, a forced rename, a guild succession — **When** taken, **Then** it is written as a **pending action** requiring confirmation on a surface automation cannot reach.
3. **Given** any administrative action, **When** taken, **Then** it is **logged** with who, what and when.
4. **Given** an operator, **When** they act, **Then** their capability is **scoped** — they hold the tools they need, not unrestricted access.

---

### User Story 3 - Scheduled work runs, and is noticed when it stops (Priority: P2)

Replay cleanup and succession timers run on schedule, and a silent failure is
detected.

**Why this priority**: These jobs fail quietly. Nothing breaks when replay cleanup
stops — storage simply grows — which is precisely why it needs a detector rather
than a log line.

**Independent Test**: Disable a scheduled job and confirm the alarm fires from
observed state rather than from the job's own reporting.

**Acceptance Scenarios**:

1. **Given** replay cleanup, **When** it runs, **Then** it selects by **querying permanent records**, never by listing stored files.
2. **Given** cleanup interrupted partway, **When** re-run, **Then** it resumes safely with no side effects.
3. **Given** cleanup that has silently stopped, **When** monitoring runs, **Then** the alarm is on the **count of expired-but-undeleted records**, not on the job reporting success.
4. **Given** a succession timer, **When** its window elapses, **Then** the pending outcome is surfaced for confirmation rather than executed automatically.

---

### User Story 4 - A problem in a player's browser is visible (Priority: P2)

A player's client throws an error and it reaches us without them filing a ticket.

**Why this priority**: A client-side crash produces **no server log at all**. It is
otherwise invisible.

**Independent Test**: Trigger a client error and confirm it is reported, grouped
and legible.

**Acceptance Scenarios**:

1. **Given** an unhandled client error, **When** it occurs, **Then** it is reported without the player doing anything.
2. **Given** a reported error, **When** examined, **Then** its stack trace is **legible rather than minified**.
3. **Given** errors, **When** grouped, **Then** they are attributable to a **release**, so *"this started at deploy X"* is answerable.
4. **Given** server errors, **When** they occur, **Then** they are reported to the same place.

---

### Edge Cases

- **A maintenance window that runs long.** The flag is the control; extending is changing a value, not shipping code.
- **An engine version mismatch on an in-flight battle.** Should never fire under the drain policy — **which is what makes it useful**. If it fires, something genuinely went wrong rather than routinely.
- **An operator acting on their own account.** Should be prevented or at minimum conspicuously logged.
- **A pending irreversible action nobody confirms.** Expires rather than lingering indefinitely.
- **An agent operating the tools.** The intended audience. Its capability is the scoped tool set, and every call is logged — **the tooling is the guardrail, not the convenience**.
- **Prompt injection through player-authored text.** The boundary is *whose text enters the model's context*, not who holds the credential — which is another reason irreversible actions require a human confirmation the model cannot reach.

## Requirements *(mandatory)*

**Maintenance**

- **FR-001**: The maintenance flag MUST support exactly three states — `live`, `draining`, `down`.
- **FR-002**: `draining` MUST refuse new battles while permitting in-flight ones to finish.
- **FR-003**: `down` MUST refuse everything and discard in-flight battles.
- **FR-004**: A discarded battle MUST be a complete no-op with a full refund.
- **FR-005**: Changing the flag MUST NOT require a deploy.
- **FR-006**: An engine version mismatch check MUST remain in place even though the drain policy should prevent it firing.

**Administrative actions**

- **FR-007**: Reversible actions MUST execute directly.
- **FR-008**: Irreversible actions — permanent ban, forced rename, guild succession — MUST be written as **pending** and confirmed on a surface automation cannot reach.
- **FR-009**: Every administrative action MUST be logged with actor, action and time.
- **FR-010**: Operator capability MUST be **scoped** — narrow tools rather than unrestricted access.
- **FR-011**: A pending irreversible action MUST expire rather than lingering indefinitely.

**Scheduled work**

- **FR-012**: Replay cleanup MUST select by querying permanent records, never by listing stored files.
- **FR-013**: Scheduled jobs MUST be resumable and safe to re-run.
- **FR-014**: Monitoring MUST alarm on **observed state** — such as expired-but-undeleted records — rather than on a job's self-reporting.
- **FR-015**: Succession timers MUST surface an outcome for confirmation rather than executing automatically.

**Error reporting**

- **FR-016**: Unhandled client errors MUST be reported without player action.
- **FR-017**: Reported errors MUST carry legible stack traces.
- **FR-018**: Errors MUST be attributable to a release.
- **FR-019**: Server errors MUST report to the same place as client errors.

### Key Entities

- **Maintenance flag** — one of three states, changeable without a deploy.
- **Administrative action** — an operator-initiated change, classified as reversible or irreversible.
- **Pending action** — an irreversible action awaiting human confirmation, with an expiry.
- **Audit entry** — the log of who did what, when.
- **Scheduled job** — recurring work with a state-based health check.

## Success Criteria *(mandatory)*

- **SC-001**: A maintenance window costs an affected player **nothing** — no rating, no rewards, no consumed attempt.
- **SC-002**: The flag can be changed **without a deploy**, every time.
- **SC-003**: **Zero** irreversible actions can be taken without a human confirmation step.
- **SC-004**: **100%** of administrative actions are logged.
- **SC-005**: A silently failing scheduled job is detected from **observed state**.
- **SC-006**: A client-side crash reaches us **without** the player filing a ticket.
- **SC-007**: An error can be attributed to the release that introduced it.
- **SC-008**: An interrupted cleanup can be re-run with **no** side effects.

## Assumptions

- **Admin tooling is owned rather than bought.** Nothing is needed on day one, but banning a cheater must be possible before the ladder means anything.
- **The intended operator may be an agent, not a person at a console.** That is why the reversible/irreversible split is enforced **by construction** rather than by care — structured, scoped, audited access is safer than ad-hoc access, and an agent working directly against production has every capability and leaves no record.
- **A confirmation surface exists regardless.** Propose-don't-execute requires somewhere to confirm, so a small operator page is unavoidable — what is avoided is the *expensive* half, not the whole of it.
- **The tooling is a guardrail, not a convenience**, and is explicitly **not on the critical path**.
- **The drain period is roughly 15 minutes**, long enough that nearly every in-flight battle finishes on its own.
- **If the storage provider offers lifecycle expiry**, the cleanup job disappears and FR-012's query becomes the verification rather than the mechanism.
- **Deploys are scheduled**, which is what keeps a single battle from being resolved by two engine versions.

## Dependencies

**Upstream**: 07 (`battle`) honours the flag, 08 (`replays`) defines what cleanup
selects, 15 (`moderation`) defines the actions, 13 (`guilds`) defines succession,
05 (`auth`) supplies operator identity.

**Downstream**: none — this is the top of the graph.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority | FR-010 — scoped capability; an operator tool is not a bypass of the rules |
| **XVIII** | Harm is a gate, taste is a note | FR-007/FR-008 — the gate is placed at **irreversibility**, which is where the harm is |
| **XIX** | Vendors behind interfaces | Error reporting and scheduling are reached through interfaces |
| **XVI** | Cannot be backfilled | FR-009 — an audit trail cannot be reconstructed after the fact |
