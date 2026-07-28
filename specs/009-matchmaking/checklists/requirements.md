# Specification Quality Checklist: Matchmaking, Leagues & Bots

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

**Iteration 1 — all items pass.**

**The two-axis split is the organising idea and every requirement traces to it.**
Gear **restricts**; rating **orders** and filters nobody. Holding them apart is
what lets *the pool is every defender* and *nobody faces more than 1.67× their
gear* both be true at once — they constrain different things.

**FR-001's "on placement" is load-bearing, not an optimisation.** It is what makes
*hoarding is not a sandbag* true rather than merely asserted: a sandbag exists
only where score and power move by different amounts, and banked shards are not
power until placed. Recompute at any other moment and the two drift apart, which
recreates the exploit the analysis dismissed. SC-009 tests it.

**FR-004 and FR-007 are the same principle applied twice** — a player's league and
their matching mix must depend only on their own score, never on what the
population did. Fixed thresholds give the first; measuring position against the
league's own range rather than against the population gives the second. Missing
either produces the same complaint: *"nothing about me changed and my game got
harder."*

**User Story 5 is P1 despite being a temporary state.** Every account passes
through it exactly once, and it is the largest single lever on whether a new
player reaches a second week. FR-023's warning is the piece most likely to be
dropped — it is a warning attached to *another feature's* action (joining a guild),
so it lives at a seam, and it already fell out of three regenerations of the
onboarding screen, which is why `resources/07-onboarding-flows.md` carries a
`MUST SAY` block.

**One open item recorded as an assumption, correctly.** Total bot count is a
launch-tuning number needing a real population; the *distribution* is settled. The
floor worth remembering is that a starter player fights ~140 battles in their week,
so the starter pool must be deep enough that an authored ramp reads as a ramp
rather than as six opponents on repeat.

**Diamond at ~31% is expected, not a defect** — roughly a quarter of a mature
population sits at the gear cap and those players are genuinely identical, so a
crowd there is the correct outcome. Recorded so it is not "fixed" later.
