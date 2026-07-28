# Specification Quality Checklist: Defense AI

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

**Iteration 1 — all items pass. No clarifications needed.** `07-defense-ai.md` is
one of the most completely settled documents in the set; every open question in it
is struck through with its resolution.

**The specification is organised around the hazard rather than the mechanism**,
because the mechanism is simple and the hazard is not. *A power fires only when
everything above it is on cooldown*, and tier 0 has cooldown 0 and no gate — so
anything below tier 0 never fires. **Only 3% of the 720 orderings keep a whole kit
live**, a median of 13 per hero.

That drives three requirements that would not otherwise exist:

- **FR-018** — the builder must show which powers will actually fire. Recorded in
  the source as *"the difference between a lever and a trap"*, and it is the one
  requirement here whose absence would make the feature actively harmful.
- **FR-015** — defaults must come from the 12 orderings safe on all 27 heroes,
  every one of which ends `1·0`. Structural, not stylistic.
- **FR-019** — a self-defeating ranking is **permitted and surfaced**, not blocked.
  Constitution XVIII: the harm is the player not knowing, so the fix is telling
  them, not refusing them.

**One implementation trap promoted to a requirement.** FR-020 forbids assuming at
most two enemy rows are reachable. It is true at base reach and false the moment a
reach-granting rune fires, and it is the kind of assumption that gets hard-coded
early and discovered late. The source flags it explicitly; the spec makes it
testable via SC-008.

**Scope boundary recorded:** this feature owns the AI's *decision logic*. Feature
03 supplies its randomness so choices stay replayable, and feature 06 hosts the
configuration interface. The firing-profile display (FR-018) is specified here
because it is a statement about engine behaviour, and rendered there.
