# API Contract: Roster & Squads

**Feature**: `006-roster-and-squads` | Versioned JSON REST under `/v1`.

**The counting constraint that shapes everything**: 27 heroes, all unlocked.
**12 go to defense** across two zones and then cannot attack. Up to **3 attack
squads** are drawn from the remaining **15** — and 3 × 6 = 18 > 15, so **overlap
is forced, not optional**.

---

## `GET /v1/roster`

```jsonc
{
  "heroes": [ /* all 27 — id, name, primary, secondary, bane, fault,
                  role, reach, stats, powers, runes. From @lmntlz/content. */ ],
  "assignments": {
    "defense": {
      "visible": { "seats": [...], "holdStreak": 14, "editedAt": "..." },
      "hidden":  { "seats": [...], "holdStreak":  3, "editedAt": "..." }
    },
    "offense": [
      { "slot": 0, "name": "Vanguard",    "seats": [...], "complete": true  },
      { "slot": 1, "name": "Second Wind", "seats": [...], "complete": false }
    ]
  },
  "available": { "forDefense": [...], "forOffense": [...] }
}
```

`available.forOffense` is the 15 heroes **not** on either defense squad.
`available.forDefense` is every hero — moving one from an attack squad is legal and
is what the eviction warning covers.

## `PUT /v1/squads/defense/:zone` — `zone` ∈ `visible` | `hidden`

```jsonc
{
  "seats": [
    { "row": "front",  "index": 0, "heroId": "bramwen",
      "config": {
        "targeting": ["lowest-current-hp", "nearest"],
        "ranking":   [5, 4, 3, 2, 1, 0],
        "allyRule":  null
      } },
    /* ... six seats: 2 front, 3 middle, 1 back ... */
  ]
}
```

```jsonc
// 200
{
  "holdStreak": 0,           // reset — the canonical form changed
  "streakReset": true,
  "warnings": [
    { "code": "reach-1-back-seat", "heroId": "silka",
      "message": "Silka has reach 1 in the back seat. She cannot attack from there." },
    { "code": "power-never-fires", "heroId": "vael", "tiers": [4, 5],
      "message": "Under this ranking, Vael's tier 4 and tier 5 powers never fire." }
  ]
}
```

| Status | When |
|---|---|
| `200` | saved |
| `409` | a hero appears on the other defense zone |
| `422` | not exactly 6 seats, or not 2 front / 3 middle / 1 back |
| `422` | a `ranking` is not a permutation of 0–5 |

> **`warnings` never blocks.** A reach-1 back seat and a self-defeating ranking are
> both **surfaced, not prevented** — the seat is priced, the ranking is a lever.
> The only thing this feature blocks with a confirm is **eviction**, which is
> destructive and non-obvious.

### The hold streak reset

Resets iff the **canonical form** changed:

```
canonicalForm = per seat, in row then index order:
                heroId · targeting[0] · targeting[1] · ranking · allyRule
```

**A save producing an identical canonical form is a no-op and costs nothing** — a
player must be able to open the editor to read their configuration and close it
again. Compared on the hash, **never** on a client-set dirty flag.

**Rune placement and gear score are outside the hash.** The streak measures how
long a *plan* has held, and gear is not the plan. Including it would make
"improving a defending hero" and "keeping a streak" mutually exclusive.

## `PUT /v1/squads/offense/:slot` — `slot` ∈ `0` | `1` | `2`

```jsonc
{ "name": "Vanguard", "seats": [ { "row": "front", "index": 0, "heroId": "kaellis" }, ... ] }
```

No per-champion config: **the player commands offense**, so there is nothing to
configure. `409` if a named hero is on a defense squad.

**Squads may overlap and must** — 3 × 6 > 15.

## `POST /v1/squads/defense/:zone/preview-move` — the eviction check

Called **before** committing a hero to defense. Returns what would break.

```jsonc
// request
{ "heroId": "bramwen" }

// 200
{
  "evicts": [
    { "slot": 0, "name": "Vanguard",    "wasComplete": true, "wouldBe": 5 },
    { "slot": 1, "name": "Second Wind", "wasComplete": true, "wouldBe": 5 },
    { "slot": 2, "name": "Long Reach",  "wasComplete": true, "wouldBe": 5 }
  ],
  "poolAfter": { "heroes": 14, "squads": 3, "seatsNeeded": 18 }
}
```

**`evicts` names every affected squad and is never truncated.** Truncation is how a
player discovers the third squad mid-battle. **`poolAfter` is what makes the
constraint legible** — it is *why* this keeps happening, and no per-squad message
conveys it.

The client renders this as a confirm. The template is **plural by default**;
singular and zero are the branches.

**No auto-repair.** Nothing substitutes another hero into the gap. The squad is the
player's plan; filling it replaces the plan with a guess.

## `GET /v1/players/:targetId/scout`

```jsonc
{
  "playerId": "acc_...",
  "username": "reyna",
  "league": "gold",
  "visible": {
    "holdStreak": 14,
    "seats": [
      { "row": "front", "index": 0,
        "hero": { "id": "ossic", "name": "Ossic",
                  "primary": "earth", "secondary": "fire",
                  "bane": "air", "fault": "water",     // derived, free information
                  "role": "tank", "reach": 2 },
        "runes": [ { "element": "earth", "stages": 4 },
                   { "element": "fire",  "stages": 2 },
                   { "element": "common","stages": 0 } ] }
    ]
  },
  "hidden": { "holdStreak": 3 }        // THE STREAK ONLY. NEVER composition.
}
```

**One endpoint, two disclosure rules**, which is why it is its own contract and not
a variant of the profile read. A shared serialiser is exactly how the Hidden squad
leaks.

| Disclosed | Withheld |
|---|---|
| the six Visible heroes and both their types — so Banes and Faults | **every stat value**, base or runed |
| the 2/3/1 formation | **which stats** any rune boosts |
| each hero's three rune slots, their elements, and stages reached (0–4) | **which utility effect** a completed slot holds |
| **both** hold streaks | **targeting priority and power ranking, in both zones** |
| | **the entire Hidden composition** |

**Rune fill shows commitment, never power.** At an identical 1,950-shard spend the
best allocation scores ~3.35× the worst, so a full set of pips means a player
committed, not that they committed well. That is what makes the disclosure safe and
bluffing a real strategy.

---

## Internal contracts

```ts
function canonicalForm(squad: DefenseSquad): string;   // the hash input
function streakResets(prev: DefenseSquad, next: DefenseSquad): boolean;

/** Every attack squad containing this hero. NEVER truncated. */
function evictionImpact(accountId: string, heroId: string): EvictionImpact;

/** Imported from `@lmntlz/sim/rules` — NOT fetched. Pure, client-safe.
 *  PASS 9, not 60: a hero takes ~8.5 turns in a real 6v6, and the number on the
 *  screen has to describe the game the player is about to play. */
import { firingProfile } from '@lmntlz/sim/rules';
firingProfile(hero, ranking, 9);
```
