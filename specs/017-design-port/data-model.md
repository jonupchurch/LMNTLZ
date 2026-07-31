# Phase 1 — Data Model: The Design Port

**Date**: 2026-07-30 · **Plan**: [plan.md](plan.md)

> **No database entity, no migration, no persisted field.** This feature stores
> nothing. What follows is the model of the *presentation* layer — the things that
> have identity, validation rules and a generated source.

---

## 1 · Design token

A named visual constant. **The only place a visual value may be written.**

| Group | Source | State |
|---|---|---|
| Colour — 9 forces × 3 stops | Brand Book | ✅ in `base.css` `@theme` |
| Colour — grounds, neutrals, gold | Brand Book | ✅ in `base.css` |
| **Type** — 3 families | Design System | ⚠️ declared, **never loaded** |
| **Type scale, spacing, radius, motion** | Design System § *Typography, spacing, radius, motion* | ❌ absent |

**Validation.** FR-003: every value an export specifies exists as a named token, and
**no colour literal appears in feature or component source**. Enforced by a scan
that (a) strips comments first, and (b) asserts it found files before asserting
their content.

**Rule.** A hex in an export with no matching token is a **decision**, not a
copy-paste: either a token that was missed, or a one-off that must become one.

---

## 2 · Component

One reusable interface element with a closed set of states. Thirteen sections, from
the Design System export.

| Component | States / variants | Notable rule |
|---|---|---|
| `Button` | **seven** | every one built and shown in the gallery |
| `TypeBadge` | 9 forces | **derives colour from the force** — no colour prop (FR-007) |
| `RelationshipStrip` | Bane · Fault · neutral · secondary · primary | **five tiers**, where the export draws four |
| `HeroCard` | three scales | same data at all three; density is the only difference |
| `PowerSlot` + `CooldownRing` | ready · cooling · gated | ring is a fraction of **turns remaining** (FR-008) |
| `Meter` · `Pill` · `EffectivenessGrid` | — | the 9-type heat readout reads the generated matrix |
| Inputs & forms | rest · focus · error · disabled | `:focus-visible` ring never removed |
| `AppShell` · `Rail` · `RailGroup` · `Header` | active per entry | **no entry without a destination** (FR-015) |
| `ConnectionState` · maintenance | connected · degraded · recess | — |

### The invariant that makes FR-019 free

`@lmntlz/content` exports the ladder as a **union of literals**:

```ts
export type Effectiveness = 1.5 | 1.25 | 1.0 | 0.8 | 0.5;
```

Any component typed on `Effectiveness` **cannot be handed the `1.2` four exports
print** — it is a type error, not a review catch. `RelationshipStrip`,
`HeroCard` and `EffectivenessGrid` all take `Effectiveness`, never `number`.

---

## 3 · Icon

An SVG with a key, resolved at **build time**.

| | Hero icons | Status icons |
|---|---|---|
| Count | **27** (+1 contact sheet, excluded) | **71** |
| Key | hero `slug` minus its ordinal — `01-earth-bramwen` → `earth-bramwen` | `pip-*` · `status-*` · `overlay-*` |
| Mapping verified | ✅ **27 / 27, no orphans but the contact sheet** | — |
| Typed against | `packages/content`'s roster | ⚠️ **nothing — see below** |
| A miss is | a **compile error** | *not yet checkable* |

### ⚠️ Status icons have no vocabulary to validate against

`StatusInstance.kind` is `string`, an open type; **nothing in the codebase ever
constructs a `StatusInstance`**, and `apps/api/src/battle/board.ts:123` hardcodes
`statuses: []`.

So FR-010's *"every status effect the engine can emit"* is **vacuously satisfied** —
the engine emits none. The registry and `StatusPip` ship because the design needs
them and 014/018 will consume them; the **wiring does not**, and the guard is
written so it starts failing the moment a vocabulary appears. See `research.md` R3.

---

## 4 · Screen port

One built surface rebuilt against its export.

**Eleven ports** — Onboarding · Roster · Hero Card · Battle · Turn Sequence ·
Matchmaking · Profile · Battle Record · Guild Roster · Guild Admin · Guild Creation.
**One new screen** — Codex (US5).

| Field | Rule |
|---|---|
| Source of truth | its `.dc.html` export, for **look only** |
| Data | unchanged — the route it already calls |
| Colour | tokens only |
| Numbers | read from the generated source at render time (FR-019) |
| Exit | every screen leavable without a page reload |
| Acceptance | its feature's existing Playwright pass still green |

---

## 5 · Rail entry

| Field | Rule |
|---|---|
| `label` | from the export |
| `destination` | **must exist** (FR-015) |
| `active` | exactly one per screen |
| `children` | `THE COURT` groups Profile · Battle Record · Guild (· Chat at 014) |

**Built by 017**: Squads · Roster · Matchmaking · The Court · Codex.
**Added by 018**: Rune Forge · The Store. **Waits on 016**: Dispatches.

---

## What this feature does not model

No entity, table, column, index or migration. If a task in Phase 2 proposes one,
the task is wrong — 017 is presentation, and every screen renders data a route
already returns.
