# LMNTLZ · Mechanics 02 — Squads & Formation

A squad is **exactly 6 heroes** in a **fixed three-row formation**:

```
            [ back ]              1 slot
       [ mid ][ mid ][ mid ]      3 slots
          [ front ][ front ]      2 slots
                 ▲
            toward the enemy
```

Every player maintains two: an **attack** squad they command personally, and a
**defense** squad the engine runs when someone attacks them. Both use the same
6-hero, 2/3/1 shape.

The distribution is not chosen per battle — it is the shape of every squad in
the game. What a player chooses is **which hero sits in which slot**.

---

## What the shape already says

Two things follow from 2/3/1 before a single rule is written, and both are
worth designing toward deliberately rather than discovering later.

**The back row is a single seat.** Not a back *line* — one hero. Whatever
protection the back row confers, exactly one hero per squad gets it. That makes
the slot the most contested decision in squad building, and it is a real risk:
if back-row protection is strong and unconditional, the correct answer becomes
"put your highest-damage hero there" for every player, every time, and the
decision stops being a decision. Whatever rules land, the back slot needs a
genuine cost or a genuine counter.

**The front row is thin.** Two heroes, against a middle row of three. If the
front row functions as a shield that must be chewed through, it is a short one
— which pushes toward front-row heroes being durable by role, and makes the
question of *what happens when the front row falls* urgent rather than
academic (see below).

---

## Settled

- Squad size is **6**.
- The formation is **fixed at 2 front / 3 middle / 1 back**. Players do not
  redistribute the row sizes.
- Both attack and defense squads use it.
- Row position is a **real mechanic**, not a visual arrangement.

## Open — none of these are decided yet

### 1. What does row position actually do?

The three candidate models, roughly in order of how common they are in the
genre:

- **Reach gating** — row determines who can be *targeted*. Back row is
  unreachable until the rows ahead are cleared, or reachable only by powers
  that explicitly say so. Strongest positional identity; risks stalling into a
  fixed kill order.
- **Damage modifier** — every hero is always targetable, but row scales damage
  dealt and/or taken. Softer, keeps every target live, and never blocks a
  player from the choice they want to make.
- **Threat weighting** — row changes how likely the *AI* is to pick a target
  without hard-blocking anything. Affects the defense engine far more than the
  player, which suits a game where the engine plays half of every battle.

These are combinable. They are also the single biggest open question in this
document, because [`03-powers.md`](03-powers.md) cannot specify a power's
targeting until it is answered.

### 2. What happens when a row empties?

If the two front heroes die, does the middle row **become** the front row —
inheriting whatever the front row means — or does the formation keep its
original slots with a hole in it?

Collapsing rows keeps the battle moving and stops a squad from becoming
unreachable. Static rows preserve the player's build intent to the end. The
choice materially changes how a losing battle plays out, and it interacts with
every answer to question 1.

### 3. Is placement constrained by type?

[`../03-squad-builder.md`](../03-squad-builder.md) has always said "melee vs.
magic positioning matters." That could mean:

- **Hard constraint** — martial heroes must take front-row slots, arcane
  heroes cannot. Makes formation legible instantly, but collides with the
  roster: only 9 of 27 heroes are martial, so front-row options would be thin.
- **Soft incentive** — anyone may sit anywhere, but row modifiers happen to
  favor martial heroes forward and arcane heroes back.

The soft version is almost certainly right given the 9/18 split, but it should
be stated rather than assumed.

### 4. Does the defense squad follow different rules?

The engine plays defense, and a defending formation may want different
behavior — e.g. defenders never having their rows collapse, so an attacker
can't strip a squad down to an exposed back-row hero. Flagged here; belongs to
[`07-defense-ai.md`](07-defense-ai.md) to answer.

---

## Knock-on effects of 5 → 6

- **Type coverage went up.** A squad can now field 6 of the 9 damage types
  instead of 5, so the coverage panel in the squad builder has one more slot to
  work with and "cover everything" gets meaningfully closer.
- **Shared-weakness math shifted.** The lore's warning microcopy —
  *"Three of yours bleed to the same Bane"* — is 3 of 6 now rather than 3 of 5.
  Still a real warning, but proportionally less dire; the threshold for when to
  warn may want revisiting.
- **The battle screen got denser.** Twelve chips on screen instead of ten, plus
  row structure on both sides. Called out in
  [`../04-battle-screen.md`](../04-battle-screen.md) as a mobile legibility
  constraint.
