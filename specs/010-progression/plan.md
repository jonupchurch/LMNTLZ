# Implementation Plan: Progression — Shards, Runes & Rating

**Feature**: `010-progression` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 5 · Shard ledger, § 6 · Rating

## Summary

What a player earns and what they commit it to. **Balance is derived from an
append-only ledger**, the same one-source-of-truth shape as the battle action log.
Rating converges rather than accumulating, so the ladder pays for standing rather
than hours.

## Technical Context

**Language**: TypeScript · **API**: Hono · **Storage**: Postgres
**Testing**: Vitest + the simulated-population harness from feature 009
**Constraints**: **every rate, cost, cap and band is server-supplied and tunable
without a client release.**

**Performance**: balance is derived per read. If the ledger grows large enough for
that to matter, a checkpoint row is the fix — but **not before it is measured**,
since the whole point is one source of truth.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Every value server-supplied (SC-010) |
| XIII | One rules engine | **N/A** | No combat rules |
| XIV | Balance upward | **PASS** | **The origin.** Destruction on replacement, and grants that land at the cap |
| XV | Derived data is generated | **PASS** | Balance and gear score derived, never stored as authored values |
| XVI | Cannot be backfilled | **PASS** | Rating-at-battle-time reaches the record |
| XVII | Storing is not exposing | **PASS** | A player's rune layout is theirs; only gear score is public |
| XVIII | Harm is a gate | **PASS** | Boosts may stack on one stat; only the 75 cap constrains |
| XIX | Vendors behind interfaces | **N/A** | — |
| XX | Written docs are canon | **PASS** | Convergence bands treated as a starting point |

**No violations.**

## Project Structure

```text
apps/api/src/progression/
├── ledger.ts        append-only; balance derived
├── income.ts        the payout table and the daily tier curve
├── cap.ts           the three asymmetric behaviours at 6,500
├── runes.ts         four stages; destruction on replacement; one transaction
├── rating.ts        convergent, three K bands, doubled for Hidden
└── config.ts        every tunable value, server-side

apps/api/src/db/schema/{ledger,runes,ratings}.ts
```

**Structure decision**: `config.ts` exists so that no rate, cost or band is a
literal anywhere else. Under the no-nerf rule, tuning must never require a client
release.

## Phase 0 — Research

1. **Confirm the daily tier boundaries.** The shape — earlier victories pay more —
   is decided; the brackets are not. They want the simulated population, not
   reasoning.
2. **Settle rating's exact update rule** within the decided shape: one number,
   convergent, three decaying K bands, Hidden worth double on a win and equal on a
   loss. **The bands are explicitly a starting point**, so build them as config.
3. **Decide the rebuild transaction's shape.** FR-010 requires destroying and
   rebuilding a rune to be **one transaction, not four**. Settle whether the player
   pays 650 once or four staged charges that must all succeed — the observable
   behaviour must be atomic either way.

## Phase 1 — Design

**Contracts**:

```
awardShards(accountId, reason, battleId)   → applies tier + cap rules
balance(accountId)                         → derived from the ledger
placeRune(accountId, heroId, slot, spec)   → charges, destroys, recomputes gear
rebuildRune(accountId, heroId, slot, spec) → ONE transaction
updateRating(battle)                       → convergent, banded
gearScore(accountId)                       → recomputed on placement
```

**`awardShards` is the only writer of positive battle income**, so the cap's three
behaviours live in exactly one place. Grants take a different path precisely
because they must bypass the cap.

**Quickstart**: earn to the cap; confirm battle income stops, a granted prize still
lands, and a purchase is refused — three different outcomes at one boundary.

## Phase 2 — Notes for `speckit-tasks`

**Ledger and `config.ts` first.** Everything reads them, and a rate hard-coded
early is a rate hard-coded forever.

**Test the cap's three behaviours as three separate tests.** They differ, and a
single "at the cap" test would pass while implementing only one.

**Write the rune-destruction warning path before the happy path.** FR-009's warning
is the part a player experiences as fairness; the charge is the easy half.

**Rating convergence is verified against a simulated population**, not a unit test.
SC-003 — a strong player at two hours outranking a weak one at twenty — is a
population property.
