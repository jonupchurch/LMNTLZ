# Implementation Plan: Public Profiles & Data Export

**Feature**: `012-profiles` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 1 · Account, § 4 · Battle

## Summary

What one player sees of another, and what a player can take away about themselves.
**The profile is fixed**, and its battle record is the **last 20 Visible battles
selected as such** — never filtered from a longer list, because filtering leaks the
Hidden count three ways.

## Technical Context

**Language**: TypeScript · **Client**: React · **API**: Hono · **Storage**: Postgres
**Export**: plain tabular, generated server-side · **Testing**: Vitest + Playwright
**Constraints**: export is a bulk read and must be rate-limited. Avatar review is
a human queue, so throughput is a person, not a service.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Disclosure decided server-side, not by hiding a field client-side |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **N/A** | — |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | Depends on records feature 008 must already carry |
| XVII | Storing is not exposing | **PASS** | **The whole feature.** FR-003 – FR-008 |
| XVIII | Harm is a gate | **PASS** | Avatar pre-moderation is a genuine harm gate |
| XIX | Vendors behind interfaces | **PASS** | The dual-price rule is a ratio, asked of feature 011 |
| XX | Written docs are canon | **PASS** | The screen's configurable-visibility proposal was **rejected** |

**No violations.**

## Project Structure

```text
apps/api/src/profiles/
├── publicProfile.ts    the fixed field set
├── visibleRecord.ts    SELECT … WHERE zone = 'visible' LIMIT 20
├── export.ts           scoped by requester; no composition, either side
└── avatar.ts           purchase, submit, hold for review

apps/client/src/features/profile/
├── PublicProfile.tsx
├── BattleRecord.tsx
└── AvatarPicker.tsx    curated set + custom submission
```

**Structure decision**: `visibleRecord.ts` is its own module with one query in it,
because the difference between *selecting* 20 Visible and *filtering* 20 down to
Visible is a single clause — and it is the clause the whole disclosure model rests
on.

## Phase 0 — Research

1. **Write the leak test before the query.** Construct a player whose last 40
   battles alternate Visible and Hidden. A **filtered** implementation returns ~10
   entries; a **selected** one returns 20. **That is the whole test, and it fails
   loudly on the wrong implementation** — which no amount of code review reliably
   catches.
2. **Confirm the export's row shape carries no composition.** The battle record
   *does* carry both squads; the export must drop both columns rather than
   conditionally emitting one.
3. **Settle avatar review throughput.** A review is a ~20-second glance against a
   $5 charge, so the fee is what keeps the queue human-sized. Confirm the queue
   surface exists in feature 016.

## Phase 1 — Design

**Contracts**:

```
GET /v1/players/:id/profile      → fixed fields + last 20 Visible
GET /v1/me/export                → everything of the requester's own
GET /v1/guilds/:id/export        → officers only; EVENT DATA ONLY
POST /v1/me/avatar               → purchase + submit for review
```

**Two export endpoints rather than one parameterised endpoint.** A scope parameter
invites a bug where an officer requests the wider scope; two routes with two
queries cannot express that mistake.

**Quickstart**: view a profile belonging to a heavy Hidden player and confirm the
list is 20 Visible entries with no measurable gap.

## Phase 2 — Notes for `speckit-tasks`

**The alternating-battles leak test is task one.** It is the cheapest possible
guard on the subtlest rule in the feature.

**Build the curated avatar path before the custom one.** Curated needs no review
queue, so it delivers the whole feature's value without depending on feature 016
existing yet.

**Never render a Hidden squad on this surface, at any stage of development.** A
temporary debug view is how it ends up in a screenshot.
