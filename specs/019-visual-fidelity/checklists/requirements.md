# Specification Quality Checklist: Visual Fidelity

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

Three items were judged carefully rather than waved through, because this is a
**visual** spec and the usual "no implementation details" rule cuts oddly here.

**1. `clip-path` and `box-shadow` appear in the spec, and that is deliberate.**
They read as implementation, and normally would be. Here they are the *evidence*:
they are what `tools/design-audit.py` counts, and SC-001 is stated in terms of
that count. Quoting the polygon that draws a shield is the only way to make
FR-001 — *"family MUST be distinguishable by silhouette alone"* — checkable
rather than a matter of taste. The requirement itself is stated in outcomes; the
CSS is cited as the measurement, in the "why" section and the edge cases.

**2. SC-002 requires a human judgment, and no better version exists.** *"A viewer
identifies no structural difference"* cannot be automated: the audit counts
vocabulary and explicitly cannot see spacing, density, or whether a shape landed
on the right element. Its own header says the count is a floor, never a pass
mark. Making SC-002 machine-checkable would mean pretending the tool measures
something it does not — the failure mode `06-progression.md` calls *"a function
returning a constant is a claim, not a measurement."* Left as a read-through, and
paired with SC-001 which *is* mechanical.

**3. FR-012's "stated budget" has no number yet.** The number belongs in the
plan, not the spec: it depends on format choices (WebP vs AVIF), on how many
portraits a roster grid shows at once, and on whether the detail view lazy-loads.
Fixing a number here would either be arbitrary or would decide the
implementation. The requirement — *a budget exists, is stated, and is not
exceeded* — is testable once the plan names it.

No [NEEDS CLARIFICATION] markers were needed. The one genuine ambiguity — how
literally to read *"exactly"* — is resolved in Assumptions with an explicit
interpretation and an invitation to tighten it, rather than by blocking on a
question whose answer would not change the first two user stories.
