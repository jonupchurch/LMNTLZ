# Implementation Plan: Matchmaking, Leagues & Bots

**Feature**: `009-matchmaking` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 6 · Rating & league

## Summary

Who a player is offered. **Gear restricts via leagues; rating orders and filters
nobody.** Curated bots keep thin leagues viable, and the starter league is the one
carve-out from *the pool is every defender*.

## Technical Context

**Language**: TypeScript · **API**: Hono · **Storage**: Postgres
**Testing**: Vitest + a simulated-population harness
**Scale**: five leagues plus a starter pool; a starter player fights ~140 battles
in their week

**Performance**: candidate selection runs per matchmaking request. Gear score is
**recomputed on rune placement**, not on request, so selection reads a stored
value.

**Constraints**: **every threshold, bleed constant and bot count is server-side
and tunable without a client release.**

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Pool selection is server-side; a client cannot choose its opponent |
| XIII | One rules engine | **N/A** | No combat rules |
| XIV | Balance upward | **PASS** | Curated bots are the additive lever the design relies on |
| XV | Derived data is generated | **PASS** | League is derived from gear score, never stored as an authored field |
| XVI | Cannot be backfilled | **PASS** | Bot flag and league/rating at battle time reach the record |
| XVII | Storing is not exposing | **PASS** | A candidate's Hidden squad is never part of a listing |
| XVIII | Harm is a gate | **PASS** | A starter player is warned, never blocked, from joining a guild |
| XIX | Vendors behind interfaces | **N/A** | — |
| XX | Written docs are canon | **PASS** | Bot totals treated as launch tuning, not settled |

**No violations.**

## Project Structure

```text
apps/api/src/matchmaking/
├── gearScore.ts       2.5 × effective points, recomputed on placement
├── league.ts          fixed thresholds; position within the range
├── bleed.ts           the two ramps and their 50% edges
├── candidates.ts      pool assembly, then rating ORDER (never filter)
├── bots.ts            distribution, banded ratings, hand-seeded Diamond
└── starterLeague.ts   membership, the four exits, income multiplier

apps/api/src/db/schema/ratings.ts
content/bots/*.json    authored bot squads + configs
```

**Structure decision**: `bleed.ts` is separate from `candidates.ts` because the
bleed ramp is a pure function of position and is the piece most likely to need
retuning. Isolating it keeps the tuning surface small.

## Phase 0 — Research

1. **Decide the bot total, and the starter pool's depth first.** A starter player
   fights ~140 battles in their week; the authored ramp must still read as a ramp
   rather than as six opponents on repeat. **This is the floor that sets the number,
   and it is a content-authoring cost as much as a tuning one.**
2. **Confirm the four starter-league exits each fire.** Two of them — joining and
   founding a guild — live in feature 13, so this is a **cross-feature integration
   point**, and the one where the required warning has already been lost three
   times.
3. **Settle inactivity.** Inactive accounts leave the pool, which thins Bronze
   most — where it hurts most. Define the threshold and confirm bots cover it.

## Phase 1 — Design

**Contracts**:

```
gearScore(accountId)                 → recomputed on placement, read here
leagueOf(gearScore)                  → bronze … diamond
positionInLeague(gearScore)          → 0…1, against the league's own range
candidates(accountId)                → ordered by rating; nobody removed
recordPlacement(accountId)           → triggers gear recompute
starterStatus(accountId)             → active | exited(reason)
```

**`candidates` returns an ordered list, never a filtered one.** The signature is
the enforcement: there is no parameter that would let rating exclude anybody.

**Quickstart**: sweep one player's gear score across a league boundary and confirm
the opponent mix moves continuously with no step change.

## Phase 2 — Notes for `speckit-tasks`

**Gear score and its placement trigger first.** Everything else reads it, and the
*on placement* timing is what makes *hoarding is not a sandbag* true rather than
merely asserted.

**Write the 1.67× invariant as a property test over the whole score range**, not
as a spot check. It is the promise the entire league system exists to keep.

**Build the simulated-population harness early.** League shares, bleed behaviour
and bot sufficiency are all population questions, and reasoning will not settle
them.

**Coordinate the starter-league warning with feature 13 explicitly.** It hangs off
another feature's action, which is exactly why it keeps going missing.
