# Specification Quality Checklist: Operations & Admin Tooling

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

**Iteration 1 — all items pass. The spec pass is complete: 16 of 16.**

**FR-007/FR-008 place the gate at irreversibility, not at risk in general**, and
that choice is what makes the tooling usable. A blanket confirm-everything rule
makes routine triage tedious enough to be avoided — which is its own safety
failure. A blanket execute-everything rule puts permanent consequences one mistake
away. Matching the gate to reversibility is the only version that survives daily
use.

**The intended operator may be an agent, and the requirements are written for
that.** FR-010's scoped capability and FR-009's logging exist because an agent
working directly against production has *every* capability and leaves *no* record.
The tooling is therefore **a guardrail rather than a convenience** — narrow tools,
a logged call each, and the reversible/irreversible split enforced by construction
rather than by care.

**Prompt injection is recorded as an edge case with the correct boundary.** The
risk is not who holds the credential but **whose text enters the model's context**
— and player-authored text is exactly what a moderation queue is made of. That is a
second, independent reason irreversible actions need a confirmation surface the
model cannot reach.

**FR-006 is a check that should never fire, and that is its value.** Under the
drain policy an engine version mismatch cannot occur routinely. Keeping the check
means that if it *ever* fires, something genuinely went wrong — an emergency
hotfix, a rollback, an accidental push — rather than it being routine noise
somebody learns to ignore.

**FR-014 generalises a lesson from feature 08.** Alarming on a job's own success
report misses the case where the job stops being invoked at all. Alarming on
*observed state* — expired-but-undeleted records — detects both. Written here as a
general rule because replay cleanup will not be the only quiet job.

**One honest correction carried forward from earlier discussion.** Propose-don't-
execute *requires* a confirmation surface, so a small operator page is unavoidable.
What is avoided by good tooling is the **expensive half** of an admin console, not
the whole of it.
