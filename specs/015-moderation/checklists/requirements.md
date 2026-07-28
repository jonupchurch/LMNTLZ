# Specification Quality Checklist: Moderation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 1 — all items pass. Layer 5 complete.**

**FR-005 carries the distinction the whole feature turns on: the classifier
*ranks* the queue, it does not *create* it.** At 60,000 messages a day a
classifier at even **99% specificity produces 600 false flags** — ten times the ~60
player reports it exists to triage. Used to generate work it makes moderation
strictly worse, which is why proactive escalation is gated at *very high
confidence* while ranking is applied to everything.

**FR-003/FR-004 are a policy choice that happens to pay for itself.** Because a
flag blocks nothing, **latency stops mattering**, which is what permits batching
and the discounted rate. The economics and the ethics point the same way here,
which is worth recording — it means cost pressure will never argue for automating
an action.

**The mute/ban split is what makes automation safe at all.** A mute is short,
automatic, threshold-based on **distinct accounts**, and explicitly *not a verdict*
— *"we are looking at this"*. A ban is human, scoped, timed and escalating —
*"we looked, and decided"*. Automating the first is proportionate; automating the
second would not be.

**FR-014 is the requirement most likely to be eroded later.** A chat ban touches no
shards, no rating, no hold streak, no defense, no guild membership. Coupling
gameplay to a chat offence would make moderation a balance lever, and every future
argument for coupling them should be measured against SC-006.

**FR-016 is the one genuine harm gate in the feature**, and the contrast with
FR-008 is deliberate. Pre-moderating an avatar is justified because a bad image is
seen by *every opponent* before any report exists and removal does not undo it.
Watching general profanity is not justified on the same grounds — it is taste, it
multiplies the queue without improving the room, and it is trivially defeated.

**FR-021's independent retention closes a circular failure.** Without it a report
can outlive its own evidence: chat retention expires the message, the replay
expires at 7 days, and the case becomes unreviewable. FR-022 places the
corresponding hold on feature 08.

**The human-hours figure is recorded as the real constraint** — roughly 2 hours a
day at 10k daily players and 10 at 100k. Every design choice here is shaped by
keeping that number small, which is also why the watched categories are narrow.
