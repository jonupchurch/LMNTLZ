# Specification Quality Checklist: Status Effects and Passives

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — **with a noted deviation, see Notes**
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

### The one deviation, stated rather than glossed

**This spec names files.** `packages/sim/rules`, `resolve.ts`, `power-targeting.json`
and the `Power` record all appear by name, which the generic template discourages.

It is deliberate and it follows the house convention — `019-visual-fidelity/spec.md`
names `TypeBadge`, `clip-path` and `tools/design-audit.py` in the same way. The reason
it is right here specifically: **this feature's central fact is an absence in a
particular place.** "The status layer does not run" is not actionable; *"`resolve.ts`
returns `ridersLanded: []` hardcoded at every exit and `Power` has no rider field"* is
both checkable and falsifiable, and it was arrived at by grep rather than by memory.
Removing the names would make the spec shorter and its central claim unverifiable.

The **requirements** (FR-001…FR-028) are written against behaviour, not against files,
and none of them names a module. That is the line held.

### Where the numbers came from

Counts in the spec are measured, not estimated:

- **87 active powers, 40 passives** — read from the workbook's `Power List` sheet.
- **21 of 40 passives carry effect text** — 4 role + 9 house + 8 unique.
- **~61 of 87 powers carry a rider** — the 8 tier-0 autos state they have none; 18
  tier-1/2 powers carry an explicit `Rider:` clause; the remainder describe effects in
  prose. **The prose count is the soft one** and the Assumptions section says so: the
  `Rider:` marker is a tier-1/2 convention only, so a regex over the prompt column gives
  a plausible and wrong answer. Authoring is a per-power read.

### Ready for `/speckit-plan`

No clarifications outstanding. The one judgement call a plan must make — where rider
data lives — is argued in Assumptions with a recommendation (the existing overlay) and
the reason the alternative (new workbook columns) is out of scope.
