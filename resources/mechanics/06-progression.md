# LMNTLZ · Mechanics 06 — Progression

What a player earns, and what they spend it on.

This document exists because LMNTLZ deleted the usual answer. **All 27 heroes are
unlocked from the start and identical for every player** — nothing to collect, so
nobody can out-roster anybody. That is the game's central promise, and it means
the standard progression loop (earn heroes, level them, out-scale your opponent)
is unavailable by design rather than by omission.

Everything below is built to give a player something real to earn **without ever
giving them a higher ceiling than the person they are matched against.**

---

## Rune Shards

> **Shards are the only currency, and runes are the only thing that touches
> power.**

- **Rune Shards** are earned from play — battles, holds, guild events.
- Shards are spent to **build a custom rune**, authored by the player rather than
  dropped at random. No gacha, no rarity roll, no duplicates to sift.
- A rune is **tailored to the hero it is built for** and is **placed on that hero
  permanently**. It cannot be removed.
- A placed rune **can be replaced** — and replacing it **destroys the original**.

That last rule is the whole design. Everything else follows from it.

### Why destruction on replacement is the load-bearing rule

A capped power system has an obvious failure: once a player finishes their kit,
the currency becomes worthless and the reward loop dies. The usual fixes are all
bad — raise the cap (power creep), add rarity tiers (a second ceiling), or make
the last 10% take a year (a grind wall).

Destruction on replacement solves it without any of those:

| | Effect |
|---|---|
| **Power** | Bounded. A fully-runed hero is a fully-runed hero — there is no "more" |
| **Sink** | Unbounded. Every re-spec costs full price |
| **Demand** | Driven by the **meta moving**, not by the player falling behind |

When the type chart's pressure shifts, or a balance patch moves a multiplier, or
a player simply wants to answer a squad they keep losing to, they **rebuild** —
they do not out-scale. The currency stays valuable forever and power never
inflates. A veteran and a newcomer who both field a fully-runed six are fielding
equally strong sixes.

**This is what makes *planning over paying* a rule rather than a slogan.** Placing
a rune badly is a real, permanent cost paid in the same currency as everything
else. The decision has weight because it cannot be undone cheaply, which is
exactly what makes it a decision.

---

## What a rune is

Every rune has the same four components, and each is bought separately:

| Component | Grants | Cost |
|---|---|---|
| Major boost | **+20** to one stat | 150 shards |
| Minor boost | **+10** to one stat | 150 shards |
| Trace boost | **+5** to one stat | 150 shards |
| **Utility slot** | one effect from the shared menu | **200 shards** |
| | **35 stat points + 1 effect** | **650 shards** |

**Three runes per hero**, which is a deliberately conservative starting point —
see *Room left over* below.

- **The three boosts may target any stats, including the same one.** There is no
  distinctness rule — the 75 cap is the only constraint. See below.
- **A rune is built in stages, in order** — major, then minor, then trace, then
  utility. Each stage is bought separately and is permanent once placed.
- **The utility slot is gated behind all three stat boosts.** An effect is what
  *completing* a rune buys.

### Design is free; committing is what costs

Each stage is assembled in a builder — pick the stat, or pick the utility — and
the player sees exactly what it does to that hero, computed by the shared rules
half of `packages/sim` with no server round trip. **Nothing is spent and nothing
is permanent until the player commits that stage.**

That is *planning over paying* as literal interface: **planning is free and
unlimited, paying happens once and is final.**

**Destruction is per rune, not per component.** Replacing a rune destroys
everything placed in it, whatever stage it had reached.

> **There is no piecemeal editing.** A player cannot swap the second stat, or
> trade one utility effect for another, or reclaim the trace boost. The only
> operations are *advance to the next stage* and *destroy and start over*. A
> stage-4 rune that needs one stat changed costs the full 650 to rebuild.

### Why staged rather than all-or-nothing

An earlier draft made a rune **atomic** — all four components for 650 or nothing
— on the reasoning that staged building would be exploited. Because every stage
costs a flat 150 regardless of size, the major boost is far and away the best
value at **7.5 shards per point against 12.9 for a complete rune**, so the
efficient play is to buy *only* majors across every slot on every hero and never
finish one.

**That reasoning was wrong, and staged building is better.** Breadth-first is not
an exploit to be designed out — it is a legitimate path, and gating the utility
slot turns it into a progression arc: spread wide, then deepen, then unlock
effects. Two things fall out that atomic runes cannot deliver.

**It creates a real strategic axis.** The same budget goes two ways:

| 7,800 shards on… | Result |
|---|---|
| **Breadth** — 52 major boosts | ~18 heroes at **+60 points each**, no effects |
| **Depth** — 12 complete runes | 4 heroes at **+105 with 3 utility effects each**, the rest bare |

A six-hero squad built breadth-first fields 360 stat points spread evenly. Built
depth-first it fields 420 points on four heroes plus twelve utility effects, with
two heroes contributing nothing. **Neither is obviously correct.** Atomicity
deletes the choice — every purchase becomes all-or-nothing and there is only one
way to spend.

> **Utility effect power is the dial that balances the two paths.** It is the
> only thing deciding whether depth beats breadth, so the menu's power level is
> a balance decision rather than a flavor one. Write it knowing that.

**It makes early mistakes cheap.** A new player who commits twelve major boosts
and then learns the game has **1,800 shards** at risk; under atomic runes the
same twelve misplacements cost **7,800**. The decisions made while a player
understands least are the ones that cost least — the right shape for a system
where every placement is permanent.

### The pricing is a diminishing-returns curve in disguise

Charging a flat 150 for each of three unequal boosts means the marginal cost of a
stat point rises steeply:

| Boost | Cost | **Shards per point** |
|---|---|---|
| +20 | 150 | **7.5** |
| +10 | 150 | 15.0 |
| +5 | 150 | **30.0** |
| *full rune, 35 points* | *450* | *12.9* |

That is the same shape as the mitigation curve and the turn accumulator — the
`README.md` bounded-formula rule applied to the **economy** rather than to
combat. Squeezing out the last few points costs four times what the first twenty
did, so a player spreads across heroes rather than perfecting one.

### The 20-point boost is sized exactly against the cap

The tightest stat anywhere on the roster has **30 points of headroom** — `Might`
and `Speed` on a handful of heroes. So:

> **A single +20 boost can never overflow. Two of them on the same stat always
> can.**

The 75 cap therefore creates spreading pressure without ever forcing a player to
waste a purchase they have already made. That is the good version of a cap: it
shapes the decision rather than punishing it after the fact.

### Room left over

| | Stat total |
|---|---|
| Mean hero base | 289 |
| After 3 runes (+105) | **394** — a 36% gain |
| Theoretical maximum (10 × 75) | 750 |

Three runes reaches **53%** of the ceiling and leaves **356 points** unclaimed,
so a fourth or fifth slot remains available as a later lever without any formula
moving. Starting at 3 is cheap to expand and expensive to walk back.

### The boosts may stack on one stat — the cap is the only rule

There is **no distinctness requirement**. All three boosts may target the same
stat, and that is a feature rather than a tolerated case.

**It cannot be abused, because the cap binds first.** Mean headroom is 46 points
per hero-stat, so a single stat absorbs about **1.3 runes' worth** before waste —
0.86 at the tightest, 1.71 at the loosest. Pouring three runes into `Might` is
physically impossible. The 75 cap does the limiting, which `01-stats.md` says is
its job.

**And stacking creates exact fills, which are the most satisfying thing a rune
can do:**

| Stack | Lands precisely on 75 for | Examples |
|---|---|---|
| **20+10+5 = 35** | **50 of 270 hero-stat pairs** | Bramwen `Perception`, Ossic `Toughness`, Ossic `Luck` |
| **20+10 = 30** | **7 pairs** | Bramwen, Zephyrine, Ember Saelith `Might` |

Those 7 at 30 are precisely the tightest stats on the roster, so every one of
them has a perfect 20+10 answer. A distinctness rule would forbid all **57**
exact fills and force a player to spend two runes' slots to max a single stat.

It also **rescues the trace boost.** At 30 shards per point the +5 is the worst
value in the game, and under a distinctness rule it is a throwaway third stat.
Allowing stacking makes it frequently the component that *completes* an exact
fill — the worst-value component earning the best moment.

A full 35-point stack fits **263 of 270** pairs; the 7 that overflow are the
player's informed choice, shown by the live preview before they commit.

### Utility: one pool per slot, typed by element

**A hero's three rune slots are not interchangeable.** Each is bound to a
different pool of utility effects:

| Slot | Pool | Every hero gets |
|---|---|---|
| 1 | the hero's **primary** element | one elemental effect, always |
| 2 | the hero's **secondary** element | one elemental effect, always |
| 3 | **common** | one universal effect, always |

Ten pools in total — nine elemental plus one common — at roughly 3–4 effects
each, so about **35 effects to author**.

**All 27 heroes have a distinct `(primary, secondary)` pairing**, so this gives
every hero a **unique rune signature at no authoring cost**: Bramwen is
Earth/Fire/Common, Vantric is Pierce/Air/Common, Boldrek is Crush/Light/Common,
and no two read alike.

Two alternatives were worked through and dropped:

- **Per-hero utility options**, tied to each hero's own powers. Rejected on scope
  — 27 heroes × ~3 is **81 effects**, a fourth passive layer the size of the 40
  passives already written — and on principle: hero identity already has a home
  in 6 powers and 3 passives each.
- **One shared menu available in every slot**, with elemental effects layered
  alongside. Rejected because it makes elemental identity *opt-in*: a player who
  rates the shared effects highly fills all three slots from the shared menu and
  never touches an element. Giving the common pool **one dedicated slot** instead
  guarantees engagement with both elements *and* a universal baseline, and no
  element pairing can leave a hero without a floor.

#### The martial pools are under-used, and that is fine

No martial type is ever anyone's *secondary* — the derivation rule forbids
melee+melee pairings — so the three martial pools are only ever reached through a
primary slot:

| Pool | As primary | As secondary | Slots across the roster |
|---|---|---|---|
| Light, Dark | 3 | 6 | **9** |
| Earth, Air, Water | 3 | 4 | 7 |
| Fire | 3 | 3 | 6 |
| **Slash, Pierce, Crush** | 3 | **0** | **3** |

That is a 3× spread, and it is **content reuse rather than fairness** — every
hero gets exactly one primary-pool effect regardless. A Slash effect is simply
seen in three places on the roster where a Dark effect is seen in nine. The
practical consequence when the pools get written: **the martial pools can be
smaller than the arcane ones without anyone noticing.**

*(A 2-primary / 1-secondary split was considered, which halves this to a 2×
spread and mirrors the type chart's own weighting of primary over secondary. It
was dropped in favour of guaranteeing every hero a common slot.)*

#### Two things to watch when the pools are written

- **Volume.** Three runes × six heroes is **18 utility effects per squad**, and
  both sides field them — so up to 36 are live in a battle, on top of 36 powers
  and 36 passives. "Significant" has to be weighed against a battle screen that
  already carries twelve hero chips.
- **Pricing.** A utility slot costs 200 against 150 for twenty stat points. If
  the effects really are significant that is cheap, and every player completes
  every rune before starting a new one. Price and power level have to be set
  together — and utility power is also the dial that balances breadth against
  depth (see above), so it is doing two jobs at once.

---

## What a utility effect is

**Every effect is conditional.** None is a flat always-on bonus — that is what
the 35 stat points are for. The condition takes one of three shapes:

| Shape | Example | Fires per battle | Built from |
|---|---|---|---|
| **Trigger → persistent** | below 50% HP → +20 Might for the rest of the battle | ≤ 1 | `05-status.md` vocabulary |
| **Per-attack chance** | 25% → +1 reach this turn | ~3 | needs a turn-start roll |
| **Ward / charge** | ignore the first Stun or Silence | ≤ 1, consumed | `05-status.md` vocabulary |

**Triggers fire once, but their consequence lasts the rest of the battle.** That
is forced by two numbers pulling opposite ways. A 6v6 runs roughly 155 hero-turns
across 12 heroes, and 36 rune effects are live in it — so anything that re-arms
on a short cooldown puts a proc on nearly every turn:

| If an effect… | Firings per battle | Cadence |
|---|---|---|
| fires **once** | 36 | 1 per 4.3 turns |
| re-arms every 6 turns | ~72 | 1 per 2.2 turns |
| re-arms every 4 turns | ~108 | **1 per 1.4 turns** |

But a single once-per-battle *burst* cannot justify the price. 200 shards has to
beat 150 for a fresh +20 elsewhere, and +20 `Might` on a `Might` 30 hero is +67%
on every packet for all 13 of its turns — one proc would have to be worth **8.7
turns of that hero's output**. Persisting the consequence gets both: one readable
moment, ongoing weight. It costs one extension to `05-status.md` — a duration
class beyond the 4-turn ceiling, applicable only to rune effects — and that is a
feature, since it is what makes a rune feel unlike a power rider.

> **Probabilistic effects must grant *capability*, not *magnitude*.** A 25%
> chance of more damage is worth exactly 25% of that damage and always loses to a
> flat stat. A 25% chance to reach a target you otherwise cannot is not a
> fraction of anything. Every per-attack effect below grants access, control or
> negation — never a bigger number.

Across a rough even mix of the three shapes, a battle carries **~63 effect events
over ~155 hero-turns — one every 2.5 turns.** That holds because per-attack procs
leave no lasting state and wards are silent: a debuff simply does not apply.

### The utility slot is a bad buy early and a good buy late

That is the stage gate justifying itself economically rather than thematically.
The stat stages have rising marginal cost — 7.5 shards/point at stage 1, 15 at
stage 2, 30 at stage 3 — so what 200 shards competes against depends entirely on
how deep a player already is:

| Cheapest alternative available | 200 shards buys instead | Bar for utility |
|---|---|---|
| +20 for 150 — an empty slot somewhere | 26.7 points | very high |
| +10 for 150 — stage 2 | 13.3 points | moderate |
| +5 for 150 — stage 3 | 6.7 points | low |

Everything in the catalog is tuned to roughly **10–20 stat points of value** —
above the late bar, below the early one. A player who bought utility first would
be making a mistake, and the gate prevents it.

---

## The utility catalog

**33 effects: 6 common, 3 per element.** Pool size was set by where the return on
authoring collapses. If an effect independently suits a given hero with
probability *p*, the chance a pool holds *something* wanted is `1 − (1−p)ⁿ`:

| Effects per pool | p = 0.4 | p = 0.5 | Elemental sink realized |
|---|---|---|---|
| 1 | 40% | 50% | 5,400 of 10,800 shards |
| **3** | 78% | **87.5%** | **9,450** |
| 4 | 87% | 93.8% | 10,125 |
| 9 | 99% | 99.8% | 10,778 |

*(Sink = 27 heroes × 2 elemental slots × 200. An unwanted effect is simply never
bought.)* Going 1→3 recovers ~4,000 shards of sink; 3→9 recovers another ~1,300
for six times the authoring. **A fixed single effect per pool is the option to
avoid** — it strands half the elemental sink. The martial pools settle it
further: Slash, Pierce and Crush are reachable from only 3 slots on the whole
roster, so a 9-effect martial pool would carry six effects no player ever sees.

Each element offers **one offensive, one defensive, one tempo** effect, so the
choice is made on what the hero does rather than on which effect is strongest.

### Common pool — one of six, every hero, slot 3

| Name | Condition | Effect | Role |
|---|---|---|---|
| **Before the First Blow** | battle start · 100% | Gain a shield worth 30% of max HP | def |
| **Cornered** | first time below 50% HP | +20 `Might`, rest of battle | off |
| **The Point Proven** | first Bane hit you land | +10 `Penetration`, rest of battle | off |
| **Not This Time** | ward, one charge | Ignore the first **Stun or Silence** applied to you | def |
| **Take It Back** | 25% per attack | Strip one active buff from the target | tempo |
| **The Line Shortens** | an ally falls | +15 `Speed`, rest of battle | tempo |

`Not This Time` names a *class* rather than taking whatever lands first.
Magnitudes run 1–5, so an untargeted "ignore the first debuff" is spent on a
minor tick roughly 60% of the time and the Stun three turns later lands anyway.
Stun and Silence are the two that cost an entire action.

### Elemental pools — one of three, slots 1 and 2

| | Offense | Defense | Tempo |
|---|---|---|---|
| **Earth** | **Made Heavy** — Bane hits you land permanently cost the target 10 `Speed` | **Weight Tells** — below 50%: +20 `Armor`, +20 `Magic Resist`, and you cannot be moved from your row | **All One Piece** — you cannot be critically hit |
| **Air** | **On the Same Breath** — on a killing blow, act again immediately | **Harder to Follow** — first Bane hit taken: +20 `Agility` | **Further Than It Looks** — 25% at turn start, +1 reach that turn |
| **Fire** | **It Spreads** — killing blow: +15 `Might`, stacks 3× | **Too Close** — when struck, the attacker takes 15% of the packet | **The Draft** — your damage-over-time effects tick again when you act |
| **Water** | **Runs Dry** — Bane hits you land halve the target's next heal | **It Passes Through** — the first debuff applied is cleansed at end of turn, +20 `Resolve` | **Draws It Up** — healing you receive is increased by 40% |
| **Light** | **Held in the Light** — enemies below half HP cannot dodge your attacks | **Nowhere to Stand** — enemies cannot conceal or become untargetable against you; +10 `Perception` | **The Lamp Lifted** — the first ally to fall cleanses all debuffs from every survivor |
| **Dark** | **Before It Knew** — your first attack against a target that has not yet acted deals double | **No One Saw** — below 50%: untargetable until your next turn | **It Lingers** — debuffs you apply last one turn longer |
| **Slash** | **Again, There** — consecutive attacks on the same target deal +10% each, resetting on switch | **Both Ways** — when struck, 25% to apply a magnitude-2 bleed to the attacker | **It Stays Open** — damage-over-time you apply cannot be cleansed or reduced |
| **Pierce** | **The Way In** — +15 `Penetration` against any enemy you have already struck | **Turned Aside** — the first critical hit against you lands as a normal hit | **Straight Past** — your attacks ignore shields |
| **Crush** | **Knocked Loose** — 15% per attack to attempt a **Stun** at tier-3 potency, contested by `Resolve` | **The Floor Comes Up** — below 50%: Stun every enemy in reach for 1 turn | **Stays Broken** — mitigation shred you apply cannot be cleansed and lasts the battle |

Three notes on specific entries:

- **`Further Than It Looks` is the strongest effect in the catalog**, and it is in
  the Air pool deliberately. At full formation +1 reach is worth 1.2× on a
  front-seat reach-2 hero but converts *cannot attack at all* into a real target
  list from the middle and back seats — see the table in
  [`02-squads.md`](02-squads.md). It manipulates the formation rule rather than a
  stat, so it needs a home with real opportunity cost. **The roll happens at turn
  start and is shown before the player chooses**, which makes it a decision
  rather than variance applied to a decision already made.
- **`It Spreads` stacks to exactly +45**, which takes a `Might` 30 hero to 75 —
  precisely the stat cap. The ceiling is meant to be legible.
- **`Knocked Loose` routes through the existing potency-versus-`Resolve` landing
  system**, which finally gives `Resolve` a job. It is currently the least
  exercised of the ten stats.

Two pairs are deliberate counters, which is what should drive rebuying as the
meta moves: Light's `Nowhere to Stand` answers Dark's `No One Saw`, and Pierce's
`Straight Past` answers `Before the First Blow` — likely the most-taken common
effect.

> **All 33 names were checked against the 127 entries in the workbook's `Power
> List` sheet** (which contains the 40 passives as a subset). No exact collisions
> and no two-word near misses. This matters because the generated Rune Forge
> screen proposes ~23 effects of which **eight collide exactly** with existing
> power names — its ideas are worth mining, its names are not.

> **The magnitudes are placeholders in the same sense the hero numbers are.**
> Every entry is in the 10–20-stat-point band by estimate, but 30% of max HP
> versus 25%, or 25% versus 20% on the Air roll, are questions only
> `packages/sim` answers. The shapes are the decision; the constants are a tuning
> pass.

---

## The rune shop

The whole system is reached through one screen. A player picks a **hero**, then
picks one of that hero's **three rune slots**, and from there a slot offers
exactly two actions.

A slot is always in one of five states, and the shop is the state machine:

| Slot state | Holds | Advance | Replace |
|---|---|---|---|
| **Empty** | — | buy major, 150 | — |
| **Stage 1** | +20 | buy minor, 150 | destroy, restart at stage 1 |
| **Stage 2** | +20 +10 | buy trace, 150 | destroy, restart at stage 1 |
| **Stage 3** | +20 +10 +5 | buy utility, **200** | destroy, restart at stage 1 |
| **Stage 4** | +20 +10 +5 + effect | — *complete* | destroy, restart at stage 1 |

The utility offered at stage 4 depends on **which slot** is being filled — the
hero's primary element pool, its secondary element pool, or the common pool. The
three slots are not interchangeable, so the shop should make clear which is which
before a player starts spending on one.

- **Advance** buys the next stage of the rune already there. Cheap, incremental,
  and it never destroys anything.
- **Replace** discards everything in the slot and starts a new rune. This is the
  meta-shift sink — a player answering a match-up they keep losing to burns a
  complete rune to do it.

**Rebuilding to the same stage should be one transaction**, not four. Replacing a
complete rune with a different complete rune costs the same 650 either way;
making the player click through four stages to get back where they were is
friction without meaning.

**Nothing is charged until the player commits a stage.** The builder shows the
stat, the resulting hero line, and — at stage 4 — what the utility effect does,
all computed locally by the rules half of `packages/sim`. Selecting is free and
reversible; committing is neither.

> **This is a screen that does not exist yet.** The fourteen generated designs in
> `../designsystem/` cover roster, hero card, battle, matchmaking, guilds, chat,
> profile and news — there is no rune shop among them. It needs a design prompt
> of its own, and it is arguably the most mechanically demanding screen in the
> game: a live build preview, a permanent commitment, and a destructive action
> that has to be unmistakable without being obnoxious.

---

### The kit is much bigger than one squad

Defense is **12 heroes** across two zones, and those 12 **cannot attack**. Attack
squads draw from the remaining 15. So the amount of roster a player actually
needs equipped is far larger than a single six:

| | Heroes needing runes |
|---|---|
| One attack squad only | 6 |
| **Competitive minimum** — 12 defense + 6 attack | **18** |
| Full flexibility across all five squads | 27 |

Two things follow. The sink is **healthy without being artificial** — breadth is
the grind, not a per-hero treadmill. And **runes on defense heroes are never dead
weight**: the engine fields those squads continuously against every attacker, so
a defensive rune works around the clock whether the player is online or not.

---

## Where shards come from

Four sources, and they deliberately reward different things:

| Source | Pays | Notes |
|---|---|---|
| **Attack victories** | active income | The player's own play, entirely under their control |
| **Defensive holds** | passive income | Accrues while offline, per zone |
| **Guild events** | placement | A Wing's finish, rolled up per guild — `08-guilds.md` |
| **Weekly / monthly ladder** | rating placement | Rewards sustained standing rather than volume |

### The rates

**Rewards only. Nothing ever costs shards** — a loss pays nothing, but it never
takes anything away either. The sting of losing lives in the rating ladder, not
in the economy. *(Event scoring is the one place a penalty exists; see
`08-guilds.md`.)*

| Outcome | Shards |
|---|---|
| **Attack victory**, chosen door | **20** |
| **Attack victory**, ambush | **40** |
| **Defensive hold**, Visible | **10** |
| **Defensive hold**, Hidden | **20** |
| Any loss | 0 |

Ambush doubles either side, per the rule below. A hold pays **half** what an
attack victory does, and that ratio is load-bearing rather than arbitrary:

| Hold pays | Passive share of a typical player's income |
|---|---|
| 20 — same as a win | **47%** |
| **10 — half a win** | **30%** |
| 5 | 18% |

At parity nearly half a player's shards would arrive **for doing nothing**, which
is exactly the failure this file warns about — passive income large enough that
logging off competes with playing. At half, defence is a meaningful supplement
that still cannot rival attacking.

### What that pace produces

| Play level | Shards/day | 12 heroes complete | Competitive 18 | Full 27 |
|---|---|---|---|---|
| Light — 10 attacks, 5 holds | 165 | 3.1 mo | 5.4 mo | **8.9 mo** |
| **Typical — 20 attacks, 10 holds** | **330** | **1.6 mo** | **2.7 mo** | **4.5 mo** |
| Heavy — 30 attacks, 20 holds | 545 | 0.9 mo | 1.6 mo | 2.7 mo |

*(50% win rate, 15% of victories being ambushes, starting from the 7,800 grant.)*

A typical player finishes the twelve heroes they were given inside two months,
reaches the competitive eighteen before three, and completes the roster around
four and a half. **After that, shards fund re-speccing forever** — the ceiling is
reached and the currency changes job rather than losing its value.

Against that, the **800-shard weekly purchase is about +35%** for a typical
player. Meaningful, and short of decisive — which is the band it was aimed at.

### An ambush pays double a chosen door

> **A Hidden battle rewards 2× what a battle you scouted and chose would pay** —
> for **either side**, on a victory.

`02-squads.md` calls the ambush *"the only door into a Hidden battle"*, and this
is the reward side of that: a **chosen door** is a Visible squad you scouted and
picked, while an ambush is one neither player elected. Doubling it quantifies the
rule `../../CLAUDE.md` already states — *Hidden battles pay more* — and it is a
**base property of the game, not something bought.**

It cannot be farmed, which is what lets the multiplier be large. Entering a
Hidden battle requires a consecutive-win streak, the chance rises 2% per win and
caps at 90%, and **the attacker does not choose it** — so the volume is bounded
by the game's own rules. On the defending side it is rarer still, since a Hidden
squad is never selectable.

This is also what makes the purchased boost able to be a flat 2× with no
exceptions in it — see *Monetization* below.

**Holds paying is the one that fills a hole.** `08-guilds.md` already notes that
hold streaks are tracked, public and per-zone, and that **nothing else in the
design rewards being good at defense.** Without it, the 12 heroes locked into
defense — nearly half the roster, and heroes that *cannot attack* — are an
investment that never returns anything but a number. With it, runing a defense
squad pays for itself, and the engine collects while the player is asleep.

> **The risk that comes with it: passive income means logging off can be
> profitable.** A hold has to pay clearly less per battle than an attack win, or
> the optimal play is to stop playing. Attacking is the active loop and must stay
> the better rate.

**The ladder payouts do a different job from the other three.** Attack wins,
holds and event tallies all reward *volume* — more play, more shards. A weekly or
monthly payout keyed to **rating placement** rewards standing instead, so a
skilled player with limited time is not simply out-earned by someone with more
hours. Given that the whole design is built so nobody can out-roster anyone, it
would be odd for the economy to let people out-*grind* each other without limit.

---

## The rating ladder

**Two numbers, doing two different jobs.**

| | Visible? | Decides |
|---|---|---|
| **Matchmaking rating** | **no** | which defenses a player is offered to attack |
| **Ladder points** | **yes** | weekly and monthly shard payouts, and standing |

The matchmaking rating is skill-convergent — it moves toward a player's real level
and stops, regardless of how much they play — and it is what makes the
new-player design work: a newcomer meets other newcomers, so the widest kit gaps
are rarely fielded against each other. Ladder points accumulate from results and
are what a player actually sees, competes on, and is paid against.

**The honest cost:** the number shown to the player is not the number the game
acts on. That sits awkwardly beside a design that is otherwise unusually open —
the entire Visible squad is scoutable, hold streaks are public per zone, and the
ambush chance is always displayed. This is the one place LMNTLZ keeps something
back, and it was chosen deliberately for the accuracy it buys in matchmaking.
Worth being upfront about it in the UI rather than letting players discover it.

### Points must scale with the opponent, or the economy contradicts itself

`Where shards come from` above says ladder payouts *"reward sustained standing
rather than volume"*, and that was written when rating was going to be a single
skill number. **Raw accumulating points reward volume instead** — at equal skill,
more hours means a higher placement — which would make the ladder the one part of
the economy that pays for grinding, in a game whose whole thesis is that nobody
can out-roster anyone and whose storefront caps what money can buy.

The reconciliation, proposed rather than settled: **a win's point value scales
with the defeated opponent's matchmaking rating.** Volume still accumulates, but
skill multiplies the rate, so a strong player with limited time is not simply
out-ground by a weaker one with more. It also gives the hidden number a visible
consequence, which softens the transparency problem — players can *feel* the
rating even though they cannot read it.

### Open inside this

- ~~**Whether points reset seasonally.**~~ **Settled by `08-guilds.md`: they do.**
  Guild and Wing rewards pay per season, and a seasonal competition on a permanent
  total is decided by age rather than by play — a two-year-old Wing would hold an
  unreachable score. Scores reset once winnings are paid. The **matchmaking rating
  does not reset**: it is a measurement rather than a score, and wiping it would
  re-expose new players to veterans, which the starter grant depends on not
  happening.
- **Placement for a new account.** The starter-grant design depends on newcomers
  being sorted away from veterans quickly, so how fast the matchmaking rating
  converges early is load-bearing rather than cosmetic.
- **What each zone costs.** `02-squads.md` question 0 — *which squad deserves the
  stronger heroes* — cannot be answered until the stakes are set, and there are
  now **two currencies** to set them in. Whether a Hidden loss costs matchmaking
  rating, ladder points, or both, and at what weight relative to a Visible loss,
  is the decision that makes the two zones feel genuinely different to defend.

---

## Monetization

**What is sold is speed, never ceiling.** Because a full kit is a common ceiling
every player reaches, selling *time to reach it* is a categorically different
thing from selling power. A paying player and a free player who are both fully
kitted are exactly equal.

**The whole storefront:**

| SKU | Grants | Cap |
|---|---|---|
| **Attack boost** — daily | **2×** shards from attacking | first **20 battles** that day |
| **Defense boost** — daily | **2×** shards from defending | first **20 battles** that day |
| **Shards** — weekly | **800 Rune Shards** | once per week |
| **Subscription** — monthly | both boosts every day, plus 800 shards each week | — |

> **The subscription grants exactly the à la carte cap and never more.** It is a
> **discount and a convenience, not a higher tier.** A subscriber and a
> maximum-spending non-subscriber end up in precisely the same place; the
> subscriber simply pays less and does not have to remember to buy anything.

### Prices — **set 2026-07-27**

> **Every price is a multiple of $5, and there is no second currency.**

| SKU | Price | Grants | $/day |
|---|---|---|---|
| **Boost pack** | **$5** | 3 days of the boost pair | $1.67 |
| **Boost pack** | **$10** | 7 days | $1.43 |
| **Boost pack** | **$15** | 12 days | $1.25 |
| **Shards** | **$5** | 800, once that week | — |
| **Subscription** | **$20 / 4 weeks** | boost pair daily + 800 shards weekly | **$0.71** |

**A hard currency was considered and rejected.** Gold at $0.25 a unit would have
amortised payment fees, but it improves **roughly 1% of total revenue**: Steam's
30% is size-independent so bundling gains nothing there, the $20 subscription is
already a large charge, and the crossover below makes à la carte the *sporadic*
tier by design. Against that it costs a second currency to explain, consumer-
protection surface, unspent-balance liability, and the **stranded-balance
pattern** — bundles priced not to divide evenly into item prices, so remainder
pushes another purchase. In a design whose promise is a ceiling players can
audit, that reads as a betrayal of the distinctive thing.

**$5 increments capture most of the benefit with none of the cost.** Payment fees
are a fixed-plus-percentage problem, so what matters is the *minimum* charge:

| Charge | Stripe `2.9% + $0.30` | Net |
|---|---|---|
| $2 | $0.36 | **82.1%** |
| **$5** | $0.45 | **91.1%** |
| $10 | $0.59 | 94.1% |
| $20 | $0.88 | 95.6% |

Raising the floor from $2 to $5 lifts worst-case net by **11% relative**, and $5
remains a low-friction impulse price. *(Steam is a flat 30% at every size, so
none of this applies there — this is a standalone and browser concern
specifically.)*

**Boosts bundle; shards cannot.** Shards are capped at **800 a week however they
are bought**, so a larger shard purchase would have to deliver across future
weeks — which is what the subscription already is. Boosts have no total cap, only
a daily one, so days are the thing that bundles.

**The boosts are sold as a pair, never separately**, because they are not worth
the same. A boost is 2× capped at 20 battles, and a typical player runs about 20
battles a day against a base of **330 shards/day** — 231 from attacking, 99 from
holds:

| | Per day | A boost adds |
|---|---|---|
| Attack boost | 231 | **+231** |
| Defense boost | 99 | **+99** |

**The attack boost is worth 2.3× the defense boost.** Priced identically and sold
separately, a rational player buys the attack boost every day and the defense
boost never — killing the one purchase that rewards defensive play. Pairing them
removes the choice rather than pricing it, which is simpler than maintaining two
SKUs at two price points.

#### What that buys against the earn rate

| | Shards / 4 weeks | vs free |
|---|---|---|
| **Free** | 9,240 | — |
| **Subscriber** — both boosts daily + 800/week | **21,680** | **2.35×** |

*(Boosts double income within the caps: +330/day × 28 = +9,240. Shards add 800 ×
4 = 3,200.)*

| | À la carte | Subscription |
|---|---|---|
| Cost per 4 weeks at cap | 4 × $10 + 4 × $5 = **$60** | **$20** |
| Per 1,000 shards | $4.82 | **$1.61** |
| **Per rune (650)** | **$3.13** | **$1.05** |

**Crossover is 12 days.** Beyond that the subscription is cheaper *and* carries
the shards, so à la carte is the sporadic and trial tier rather than a competing
plan. The gap at cap is **3.0×**, steeper than a usual subscription discount —
deliberately, since conversion to predictable recurring revenue is worth more
than à la carte margin.

**The pack ladder never overtakes the subscription**, which is the ceiling promise
holding at the price layer: $1.67 → $1.43 → $1.25 a day against the
subscription's **$0.71 plus 3,200 shards**. There is no quantity of à la carte
buying that reaches a better rate, so nothing sits above the subscription.

#### The ceiling, in weeks

| Kit | Free | Subscriber |
|---|---|---|
| Competitive 18 heroes (35,100) | **15.2 weeks** | **6.5 weeks** |
| Full 27-hero roster (52,650) | 22.8 weeks | 9.7 weeks |

**The advantage is a head start, not a ceiling** — roughly two months, after which
both players sit at the same 75-point stat cap and are exactly equal on that kit.
What persists is **re-spec frequency**: a subscriber can rebuild runes 2.35× as
often as the meta moves. That is the honest ongoing advantage and it should be
stated rather than glossed; it is bounded by the same cap, so it buys
adaptability rather than power.

#### Three commercial consequences

- **A 4-week subscription bills 13 times a year, not 12.** $260 against $240 for a
  $20 monthly — quietly 8.3% more. It is defensible because it aligns with the
  season and guild-event cadence, but it **must be labelled "every 4 weeks"**
  rather than "monthly", which several jurisdictions require anyway.
- **The $5 floor is what answers payment fees, not a currency.** Steam's 30% is
  proportional and unaffected either way; on the web the fixed $0.30 was 15% of a
  $2 charge and is 6% of a $5 one. See *Prices* above for why gold was rejected.
- **Maximum revenue per player is $260 a year, by construction.** *No uncapped
  tier* is what makes that a wall rather than a target, so the business is a
  volume business and cannot be rescued by whales. That is the commercial shape
  of the design promise, and it should be sized deliberately rather than
  discovered.

That property is the point of the whole storefront, because it means one sentence
covers it: **everything money can buy in this game is in one subscription.** In a
genre where players assume the worst, a ceiling they can audit is worth more than
any amount of reassurance. **Never add a tier above it.**

### What money can and cannot reach

Shards are capped at 800 a week however they are bought, which is roughly five
rune stages. A full kit is 81 runes × 4 stages = **324 stages**:

| Buying at the cap, no play at all | Time |
|---|---|
| 12 heroes fully runed (144 stages) | ~29 weeks |
| Competitive 18 heroes (216 stages) | ~43 weeks |
| **Full 27-hero kit** (324 stages) | **~65 weeks** |

**A whale cannot buy a roster.** That is not a soft limit but a wall, and it is
what keeps *breadth* — the design's stated veteran advantage — something earned
rather than bought. Six months of maximum spend is about eleven heroes' worth.

**Shards rather than rune stages, deliberately.** Selling stages directly was
considered and dropped: it would bypass the Forge, create a second progression
path to balance against the first, and force a player to work out whether 800
shards of stages beats a boost before they could buy anything. Selling shards
*feeds* the Forge instead — the player still walks in, plans, and commits, which
is the part of the design worth protecting.

> **The cap and the earn rate are one decision, not two.** 800 shards a week is
> ~40% on top if a full kit takes six months of play, and noise if it takes six
> weeks. Neither number means anything until the other is set.

### The risk this carries, stated plainly

**If the subscription is the ceiling of paid advantage, a competitive player will
feel they have to hold it.** That is a harder thing to defend than one-off
purchases, and it is the honest cost of a recurring model. Three things keep it
answerable, and all three are design commitments rather than messaging:

- **The free earn rate must reach a full kit on its own** in a time a player
  would consider reasonable. If it does not, the subscription is not a
  convenience — it is the game.
- **The ceiling is common.** A subscriber and a free player who are both fully
  kitted are exactly equal. Money buys the road, never the destination.
- **Nothing above the subscription, ever.** The moment a higher tier exists, the
  auditable-ceiling claim is gone and cannot be recovered.

A second-order effect worth expecting: once the subscription is priced below its
components, the à la carte items become vestigial and most revenue arrives
through one SKU. That is fine, and it simplifies everything — but it means the
subscription price is effectively *the* price of the game, and should be set as
such rather than as an add-on.

### The 4× on an ambush is arithmetic, not a rule

**An ambush already pays 2× what a chosen door pays** — that is a base property
of the game (see *Where shards come from*), not something bought. So a player
holding the relevant boost lands on **4× a chosen battle**, for either side of an
ambush, on a victory:

```
chosen door,  no boost    ×1
chosen door,  boosted     ×2
ambush,       no boost    ×2
ambush,       boosted     ×4      ← emerges; nothing special-cases it
```

An earlier draft wrote the 4× into the boost as an exception. Moving it into the
base ambush reward is strictly better: **the boost becomes a uniform multiplier
with no rules inside it**, which is easier to price, easier to explain, and
impossible to get wrong in the resolver.

### Why the caps

**Caps turn the boost into a convenience purchase.** Uncapped, a multiplier's
value scales with how much a player already plays, so it pays out most to the
people who need it least. Capped at 20, a player with thirty minutes gets roughly
what an hour would have paid, while someone already grinding all evening gets the
same fixed bonus as everyone else. That monetizes time-poverty rather than
competitiveness.

Note that the **defense cap will rarely bind**, since a player does not control
how often they are attacked. That is fine and by design: the defense boost is the
naturally-bounded one, limited by other players' behaviour rather than by a rule.

### No uncapped tier

It was considered as a higher price point and rejected on arithmetic rather than
on principle. With a 20-battle attack boost already on sale, an uncapped SKU is
worth something **only to a player fighting more than 20 battles a day** — at
3–5 minutes each, already 80+ minutes of play. So it would have a tiny
addressable population, deliver its entire value to exactly the group whose
advantage the design is trying not to sell, and carry the full perception cost of
"they sell an unlimited multiplier."

**There is no third SKU.** If a higher price point is ever wanted, the two boosts
sold together is the only version that adds no mechanic and no pay-to-win
surface.

### Spending is not effectiveness, and that is the point

Shards spent measures **investment**, never **effectiveness** — a player can
overcap, stack a stat their hero cannot use, or take a weak utility. That gap is
the design's best feature rather than a rough edge.

Measured on Bramwen at an identical spend of **1,950 shards** — three complete
runes, 105 points, same slots, same hero — the best allocation found scored
**3.35× the worst**. Same money, same everything, triple the result.

> *(That figure is a proxy: it models damage dealt, accuracy and damage taken
> only. The worst allocation poured everything into `Luck`, `Speed` and
> `Resolve`, which the proxy does not value but which genuinely matter. The true
> spread is smaller than 3.35×; the direction and rough magnitude hold.)*

**But the claim has to be stated precisely, because the looser version is false.**
A badly-allocated 1,950 shards still beats a well-allocated 650 — three times the
spend wins even when misspent. So this is not "skill beats money":

> **Skill dominates *within* a spending band. The weekly cap is what keeps every
> player inside one.**

That is the real argument for capping purchases, and it is stronger than the
fairness argument. Without a cap, spending bands diverge until money outruns
allocation and the 3.35× stops mattering. With one, everybody is competing on the
axis that rewards reading the game — which is the entire thesis of a
counter-building design.

**It also makes rune investment safe to display when scouting.** Because spend
does not reveal *quality*, a scouted Visible squad shows **each hero's three
slots, their elements, and how many stages each has reached** — and no stat
values at all (`07-defense-ai.md`). An opponent learns how committed a player is
without learning whether the commitment was wise, which keeps reading a squad a
matter of judgement rather than arithmetic. It also means **bluffing works**:
filling every slot cheaply and badly reads as a finished defense.

### The revenue curve runs backwards, deliberately

Once a player is fully kitted, shards buy only **adaptation** — re-speccing to
answer a shifting meta. So a boost is worth *less* to a veteran than to a
newcomer, which is the reverse of how most games' monetization curves run.

That falls out of the ceiling being common, and it is the honest consequence of
the design rather than a flaw: **revenue skews toward new and mid-game players
instead of concentrating on the most invested ones.** Anyone modelling the
business should start from that rather than from a standard whale curve.

> **The one thing to keep watching** is that re-speccing never ends, so a boosted
> player adapts to every meta shift faster than an unboosted one, indefinitely.
> The caps are what bound that to a fixed daily amount rather than a permanent
> multiple. If a cap is ever raised, this is the property being traded away.

---

## The new-player gap

Two players can field identical *heroes*. They cannot field identical *runes*,
and that is the one place this system could quietly recreate the asymmetry the
fixed roster removed.

**Settled: a starter allotment, a front-loaded early curve, and rating for the
rest.**

- A new player begins with **7,800 shards — twelve heroes carrying one complete
  rune each.** That covers a full defense squad *and* a full attack squad, so
  nothing they field is ever bare.
- The early earn rate is **front-loaded**, so filling the remaining slots on
  those twelve is a matter of weeks rather than months. After that the rate
  flattens and the remaining sink is breadth plus re-speccing.
- **Rating does the rest.** A newcomer enters at the bottom of the ladder and
  meets other newcomers, so the widest gaps are rarely fielded against each
  other at all.

**Twelve heroes rather than six**, because defense is the exposed surface. A
player's defense squads are attacked whether or not they are logged in, so a
fully-runed attack squad backed by a bare defense means being farmed overnight —
the first thing a new player would see every morning. A thin defense at least
holds sometimes.

**Complete runes rather than loose major boosts**, even though 7,800 would buy 52
of the latter. Handing over twelve *finished* runes means a new player sees all
four components — including a **utility effect** — on day one rather than
discovering the most interesting part of the system months later. They still have
two empty slots per hero to make their own calls in.

### Why not bracket matchmaking on rune investment

It was considered, and it is the stronger *guarantee* — match on rating plus
total rune value and a fair fight becomes true by construction rather than
statistically. It was rejected because of what it does to the reward:

> **Under kit-based bracketing, investing in runes stops improving your win rate
> and instead moves you to harder opponents.** Progression becomes a treadmill —
> the player does the work, and the game takes the benefit back at the door.

That is the most common and most damaging complaint about bracketed progression,
and it would undercut the only reward loop the game has. Rating already sorts
players by outcome, and outcome already includes rune investment; letting it do
that job implicitly is better than doing it explicitly.

**The residual risk is honest and should be watched:** if early rating is noisy,
a newcomer can still be matched against a veteran before the ladder has sorted
them. Placement behaviour for a new account is the mitigation, and it belongs
with the rating design below.

### Commit with your eyes open, not blind

Permanent placement plus destruction on replacement has one failure mode: players
who are **afraid to experiment**, which would defeat the point of a customization
system. Copying a wiki build is the safe play, and a design that makes the safe
play "don't think about it" has failed.

The fix is already being built for other reasons. `packages/sim` splits into
**rules** — pure, shared, no RNG — and resolver (`../../docs/tech-stack.md`), so
the client can compute exactly what a rune does before it is committed, with no
server round trip and no possibility of disagreement.

> **The commitment should read as "you can see precisely what this will do, and
> then it is permanent" — never as "you gamble, and then it is permanent."**

A build-preview is therefore a **requirement of the progression design**, not a
UI nicety, and it should be specced as one.

---

## How this interacts with what is already decided

**The bounded-formula rule was written for exactly this.**
`README.md` requires every formula to have diminishing returns in the stat it
consumes, because gear would eventually break anything linear. That work is done:

- **Mitigation** uses `75/(75+E)` rather than a flat percentage, so stacked
  resistance is self-limiting instead of converging on immunity.
- **Turn order** gains `50 + Speed` rather than `Speed`, holding the geared
  action-rate ceiling at 1.92× instead of 5×.
- **`Luck` was removed from the damage formula** specifically because it
  multiplied three factors at once, making it worth 2.41× a point of `Might` to
  a rune buyer — the single-dominant-stat trap, and it would have arrived with
  this document.
- **The 75 stat cap** means overcapping is waste, so runes must be *spread*
  rather than piled. That turns a kit into an allocation puzzle by arithmetic
  rather than by a rule invented for the purpose.

Nothing in the combat layer needs to change to accommodate runes. That was the
point of writing it that way.

---

## Open

- **Utility effect magnitudes.** The catalog is settled — 33 effects, three
  shapes, one offensive/defensive/tempo triad per element. The *constants* are
  not: 30% of max HP versus 25%, 25% versus 20% on the Air roll, whether +20
  `Might` on `Cornered` is the right weight. Every entry is in the 10–20-stat-
  point band by estimate, and that estimate is doing two jobs at once — it
  balances breadth against depth *and* it sets whether a utility slot is worth
  200 shards. Only `packages/sim` answers it.
- **Event and ladder payouts.** Battle and hold rates are set (20/40/10/20);
  what a guild event placement and a weekly or monthly ladder finish pay is not.
  Both are the levers that reward *standing* rather than volume, so they matter
  more than their size suggests.
- **Whether the early curve is front-loaded at all.** The new-player section
  assumes it is, but at 20 a win a typical player already completes their twelve
  granted heroes in under two months. A separate early bonus may be unnecessary.
- **Whether 3 slots stays 3.** Three runes reaches 53% of the theoretical stat
  ceiling and leaves 356 points unclaimed, so a fourth slot is available later
  without any formula moving. Cheap to add, expensive to take back.
- **The rating ladder.** Placement for a new account, how much a Visible loss
  costs against a Hidden one, and whether rating is the only ladder or whether
  hold streaks rank separately. `02-squads.md` question 0 — *which squad deserves
  the stronger heroes* — cannot be answered until the stakes attached to each
  zone are set here.
- **Whether there is a status track at all.** Cosmetics, titles, frames and guild
  banners would absorb long-term play in a way that cannot touch power. The brand
  work exists to support it; whether it is in scope is undecided. It is also the
  one thing that can be **sold without touching the speed-versus-ceiling question
  at all**, which matters given the revenue curve above runs backwards.
- ~~**Boost pricing, and what "cheap" means.**~~ **Set** — *Prices* above. $2 for
  the daily boost pair, $5 for 800 shards, $20 for a 4-week subscription, which
  reads as **2.35× a free player's income** and a ~2-month head start to a
  competitive kit. What remains is not the price but the **conversion rate** it
  implies: revenue per player is capped at $260/year by construction, so the
  business is a volume business and the target player count should be sized
  deliberately.
- **Feature unlocks as an onboarding ramp.** The Hidden zone, the second and
  third attack squads, and guild membership could gate on account progress. This
  is progression that gates *complexity* rather than power, so it cannot violate
  the promise — but it is a real decision about how much game a new player sees
  on day one.
- **What guild events pay out.** `08-guilds.md` is blocked here and only here.
  Shards are the obvious answer; whether a Wing payout is shards, status, or both
  is not settled.
