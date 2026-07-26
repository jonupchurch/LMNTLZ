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

Every squad in the game uses this shape — attack and defense alike. The row
sizes are fixed. What a player chooses is **which hero sits in which slot**.

How many squads a player keeps, and which heroes may fill them, is the
**roster economy** below.

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

## Roster economy

**Every player has all 27 heroes from the start**, one copy of each champion.
There is no collection, no unlocking, no duplicates. Rosters are identical
across the entire playerbase.

That is a deliberate competitive stance: **no player can ever out-roster
another.** Everything that separates two players is what they *do* with the
same 27 — how they split them, where they place them, and how they read an
opponent.

### Two defense zones — one seen, one blind

A player must defend **two** zones. Each is held by its own 6-hero squad, so
**12 heroes are committed to defense** at all times, and both are run by the
engine when attacked.

The two zones are **not equivalent**. When an attacker is matched against a
player:

- **One zone is surfaced.** Its full squad is visible during matchmaking —
  heroes, types, and row placement — so the attacker can scout it and
  counter-build against it deliberately.
- **The other is blind.** The attacker knows it exists but sees nothing of what
  is in it.

The attacker chooses which to hit, and **attacking the blind zone is worth more
rating.** Certainty is traded for points.

#### What this does to defensive strategy

The two zones pull in opposite directions, which is what makes committing 12
heroes an interesting decision rather than a flat tax:

| | Attacker arrives with | So the defending squad wants to be |
|---|---|---|
| **Seen zone** | A squad built specifically to counter it | **Hard to read** — well-rounded, no stacked Banes, no single exploitable seam |
| **Blind zone** | A generalist squad; they cannot aim | **Sharp** — a narrow, exploitable weakness is safe here, because nobody knows to target it |

A squad that would be a liability in the open is perfectly viable behind the
veil. Deciding which of your two builds can survive being *read* is the core of
defensive play.

#### What it does for the attacker

It also gives the three attack squads distinct jobs. One naturally becomes a
**generalist team for blind runs** — broad coverage, no assumptions — while the
others are **counter-specific builds** kept for scouted fights. Without the
asymmetry, three squads drawn from the same 15 heroes would tend toward
redundancy.

#### The lure — a streak can override the choice

The attacker picks a zone, but the pick is not guaranteed. **Each consecutive
attack win adds ~2% to the chance that choosing the seen zone lands them in the
blind one instead** — lured past the bait and into whatever was waiting.

**The chance is shown explicitly** on the matchmaking screen alongside the
streak: *"14 wins · 28% chance of ambush."* Overriding a player's stated choice
without warning reads as the game cheating, and it would read that way most
sharply the first time it ended a long run. Shown, it becomes a decision.

Something useful falls out of showing it: **at a high trap rate, choosing the
blind zone becomes the rational play**, because the premium pays for a risk the
attacker is already carrying. The mechanic steers streaking players toward the
gamble rather than simply punishing them for winning.

It also completes the zone design. Because the trap fires *regardless of what
the attacker picks*, the hidden squad matters even to a player who never
voluntarily gambles — which is exactly the failure mode the blind premium alone
could not prevent.

##### What it does to defensive strategy

It inverts the earlier reading. With traps in play, the hidden zone absorbs both
the deliberate gamblers *and* the ambushed, so it should be a player's
**strongest** squad — and since 27 heroes are fixed, that means the seen zone is
deliberately the weaker one. **The seen squad becomes the lure and the hidden
squad becomes the trap**, which is both mechanically self-consistent and exactly
what the Warden Courts would do.

That produces a clean rhythm: farm visible squads safely → streak climbs → trap
chance rises → get pulled into a fight you did not prepare for → streak resets.
Low-streak players get reliable wins to learn on; high-streak players carry
real risk.

##### What it shifts, rather than removes

An ambush does not delete skill — it moves where skill is expressed. LMNTLZ has
two distinct skill layers, and the trap trades between them rather than
subtracting:

| Layer | What it is | Effect of an ambush |
|---|---|---|
| **Preparation** | Scouting a defense and building attackers to exploit it | Bypassed — the counter-build meets the wrong squad |
| **Execution** | Commanding the battle turn by turn: power choice, targeting, reach and row management, cooldown tempo | **Untouched, and now decisive** |

A player pulled into an unprepared fight can still win it by playing well. That
is arguably a *higher* bar than winning a fight you pre-solved at the squad
builder, so a high-streak player facing regular ambushes is being tested harder,
not being denied the ability to demonstrate skill.

The genuine trade is that the **payoff for scouting-and-countering drops as the
trap rate climbs**. With the cap at 90%, preparation against a *specific* seen
squad stops being worthwhile deep into a long streak — but preparation itself
doesn't disappear, it changes target: building a squad that performs well
against an unknown defense is still a build decision, just a different one.
Elite play trades counter-picking for robustness, and then leans on execution.

##### Rules this needs

- **The rate is capped at 90%**, reached at 45 consecutive wins. Uncapped it
  would hit 100% at 50 and break past that.

  A cap this high deliberately lets the choice collapse in the tail. Above
  roughly a 40% trap rate, **choosing the blind zone becomes strictly better**:
  picking blind costs only the remaining chance of drawing the easy fight, and
  pays the full premium for it. So elite streaks converge on always gambling —
  which is the correct outcome, since a player on a 45-win run should be facing
  the hardest content available and being paid for it.

  The practical effect is that the seen/blind decision stays live across the
  streak lengths most play actually occurs at, and stops mattering only for
  exceptional runs, where it acts as a soft ceiling on dominance. Because the
  odds are displayed throughout, a player converging on "always blind" is making
  an informed choice rather than being quietly overruled.
- **A trapped attacker is paid the blind reward, not the seen one.** They fought
  the hidden squad. Paying the lower rate for the harder fight reads as theft,
  and arguably it should pay *more*, since they were denied any chance to
  prepare.
- **A trapped loss should probably not reset the streak.** Otherwise the streak
  triggers the trap, and the trap ends the streak — the player eats the rating
  loss *and* the reset for something they did not choose. Losing a gamble you
  took is different from losing an ambush.
- Every value here is **live-tunable**, never a client constant.

#### It protects the defender's information too

Because every player owns the same 27 heroes, seeing a defense tells an attacker
what is *not* available to attack with. Exposing only one zone halves that leak:
6 heroes revealed rather than 12, leaving 21 unaccounted for.

### Defense heroes cannot attack

A hero assigned to a defense zone is **unavailable for offense**, with no
exceptions. This is the rule the whole economy turns on.

### Three offense squads, freely overlapping

A player may save up to **3 offense squads**. These *may* share heroes with each
other — the same champion can sit in all three — provided that hero is not on
defense.

### Changing defense evicts and invalidates

If a player moves a hero onto a defense zone while that hero is in a saved
offense squad, the hero is **removed from that squad**, and the squad is
**invalidated** — it is short a member and cannot be used to attack until
refilled.

Because offense squads overlap, **one swap can invalidate all three at once**.
The warning should be designed for that case, not the single-squad case.

### The arithmetic this produces

| | |
|---|---|
| Roster, every player | **27** |
| Committed to defense | **12** (44% of the roster) |
| Free for offense | **15** |
| Slots across 3 offense squads | 18 |

**Overlap is forced, not merely permitted.** Three full offense squads need 18
slots, but only 15 heroes are ever free. Three disjoint offense squads are
mathematically impossible.

**The defense split is the central strategic decision of the game.** With
identical rosters, choosing *which 12 of your 27 to lock away* is the one
irreversible commitment a player makes — and it is made blind, before knowing
who will attack. Committing your best counters to defense makes you hard to
beat and leaves you weaker on offense. That tension is the game.

It also means a defense squad leaks information: an attacker scouting two
defense zones has seen 12 of your 27, and therefore knows a great deal about
the 15 you have left to attack with.

### What this implies for progression

There is no horizontal progression — nothing to collect, no roster to widen. So
**all progression must be vertical**: levels, ascension, gear, or whatever
`06-progression.md` eventually settles on.

That is a strong competitive position. No player can buy or grind a wider
roster than an opponent, so matches turn on allocation, placement, and reading
the enemy rather than on who owns more. It also removes the most common
pay-to-win vector in the genre before it exists.

The corresponding risk is that vertical progression becomes the *only* power
axis, so it must be tuned carefully — a large level or gear gap between two
identical rosters would decide matches on its own and undo the very fairness
this design buys.

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
- **All 27 heroes unlocked from the start**, one copy each, identical for every
  player. No collection, no unlocking, no duplicates.
- **Two defense zones**, 12 heroes committed, unavailable for offense.
- **Up to 3 offense squads**, freely overlapping with each other.
- Moving a hero to defense **evicts it from offense squads and invalidates**
  them.

## Still open

### 0. Tuning the blind premium — and the degenerate case it guards against

How much extra rating a blind attack pays is the single most important number
in this system, and it fails badly in both directions.

**Premium too high** and every attacker goes blind. The seen zone is never
attacked, so what a player puts there stops mattering, and half the defensive
decision evaporates — along with all the counter-building the game is built on,
since nobody would ever scout.

**Premium too low** and nobody gambles. The blind zone becomes a formality and
the feature does nothing.

The premium has to sit where a guaranteed higher win rate from counter-building
genuinely competes with the extra points. That balance point can only really be
found from live data, so **the value must be a tunable, not a constant compiled
into the client.**

### 1. Who chooses which zone is exposed?

Unresolved. If the **defender** picks, it is another layer of strategy — you
decide which build can bear scrutiny. If the **system** picks (fixed, random per
match, or alternating), the defender must build both squads to survive either
role, which is a harder and arguably more interesting constraint.

### 2. Does a fought blind zone stay revealed?

If an attacker hits the blind zone, they have now seen it. Whether that
knowledge persists — for a rematch, or for that attacker generally — decides
whether the blind premium is repeatable against the same opponent, and whether
"scouting by attacking" becomes a deliberate strategy.

### 3. Can an attacker hit both zones?

Whether a match is one zone or both, and whether both can be taken in sequence,
is unstated. It changes what a single attack costs and what a defense loss
means.

### 4. Is placement constrained by type?

[`../03-squad-builder.md`](../03-squad-builder.md) has always said "melee vs.
magic positioning matters." A hard rule — martial heroes must be front — sits
badly with the roster, since only 9 of 27 heroes are martial and front-row
options would be thin. Soft incentives are almost certainly right, but reach
may already be doing this job on its own: whatever else is true, a melee hero
wants to be where it can actually connect.

### 5. Does anything besides reach depend on row?

Reach makes rows matter. Whether they *also* modify damage taken or dealt, or
weight AI target selection, is unanswered — and may now be unnecessary.

### 6. How is reach assigned across the roster?

Reach is a per-hero property, not one of the ten stats in
[`01-stats.md`](01-stats.md), and no hero has been given a value yet. The
distribution matters: reach-2 heroes are the only ones who can fill the back
slot usefully or attack from the middle row, so if reach 2 is common the
formation loosens, and if it is rare the front row becomes crowded. Worth
deciding as a roster-wide budget rather than hero by hero.

### 7. Does the defense squad follow different combat rules?

The zones now differ in *visibility*, but whether a defending formation behaves
differently in combat — row collapse, reach, targeting — is still unanswered.
Belongs to [`07-defense-ai.md`](07-defense-ai.md).

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
