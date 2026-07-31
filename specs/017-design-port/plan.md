# Implementation Plan: The Design Port

**Branch**: `017-design-port` *(no branch — straight to `main`)* | **Date**: 2026-07-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-design-port/spec.md`

## Summary

Make the built product look like the designed product. Twenty finished screen
exports have been unused since July; the client borrowed the nine force colours and
nothing else. Three of the five stories are pure deficit repair — **the type
families are declared and never loaded**, there is one shared component, and none
of the 99 icons is referenced. The other two port the Design System export into a
real component layer and rebuild eleven screens on it.

**Approach**: bottom-up and in dependency order. Type and tokens first (they change
every screen for free), then the component layer, then the screens that consume it.
The port is transcription with judgement — hex to existing token, `style-hover` to a
real state — with **one deliberate departure**: the design library draws the
effectiveness ladder as four tiers where canon has five, and canon wins.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict` plus `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`

**Primary Dependencies**: React 19 · Vite 8 (`base: './'`, relative assets for the
Steam-from-disk build) · Tailwind v4 via `@tailwindcss/vite`, tokens in
`@theme` · `@lmntlz/content` for heroes and the generated effectiveness matrix ·
**new**: `@fontsource/{chakra-petch,barlow,jetbrains-mono}`

**Storage**: N/A — presentation only. No schema, no migration, no persisted field.

**Testing**: Vitest + `@testing-library/react` + `jsdom` for components; Playwright
for the existing end-to-end passes, which must stay green unchanged

**Target Platform**: Desktop browser at 1.0; the same bundle inside Electron for
Steam as a fast-follow. Mouse and keyboard only.

**Project Type**: Client-only feature inside a pnpm + Turborepo monorepo

**Performance Goals**: No regression in first paint. Nine self-hosted font faces,
`latin` subset, `font-display: swap`. Icons resolved at build time, not fetched.

**Constraints**: 1280×720 floor (already enforced by `min-width: 1280` in
`base.css`), 1600×900 target, content capped at 1400 and centred above ~2100.
`:focus-visible` rings are mandatory and never removed. No network fetch for any
asset — the Steam bundle may have none.

**Scale/Scope**: 13 component sections · 11 screen ports · 1 new screen (Codex) ·
99 SVGs · ~5,000 lines of existing client TSX to rebuild against the exports

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constraint | The test | Verdict |
|---|---|---|---|
| XII | **Server authority & the seed boundary** | Can a modified client change an outcome or read a value it was not issued? | **N/A** — no new data reaches the client; every screen renders what its route already returned |
| XIII | **One rules engine** | Does anything compute a rule outcome outside `packages/sim`'s rules half? | **PASS** — FR-008: the cooldown ring is a fraction of **turns remaining**, supplied by the engine. No client-side clock, no client-side rule |
| XIV | **Balance upward** | Does this lower a number a player has spent on? | **N/A** — no number moves |
| XV | **Derived data is generated** | Any hand-written bane, fault or matrix cell? | **PASS** — FR-007 forbids a colour prop, so colour cannot become a second source of truth for a relationship; the icon manifest is **generated**, not authored (R2) |
| XVI | **Cannot be backfilled** | Could each new persisted field be added later? | **N/A** — nothing is persisted |
| XVII | **Storing is not exposing** | Does this change what is recorded, exposed, or both? | **PASS** — neither. Every screen shows data its own route already returns; the port adds no field to any response |
| XVIII | **Harm is a gate; taste is a note** | For every restriction, name the harm | **N/A** — no restriction added |
| XIX | **Vendors behind interfaces** | Does feature code name a vendor? | **PASS** — fonts are **self-hosted**, not fetched from Google. No runtime third party (R1) |
| XX | **Written docs are canon** | Is every rule this plan relies on written in `docs/` or `resources/mechanics/` — not only in a `.dc.html`? | **PASS, and it is this feature's central risk.** FR-017/FR-018 forbid a number entering from an export; FR-019 makes every player-visible multiplier read from the generated source. The known contradiction is recorded in `resources/README.md` and canon wins |

**No violations.** Complexity Tracking is empty.

> **XX deserves the extra sentence.** A fidelity pass is exactly the moment somebody
> reads a value off a confident-looking screen and writes it into the code. The
> library already contains a live instance — `FAULT ×1.2` in four exports where
> canon says ×1.25, and ×0.80 absent from all twenty — so the guard is not
> hypothetical. **R5 shows the type system enforces it for free**: `Effectiveness`
> is a union of five literals, so a component typed on it cannot be handed 1.2.

## Project Structure

### Documentation (this feature)

```text
specs/017-design-port/
├── plan.md              # This file
├── research.md          # Phase 0 — six decisions and the status-icon finding
├── data-model.md        # Phase 1 — tokens, components, icons as a model
├── quickstart.md        # Phase 1 — how to verify the port
├── contracts/
│   └── components.md    # Phase 1 — the component layer's public surface
├── checklists/
│   └── requirements.md  # written with the spec
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/client/
├── index.html                     # font imports land here or in main.tsx
├── src/
│   ├── styles/
│   │   └── base.css               # EXISTS — @theme tokens; gains type, spacing,
│   │                              #   radius and motion from the Design System
│   ├── components/                # THE COMPONENT LAYER — 1 file today, 13 sections
│   │   ├── shell/                 #   AppShell, Rail, RailGroup, Header
│   │   ├── controls/              #   Button (7 states), inputs, forms
│   │   ├── type/                  #   TypeBadge, RelationshipStrip
│   │   ├── hero/                  #   HeroCard (3 scales), PowerSlot, CooldownRing
│   │   ├── readouts/              #   Meter, Pill, EffectivenessGrid
│   │   ├── system/                #   ConnectionState, Maintenance
│   │   ├── icons/                 #   GENERATED manifest + HeroIcon, StatusPip
│   │   └── SiteFooter.tsx         #   EXISTS
│   ├── features/                  # the eleven ports rebuild these
│   │   ├── attack/ auth/ battle/ guilds/ landing/ profile/ squads/
│   │   └── codex/                 # NEW — US5
│   └── App.tsx                    # the Screen union gains the rail's destinations
├── tests/
│   ├── components/                # gallery + per-component state coverage
│   └── ...                        # existing suites, unchanged
└── e2e/                           # existing Playwright passes, must stay green

tools/
└── build-icons.ts                 # NEW — sibling of build-content.ts; copies the
                                   #   SVGs and emits the typed manifest (R2)
```

**Structure Decision**: A **client-only feature**. Nothing under `apps/api`,
`packages/sim` or `packages/content` changes. The one addition outside
`apps/client` is `tools/build-icons.ts`, which follows the existing
`tools/build-content.ts` convention: read authored assets, emit generated
TypeScript, commit the result, and let CI diff it against a fresh build.

The component tree is grouped by the Design System export's own thirteen sections
rather than by feature, because **the whole point is that these are shared**. A
component that lives under `features/` is one no other feature will find.

## Phase sequencing and why

| Phase | Story | Why here |
|---|---|---|
| 1 | US1 — type | Smallest slice; improves **every** existing screen with no component work. Also a live defect |
| 2 | tokens | Spacing/radius/motion join the colours already in `@theme`. Blocks every component |
| 3 | US2 — components | The layer everything else consumes, including 014/015/016 and all of 018 |
| 4 | US4 — icons | Independent of the screens; lands in the components from Phase 3 |
| 5 | US3 — the eleven ports | Consumes 3 and 4. The largest slice and the visible payoff |
| 6 | US5 — Codex | Last: a new screen, so it needs the whole layer |
| 7 | polish | The token scan, the a11y sweep, the e2e re-run |

**US1 can ship on its own and should.** It is one commit, it touches no component,
and it is the difference between the game rendering in its own typeface and in the
operating system's.

## Risks

| Risk | Mitigation |
|---|---|
| **A number leaks from an export into the code** | FR-019 + `Effectiveness` as a literal union makes the wrong value a **compile error** (R5) |
| **The port breaks a user journey** while every component test passes | The existing Playwright suites run unchanged and must stay green (FR-012) |
| **The token scan passes vacuously** — a glob that matches nothing, or a hex found only in a comment | Comment-strip before scanning, and assert files were found before asserting content. Both have bitten this repo |
| **Status icons wired to nothing** | R3 — the engine emits no statuses. The registry ships; the *wiring* does not, and the guard says so out loud |
| **Eleven screens is a long run with no feedback** | Each screen is independently shippable; the rail lands first so every port is reachable as it completes |

## Complexity Tracking

*No Constitution violations. Table intentionally empty.*
