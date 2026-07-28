# Specification Quality Checklist: Replays & the Battle Record

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

**Iteration 1 — all items pass. No clarifications needed.**

**This is the canonical Constitution XVI feature, and FR-008 is the whole point.**
Four fields — turn count, both squads, the bot flag, and league-and-rating at the
time — must exist from the first battle ever written. They are not merely
expensive to add later; they are **impossible**, because they describe battles that
have already happened. `specs/README.md` flags this record as written by four
features and read by four more, which is why its shape is settled here rather than
negotiated eight times.

**FR-005 was not in the original stack note and earns its place.** Without a bot
flag every aggregate is polluted by **our own authored loadouts**, which are not
player choices and would read as meta signal. A pick-rate table that silently
includes the bots we designed is worse than no pick-rate table, because it looks
usable.

**User Story 4 is what makes a 7-day window defensible.** Seven days is shorter
than a dispute; a report can arrive on day 3 and still be open on day 12. Without
the retention hold, correct retention would be set by the slowest appeal rather
than by what players actually watch — which is how a 7-day window silently becomes
a 90-day one for no gameplay benefit.

**FR-014's query-not-listing rule is a source-of-truth decision, not an
optimisation.** Driving cleanup from a file listing would make the *storage* the
authority on retention, which is the second-source-of-truth problem this
architecture refuses everywhere else. Driving it from records makes it
deterministic, resumable and re-runnable — FR-015 and SC-009.

**FR-017 targets the real failure mode.** A cleanup job that silently stops breaks
nothing visible; storage simply grows. Alarming on the *job* would miss it, so the
alarm is on the **count of expired-but-undeleted records**, which is one query
against data already held.

**The two rules that look contradictory are both stated, adjacently.** The record
carries squad composition for both sides (FR-004); CSV export carries none, either
side, and no embed may ever show a Hidden defense. Constitution XVII exists for
exactly this pair — *storing is not exposing* — and the Edge Cases and Assumptions
both say so, so a later reader cannot mistake one for a relaxation of the other.
