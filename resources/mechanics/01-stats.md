# LMNTLZ · Mechanics 01 — Stats & Damage Resolution

Ten stats per hero. Every stat has **exactly one job**, and every axis of
conflict has **exactly one counter**. If a proposed change gives two stats the
same job or leaves an attacker stat with nothing to roll against, it's wrong —
that constraint is what the design is for.

---

## The ten stats

| Stat | Job | Kind | Answered by |
|---|---|---|---|
| **Might** | How hard the unit hits, regardless of attack type | Scalar | mitigation (Armor / Magic Resist) |
| **Perception** | How accurately it lands a blow | Contested | **Agility** |
| **Agility** | How well it avoids being hit | Contested | **Perception** |
| **Penetration** | How well it pierces mitigation | Contested | **Armor** / **Magic Resist** |
| **Armor** | Absorbs **martial** damage — Slash, Pierce, Crush | Contested | **Penetration** |
| **Magic Resist** | Absorbs **arcane** damage — the six elements | Contested | **Penetration** |
| **Toughness** | The size of the health pool itself | Scalar | — (raw damage) |
| **Speed** | How quickly and how often it acts | Scalar | — |
| **Resolve** | Resists crowd control and manipulation | Contested | a power's potency |
| **Luck** | Shifts the random rolls in its favor | Scalar | — |

There is **no separate HP stat.** `Toughness` *is* the pool — a hero's maximum
HP is a function of it. The battle UI still shows an HP bar; `Toughness` is
what sets its length.

**`Reach` is not one of the ten.** Every hero also has a reach of 1 or 2, which
governs which rows it can target. It is a positional property rather than a
combat stat — it never scales, never contributes to a damage formula, and is
not tuned against an opposing stat. It lives in
[`02-squads.md`](02-squads.md), but it belongs on the hero card alongside these
ten, because it is one of the first things a player needs to know when placing
a hero.

### Notes on the ones that moved

`Might` is deliberately **type-agnostic**. There is no split between physical
power and magical power — a Fire sorceress and a Crush warbreaker both scale
their damage off the same stat. The 9-type system already carries all the
flavor distinction that split would provide, and one offense stat keeps hero
stat budgets comparable across families.

`Armor` and `Magic Resist` are a **clean mirror**, divided along the families
the game already has: `Armor` answers the 3 martial types, `Magic Resist`
answers the 6 arcane types. **`Penetration` pierces both** — otherwise arcane
attackers would have no pierce option at all, and the martial/arcane asymmetry
we removed from the type chart would reappear here.

---

## Damage resolution pipeline

The order below is the contract. Any power that deviates must say so explicitly.

| # | Step | Resolves | Stats |
|---|---|---|---|
| 1 | **Act** | Whose turn it is and how often it comes around | `Speed` |
| 2 | **Land** | Hit or miss | `Perception` (att) vs `Agility` (def) |
| 3 | **Base** | Raw damage before any modifier | `Might` × the power's multiplier |
| 4 | **Type** | Bane / Fault / resisted / neutral | *no stat* — from the derivation rule |
| 5 | **Crit** | Whether this one spikes | `Luck` |
| 6 | **Mitigate** | How much is absorbed | `Armor` **or** `Magic Resist` (def), reduced by `Penetration` (att) |
| 7 | **Apply** | Subtract from the pool | pool size from `Toughness` |
| 8 | **Status** | Does an attached effect stick | power potency vs `Resolve` |

Step 4 draws on nothing but the attacker's type and the defender's
primary/secondary — see the derivation rule in `../LORE-and-flavor.md`. The
attacker's **type** decides which mitigation stat applies at step 6: a martial
type is answered by `Armor`, an arcane type by `Magic Resist`.

A miss at step 2 ends resolution — no chip damage, no status. A power may
still carry an on-miss rider, but it has to declare one.

---

## Open questions

None of these block writing powers, but all four must be answered before any
number in this file can be tuned.

### 1. Magic Resist covers twice the ground Armor does

Six of the nine types are arcane. On a random incoming attack, `Magic Resist`
is the relevant mitigation stat **two-thirds of the time**; `Armor` only a
third. Point-for-point, MR is therefore worth roughly double.

That's not automatically wrong — it's only wrong if it goes unpriced. Options:
make a point of `Armor` numerically larger than a point of `Magic Resist`;
or leave the values equal and let hero stat budgets account for it, so
Armor-heavy heroes get more total budget. **Decide before assigning any hero
its numbers,** because it changes what a "high defense" hero costs.

### 2. Speed vs. whole-turn cooldowns

Cooldowns are counted in whole turns (settled). If `Speed` shortens cooldowns,
it produces fractions — and a small Speed buff does nothing at all until it
crosses a rounding threshold, which reads as a broken buff to the player who
just spent a turn applying it.

Three clean ways out:

- **Extra actions** — `Speed` grants additional turns; cooldowns tick per turn
  taken, so acting more often naturally means powers come back sooner.
- **Sub-turn ticks** — cooldowns are tracked in finer units and each turn
  advances a variable number of them based on `Speed`.
- **Order only** — `Speed` decides who goes first and never touches cooldowns.

This properly belongs to `03-turns.md`, but it is a stat question first.

### 3. What Luck actually rolls

"Affects RNG" needs a list. Candidates: crit **rate**, crit **damage**, status
application chance, and post-battle drops. Whether `Luck` touches rewards as
well as combat is a meaningful call — it changes whether the stat is a combat
stat or a meta stat, and whether it belongs on the hero card at all.

### 4. Resolve is defined against a system that doesn't exist

There is no crowd control yet. `Resolve` can be named now but cannot be
specified — "resists manipulation" needs `04-status.md` to say what
manipulation *is* (stun, taunt, silence, damage-over-time, stat debuffs) and
whether resisting means **prevented**, **shortened**, or **weakened**.

### Also undecided: how steps 4–6 compose

Whether type effectiveness and mitigation are both multiplicative, or
effectiveness multiplies and mitigation subtracts, changes the final number
substantially — and changes whether stacking mitigation is ever a dead end.
Worth settling alongside the actual formulas.

---

## Presentation constraint

`../01-hero-card.md` calls for "HP, and a couple of combat stats" as numeric
pills on the hero card, and the battle chip has room for less than that. Ten
stats will not fit any of the three card scales.

So the card needs a **display subset** — likely HP plus two or three headline
stats — with the full ten behind an expand or a detail panel. Which stats earn
the headline slots is a UI decision that depends on which ones players actually
make decisions from. Worth revisiting once powers exist and it's clear which
stats are doing visible work.
