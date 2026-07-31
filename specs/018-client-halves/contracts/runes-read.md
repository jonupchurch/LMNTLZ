# Phase 1 — Contract: `GET /v1/me/runes`

**Date**: 2026-07-30 · **Plan**: [../plan.md](../plan.md) · **Finding**: [../research.md](../research.md) R1

**The one API addition in feature 018.** Everything else here reads a route that
already exists.

---

## Why it has to exist

`POST /v1/heroes/:heroId/runes/:slot` **commits** a stage. Nothing **reads** one
back. Rune state appears in exactly one response in the whole API — the scout
payload — and it is deliberately incomplete:

```ts
// squads/scoutSerializer.ts
runes: [{ element, stages }]     // "Element and stages only. Which stat a rune
                                 //  boosts is the thing…" — the disclosure boundary
```

That is **correct for an opponent and useless for the owner**. The Forge must show
which slot holds what, at what stage, allocating which stats, before a player can
decide anything.

---

## Request

```http
GET /v1/me/runes
Authorization: Bearer <session>
```

No parameters. The whole roster every time, for the same reason
`GET /v1/matchmaking/candidates` takes none: 27 heroes × 3 slots is small, and a
paging contract is a thing to get wrong for no gain.

## Response `200`

```jsonc
{
  "heroes": [
    {
      "heroId": "h01",
      "slots": [
        {
          "slot": "primary",
          "element": "earth",
          "stage": 3,                       // 0..4
          "allocations": { "might": 20, "speed": 10, "luck": 5 },
          "utility": null,                  // set only at stage 4
          "spent": 450
        }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `stage` | `0..4`. **`0` means empty**, not "stage zero exists" |
| `allocations` | **owner-only.** The single reason this route exists |
| `utility` | `null` below stage 4 — the slot is gated behind all three stat boosts |
| `spent` | derived from the ledger, never stored |

**Every hero is returned, including bare ones**, so the Forge's *"ALL 27 · OPEN ·
BARE"* filter is a client-side view of a complete list rather than three requests.

## Errors

| Status | When |
|---|---|
| `401` | no session |

There is no `404`: a player always has 27 heroes, and an empty slot is `stage: 0`.

---

## ⛔ The rule this route must not break

> **It MUST NOT share a serialiser with `squads/scoutSerializer.ts`.**

Constitution XVII — *storing is not exposing* — and the third time this exact
collision has come up:

| Feature | Two audiences, one table | Resolution |
|---|---|---|
| 012 | `profile` vs `scout` | *"`profile` and `scout` never share a serialiser"* — a standing instruction |
| 018 | **owner** vs `scout` | this route |

The temptation is real: both read `hero_runes`, and a shared function with a
`includeAllocations` flag looks like less code. **It is one boolean away from
publishing every player's stat allocation to everyone who scouts them** — and the
flag would default to the wrong value exactly once.

**Two functions, two files, no shared branch.** A test asserts the scout response
still omits `allocations` after this route ships.

---

## What the Forge does NOT need a route for

Confirmed served already, so the plan adds nothing else (R2):

| Needed | Where it already comes from |
|---|---|
| stage costs `150·150·150·200` | `GET /v1/me/shards` → `config.stageCosts` |
| stage boosts `+20·+10·+5` | → `config.stageBoosts` |
| full-rune rebuild `650` | → `config.fullRuneCost` |
| balance cap, cap-in-runes | → `config.balanceCap`, `config.capInRunes` |
| the daily boundary | → `today.nextBoundaryAt` — **an absolute instant, render it, never hardcode "00:00 UTC"** |
| stat cap `75` | `STAT_CAP` from `@lmntlz/content` |
| which slot accepts which element | `slotAccepts()`, mirrored by the response's `element` |

**So no number in the Forge may be a literal**, and a task asserts none is.
