# Implementation Plan: Operations & Admin Tooling

**Feature**: `016-ops-admin` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) — reads across all of it

## Summary

Where the work every other feature produces actually gets done. **Reversible
actions execute; irreversible ones propose**, confirmed on a surface automation
cannot reach. Plus the maintenance flag, the scheduled jobs, and error reporting.

## Technical Context

**Language**: TypeScript · **Flag**: edge config, changeable without a deploy
**Scheduling**: platform cron · **Errors**: managed reporter, client and server
**Storage**: Postgres for the audit log · **Testing**: Vitest

**Constraints**: the intended operator **may be an agent**, so scoping and
logging are structural rather than procedural. Source maps must be uploaded at
build time or client stack traces are unusable.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Operator capability is scoped; a tool is not a bypass of the rules |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **PASS** | A discarded battle costs the player nothing |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | An audit trail cannot be reconstructed later |
| XVII | Storing is not exposing | **PASS** | Operator views are scoped, not unrestricted |
| XVIII | Harm is a gate | **PASS** | The gate sits at **irreversibility**, which is where the harm is |
| XIX | Vendors behind interfaces | **PASS** | Error reporting and scheduling behind interfaces |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/ops/
├── maintenance.ts    live | draining | down, read from edge config
├── actions.ts        reversible → execute; irreversible → pending
├── pending.ts        confirmation surface + expiry
├── audit.ts          actor, action, time — every administrative call
└── jobs/
    ├── cleanupReplays.ts    query-driven, resumable
    ├── successionTimers.ts  surfaces outcomes; executes nothing
    └── health.ts            observed-state checks, not job self-reports

apps/admin/           the small confirmation surface. Deliberately minimal.
```

**Structure decision**: `apps/admin` exists and is small. **Propose-don't-execute
requires somewhere to confirm**, so the confirmation surface is unavoidable — what
good tooling avoids is the *expensive* half of an admin console, not the whole of
it. Worth stating plainly, because the opposite was claimed earlier and is wrong.

## Phase 0 — Research

1. **Decide what makes the confirmation surface unreachable by automation.** It is
   the load-bearing control for every irreversible action, and *"an agent will not
   navigate a web page"* is not a guarantee. A separate credential the tooling
   never holds is the honest version.
2. **Confirm source-map upload at build time.** Without it, client stack traces are
   minified noise and the whole reason for buying error monitoring evaporates.
3. **Settle the drain duration.** ~15 minutes is the recorded figure, chosen so
   nearly every in-flight battle finishes on its own. Verify against real battle
   lengths once feature 008 is recording them.

## Phase 1 — Design

**Contracts**:

```
maintenanceState()                   → live | draining | down
execute(action, actorId)             → reversible only; audited
propose(action, actorId)             → creates a pending record; audited
confirm(pendingId, humanActorId)     → from the confirmation surface only
health()                             → observed-state checks
```

**`execute` refuses an irreversible action by type**, not by a runtime check. The
reversible/irreversible split is expressed in the action types themselves, so
FR-008 cannot be bypassed by a caller who forgets.

**Every administrative call is audited, including refused ones.** A refusal is a
signal.

**Quickstart**: set `draining` with battles in flight, confirm they finish and new
ones refuse; take one reversible and one irreversible action and confirm the
different paths and the audit entries.

## Phase 2 — Notes for `speckit-tasks`

**Maintenance and the audit log first.** They are the two things needed before any
other feature can be operated safely, and the audit log is unreconstructable.

**Build `health()` alongside the first job, not after.** The whole point is
detecting a job that silently stopped, and a detector written later is written by
someone who has not seen the failure.

**Keep `apps/admin` deliberately small.** Its job is confirmation, not
administration. Every capability added to it is a capability that must then be
secured.

**This feature is not on the critical path** and should not block anything — but
banning a cheater must be possible before the ladder means anything.
