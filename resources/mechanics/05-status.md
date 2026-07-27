# LMNTLZ · Mechanics 05 — Status Effects

Everything a power does *beyond* its damage number. The 87 active powers and 40
passives in `../characters/hero-stats.xlsx` describe their riders in adjectives
— "a small slow", "briefly", "a larger Armor reduction". **This file is what
those adjectives mean.**

Rule for this document: *no adjective without a number.* If a power says
"small", the table below says what small is.

---

## The magnitude scale

**Indexed per tier, not banded.** A power that needs to deviate says so
explicitly, per the convention in `01-stats.md`.

| Tier | Stat change | Duration | DoT tick | Shield |
|---|---|---|---|---|
| **1** | **±10** | **1 turn** | Might × 0.25 | Might × 1.0 |
| **2** | **±15** | **2 turns** | Might × 0.35 | Might × 1.5 |
| **3** | ±15 | **3 turns** | Might × 0.40 | Might × 1.5 |
| **4** | **±20** | 3 turns | Might × 0.50 | Might × 2.0 |
| **5** | **±25** | **4 turns** | Might × 0.60 | Might × 2.5 |

**Every tier strictly beats the one below on at least one axis**, alternating
between magnitude and duration. That is not decoration — the authored prompts
depend on it. Tier 2 powers are written as escalations of their tier-1
counterpart in the same House:

> *"the slow from **Root and Hold**, extended to 2 turns"* · *"a stronger
> accuracy penalty than **Thin the Air**, lasting 2 turns"* · *"the burning tick
> from **Feed the Bloom**, now ticking twice"*

Those only make sense if tier 1 lasts **one** turn. An earlier draft of this
table grouped tiers 1–2 into a single "small" band at 2 turns, which silently
made every tier-2 rider identical to its tier-1 original. The per-tier table
above is what the sheet was actually written against.

*"…lasts one turn longer"* — Cindara's **Banked Coals**, Marisel's **Wears
Through**, the Water House rider — adds **+1 turn** on top, not magnitude.

**Why ±10 through ±25.** Base stats sit between 15 and 45 against a cap of 75,
so headroom above a typical stat is around 35 points. A tier-5 buff spends most
of it and a tier-1 buff moves a 30-point stat by a third — visible without being
a swing. Note that a 1-turn effect is still felt for a full turn: Resolution
ticks *last*, so an effect applied in phase 4 survives that turn and expires at
the end of the bearer's next one.

**Crowd control is priced separately**, because losing a turn is worth far more
than any stat change:

| Effect | Duration | |
|---|---|---|
| **Stun** | **1 turn** | Loses the action entirely — skips phases 2–4 |
| **Silence** | **1 turn** | Powers blocked; the tier-0 auto-attack still works |
| **Slow** | 2 turns | −10 `Speed` (a stat change, priced as small) |

One turn of stun is the strongest single effect in the game. It should never
scale past that without a very good reason.

---

## Duration and the clock

**Durations tick on the bearer's own turn, in the Resolution phase** — the same
clock as cooldowns and damage-over-time (`04-turns.md`). Nothing counts rounds
and nothing counts anybody else's turns.

Two consequences worth holding onto:

- **A 2-turn buff is usable twice.** Resolution ticks *last*, so an effect
  applied in phase 4 survives that same turn's Resolution at full duration and
  only starts counting on the bearer's next turn.
- **`Speed` is a rate multiplier on this whole layer.** A fast hero burns
  through its own buffs *and* its own debuffs sooner. A damage-over-time effect
  therefore deals the same total whatever the bearer's Speed — three ticks is
  three ticks — it simply arrives compressed.

---

## Landing an effect

A rider is **staged** in the Attack phase, **contested** in the Defense phase,
and **enacted** in Additional Effects (`04-turns.md`).

```
sticks if   potency + rand(1..Luck×1.5)  >  Resolve + rand(1..Luck×1.5)
                                                   # ties go to the defender
```

Same contest and same die as accuracy (`01-stats.md`) — `Luck` is the
randomness in this game, and a lucky hero lands its riders as well as its blows.

**Potency is derived from the tier of the power applying it.** No per-power
authoring, and it self-balances — a rider on an ultimate is genuinely harder to
shrug off than one on a tier-1 poke, which is part of what the longer cooldown
buys.

| Tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **Potency** | 20 | 28 | 36 | 44 | 52 |

Across all 729 pairs that gives an average stick rate of **31% at tier 1 rising
to 87% at tier 5**, with nothing deterministic in either direction.

> **The ladder is tuned to the die, and breaks outside it.** An earlier version
> ran 20–70, which was fitted to a `d100`. Against a Luck-sized die of 22–60 a
> potency of 70 is unbridgeable: a tier-5 rider landed **automatically against
> 243 of 729 pairs**. The usable band is roughly **20 to 60** — below it, low
> tiers can never land; above it, high tiers can never be resisted. Any future
> change to the die multiplier has to refit this table.

Two rules sit on top:

- **Each rider is contested separately.** Resisting a burn does not resist a
  slow — every door is its own roll.
- **Friendly powers are never resisted.** A buff, heal or cleanse aimed at an
  ally skips the contest entirely, along with type effectiveness (`01-stats.md`).

A power that deals neither damage nor healing skips the Defense phase
altogether, so its riders are contested *and* enacted together in phase 4.

---

## Stacking

> **Different sources stack. The same source refreshes.**

Reapplying the *same* power resets its duration and does not add magnitude.
Effects from *different* sources add together. Team synergy compounds; spamming
one power does not.

**Stat buffs need no separate ceiling — the 75 cap already is one.** A hero at
`Might` 45 receiving three +10 buffs reaches 75, not 85. The stat cap does the
limiting, which is why runic equipment can be generous about stacking without
anything running away.

Non-stat effects have no such natural bound, so each declares its own limit:

| Effect | Stacks to |
|---|---|
| Damage over time | 3 instances per target |
| Shields | one at a time — the larger replaces the smaller |
| Stun, silence | never stack; duration refreshes only |

**A `Toughness` buff raises maximum HP and grants the same amount as current
HP** — so it functions as temporary hit points and is useful the moment it
lands. When it expires, maximum HP falls and current HP is clamped down to it.

---

## The effect catalog

### Damage over time

**Snapshotted at application.** When a burn lands it stores a finished number —
tick damage computed from the applier's `Might` at that moment, and the type
multiplier against that target — and never recalculates. The applier can die, be
buffed or be debuffed; the effect is unchanged.

That keeps it consistent with the packet model in `01-stats.md`: a
damage-over-time effect is simply a packet that pays out across several turns,
and it needs no fallback rule for a dead applier.

Ticks resolve in the bearer's **Upkeep**, before it acts, so a hero can die to a
burn without ever taking its turn.

The **Fire House passive `It Catches`** is the one exception to a flat tick: a
burn applied by a Fire hero grows **+50% of its base tick each turn** rather
than staying level.

### Stat modifiers

Buffs and debuffs to any of the ten stats, at the magnitudes above. **`Speed` is
no exception — it is granted in flat points like everything else.**

An earlier rule made `Speed` a percentage, because a flat +10 looked worth +67%
to a Speed-15 hero against +29% to a Speed-35 one. That assumed action rate
scales with `Speed`; the bounded accumulator in `04-turns.md` makes it scale with
`50 + Speed`, so the real spread of a flat +10 is **+15.4% to +10.5%** — and a
percentage buff is now the *regressive* option, worth twice as much to the
fastest hero and only 2–5% in absolute terms. Full table in `01-stats.md`.

### Mitigation shred — a percentage, not points

**A shred removes a percentage of the target's resistance stat, not a flat
number of points.**

| Band | Shred |
|---|---|
| small | −20% of the stat |
| moderate | −30% |
| large | −40% |

This is not cosmetic. Mitigation is the curve `75 / (75 + E)`, which is steepest
at low `E` — so a **flat** shred is worth *more* against a lightly armored
target than a heavily armored one, which is exactly backwards for an effect
called "find the seam":

| Target `E` | Flat −10 | −25% |
|---|---|---|
| 10 | **+11.8%** damage | +2.7% |
| 40 | +6.2% | +6.2% |
| 75 | **+3.6%** | **+7.1%** |

A percentage shred scales monotonically — worth more the more armored the
target. It affects ten authored powers, including Marisel's and Boldrek's entire
kits.

### Shields

An absorb layer that depletes **before** the health pool is touched. A shield
that breaks mid-hit passes the remainder through in the same step; it never eats
a whole strike for free.

Shields matter because they are **the only thing that can fully negate a landed
hit.** Mitigation caps at 50% reduction and the damage floor guarantees 25% gets
through, so nothing else can. Avoiding a hit outright remains `Agility`'s job —
the two defenses do genuinely different work.

### Targeting effects

**Taunt** compels and **fade** filters; both are resolved in the four-stage
targeting pipeline in `04-turns.md`, under two invariants that make an
unresolvable board impossible. **They cancel on the same hero.** Tank and Buffer
role passives are permanent instances of each, which makes them each other's
counter.

### Cleanses and strips

**Cleanse** removes negative effects from an ally; **strip** removes positive
effects from an enemy. A strip is contested against `Resolve` like any rider; a
cleanse is a friendly power and is never resisted.

Two passives override this: **Ember Saelith's `Never Quite Out`** (her burns
cannot be cleansed) and **Umbriel's `Written in Pencil`** (her debuffs cannot be
cleansed). Both can still expire — they cannot be removed early.

---

## Findings from the balance review

Four things the review surfaced. None is fixed here — they are roster and power
decisions, recorded so they are not rediscovered later.

**`Magic Resist` receives no buffs at all, while `Armor` receives ten.** Of the
27 self-buff riders across tier 3 and the uniques, `Armor` is by far the most
common and `Magic Resist` appears **zero** times. That runs directly against
open question 1 in `01-stats.md`: six of the nine types are arcane, so `Magic
Resist` is the relevant mitigation stat **two-thirds of the time**. The buff
distribution actively favours the stat that matters less.

**Buffs are overwhelmingly defensive** — ten `Armor` against a single `Might`.
`Luck` receives none at all, which may be deliberate now that it drives damage,
accuracy and crit, and would be the obvious stat for gear to stack.

**Vantric's mitigation-ignoring stacks with itself into nothing.** He has four
separate sources: the Pierce House passive (`Penetration` rises against a repeat
target), his own passive `Seams Everywhere` (ignores 20%), and both uniques
(ignore 40%). But his `Penetration` 40 against a martial `Armor` 40 already
gives `E = 0` — **mitigation cannot be reduced below zero**, so three of the
four do nothing in his most common matchup. He needs one of them converted into
something else.

**Boldrek has no mechanical identity.** *All At Once* and *Avalanche* are both
featureless single hits — the only hero whose entire unique kit is "big number,
no rider." His passive *No Warning* (crits deal extra) is his sole distinguishing
trait. Compare Marisel, who has a three-part stack system across passive, tier 4
and tier 5.

**Grieve's `Room to Swing` overcaps.** It grants `Armor` per enemy in reach;
against six enemies at any sensible per-enemy value it exceeds the 75 cap and
the excess is silently discarded. It needs a per-enemy figure chosen against the
cap, or an explicit maximum.

## Open

- **Late resistance.** The Turn Sequence screen proposed re-testing long control
  against `Resolve` as it ticks, letting a high-`Resolve` hero shake a stun off
  early rather than only refusing it on application. Tagged OPEN there too. With
  stun at 1 turn it currently has nothing to bite on.
- **Whether shields have a type.** A shield that absorbs only martial or only
  arcane damage would be a sharper counter-building tool than a flat one, at the
  cost of another thing to read on a status chip.
- **Effect visibility.** Whether a player can see an enemy's exact remaining
  durations, or only that an effect is present. This is a scouting question as
  much as a UI one, and it interacts with the Visible/Hidden squad split.
