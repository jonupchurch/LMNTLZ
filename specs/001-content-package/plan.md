# Implementation Plan: Content Package

**Feature**: `001-content-package` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 2 · Hero

## Summary

Ship the 27-hero roster as **validated, versioned, loadable data** with weaknesses
and effectiveness **derived rather than authored**. The workbook is the source of
truth; a build step reads it, derives, validates and emits. Nothing else in the
game can begin until this exists.

## Technical Context

**Language**: TypeScript (strict) · **Package**: `packages/content`
**Validation**: Zod · **Testing**: Vitest · **Project type**: library, headless
**Storage**: none — data is compiled into the package
**Authoring**: `resources/characters/hero-stats.xlsx` → build step → emitted data
**Scale**: 27 heroes · 9 types · 162 powers · 60 legal type pairings

**Performance**: validation runs at build time, not per request. A consumer
importing the package pays a module load, not a parse.

**Constraints**: no runtime dependency on the workbook — the build step's output
is what ships.

## Constitution Check

*GATE: passed before Phase 0. Re-check after Phase 1.*

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **N/A** | No RNG, no client/server split — the same data ships to both |
| XIII | One rules engine | **PASS** | Effectiveness is derived here and nowhere else |
| XIV | Balance upward | **PASS** | Values are replaceable without touching a consumer (SC-008) |
| XV | Derived data is generated | **PASS** | **The feature.** Two authored fields; bane, fault and effectiveness computed |
| XVI | Cannot be backfilled | **PASS** | `contentVersion` ships from the first battle recorded |
| XVII | Storing is not exposing | **N/A** | No player data |
| XVIII | Harm is a gate | **N/A** | No player-facing restriction |
| XIX | Vendors behind interfaces | **N/A** | No outbound dependency |
| XX | Written docs are canon | **PASS** | Reach values from a generated screen are treated as proposals |

**No violations. Complexity Tracking is empty.**

## Project Structure

```text
packages/content/
├── src/
│   ├── types.ts          the nine damage types, families, the counter bijection
│   ├── schema.ts         Zod schemas + the three distinctness rules
│   ├── effectiveness.ts  the five multipliers, derived per (attackType, hero)
│   ├── heroes.generated.ts   emitted by the build step — committed
│   ├── version.ts        contentVersion, derived from the authored source
│   └── index.ts          public surface
├── tests/
│   ├── derivation.test.ts    60-of-72, all 27 heroes, melee⇒magic consequence
│   ├── effectiveness.test.ts 243 hero × attackType combinations
│   └── schema.test.ts        every rejection names its rule
└── package.json

tools/
├── build-content.ts      xlsx → validate → emit heroes.generated.ts + MATCHUPS.md
└── build-hero-stats.py   NEUTRALIZED — see Phase 0
```

**Structure decision**: a single headless package with no runtime dependencies.
The build step lives in `tools/` because it runs at author time, not build time
for consumers.

## Phase 0 — Research

Three things to settle before writing code.

1. **Neutralize `tools/build-hero-stats.py` (FR-018).** It overwrites the workbook
   and its only guard is a docstring. Decide between deleting it, renaming it to
   something unmistakably destructive, or gating it behind a flag that normal
   invocation cannot supply. **Deleting is preferred** — it has done its job.
2. **Confirm the workbook's readable shape.** Column positions are set by the
   existing generator; the reader must key on headers rather than indices, or a
   column insert silently shifts every stat.
3. **Decide `contentVersion`'s derivation (FR-020).** A hash of the *authored
   source* rather than of the emitted output, so editing the workbook moves it
   even when regeneration is byte-identical.

## Phase 1 — Design

**Data model**: `specs/data-model.md` § 2. Nothing here extends it.

**Contracts** — the package's public surface:

```
getHero(id)            → Hero with derived fields populated
getAllHeroes()         → all 27
counter(type)          → the type that beats it
effectiveness(attackType, defender) → 1.5 | 1.25 | 1.0 | 0.8 | 0.5
contentVersion()       → the stamp
```

**The one design rule**: `effectiveness` takes a *hero*, not a type. Effectiveness
depends on the defender's **two** authored types, so a type-versus-type table
cannot express Fault or the ×0.80 secondary case.

**Quickstart**: `pnpm --filter content build` regenerates from the workbook;
`pnpm --filter content test` runs the derivation suite.

## Phase 2 — Notes for `speckit-tasks`

**Order that matters**: types and `counter` → schema and the three rules → the
60-of-72 test → the reader → emission → effectiveness → `contentVersion`.

**Write the 60-of-72 test before the reader.** It is a pure property of the rules
and needs no data, so it can be red before any workbook exists — and it is the
test that proves FR-006 is a consequence rather than a separate check.

**CI (FR-019)**: regenerate and fail if the emitted file differs from what is
committed. This is what makes the build step safe rather than merely convenient.
