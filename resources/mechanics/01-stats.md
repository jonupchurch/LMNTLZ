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

## The base stat pass

First pass is entered in [`../characters/hero-stats.xlsx`](../characters/hero-stats.xlsx)
— all 27 heroes, all ten stats. **Balance is explicitly unfinished**; what
follows is the reasoning behind the numbers, recorded so the next pass doesn't
start by guessing at intent.

It introduced a **Role** per hero, which is not one of the ten stats and had not
existed before: **Striker ×12 · Tank ×7 · Ranged ×5 · Buffer ×3** (Buffer covers
debuffers too).

Budgets follow position and role rather than a flat total:

| | Reasoning | Total |
|---|---|---|
| **Melee** | Has to stand at the front, so it is paid for the exposure | 300 |
| **Tanks** | Same reasoning — they are the ones being hit | 300 martial / 275 arcane |
| **Strikers** | Meant to be strong | 300 |
| **Ranged** | At least 2 rows away, so slightly weaker | 275 |
| **Buffers** | Deliberately lightest | 275 |

Which reduces to one rule: **275 if a hero is arcane and not a Striker; 300
otherwise.** 15 heroes at 300, 12 at 275, no outliers.

Reach was also revised into a regular pattern — **every arcane type has one
reach-1 and two reach-2 champions; every martial type the reverse.** Still 12/15
overall, and every type still offers both, so no type is locked out of any row.

### Damage lives in the front row

`Might` tracks reach exactly. The roster uses only four values, with a hard gap
in the middle and no hero anywhere between 30 and 40:

| | Might | Count |
|---|---|---|
| **Reach 1** | 40 – 45 | 12 |
| **Reach 2** | 25 – 30 | 15 |

**Might ≥ 40 if and only if reach 1** — a strict biconditional across all 27
heroes. Since a reach-1 hero can only strike an enemy from the front row, and the
2/3/1 formation has just **two** front slots, the consequence is structural:

> **A squad fields at most two real damage dealers.** The two front slots carry
> Might 40–45; the other four are capped at 30, and the back seat cannot reach an
> enemy at all while your own lines hold. Which two heroes take the front row is
> therefore the single most consequential placement decision in a squad — and it
> is also why the back seat reads as a support slot rather than a wasted one.

Two things follow that are worth watching. The 12 reach-1 heroes are the scarce
resource, since a player's five squads (two defense, up to three attack) consume
ten front slots between them. And because a squad **gains** reach as its rows
empty, a losing squad's Might 40–45 heroes come online from deeper positions —
so the comeback dynamic in `02-squads.md` is sharper than the reach rule alone
suggests.

### What powers are expected to absorb

**Stats are not carrying hero identity, and are not meant to.** Only 10 distinct
stat lines exist across 27 heroes — five heroes share one line outright, and
several stats are family constants rather than per-hero choices (Armor is 15 for
every arcane hero and 40 for every martial one; martial heroes are uniformly
Toughness 40, Magic Resist 30, Luck 25).

That is deliberate. **Powers and buffs are the differentiation layer** — up to 5
per hero against 10 shared stat lines is far more room than the stat block has —
so a template-per-role baseline is the right shape to build powers on top of, not
a flattening to correct. Two of the observations below therefore resolve in
`03-powers.md` rather than here.

- **Arcane Strikers are the fragile half of the front line — and the hardest
  hitting thing in the game.** All six have reach 1, which demands the front row,
  and Toughness 25 / Armor 15 gives them durability 50 against the martial
  Strikers' 73.3 at the same 300 cost. What they buy with it is **Might 45, the
  highest value on the field**, plus double the Speed. That is a deliberate glass
  cannon rather than a shortfall. *Further softened by powers:* shields and
  protective buffs are what the Buffer role exists for, so the live question is
  narrower — can a Buffer reach and cover the front row in time? That is a reach
  and turn-order question, not a stat one.
- **Buffers are not lighter than Ranged.** Both total 275, and buffers are the
  *more* durable of the two (56.7 vs 46.7) on Magic Resist 40 and Speed 35, against
  a stated intent of buffers being lightest. *Partly answered by powers:* if
  buffer powers are strong, the durability edge is a cost paid elsewhere. Worth a
  second look once their powers exist and the total contribution can be compared.
- **Reach is redundant with Role.** All 12 reach-1 heroes are Strikers and all 15
  reach-2 are not, so reach carries no information Role does not already, and
  "never put a reach-1 hero in the back row" has become "never put a Striker in
  the back row." *Not something powers fix* — this one is structural, and stays
  open until reach is settled.

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

### 2. Speed vs. whole-turn cooldowns — *parked*

**Deferred by decision**, to be taken up once the battle system is being worked
on properly. The three options below are recorded so the discussion starts from
somewhere; none is chosen, and this is the keystone question for the whole
battle system — turn order, cooldown pacing and Speed's value all hang on it.

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

This properly belongs to `04-turns.md`, but it is a stat question first.

### 3. What Luck actually rolls

"Affects RNG" needs a list. Candidates: crit **rate**, crit **damage**, status
application chance, and post-battle drops. Whether `Luck` touches rewards as
well as combat is a meaningful call — it changes whether the stat is a combat
stat or a meta stat, and whether it belongs on the hero card at all.

### 4. Resolve is defined against a system that doesn't exist

There is no crowd control yet. `Resolve` can be named now but cannot be
specified — "resists manipulation" needs `05-status.md` to say what
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
