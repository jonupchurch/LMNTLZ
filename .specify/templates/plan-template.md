# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Part II of `.specify/memory/constitution.md`. Answer each: **PASS**, **N/A**, or
**VIOLATION** — a violation goes in the Complexity Tracking table below with its
justification, or the plan changes.

| # | Constraint | The test | Verdict |
|---|---|---|---|
| XII | **Server authority & the seed boundary** *(NON-NEGOTIABLE)* | Can a modified client change an outcome, learn a future roll, or read a value it was not issued? Is RNG confined to the resolver? Is in-progress battle state re-derived rather than stored? | |
| XIII | **One rules engine** *(NON-NEGOTIABLE)* | Does anything compute a rule outcome outside `packages/sim`'s rules half? | |
| XIV | **Balance upward** | Does this lower a number a player has already spent on? If so, where is the compensating grant? | |
| XV | **Derived data is generated** | Does any file carry a hand-written bane, fault, or matrix cell? Are the three distinctness rules schema-validated? | |
| XVI | **Cannot be backfilled** | Could each new persisted field be added later and still answer the question it exists for? If no, it ships with the first record. | |
| XVII | **Storing is not exposing** | Does this change what is *recorded*, what is *exposed*, or both? Answered separately? | |
| XVIII | **Harm is a gate; taste is a note** | For every restriction: name the harm. If you cannot, it is a warning, not a block. | |
| XIX | **Vendors behind interfaces** | Does feature code name a vendor? Are entitlements account-level rather than per-storefront? | |
| XX | **Written docs are canon** | Is every rule this plan relies on written in `docs/` or `resources/mechanics/` — not only in a `.dc.html`? | |

> **XVI is the one that cannot be retrofitted.** The others are expensive to
> undo; a field missing from the first record is missing from the history the
> first balance pass reads. Check it hardest.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
