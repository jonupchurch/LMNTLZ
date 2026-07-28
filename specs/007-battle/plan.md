# Implementation Plan: Battle

**Feature**: `007-battle` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 4 · Battle

## Summary

The play loop. Client sends an intent; the server replays the append-only log,
applies it, appends, and returns **one packet covering everything up to the
player's next real choice**. No in-progress state is stored anywhere.

## Technical Context

**Language**: TypeScript · **API**: Hono on Vercel · **Storage**: Postgres
**Sim**: `packages/sim` — rules on both sides, resolver server-only
**Client**: React; animation begins on click, not on response
**Testing**: Vitest for the loop, Playwright for the golden path

**Performance**: 20–40 requests per battle. Replay is O(actions) per request —
single-digit milliseconds at the 300-turn cap. **This is the number to watch:**
it is the one condition under which no-stored-state stops being correct.

**Constraints**: an intent must be idempotent by construction, not by retry logic.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | **Central.** Intents down, packets up; the client decides nothing |
| XIII | One rules engine | **PASS** | Orchestrates only; computes no rule |
| XIV | Balance upward | **PASS** | A discarded battle costs the player nothing (FR-016) |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | Version stamps and the four telemetry fields ship with the first battle |
| XVII | Storing is not exposing | **PASS** | A Hidden defender snapshot is stored; only its own battle reveals it |
| XVIII | Harm is a gate | **N/A** | — |
| XIX | Vendors behind interfaces | **N/A** | — |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/battle/
├── routes.ts          /v1/battles/*
├── create.ts          snapshot the defender, mint the seed
├── act.ts             replay → apply → append → packet
├── settle.ts          outcome, rating, streaks, rewards — exactly once
├── maintenance.ts     live | draining | down
└── idempotency.ts     (battleId, sequence) uniqueness

apps/api/src/db/schema/battles.ts   Battle + BattleAction

apps/client/src/features/battle/
├── BattleScreen.tsx
├── useIntent.ts       fires the request AND starts the wind-up on click
└── TurnQueue.tsx      projected locally from sim/rules
```

**Structure decision**: `settle.ts` is separate from `act.ts` because settlement
must happen **exactly once** and is the only place that touches rating, streaks
and rewards. Folding it into the action path is how a battle pays out twice.

## Phase 0 — Research

1. **Choose the idempotency mechanism.** The strong form is a unique constraint on
   `(battleId, sequence)` with the client supplying the sequence it believes it is
   writing. **This makes a duplicate a constraint violation rather than a race to
   detect** — the database enforces it, not application logic.
2. **Decide the abandoned-battle policy.** A battle left open forever is a growing
   replay cost. Settle the timeout, and whether a player may hold several battles
   open at once — the spec requires the rule be *enforced consistently*, not that
   it take a particular value.
3. **Confirm the packet boundary.** *"Up to the player's next real choice"* needs a
   precise definition, since it decides the 20–40 request figure. A hero passing
   with no legal target is not a choice; a hero with one legal power and one legal
   target arguably is not either.

## Phase 1 — Design

**Contracts**:

```
POST /v1/battles                { opponentId }        → { battleId, initialState }
POST /v1/battles/:id/act        { sequence, heroId,
                                  powerId, targetId } → { packet }
GET  /v1/battles/:id                                  → current state, re-derived
```

**`act` returns the same packet for a repeated `sequence`**, which is what makes
retry safe without the client knowing it retried.

**The response never contains the seed.** Enforced by the resolver's own type
boundary (feature 003), not by remembering here.

**Quickstart**: start a battle, act through to conclusion, confirm 20–40 requests,
kill the connection mid-action and confirm the retry does not double-advance.

## Phase 2 — Notes for `speckit-tasks`

**Idempotency first, before the loop works end to end.** It is a schema constraint,
so it is cheap now and a migration later.

**Then**: create + snapshot → replay path → act → settle → maintenance states.

**Test the discard refund explicitly.** FR-016 covers rating, rewards *and* the
attempt; a partial implementation that refunds two of three is the support ticket
the rule exists to prevent.

**Instrument replay cost from day one.** The turn count is already required on the
record (feature 08); adding replay duration alongside it costs nothing and is what
will tell you whether the no-stored-state decision is still correct.
