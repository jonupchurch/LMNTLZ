# Phase 1 — Contracts: Rune Utility Effects

**Feature**: `021-rune-utility-effects` · **Date**: 2026-08-01

Three surfaces change. **No new endpoint is added**, and no route is removed.

---

## 1. `POST /v1/heroes/:heroId/runes/:slot` — one new optional field

The existing route already serves both *advance a stage* and *rebuild*, because
which one happens is a property of the slot's state rather than of the request.
That stays true; the body gains one field.

**Request body**

```jsonc
{
  "allocations": { "might": 20, "toughness": 10, "speed": 5 },
  "utility": "before-the-first-blow",   // NEW
  "rebuild": false,                      // existing
  "confirmed": false                     // existing, rebuild only
}
```

| Field | When required | Notes |
|---|---|---|
| `utility` | **required** when the request advances stage 3 → 4, and on **every** rebuild | an effect **id**, never a display name |
| `utility` | **refused** when the request advances to stage 1, 2 or 3 | naming an effect on a stat stage is a client bug, not a no-op |

**Why the rebuild always requires it**: a rebuild lands directly on stage 4 in one
transaction, by design — *"rebuilding to the same stage should be one transaction,
not four."* It cannot lean on a later advance to fill the effect in, which is
exactly how `runes.ts:377` came to hardcode `utilityEffect: null`.

**Refusals** — all reuse the existing `RuneError` → HTTP mapping, so no new status
codes:

| Condition | Code | HTTP | Message names the specific problem |
|---|---|---|---|
| `utility` missing on a 3→4 advance | `slot-mismatch` | 422 | "Stage 4 places a utility effect; none was chosen." |
| `utility` present on a 1/2/3 advance | `slot-mismatch` | 422 | names the stage being bought |
| id not in the catalog | `slot-mismatch` | 422 | "No such utility effect: `<id>`." |
| id not in **this slot's pool** | `slot-mismatch` | 422 | names the id, the slot, and the pool the slot offers |
| balance below the stage cost | `insufficient-shards` | 402 | unchanged |
| rebuild without `confirmed` | `needs-confirmation` | 409 | unchanged |

> **Pool membership is validated server-side and derived**, from the existing
> `slotAccepts(heroId, slot)`. A client that sends any of the 33 gets the 29 that
> are not in its pool refused by name. Constitution XII — never trust client state
> for authorization — and XV — the pool is derived, never stored.

**Response**: unchanged shape (`stage`, `charged`, `balance`, `gearScore`).

---

## 2. `GET /v1/me/runes` — an existing field stops always being `null`

No shape change. `OwnedRuneSlot.utility` is already declared and already gated on
`stage >= 4` (`read.ts:143`). This feature is the first thing that ever makes it
non-null.

```jsonc
{
  "heroId": "…",
  "slots": [
    { "slot": "primary", "element": "fire", "stage": 4,
      "allocations": { … }, "utility": "it-spreads", "spent": 650 }
  ]
}
```

**The client needs no endpoint to list a pool.** `apps/client` may import
`@lmntlz/sim/rules` (and never `/resolver`), so the Forge reads the catalog from
the same module the engine runs and filters it by the `element` this response
already returns. That is Constitution XIII satisfied by construction rather than by
discipline: there is no second copy to drift.

---

## 3. The battle turn packet — the reach roll travels with it *(US3)*

`Further Than It Looks` rolls **at turn start** and the design requires the result
be **shown before the player chooses**, so it must resolve when the packet is built
and travel inside it. A roll made at resolution would change the target list after
the player had chosen from a smaller one.

```jsonc
{
  "state": { … },
  "turnQueue": [ … ],
  "reachGranted": true          // NEW — present only when a bearer's roll succeeded
}
```

- **Server rolls, client displays.** The client never rolls and never learns a
  future roll — only the one already applied to the turn it is being offered
  (Constitution XII).
- **The enlarged target list is what the player is offered**, so the legal-target
  computation for that turn already includes the bonus. `reachGranted` explains the
  list; it does not modify it client-side.
- **Disclosure follows 020's rule unchanged.** A rune effect is disclosed on the
  same terms as any other effect: full detail on your own champions and on effects
  you caused; an enemy's self-applied effect shows without its duration.

---

## What does not change

| Surface | Why |
|---|---|
| `runes` table schema | `utility_effect` already exists, nullable text — **no migration** |
| `RuneLoadout` snapshot shape | already declares `utility: readonly string[]` |
| `DELETE /v1/heroes/:heroId/runes` (melt) | already refunds 80% of *what is placed*, which includes stage 4's 200 |
| `GET /v1/heroes/:heroId/runes` (refund quote) | already names every rune it is about to destroy |
| Replay endpoints | replays are stored event logs and are never re-simulated |

---

## Engine version

`e0.5.0` → **`e0.6.0`**, in `packages/sim/rules/index.ts`, **in the US3 commit and
no earlier** — US1 and US2 add no draws.

- Stored replays carry their own version and never enter the new path
  (Constitution XVI).
- **The deploy must drain.** The note is already in `docs/tech-stack.md` from
  020 T025; this feature obeys it rather than rewriting it.
