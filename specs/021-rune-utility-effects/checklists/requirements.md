# Specification Quality Checklist: Rune Utility Effects

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs) — *see note 1*
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders — *see note 2*
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain — *see note 3*
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
- [X] No implementation details leak into specification — *see note 1*

## Notes

**1. The evidence table cites files and line numbers, deliberately.**
*Why this feature exists* names `progression/runes.ts:377`, `board.ts:82` and the
grep that returns zero matches. That is a documented departure from the template's
"no implementation details" rule, taken for two reasons: it matches the house
style set by `020-status-and-passives/spec.md`, which opens the same way, and the
central claim of this feature is *"the code charges for a thing it never
writes"* — a claim that is worthless unasserted and trivial to check when cited.
Per AGENTS.md rule 3, the repo's own convention wins. **The Requirements and
Success Criteria sections are free of file paths and framework names**, which is
where the rule earns its keep.

**2. The TL;DR is the non-technical entry point.**
Per AGENTS.md rule 11, the spec opens with a plain-language summary — what a rune
is, what a player pays, and what they do not get — before any mechanics. The body
below it is written for whoever implements the feature.

**3. Zero clarification markers; four flagged assumptions instead.**
Four questions arose that resolve a genuine conflict rather than fill a gap:

| | Conflict | Default taken |
|---|---|---|
| A-02 | `Held in the Light` grants a guaranteed hit; the 65–95% clamp is universal | narrow per-pair exception, clamp stays universal elsewhere |
| A-03 | `Weight Tells` says "cannot be moved"; no displacement mechanic exists | inert clause, documented, no movement system invented |
| A-04 | `On the Same Breath` could chain killing blows unbounded | one extra action, cannot itself grant another |
| A-05 | Counter-pair `Nowhere to Stand` vs `No One Saw` — which wins | the negating effect wins, per the design calling it the *answer* |

Each is recorded as an assumption **and** repeated under *Flags*, so the work is
not blocked but the four are visible for confirmation. This follows the standing
instruction to flag rather than block on a long run.

**4. One correction made during validation.**
The first draft claimed *"two pools (Water, Light) would have zero
offensive-or-tempo options"* without US2. Counted against the classification, that
was wrong: **Water is empty entirely (0 of 3)** and seven pools drop to exactly
one effect. Replaced with the per-pool table, which is checkable.

**5. One correction made to the feature description itself.**
The description given to `/speckit-specify` said three probabilistic effects.
There are **four** — `Both Ways` is a 25%-when-struck roll. Counted from the
catalog table rather than the summary of it. Recorded under *Flags*.

## Status

**PASS** — ready for `/speckit-plan`. No blocking issues.
