# Feature Specification: Moderation

**Feature Branch**: `015-moderation` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 15 of the LMNTLZ 1.0 set (`specs/README.md`). Keeping chat usable for a broad audience, at a volume one person can actually handle.

---

## The governing rule

> **No automated action is ever taken on a message or an account. A model scores;
> a human decides.**

That is a policy choice first — and it happens to be what makes the economics
work. **A flag blocks nothing, so latency stops mattering**, which is what allows
batching and the discounted rate.

### The classifier ranks the queue; it does not create it

**This distinction decides whether the feature helps or hurts.** At 60,000 messages
a day, a classifier at even **99% specificity produces 600 false flags** — ten
times the ~60 player reports it was meant to triage. Used to *create* work, it
makes moderation worse.

| Job | Volume | Effect |
|---|---|---|
| **Score each player report** | ~60/day | the 2–3 genuine reports sort to the top; the rest sink |
| **Proactively scan everything** | escalate **only at very high confidence** | catches what nobody reported — the one thing a report-driven queue structurally cannot do |

## What is watched

> **Racist and hate content, and overtly NSFW content. Not general profanity, and
> not rudeness.**

Deliberately narrow, because **a narrow bar is the only one a small team can
actually enforce**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player reports something and it is seen (Priority: P1)

A player reports a message. It reaches a queue where the genuinely serious items
are at the top.

**Why this priority**: Without it, chat is unmoderated in practice regardless of
what the policy says.

**Independent Test**: File reports of varying severity and confirm the ordering
puts genuine hate and NSFW first.

**Acceptance Scenarios**:

1. **Given** a reported message, **When** it enters the queue, **Then** it is scored and ranked, and the score **takes no action by itself**.
2. **Given** a mixed queue, **When** ordered, **Then** genuine hate and NSFW reports sort to the top.
3. **Given** hate/NSFW reports and ordinary friction reports, **When** queued, **Then** they **never share a queue**.
4. **Given** any classifier output, **When** processed, **Then** **no message is hidden, edited or deleted** and **no account is actioned** automatically.

---

### User Story 2 - Serious content is found even when nobody reports it (Priority: P2)

Something bad is posted in a quiet channel where nobody reports it, and it is
still caught.

**Why this priority**: The one thing a report-driven queue structurally cannot do,
and the only reason to read every message.

**Independent Test**: Post high-confidence violating content that nobody reports
and confirm it escalates.

**Acceptance Scenarios**:

1. **Given** every message, **When** classified, **Then** **nothing is sampled** — coverage is complete.
2. **Given** proactive scanning, **When** it escalates, **Then** it does so **only at very high confidence**, so it does not flood the queue.
3. **Given** classification, **When** it runs, **Then** it is **asynchronous and delays no message**.
4. **Given** Beginner chat, **When** prioritised, **Then** it receives **moderation priority over every other scope**.

---

### User Story 3 - A human takes the action (Priority: P1)

A moderator reviews a case and issues a proportionate response, with the account's
history in front of them.

**Why this priority**: Equal-first with Story 1. This is where the policy is
either real or decorative.

**Independent Test**: Work a case end to end through mute, ban and forced rename,
confirming scope, duration and escalation.

**Acceptance Scenarios**:

1. **Given** enough reports from **distinct accounts**, **When** the threshold is met, **Then** an **automatic, temporary mute** is applied — *"we are looking at this"*.
2. **Given** a ban, **When** issued, **Then** it is issued by **a human, always** — *"we looked, and decided"*.
3. **Given** a ban, **When** applied, **Then** it names a **scope** (Global only, or all chat) and a **duration**.
4. **Given** repeat offences, **When** a ban is issued, **Then** duration escalates — **1 hour · 24 hours · 7 days · 30 days · permanent** — starting where the last one left off.
5. **Given** any chat ban, **When** applied, **Then** it costs **no shards, no rating, no hold streak, no defense and no guild membership** — the player keeps playing the game and loses a room.
6. **Given** an unacceptable name, **When** actioned, **Then** a **forced rename** is applied at **no cost** to the player.

---

### User Story 4 - Outcomes reach the person (Priority: P2)

A player who has been banned, renamed or had an avatar rejected is told — even if
they never open the game again.

**Why this priority**: A moderation action nobody knows about is indistinguishable
from a bug.

**Independent Test**: Trigger each outcome and confirm notification.

**Acceptance Scenarios**:

1. **Given** a ban, forced rename or avatar decision, **When** it is applied, **Then** the player is notified.
2. **Given** an AI-drafted notice, **When** it is sent, **Then** **a human sent it** — AI drafts, never dispatches.
3. **Given** a rejected avatar, **When** notified, **Then** the player is offered a **free resubmission**.
4. **Given** any outbound notice, **When** composed, **Then** it contains **no link that grants anything**.

---

### Edge Cases

- **A coordinated false-report brigade.** The mute threshold counts **distinct accounts**, and a mute is explicitly *not a verdict*, which is why automation may issue one and never a ban.
- **A classifier that degrades at 100 items per call.** **The batch size is the knob, not the coverage** — full coverage is settled and batching is the tunable.
- **A report about a message whose replay has expired.** Reported content is retained **independently of its channel's history**, or a report outlives its own evidence.
- **A report arriving after a battle replay expired.** The permanent record survives; feature 08's retention hold covers the replay.
- **An Envoy attempting to act.** They have **no powers at all** and report exactly as any player does.
- **A player banned from Global who is fine in their own guild.** Global-only is the common case and exists precisely so a single all-or-nothing ban does not force that choice on a moderator.
- **An account-level suspension.** Distinct from a chat ban; a chat ban never touches gameplay.

## Requirements *(mandatory)*

**The classifier**

- **FR-001**: **Every** message MUST be classified; nothing MAY be sampled.
- **FR-002**: Classification MUST be **asynchronous** and MUST delay no message.
- **FR-003**: A classifier score MUST NOT hide, edit, delete or otherwise act on a message.
- **FR-004**: A classifier score MUST NOT action an account.
- **FR-005**: The classifier MUST be used to **rank** the report queue, and to escalate proactively **only at very high confidence**.
- **FR-006**: The moderation provider MUST be reached through an interface.
- **FR-007**: Batch size MUST be tunable **without reducing coverage**.

**Policy**

- **FR-008**: The watched categories MUST be **racist/hate content and overtly NSFW content** — not general profanity, not rudeness.
- **FR-009**: Hate/NSFW reports MUST NOT share a queue with ordinary friction reports.
- **FR-010**: Beginner chat MUST receive moderation priority over every other scope.

**Actions**

- **FR-011**: A **mute** MAY be issued automatically on reports from a threshold of **distinct accounts**, and MUST be short and pending review.
- **FR-012**: A **ban** MUST be issued by a human, always.
- **FR-013**: A ban MUST carry a **scope** and a **duration**, escalating **1 hour · 24 hours · 7 days · 30 days · permanent** on repeat, which requires per-account ban history.
- **FR-014**: A chat ban MUST NOT affect shards, rating, hold streaks, defense or guild membership.
- **FR-015**: A **forced rename** MUST be free to the player.
- **FR-016**: A custom avatar MUST be reviewed by a human **before** it is visible to anyone.

**Notification**

- **FR-017**: A player MUST be notified of a ban, forced rename or avatar decision.
- **FR-018**: AI MAY draft an outbound notice; **a human MUST send it**.
- **FR-019**: An outbound notice MUST contain no link that grants anything.
- **FR-020**: A rejected avatar MUST come with a free resubmission.

**Evidence**

- **FR-021**: Reported content MUST be retained **independently of its channel's retention**.
- **FR-022**: A report MUST place a retention hold on any battle replay it depends on.

### Key Entities

- **Report** — a player's flag on a message, with its classifier score and queue position.
- **Classification** — a score with no authority to act.
- **Mute** — short, automatic, pending review. Not a verdict.
- **Ban** — human-issued, scoped and timed, with escalation history.
- **Forced rename** — a free, moderation-issued name change.
- **Retention hold** — what keeps evidence alive past its ordinary window.

## Success Criteria *(mandatory)*

- **SC-001**: **Zero** automated actions are taken on any message or account.
- **SC-002**: Genuine hate and NSFW reports appear at the **top** of the queue.
- **SC-003**: Classification delays **no** message.
- **SC-004**: **100%** of messages are classified — no sampling.
- **SC-005**: A ban is **never** issued without a human decision.
- **SC-006**: A chat ban changes **nothing** about a player's gameplay standing.
- **SC-007**: A forced rename costs the player **nothing**.
- **SC-008**: **No** custom avatar is visible before human approval.
- **SC-009**: Reported content **outlives** its channel's ordinary retention.
- **SC-010**: **Zero** outbound notices contain an action link.

## Assumptions

- **Full coverage is settled; batch size is the tunable.** If classification quality degrades when judging 100 items in one pass, the batch shrinks — coverage does not.
- **Cost is roughly 1% of net revenue at any scale**, because both sides scale with players. It is not a line worth optimising.
- **Human load is the real constraint** — roughly 2 hours a day at 10k daily players, 10 at 100k. Everything here is shaped by keeping that number small.
- **A narrow bar is the only enforceable one.** Watching general profanity would multiply the queue without improving the room, and over-filtering reads as contempt and is trivially defeated.
- **A mute is not a verdict**, which is why automation may issue one and never a ban.
- **Global-only bans will be the common case.** Global is where strangers meet: highest volume, lowest stakes, most friction.
- **Chat is text-only**, so image classification exists only for custom avatars.
- **Admin tooling is owned by feature 16**; this feature defines the decisions it must support.

## Dependencies

**Upstream**: 14 (`chat`) supplies messages and reports, 05 (`auth`) supplies
accounts and the rename mechanism, 12 (`profiles`) supplies avatars, 08
(`replays`) honours retention holds, and transactional email delivers notices.

**Downstream**: 16 (`ops-admin`) provides the surface a moderator works in.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVIII** | Harm is a gate, taste is a note | **The whole feature.** FR-008's narrow bar, FR-003's *flag never act*, and FR-016's pre-moderation as the one genuine harm gate |
| **XIX** | Vendors behind interfaces | FR-006 — the classifier is swappable, which is also what keeps a later chat split mechanical |
| **XVII** | Storing is not exposing | FR-021 — reported content is retained beyond its channel, and that retention is not a licence to show it |
| **XII** | Server authority | Bans and mutes are enforced server-side, never by hiding a control |
