# LMNTLZ · Mechanics 02 — Squads, Formation & Reach

There are **two squad shapes**, and which one you get depends on which side of
the line you are standing on:

- An attacking **Wing** is **exactly 8 heroes**, in a fixed **3 front / 4 middle
  / 1 back**.
- A defending **Standing Six** is **exactly 6 heroes**, in a fixed **2 front /
  3 middle / 1 back**.

Both sit on a single shared battlefield axis of **six rows, numbered 1–6**,
running left to right:

```
        ATTACKERS (left)          │          DEFENDERS (right)
             a Wing · 8           │        a Standing Six · 6
    [1]       [2]       [3]       │      [4]       [5]       [6]
    back      mid      front      │     front      mid      back
   1 slot   4 slots   3 slots     │    2 slots   3 slots   1 slot
                            ──────┴──────
                            contact line
```

The axis is **absolute**, not per-side. Row 1 is the attackers' rearmost hero;
row 6 is the defenders' rearmost. For an attacker, deeper into the enemy means
*higher* numbers; for a defender striking back, *lower*.

**The formation is no longer mirror-symmetric.** It was when both sides fielded
six; it stopped being so the moment the attacking Wing grew to eight. The row
*count* is unchanged and the reach rules below are untouched by the change —
reach is measured in rows, and there are still three rows a side. What changed is
how many bodies occupy them.

> **This asymmetry is unresolved as a balance question**, and it is the largest
> open item in this document. See *Still open · 0* — an attacker fielding eight
> against a defender fielding six carries a 33% body advantage into every battle,
> in a game whose hold streaks, ambush odds and Hidden Six all assume defenses
> hold reasonably often.

The row sizes are fixed. What a player chooses is **which hero sits in which
slot**.

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

So at the opening of a battle, **only the front-row heroes and any reach-2
heroes in the middle row can strike an enemy at all.** The back-row hero cannot
touch the enemy under any circumstances while your own lines are intact.

| | Attacking Wing (8) | Defending Six (6) |
|---|---|---|
| Can always open | 3 (front row) | 2 (front row) |
| Can open with reach 2 | up to 7 of 8 | up to 5 of 6 |
| Never opens | the back seat | the back seat |

The wider middle row is where the Wing's extra bodies went, so **reach
distribution matters more on offense than it used to**: the gap between a badly
built Wing and a well built one is four heroes' worth of opening damage rather
than three.

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
the same reachability, but it breaks on the formation's own shape: if a Wing's
3-slot front row empties and its 4-hero middle row advances into it, four heroes
do not fit in three slots, and the fixed 3/4/1 shape would have to be rebuilt
mid-battle. The defending Six has the same problem at 3-into-2. Skipping empty
rows gets the identical result with nobody moving, and it is the reason the two
formations can differ in size without the rule needing a special case.

---

## Roster economy

**Every player has all 27 heroes from the start**, one copy of each champion.
There is no collection, no unlocking, no duplicates. Rosters are identical
across the entire playerbase.

That is a deliberate competitive stance: **no player can ever out-roster
another.** Everything that separates two players is what they *do* with the
same 27 — how they split them, where they place them, and how they read an
opponent.

### Two defense zones — Visible and Hidden

A player must defend **two** zones. Each is held by its own **Standing Six** —
6 heroes in 2/3/1 — so **12 heroes are committed to defense** at all times, and
both are run by the engine when attacked. Defense zones stayed at six when the
attacking Wing grew to eight; the arithmetic that forced that is below.

The two have **fixed, permanent roles** — the player designates which squad
holds which:

- **The Visible defense.** Fully surfaced during matchmaking — heroes, types,
  and row placement — so an attacker can scout it and counter-build against it.
  **This is the only zone anyone can choose to attack.**
- **The Hidden defense.** Never shown, and **never selectable.** No attacker can
  decide to fight it. The *only* way into a Hidden battle is to be **ambushed**
  there, and Hidden battles pay a higher reward.

There is therefore no choice at matchmaking. An attacker attacks the Visible
squad; the game decides whether they arrive somewhere else.

#### The two zones face completely different populations

This is what makes splitting 12 heroes interesting:

| | Attacked by | Frequency | Attacker arrives | So the squad wants to be |
|---|---|---|---|---|
| **Visible** | Everyone | **High** — every attack starts here | Counter-built against it, having scouted | **Hard to read** — well-rounded, no stacked Banes, no single exploitable seam |
| **Hidden** | Only ambushed players, i.e. those on win streaks | **Low** | Unable to aim; whatever squad they happened to bring | **Punishing** — it only ever meets strong attackers, and a narrow weakness is safe because nobody can target it |

The allocation question is genuinely open, and it is the heart of defensive
play: the Visible squad absorbs the *volume* of incoming attacks from the whole
playerbase, while the Hidden squad meets a *small number of the best* players.
Which of those deserves your strongest heroes depends entirely on how rating is
won and lost in each — a tuning decision, not an obvious one.

#### What it does for the attacker

Because every attack begins at a scoutable Visible squad, counter-building is
always live. But an attacker deep into a streak knows an ambush is likely and
that their counter-build may meet a squad it wasn't designed for.

That gives the three attack Wings a clear division of labour that shifts with
streak: **counter-specific builds while ambush risk is low, and a robust
all-rounder as it climbs.** The tension lives inside every attack rather than
being a menu choice.

#### The ambush — the only door into a Hidden battle

An attacker always sets out against the Visible squad. **Each consecutive attack
win adds ~2% to the chance that they arrive at the Hidden one instead** — lured
past the open gate into whatever was waiting behind it.

This is the *sole* path to a Hidden battle. It cannot be chosen, bought, or
sought out; it is earned by winning.

**The chance is shown explicitly** on the matchmaking screen alongside the
streak: *"14 wins · 28% chance of ambush."* Two reasons it must be visible — an
unannounced switch of opponent reads as the game cheating, and more importantly
the number is **aspirational**. It tells a player their streak is worth
something concrete and rising.

##### It is a reward, not a punishment

Hidden battles pay more. So the streak mechanic reads as: **win more, and you
earn access to higher-stakes, higher-reward fights.** A long streak isn't
something the game takes away from you — it's the key to the better content.

That produces a clean rhythm: win Visible battles → streak climbs → the odds of
a lucrative Hidden battle rise with it → eventually one lands, and it is the
hardest fight available. Low-streak players get reliable, scoutable battles to
learn on. High-streak players are routed toward the fights worth having.

It also solves what a chosen premium could not: because the ambush fires
regardless of intent, **the Hidden squad matters to every attacker**, not only
to those who would opt into a gamble.

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

The genuine trade is that **scouting-and-countering pays off less as the ambush
rate climbs**. At a 90% cap, preparing against the *specific* Visible squad
stops being worthwhile deep into a long streak — but preparation doesn't
disappear, it changes target. Building a squad that performs well against an
unknown defense is still a build decision, just a different one. Elite play
trades counter-picking for robustness, then leans on execution.

#### Defensive streaks

Streaks are not only an attacker's stat. **Every defense squad tracks its own
consecutive successful holds** — Visible and Hidden alike, two counters per
player, each independent of the other and of the player's attack streak.

This gives the defensive half of the game something to play for. Setting a
defense is otherwise a fire-and-forget action whose outcome a player never
witnesses; a hold count turns it into a number that grows while they're away,
and one they'll want to protect.

**A Visible squad's streak is shown when scouting it.** It is the single most
useful thing an attacker can know beyond composition — *"this squad has turned
away 12 attackers"* says something the roster alone doesn't, because it reflects
how the squad actually performs rather than how it looks.

**A Hidden squad's streak should be visible even though its composition is
not.** An opponent card can honestly say *"their Closed Gate has held 9 times"*
while showing nothing of what stands behind it. That gives the Hidden zone a
**reputation** — a rising threat with no visible shape, which is exactly the
tone the ambush wants, and it makes the streak meaningful for a squad almost
nobody sees.

##### Editing a defense must reset its streak

Otherwise the number measures nothing: a player could ride a long hold streak
while quietly swapping the squad underneath it, and an attacker scouting *"held
12 times"* would be reading a claim about heroes that are no longer there.

This also creates a genuine cost to tinkering, which is a useful pressure. It
pushes against the rule that moving a hero onto defense invalidates offense
squads — a player wanting a hero back for an attack Wing must break a defensive
streak to get them. Two commitments pulling in opposite directions over the same
27 heroes.

##### Rules this needs

- **The rate is capped at 90%**, reached at 45 consecutive wins. Uncapped it
  would hit 100% at 50 and break past that. The 10% floor matters: a player deep
  into a streak still occasionally draws the Visible squad, so scouting never
  becomes entirely pointless and the ladder never fully collapses into one fight.
- **The streak is the only currency that buys Hidden battles**, and they pay
  more. That makes a streak an asset a player is building toward rather than a
  liability they're carrying — the mechanic should read as *earning access*, not
  as risk accumulating.
- **An ambushed loss should probably not reset the streak.** Otherwise the
  streak triggers the ambush, and the ambush ends the streak — a player is
  punished twice for something they never chose. If a streak is the key to the
  better content, having it snap on the very fight it unlocked is the most
  demoralising possible outcome.
- **Three streaks exist per player**, and they must not be conflated: **one**
  attack streak, and one hold streak for each of the **two** defense squads.
  Only the attack streak feeds the ambush roll.
- **The attack streak is universal, not per squad.** It counts consecutive
  attack wins across all three offense Wings — win with Wing 1, then 2, then
  3 and the streak is 3. Switching squads never resets it.

  That is what makes the "swap builds as ambush risk climbs" strategy actually
  work: a player can move from a counter-specific build to a robust all-rounder
  as their odds rise, without paying for it in lost streak. A per-squad streak
  would punish exactly the adaptation the mechanic is meant to encourage.
- Every value here is **live-tunable**, never a client constant.

#### It protects the defender's information too

Because every player owns the same 27 heroes, seeing a defense tells an attacker
what is *not* available to attack with. Exposing only one zone halves that leak:
6 heroes revealed rather than 12, leaving 21 unaccounted for.

### Defense heroes cannot attack

A hero assigned to a defense zone is **unavailable for offense**, with no
exceptions. This is the rule the whole economy turns on.

### Three offense Wings, freely overlapping

A player may save up to **3 offense Wings**. These *may* share heroes with each
other — the same champion can sit in all three — provided that hero is not on
defense. At 8 heroes drawn from a pool of 15, sharing is not optional: **any two
Wings overlap by at least one hero**, and in practice by far more.

### Changing defense evicts and invalidates

If a player moves a hero onto a defense zone while that hero is in a saved
offense Wing, the hero is **removed from that Wing**, and the Wing is
**invalidated** — it is short a member and cannot be used to attack until
refilled.

Because Wings overlap, **one swap can invalidate all three at once**. The
warning should be designed for that case, not the single-squad case — and the
resize made it likelier, since a Wing of 8 out of 15 free heroes uses over half
the pool, so a randomly chosen hero is more likely to be in a saved Wing than
not.

### The arithmetic this produces

| | |
|---|---|
| Roster, every player | **27** |
| Committed to defense | **12** — two Standing Sixes (44% of the roster) |
| Free for offense | **15** |
| Slots across 3 offense Wings | 24 |

**Overlap is forced, not merely permitted.** Three full Wings need 24 slots, but
only 15 heroes are ever free. Three disjoint Wings are mathematically impossible
— and at 8 apiece, **any two Wings must share at least one hero** (8 + 8 − 15).

This is the number that decided the Wing's size. Holding defense at two Sixes
rather than growing it to two Eights is what keeps the free pool at 15: a Wing
of 8 drawn from 15 fields **53%** of what a player has available, which leaves
real choice in the picking. Had defense also gone to 8, the pool would have
fallen to 11, a Wing would field **73%** of it, and any two Wings would have been
forced to share five heroes — three saved Wings that were barely three different
Wings, and counter-building on offense reduced to almost nothing.

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

## The back seat

Both shapes keep exactly **one** hero in the rearmost row — row 1 for an
attacking Wing, row 6 for a defending Six. Growing the Wing to eight deliberately
did **not** widen it; the four new-and-old middle slots absorbed the growth
instead, because everything below depends on that seat being singular.

It is deliberately **not** another copy of the other slots. It is a contingency
seat with a sharp profile — real advantages, real costs, and one hard
requirement — and it falls out of the reach rule rather than needing any special
case.

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
> neither attack nor reach the front line to help it — an eighth of a Wing, or a
> sixth of a Six, doing almost nothing. This is a deliberate trap with a knowable
> answer, not a flaw to be designed out: the slot rewards a player who
> understands reach and punishes one who treats the back row as a safe parking
> space.
>
> Note the trap is **cheaper in a Wing than in a Six** — one wasted hero out of
> eight costs 12.5% of the squad rather than 16.7%. Making the punishing slot
> proportionally less punishing is a side effect of the resize worth watching,
> not an intended one.

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

- An attacking squad is a **Wing** of **8**, formation fixed at **3 front /
  4 middle / 1 back**.
- A defending squad is a **Standing Six** of **6**, formation fixed at **2 front
  / 3 middle / 1 back**.
- Rows numbered **1–6** on one shared absolute axis, attacker 1–3, defender 4–6.
  Row count is the same for both shapes; only occupancy differs.
- Every hero has **reach 1 or 2**.
- Reach is **row distance, counting occupied rows only**, own rows included.
- Empty rows are **skipped**; heroes never move.
- **One rule, no exceptions.** Reach is a single distance budget governing
  *all* targeting — enemies and allies alike. A heal is range-limited exactly
  as an attack is. Powers declare whether they want allies or enemies; reach
  decides who is in range.
- **Attack and defense no longer use the same shape.** Both have three rows and
  a single back seat; they differ in front and middle width.
- **All 27 heroes unlocked from the start**, one copy each, identical for every
  player. No collection, no unlocking, no duplicates.
- **Two defense zones with fixed roles** — one **Visible** (scoutable, the only
  zone anyone can choose to attack) and one **Hidden** (never shown, never
  selectable, reachable only by ambush and paying more). 12 heroes committed,
  unavailable for offense.
- **Ambush** is the sole door into a Hidden battle: +2% per consecutive attack
  win, capped at **90%**, always displayed.
- **Every defense squad tracks its own hold streak**, reset when the squad is
  edited.
- **Up to 3 offense Wings**, freely overlapping with each other. At 8 apiece from
  a pool of 15, any two must share at least one hero.
- Moving a hero to defense **evicts it from offense squads and invalidates**
  them.

## Still open

### 0. How does a defending Six survive an attacking Wing of 8? — *blocking*

Every battle is now **8 against 6**. The attacker brings a third more bodies,
a third more actions per round, and a wider front row that opens with three
strikes instead of two. Nothing currently compensates the defender.

That matters more here than it would in most games, because a startling amount
of already-settled design assumes defenses hold reasonably often:

- **Hold streaks** are public, per-zone, and a headline scouting signal. If a
  Six almost never holds against a Wing, every streak in the game reads 0–2 and
  the number stops meaning anything.
- **Ambush** is a reward for a long *attack* streak. If attacking is
  structurally easy, streaks run long, everyone sits near the 90% cap, and the
  Hidden Six stops being an occasional event.
- **The defense/offense split is billed as the central strategic decision.**
  It is only a real dilemma if the 12 you lock away can actually accomplish
  something.

Four ways out, not mutually exclusive:

| Approach | What it does | Cost |
|---|---|---|
| **Defensive multiplier** | Engine-run defenders get a flat bonus to damage, toughness or both | A tuning number with no fiction behind it; needs to be visible or it feels arbitrary |
| **Terrain / fortification** | The defending zone grants a positional advantage — a shielded front row, a row the attacker must clear first | New mechanic, but it earns the asymmetry rather than papering over it |
| **Attacker attrition** | The Wing carries damage or spent cooldowns between battles, so 8 fresh heroes is not the standard case | Changes the loop from discrete battles to a campaign; large |
| **Defense also goes to 8** | Restores symmetry outright | Rejected — it drops the offense pool to 11. See the arithmetic above |

The fourth is already ruled out. The first is the cheapest and the least
interesting; the second is the one most likely to be *good*, and it belongs in
`03-powers.md` or a document that does not exist yet.

**Nothing else in this file is blocked on the answer** — the reach rules, the
roster economy and the back seat all hold regardless. But no battle can be
balanced until it is settled.

### 1. Which squad deserves the stronger heroes?

The two zones face different populations, and the answer is not obvious. The
**Visible** squad absorbs the volume — every attack in the game starts there,
from the whole skill range, all of them able to scout it. The **Hidden** squad
faces few attackers, but every one of them is on a win streak and therefore
good.

Whether a player should fortify against many average attacks or few excellent
ones depends entirely on the rating stakes attached to each. That is a tuning
decision with a real strategic answer, and it should be arrived at deliberately
rather than falling out of whatever the first numbers happen to be.

### 2. Does a fought Hidden squad stay revealed?

An ambushed attacker has now seen that player's Hidden squad. Whether that
knowledge persists — and whether it is even useful, given the Hidden zone can
never be chosen — decides if "remembering who ambushed you" becomes a real
layer or a dead end.

### 3. What does a Hidden defense loss mean for the defender?

The Hidden squad is attacked rarely and only by strong players, so its win rate
will read very differently from the Visible squad's. Whether a defender is
rewarded for a Hidden hold, and how heavily, needs settling alongside the
attacker's reward.

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

## Knock-on effects of the resizes

The squad has been resized twice — first from 5 to 6, then the attacking Wing
from 6 to 8 while defense stayed at 6.

- **Type coverage on offense is nearly total.** A Wing of 8 can field 8 of the 9
  damage types. "Cover everything" is now one hero short of literal, which makes
  a Wing much harder to hard-counter and pushes the attacker's skill expression
  away from coverage and toward *placement and reach* — the things that are still
  scarce. A defending Six still covers at most 6 of 9, and that gap is part of
  the 8-vs-6 problem in *Still open · 0*.
- **Shared-weakness math shifted twice.** The lore's warning microcopy — *"Three
  of yours bleed to the same Bane"* — was 3 of 5, then 3 of 6, and on offense is
  now 3 of 8. It has quietly stopped being alarming; on a Wing the threshold
  probably wants to be 4, while a Six should keep 3. **The two shapes likely need
  different warning thresholds**, which the builder does not currently model.
- **The battle screen got denser again.** Fourteen chips rather than twelve, and
  the two sides are no longer visually symmetric — a Wing's 3/4/1 against a Six's
  2/3/1. Any layout that assumed a mirrored board needs redoing. Called out in
  [`../04-battle-screen.md`](../04-battle-screen.md).
- **The squad builder now has two modes.** Building a defense Six and building an
  attack Wing are different shapes with different slot counts, so the builder can
  no longer be one grid. See [`../03-squad-builder.md`](../03-squad-builder.md).
