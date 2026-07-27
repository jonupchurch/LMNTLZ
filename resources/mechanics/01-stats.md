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
| 2 | **Packet** | One attack value, built once for the whole attack | `Might` |
| 3 | **Land** | Hit or miss, per target | `Perception` vs `Agility`, with `Luck` as the die |
| 4 | **Crit** | Whether this one spikes — once per packet | `Luck` |
| 5 | **Mitigate** | How much is absorbed | `Armor` **or** `Magic Resist` (def), reduced by `Penetration` (att) |
| 6 | **Type** | Bane / Fault / resisted / neutral | *no stat* — from the derivation rule |
| 7 | **Apply** | Floor at 25% of the packet, then subtract from the pool | pool size from `Toughness` |
| 8 | **Status** | Does an attached effect stick | power potency vs `Resolve` |

The attacker's **type** decides which mitigation stat applies at step 5: a
martial type is answered by `Armor`, an arcane type by `Magic Resist`, and a
power carrying **both** is answered by the defender's *lower* of the two. Step 6
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

> Compound values still stack past a single stat's cap: a `Might` 75 hero firing
> a ×5.0 tier-5 power produces a packet of 375. The cap binds each stat, not what
> a multiplier does with it.

---

## The formulas

### The packet

**One attack value is computed once and spent against every target.** Steps 3–6
then run separately per target, so an area power can miss one hero, be resisted
by a second and land a Bane crit on a third — but it only ever does one damage
calculation.

```
packet = Might × power.multiplier
```

**`Might` is the only stat in it.** `Luck` used to contribute a flat term and no
longer does — see [One stat, one job](#one-stat-one-job-luck-leaves-the-damage-formula)
below for why, and for what it cost.

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
below ×2 by the same curve (at the cap, ×1.5).

#### The layer is centered on neutral, and that is what buys its spread

Across all 702 ordered pairs on the current roster, mean net mitigation is
**−0.4%** — `Penetration` almost exactly cancels resistance on average. 42% of
pairs are reduced, 42% amplified, 16% exactly neutral. The layer changes nobody's
damage on average; it only redistributes.

**That is correct rather than broken.** Lowering `Penetration` to make the layer
net-reducing does not make it more meaningful — it makes it *flatter*:

| | Mean mitigation | Range | Spread |
|---|---|---|---|
| **as written** | −0.4% | 0.75 – 1.17 | **1.56×** |
| `Penetration` ×0.8 | +5.7% | 0.73 – 1.11 | 1.52× |
| `Penetration` ×0.6 | +11.7% | 0.71 – 1.04 | 1.47× |
| no `Penetration` at all | +26.4% | 0.65 – 0.83 | 1.28× |

`Penetration` is what *creates* the variance. A net-reducing layer would just be
a constant that HP tuning cancels out, and it would cost a third of the spread to
get. Centered-on-neutral is the same principle as *Penetration can negate, but
never overpower an equal*, applied to the roster as a whole.

For scale: mitigation's 1.56× best-to-worst sits deliberately below the type
chart's 3×, so reading an enemy's **type** profile stays the headline decision
and mitigation is the second-order one.

#### What is actually wrong is the coarseness

Only **8 distinct damage factors** occur anywhere on the roster, because there
are only **7 distinct `(Armor, MR, Penetration)` profiles across 27 heroes** —
and five of the seven share `Armor` 15:

| Armor | MR | Pen | Heroes | Roles |
|---|---|---|---|---|
| 15 | 25 | 40 | 5 | Ranged |
| 15 | 30 | 25 | 7 | Striker, Tank |
| 15 | 30 | 30 | 3 | Striker |
| 15 | 40 | 15 | 3 | Buffer |
| 25 | 30 | 30 | 1 | Striker |
| 40 | 30 | 25 | 6 | Striker, Tank |
| 40 | 30 | 30 | 2 | Striker |

`Magic Resist` is **fully determined by Role**, and it is the stat the pricing
decision above says should be the one that varies. This is stat-pass work, in the
same family as the `Speed` grid: the formula is right and the inputs are a
template.

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
armored target and costs you the points you did not put into `Might` or
`Perception`, which is the counter-building loop working as intended.

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

#### Dual-typed powers take the better of their two types

**81 of the 127 powers carry two types** — every tier 4, every tier 5 and every
unique passive is the hero's `primary · secondary` pair. Such a power resolves
on **whichever of its two types gives the attacker the better multiplier**, and
for the nine heroes whose pair mixes families, mitigation follows the same logic
and uses the defender's **lower** of `Armor` and `Magic Resist`.

| Rule | Range | Spread | Bane-or-better | Resisted |
|---|---|---|---|---|
| multiply both | 0.40 – 1.88 | 4.69× | 18.8% | 15.0% |
| **take the better** | **0.80 – 1.50** | **1.88×** | **23.1%** | **0.0%** |
| take the worse | 0.50 – 1.25 | 2.50× | 0.0% | 19.2% |
| average | 0.65 – 1.38 | 2.12× | 0.0% | 0.0% |
| primary only | 0.50 – 1.50 | 3.00× | 11.5% | 7.7% |
| *single-typed, tiers 0–3* | *0.50 – 1.50* | *3.00×* | | |

*Take the worse* and *average* were eliminated outright: both make it
**impossible for a tier-5 power to land a Bane hit**, which removes the largest
payoff in the game.

**The consequence, stated plainly: no tier-4 or tier-5 power is ever resisted.**
The floor is ×0.80 and a defender can never blunt an enemy ultimate by having the
right primary. That is the trade, and it is deliberate rather than an oversight.

It makes the two halves of the power list do different jobs:

- **Tiers 0–3 are the counter-building layer.** Single-typed, full 3× swing,
  fired on most turns. This is where reading an enemy's profile pays, and it is
  most of the damage in a battle.
- **Tiers 4–5 are the reliability payoff.** They cost 6 and 8 turns of cooldown
  and are gated to turns 3 and 5, and what that buys is a hit that **cannot be
  walled by a matchup**. A power a player waits five turns for should not be
  answered by the defender having happened to pick the right primary.

The counters to the unique layer are therefore mitigation, `Agility` and
`Resolve` — not the type chart. Worth knowing when tuning those three, because
they now carry the whole defensive answer to the biggest powers in the game.
Mixed martial/arcane uniques resolving against the defender's lower mitigation
stat runs at a mean damage factor of **1.082**, so they are net *amplified* by
about 8% on top.

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
packet = 45 × 2.5                 = 112.5
crit?    17.5% chance             -> assume no
E      = 40 − 30 = 10
factor = 1 − 10/85                = 0.882
        112.5 × 0.882             = 99.3
Bane   × 1.5                      = 148.9
        against HP 2000           = 7.4% of the pool
```

---

## One stat, one job — `Luck` leaves the damage formula

`Luck` used to contribute **flat damage, the size of every die it rolls, and crit
chance**. The opening rule of this file is that every stat has exactly one job;
`Luck` had three and no counter at all. **The damage term is now removed** —
`packet = Might × multiplier` — leaving `Luck` as the clean "the rolls go my way"
stat the table at the top of this file already claims it is.

Two things forced it.

**`Luck` was overriding `Might`.** At tier 0 it was 47% of a packet on average
and up to 62%, which is enough to invert the stat it sits beside: **Auriel
Dawnkeep at `Might` 30 dealt less than Ossic and Vael at `Might` 25**, seven such
pairs in all. A stat whose stated job is "how hard the unit hits" cannot lose to
a stat whose job is randomness.

**No partial weight fixes the gear problem.** `Luck` multiplies three separate
factors — die size, crit rate and damage — so its value *compounds* while every
other stat is linear. Ten points of runic budget on a Striker at `Might` 45 /
`Luck` 25, measured as effective output:

| `Luck`'s damage weight | +10 `Might` | +10 `Luck` | +10 `Perception` | Best buy |
|---|---|---|---|---|
| ×1.0 — as written | +14.3% | **+34.5%** | +16.9% | `Luck`, by **2.41×** |
| ×0.5 | +17.4% | **+27.9%** | +16.9% | `Luck`, by 1.60× |
| ×0.25 | +19.5% | **+23.4%** | +16.9% | `Luck`, by 1.20× |
| **×0 — chosen** | **+22.2%** | +17.7% | +16.9% | **`Might`** |

**The coefficient has to be zero.** Halving it only slows the trap down; at any
nonzero weight a damage dealer's correct purchase is `Luck` forever, and runic
equipment is a planned fast-follower rather than a hypothetical. At zero, the
three stats land within six points of each other and `Might` is correctly the
best buy for a hero whose job is damage.

### What it cost

Everyone's tier-0 auto-attack shrinks, and the high-`Luck` heroes shrink most:

| | `Might` | `Luck` | Tier-0 before | After | Loss |
|---|---|---|---|---|---|
| weakest Striker | 40 | 25 | 65 | 40 | 38% |
| **weakest Tank** | 25 | **40** | 65 | **25** | **62%** |
| weakest Ranged | 25 | 35 | 60 | 25 | 58% |
| weakest Buffer | 25 | 15 | 40 | 25 | 38% |

Support heroes are not relatively worse off — the Striker-to-Buffer damage ratio
*narrows*, 1.81× to 1.70×. What changes is that a Tank no longer chips in 65 a
turn. **That is a question for the stat pass**, not for the formula: if Tanks and
Ranged should contribute damage, it has to come from `Might`, where it can be
seen and priced.

Battle length was the other worry and it did not materialise. Simulated 6v6 with
the accumulator turn order, the cooldown rotation and the tier gates:

| | Length | Reach tier 4 | Reach tier 5 | Tier-5 powers fired |
|---|---|---|---|---|
| before | 18 ticks | 12 of 12 | 10 of 12 | 16 |
| **after** | 23 ticks | 12 of 12 | 10 of 12 | **17** |

Battles run about 28% longer and fire *more* of the unique layer, which is the
direction this file already wanted. Cutting HP to `Toughness × 37` to hold the
old pacing was considered and rejected: it shortened battles below today's *and*
fired fewer tier-5 powers, so it lost on the metric it existed to protect.

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

## The hit rate was never computed — and it is 45%

**Raised 2026-07-27, undecided.** The accuracy contest was designed
structurally — `Perception` against `Agility`, `Luck` as the die — and its
*output* was never derived. Resolved exactly over all 729 attacker/defender
pairs on the current roster:

| | Miss rate |
|---|---|
| min | 6.8% |
| p10 | 19.5% |
| **median** | **45.2%** |
| mean | 42.6% |
| p90 | 70.2% |
| max | 82.5% |

**465 of 729 pairs miss more than 30% of the time; 315 miss more than half.**

The cause is a scale mismatch rather than a bad stat spread. `Luck` runs 15–40,
so the die is **1..22 to 1..60** — up to three times the entire `Perception`
spread of 20 points. Mean `Perception` 32.0 against mean `Agility` 26.9 is a
5.2-point attacker edge against a die averaging ~22, so **accuracy is close to a
coin flip that stats barely nudge.**

Three consequences, in order of how much they cost:

- **Single-target ultimates are punished; multi-target ones are insured.** Phase
  3 resolves per target, so a three-target power rolls three times and cannot
  whiff entirely. Silka's `Quicker Than Told` — tier 5, ×5, **6-turn cooldown,
  single-target** — is worth ×2.75 in expectation, and its kill-chain never fires
  on a miss. Boldrek's `Avalanche` waits 8 turns for one roll. Nothing priced
  that asymmetry, and it runs opposite to the multi-target `+1` cooldown penalty
  in `03-powers.md`, which assumes multi-target is the stronger shape.
- **`Perception` is not a stat a player can invest in.** Twenty points of spread
  against a sixty-point die is the same failure as `Magic Resist` sitting flat at
  30: the outcome is dominated by something nobody chooses.
- **Battle length may be understated.** The ~155 hero-turn figure has to be
  re-checked against whether that simulation modelled accuracy at all. If it did
  not, real battles run close to **1.8× longer**, against a genre norm the design
  already exceeds by 2–3×.

The lever is the die multiplier rather than the stats: `Luck × 1.5` is what
swamps `Perception`. Any change to it **must refit the potency ladder**, which
`05-status.md` warns is tuned to this exact die and broke once already when the
die changed underneath it.

---

## Open questions

None of these block writing powers, but they must be answered before any number
in this file can be tuned. Question 2 is kept in place, struck through, because
what it settled to is load-bearing for the other three.

### ~~1. Magic Resist covers twice the ground Armor does~~ — **settled: left unpriced, deliberately**

Six of the nine types are arcane, and the asymmetry survives every honest
weighting — it is not an artifact of counting heads:

| Weighting | Arcane share | MR worth |
|---|---|---|
| headcount (18 vs 9) | 66.7% | 2.00× |
| by `Might` | 64.6% | 1.83× |
| by `Might` × action rate | 66.9% | **2.02×** |

Measured on the curve itself, one point of `Magic Resist` delivers **0.762%**
expected damage reduction against one point of `Armor`'s **0.323%** — a **2.36×**
gap. Nor can it be dodged by squad-building: across random 6-hero squads the
arcane share of damage output runs 44% at the 10th percentile and 87% at the
90th, only 7% of squads fall below 40% arcane, and an all-martial squad occurs
**0.01%** of the time. **There is essentially no opponent you can face where
`Armor` is the more important stat.**

**Decision: leave both stats priced identically and let MR simply be the better
one.** Six arcane forces against three martial ones is the world; the mitigation
stats inherit that shape rather than correcting for it. `Armor` is insurance
against a third of the field — and specifically against the martial half of the
twelve reach-1 heroes, who are the `Might` 40–45 hitters that must occupy a front
slot, so its value concentrates on the largest single blows even though it
answers the fewest attackers.

Both alternatives were tested and rejected:

- **Budget pricing** — charge 2 points for a point of MR. Costs nothing
  mechanically, but it means a hero card showing `Armor` 40 / `MR` 20 describes a
  hero who is *equally* defended, which no player will read correctly.
- **A separate curve constant for `Armor`** — `K` 37.5 rather than 75. Closes the
  gap only to 1.51× (and 25 only reaches 1.23×), while raising `Armor`'s maximum
  reduction to 67% against MR's 50%. That breaks the agreement that makes the 25%
  damage floor exactly tie the ×0.50 type multiplier, which this file relies on,
  and it makes `Armor` 40 and `MR` 40 mean different things.

> **The consequence to hold onto:** the roster is currently invested the wrong
> way round. Mean `Armor` is 22.8 against mean `Magic Resist` 30.2, and MR is a
> flat 30 for **every** hero — so the valuable stat is a constant nobody chooses
> and the cheap stat is the variable one. Under this decision the stat pass
> should make **`Magic Resist` the stat that varies**, since it is the one worth
> deciding about.

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

#### Speed buffs are flat points — the accumulator already normalizes them

> **Reversed.** This file previously required Speed buffs to be granted as a
> **percentage**, on the reasoning that a flat +10 is worth +67% to a Speed-15
> hero and +29% to a Speed-35 one. That arithmetic assumed action rate is
> proportional to `Speed`. It is not: `04-turns.md` settles the turn queue as a
> bounded accumulator gaining **`50 + Speed`** per tick, and the base constant
> does the normalizing that percentage-granting was invented to do.

Measured across the roster's actual Speed values:

| Buff | Sp15 | Sp25 | Sp30 | Sp35 | Sp45 | Spread | |
|---|---|---|---|---|---|---|---|
| flat +10, *if rate ∝ Speed* | +66.7% | +40.0% | +33.3% | +28.6% | +22.2% | **3.00×** | the rejected case |
| **flat +10, actual** | **+15.4%** | +13.3% | +12.5% | +11.8% | **+10.5%** | **1.46×** | mildly favours slow |
| +10%, actual | +2.3% | +3.3% | +3.8% | +4.1% | +4.7% | **2.05×** | favours *fast* |

**A percentage is now the regressive option.** It is worth twice as much to the
hero that is already fastest, which is the opposite of what the rule was for —
and in absolute terms a +10% buff moves the action rate by 2–5%, too little to
read as a power at all. Flat points give the more even distribution *and* a
magnitude a player can feel, so Speed rejoins the ordinary ±10/15/20/25 tier
scale in `05-status.md` with no special case.

The concrete case that drove the original rule — the tier-3 Air self-buff, whose
four owners span most of the range — is fine under flat points: it is worth
+15.4% to the slowest owner and +10.5% to the fastest.

The grid itself is still a **problem for the stat pass to fix**:

| Speed | Heroes |
|---|---|
| 15 | 6 — every martial Striker |
| 25 | 12 — **every** Tank and **every** Ranged |
| 30 | 6 — every arcane Striker |
| 35 | 3 — **every** Buffer |
| 45 | 1 — Silka Pinquick |

Two things are wrong here. **Speed is almost entirely a function of Role** — it
carries essentially no per-hero information. And the values sit on a **10-point
grid**, which under flat buffs means a +10 lands a hero exactly on the next
band's value rather than between bands: a buffed Speed-25 Tank becomes a Speed-35
Buffer, tied rather than ahead. Every buff either changes nothing about ordering
or promotes a hero one whole rung, and nothing in between.

That should be a decision rather than an artifact of the grid. If Speed buffs are
meant to let a hero seize initiative, the roster needs spreading across a wider
range with **irregular** values, so a buff lands a hero *between* rungs and
ordering actually changes. Silka is the only hero currently priced off-template,
at Speed 45 paid for with 15 Toughness and 15 Armor.

### ~~3. What Luck actually rolls~~ — **settled**

Two jobs, both in combat: `Luck` **is the die** — `rand(1 .. Luck × 1.5)`, rolled
for accuracy and again for every rider contest — and it sets the **crit rate** at
`Luck × 0.5` percent. It does **not** touch crit *damage*, which is a flat ×2
unless a passive says otherwise, and it no longer touches damage at all.

**Post-battle drops are the one part still open**, and they are now a separable
question rather than a stat-design one: nothing in combat depends on the answer,
so it can be decided with progression.

### ~~4. Resolve is defined against a system that doesn't exist~~ — **settled**

`05-status.md` now specifies it. Manipulation is stun, silence, slow, stat
debuffs, damage-over-time, strips and targeting effects; resisting means
**prevented**, decided once on application by `potency + rand(1..Luck×1.5)`
against `Resolve + rand(1..Luck×1.5)`, ties to the defender. Each rider is
contested separately, and friendly powers are never contested at all.

Whether a long control effect should be *re-tested* as it ticks — shortened
rather than only prevented — stays open in `05-status.md`, but with stun at one
turn it currently has nothing to bite on.

### ~~Also undecided: how steps 4–6 compose~~ — **settled**

**Both are multiplicative, and type effectiveness is applied last.** Because they
commute, the ordering is free and purely a presentation choice; the 25% floor is
applied after both, which is what keeps it free. Stacking mitigation is not a
dead end — the `75/(75+E)` curve gives diminishing returns rather than a wall,
and `Penetration` answers it. Worked through in *Type effectiveness, last* above.

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
