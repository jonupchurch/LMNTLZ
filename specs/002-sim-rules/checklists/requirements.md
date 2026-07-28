# Specification Quality Checklist: Simulation — Rules

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

Every formula this feature specifies was already decided and recorded
(`CLAUDE.md`, `resources/mechanics/01`–`05`), so there was nothing to guess. The
work was locating the **rules/resolver boundary** precisely rather than inventing
behaviour.

**The boundary as drawn:** rules compute **probabilities and ranges**; the
resolver **draws** from them. That is sharper than "no RNG in rules" and it is
what makes FR-004 possible — a client can show *82% to hit* while being unable to
discover whether this attack lands. Both halves of Constitution XII fall out of
it.

**Two phrasings reconciled, no defect.** `CLAUDE.md` says *"a hero's own rows
count against its reach"*; the Turn Sequence screen says *"target's row counted,
actor's not."* `02-squads.md` is precise and both are right at different levels —
the actor's **own row** is excluded, while the actor's **own side's other rows**
are counted, which is what makes a back-line hero unable to reach at all. FR-005
uses the precise form.

**Scope calls worth recording:**

- **Turn *order* is here; turn *outcomes* are not.** The accumulator is fully
  deterministic, so it belongs to the pure half despite feeling like battle flow.
- **Phase order and skip conditions are here; phase execution is not.** The
  sequence is a rule; contesting a rider against `Resolve` is a draw.
- **The 300-turn cap is here.** Given a state, whether the cap has been reached
  and who wins are both single-answer questions.
- **Reactive powers are named but unpopulated** — no hero has one yet. Recorded as
  an assumption rather than a gap, since authoring belongs to the numbers pass.

**One success criterion is deliberately a ratio, not a constant.** SC-007 states
Speed 45 acting 1.46× as often as Speed 15 rather than naming tick counts,
because the values move in the hero-numbers pass and the relationship must not.
