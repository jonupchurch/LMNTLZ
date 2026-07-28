# Implementation Plan: Replays & the Battle Record

**Feature**: `008-replays` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 4 · Battle, Replay

## Summary

Two objects with different lifetimes: a **permanent record** in Postgres and an
**expiring replay** in blob storage. The record is the analytics product, because
there is no analytics vendor — so its four unbackfillable fields ship with the
first battle ever written.

## Technical Context

**Language**: TypeScript · **Storage**: Postgres (records) + Vercel Blob (replays)
**Scheduling**: Vercel Cron for cleanup · **Testing**: Vitest
**Volume**: daily players × 20 battles; ~200 B per record, ~5 KB per replay
**Steady state**: ~7 GB at 10k daily players, ~70 GB at 100k

**Constraints**: cleanup must be **query-driven, resumable and re-runnable**.
Monitoring must alarm on **observed state**, not on job success.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | A replay records what the server decided |
| XIII | One rules engine | **N/A** | Computes nothing |
| XIV | Balance upward | **PASS** | Replays are recorded, so a patch cannot reach backwards |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | **The canonical case.** FR-003–FR-008 |
| XVII | Storing is not exposing | **PASS** | Both squads recorded; neither exported |
| XVIII | Harm is a gate | **N/A** | — |
| XIX | Vendors behind interfaces | **PASS** | Blob storage behind an interface |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/replays/
├── record.ts          write the permanent row + the blob, on conclusion
├── read.ts            list 50; fetch one; report expiry distinctly
├── cleanup.ts         query-driven deletion, resumable
├── retention.ts       holds for open reports
└── storage.ts         the blob interface — one implementation

apps/api/src/db/schema/battles.ts    (shared with feature 007)
```

**Structure decision**: `storage.ts` is an interface with one implementation. If
the provider turns out to offer lifecycle expiry, `cleanup.ts` becomes a
*verification* rather than a mechanism — and that is a change behind the interface,
not through the codebase.

## Phase 0 — Research

1. **Does the blob provider support lifecycle expiry?** If yes, the cleanup job
   disappears and FR-014's query becomes the check rather than the deleter. **This
   is the single question with the largest effect on this feature's size**, and it
   is unanswered in `docs/tech-stack.md`.
2. **Settle the report grace period.** FR-016 requires retention *"for a stated
   period"* after a report closes. State it.
3. **Confirm the record write is atomic with battle conclusion.** A battle that
   settles but fails to record is invisible to every aggregate — and the aggregate
   is the whole point of the record.

## Phase 1 — Design

**Contracts**:

```
recordBattle(conclusion)      → writes row + blob
listBattles(accountId)        → most recent 50, with a watchable flag per entry
getReplay(battleId)           → packets | Expired | NotFound
placeHold(battleId, reportId) / releaseHold(reportId)
cleanupExpired()              → count deleted; safe to re-run
expiredButUndeletedCount()    → the monitoring signal
```

**`listBattles` returns a watchable flag per entry.** Letting the client discover
expiry by failing to open a replay is the behaviour FR-013 exists to prevent.

**Quickstart**: conclude a battle, confirm both artifacts, advance the clock past
7 days, confirm the record survives and the entry reports itself unwatchable.

## Phase 2 — Notes for `speckit-tasks`

**The record schema is task one and blocks features 09, 10 and 12.** All four
unbackfillable fields land in the first migration — there is no later.

**Write `expiredButUndeletedCount` alongside `cleanupExpired`, not after.** It is
the detector for the failure mode where cleanup silently stops, and a detector
added later is written by someone who has not yet seen the failure.

**Test the retention hold across the boundary**: open a report on day 3, advance to
day 12, confirm the replay is intact, close the report, advance past the grace
period, confirm it is released.

**Do not build a re-simulation path.** The seed is stored for investigation. The
moment a replay endpoint can re-derive, someone will use it as a fallback for an
expired replay and a balance patch will change a past result.
