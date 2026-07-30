# Specification Quality Checklist: The Design Port

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

> **Note on the two named files.** `base.css` and `index.html` are cited in *Why
> this is a feature* because the font defect is **evidence for the feature
> existing**, not a requirement. No FR or SC names a file, a framework or a
> language. The inventory table names client components for the same reason — it
> is the scope boundary, stating which surfaces exist to be ported.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — *the one open question (Q1,
      navigation fidelity) was answered 2026-07-30 and is recorded as resolved*
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded — *eleven surfaces in, five designs out, two
      documents out, and each named*
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Constitution Check (Part II)

| # | Constraint | Bearing on 017 |
|---|---|---|
| XII | Server authority · seed boundary | Not touched — presentation only |
| XIII | One rules engine | **Constrains**: FR-008, the cooldown ring is turns, never a clock |
| XIV | Balance upward | Not touched — no number moves |
| XV | Derived data is generated | **Constrains**: FR-007, colour derives from the force and is never passed in |
| XVI | The past is immutable | Not touched |
| XVII | Storing is not exposing | Not touched |
| XVIII | Harm is a gate; taste is a note | Not touched |
| XIX | Dependencies behind interfaces | **Bears**: fonts self-hosted, no third-party font service |
| XX | The written docs are canon | **Governs directly**: FR-014, FR-015, SC-008 |

## Notes

- **Q1 resolved 2026-07-30.** The designed rail is adopted with real destinations
  only; `CODEX` joins as US5, `THE COURT` and `DISPATCHES` are carried out.
- **The spec is ready for `/speckit-plan`.** No markers remain and every other
  ambiguity was resolved to a stated assumption.
- **⚠️ A systematic canon discrepancy was found during specification and logged in
  `resources/README.md` on 2026-07-30.** The design library draws effectiveness as
  **four tiers** where canon has **five**: `FAULT ×1.2` (canon ×1.25) appears in
  `Codex`, `Design System`, `Hero Card` and `Turn Sequence`, and the ×0.80
  secondary resist appears in **none of the twenty exports**. Per Constitution XX
  nothing was rewritten; canon wins and the exports are left to be regenerated.
  FR-019 makes the class of defect unrepeatable by requiring every player-visible
  multiplier to be read from the generated matrix at render time.
- **This is the strongest available argument for the feature's own guard.** The
  exports were treated as reference for four months and this sat unnoticed; the
  first pass that read them as designs found it in twenty minutes.
