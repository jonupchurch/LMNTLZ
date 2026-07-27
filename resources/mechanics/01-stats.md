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
| 2 | **Packet** | One attack value, built once for the whole attack | `Might`, `Luck` |
| 3 | **Land** | Hit or miss, per target | `Perception` vs `Agility`, with `Luck` as the die |
| 4 | **Crit** | Whether this one spikes — once per packet | `Luck` |
| 5 | **Mitigate** | How much is absorbed | `Armor` **or** `Magic Resist` (def), reduced by `Penetration` (att) |
| 6 | **Type** | Bane / Fault / resisted / neutral | *no stat* — from the derivation rule |
| 7 | **Apply** | Floor at 25% of the packet, then subtract from the pool | pool size from `Toughness` |
| 8 | **Status** | Does an attached effect stick | power potency vs `Resolve` |

The attacker's **type** decides which mitigation stat applies at step 5: a
martial type is answered by `Armor`, an arcane type by `Magic Resist`. Step 6
draws on nothing but the attacker's type and the defender's primary/secondary —
see the derivation rule in `../LORE-and-flavor.md`.

A miss at step 3 ends resolution — no chip damage, no status. A power may
still carry an on-miss rider, but it has to declare one.

---

## Caps

**Every stat is capped at 75. Anything past it is ignored.**

Base values are authored well below that — the highest anywhere on the roster is
45 — so a fully equipped hero has real room to grow without the cap ever being
decorative:

| Cap | Headroom above the roster's highest stat | Growth |
|---|---|---|
| 50 | 5 points | +11% |
| **75** | **30 points** | **+67%** |

50 was considered and rejected: `Might` and `Speed` already sit at **90% of it**
at base, so runic equipment would have been a rounding error. At 75 the per-hero
stat total can reach 750 against today's 300 — a 2.5× ceiling for gear to fill.

Three things follow, and all three are load-bearing:

- **Overcapping is waste**, so gear has to be *spread* rather than piled. That
  turns equipment into an allocation puzzle rather than a power ladder, which is
  the whole point of **planning over paying**. It falls out of the cap; it needs
  no system of its own.
- **Maximum mitigation is exactly 50%**, because the largest possible `E` is the
  cap and `K` is also 75. "At the highest possible resistance, damage is halved"
  is the rule, not an arbitrary constant.
- **Damage and HP scale together, so battles keep their shape.** Everything at
  75 gives 262 damage per turn against 3750 HP, versus 112 against 1583 today —
  ×2.34 and ×2.37. Solo time-to-kill moves **1%**. Full gear makes battles
  bigger, not faster.

> Compound values still stack past a single stat's cap. `Might` 75 and `Luck` 75
> both contribute, so a tier-0 packet reaches 150. The cap binds each stat, not
> the sum of their contributions.

---

## The formulas

### The packet

**One attack value is computed once and spent against every target.** Steps 3–6
then run separately per target, so an area power can miss one hero, be resisted
by a second and land a Bane crit on a third — but it only ever does one damage
calculation.

```
packet = (Might × power.multiplier) + Luck
```

Riders ride along in the packet, staged and not yet applied (`04-turns.md`).

### Hit points

```
HP = Toughness × 50
```

There is no separate HP stat; `Toughness` *is* the pool. At ×50 a Toughness-25
hero has 1250 and a Toughness-40 hero 2000.

**The multiplier is load-bearing, not cosmetic.** At an average of ~2.5× `Might`
per turn, a focused hero dies in 5.6 turns at ×50 but **2.2 turns at ×20** — and
tier 4 and 5 powers are gated to turns 3 and 5 (`03-powers.md`). Anything below
about ×35 means the entire 54-power unique layer never fires in a battle decided
by focus fire. If battles need shortening, move the tier-5 gate earlier rather
than cutting HP.

### Landing a blow — `Luck` is the die

```
attack  = Perception + rand(1 .. Luck × 1.5)
defense = Agility    + rand(1 .. Luck × 1.5)
hit if attack > defense                      # ties go to the defender
```

**There is no separate die.** The randomness in the game *is* the `Luck` stat —
a hero with `Luck` 40 rolls 1–60, a hero with `Luck` 15 rolls 1–22. That single
choice does three things a fixed `d100` could not:

- **Low `Luck` is consistent; high `Luck` is volatile.** A Luck-15 hero swings
  22 points and is predictable to play around. A Luck-40 hero swings 60 and can
  steal an exchange it had no business winning. That is a real build decision
  rather than a number that is simply better.
- **It halves `Luck`'s accuracy value.** As a flat bonus, Luck 15 vs 40 was a
  25-point accuracy gap. As a die it averages +11.8 against +30.5 — a gap of
  18.8, roughly three-quarters of what an equal investment in `Perception`
  buys. `Luck` supports accuracy; it no longer rivals it.
- **It removes an arbitrary constant.** Nothing has to justify why the die has
  100 faces.

Across all 729 attacker/defender pairs this gives hit chances from **17% to
93%, with no matchup deterministic in either direction.**

**Ties go to the defender**, which resolves the contest unambiguously and quietly
favours the side that isn't choosing.

`Agility` alone answers accuracy — **no mitigation stat appears here**, and that
is now a hard constraint rather than a preference. Putting `Armor` into the
defense roll adds up to 40 points, which a Luck-sized die cannot span: **28% of
all matchups become literally impossible**, and even halving Armor's
contribution leaves 10% unwinnable. A `d100` is large enough to absorb it, but
only by drowning out the stats it is meant to compare.

> **Correction.** An earlier draft justified excluding `Armor` by claiming a
> deterministic comparison left 52% of pairs unable to hit. That figure assumed
> no die at all. The reason above is the real one, and it is stronger.

The same contest and the same die resolve whether a rider sticks
(`05-status.md`): `potency + rand(1..Luck×1.5)` against
`Resolve + rand(1..Luck×1.5)`.

### Critical hits

```
crit chance = Luck × 0.5   (percent)      # Luck 15 -> 7.5%, cap 75 -> 37.5%
crit damage = packet × 2                  # unless a passive raises it
```

**Rolled once per packet, not per target.** An area power therefore crits
against everyone it hits, or nobody.

That is deliberate. A row-hitter like Grieve doubling against a whole line is
the most memorable thing that can happen in a battle, and at up to 37.5% crit it
is a real possibility rather than a curiosity — **an occasional big hit is worth
more to the game than smooth output.** The alternative, rolling per target,
averages that spike away precisely on the powers best placed to deliver it.

At half of `Luck`, every hero crits at least once in a typical battle. At the
20% coefficient first considered, three heroes were more likely than not to crit
**zero** times across an entire battle — which would have left Boldrek's *No
Warning* and the Slash House passive *The Cut Reopens* as lottery tickets rather
than passives.

### Mitigation — bounded, not linear

`Armor` and `Magic Resist` reduce damage by a **percentage**, and `Penetration`
subtracts from whichever applies before it does anything:

```
E = (Armor or Magic Resist) − Penetration        # effective resistance
K = 75

E ≥ 0:   factor = 1 − E / (E + K)                # reduction, bounded
E < 0:   factor = 1 + (−E) / (−E + K)            # amplification, bounded
```

**The curve is the single most important defensive decision in the game.** A
flat "reduction equals the stat value" scheme gives *accelerating* returns,
because effective HP is `1/(1−r)`:

| | Flat scheme | This curve |
|---|---|---|
| E = 25 | 25% · 1.33× eHP | 25% · 1.33× eHP |
| E = 50 | 50% · 2× eHP | 40% · 1.67× eHP |
| E = 90 | 90% · **10× eHP** | 55% · 2.2× eHP |
| E = 150 | — | 67% · 3× eHP |

`K = 75` is chosen so the curve **matches the flat scheme almost exactly through
the range the roster currently occupies** (E ≤ 25) and only bends above it. Play
today is unchanged; the top end simply cannot run away.

That matters specifically because **runic equipment is a planned fast-follower**
— gear that adds stats and stacks with buffs. Under a flat scheme, stacked Armor
converges on invulnerability and the only counter is stacked Penetration; under
this curve, every additional point is worth less than the last, so stacking is
self-limiting and gear can be generous without breaking anything.

Penetration **overshoot amplifies** rather than being wasted: an attacker whose
`Penetration` exceeds the defender's resistance deals *more* than base, bounded
below ×2 by the same curve (at the cap, ×1.5). Across the current roster, mean
net mitigation is **−0.1%** — penetration exactly cancels resistance on average,
so the whole mitigation layer currently nets to zero. That is a numbers problem
for the stat pass, not a formula problem.

### Penetration can negate, but never overpower an equal

Because every stat shares the same cap, `Penetration` 75 against `Armor` 75
gives `E = 0` — **full negation and nothing more.** An attacker who has invested
everything into piercing meets a defender who has invested everything into
resisting, and the result is neither reduction nor amplification. Mitigation
disappears in that matchup, and that is correct rather than a hole:

> **Penetration's ceiling against any defender is exactly that defender's
> resistance.** Beating them requires *out-investing* them, not merely maxing
> out.

Amplification is therefore never free. It only appears when the attacker's
`Penetration` genuinely exceeds what the defender put into the matching
resistance — Penetration 75 against Armor 40 gives ×1.32, while Penetration 75
against Armor 75 gives ×1.00. Spending your whole budget on piercing erases an
armored target and costs you the points you did not put into `Might` or `Luck`,
which is the counter-building loop working as intended.

This is the reason to keep **one cap for every stat.** An asymmetric cap —
`Penetration` held to 50 while resistances reach 75 — would guarantee mitigation
always did *something*, but it would also mean a defender could out-invest an
attacker who had already maxed out, which is the same unanswerable-stat problem
in the other direction.

### Type effectiveness, last

```
typed = mitigated × typeMultiplier
```

**Five levels, mirroring the derivation.** Every hero has two strengths and two
weaknesses, and the weaknesses already split into major and minor — so the
strengths do too:

| Attacker's type is… | Multiplier | |
|---|---|---|
| the defender's **Bane** | **×1.50** | `counter(primary)` — major weakness |
| the defender's **Fault** | **×1.25** | `counter(secondary)` — minor weakness |
| unrelated | ×1.00 | |
| the defender's **secondary** | **×0.80** | minor strength |
| the defender's **primary** | **×0.50** | major strength |

Best-to-worst swing is **3×**, which is what makes reading an enemy's profile
worth doing. The ×0.50 exactly ties the 25% damage floor at maximum mitigation,
so the two limits agree rather than fighting.

Applying doors and banes **after** mitigation rather than before is free:
both are multiplicative, so they commute and the final number is identical
either way. It is purely a presentation choice — and it closes the "how do
steps 4–6 compose" question this file carried as open.

> **Friendly powers are never resisted.** A power aimed at an ally skips type
> effectiveness entirely and skips the `Resolve` contest for its riders. You do
> not shrug off your own healer, and a Fire ally's buff is not blunted by your
> Fire primary. Reach still applies — one rule, no exceptions (`02-squads.md`).

### Rounding

**Full precision through the whole pipeline; round once, at the end, to the
nearest whole number.** Rounding at each step compounds error and makes the same
attack produce different totals depending on how the steps are grouped. Replays
are stored event logs rather than re-simulations (`../../docs/tech-stack.md`),
so only the final figure is ever persisted.

### The damage floor

```
final = max(packet × 0.25, typed)       # a hit always lands for something
```

**A successful attack never deals less than 25% of its packet.** A miss still
deals nothing — the floor is a guarantee about hits, not about attacks.

**Applied last, after both mitigation and type.** That placement is what keeps
the mitigation/type ordering free: a clamp *between* the two steps would break
the commutation and force the order to be re-decided. Putting it at the end also
makes it a promise about the number the player actually sees.

Two things worth knowing about where it bites.

**It exactly ties the worst case the math can already produce.** Mitigation
caps at 50% reduction, so if `resisted` is ×0.5 the minimum possible damage is
`0.5 × 0.5 = 25%` — precisely the floor. At today's numbers the floor therefore
**never binds**; it is insurance, not a live rule:

| At max mitigation | Raw | After floor |
|---|---|---|
| Bane ×1.5 | 75% | 75% |
| Fault ×1.2 | 60% | 60% |
| neutral ×1.0 | 50% | 50% |
| resisted ×0.5 | 25% | 25% — ties |

**It constrains a decision not yet made.** The type multipliers below the Bane's
×1.5 are still open (`../CLAUDE.md`). The floor means **setting `resisted` below
×0.5 buys nothing against a well-armored target** — 0.4 would produce 20% and be
clamped straight back to 25%. So the floor quietly caps how hard the type chart
is allowed to punish a bad matchup, and that should be a known consequence when
those multipliers get set rather than a surprise afterwards.

Where the floor does earn its place is against **stacked mitigation**. The 50%
ceiling holds only for mitigation derived from stats; buffs, shields and gear
could push effective reduction past it once runic equipment exists. The floor is
the backstop that stops any stack of effects from reducing a landed hit to
nothing.

### Worked example

Bramwen (`Might` 45, `Luck` 35, `Penetration` 30) uses a tier-3 power (×2.5)
against a defender with `Magic Resist` 40:

```
packet = 45 × 2.5 + 35            = 147.5
crit?    17.5% chance             -> assume no
E      = 40 − 30 = 10
factor = 1 − 10/85                = 0.882
        147.5 × 0.882             = 130.1
Bane   × 1.5                      = 195.2
        against HP 2000           = 9.8% of the pool
```

---

## One stat still doing three jobs

`Luck` contributes **flat damage, the size of every die it rolls, and crit
chance**. The opening rule of this file is that every stat has exactly one job
and every axis of conflict has exactly one counter; `Luck` is the only stat with
three roles and the only one with no counter at all.

Making `Luck` the die was itself a trim — it merged what used to be a flat
accuracy bonus *and* a separate `d100` into one thing, and halved the accuracy
advantage a high-`Luck` hero gets. What remains is one job too many.

**This is recorded as an open decision, not applied.** The damage formula above
is as specified. The recommended trim is to **drop `Luck` from the damage
formula**, leaving `packet = Might × multiplier`, for two reasons:

- **It compresses the roster.** At tier 0, Luck is 44–62% of a hit. Bramwen
  (`Might` 45) deals 80 and Ossic (`Might` 25) deals 65 — a 45-vs-25 Might gap
  collapses to 80-vs-65 damage, and `Might` barely matters at low tiers.
- **Equipment makes it worse.** With runes able to raise stats, a `Luck`-stacking
  build would gain on four axes per point while every other stat gains on one.
  That is the classic single-dominant-stat trap, and it arrives with the gear.

Dropping it leaves `Luck` as a clean "the rolls go my way" stat — accuracy and
crits — which is what the table at the top of this file already claims it is.

**Where these steps happen** is [`04-turns.md`](04-turns.md): steps 2–8 are the
Attack, Defense and Additional Effects phases of a hero's turn, and step 1 sits
between turns. One placement differs from the order above — **step 2 (Land) is
resolved in the Defense phase, after the attack value is fully computed**, so an
on-miss rider has a number to scale from. Identical outcome for an ordinary
attack; the phase structure is authoritative where they diverge.

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

None of these block writing powers, but they must be answered before any number
in this file can be tuned. Question 2 is kept in place, struck through, because
what it settled to is load-bearing for the other three.

### 1. Magic Resist covers twice the ground Armor does

Six of the nine types are arcane. On a random incoming attack, `Magic Resist`
is the relevant mitigation stat **two-thirds of the time**; `Armor` only a
third. Point-for-point, MR is therefore worth roughly double.

That's not automatically wrong — it's only wrong if it goes unpriced. Options:
make a point of `Armor` numerically larger than a point of `Magic Resist`;
or leave the values equal and let hero stat budgets account for it, so
Armor-heavy heroes get more total budget. **Decide before assigning any hero
its numbers,** because it changes what a "high defense" hero costs.

### ~~2. Speed vs. whole-turn cooldowns~~ — **settled**

`Speed` sets **initiative order**, and **faster heroes act more often**. It
never touches cooldowns directly: a cooldown counts **hero turns**, ticking once
per turn its owner takes.

This is the *extra actions* option, and it dissolves the problem rather than
answering it. Because a cooldown ticks per turn taken, a fast hero's 3-turn
power genuinely comes back sooner in real time — but the counter is still an
integer and there is never a fraction to round. A Speed buff also can't land
dead: it changes how often the hero acts, which is visible immediately.

Full consequences in [`04-turns.md`](04-turns.md) — including the one that
matters most for tuning here, that **Speed multiplies the rate of everything
counted in turns**, not just actions.

#### Speed buffs are a percentage, and the range is too narrow for them

A power that grants Speed grants a **percentage**, never flat points. A flat
+10 would be worth +67% to a Speed-15 hero and +29% to a Speed-35 one, which
matters concretely: the tier-3 Air power is a *self*-buff and its four owners sit
almost across the whole range, so identical text would have been worth wildly
different amounts.

But the roster gives a percentage very little to work with, and this is a
**problem for the stat pass to fix**:

| Speed | Heroes |
|---|---|
| 15 | 6 — every martial Striker |
| 25 | 12 — **every** Tank and **every** Ranged |
| 30 | 6 — every arcane Striker |
| 35 | 3 — **every** Buffer |
| 45 | 1 — Silka Pinquick |

Two things are wrong here. **Speed is almost entirely a function of Role** — it
carries essentially no per-hero information. And the values sit on a **10-point
grid**, so a buff of +10% on a Speed-25 hero is +2.5 and **can never cross a
gap**. A small percentage buff therefore changes how often a hero acts but can
never change *where it sits in initiative order* — it moves pace, never
priority.

That may be the right behaviour, but it should be a decision rather than an
artifact of the grid. If Speed buffs are meant to let a hero seize initiative,
the roster needs spreading across a wider range with irregular values so the
gaps are crossable. Silka is the only hero currently priced off-template, at
Speed 45 paid for with 15 Toughness and 15 Armor.

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
