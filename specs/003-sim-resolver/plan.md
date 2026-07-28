# Implementation Plan: Simulation — Resolver

**Feature**: `003-sim-resolver` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 4 · Battle

## Summary

The half that consumes randomness — and is nonetheless a **pure function of
`(seed, action log)`**. Server only. Replay of the same log must reproduce the
same battle exactly, because in-progress state is never stored.

## Technical Context

**Language**: TypeScript (strict) · **Package**: `packages/sim`, `resolver/` subtree
**Dependencies**: `packages/sim/rules`, `packages/content` · **Testing**: Vitest
**Project type**: library, **server only** · **Storage**: none — consumes a log
**Seed source**: cryptographically unpredictable, server-side, at battle creation

**Performance**: replay is O(actions) per request — a few hundred simulation steps,
single-digit milliseconds. **The 300-turn cap is what bounds it.**

**Constraints**: must never be present in a client build. Must not read a clock,
an environment value, or any entropy during resolution.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | **The feature.** Seed generated, held and never transmitted |
| XIII | One rules engine | **PASS** | Consumes `rules`' probabilities; recomputes nothing |
| XIV | Balance upward | **PASS** | SC-005's 9.4% median miss is the regression detector |
| XV | Derived data is generated | **N/A** | Authors nothing |
| XVI | Cannot be backfilled | **PASS** | Draw order is engine-versioned; re-derivation reports mismatch |
| XVII | Storing is not exposing | **PASS** | The seed is stored and never exposed — the sharpest case in the set |
| XVIII | Harm is a gate | **N/A** | No player-facing restriction |
| XIX | Vendors behind interfaces | **N/A** | No outbound dependency |
| XX | Written docs are canon | **PASS** | Accuracy model from `01-stats.md`, not from a screen |

**No violations.**

## Project Structure

```text
packages/sim/resolver/
├── rng.ts             seeded, deterministic, positional
├── seed.ts            generation — server entropy only
├── resolve.ts         one action → the packet that follows it
├── replay.ts          (seed, log) → state
├── statuses.ts        contested application
└── index.ts

packages/sim/tests/resolver/
├── determinism.test.ts    1,000 replays, byte-identical
├── seedCustody.test.ts    no payload contains it; no client value feeds it
├── distribution.test.ts   observed rates converge on computed probabilities
├── medianMiss.test.ts     ~9.4% across 729 pairings
└── drawOrder.test.ts      draw sequence is a stable function of history
```

**Structure decision**: sibling subtree to `rules/` in one package, excluded from
the client build by the mechanism chosen in feature 002's Phase 0.

## Phase 0 — Research

1. **Choose the seeded generator.** Requirements: deterministic, portable,
   positionally addressable, and fast. **It becomes part of the engine contract** —
   changing it changes every in-flight battle — so the choice is versioned, not
   incidental.
2. **Decide how draws are sequenced.** Lazy consumption is fine and probably right
   (only roll a crit after a hit lands), but the sequence must be a **stable
   function of history**. Settle whether the counter is global to the battle or
   scoped per turn, and write it down — this is the detail that silently breaks
   replay.
3. **Confirm the closed-form hit probability** produced by feature 002 against a
   Monte Carlo of the two-distribution contest, before anything depends on it.

## Phase 1 — Design

**Contracts**:

```
createSeed()                        → opaque, server-only
resolveAction(seed, log, intent)    → { packet, appendedAction }
replay(seed, log)                   → BattleState
reDerive(provenance)                → BattleState | VersionMismatch
```

**`replay` is the primitive and `resolveAction` is built on it**, not the reverse.
Every request replays, so replay is the hot path and must be the simple one.

**Nothing returns the seed.** The type that carries it is not serialisable to a
client response — enforced structurally, not by remembering.

**Quickstart**: `pnpm --filter sim test resolver`.

## Phase 2 — Notes for `speckit-tasks`

**Determinism test first**, before any real resolution logic. It is cheap to write
against a stub and impossible to retrofit honestly.

**Seed custody test second.** Scan every server response shape for the seed. This
is a structural test, not a behavioural one, and it should fail loudly if someone
adds a debug field.

**Then**: rng → seed generation → hit/miss → crit → statuses → replay →
re-derivation.

**The median-miss test is a balance regression detector, not a unit test.** It
belongs in CI but should be understood as *"the accuracy model still behaves as
designed"*, not *"this function is correct."*
