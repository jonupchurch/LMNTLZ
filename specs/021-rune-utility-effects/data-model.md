# Phase 1 — Data Model: Rune Utility Effects

**Feature**: `021-rune-utility-effects` · **Date**: 2026-08-01

**Nothing here is a new persisted field.** Every storage shape this feature needs
already exists; what is new lives in memory, in the engine, for the length of one
battle. That is why the Constitution XVI gate passes cleanly.

---

## Entities

### `RuneEffect` — the catalog entry *(new, in-memory only)*

One of the 33. Lives in `packages/sim/rules/runeEffects.ts`, frozen, never stored.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | stable, kebab-case, e.g. `before-the-first-blow`. **This is what is written to `runes.utility_effect`** — never the display name, which is prose and may be re-worded. |
| `name` | `string` | the authored display name |
| `pool` | `PoolKey` | `'common'` or one of the 9 damage types |
| `role` | `'offense' \| 'defense' \| 'tempo'` | each element pool holds exactly one of each |
| `shape` | `'trigger' \| 'chance' \| 'ward'` | the three condition shapes the design allows |
| `hooks` | `PassiveHooks` | reuses 020's surface verbatim — see [research.md](research.md) Decision 1 |

**Rules**

- **R-1**: exactly 33 entries — 6 with `pool: 'common'`, 3 for each of the 9 types.
- **R-2**: within each element pool, the three `role` values are distinct.
- **R-3**: no `name` collides with any authored power or passive name. Enforced by
  a test that reads `packages/content`, not by review.
- **R-4**: every `id` is unique and stable. Renaming one is a data migration, not
  an edit — a stored rune names the id.
- **R-5**: every magnitude referenced by any `hooks` implementation comes from
  `RUNE_MAGNITUDES`. No numeric literal in an effect body.

### `RUNE_MAGNITUDES` — the single tuning surface *(new, in-memory only)*

One frozen object, mirroring `PASSIVE_MAGNITUDES`. **FR-002 exists because of the
battle-length flag**: these numbers were sized against a 102-hero-turn battle and
the engine currently produces ~28, so they will move. Keeping them in one object
makes that a single-file edit rather than a hunt.

### `PoolKey` — derived, never stored

Ten values: `'common'` plus the 9 damage types. **Derived from the hero and the
slot** by the existing `slotAccepts(heroId, slot)`:

| Slot | Pool |
|---|---|
| `primary` | the hero's authored `primary` type |
| `secondary` | the hero's authored `secondary` type |
| `common` | `'common'` |

**Rules**

- **R-6**: never written to the rune row (Constitution XV). Re-derived on read.
- **R-7**: a hero's three slots always resolve to three different pools, which
  follows from the authored `secondary ≠ primary` rule. Asserted, not assumed.
- **R-8**: melee heroes always take a magic secondary, so the Slash, Pierce and
  Crush pools are reachable from **3 slots each on the whole roster** — 3 champions
  × 1 primary slot. Under-used by design, not a defect.

### `runes` row — **existing table, no migration**

| Column | State |
|---|---|
| `stage` | unchanged, `0..4` |
| `allocations` | unchanged |
| `utility_effect` | **exists, nullable text, every row currently `null`** |

**Rules**

- **R-9**: non-null only when `stage = 4`. Both readers already gate on this
  (`read.ts:143`, `runes.ts:441`) and the gate stays.
- **R-10**: must name an id in the pool that slot derives to. Validated
  server-side on write; a mismatch is refused by name.
- **R-11**: immutable once written. The only operations are *destroy and restart*
  and *melt the champion down*.
- **R-12**: rows written before this feature keep `null` and read as *a complete
  rune whose effect predates the catalog*. They are honest, not corrupt. What is
  owed to them is a product decision recorded in [plan.md](plan.md) § *Open*.

### `RuneLoadout` — **existing snapshot shape, unchanged**

`apps/api/src/battle/board.ts:79`. Already declares `utility: readonly string[]`
and is already populated by `runeLoadouts()`. This feature is the first consumer.

- **R-13**: absent means none, for every battle already recorded. Preserved
  exactly (Constitution XVI).
- **R-14**: frozen into the battle at creation. Buying a rune mid-battle changes
  the *next* fight, never the one in progress.

### `HeroState` — two new in-memory fields

| Field | Type | Why |
|---|---|---|
| `runeEffects` | `readonly string[]` | **per-instance, not per-hero-identity.** Two players fielding the same champion carry different runes; keying off `heroId` would hand one player's runes to their opponent. See [research.md](research.md) Decision 2. |
| `hasActed` | `boolean` | needed only by `Before It Knew`; set when a hero takes its first turn |

- **R-15**: defaults to `[]` / `false` in `board.ts`, so every existing fixture and
  stored snapshot constructs unchanged.
- **R-16**: an id in `runeEffects` that is not in the catalog **throws at board
  construction**, loudly. An unknown id resolving to an inert battle is the failure
  mode this whole feature exists to end (FR-021).

### `StatusInstance` — one new optional flag

| Field | Type | Why |
|---|---|---|
| `stubborn` | `boolean \| undefined` | *"this effect resists cleansing"* — `It Stays Open` and `Stays Broken`. A property of the placed effect, set by `shapeOutgoing`, honoured by `cleanse`. |

- **R-17**: absent is falsy, so every existing effect is unaffected.

---

## State transitions

### A rune slot

```
Empty ──buy major 150──▶ Stage 1 ──buy minor 150──▶ Stage 2 ──buy trace 150──▶ Stage 3
                                                                                  │
                                                              buy utility 200 ────┤
                                                          (NEW: names an effect)  ▼
                                                                              Stage 4
                                                                             complete

Any stage ──destroy──▶ Empty          Stage 4 ──rebuild (one transaction, 650)──▶ Stage 4
                                                (NEW: also names an effect)
```

**The change is narrow**: the 3→4 edge and the rebuild edge each gain a required
effect argument. No other edge moves.

### An effect during a battle

| Shape | Transition | Bound |
|---|---|---|
| `trigger` | armed → fired → persists to end of battle | fires **at most once** (FR-014) |
| `chance` | rolls on each qualifying event, leaves no state | one draw per event |
| `ward` | charged → spent | **exactly one charge per battle** (FR-015), expressed by returning the effects that pay for it, as `lethalGuard` already does — so *once per battle* needs no field on `HeroState` |

---

## What deliberately has no model

- **Displacement.** `Weight Tells` says *"cannot be moved from your row"* and no
  mechanic in LMNTLZ moves a champion. Recorded as an inert clause (spec A-03), not
  modelled. Inventing forced movement to satisfy one clause of one effect is the
  scope creep this note exists to prevent.
- **A per-effect cooldown.** The design is explicit that triggers fire once and
  persist, precisely so nothing re-arms; a re-arming effect at 36 live effects per
  battle would put a proc on nearly every turn.
- **A second potency system.** `Knocked Loose` routes through the existing
  potency-versus-`Resolve` contest (FR-018), which is what finally gives `Resolve`
  a job.
