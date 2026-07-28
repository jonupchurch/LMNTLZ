# Specification Quality Checklist: Public Profiles & Data Export

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

**FR-003 is the requirement most likely to be implemented wrongly while looking
right.** *"Show the last 20 Visible battles"* implemented as *"take the last 20
battles and remove the Hidden ones"* produces a list that leaks the Hidden count
three separate ways: it is short, it has a visible time gap, and its total does
not reconcile with anything else on the profile. **An absence that can be measured
is not an absence.** FR-003 is therefore phrased as *selected, never filtered*, and
SC-002 tests the leak rather than the mechanism.

**FR-007 drops squad composition from *both* sides of an export**, which is
stricter than strictly necessary and deliberately so. Adjudicating one side —
exporting the opponent's squad only when it was Visible — requires a conditional
in that column, and a conditional in that column eventually has a bug whose
consequence is a leaked Hidden squad. Dropping both is one rule with no branch.

**The guild-officer narrowing did more than limit scope.** Restricting an officer's
export to event data is a direct application of *aggregation is a privacy change
even when every row is individually public* — and it also **decoupled export from
profile visibility**, so the two no longer constrain each other. Recorded in
Assumptions because the decoupling is easy to lose.

**FR-013 is a harm gate, not a taste gate**, and the distinction matters under
Constitution XVIII. Pre-moderation is justified because a bad image is seen by
*every opponent* before any report arrives, and removal afterwards does not undo
having been seen. That is a harm that cannot be repaired, which is exactly the bar
XVIII sets. Contrast the guild emblem's contrast check, which is taste and
therefore only warns.

**A fixed profile is recorded as a choice with a reason.** Configurable visibility
sounds friendlier and would be worse here: in a game where everyone owns the same
27 heroes, a hidden field is itself information, and the design would spend its
scouting mechanic on a privacy toggle nobody asked for.
