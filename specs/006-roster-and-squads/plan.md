# Implementation Plan: Roster & Squads

**Feature**: `006-roster-and-squads` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 3 · Squad

## Summary

The allocation layer: all 27 heroes, two defense zones, up to three overlapping
offense squads, and the defense configuration surface. **The first feature with a
real interface**, and the one where two commitments deliberately pull against each
other over the same 27 heroes.

## Technical Context

**Language**: TypeScript · **Client**: Vite + React + Tailwind
**API**: Hono · **Storage**: Postgres + Drizzle · **Testing**: Vitest + Playwright
**Rules**: `packages/sim/rules` for reach validation, `packages/sim/ai` for the
firing profile

**Constraints**: minimum window **1280×720**, designed for **1600×900**. Mouse and
keyboard only — **mandatory keyboard focus rings**, no touch targets.

**Performance**: the builder revalidates on every placement. Reach and firing
profile run client-side from the shared rules, so this is local.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Streak and ambush values are server-supplied, never client constants (FR-017) |
| XIII | One rules engine | **PASS** | Reach validation uses `sim/rules`; the builder reimplements nothing |
| XIV | Balance upward | **N/A** | No economy surface |
| XV | Derived data is generated | **PASS** | The firing profile is computed by `sim/ai` |
| XVI | Cannot be backfilled | **PASS** | Zone must reach the battle record so zone balance is testable |
| XVII | Storing is not exposing | **PASS** | **The sharpest case.** Hidden stored in full, exposed nowhere but its streak |
| XVIII | Harm is a gate | **PASS** | A reach-1 back-seat placement is warned about, not blocked |
| XIX | Vendors behind interfaces | **N/A** | — |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/client/src/features/squads/
├── RosterView.tsx          all 27, with assignment status
├── SquadBuilder.tsx        2/3/1 placement, both kinds
├── DefenseConfig.tsx       targeting pair, power ranking, ally rule
├── FiringProfile.tsx       which powers will actually fire
├── EvictionWarning.tsx     names EVERY squad a change invalidates
└── hooks/useAllocation.ts

apps/api/src/squads/
├── routes.ts               /v1/squads/*
└── allocation.ts           eviction, invalidation, streak reset

apps/api/src/db/schema/squads.ts
```

**Structure decision**: allocation rules live **server-side** in `allocation.ts`
and are mirrored client-side only for immediate feedback. The server is
authoritative on every eviction and every streak reset.

## Phase 0 — Research

1. **Decide what counts as "editing" a defense squad** for the streak reset. The
   spec requires reset on *change*, not on opening the editor — so reordering to
   an identical arrangement is the case to settle. **A no-op save must not cost a
   streak**, or the reset becomes a trap.
2. **Design the eviction warning for the three-squad case.** It is the default
   case, not the exception: 3 × 6 > 15 forces overlap, so one swap routinely
   breaks all three. A warning written for one squad and scaled up reads wrong.
3. ~~**Confirm the firing profile's client-side availability.**~~ **Resolved while
   writing this plan.** It is needed client-side but `sim/ai` is server-only, so
   `firingProfile` **moves to `sim/rules`** — it is a pure function of
   `(hero, ranking)` with no randomness and no server state. Recorded in
   [feature 004's plan](../004-defense-ai/plan.md). The builder imports it
   directly; no endpoint exists.

> **Item 3 is what this planning pass is for.** Discovered during implementation
> instead, the natural fix would have been an endpoint — a round trip on every
> drag of a ranking widget, to compute something the client can derive locally.

## Phase 1 — Design

**Contracts**:

```
GET  /v1/roster                    → 27 heroes + this player's assignments
PUT  /v1/squads/defense/:zone      → placement + per-champion config
PUT  /v1/squads/offense/:slot      → placement
GET  /v1/players/:id/scout         → Visible squad in full + BOTH hold streaks
```

**`scout` returns the Hidden hold streak and never Hidden composition.** One
endpoint, two different disclosure rules — which is why it is its own contract
rather than a variant of the profile read.

**Quickstart**: build both defenses, build three overlapping offense squads, move
one hero to defense, confirm all three invalidate and the warning named all three.

## Phase 2 — Notes for `speckit-tasks`

**Allocation invariants before any interface.** Eviction, invalidation and streak
reset are server rules with clear tests; the builder is a view onto them.

**Write the three-squad eviction test first.** It is the case the warning exists
for and the one most likely to be built for a single squad and scaled badly.

**Resolve Phase 0 item 3 before starting feature 04's firing profile**, since it
decides which subtree that code belongs in.
