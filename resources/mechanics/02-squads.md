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
rows along the 1–6 axis, and it is what determines who that hero can *physically*
target.

> **Reach is the first stage of targeting, not the whole of it.** Effects can
> narrow the field further (**fade**) or force a choice within it (**taunt**).
> The four-stage pipeline and the invariants that keep it resolvable are in
> [`04-turns.md`](04-turns.md) → *Target eligibility*. Everything in this
> section describes stage 1.

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

### Two defense zones — Visible and Hidden

A player must defend **two** zones. Each is held by its own 6-hero squad, so
**12 heroes are committed to defense** at all times, and both are run by the
engine when attacked.

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

That gives the three attack squads a clear division of labour that shifts with
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
squads — a player wanting a hero back for an attack squad must break a defensive
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
  attack wins across all three offense squads — win with squad 1, then 2, then
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
- **Two defense zones with fixed roles** — one **Visible** (scoutable, the only
  zone anyone can choose to attack) and one **Hidden** (never shown, never
  selectable, reachable only by ambush and paying more). 12 heroes committed,
  unavailable for offense.
- **Ambush** is the sole door into a Hidden battle: +2% per consecutive attack
  win, capped at **90%**, always displayed.
- **Every defense squad tracks its own hold streak**, reset when the squad is
  edited.
- **Up to 3 offense squads**, freely overlapping with each other.
- Moving a hero to defense **evicts it from offense squads and invalidates**
  them.

## Still open

### ~~0. Which squad deserves the stronger heroes?~~ — **settled: the player's call**

> **The design does not answer this, and must not.** Allocating twelve heroes
> across two zones is one of the few strategic decisions a defender gets, and it
> is meant to have real arguments on both sides.

**Settled 2026-07-27.** The two zones face genuinely different problems:

| | **Visible** | **Hidden** |
|---|---|---|
| Volume | every attack in the game starts here | only reached by ambush |
| Attacker quality | the whole range in your league | always on a win streak, therefore good |
| Scouting | filled rune slots and elements are visible | **never scoutable — the attacker comes in blind** |
| Pays per hold | 10 shards | **20 shards** |

Fortify Visible and you defend against volume, at the cost of being read.
Fortify Hidden and you defend rarely, against the best attackers, but they
arrive knowing nothing — which matters enormously in a game whose whole thesis
is counter-building.

> **This is a commitment, not an observation, and it is testable: neither zone
> may dominate.** If one is simply the right place for the best heroes, the
> choice is decoration.

**On current numbers it does not yet hold.** Hidden is reached on roughly 15% of
battles and pays double, so it generates about **0.30× the hold income of
Visible** — a 3.3 : 1 advantage to fortifying Visible on shards alone. That is
offset by an unknown: a blind attacker cannot counter-build, so the Hidden hold
*rate* should be markedly higher. **Whether the two offsets cancel is a question
for `packages/sim`**, and it is the first thing to check once holds can be
simulated.

The other lever is question 2 below — what a Hidden defense loss costs. If a
Hidden loss is cheap, Hidden becomes a free roll and the best heroes belong on
Visible whatever the income says. The two questions have to be answered
together.

### ~~1. Does a fought Hidden squad stay revealed?~~ — **settled: no**

An ambushed attacker has now seen that player's Hidden squad. Whether that
knowledge persists — and whether it is even useful, given the Hidden zone can
never be chosen — decided if "remembering who ambushed you" became a real
layer or a dead end.

> **A Hidden squad is visible only inside the battle itself and in that
> battle's replay. Nowhere else, ever.** It never appears in scouting, never on
> a profile, never in a match listing. *Hidden* is a permanent property of the
> zone rather than a state that a fight burns off.

**Settled 2026-07-27.** The knowledge does not persist as a game feature — only
as a replay a player may rewatch. And it is deliberately close to a dead end,
because **the Hidden zone can never be chosen**: an attacker cannot act on what
they learned except by being ambushed into the same squad again, which they do
not control. Anything the defender has since edited is stale, and the **hold
streak resets on edit**, so a defender who reworks a Hidden squad is visibly
starting over.

That is the point of the zone. If a single ambush permanently revealed a Hidden
squad, the mechanic would decay into a slow scouting tool — every player would
eventually have seen everyone's, and the second zone would collapse into a
second Visible one.

### ~~2. What does a Hidden defense loss mean for the defender?~~ — **settled: nothing extra**

**Settled 2026-07-27** in `06-progression.md`.

> **A Hidden hold pays a 2× rating bonus. A Hidden loss costs exactly what a
> Visible loss costs.**

The asymmetry is the whole point, and it mirrors the shard rule already in place —
an ambush doubles a victory for either side and a loss pays nothing. **One shape,
both currencies.**

#### It is what makes question 0 a real choice

Question 0 above commits to *"neither zone may dominate"* and records that on
shards alone Visible leads. Rating points the other way. A defender taking 20
attacks a day, 85 / 15, holding 40% on Visible and 60% on Hidden:

| | Battles | Shards/day | **Rating/day** |
|---|---|---|---|
| **Visible** | 17 | **68** | **−3.40** |
| **Hidden** | 3 | 36 | **+2.40** |

**Shards say fortify Visible; rating says fortify Hidden, and Visible actively
bleeds.** The defender has to decide which currency they are playing for, which is
exactly the strategic decision question 0 reserved for the player.

> The **3.3 : 1** figure in question 0 assumed *equal* hold rates; at 60 / 40 it is
> **1.9 : 1**. And if the two hold rates turn out equal, Visible wins both
> currencies and the choice collapses — still the first thing `packages/sim` must
> measure.

### ~~3. Is placement constrained by type?~~ — **settled: no**

[`../03-squad-builder.md`](../03-squad-builder.md) has always said "melee vs.
magic positioning matters." A hard rule — martial heroes must be front — sits
badly with the roster, since only 9 of 27 heroes are martial and front-row
options would be thin. Soft incentives are almost certainly right, but reach
may already be doing this job on its own: whatever else is true, a melee hero
wants to be where it can actually connect.

**No hard rule. Reach is the constraint.** `Might ≥ 40 ⟺ reach 1` holds across
all 27 heroes, and a reach-1 champion in the middle seat reaches only its own
front line — so it cannot attack at all. The roster's heaviest hitters are
already forced forward by a rule that exists for other reasons, and a champion
placed badly is simply useless rather than illegal. A type rule would add a
restriction on top of a constraint that already bites harder.

### ~~4. Does anything besides reach depend on row?~~ — **settled: no**

Reach makes rows matter. Whether they *also* modify damage taken or dealt, or
weight AI target selection, was unanswered.

**Nothing else depends on row.** Reach already makes placement the most
consequential squad decision — it decides who can act at all, it opens up as
rows empty, and `07-defense-ai.md` now uses row distance in both the targeting
menu and the engine's tiebreak chain. A damage modifier on top would be a second
positional system layered on a working one, and no design problem is asking for
it.

### 5. How is reach assigned across the roster? — *parked*

**Deferred deliberately.** Reach assignment is part of the hero-numbers pass,
along with the ten stats, and will be picked up when that work starts. Nothing
below is a decision; it is a starting proposal kept on file so the pass does not
begin from nothing.

Reach is a per-hero property, not one of the ten stats in
[`01-stats.md`](01-stats.md).

> **The numbers came from a generated screen, so they are not settled.**
> `designsystem/LMNTLZ Codex.dc.html` assigns a reach to all 27 heroes and the
> distribution stands up to checking — but design output is for look and feel and
> does not settle rules.

The distribution it lands on:

| | Count | Share |
|---|---|---|
| **Reach 1** | 12 | 44% |
| **Reach 2** | 15 | 56% |

The important property is not the ratio but the spread across types:

> **Every one of the nine types has at least one reach-1 and at least one reach-2
> champion.** No type is locked out of any row. A player who wants Fire in the
> back seat has Cindara; Slash in the middle row has Grieve; Crush at reach 2 has
> Mauless. Counter-building never forces a placement mistake, which matters
> because reach and type are the two axes a squad is built on and they must stay
> independently choosable.

The split also reads correctly against the fiction — martial champions skew
reach 1 (5 of 9) while arcane skew reach 2 (11 of 18), so melee wants the front
row without being confined to it.

Two things still to check once powers exist: whether reach 2 needs to cost
something elsewhere in a hero's stat budget, and whether 15 reach-2 heroes makes
the back seat too easy to fill well — the seat is designed as a trap for the
careless, and a trap is not much of a trap if over half the roster springs it
safely.

### ~~6. Does the defense squad follow different combat rules?~~ — **settled: no**

The zones now differ in *visibility*, but whether a defending formation behaves
differently in combat — row collapse, reach, targeting — was unanswered.

**They do not.** One combat model, both zones. The Visible/Hidden split is about
**who can see a squad and what a win pays**, never about how a battle resolves —
and `07-defense-ai.md` reached the same answer independently. Divergent combat
rules would mean an attacker's knowledge of the game did not transfer between the
two doors, which is the opposite of what the ambush mechanic is for.

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
