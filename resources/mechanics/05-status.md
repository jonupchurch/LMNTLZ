# LMNTLZ · Mechanics 05 — Status Effects

Everything a power does *beyond* its damage number. The 87 active powers and 40
passives in `../characters/hero-stats.xlsx` describe their riders in adjectives
— "a small slow", "briefly", "a larger Armor reduction". **This file is what
those adjectives mean.**

Rule for this document: *no adjective without a number.* If a power says
"small", the table below says what small is.

---

## The magnitude scale

Three bands, indexed off the tier of the power applying the effect. A power that
needs to deviate says so explicitly, per the convention in `01-stats.md`.

| Band | Tiers | Stat change | Shield | DoT tick | Duration |
|---|---|---|---|---|---|
| **small** — *"small", "slightly", "briefly"* | 1–2 | **±10** | Might × 1.0 | Might × 0.25 | **2 turns** |
| **moderate** — *"a few turns", unqualified* | 3 | **±15** | Might × 1.5 | Might × 0.35 | **3 turns** |
| **large** — *"larger", "stronger", "longer"* | 4–5 | **±20** | Might × 2.0 | Might × 0.50 | **3 turns** |

*"…lasts one turn longer"* — Cindara's **Banked Coals**, Marisel's **Wears
Through**, the Water House rider — adds **+1 turn** to the duration, not to the
magnitude.

**Why ±10 / ±15 / ±20.** Base stats sit between 15 and 45 against a cap of 75,
so headroom above a typical stat is about 35 points. A large buff spends roughly
half of it — enough to feel decisive, not enough to make one buff the whole
build. A small buff at ±10 moves a 30-point stat by a third, which is visible
without being a swing.

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
sticks if   d100 + potency  >  d100 + Resolve      # ties go to the defender
```

**Potency is derived from the tier of the power applying it.** No per-power
authoring, and it self-balances — a rider on an ultimate is genuinely harder to
shrug off than one on a tier-1 poke, which is part of what the longer cooldown
buys.

| Tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **Potency** | 20 | 30 | 40 | 55 | 70 |

Against `Resolve` 25 that runs from about 46% to 78%; against `Resolve` 40, from
40% to 75%.

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

Buffs and debuffs to any of the ten stats, at the magnitudes above. `Speed`
buffs are the exception: **`Speed` is granted as a percentage, never as flat
points** (`01-stats.md`), because a flat +10 would be worth +67% to a Speed-15
hero and +29% to a Speed-35 one, and the tier-3 Air power is a self-buff whose
four owners span almost that whole range.

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
