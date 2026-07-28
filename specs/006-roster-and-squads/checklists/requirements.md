# Specification Quality Checklist: Roster & Squads

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

**This is the clearest instance of Constitution XVII in the set.** The Hidden
squad is *stored* in full and *exposed* not at all — except its hold streak, which
is exposed deliberately. Three requirements keep those apart (FR-018 – FR-020),
and SC-007 states it as a count: the composition appears in **zero** views
available to another player.

**Two commitments deliberately pull against each other**, and the spec preserves
the tension rather than resolving it: defense heroes cannot attack, and editing a
defense resets a *public* streak. Reclaiming a hero for offense therefore costs a
visible reputation. That is the design, not friction to smooth away.

**FR-010 is written for the worst case on purpose.** Three offense squads drawn
from fifteen heroes must overlap, so one defensive swap can invalidate all three.
The source says the warning should be designed for that case rather than the
single-squad one, and SC-003 tests it that way.

**Three streaks that look alike are separated explicitly.** One attack streak,
universal across squads; two hold streaks, one per zone; only the attack streak
feeds ambush. FR-013's universality is what makes the intended strategy work — a
player can shift from a counter-specific build to a robust one as their ambush
odds climb without paying for it in lost streak.

**FR-016 recorded as settled.** An ambushed loss does not reset the attack streak.
Otherwise the streak triggers the ambush and the ambush ends the streak — a player
punished twice for something they never chose.

**FR-017 promoted from a footnote.** Every streak and ambush value is live-tunable
rather than a client constant. Cheap now; a client release per tuning change
otherwise, which under the no-nerf rule is exactly the wrong shape.

**Carried forward as a risk, not a gap:** zone balance is a *testable commitment*
that cannot be tested until feature 08 records zone on every battle. If Visible
and Hidden hold rates converge, Visible wins both currencies and the choice
collapses. Named in Assumptions and cross-referenced in the Constitution table.
