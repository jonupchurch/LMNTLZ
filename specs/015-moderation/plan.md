# Implementation Plan: Moderation

**Feature**: `015-moderation` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § Social models · Report

## Summary

**A model scores; a human decides.** The classifier ranks the queue and never
creates it — at 99% specificity over 60,000 daily messages it would otherwise
produce 600 false flags against 60 real reports. Full coverage, asynchronous,
batched.

## Technical Context

**Language**: TypeScript · **Classifier**: batch API behind an interface
**Storage**: Postgres · **Testing**: Vitest
**Cost**: ~$68/month at 10k daily players, ~$675 at 100k — roughly **1% of net
revenue at any scale**, since both sides scale with players

**Constraints**: classification is **asynchronous and gates nothing**. Human load
— ~2 hours a day at 10k players, ~10 at 100k — is the real constraint, and every
choice here is shaped by keeping it small.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Bans enforced server-side, never by hiding a control |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **PASS** | FR-014 — a chat ban touches no gameplay standing |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | An audit trail cannot be reconstructed after the fact |
| XVII | Storing is not exposing | **PASS** | Reported content is retained beyond its channel and is not thereby publishable |
| XVIII | Harm is a gate | **PASS** | **The whole feature.** A narrow bar; *flag, never act* |
| XIX | Vendors behind interfaces | **PASS** | Classifier behind an interface; batch size is the knob |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/moderation/
├── classifier.ts     the interface — batching is an implementation detail
├── queue.ts          two queues; hate/NSFW never shares with friction
├── scoring.ts        rank reports; escalate proactively only at high confidence
├── actions.ts        mute (auto) · ban (human) · forced rename (human)
├── history.ts        per-account ban history for escalation
├── notices.ts        AI drafts, a human sends, no action links
└── retention.ts      holds on reported content and its evidence

workers/classify.ts   the batch job
```

**Structure decision**: `actions.ts` separates *automatic* from *human-only* at the
function level rather than by a permission flag. **A mute has no human-issued
variant and a ban has no automatic one** — the split is structural, so no
configuration mistake can promote automation into issuing a ban.

## Phase 0 — Research

1. **Measure classification quality at 100 items per call before committing.**
   Quality can degrade when a model judges 100 in one pass rather than 20. **If it
   does, the batch size is the knob — not the coverage.** This is the one
   pre-commitment measurement the design explicitly calls for.
2. **Set the mute threshold in distinct accounts.** It is what defeats a
   single-actor brigade, and it must be distinct *accounts*, not distinct reports.
3. **Confirm the two-queue split at the data layer**, not in a view. A shared table
   with a filter is one forgotten `WHERE` from the drowning problem the split
   exists to prevent.

## Phase 1 — Design

**Contracts**:

```
report(targetType, targetId, reporterId)   → queued; places a retention hold
classify(batch)                            → scores; NO side effects on messages
rankQueue(queue)                           → ordered by score
applyMute(accountId, duration)             → automatic, threshold-triggered
issueBan(accountId, scope, actorId)        → HUMAN actor required by signature
forceRename(accountId, actorId)            → human; free to the player
```

**`issueBan` takes an actor and there is no overload without one.** FR-012 becomes
a type error rather than a policy someone has to remember.

**`classify` returns scores and touches nothing.** It has no write access to
messages at all — FR-003 by capability rather than by discipline.

**Quickstart**: file reports of mixed severity, confirm ordering; confirm a
classifier run alters no message; issue each action type and confirm the notice.

## Phase 2 — Notes for `speckit-tasks`

**The blocklist belongs to feature 014 and gates there.** Nothing in this feature
gates anything — worth stating in the tasks so the two are not merged.

**Write the "classifier changed nothing" test early.** It is the constitutional
property of the feature and it is trivial to assert.

**Ban escalation needs history from the first ban**, or the second offense starts
at the bottom. Same shape as XVI: cheap now, unreconstructable later.

**Retention holds are cross-feature** — a report places a hold that feature 008
honours. Test across the seam, not just within this feature.
