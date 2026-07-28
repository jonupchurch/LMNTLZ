# Specification Quality Checklist: Identity & Authentication

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

**FR-001 is the reason this feature is specified before anything with a player in
it.** The internal-identifier-versus-username decision is the archetype of
Constitution XVI: it touches every table at once, costs nothing today, and is very
expensive to retrofit. `11-social.md` upgrades it from *wise* to *required* —
**forced rename is a moderation action**, so renames are not hypothetical, and a
mutable username as the real key would make each one rewrite the schema.

**User Story 2 is priority P1 despite Steam not shipping at 1.0.** The seam is
what is P1, not the integration. Account linking retrofitted after accounts exist
means migrating live players; built now it costs almost nothing. SC-008 is the
real test — adding Steam later must require no change to any other feature.

**The absence of passwords is recorded as a property, not an omission.** Both
providers hand over a verified identity, so hashing, reset flows and email
verification do not exist here. Most of what makes authentication dangerous to
build is simply not present, which is what makes owning the rest reasonable.

**Two distinctions held apart deliberately:**

- **Linking is not merging.** Linking joins a provider to an account; merging two
  accounts with separate histories is out of scope and named as such.
- **The provider is invisible above authentication.** FR-005 and SC-003 make
  *"where did this session come from"* unanswerable outside this feature, which is
  what prevents provider knowledge leaking into gameplay.

**Data error found and fixed while writing this spec.** `11-social.md` referred
twice to *"the $260 advantage cap"* as a current fact. The cap fell to **$160**
when long passes replaced subscriptions on 2026-07-28. The four references in
`06-progression.md` correctly describe the change and were left alone.
