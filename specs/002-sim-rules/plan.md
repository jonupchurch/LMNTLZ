# Implementation Plan: Simulation — Rules

**Feature**: `002-sim-rules` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 3 · Squad, § 4 · Battle

## Summary

The pure half of the simulation: every question about a battle with exactly one
right answer given the state. **No randomness, no clock, no ambient state.** Ships
to the client *and* the server as one import, which is what lets the client
preview without holding the seed.

## Technical Context

**Language**: TypeScript (strict) · **Package**: `packages/sim`, `rules/` subtree
**Dependencies**: `packages/content` only · **Testing**: Vitest, property-based
**Project type**: library, isomorphic · **Storage**: none — every function is
`(state, …) → answer`

**Performance**: called on hover in the client and per action on the server.
Targeting and effectiveness must be cheap enough to run on every mouse move.

**Constraints**: **must be importable by a browser bundle.** No Node built-ins, no
filesystem, no `crypto`, no `Date.now()`.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | **The feature.** Returns probabilities, never outcomes; no RNG reachable |
| XIII | One rules engine | **PASS** | One implementation, imported by both sides |
| XIV | Balance upward | **PASS** | Formulas here; values in `content`. SC-007/008 are ratios and bounds |
| XV | Derived data is generated | **PASS** | Effectiveness comes from `content`, not recomputed |
| XVI | Cannot be backfilled | **PASS** | `engineVersion` identifies this package |
| XVII | Storing is not exposing | **N/A** | Holds no data |
| XVIII | Harm is a gate | **N/A** | No player-facing restriction |
| XIX | Vendors behind interfaces | **N/A** | No outbound dependency |
| XX | Written docs are canon | **PASS** | Formulas taken from `resources/mechanics/`, not from screens |

**No violations.**

> **XII is checked hardest here.** The gate is not "we did not add randomness" —
> it is that randomness is **unreachable**: no import of any entropy source
> anywhere in the subtree, enforced by a test.

## Project Structure

```text
packages/sim/
├── rules/                    ← this feature. Isomorphic.
│   ├── reach.ts              occupied-row distance, empty rows free
│   ├── targeting.ts          reach → filters → compulsion → choice
│   ├── turnOrder.ts          the bounded accumulator, drained in a loop
│   ├── damage.ts             packet · mitigation · floor · type multiplier
│   ├── probability.ts        P(hit) with the 65–95% clamp; crit chance
│   ├── phases.ts             the five-phase order and its skip conditions
│   ├── ending.ts             elimination, the 300-turn cap, pooled-HP resolution
│   └── index.ts
├── resolver/                 ← feature 003. Server only.
└── tests/rules/
    ├── purity.test.ts        no entropy source is reachable
    ├── reach.test.ts         the row-1 case, and rows opening as they empty
    ├── turnOrder.test.ts     1.46× at Speed 45 vs 15; 1.92× geared
    ├── probability.test.ts   the clamp holds across all runed combinations
    └── pairings.test.ts      property tests over all 729 pairings
```

**Structure decision**: `rules/` and `resolver/` are **sibling subtrees of one
package** rather than two packages. One package keeps the shared types honest; the
subtree split is what the client build enforces.

## Phase 0 — Research

1. **How the client build excludes `resolver/`.** The seam is only real if
   importing `sim/rules` cannot transitively pull in `sim/resolver`. Decide between
   package exports, separate entry points, or a lint rule — and make the *build*
   fail, not a review.
2. **Confirm the accuracy model.** `CLAUDE.md` writes two `rand()` terms and
   annotates *"one draw, not two."* Rules must fold both contest distributions into
   a single probability **analytically**. Verify the closed form reproduces the
   9.4% median miss across 729 pairings before the resolver depends on it.
3. **Row indexing.** Row 1 is the attacker's **back**, row 3 its front. Getting
   this backwards inverts every reach test while still looking plausible.

## Phase 1 — Design

**Contracts**:

```
legalTargets(state, heroId, powerId)   → hero ids
distance(state, fromRow, toRow)        → occupied rows crossed
turnQueue(state, lookahead)            → projected order
hitProbability(attacker, defender)     → 0.65 … 0.95
critChance(attacker)                   → 0 … 1
damagePreview(attacker, power, defender) → packet, mitigated, multiplier,
                                            floorApplied, probabilities
battleEnded(state)                     → null | { winner, reason }
```

**Everything returns a value; nothing mutates state.** Callers apply results.

**Quickstart**: `pnpm --filter sim test rules` — no fixtures needed beyond
`content`, because nothing here requires stubbing.

## Phase 2 — Notes for `speckit-tasks`

**Write `purity.test.ts` first.** It is the constitutional gate expressed as a
test, and it must be red-then-green before any rule exists, or it will be written
to fit whatever got built.

**Reach before targeting before phases.** Targeting's stage 1 is reach; phases
consume targeting.

**Property tests over the 729 pairings are the highest-value tests in the
codebase** — pure, shared, RNG-free, and the last place a number moves freely.

**Do not implement anything the resolver owns**, even temporarily. A "temporary"
`Math.random()` in this subtree would pass review once and be permanent.
