# Implementation Plan: The Client Halves — Forge, Store and Replays

**Branch**: `018-client-halves` *(no branch — straight to `main`)* | **Date**: 2026-07-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-client-halves/spec.md`

## Summary

Three screens over three backends that already ship. A player can be paid shards
and cannot spend them on a rune; can be granted an entitlement and cannot buy one;
can fight a battle and cannot watch it back. Every route exists, is tested, and is
deployed — **008, 010 and 011 each specified the player action and decomposed only
the server half.**

**Approach**: one screen per user story, each built on 017's component layer, each
ending in a wiring task that names its caller. Two additions outside the screens:
**a read route the Forge cannot work without** (`GET /v1/me/runes` — R1) and **a
canon edit** for a rule the code implements and the docs never stated (R3).

## Technical Context

**Language/Version**: TypeScript 5.x, `strict` + `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`

**Primary Dependencies**: React 19 · Vite 8 · Tailwind v4 · **017's component
layer** · `@lmntlz/content` (`STAT_CAP`, roster) · `@lmntlz/sim/rules` for replay
playback types · Hono + Drizzle for the one new route

**Storage**: **No new table, column or migration.** `hero_runes` and
`entitlement_grants` already exist; the new route reads them.

**Testing**: Vitest + `@testing-library/react` for screens; Vitest + a test
`PaymentRail` for the store; Playwright for the three journeys

**Target Platform**: Desktop browser at 1.0; the same bundle in Electron for Steam
later

**Project Type**: Mostly client, inside a pnpm + Turborepo monorepo. One API route.

**Performance Goals**: Replay playback must not re-simulate — it reads a stored log,
so playback cost is independent of battle length beyond rendering

**Constraints**: 1280×720 floor · server decides every price, entitlement and
eligibility · **no re-simulation path may be built** (Constitution XVI) · planning a
rune allocation charges nothing and stores nothing

**Scale/Scope**: 3 screens · 1 new read route · 1 canon edit · 5 previously
unreachable routes closed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constraint | The test | Verdict |
|---|---|---|---|
| XII | **Server authority & the seed boundary** | Can a modified client change an outcome or read a value it was not issued? | **PASS** — FR-010: price, entitlement and eligibility are decided server-side. Planning a rune is a client calculation that **commits nothing**; the server re-validates the cap and the balance on commit |
| XIII | **One rules engine** | Does anything compute a rule outcome outside the rules half? | **PASS** — the Forge *displays* costs from `progressionConfig()`; it does not decide them. Replay playback drives existing components from a stored log |
| XIV | **Balance upward** | Does this lower a number a player has spent on? | **N/A** — no number moves |
| XV | **Derived data is generated** | Any hand-written derived value? | **PASS** — FR-001/FR-006: every stage cost, boost, cap and price is read from the server or from generated content at render time |
| XVI | **Cannot be backfilled** | Could each new persisted field be added later? | **PASS — and it is the sharpest gate here.** Nothing new is persisted, and **FR-014 forbids building a re-simulation path**, which is what keeps a balance patch from reaching backwards into a stored replay |
| XVII | **Storing is not exposing** | Recorded, exposed, or both? | **PASS, and R1 turns on it.** `GET /v1/me/runes` exposes a hero's **stat allocation to its owner** — which the scout serializer deliberately withholds from an opponent. **The two must not share a serialiser**, the same standing instruction 012 wrote for `profile` vs `scout`. FR-013: a non-participant's replay request returns `404`, never `403` |
| XVIII | **Harm is a gate; taste is a note** | Name the harm for every restriction | **N/A** |
| XIX | **Vendors behind interfaces** | Does feature code name a vendor? | **PASS** — the store talks to `PaymentRail`, never to a provider. Entitlements are account-level, never per-storefront. The screens build and test against a test rail (R5) |
| XX | **Written docs are canon** | Is every rule written in `docs/` or `resources/mechanics/`? | ⚠️ **One gap, closed by a task.** The store export states the daily cap resets at **00:00 UTC**; the code implements it and serves `nextBoundaryAt`, but `06-progression.md` never says it. **The rule is written into canon before a screen shows it** (R3) |

**No violations.** Complexity Tracking is empty. XX's gap is a missing sentence in
canon rather than a contradiction, and a task closes it.

## Project Structure

### Documentation (this feature)

```text
specs/018-client-halves/
├── plan.md              # This file
├── research.md          # Phase 0 — six findings, three change the plan
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── runes-read.md    # Phase 1 — the one new route
├── checklists/
│   └── requirements.md  # written with the spec
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/src/progression/
├── routes.ts                     # + GET /v1/me/runes                    (R1)
└── read.ts                       # NEW — the owner-facing serialiser.
                                  #   MUST NOT share code with
                                  #   squads/scoutSerializer.ts

apps/client/src/features/
├── forge/                        # NEW — US1
│   ├── ForgeScreen.tsx           #   hero list, slot detail, stat line
│   ├── SlotPlanner.tsx           #   planning is free; commits nothing
│   ├── StageLadder.tsx           #   150·150·150·200, from the server
│   └── DestroyConfirm.tsx        #   explicit, never the default action
├── store/                        # NEW — US2, the exact path 011 T026 names
│   ├── StoreScreen.tsx           #   seven durations from GET /v1/catalog
│   ├── Checkout.tsx              #   descriptor adjacent to the pay control
│   └── Entitlements.tsx          #   what you hold and until when
└── replays/                      # NEW — US3
    ├── BattleListScreen.tsx      #   watchable flag from the server
    └── ReplayViewer.tsx          #   drives BattleScreen/TurnQueue from a log

resources/mechanics/06-progression.md   # + the UTC reset rule            (R3)
```

**Structure Decision**: Client-first with **one** API addition. Each screen is its
own feature directory so a story can ship alone. `features/store/` uses the exact
path 011 T026 already names, so that task is **satisfied here rather than
duplicated**.

## Phase sequencing and why

| Phase | Story | Why here |
|---|---|---|
| 1 | Setup | feature directories, rail registration |
| 2 | **Foundational** | `GET /v1/me/runes` (R1) — US1 is unbuildable without it — and the canon edit (R3) |
| 3 | **US1 Forge** | P1: the core loop. Until it exists gear score never moves and **every player stays in Bronze** |
| 4 | **US2 Store** | P1, but gated on **011 Phase 8** — the pass must pay before it is sold |
| 5 | US3 Replays | P2: real value, and nothing depends on it |
| 6 | Polish | the gap audit as the acceptance test |

## Dependencies

| Depends on | For |
|---|---|
| **017** | the component layer all three screens are built from |
| **011 Phase 8** | **the boost must actually pay before the store sells it** |
| 011 T031 (adapter) | only the *live* purchase — **deferred to last, and not a blocker** (R5) |
| 010 · 008 backends | complete, tested, deployed |

## Risks

| Risk | Mitigation |
|---|---|
| **A store ships while the pass pays nothing** | 011 Phase 8 is a hard prerequisite of US2, stated in the spec and the task list. It fails **silently**, which is what makes it dangerous |
| **The owner route leaks through the scout boundary** | A separate serialiser, plus a test asserting the scout response still omits allocations (XVII) |
| **A replay path grows re-simulation** | FR-014 + 008 T023. Playback drives existing components from the stored log, and the client cannot import the seeded resolver at all — the ESLint ban and `purity.test.ts` already enforce it |
| **Rune numbers get transcribed** | Everything is already served by `GET /me/shards` (R2), so a literal has no excuse; a scan asserts none |
| **The store hardcodes "00:00 UTC"** | Render `nextBoundaryAt`, which the server already returns — `config.ts` states why the instant is served rather than the rule |
| **The Paddle deferral blocks the screens** | It does not. `PaymentRail` is injected; US2 builds and tests against a test rail |

## Complexity Tracking

*No Constitution violations. Table intentionally empty.*
