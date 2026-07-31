# Phase 1 — Data Model: The Client Halves

**Date**: 2026-07-30 · **Plan**: [plan.md](plan.md)

> **No new table, column, index or migration.** Every entity below already exists
> and is already written to. This feature reads them and shows them.

---

## 1 · Rune placement (US1)

Existing: `hero_runes`, written by `POST /v1/heroes/:heroId/runes/:slot`.

| Concept | Rule | Source |
|---|---|---|
| Slots per hero | **three** — one primary, one secondary, one common | `slotAccepts()` |
| Stage | `0..4`; `0` is empty | `MAX_STAGE` |
| Stage costs | 150 · 150 · 150 · **200** | `config.stageCosts` |
| Stage boosts | +20 · +10 · +5 · **utility** | `config.stageBoosts` |
| Utility slot | gated behind all three stat boosts | `06-progression.md` |
| Stat cap | **75 per stat** | `STAT_CAP` (content) |
| Distinctness | each boost must target a **distinct stat** | the Forge export, matching `runes.ts` |
| Rebuild | **650** destroys and replaces a whole rune | `config.fullRuneCost` |

**State transitions.**

```
empty ──place──▶ stage 1 ──▶ stage 2 ──▶ stage 3 ──▶ stage 4 (utility) ──▶ COMPLETE
   ▲                                                                          │
   └──────────────── rebuild, 650, destroys everything ◀──────────────────────┘
```

**Two invariants the screen must honour and cannot enforce.**

- **Planning is free.** Exploring an allocation charges nothing and stores nothing
  (FR-002). The client may compute a preview; the **server re-validates the cap and
  the balance on commit** and is the only authority (Constitution XII).
- **Destroying is explicit.** A rebuild is never the default action, and the
  consequence is named *before* the confirmation (FR-003) — runes are destroyed on
  replacement, and that rule is load-bearing for the whole no-nerf economy.

**Read**: [`contracts/runes-read.md`](contracts/runes-read.md) — `GET /v1/me/runes`,
owner-only, **never sharing a serialiser with the scout path**.

---

## 2 · Pass and entitlement (US2)

Existing: `entitlement_grants`, keyed on **`account_id` and never a storefront**.

| Concept | Rule |
|---|---|
| Product | **one** — the boost pair — in **seven** durations |
| Prices | $5 · $10 · $15 · $20 · $50 · $90 · $160, every one a multiple of $5 |
| Stacking | buying while active **adds to the end date**; time is never forfeited |
| Ownership | belongs to the account, so a browser purchase survives a Steam sign-in |
| Ceiling | a purchase that would breach it is refused **before the provider is reached** |

> **⛔ What the pass currently does: nothing.** `awardShards()` computes
> `base × zone × dailyTier × starter` and never reads the entitlement. Canon says
> *"a boost doubles your first 10"*. **011 Phase 8 fixes it and is a hard
> prerequisite of US2** — this model describes what a pass is *supposed* to be, and
> the store must not sell it until that is true.

---

## 3 · Replay (US3)

Existing: `battles` + a blob in the private store. **Never re-simulated.**

| Field | Rule |
|---|---|
| `watchable` | **computed server-side, per entry.** A client must never discover expiry by trying and failing |
| Retention | 7 days for *watching*; the record and its outcome are permanent |
| Access | a **non-participant gets `404`**, not `403` — existence is not confirmed |
| Failure modes | `not-found` · `expired` · `unavailable`, distinguished |

`watchable` collapses four situations — never written, deleted by cleanup, past the
window, held for a report — because **the player's options are identical in all
four**, which is none.

**`asModerator` stays `false`.** Nothing can set it; 015 owns the operator identity.
018 does not touch it.

---

## 4 · Progression config (read-only, US1 + US2)

Already served inside `GET /v1/me/shards` as `config`. **Not an entity — a
projection**, and the reason no number in this feature may be a literal.

`stageCosts` · `stageBoosts` · `fullRuneCost` · `capInRunes` · `balanceCap` ·
`dailyTiers` · `attackVictory` · `defenseHold` · `hiddenMultiplier` ·
`holdsAreTiered`, plus `today.nextBoundaryAt`.

> **`nextBoundaryAt` is an absolute instant on purpose.** `config.ts`: *"if this is
> ever changed to something per-player, the API shape does not have to change with
> it."* A screen that prints `00:00 UTC` re-litigates that quietly — render the
> instant.

---

## What this feature adds to the database

**Nothing.** If a task proposes a migration, the task is wrong.
