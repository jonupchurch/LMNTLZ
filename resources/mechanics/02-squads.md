# LMNTLZ · Mechanics 02 — Squads, Formation & Reach

A squad is **exactly 6 heroes** in a **fixed three-row formation**. Both squads
sit on a single shared battlefield axis of **six rows, numbered 1–6**, running
left to right:

```
        ATTACKERS (left)          │          DEFENDERS (right)
    [1]       [2]       [3]       │      [4]       [5]       [6]
    back      mid      front      │     front      mid      back
   1 slot   3 slots   2 slots     │    2 slots   3 slots   1 slot
                            ──────┴──────
                            contact line
```

The axis is **absolute**, not per-side. Row 1 is the attackers' rearmost hero;
row 6 is the defenders' rearmost. For an attacker, deeper into the enemy means
*higher* numbers; for a defender striking back, *lower*. The formation is
mirror-symmetric about the contact line.

Every player maintains two squads — an **attack** squad they command personally
and a **defense** squad the engine runs — and both use this same shape. The row
sizes are fixed. What a player chooses is **which hero sits in which slot**.

---

## Reach

Every hero has a **reach of 1 or 2**. Reach is a distance budget measured in
rows along the 1–6 axis, and it is what determines who that hero can target.

> **Distance from row *R* to row *T* = the number of _occupied_ rows you cross
> to get there,** counting the target's row and not your own. A hero may target
> row *T* if that distance is ≤ their reach.

Two consequences do all the work:

**Your own rows count against you.** A hero in row 1 must cross rows 2 and 3 —
their own middle and front lines — before reaching the enemy at all. With a
maximum reach of 2, they cannot.

**Empty rows are free.** A row with nobody left alive in it is not counted. As
rows die, distances shrink, and heroes that could not reach the enemy come into
range.

### At full formation

| Your row | Reach 1 reaches | Reach 2 reaches |
|---|---|---|
| **3** — front | row 4 — enemy front | rows 4, 5 |
| **2** — middle | row 3 — *own front* | rows 3, 4 |
| **1** — back | row 2 — *own middle* | rows 2, 3 |

So at the opening of a battle, **only the two front-row heroes and any
reach-2 heroes in the middle row can strike an enemy at all.** Between 2 and 5
of your 6 are able to attack, entirely depending on how you distributed reach.
The back-row hero cannot touch the enemy under any circumstances while your own
lines are intact.

### As rows empty

The same rule, run forward. Two worked cases:

- **Enemy front row (4) is wiped.** From row 3, row 5 is now distance 1 and row
  6 is distance 2 — so a reach-2 front-row hero can strike the enemy's back
  seat as soon as one enemy row falls.
- **Your own front row (3) is wiped.** From row 1, the enemy front row is now
  distance 2 — so your back-row hero finally enters the fight. From row 2 it is
  distance 1.

A squad therefore **gains reach as it loses heroes.** Losing your front line is
a real setback that simultaneously activates your back line, which gives a
losing position its own momentum rather than a straight death spiral.

Only a **fully empty** row is skipped. A front row with one of its two heroes
still alive still counts, and still shields everything behind it — so the last
survivor in a row genuinely matters.

### Why heroes don't physically advance

An alternative framing is that heroes move up to fill an empty row. It produces
the same reachability, but it breaks on the formation's own asymmetry: if the
2-slot front row empties and the 3-hero middle row advances into it, three
heroes do not fit in two slots, and the fixed 2/3/1 shape would have to be
rebuilt mid-battle. Skipping empty rows gets the identical result with nobody
moving.

---

## The sixth slot

Row 1 is deliberately **not** a sixth copy of the other slots. It is a
contingency seat with a sharp profile — real advantages, real costs, and one
hard requirement — and it falls out of the reach rule rather than needing any
special case.

**It is untouchable at full formation.** Run the same distance rule from the
enemy's side: a defender in row 4 with reach 2 reaches rows 3 and 2. Row 1 is
distance 3. Defenders further back reach less. So while your own middle and
front rows both hold, **no enemy in the game can target your back-row hero.**

**It cannot attack, at any reach.** Row 1 to row 4 is distance 3 while your own
lines are intact. Reach caps at 2. There is no build that lets the back hero
strike an enemy at the opening of a battle.

**It can support the whole squad — but only at reach 2.** Row 1 reaches row 2
at distance 1 and row 3 at distance 2. So a **reach-2** hero in the back seat
can heal, buff or cleanse every other hero in the squad while being immune to
attack. A **reach-1** hero there reaches only row 2 and cannot help the front
line at all, which is where the damage is landing.

> **Putting a reach-1 hero in the back line is asking for trouble.** It can
> neither attack nor reach the front line to help it — a sixth of the squad
> doing almost nothing. This is a deliberate trap with a knowable answer, not a
> flaw to be designed out: the slot rewards a player who understands reach and
> punishes one who treats row 1 as a safe parking space.

The squad builder should make reach *visible* enough that the mistake is
learnable — showing what a hero can actually touch from the slot it's being
dropped into — without nagging the player out of it. Per
[`../03-squad-builder.md`](../03-squad-builder.md), warn, don't scold.

**It comes online as the squad degrades.** Losing either of your own rows cuts
the distance from row 1 to the enemy front to 2 — so the back hero starts
attacking exactly when you begin losing. The same event exposes it: with a row
of your own gone, an enemy reach-2 hero can now reach row 1 as well.

That symmetry is the whole design of the slot. The back hero trades all early
offense for total safety and squad-wide support, then converts into a threat at
the moment its protection lapses.

---

## Settled

- Squad size **6**; formation fixed at **2 front / 3 middle / 1 back**.
- Rows numbered **1–6** on one shared absolute axis, attacker 1–3, defender 4–6.
- Every hero has **reach 1 or 2**.
- Reach is **row distance, counting occupied rows only**, own rows included.
- Empty rows are **skipped**; heroes never move.
- **One rule, no exceptions.** Reach is a single distance budget governing
  *all* targeting — enemies and allies alike. A heal is range-limited exactly
  as an attack is. Powers declare whether they want allies or enemies; reach
  decides who is in range.
- Both attack and defense squads use the same shape.

## Still open

### 1. Is placement constrained by type?

[`../03-squad-builder.md`](../03-squad-builder.md) has always said "melee vs.
magic positioning matters." A hard rule — martial heroes must be front — sits
badly with the roster, since only 9 of 27 heroes are martial and front-row
options would be thin. Soft incentives are almost certainly right, but reach
may already be doing this job on its own: whatever else is true, a melee hero
wants to be where it can actually connect.

### 2. Does anything besides reach depend on row?

Reach makes rows matter. Whether they *also* modify damage taken or dealt, or
weight AI target selection, is unanswered — and may now be unnecessary.

### 3. How is reach assigned across the roster?

Reach is a per-hero property, not one of the ten stats in
[`01-stats.md`](01-stats.md), and no hero has been given a value yet. The
distribution matters: reach-2 heroes are the only ones who can fill the back
slot usefully or attack from the middle row, so if reach 2 is common the
formation loosens, and if it is rare the front row becomes crowded. Worth
deciding as a roster-wide budget rather than hero by hero.

### 4. Does the defense squad follow different rules?

The engine plays defense. Whether a defending formation behaves identically
belongs to [`07-defense-ai.md`](07-defense-ai.md).

---

## Knock-on effects of 5 → 6

- **Type coverage went up.** A squad can field 6 of the 9 damage types instead
  of 5, so "cover everything" gets meaningfully closer.
- **Shared-weakness math shifted.** The lore's warning microcopy — *"Three of
  yours bleed to the same Bane"* — is 3 of 6 now rather than 3 of 5. Still a
  real warning, proportionally less dire; the warning threshold may want
  revisiting.
- **The battle screen got denser.** Twelve chips instead of ten, plus row
  structure on both sides, plus a reach-based reachability state per target.
  Called out in [`../04-battle-screen.md`](../04-battle-screen.md).
