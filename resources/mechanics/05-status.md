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

## Findings from the balance review — **all four applied**

Four things the review surfaced. **All four are now fixed in the workbook** by
`tools/apply-roster-fixes.py`, which patches prompts in place and is idempotent.
The reasoning is kept below because the numbers are what justify the values
chosen, and a future rebalance needs them.

### 1. `Magic Resist` received no buffs at all, while `Armor` received thirteen

Of the self-buff riders across tier 4, tier 5 and the unique passives, `Armor`
was by far the most common and `Magic Resist` appeared **zero** times.

`01-stats.md` has since settled that this asymmetry is *deliberate at the stat
level* — MR is simply the better stat and is left unpriced. That decision makes
this finding sharper rather than softer, because it means every one of those ten
buffs is granting the **weak** stat:

| Tier-3 self-buff | Overall damage reduction |
|---|---|
| +15 `Armor` | **5.1%** |
| +15 `Magic Resist` | **10.4%** — 2.05× |

So thirteen powers were delivering **less than half** the defensive value their
tier implies, and no power anywhere improved the stat that answers two-thirds of
incoming attacks.

> **Applied.** The **six owned by arcane heroes** now grant `Magic Resist`:
> Ossic's `Kneel and Raise`, `The God-Bone Wakes` and `The Bone Beneath`,
> Tidewarden Coll's `Give Ground, Take Coast` and `The Bulwark Holds`, and
> Terragosa's `The Green Crown Descends`.
>
> **The split is on the owner's family, not on flavor.** Every arcane hero sits
> at `Armor` **15**, the roster minimum — so an Armor buff was improving the stat
> they have least of *and* the one that answers fewest attacks. Martial owners
> keep `Armor`: Grieve, Lord Aiguille and Mauless all have 40 to build on, and a
> bulwark reads as plate rather than as ward. Mauless's two keep it for a second
> reason — both also *strip* the target's Armor, which is the Crush identity.

**Buffs remain overwhelmingly defensive** — twelve mitigation buffs against a
single `Might`. `Luck` receives none at all. That is now less alarming than it
was — `Luck` has been removed from the damage formula (`01-stats.md`) and drives
only the die and the crit rate — but it is still the obvious stat for gear to
stack, so it is worth deciding rather than leaving to fall out.

### 2. Vantric carried four sources of one effect, with no stacking order
The Pierce House passive `Find the Seam` (`Penetration` rises against a repeat
target), his own passive `Seams Everywhere` (ignores 30% before `Penetration`
applies), and both uniques (`The One Gap` and `The Spear Finds It`, each ignoring
40%). Nothing says whether the 40% is taken off the base stat or off what
`Seams Everywhere` already left, and by the time all four have applied there is
usually nothing to take.

> **Correction.** An earlier version of this finding put Vantric's `Penetration`
> at 40 and claimed three of the four sources do literally nothing. He has
> `Penetration` **25**, and they are not worthless — `Seams Everywhere` alone is
> worth +3.9% damage against `Armor` 15, +9.1% against 25 and +15.5% against 40,
> which is correctly shaped for an effect called "find the seam." The real defect
> is four sources of one effect with **undefined composition** and sharply
> diminishing returns, not four sources of nothing.

> **Applied.** A fixed order now lives on `Seams Everywhere`, and both uniques
> point at it:
>
> 1. `Seams Everywhere` multiplies the mitigation stat by **0.70**
> 2. a unique, if used, multiplies the result by **0.60**
> 3. `Penetration` is subtracted, including any bonus from `Find the Seam`
> 4. the result feeds the mitigation curve, where a negative value amplifies
>
> Fixing the order is what stops the four double-counting. Against `Armor` 40
> that runs 40 → 28 → 16.8 → `E` = −8.2, so a unique amplifies rather than merely
> negating — which is the payoff his whole kit is built toward.

### 3. Boldrek had no mechanical identity in his uniques — his House layer hands him one

*All At Once* (×3.5) and *Avalanche* (×5.0) were both featureless single hits,
the only hero whose entire unique kit was "big number, no rider." His passive
*No Warning* (crits deal extra) was his sole distinguishing trait.

The fix is already sitting in his own kit. Every shared Crush power he owns is
about **removing armor rather than piercing it**:

| Power | Shared via | Does |
|---|---|---|
| `Make an Opening` (t1) | Primary | −20% target `Armor` |
| `The Sky Falls` (t2) | Primary | −30% target `Armor`, plus vulnerability |
| `Nothing Holds` (House) | House | shaves `Armor` on every attack, **and it stacks** |

So Boldrek spent the whole early game stripping a target's guard, and then his
uniques ignored that entirely — while Crush's stated identity is *"does not go
through the guard — it removes the guard."*

> **Applied.** The uniques now cash in the shred, using nothing his kit did not
> already have:
>
> - **`All At Once`** *reads* the stack — **+10% damage per 10% of `Armor`
>   already stripped, to a maximum of +40%**, leaving the shred in place.
> - **`Avalanche`** *spends* it — **consumes every stack, converting each 10%
>   removed into +15% damage, to a maximum of +60%**, after which the target's
>   `Armor` returns to full.
>
> That gives him the same **passive banks → tier 4 reads → tier 5 spends** shape
> Marisel has, which `03-powers.md` names as the template any stacking resource
> should follow.

### 4. Grieve's `Room to Swing` overcapped, and it was not alone on his sheet

He sits at `Armor` 40 against the 75 cap, so he has **35 points of headroom** —
and three separate powers were spending it:

| Per enemy | 1 enemy | 3 enemies | 6 enemies |
|---|---|---|---|
| +5 | 45 | 55 | **70** — fits |
| +8 | 48 | 64 | 88 — overcaps |
| +10 | 50 | 70 | 100 — overcaps |
| +15 | 55 | 85 | 130 — overcaps |

**+5 per enemy is the only value that fits**, and it fits only if nothing else is
running. `Clear the Room` (tier 4) and `The Wide Reaping` (tier 5) both granted
`Armor` on top, so in practice even +5 overcapped whenever a unique was active.

> **Applied.** `Room to Swing` is now **+5 `Armor` per enemy in reach, maximum
> +30**, and `The Wide Reaping` grants **`Toughness` instead of `Armor`**. A
> `Toughness` buff raises maximum HP *and* grants the same amount as current HP
> (see *Stacking* above), so unlike an overcapped `Armor` buff it is never
> silently discarded. `Clear the Room` keeps its `Armor` buff — with the passive
> capped at +30, one tier-4 buff fits inside what is left.

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
