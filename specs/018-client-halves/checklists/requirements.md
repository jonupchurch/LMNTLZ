# Specification Quality Checklist: The Client Halves

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

> **Note on the named routes.** SC-008 names five route paths because the
> **gap audit is the acceptance test** — the scan that found these gaps is what
> proves them closed. That is a measurable outcome expressed in the only vocabulary
> that can express it. No FR names a file, framework or language.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded — six items are named and pushed out explicitly
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Constitution Check (Part II)

| # | Constraint | Bearing on 018 |
|---|---|---|
| XII | Server authority · seed boundary | **Constrains**: FR-010, price and eligibility are decided server-side |
| XIII | One rules engine | Not touched — no rule is evaluated client-side |
| XIV | Balance upward | Not touched |
| XV | Derived data is generated | **Constrains**: FR-001, FR-006, no number transcribed into a view |
| XVI | The past is immutable | **Governs**: FR-014, replays play from the log; no re-simulation path |
| XVII | Storing is not exposing | **Bears**: FR-013, a non-participant is not told the battle exists |
| XVIII | Harm is a gate; taste is a note | Not touched |
| XIX | Dependencies behind interfaces | **Bears**: the provider stays behind `PaymentRail` (011 T031) |
| XX | The written docs are canon | Bears — the store has no export and none is invented |

## Notes

- **Two things this feature deliberately cannot fix**, both flagged in the spec:
  the **store has no design** (the only screen that takes money, and no export
  exists), and there is still **no payment provider adapter** (011 T031), so
  `POST /checkout` raises `NoRailError` in production today. US2 specifies behaviour
  completely and depends on both.
- **SC-008 makes the audit the acceptance test.** `py tools/gap-audit.py` reported
  these five routes as unreachable on 2026-07-30; the feature is done when it stops.
- Ready for `/speckit-plan`.
