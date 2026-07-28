# Specification Quality Checklist: Payments, Passes & Entitlements

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

**Iteration 1 — all items pass.** Neither the vendor nor the prices are named as
implementation direction in the requirements themselves; the vendor sits behind an
interface by requirement, and the assumptions record the reasoning.

**Layer 4 complete.**

**FR-002's additive stacking is the requirement most likely to be implemented as
replacement**, which is the natural default and would be wrong in a way players
would feel immediately: topping up early would destroy time already paid for.
Stated twice — FR-002 and SC-009 — because *"extends, never resets"* is the whole
reason no renewal reminder is needed.

**SC-001 is a product promise expressed as a test.** *A ceiling players can audit*
only holds if the storefront cannot quietly breach it, so the ceiling is verified
from the catalogue rather than asserted in copy. FR-004 (no shard sales), FR-005
(the dual-price rule) and FR-006 (nothing else touches a battle) are the three
doors it could otherwise leak through, and all three are closed explicitly.

**FR-013's exactly-once is not generic robustness.** Payment notifications are
retried by design, so duplicate delivery is the expected case rather than a
failure. Granting twice would hand a player double time for one payment, which is
a revenue defect and a support case at once.

**User Story 2 is P1 despite Steam not shipping at 1.0** — same reasoning as
spec 005. Account-level entitlements retrofitted after purchases exist means
migrating **real money records**, which is materially worse than migrating
gameplay state. SC-008 is the test that matters: a second rail must require
changes in this feature only.

**The removal of subscriptions is recorded as what it bought**, since the cost is
real and someone will eventually propose reinstating them: gone are auto-renewal
regulation in three jurisdictions, dunning, *"I forgot I was subscribed"*
chargebacks — which land on an account whose ratio matters — and the awkward 4-week
billing interval, because a one-time purchase has no cycle. What was given up is
recurring revenue and renewal-by-inertia, stated plainly in Assumptions rather
than glossed.

**Stale-number warning carried forward:** every ARPU figure fell 38% when the
ceiling went from $260 to $160. Any revenue number predating 2026-07-28 is wrong.
