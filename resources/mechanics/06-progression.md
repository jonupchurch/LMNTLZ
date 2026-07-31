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
| **Per-attack chance** | 25% → +1 reach this turn | ~2 | needs a turn-start roll |
| **Ward / charge** | ignore the first Stun or Silence | ≤ 1, consumed | `05-status.md` vocabulary |

**Triggers fire once, but their consequence lasts the rest of the battle.** That
is forced by two numbers pulling opposite ways. A 6v6 runs roughly **102**
hero-turns across 12 heroes — **8.5 turns each** — and 36 rune effects are live in
it, so anything that re-arms on a short cooldown puts a proc on nearly every turn:

| If an effect… | Firings per battle | Cadence |
|---|---|---|
| fires **once** | 36 | 1 per 2.8 turns |
| re-arms every 6 turns | ~51 | 1 per 2.0 turns |
| re-arms every 4 turns | ~77 | **1 per 1.3 turns** |

> **Recomputed against the ~102 median** (the table previously assumed 155). **The
> argument got stronger, not weaker.** Re-arm counts fall with the shorter battle,
> but the *cadence* barely moves — both terms scale together — while the
> once-firing row tightens from 1-per-4.3 to **1-per-2.8**, because 36 effects is
> fixed no matter how long the battle runs. **A shorter battle makes the board
> busier, not calmer.**

But a single once-per-battle *burst* cannot justify the price. 200 shards has to
beat 150 for a fresh +20 elsewhere, and +20 `Might` on a `Might` 30 hero is +67%
on every packet for all **8.5** of its turns — one proc would have to be worth
**5.7 turns of that hero's output**. Persisting the consequence gets both: one readable
moment, ongoing weight. It costs one extension to `05-status.md` — a duration
class beyond the 4-turn ceiling, applicable only to rune effects — and that is a
feature, since it is what makes a rune feel unlike a power rider.

> **Probabilistic effects must grant *capability*, not *magnitude*.** A 25%
> chance of more damage is worth exactly 25% of that damage and always loses to a
> flat stat. A 25% chance to reach a target you otherwise cannot is not a
> fraction of anything. Every per-attack effect below grants access, control or
> negation — never a bigger number.

Across a rough even mix of the three shapes, a battle carries **~49 effect events
over ~102 hero-turns — one every 2.1 turns.** That holds because per-attack procs
leave no lasting state and wards are silent: a debuff simply does not apply.

> **The density barely changed** — 2.5 turns per event became 2.1 — because the
> event count and the battle length fell together. **What did change is the bar in
> the paragraph above**, from 8.7 turns of output down to **5.7**, since a
> once-per-battle proc now competes against a shorter career. The conclusion is
> unaffected — 5.7 turns of a hero's entire output is still far more than one burst
> can deliver — but the margin is thinner than when it was written, and it is the
> figure to re-check first when rune magnitudes get numbered.

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

### The daily curve — **set 2026-07-27**

> **Attack income is tiered by the day's victory count: the first 5 victories pay
> 1.5×, victories 6–20 pay the base rate, and everything past 20 pays 0.5×.
> Play is never blocked and nothing is ever capped at zero.**

| Victories that day | Multiplier | Chosen door | Ambush |
|---|---|---|---|
| **1 – 5** | **1.5×** | **30** | **60** |
| 6 – 20 | 1.0× | 20 | 40 |
| **21 +** | **0.5×** | **10** | **20** |

**Holds are never tiered.** A hold is driven by how often other people attack
you, which the defender does not control, so there is nothing there to pace.

#### The day turns over at **00:00 UTC** — set 2026-07-30

One boundary for everybody, not a rolling 24 hours and not the player's local
midnight. Both daily counters reset on it: the victory tier above, and the ten
boosted victories and ten boosted holds a pass grants.

**Written down here because the code already implements it and canon did not
say it.** `dayStart()` has used `Date.UTC` since feature 010 and
`GET /v1/me/shards` has served the next boundary since the same commit; the rule
existed only in TypeScript, which makes it an implementation detail that nobody
agreed to. Constitution XX: a screen may not be the first place a rule is
written, and the Store screen is about to display this one.

**Why one global instant rather than per-player local midnight.** A per-player
boundary would make *when* you play a lever on *how much* you earn — somebody in
a timezone where midnight lands mid-session gets two 1.5× tiers in one sitting —
and it makes every income question unanswerable without knowing where the player
lives. A global reset is the same deal for everyone, and its cost is honest and
small: for some players the reset lands at an inconvenient hour, which affects
convenience and never rate.

**The client never computes it.** `GET /v1/me/shards` serves
`today.nextBoundaryAt` as an **absolute instant**, and every screen renders that
rather than the string *00:00 UTC*. That is deliberate insulation: if this is
ever changed to something per-player, the API shape does not have to change with
it and no screen has to be found and edited.

#### Why tier at all

Before this, attack income was **perfectly linear in battles played** — 23 shards
per victory, forever, with no diminishing return in the resource it consumes.
That is the one property `README.md` says no formula in this project may have;
the stat being consumed here is simply *time* rather than a hero stat.

Nothing enforced the 20-battle figure the tables below are built on. It was an
assumption about typical play, and the real limiter was battle length — roughly
102 hero-turns per 6v6, which nobody has measured in wall-clock. **The economy's
whole shape therefore rested on a number no one had chosen**, and it would move
every time combat pacing did.

| Victories/day | Tiered | Untiered | Play time* |
|---|---|---|---|
| 10 — typical | 288 | 230 | ~1.7 h |
| 25 | 517 | 575 | ~4.2 h |
| **50** | **863** | 1,150 | **~8.5 h** |
| 100 | 1,438 | 2,300 | ~17 h |

*\* At ~3 s per hero-turn — an estimate, not a measurement. `packages/sim`
settles it, and every figure in this column moves with it.*

#### Counted in victories, not battles

**A loss must never burn a tier.** The rule above this section is that a loss pays
nothing but never takes anything away, and a tier counted in *attempts* would
quietly break it — losing would cost you the difference between 1.5× and 1.0× on
your next win, which taxes attacking hard opponents in a game whose entire thesis
is counter-building.

Counting victories also states plainly: *your first five wins today pay 1.5×.*

#### Why 1.5× on the first five

**It rewards showing up rather than grinding.** Five victories is roughly 25
minutes — a tier that finishes *before* a typical session does, so every player
who logs in collects it in full and nobody has to play long to reach it. Ten
would have covered a typical session end to end, which is not a return bonus at
all but a 35% rate increase wearing one.

Seven daily sessions beat one long one by **1.84×** for the same number of
battles.

**It is also progressive**, which was not the goal but is the better consequence.
A light player's victories all sit inside the bonus tier while a heavy player's
mostly do not, so the gap between them narrows from **3.30× to 2.70×** — the
casual player gains 35% and the grinder 11%.

#### Fractions

Every multiplier here lands on a whole number, because the base rewards are 20
and 40 and the multipliers are 1.5, 1.0, 0.5 and the 2× boost. **No fraction
occurs at current rates.** The rule exists so a later rate change cannot
introduce one silently:

> **Apply every multiplier to the base, sum, then round half up. A rewarded
> outcome never pays less than 1.**

#### The boost keeps its own boundary

The 2× boost caps at **10 victories** and is deliberately *not* aligned to the
5-victory bonus tier. Doubling both components across exactly the range a typical
player occupies is what produces the **2.00×** pass holder ratio in *Monetization*
below; moving the cap to 5 would cut it to 1.75× and break a published figure to
save one number on a screen.

So there are three boundaries — **5** for the bonus, **10** for the boost, **20**
before the taper — and they still read in one line: *first 5 wins pay 1.5×, wins
6–20 pay normal, wins past 20 pay half, and a boost doubles your first 10.*

### The balance cap — **set 2026-07-28**

> **A player holds at most 6,500 unspent shards — ten full runes. At the cap,
> battle income stops; granted shards still land and may carry the balance above
> it.**

**This is insurance, not an exploit fix.** Hoarding was examined and is not a
sandbag (`09-matchmaking.md`) — a hoarder is never stronger than their
leaguemates, and shard income is flat per victory, so banking earns exactly what
spending earns. The cap exists because **an unbounded stockpile is the one
quantity in the economy with no ceiling at all**, and this design's own
bounded-formula rule says to put one there before something later needs it not to
be infinite. `10-equipment.md` is the obvious candidate.

**It is stated in runes, not in shards, and that is the point.** A cap of 6,500
is unmemorable; **ten full runes** is a quantity a player can reason about without
being told, and it moves automatically if a rune's price ever does. The same
habit as sizing the boost against the 75 cap and the utility score against the
catalog's own band — a constant should explain itself.

**Since the cap prevents nothing, the only thing that matters is that it never
fires in normal play.** Every plausible legitimate save clears it:

| | 5,000 | **6,500 — chosen** | 10,000 |
|---|---|---|---|
| Full runes it holds | 7.7 | **10** | 15.4 |
| Days to fill — typical, 388/day | 12.9 | **16.8** | 25.8 |
| Days to fill — heavy, 603/day | 8.3 | **10.8** | 16.6 |
| Heroes fully kitted, 1,950 each | 2.6 | **3.3** | 5.1 |

| A player saving for… | Costs | Fits under 6,500? |
|---|---|---|
| One utility stage | 200 | Yes |
| One full rune | 650 | Yes |
| One hero, all three slots | 1,950 | Yes |
| **Three heroes at once** | **5,850** | **Yes, with room** |
| A whole squad of six | 11,700 | **No — two passes** |

**5,000 was the version that bites.** At 8.3 days a heavy player deliberating for
a bit over a week hits a wall, and `Commit with your eyes open, not blind` below
makes deliberation *correct play* outright — runes are destroyed on replacement,
so hesitating before a permanent purchase is exactly the behaviour this economy
wants to protect.

> **A full squad rebuild does not fit, deliberately.** 11,700 is 1.8× the cap, so
> re-kitting six heroes is two passes rather than one banked drop. That is the
> only legitimate plan the cap constrains, and staging it is not a hardship.

#### Three sources, three rules

| Source | At the cap |
|---|---|
| **Battle income** — attack victories and holds | **Stops.** Nothing drops until the balance falls back under |
| **Prizes** — event placements, ladder finishes, compensation grants | **Always land**, and may carry the balance *above* the cap |
| **Anything purchased** | **Refused.** A purchase that would take a player over is denied at the point of sale |

**Refusing the sale is the consumer rule, not an economy rule.** Shards themselves
remain unpurchasable — that is what caps purchasable advantage at $160/year — so
the live case is the **boost pair**, which multiplies earned income. Selling a
boost to a player sitting at the cap takes money for something that cannot
produce anything. Refuse it and say why.

#### Prizes are exempt, and that is load-bearing

Guild event payouts, ladder finishes, and above all the **blanket compensation
the no-nerf rule promises** (`README.md` — *grant shards to everybody*) are paid
regardless of balance.

> **Without this exemption the cap silently voids a promise.** A compensation
> grant exists precisely to repay a player whose investment was devalued — and
> the players most likely to be sitting on shards are the ones deciding what to
> rebuild. Paying them nothing is the exact opposite of the rule's intent.

**The UI must warn well before the cap is reached.** A player who finishes a
session and discovers it earned nothing is a support ticket and a review, and the
warning costs one line.

#### Parking at the cap — named, accepted, taxable later

The three rules above permit one deliberate strategy: **sit at the cap forever.**
Never spend, so the gear score never moves and the league never changes; accept
that battle income has stopped, because it was unusable anyway; and live on event
prizes, which are the one uncapped source. The player freezes their power on
purpose and farms a league they have outgrown.

**It is a real position and it is not free.** They forfeit *all* battle income
permanently — the 388-a-day baseline, gone — in exchange for an event advantage
that `08-guilds.md` measures at **1.17×**, since the punching-up bonus pays them
nothing and the hold term cannot be farmed. Trading 100% of one income stream for
17% more of a smaller one is a bad deal that some people will take anyway.

> **The drafted tax, if it ever becomes an issue: scale event payouts by league.**
> A Bronze placement pays less than a Diamond one. Parking then defeats itself —
> more wins, each worth less — and it needs no new tracking, since the league is
> already known. **Event payout sizes are still open** (see *Open* below), so this
> is a choice available at the moment they are set rather than a change to
> anything decided.

Not implemented now. Named so that if event prizes start looking like a career,
the answer is already drafted.

### What that pace produces

| Play level | Shards/day | 12 heroes complete | Competitive 18 | Full 27 |
|---|---|---|---|---|
| Light — 10 attacks, 5 holds | **223** | 2.3 mo | 4.0 mo | **6.6 mo** |
| **Typical — 20 attacks, 10 holds** | **388** | **1.3 mo** | **2.3 mo** | **3.8 mo** |
| Heavy — 30 attacks, 20 holds | **603** | 0.9 mo | 1.5 mo | 2.4 mo |

*(50% win rate, 15% of victories being ambushes, starting from the 7,800 grant.
Untiered, these read 165 / 330 / 545 and 8.9 / 4.5 / 2.7 months.)*

A typical player finishes the twelve heroes they were given inside six weeks,
reaches the competitive eighteen before three months, and completes the roster
around **3.8**. **After that, shards fund re-speccing forever** — the ceiling is
reached and the currency changes job rather than losing its value.

> **The curve shortened the runway by 15%, and that was a decision rather than a
> side effect.** 4.5 months to complete a roster is a long time in a game whose
> currency's endgame job is re-speccing, and the bonus tier buys the daily-return
> incentive with runway that was arguably too long already.

Against that, a pass holder's boosts are **+100% on exactly this figure** — they
double what play already pays and add nothing to a player who does not play.

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

## The rating ladder — **settled 2026-07-27**

> **One number. Visible, skill-convergent, and it does exactly two jobs:
> standing, and the order league-mates are offered in.**

### Why one and not two

An earlier draft carried two — a **hidden** matchmaking rating and **visible**
ladder points — and flagged its own cost: *the number shown to the player is not
the number the game acts on*, which sits badly in a design where the Visible squad
is scoutable, hold streaks are public and the ambush chance is always displayed.

Two later decisions removed the reason for the split:

| The second number existed to… | Why it no longer needs to |
|---|---|
| keep the matching number ungameable | **Leagues match on gear** (`09-matchmaking.md`), and **the pool is every league-mate** — there is no selection left to game |
| give players something that accumulates as they play | *Points must scale with the opponent* below establishes accumulation as the **defect**, not the feature |

**So the rating is what you see, what you brag about, and what the game acts on.**
The transparency cost disappears rather than being mitigated.

### It converges; it does not accumulate

> **Rating moves toward a player's real level and then stops, regardless of how
> much they play.**

`Where shards come from` above requires ladder payouts to *"reward sustained
standing rather than volume."* **Raw accumulating points do the opposite** — at
equal skill, more hours means a higher placement, which would make the ladder the
one part of the economy that pays for grinding, in a game whose whole thesis is
that nobody can out-roster anyone.

A convergent rating satisfies that requirement by construction: **the weekly ladder
pays on where a player stands at the close of the week, not on what they piled up
during it.** A strong player with two hours outranks a weaker one with twenty.

**A convergent rating also disarms two things it would otherwise have to rule
against.** Beating an opponent below you moves you almost nothing — so neither
farming one weak defender (`09-matchmaking.md`) nor grinding curated bots is a
rating strategy. Both are handled by the shape of the number rather than by a rule.

**The plateau is the point, not a flaw.** A converged player stops climbing until
they get better, which is what a ladder is for.

### Convergence bands

**Gear is not in this number.** `09-matchmaking.md` measures rune power and sorts
by league; rating measures only whether a player wins with what they have. The two
axes stay separate.

| Phase | Rated battles | **K** | Effect |
|---|---|---|---|
| **Provisional** | first 30 | **40** | lands near true level in ~1.5 days of typical play |
| Settling | 31 – 200 | 20 | ordinary movement |
| **Established** | 200 + | 10 | stable enough to rank on |

Every account starts at **1000**, the same number for everyone, because gear
placement is already handled by the Bronze floor.

**Thirty battles is deliberate.** At a typical 20 battles a day a new account is
sorted inside two days — fast enough that the starter grant is not carrying
new-player protection on its own, slow enough that a streak of three lucky wins
does not define someone.

> **The bands are a starting point, not a decision.** Convergence speed is exactly
> the kind of thing a simulated population settles and reasoning does not; the
> *shape* — one number, convergent, three decaying bands — is the decision.

### A Hidden victory is worth double, to either side

> **Hidden battles pay a 2× rating bonus on a win. A loss costs the same in either
> zone.**

**This is the same rule the shards already follow**, and deliberately so — *An
ambush pays double a chosen door* above doubles a Hidden victory for either side
and leaves losses at zero. One shape, both currencies.

#### It is what makes the two zones genuinely different to defend

`02-squads.md` question 0 records the zone split as *"a commitment, not an
observation, and it is testable: neither zone may dominate"* — and noted that on
shards alone Visible leads. The rating stakes are the counterweight, and they
point the other way.

A defender taking 20 attacks a day, 85 / 15 Visible / Hidden, holding **40%** on
Visible and **60%** on Hidden because a blind attacker cannot counter-build:

| | Battles | Shards/day | **Rating/day** | Rating per battle |
|---|---|---|---|---|
| **Visible** | 17 | **68** | **−3.40** | −0.20 |
| **Hidden** | 3 | 36 | **+2.40** | **+0.80** |

**Shards say fortify Visible. Rating says fortify Hidden — and Visible actively
bleeds.** Neither zone dominates, because the two currencies disagree, and a
defender has to decide which one they are playing for.

The bonus is doing real work rather than decorating: **without it Hidden is
+0.20 a battle rather than +0.80**, a quarter of the pull.

> **Two honest caveats.** `02-squads.md`'s **3.3 : 1** shard figure assumed *equal*
> hold rates; at 60 / 40 it is already **1.9 : 1**. And the whole result depends on
> Hidden holding better than Visible — **if the two hold rates converge, Visible
> wins both currencies and the choice collapses.** That is the first thing
> `packages/sim` has to measure, and it is the same question `02-squads.md`
> question 0 already parks there.

### Open inside this

**Closed out 2026-07-27.** All five questions are answered above or elsewhere;
kept here because what they settled to is load-bearing.

- ~~**What the rating actually does.**~~ **Settled: standing, and the order
  league-mates are offered in** — see *Why one and not two*. It never restricts
  the pool, which is what keeps it compatible with `09-matchmaking.md`'s
  every-defender rule.
- ~~**Placement for a new account.**~~ **Settled: 1000 for everyone, converging in
  ~30 battles** — see *Convergence bands*. The question shrank before it was
  answered: it was written when rating was the only thing separating newcomers
  from veterans, and **every account now starts at exactly 1,500 gear score — the
  Bronze floor — against a full kit's 10,125.** Leagues sort them five bands
  apart; rating only has to sort *within* a band where gear is already inside
  1.67×.
- ~~**What each zone costs.**~~ **Settled: a Hidden victory pays 2× rating, a loss
  costs the same in either zone.** See *A Hidden victory is worth double*. This is
  what answers `02-squads.md` question 2 and gives question 0 its counterweight.
- ~~**Whether a bot result moves rating.**~~ **Settled: yes** —
  `09-matchmaking.md`. Bots are built competitive and carry a fixed rating, which
  makes them **calibration anchors** at launch when there is no population to
  derive one from. Safe because the rating converges: beating an authored opponent
  below you moves you almost nothing.
- ~~**Whether points reset seasonally.**~~ **Settled by `08-guilds.md`: guild and
  Wing scores do; the rating does not.** A seasonal competition on a permanent
  total is decided by age rather than by play. The rating is a measurement rather
  than a score, and wiping it would re-expose new players to veterans.

**What is left is numbers, not mechanisms:** the K bands, the 2× bonus, and
whether the Hidden hold rate really exceeds the Visible one. All three are
`packages/sim` questions.

---

## Monetization

**What is sold is speed, never ceiling.** Because a full kit is a common ceiling
every player reaches, selling *time to reach it* is a categorically different
thing from selling power. A paying player and a free player who are both fully
kitted are exactly equal.

**The whole storefront:**

| SKU | Grants | Cap |
|---|---|---|
| **Attack boost** — daily | **2×** shards from attacking | first **10 victories** that day |
| **Defense boost** — daily | **2×** shards from defending | first **10 holds** that day |
| **Subscription** — 4 weeks | both boosts every day | — |

> **The longest pass grants exactly the à la carte cap and never more.** It is a
> **discount and a convenience, not a higher tier.** A pass holder and a
> maximum-spending non-pass holder end up in precisely the same place; the
> pass holder simply pays less and does not have to remember to buy anything.

### Prices — **set 2026-07-27, converted to passes 2026-07-28**

> **Every price is a multiple of $5, there is no second currency, and
> *nothing auto-renews.* One product — the boost pair — sold in seven durations.**

| SKU | Price | Grants | $/day |
|---|---|---|---|
| **Boost pass** | **$5** | 3 days of the boost pair | $1.67 |
| **Boost pass** | **$10** | 7 days | $1.43 |
| **Boost pass** | **$15** | 12 days | $1.25 |
| **Boost pass** | **$20** | 4 weeks — 28 days | $0.71 |
| **Boost pass** | **$50** | 3 months — 91 days | $0.55 |
| **Boost pass** | **$90** | 6 months — 182 days | $0.49 |
| **Boost pass** | **$160** | **1 year — 364 days** | **$0.44** |

**Passes stack additively.** Buying while time remains extends it; it never
replaces or resets. So there is no penalty for topping up early and no reason to
wait until a pass lapses, which is the behaviour a renewal reminder would
otherwise have to manufacture.

#### Nothing auto-renews — **decided 2026-07-28**

> **There is no subscription product. A player buys a pass; when it ends, it
> ends.**

**This trades predictable revenue for a category of problems, and the trade is
worth it.** What goes away:

- **Auto-renewal regulation**, which is a moving target in three jurisdictions at
  once — the FTC's negative-option rule, California's ARL, and EU/UK equivalents,
  each with its own reminder, disclosure and cancellation-flow requirements.
- **Dunning** — failed cards, expiry, retry ladders, grace periods, and the
  support load all of it generates.
- **"I forgot I was subscribed" chargebacks**, which are a large category on their
  own and land on a payment account whose ratio matters (`../../docs/tech-stack.md`).
- **Any dark-pattern accusation at all.** In a design whose distinctive promise is
  *a ceiling players can audit*, a subscription somebody struggles to cancel would
  be the single most off-brand thing we could ship.
- **The 4-week billing-interval problem.** A 28-day cycle is awkward for every
  recurring biller; **a one-time purchase has no cycle to be awkward about.**

**What it costs is real and should be stated plainly:** no MRR, no renewal by
inertia, and a re-purchase requires an active decision that some players will
simply not make. Against that, **a repurchase is a signal rather than an
oversight** — and the long passes are **prepaid revenue**, which for a
self-funded project is worth materially more than the same money arriving monthly.

> **The long passes lower the ceiling on purchasable advantage from $260 to
> $160.** Thirteen 4-week passes cost $260; the annual costs $160 for the same
> 364 days. **Nobody rational pays the higher figure**, so the honest cap is now
> **$160/year**. That is a 38% cut to maximum revenue per player and it buys two
> things: the cap is cheaper to *reach*, so the gap between a whale and a
> committed free player narrows further — and *Spending is not effectiveness*
> gets easier to say, not harder.

**A hard currency was considered and rejected.** Gold at $0.25 a unit would have
amortised payment fees, but it improves **roughly 1% of total revenue**: Steam's
30% is size-independent so bundling gains nothing there, the $20 pass is
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

**Only boost-days are sold, so days are the only thing that bundles.** See
*Shards cannot be bought* below for why nothing else is on the shelf.

### Steam is the primary storefront, and the 30% is cheap — **decided 2026-07-27**

> **Ship on Steam and pay the cut. Sell direct from the browser build as a
> secondary channel, never as a replacement.**
>
> **Steam is a fast-follow, not part of 1.0 — added 2026-07-28.** Launch direct
> from the web build, add Steam once the game is worth the launch window. See
> *Steam ships after 1.0* below; everything else in this section is unchanged.

**The break-even is not close.** Steam takes 30% against roughly 3% for a direct
sale, so Steam only has to deliver **1.39× the players** self-publishing would.
For a title with no existing audience that bar is cleared many times over.

**The supporting argument is this file's own ceiling.** Pass spend is capped at
**$160/year per player by construction** — cosmetics sit outside it, but they do
not exist yet, so **at launch that cap is the whole business**:

| Year-round pass holder rate | ARPU / year from passes, net of Steam |
|---|---|
| 3% | **$3.36** |
| 5% | $5.60 |
| 10% | **$11.20** |

Against ordinary paid-acquisition costs, **paid user acquisition barely works at
any of those rates.** Organic discovery is therefore not a marketing channel at
launch, it is the business model — which is precisely what the 30% buys. It also
buys worldwide payments, tax and VAT handling, refunds, fraud, and the trust of a
card entry a player has already made once.

> **Cosmetics change the arithmetic but not the decision.** Once they ship, ARPU
> rises and paid acquisition becomes viable — and the 1.39× break-even above is
> unaffected either way, because it is a ratio rather than a level. Steam is
> right at every ARPU.

**The cut steps down** — 25% above $10M lifetime and 20% above $50M. At the $160
ceiling the first step is roughly **62,500 annual pass holders**.

> **The ceiling fell from $260 to $160 when long passes landed** (*Nothing
> auto-renews*), so every ARPU figure here is **38% lower than it was**. The
> decision is unchanged — 1.39× is a ratio and does not care about the level —
> but **paid acquisition is now further out of reach, not closer**, which makes
> organic discovery load-bearing rather than merely preferable.

#### Both channels, because they do not cannibalize

`../../docs/tech-stack.md` already builds the same client for the browser. A
player who arrives through a creator, a community or a link can buy direct at ~3%
— the same $20 netting **$19.12 rather than $14.00**, a 37% difference on
identical product.

They do not compete, because the Steam build cannot advertise the web store and
should not try.

#### Entitlements are account-level and cross-platform — **decided 2026-07-28**

> **Two payment rails, one entitlement service. A purchase made anywhere works
> everywhere, on the account rather than on the platform.**

The rails are forced rather than chosen: Steam requires purchases made *inside
the Steam build* to run through its microtransaction system, and the browser
build has no such requirement, so there are two checkouts no matter what. What is
a decision is whether they grant the same thing — and they do.

**It costs nothing to build and it is the only lever that recovers margin from
the cut.** `../../docs/tech-stack.md` already owns auth in-house, so entitlement
hangs off the account the same way rating and shards do; the platform is a
payment detail, not an identity. A pass holder who bought on the web keeps the
boost pair when they launch through Steam, and that same $20 netted **$19.12
rather than $14.00**.

The constraint is one of promotion, not of capability: **the Steam build must not
point players at the web store.** Anyone who finds it does so by being engaged
enough to visit the site, which is exactly the population where a 37% margin
difference is worth having.

> **Verify against the current Steam Distribution Agreement before building it.**
> Platform rules on external storefronts and price parity change, and this
> decision assumes what is true today rather than what is guaranteed. It has to
> be settled before the *Steam* purchase flow is written — the launch flow is
> web-direct, and Steam's rules do not reach it.

#### Steam ships after 1.0 — **decided 2026-07-28**

> **Launch direct from the web build. Architect every Steam seam now; implement
> none of it until the game is worth the launch window.**

**Nothing above changes.** The 1.39× break-even is a *ratio*, so it is unaffected
by when the ratio is taken; Steam is still the right storefront and the 30% is
still cheap. What moves is only the order.

**The launch window is a one-shot asset, and it is the real cost.** The listing
fee is $100 and recoupable — irrelevant. What is not recoverable is Steam's
launch weighting: wishlist conversion, review velocity and early concurrents in
the first days are what feed the algorithm, and a title that spends that window
on an unfinished game does not get a second one. **Releasing early on Steam is
strictly worse than releasing later**, which is the unusual case where the
cautious option is also the higher-revenue one.

**Launching direct first is not a compromise, it is better economics per player.**
Web-direct keeps ~97% against Steam's 70%:

| Year-round pass holder rate | ARPU net of Steam | **ARPU direct** |
|---|---|---|
| 3% | $3.36 | **$4.66** |
| 5% | $5.60 | **$7.76** |
| 10% | $11.20 | **$15.52** |

**38% more per player — against far fewer players.** That gap is the entire
argument for Steam and the entire argument for it being second: the direct
channel monetizes an audience better than Steam does, and Steam is how the
audience gets found in the first place. Build the game with the people who arrive
through a link, then buy reach.

##### What "architect for it" means concretely

Four seams, all of which cost nothing to leave open and are expensive to retrofit:

- **Identity is provider-agnostic from day one.** `11-social.md` already settles
  that the username is the identity and providers *link* to it. Steam becomes a
  third row in a linked-providers table rather than a migration. **The failure
  mode to avoid is making a Google subject ID the account's primary key.**
- **Entitlements are account-level** — decided above, and this is what makes it
  load-bearing rather than merely tidy. A launch buyer who links Steam a year
  later keeps everything, because entitlement never knew which storefront paid.
- **Payment is a rail behind an interface.** 1.0 has one rail. Steam's
  microtransaction API is the second, and the entitlement service must not be
  able to tell them apart.
- **`steamworks.js` is isolated and lazily loaded.** The browser and standalone
  builds must never import it. `../../docs/tech-stack.md` already puts the
  Electron shell in `apps/desktop/`; keep the Steam surface inside a single
  module behind a capability check.

##### The one thing that is better done early

**A "Coming Soon" store page accrues wishlists without releasing anything.**
Wishlists are the single largest input to Steam's launch visibility, they
compound over months, and the page can go up long before the build does — it
costs the $100 and the store-page work, not a release. **This is the one part of
Steam where earlier is strictly better than later**, and it is separable from
everything else here. Not scheduled; noted so the option is not lost by treating
"Steam" as one indivisible decision.

**The boosts are sold as a pair, never separately**, because they are not worth
the same. A boost is 2× capped at 10 rewarded outcomes, and a typical player wins
about 10 battles a day against a base of **388 shards/day** — 288 from attacking,
100 from holds:

| | Per day | A boost adds |
|---|---|---|
| Attack boost | 288 | **+288** |
| Defense boost | 100 | **+100** |

**The attack boost is worth 2.9× the defense boost.** Priced identically and sold
separately, a rational player buys the attack boost every day and the defense
boost never — killing the one purchase that rewards defensive play. Pairing them
removes the choice rather than pricing it, which is simpler than maintaining two
SKUs at two price points.

> **The gap widened from 2.3× when the daily curve landed**, because the bonus
> tier front-loads attack income and holds are deliberately never tiered. It
> strengthens the case for pairing rather than weakening it.

#### What that buys against the earn rate

| | Shards / 4 weeks | vs free |
|---|---|---|
| **Free** | 10,864 | — |
| **Pass holder** — both boosts every day | **21,728** | **2.00×** |

*(Boosts double income within the caps: +388/day × 28 = +10,864. Nothing else is
sold.)*

> **The 2.00× survives the daily curve exactly**, which is why the boost cap
> stayed at 10 and was not aligned to the 5-victory bonus tier. The boost doubles
> both components across precisely the range a typical player occupies; moving
> the cap to 5 would have dropped it to 1.75×.

| | Short passes | 4-week pass | **Annual pass** |
|---|---|---|---|
| Cost per 4 weeks at cap | 4 × $10 = **$40** | **$20** | **$12.31** |
| Per 1,000 shards | $3.68 | $1.84 | **$1.13** |
| **Per rune (650)** | **$2.39** | $1.20 | **$0.74** |

**Crossover is 12 days.** Beyond that the longer pass is cheaper *and* carries
more shards, so the short ones are the sporadic and trial tier rather than a
competing plan. The gap between the extremes is **3.8×**, steeper than a usual
volume discount — deliberately, because **prepaid cash matters more to a
self-funded project than à la carte margin does.**

**The short passes never overtake the long ones**, which is the ceiling promise
holding at the price layer: **$1.67 → $1.43 → $1.25 → $0.71 → $0.55 → $0.49 →
$0.44** a day, monotonic across all seven. **No quantity of short-pass buying
ever reaches a better rate**, so nothing sits above the annual.

#### The ceiling, in weeks

| Kit | Free | Pass holder |
|---|---|---|
| Competitive 18 heroes (35,100) | **15.2 weeks** | **7.6 weeks** |
| Full 27-hero roster (52,650) | 22.8 weeks | 11.4 weeks |

**The advantage is a head start, not a ceiling** — roughly two months, after which
both players sit at the same 75-point stat cap and are exactly equal on that kit.
What persists is **re-spec frequency**: a pass holder can rebuild runes 2× as
often as the meta moves. That is the honest ongoing advantage and it should be
stated rather than glossed; it is bounded by the same cap, so it buys
adaptability rather than power.

#### Three commercial consequences

- ~~**A 4-week subscription bills 13 times a year, not 12.**~~ **Moot since
  2026-07-28** — nothing bills at all. Thirteen 4-week passes would cost $260
  against $240 for twelve monthly ones, which is why a recurring 4-week cycle
  needed careful labelling in several jurisdictions. **A one-time purchase has no
  cycle**, so the disclosure problem disappears with the product. The 4-week
  *duration* still aligns with the season and guild-event cadence, which is why it
  survived as a pass length.
- **The $5 floor is what answers payment fees, not a currency.** Steam's 30% is
  proportional and unaffected either way; on the web the fixed $0.30 was 15% of a
  $2 charge and is 6% of a $5 one. See *Prices* above for why gold was rejected.
- **Maximum spend on *advantage* is $160 a year, by construction.** *No uncapped
  tier* is what makes that a wall rather than a target, so no player can be
  out-spent past it and the ladder cannot be rescued by whales.

  > **This caps purchasable advantage, not revenue.** **Clarified 2026-07-27.**
  > $160 is the ceiling on everything that touches speed or power. **Cosmetics sit
  > outside it entirely and are not bounded by it** — they cannot affect a battle,
  > a rating or a rune, so selling more of them does not move the number that
  > matters. The design promise is about *fairness*, not about the size of the
  > business.

That property is the point of the whole storefront, because it means one sentence
covers it: **everything money can buy that affects the game is in one
longest pass.** In a genre where players assume the worst, a ceiling they can
audit is worth more than any amount of reassurance. **Never add a tier above it**
— and never let a cosmetic acquire a mechanical effect, which is the only way this
promise can be broken from the other side.

### Shards cannot be bought

> **There is no way to convert money into Rune Shards.** Everything on the shelf
> is a **2× multiplier on shards you earn**, capped at 10 rewarded outcomes a
> day. A player who buys every SKU and never plays earns **nothing**.

**Decided 2026-07-27**, replacing an 800-shards-a-week purchase. The reason it
was cheap to drop is that it was never carrying much:

| Pass holder income / 4 weeks | Shards | Needs play? |
|---|---|---|
| Base earnings | 10,864 | yes |
| Boosts, 2× within the caps | +10,864 | **yes** |
| ~~Purchased shards~~ | ~~+3,200~~ | ~~**no**~~ |

Purchased shards were **12.8%** of it, so removing them moved a pass holder from
2.29× a free player to **2.00×**, and the competitive-kit timeline from 5.6 weeks
to 6.5 against a free player's 12.9. **About one week of head start**, because
the boost was always doing the work.

What that week buys is a claim that fits in a sentence and can be verified from
the store page. *"Shards are capped at 800 a week"* invites the follow-up
question; *"shards cannot be bought"* does not.

> **Stated honestly: a boost is still a purchased advantage.** A pass holder
> progresses twice as fast for the same play, and no amount of framing changes
> that. **The real protection against pay-to-win is the 75-point cap and the
> common ceiling** — every advantage here is temporary because everyone converges
> on the same fully-runed six. The shard decision is about whether the promise is
> *clean*, not about whether the game is fair. It was already fair.

**Nothing bypasses the Forge, and that was the other reason.** Selling shards —
or worse, selling rune stages directly — creates a second path to power running
alongside the first, and something has to balance the two against each other.
With only multipliers on the shelf there is exactly one road to a runed hero:
walk into the Forge, plan, and commit.

### The risk this carries, stated plainly

**If the annual pass is the ceiling of paid advantage, a competitive player will
feel they have to hold it.** That is a harder thing to defend than one-off
purchases, and it is the honest cost of a recurring model. Three things keep it
answerable, and all three are design commitments rather than messaging:

- **The free earn rate must reach a full kit on its own** in a time a player
  would consider reasonable. If it does not, the pass is not a
  convenience — it is the game.
- **The ceiling is common.** A pass holder and a free player who are both fully
  kitted are exactly equal. Money buys the road, never the destination.
- **Nothing above the annual pass, ever.** The moment a higher tier exists, the
  auditable-ceiling claim is gone and cannot be recovered.

A second-order effect worth expecting: once the annual pass is priced below its
components, the à la carte items become vestigial and most revenue arrives
through one SKU. That is fine, and it simplifies everything — but it means the
annual pass price is effectively *the* price of the game, and should be set as
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
on principle. With a 10-victory attack boost already on sale, an uncapped SKU is
worth something **only to a player winning more than 10 battles a day** — around
20 battles at 3–5 minutes each, already 80+ minutes of play. So it would have a
tiny addressable population, deliver its entire value to exactly the group whose
advantage the design is trying not to sell, and carry the full perception cost of
"they sell an unlimited multiplier."

**The daily curve makes it worse still.** Past 20 victories the base rate is
already halved, so an uncapped 2× buys a grinder back to *par* rather than
ahead — the SKU with the worst perception cost in the storefront would be selling
the removal of a taper.

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
- ~~**Whether the early curve is front-loaded at all.**~~ **Settled 2026-07-28 —
  it is, but through matchmaking rather than through the curve.** There is **no
  separate early shard bonus.** New accounts instead spend their first week in a
  **starter league whose entire defender pool is authored bots**
  (`09-matchmaking.md`), which front-loads progression as *difficulty* — easier
  opponents mean more victories, which mean more shards, with nothing extra
  injected into the economy.

  Defense is dormant there, costing the **26% of income that holds provide**, so
  starter attack income pays **1.5×** — of which 1.35× is compensation and only
  **11% is a genuine head start.** It ends at one week or **3,250 shards (five
  full runes)**, whichever comes first, and can be left early and permanently.

  **This was the better answer to the question as asked.** New players do not need
  more currency — a typical player already completes twelve heroes in 1.3 months.
  They need opponents they can beat, and a bounded ceiling over an unbounded sink
  is the wrong economy to solve an onboarding problem by granting shards into.
- ~~**Whether 3 slots stays 3.**~~ **Settled 2026-07-28: three for 1.0.** A
  fourth is future work with nothing committed to it — not to when it arrives,
  not to what unlocks it, not to whether it ever does.

  Three runes reach **53% of the theoretical stat ceiling and leave 356 points
  unclaimed**, so a fourth needs no formula to move; it is cheap to add and
  effectively impossible to take back. Adding one also **raises every gear score
  and therefore every league threshold** (`09-matchmaking.md`), which is a
  re-derivation, not a toggle.

  > **Those 356 points are the largest additive lever the design holds**, and the
  > no-nerf rule (`README.md`) is what makes keeping it unspent worth doing: a way
  > to move the meta later without touching a single number, alongside curated
  > bots and new content. Pre-committing it — to equipment, to a purchase, to a
  > date — spends an option that costs nothing to keep.
- **The rating ladder.** Placement for a new account, how much a Visible loss
  costs against a Hidden one, and whether rating is the only ladder or whether
  hold streaks rank separately. `02-squads.md` question 0 — *which squad deserves
  the stronger heroes* — cannot be answered until the stakes attached to each
  zone are set here.
- ~~**Whether there is a status track at all.**~~ **In scope — direction set
  2026-07-27.** Cosmetics are the intended long-term monetization: custom avatars,
  and **foil hero portraits that everyone who battles you sees**. The *mechanism*
  is undesigned; the direction is not.

  **Identical rosters, normally this design's hardest monetization problem, are
  what make cosmetics work here.** Every player owns the same 27 heroes, so a foil
  is the *only* way your Bramwen can differ from mine — the cosmetic is not
  decoration on top of an identity, it **is** the identity. And it is worn in
  battle, where an opponent is already studying your squad, which is the one
  surface in the game guaranteed to be looked at.

  It also cannot touch the speed-versus-ceiling promise at any price, which
  matters given the revenue curve above runs backwards. **Whether it eventually
  replaces the boosts or sits beside them is open**; nothing here forecloses
  either.

  **Randomization: non-repeating draws — set 2026-07-27.** A foil is drawn at
  random from the pool and **never repeats**, so the same one is never awarded
  twice.

  > **Non-repeating is what defuses the loot-box problem.** What regulators and
  > players object to is *unbounded spend for a specific item* — a duplicate-heavy
  > gacha where the cost to obtain one thing has no ceiling. A non-repeating draw
  > has a **fixed, computable cost to complete the set** and no wasted purchase,
  > which is the same shape as everything else here: a ceiling players can audit.

  It still wants care if the draws are *sold* rather than earned — Belgium and the
  Netherlands, plus Steam's own odds-disclosure requirement — but the objection
  shrinks from structural to procedural.

  **Both — settled 2026-07-28.** Foils are **earned** as ladder finishes and guild
  event payouts, **and bought** as the cosmetic revenue line.

  - **Earned gives the ladder a prize that is not shards.** Standing currently
    pays in the same currency as volume, which blunts it; a foil is the first
    reward that says *where you finished* rather than *how much you played*.
  - **Bought is the only channel that can raise ARPU without touching balance.**
    Subscriptions alone put ARPU at **$5.46–$18.20** (*Steam is the primary
    storefront*), where paid acquisition barely works. Earned-only forfeits that
    entirely, in a business deliberately capped at $160/year of purchasable
    advantage.
  - **Having an earned path is itself the regulatory answer.** A cosmetic set with
    no way in but purchase is a paid gacha however it is drawn; one with a real
    earned route is a reward system that also sells shortcuts.

  > **One pool, not two.** Non-repeating is a per-player property, so both sources
  > draw from **whatever that player does not yet own** — an earned foil is
  > removed from what they can buy, and vice versa. Two independent pools would
  > break the fixed, computable completion cost that made non-repeating worth
  > choosing.

  **Still open: whether a prestige tier is reserved as earned-only.** A handful of
  foils obtainable *only* by placing would make the signal unambiguous where it
  matters most. Available later at no cost; not needed to ship.
- ~~**Boost pricing, and what "cheap" means.**~~ **Set** — *Prices* above. $5 for
  three days of the boost pair, $20 for a 4-week pass, and **no way to buy
  shards at all** — which reads as **2.00× a free player's income** and a ~6-week
  head start to a competitive kit. What remains is not the price but the
  **conversion rate** it implies: *pass* spend is capped at $160/year by
  construction, so until cosmetics ship the business is a volume business and the
  target player count should be sized deliberately.
- ~~**Whether anything bounds how much a player can earn in a day.**~~
  **Settled** — *The daily curve* above. 1.5× on the first five victories, base to
  twenty, half beyond; counted in victories so a loss never burns a tier; play
  itself is never blocked. What is **not** settled is whether the same defender can
  be attacked repeatedly, which is the other half of the session loop and belongs
  to `09-matchmaking.md`.
- **Feature unlocks as an onboarding ramp.** The Hidden zone, the second and
  third attack squads, and guild membership could gate on account progress. This
  is progression that gates *complexity* rather than power, so it cannot violate
  the promise — but it is a real decision about how much game a new player sees
  on day one.
- **What guild events pay out.** `08-guilds.md` is blocked here and only here.
  Shards are the obvious answer; whether a Wing payout is shards, status, or both
  is not settled.
