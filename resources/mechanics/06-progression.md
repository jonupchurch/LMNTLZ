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

- **The three boosts must target distinct stats.** 20 + 10 + 5 on a single stat
  is 35 points, which overflows the tightest headroom on the roster.
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

### Utility slots are a shared menu

**One menu of roughly 8–12 generic effects, and any hero may take any of them** —
`+1 reach`, open the battle with a shield, first strike cannot miss, ignore the
first control effect, and so on. The exact list is open.

The alternative — authoring utility options per hero, tied to that hero's own
powers — was rejected on scope and on principle. On scope, 27 heroes × ~3 options
is **81 new effects**, a fourth passive layer roughly the size of the 40 passives
already written. On principle:

> **Hero identity already has a home**: 6 powers and 3 passives each, 127 in
> total. Runes should be where the **player** expresses themselves, not where
> more of the hero gets authored.

Two things to watch when the menu is written:

- **Volume.** Three runes × six heroes is **18 utility effects per squad**, and
  both sides field them — so up to 36 are live in a battle, on top of 36 powers
  and 36 passives. "Significant" has to be weighed against a battle screen that
  already carries twelve hero chips.
- **Pricing.** A utility slot costs 200 against 150 for twenty stat points. If
  the effects really are significant, that is cheap, and every player buys
  utility first on every rune. The price and the power level have to be set
  together.

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

- **The utility menu.** Roughly 8–12 shared effects, and their power level is the
  dial that balances breadth against depth — so it is a balance decision, not a
  flavor pass. Also unresolved: **volume.** Three runes × six heroes is 18 utility
  effects per squad and up to 36 live in a battle, on top of 36 powers and 36
  passives.
- **Utility pricing against its power.** 200 shards buys an effect where 150 buys
  twenty stat points. If the effects are genuinely significant that is cheap, and
  every player completes every rune before starting a new one. Price and power
  have to be set together.
- **Earn rate and shard sources.** What a battle pays, whether a *hold* pays
  differently from an attack win, what the front-loaded curve looks like
  concretely, and how long a full 27-hero kit takes at a flat rate. For scale, a
  complete kit is **52,650 shards** and the starter grant is 7,800.
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
  work exists to support it; whether it is in scope is undecided.
- **Feature unlocks as an onboarding ramp.** The Hidden zone, the second and
  third attack squads, and guild membership could gate on account progress. This
  is progression that gates *complexity* rather than power, so it cannot violate
  the promise — but it is a real decision about how much game a new player sees
  on day one.
- **What guild events pay out.** `08-guilds.md` is blocked here and only here.
  Shards are the obvious answer; whether a Wing payout is shards, status, or both
  is not settled.
