# Specification Quality Checklist: Simulation — Resolver

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

**The central finding is that this feature is not "the random half."** It is a
**pure function of `(seed, action log)`**. That follows necessarily from a decision
already made elsewhere: in-progress battle state is never stored, so the log is
replayed on *every* request. A live entropy source would make every turn of every
battle non-reproducible — not an edge case, the normal path.

Three requirements fall out of that and would not otherwise be obvious:

- **FR-003/FR-004 — draw order is part of the engine contract.** Adding or
  reordering a draw changes every in-flight battle's future. This is what
  `engineVersion` actually identifies, and why deploys drain first.
- **FR-007 — no client value may be an input to seed generation.** A predictable
  seed and an *influenceable* seed are the same exploit through different doors,
  and abandoning a battle is cheap, so anything retryable will be retried.
- **FR-015 — re-derivation must not become the replay path.** The seed is stored
  for investigation. Making replays re-simulate would let a balance patch change a
  past result, which is exactly what recorded packets exist to prevent.

**One design detail confirmed rather than assumed.** `CLAUDE.md` writes accuracy
as two `rand()` terms but annotates it *"one draw, not two."* That is consistent
with the boundary drawn in spec 002: the rules half folds both contest terms into
a single probability analytically, and the resolver makes one draw against it.
FR-009 and SC-007 state it explicitly, because implementing it as two rolls would
produce a different distribution while looking correct.

**SC-005 is a validation target, not a measurement.** The ~9.4% median miss across
729 pairings is simulated. It belongs here because it is the number the `+20`
attacker edge was introduced to produce — so it is the figure that detects a
regression in the accuracy model, and the one a balance change must not move
silently.
