# Implementation Plan: Chat & Embeds

**Feature**: `014-chat` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § Social models

## Summary

Six scopes over a **fan-out-only broker**. Clients subscribe and never publish, so
every message passes through our own service first — which is what makes the shard
charge on a paid posting enforceable. Moderation is two tiers and only the cheap
one gates.

## Technical Context

**Language**: TypeScript · **API**: Hono · **Transport**: managed pub/sub behind an
interface · **Storage**: Postgres, **chat in its own tables**
**Testing**: Vitest + Playwright

**Performance**: **concurrency, not message volume, is what the transport bills.**
Roughly 200 average and 600 peak concurrent connections at 10k daily players.

**Constraints**: our API publishes over REST and **holds no socket**. The client's
socket goes directly to the broker.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Subscribe-only is **correctness** — a direct publisher bypasses the charge |
| XIII | One rules engine | **N/A** | — |
| XIV | Balance upward | **N/A** | — |
| XV | Derived data is generated | **PASS** | An embed is a **reference**, rendered from server-held data |
| XVI | Cannot be backfilled | **N/A** | — |
| XVII | Storing is not exposing | **PASS** | FR-015 — a Hidden squad exists in the record and may never be embedded |
| XVIII | Harm is a gate | **PASS** | A **slur** blocklist, not a profanity filter |
| XIX | Vendors behind interfaces | **PASS** | Transport behind an interface; messages in their own tables |
| XX | Written docs are canon | **PASS** | Presence is treated as a screen suggestion, not a requirement |

**No violations.**

## Project Structure

```text
apps/api/src/chat/
├── transport.ts     the broker interface — publish only, from us
├── tokens.ts        mint SUBSCRIBE-ONLY, per-channel, short-lived
├── send.ts          authorize → blocklist/rate/length → charge → persist
│                    → publish → enqueue for classification
├── scopes.ts        the six, their audiences and retention
├── embeds.ts        typed references; the Hidden prohibition
└── adCredits.ts     2 free daily, no carry, hard cap 4/day

apps/api/src/db/schema/chat.ts     ← ITS OWN TABLES
```

**Structure decision**: chat tables are separate from the outset (FR-009). It costs
nothing now and is what makes a later split onto its own service mechanical rather
than a rewrite.

## Phase 0 — Research

1. **Verify the transport's pricing above 200 peak concurrent connections.** Open
   in `docs/tech-stack.md`. It does not change the architecture but it does change
   the launch budget — and **presence is the designated lever** if it comes in high,
   since it makes the bill scale with total players rather than with chat use.
2. **Design token scoping.** Our API mints a short-lived credential naming exactly
   the channels a player may read. **Guild membership and starter-league status are
   both inputs**, so a token must be re-minted when either changes — including when
   a player leaves the starter league mid-session.
3. **Confirm the ordering one more time.** Blocklist gates; classifier does not.
   Two generated architecture diagrams drew this backwards, so it is worth a test
   rather than a comment.

## Phase 1 — Design

**Contracts**:

```
POST /v1/chat/:scope/messages   { body, embed? } → authorize, charge, persist,
                                                   publish, enqueue
GET  /v1/chat/token                              → subscribe-only, scoped
GET  /v1/chat/:scope/history                     → within that scope's retention
```

**There is no publish credential.** The token type minted for clients cannot
express publication — enforcement by construction rather than by a permission
check that could be misconfigured.

**Embeds resolve server-side at send time** into `{type, id, snapshot}`. The
snapshot is what makes an embed honest later, and resolving server-side is what
makes the Hidden prohibition unbypassable.

**Quickstart**: post in each scope; attempt to publish directly to the broker and
fail; attempt to embed a Hidden defense by every route and fail.

## Phase 2 — Notes for `speckit-tasks`

**Token scoping before message sending.** If clients ever hold a publish-capable
credential during development, the charge is bypassable and the habit is set.

**Write the Hidden-embed prohibition as a test over every embed type**, including
the replay path — a Visible-battle replay is embeddable, and an ambush replay is
the legitimate-looking hole.

**Ad credits are a rate cap, not a balance.** Implement the daily cap directly;
never model it as a stockpile that happens to be limited.

**Leave presence out of the first pass.** It is the cost lever and it is a screen
suggestion, not a rule.
