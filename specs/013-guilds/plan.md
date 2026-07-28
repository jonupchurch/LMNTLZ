# Implementation Plan: Guilds

**Feature**: `013-guilds` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § Social models

## Summary

Founding, joining, roles and succession for guilds of up to 24. **Events, Wings
and guild funds are deferred with their design.** Guilds earn their place at 1.0
because joining and founding are two of the four starter-league exits.

## Technical Context

**Language**: TypeScript · **API**: Hono · **Storage**: Postgres
**Email**: managed sender behind an interface, for succession notices
**Testing**: Vitest + Playwright · **Scale**: ≤24 members; ≤5 concurrent
applications per player

**Constraints**: succession spans **21 days of wall-clock time** across two
timers, so it cannot be tested by waiting — the clock must be injectable.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Role permissions enforced server-side, never by hiding a control |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **PASS** | Succession is economically neutral — 650 moves, nothing is created |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **N/A** | — |
| XVII | Storing is not exposing | **PASS** | Membership is public; application history is not |
| XVIII | Harm is a gate | **PASS** | Emblem contrast **warns and never blocks** |
| XIX | Vendors behind interfaces | **PASS** | Email behind the sender interface; the notice carries no action link |
| XX | Written docs are canon | **PASS** | The screen's guild-tag proposal was **rejected** |

**No violations.**

## Project Structure

```text
apps/api/src/guilds/
├── found.ts          650 charge, permanent name, emblem
├── membership.ts     roles, the ≤3 officer cap, permissions
├── applications.ts   ≤5 concurrent, 7-day expiry, first-acceptance-wins
├── invites.ts        immediate accept, mutual withdrawal
├── succession.ts     14-day idle → request → email → 7 days → transfer
├── activity.ts       the window, and the 14-day newborn definition
└── motd.ts           a pin, plus a login notice from last-seen

apps/api/src/db/schema/guilds.ts
apps/client/src/features/guilds/…
```

**Structure decision**: `activity.ts` implements *considered active for 14 days
from founding* as part of the **definition**, not as a caller-side exception.
Written as an exception it would need special-casing everywhere activity is read.

## Phase 0 — Research

1. **Make the clock injectable before writing succession.** Two timers spanning 21
   days cannot be tested by waiting, and succession is the feature where an
   untested timer is most expensive — it transfers ownership.
2. **Settle first-acceptance-wins under concurrency.** Two guilds accepting the
   same applicant simultaneously must produce one membership and one withdrawal
   set. **A transaction with the applicant's membership row as the contended
   resource** is the natural shape; confirm it before building the happy path.
3. **Coordinate the starter-league warning with feature 009.** It must appear on
   **both** doors — invitation *and* application — and name **both** losses. It has
   already fallen out of three screen regenerations.

## Phase 1 — Design

**Contracts**:

```
POST /v1/guilds                       → charge 650; founder becomes master
POST /v1/guilds/:id/applications      → ≤5 concurrent, 7-day expiry
POST /v1/applications/:id/accept      → joins; withdraws all others atomically
POST /v1/guilds/:id/invites           → officer+
POST /v1/invites/:id/accept           → immediate
POST /v1/guilds/:id/succession        → officer+, requires 650 available
PUT  /v1/guilds/:id/motd              → sets a pin
```

**Accepting an application and withdrawing the rest is one transaction.** Two
operations would leave a window where a player is in a guild and still has open
applications — and the second acceptance in that window is a second membership.

**Quickstart**: apply to five guilds, have one accept, confirm four withdrawals and
one membership; run succession end to end with an injected clock, both outcomes.

## Phase 2 — Notes for `speckit-tasks`

**Clock injection first**, before succession exists.

**Then**: founding → membership and roles → applications and invites → succession
→ motd.

**Test both succession outcomes**: master returns inside the 7 days and keeps
everything; master does not, and the transfer is economically neutral.

**Do not build Wings.** They exist only for events. A "harmless" Wing column now is
a structure with no rules attached, and it will acquire wrong ones.
