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
for two reasons. It makes an area power *stronger* as enemies die, which is
backwards; and a per-head number that shrinks with the target count makes the
multiplier column unreadable, since the same figure would mean something
different on every row.

> **A correction.** This decision was originally argued on the grounds that
> mitigation is *subtractive*, so each split fragment would floor at minimum
> damage. Mitigation is now **percentage-based** (`01-stats.md`), and that
> argument no longer holds — a split fragment would scale down cleanly rather
> than flooring. The decision stands on the two reasons above; the original
> reasoning was superseded.

Total output lands around 1.4× a single-target power of the same tier. Note that
a per-target multiplier makes a hero like Grieve look weak in a
damage-per-turn table — his output is spread across a row, and the table counts
one head.

---

## Healing

**Healing scales off `Might`,** like everything else. `Might` is deliberately
type-agnostic and is the only offense stat, so a heal has no other anchor.

### How a heal resolves

A heal moves a number against a pool, and that is *all* it shares with an
attack. It runs a short path of its own:

| Step | Applies to a heal? |
|---|---|
| **Reach** | **Yes** — one rule, no exceptions (`02-squads.md`) |
| Evasion roll | **No** — an ally never dodges a heal |
| Mitigation | **No** — the target's own Armor never blunts it |
| Type effectiveness | **No** — friendly powers are never resisted |
| `Resolve` contest | **No** — same reason |
| Crit | **Yes** — a heal can spike, at the healer's own `Luck` |
| The 25% floor | **No** — the floor is a guarantee about hits |

> An earlier draft of this file said a heal *"runs the Defense phase exactly as
> an attack does."* Read literally that meant a heal rolled against the ally's
> `Agility` to land and was then reduced by that ally's own `Armor` — both
> absurd. The table above is what was meant.

Healing is capped at the target's maximum HP; overheal is simply lost.

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

## Payload and rider

**Settled 2026-07-27.** Phase 4 runs *per target*, which raised the question of
what a power's extra effects do when the power hits several enemies. The answer
needs one distinction the documents had not drawn:

| | What it is | Targeting |
|---|---|---|
| **Payload** | What the multiplier buys — the strike, the heal, or on a few powers the effect itself | May be single- or multi-target, as authored |
| **Rider** | An extra effect attached to a payload | Follows **whatever the payload hit** |

> **A rider whose target is the *caster* resolves once per cast.** Riders aimed at
> whoever the payload struck resolve per target, unchanged.

That is the whole rule, and it is the minimal one. A burn applied across three
enemies is three burns on three heroes — correct and intended. **The
multiplication only misfires when the rider's target is the same entity N times,
which is exclusively a self-rider**: a +15 `Armor` buff on a three-target power
would otherwise land as +45.

### Why not the broader rule

*"Riders hit only the primary target, on offensive powers"* was considered and
rejected on evidence. Checked against all 11 multi-target powers:

- **No multi-target damage power carries a target-side rider at all.** The only
  riders on them are self-buffs — Grieve's `Clear the Room` (Armor) and
  `The Wide Reaping` (Toughness). For every offensive *strike*, the broad rule and
  the narrow one agree.
- **Two tier-5 ultimates break under it**, and both are offensive, so an
  offensive/defensive carve-out does not save them. Umbriel's **`The Undoing`** is
  *"no direct damage, strips all active buffs from every enemy"* — the ×5
  multiplier buys the mass strip and nothing else. Lucen's **`The Unhidden Hour`**
  cleanses the whole squad and strips every enemy. `05-status.md` describes a
  strip as *"contested against `Resolve` like any rider"*, so if strips are
  riders, the broad rule reduces both ultimates to single-target and guts them.

**That is exactly what the payload/rider split resolves.** Those strips are
payloads, not riders — they are what the power *is*. `Clear the Room`'s Armor buff
is a rider, because the damage is the payload. Same word, two different jobs, and
the distinction has to be in the content schema rather than left to a reader's
judgement.

**Nothing in the current roster changes under this rule.** 11 powers are
multi-target and 19 carry self-buffs, and **none is both** — so the rule is being
set while it is still free to set, before a power gets authored against an
assumption nobody wrote down.

---

## Acting outside your own turn

Two mechanics let a champion act when it is not its turn. Both are now bounded by
rules that already exist rather than by numbers chosen for the purpose.

### Reactions — **settled**, see `04-turns.md`

A reaction **fires on an evaded attack**, and **"reactive" is a property of the
power, not a stance a champion adopts**. Full reasoning in `04-turns.md` →
*Reactions*, along with the finding that **no reactive power exists in the
roster**, which leaves Silka's `Already Gone` and Hettamar's `Nothing to Discuss`
as two dead unique passives.

### Silka's bonus action — bounded by reach

> **`Quicker Than Told` chains as many times as there are enemies in reach.**

Settled 2026-07-27, replacing an arbitrary cap of two. The bonus action still
runs phases 2–4 only — no cooldown tick, no Upkeep — and still requires the kill:
*"Silka acts again immediately if the target is defeated."*

**The bound derives the old number instead of asserting it.** Silka is `Might` 40
and therefore **reach 1**, so she must occupy a front slot — from the middle seat
a reach-1 champion reaches only its own front line and cannot attack at all. At
full formation she reaches exactly one row, and the 2/3/1 formation makes that
two champions:

| Board state | What she reaches | Chain cap |
|---|---|---|
| Full formation | enemy front row | **2** |
| Enemy front row wiped | enemy middle row | **3** |
| Front and middle gone | enemy back seat | **1** |

So the cap is two at the opening — exactly the figure it replaces — and *grows*
as the enemy line collapses, because `02-squads.md` skips fully empty rows. It
rides the *a squad gains reach as it loses heroes* dynamic rather than needing a
rule of its own, and it is learnable in one sentence: **as many times as there
are enemies you can reach.**

**It rarely binds.** The bonus action does not tick cooldowns, so
`Quicker Than Told` itself is never available on it — links two and three run on
whatever else is off cooldown, realistically `Seamfinder` at ×1, which is 40 raw
damage before mitigation. Killing twice more with that needs two enemies already
at execution range and in reach. This is a legibility fix, not a balance one.

> **A multi-target version was considered and rejected.** Giving the power an
> independent hit roll per target in reach would insure it against a single bad
> accuracy roll — a real problem, since phase 3 resolves per target and
> multi-target powers therefore cannot whiff entirely. But the roster prices
> multi-target *below* single-target: `The Current Takes All` is **×2.5 for three
> targets**, so a ×5 across three would be 600 raw against its 200 and the
> multiplier would have to fall to about ×2.5. Losing the kill trigger and the
> burst on top of that converts Silka from an assassin into a cleaver, which sits
> badly with Pierce and with a kit built on `Thread the Guard`, `Already Behind
> You` and `Seamfinder`. **The variance asymmetry is roster-wide** — it hits
> `Avalanche` and every other long-cooldown single-target ultimate — so it
> belongs to the hero-numbers pass rather than being fixed on one hero.

---

## Open
- ~~**Rider magnitudes are unwritten.**~~ **Written** — `05-status.md` indexes
  every magnitude, duration and potency per tier.
- ~~**The pool formula.**~~ **Written** — `HP = Toughness × 50` in `01-stats.md`.
  Note the packet it was fitted against has since changed: `Luck` has been
  removed from the damage formula, so a packet is now `Might × multiplier` alone
  and battles run about 28% longer. That was checked against the tier-4 and
  tier-5 gates below and they still fire — more often, in fact — but any future
  change to the curve has to be re-checked the same way.
