# Implementation Plan: Defense AI

**Feature**: `004-defense-ai` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 3 · SquadMemberConfig

## Summary

The engine plays every defense squad. The configurable surface is **two ordered
lists per champion** plus one ally rule where relevant. The implementation is
small; the **firing profile** — telling a player which of their powers will
actually fire — is the part that carries the feature.

## Technical Context

**Language**: TypeScript (strict) · **Package**: `packages/sim`, `ai/` subtree
**Dependencies**: `sim/rules`, `sim/resolver` (for tiebreak randomness)
**Testing**: Vitest + simulation harness · **Project type**: library, server only
**Scale**: 27 heroes × 720 orderings = 19,440 hero/ordering pairs to characterise

**Performance**: one decision per defending champion per turn. Not a hot path.

**Constraints**: choices must be **replayable** — all randomness comes from the
resolver's seeded source, never from a local one.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Runs server-side; randomness from the resolver, so choices replay |
| XIII | One rules engine | **PASS** | Priority is **stage 4 of the existing pipeline**, not a second one |
| XIV | Balance upward | **PASS** | Curated defaults are an additive lever |
| XV | Derived data is generated | **PASS** | The firing profile is computed, never authored |
| XVI | Cannot be backfilled | **N/A** | Writes no permanent record |
| XVII | Storing is not exposing | **PASS** | A defender's configuration is never shown to an attacker |
| XVIII | Harm is a gate | **PASS** | A self-defeating ranking is **surfaced, not blocked** (FR-019) |
| XIX | Vendors behind interfaces | **N/A** | No outbound dependency |
| XX | Written docs are canon | **PASS** | The role→ranking mapping is treated as a proposal |

**No violations.**

## Project Structure

```text
packages/sim/rules/
└── firingProfile.ts   ← LIVES IN rules/, NOT ai/. See below.

packages/sim/ai/
├── targeting.ts       the primary/fallback sort, applied at stage 4
├── powerChoice.ts     highest-ranked, off cooldown, past its gate
├── allyChoice.ts      friendly-power selection, stages 1 and 4 only
├── defaults.ts        role defaults, drawn from the 12 safe orderings
└── index.ts

packages/sim/tests/
├── rules/firingProfile.test.ts  prediction matches simulated behaviour
└── ai/
    ├── safeOrderings.test.ts    the 12 safe orderings hold on all 27 heroes
    ├── taunt.test.ts            compulsion beats priority, always
    └── reachWindow.test.ts      +1 reach exposes a third enemy row

tools/characterize-orderings.ts    the 19,440-pair sweep — offline, not CI
```

**Structure decision**: `ai/` is a third subtree of `packages/sim`, server-only
like `resolver/`. It is not a separate package because it consumes both halves.

> ### The firing profile belongs in `rules/`, not `ai/`
>
> **Surfaced by feature 006's plan and resolved here** — which is exactly what
> planning the whole set before building any of it is for.
>
> FR-018 requires the **squad builder** to show which powers will fire, so the
> computation is needed **client-side**. But `ai/` is server-only, like
> `resolver/`, because it makes choices.
>
> **A firing profile is not a choice.** It is a pure function of `(hero, ranking)`
> with no randomness and no server state — *a power fires only when everything
> above it is on cooldown* is arithmetic over the cooldown ladder. It meets every
> condition for `rules/` and none of the ones that put anything in `ai/`.
>
> **Had this surfaced during implementation instead**, the likely outcome is an
> endpoint to fetch the profile — a network round trip on every drag of a ranking
> widget, to compute something the client could derive locally from a package it
> already imports.

## Phase 0 — Research

1. **Re-derive the 12 universally safe orderings** rather than trusting the
   recorded list. They are a *measured* property of the cooldown ladder, and the
   ladder may move in the hero-numbers pass. **Every one of them ends `1·0`** — if
   a re-derivation produces one that does not, the ladder changed and the defaults
   need revisiting.
2. **Decide how the firing profile is computed.** Simulation over N turns is
   simple and honest; a closed form from `1/(cooldown+1)` availability is faster
   and risks disagreeing with the engine. **They must agree — SC-003 — so whichever
   is chosen, the other is the test.**
3. **Confirm the reach window is computed, never bounded.** FR-020 exists because
   a `+1` reach rune produces three reachable enemy rows and the natural
   implementation assumes two.

## Phase 1 — Design

**Contracts**:

```
chooseTarget(state, heroId, config, candidates)  → heroId
choosePower(state, heroId, config)               → powerId | pass
chooseAlly(state, heroId, config, candidates)    → heroId
roleDefaults(role)                               → { targeting, ranking }
firingProfile(hero, ranking)                     → per-power expected share
```

**`chooseTarget` receives candidates already filtered by stages 1–3.** It sorts;
it never filters. That single signature choice is what makes FR-009 unbreakable —
the function is structurally incapable of returning "no target" when one was
passed in.

**Quickstart**: `pnpm --filter sim test ai`; the characterisation sweep is a
separate offline script.

## Phase 2 — Notes for `speckit-tasks`

**Order**: defaults ← safe orderings ← the characterisation sweep. The sweep is a
prerequisite for the defaults, not a validation of them.

**`firingProfile` before the squad-builder UI (feature 06).** The display is
useless if the computation is wrong, and the computation is testable without any
interface.

**Keep the sweep out of CI.** 19,440 pairs is an offline characterisation; CI
tests the 12 safe orderings on 27 heroes, which is 324 cases and fast.
