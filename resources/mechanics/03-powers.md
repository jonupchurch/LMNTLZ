# LMNTLZ · Mechanics 03 — Powers

Every hero has **nine** things: six active powers and three passives.

The authored data lives in
[`../characters/hero-stats.xlsx`](../characters/hero-stats.xlsx) — the *Powers*
sheet is the per-hero grid, *Power List* is one row per distinct power with its
multiplier, cooldown and effect. **127 distinct powers**: 87 active, 40 passive.
This file records the rules those numbers obey and why they are what they are.

---

## The six active powers

Powers share along three axes, which is what lets 27 heroes have 162 power slots
from only 87 distinct powers.

| Tier | Shared by | Distinct | Multiplier | Cooldown |
|---|---|---|---|---|
| **0** | primary type — the *auto-attack* | 9 | 1.0 | 0 |
| **1** | primary type | 9 | 1.5 | 1 |
| **2** | primary type | 9 | 2.0 | 2 |
| **3** | **secondary** type | 6 | 2.5 | 3 |
| **4** | unique to the hero | 27 | 3.5 | **4–7** |
| **5** | unique to the hero | 27 | 5.0 | **6–9** |

Only six distinct tier-3 powers exist, not nine: melee heroes always take an
arcane secondary, so no martial type ever appears in that slot.

### The curve is monotonic on purpose

Damage is `Might × multiplier`, and the value of a power is its multiplier
spread over its cooldown. An earlier curve of 1.0 / 1.5 / 1.75 / 2.0 / 4.0 / 5.0
collapsed into **three flat bands** once cooldowns were counted — tiers 1, 2 and
3 all returned 1.25 damage per turn, tiers 4 and 5 both returned 1.50. Climbing
a tier cost a longer cooldown and bought nothing.

The current curve gives a strict ramp: **1.00 / 1.25 / 1.33 / 1.38 / 1.42 /
1.50** damage per turn. Every step up is worth taking.

### Cooldowns are integers, and they vary per hero

Cooldowns count **the owner's own turns** and tick in the Resolution phase
(`04-turns.md`). They are always whole numbers.

> **Fractional cooldowns are not allowed.** In a discrete turn system a
> fraction can only mean round-up (identical to an integer) or a carried
> remainder that alternates 2, 3, 2, 3 — and an alternating cooldown is
> unreadable in a ring that displays *turns remaining*, and unplannable for the
> defense AI. Fractional **multipliers** are fine: they resolve to a damage
> number immediately and carry no state.

The shared tiers 0–3 take one cooldown each, because the power itself is shared.
**The 54 unique powers vary per hero**, indexed off the owner's `Speed` band —
fast heroes cycle their signature powers sooner, heavy hitters wait:

| Owner Speed | Tier 4 | Tier 5 |
|---|---|---|
| 45, 35 | 4 | 6 |
| 30, 25 | 5 | 7 |
| 15 | 6 | 8 |

Multi-target powers take **+1** on top. This is the cheapest lever that makes 27
heroes play at different tempos without touching a single multiplier — Boldrek's
*Avalanche* waits 8 turns, Silka's *Quicker Than Told* comes back in 6.

### Tiers 4 and 5 are gated at the start

**Tier 4 is unavailable until turn 3; tier 5 until turn 5.** Everything else is
ready when the battle opens.

Without this, every battle opened with both sides firing a ×5 — 225 raw damage
from a Might-45 striker before anyone else moved — and since `Speed` sets
initiative, whoever acted first landed the biggest hit in the game unanswered.
The gate gives the House powers an early game to matter in and makes an ultimate
a payoff rather than an opening move. Tiers 0–3 are all available on turn 1, so
there are still four real choices on the first turn.

### The auto-attack has a job again

Under the earlier numbers, greedy play produced one fixed rotation —
P5 → P4 → P3 → P2 → P1, forever, identical for all 27 heroes — and **tier 0
never fired at all**. Nine named powers that never appeared.

With the current cooldowns the auto-attack fires **4–10% of turns** depending on
the hero, and no two heroes share a rotation. It is also the only power usable
while silenced.

---

## Multi-target powers

**A multi-target power resolves per target, at a reduced multiplier.** Each
target takes the listed number in full; the number is smaller than a
single-target power of the same tier to pay for the breadth.

| Power | Targets | Tier | Multiplier |
|---|---|---|---|
| Two Rivers Meeting | 2 | 4 | 2.5 |
| Clear the Room | one row | 4 | 1.75 |
| The Current Takes All | 3 | 5 | 2.5 |
| The Wide Reaping | one row | 5 | 2.5 |

The alternative — dividing one multiplier among the targets hit — was rejected
because **mitigation is subtractive**. A ×4 split six ways is ×0.67 each, which
against Armor 40 floors at 1 damage; splitting would also make an area power
*stronger* as enemies died. Per-target keeps every hit meaningful.

Total output lands around 1.4× a single-target power of the same tier. Note that
a per-target multiplier makes a hero like Grieve look weak in a
damage-per-turn table — his output is spread across a row, and the table counts
one head.

---

## Healing

**Healing scales off `Might`,** like everything else. `Might` is deliberately
type-agnostic and is the only offense stat, so a heal has no other anchor.

A heal runs the **Defense phase** exactly as an attack does — it is the same
operation with the sign reversed — and is **reach-limited exactly as an attack
is**, per the single reach rule in `02-squads.md`.

All healing in the game sits in the three Buffers' tier-4 slot, one at each
scale:

| Hero | Power | Scale | Multiplier |
|---|---|---|---|
| Umbriel | *Unmake the Wound* | single target | 3.5 |
| Cirrolan | *Fair Weather* | one row | 1.75 |
| Lucen | *Enough Light for Everyone* | whole party | 1.0 |

Each replaced a redundant second buff-strip or speed-buff, so no hero lost
anything distinctive.

### Powers with no number at all

Three powers deal neither damage nor healing — *Whisper from the High Reach*,
*The Unhidden Hour*, *The Undoing*. They **skip the Defense phase entirely** and
are contested and enacted together in phase 4 (`04-turns.md`). Their multiplier
cell is **blank, not zero**: zero would read as "deals no damage", when the truth
is that damage is not a thing these powers have.

---

## The three passives

Every hero has three, one per sharing scope. **Each scope is a different kind of
effect**, which is the constraint that makes three always-on effects per hero
workable — three flat stat bonuses would have inflated the 300-point budget
invisibly and stacked into nonsense.

| Scope | Count | Kind of effect |
|---|---|---|
| **Role** | 4 | Positional and tempo — rows, reach, durations |
| **House** | 9 | The Force's mechanical signature |
| **Unique** | 27 | A conditional trigger, never a flat number |

The real complexity is lower than 40 suggests: a player learns 4 role rules and
9 House rules once and reuses them across the whole roster.

### Role passives

| Role | Passive | Effect |
|---|---|---|
| Striker | **Finish It** | Bonus damage below half pool |
| Tank | **Hold the Line** | Row-scoped **taunt** |
| Ranged | **Measured Shot** | Bonus damage at distance 2 |
| Buffer | **Behind the Line** | Permanent **fade** |

Until now `Role` had no mechanical existence at all — it set the stat budgets
and then vanished. These give it teeth.

**Tanks and Buffers are each other's counter**, which falls out of a rule already
settled rather than being designed in. Taunt and fade **cancel on the same
hero** (`04-turns.md`), so:

> **Fade an enemy tank** and its taunt switches off — it stops compelling anyone.
> **Taunt an enemy buffer** and its fade switches off — it is dragged into the
> open and can be targeted normally.

Both passives are bounded by the targeting invariants. Hold the Line is scoped
to the tank's own row, so it never locks down the whole board, and an attacker
that cannot reach the tank chooses freely. Behind the Line is self-limiting: once
the buffer is the only thing an attacker can reach, the filter would empty the
candidate set and is ignored.

### House passives

One per primary type, each the Force's signature: Earth shortens control on
itself, Air gains Agility after being missed, Fire's burns escalate per tick,
Water's mitigation shreds persist, Dark feeds on nearby deaths, Slash bleeds on
crit, Pierce sharpens against a repeat target, Crush shaves Armor cumulatively.

**Light's is the one that matters structurally.** *Nothing Stays Hidden* lets a
Light hero **ignore fade** — a faded enemy is targetable without clearing the
unfaded heroes first. It is the only passive that reaches into the targeting
pipeline, and it makes Light the answer to a fade-heavy squad.

### Unique passives

27 conditional triggers, one per hero. Five hook mechanics settled alongside
them: **Mauless** cannot be compelled by taunt, **Silka** cannot be the target of
a reactive power, **Hettamar** denies reactions to anyone he damages, and
**Kaellis** and **Marisel** are exact inverses — Kaellis gains damage on a target
he has *not* yet struck, Marisel on one she *has*. The same board rewards them
differently, which is the differentiation `01-stats.md` says powers exist to
carry.

---

## Stacks

Marisel is the only hero with a stacking resource, and it has **one source**.

> **Reckoning.** Her passive *It All Comes Back* adds a stack to a target each
> time she damages it. Tier 4 *Your Own Past, Rising* **reads** the stacks and
> scales with them without consuming them. Tier 5 *Drown in What You Did*
> **spends** every stack for a finishing burst.

The passive banks, tier 4 reads, tier 5 spends — one mechanic in three
expressions. Any future stacking resource should follow the same shape: exactly
one thing that generates it, stated on the generator.

---

## Open

- **Once-per-cast riders.** Phase 4 runs per target, so a power needing a single
  flat self-buff has to declare it. Whether that is a per-power flag, a separate
  rider category, or a blanket rule that self-targeted riders resolve once.
- **Reaction details.** Whether a reaction fires on an *evaded* attack, and
  whether "reactive" is a power property or a stance a hero adopts. The second is
  the more interesting: defense is otherwise entirely engine-run, so a reactive
  stance would be the first defensive decision a player makes.
- **Silka's bonus action needs a UI story.** It runs phases 2–4 only — no
  cooldown tick, no upkeep — and chains to a maximum of two, so up to three
  attacks in one turn. The cap is arbitrary and has to be learnable from
  somewhere.
- **Rider magnitudes are unwritten.** Every tier 1–3 rider says "slows",
  "worsens accuracy", "shreds mitigation" without a number. They cannot be
  specified until `05-status.md` defines what those effects *are*.
- **The pool formula.** At an average of ~2.5× `Might` per turn, a Toughness-40
  hero needs a pool of roughly `Toughness × 14` to survive five turns of a single
  attacker. The multipliers have effectively already chosen it; `01-stats.md`
  still has to write it down.
