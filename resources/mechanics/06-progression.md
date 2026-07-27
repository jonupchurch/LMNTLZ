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

- A new player begins with **enough shards to fully rune one squad** — they are
  never fielding bare heroes against equipped ones.
- The early earn rate is **front-loaded**, so a first full *defense* (12 heroes)
  is a matter of weeks rather than months. After that the rate flattens and the
  remaining sink is breadth plus re-speccing.
- **Rating does the rest.** A newcomer enters at the bottom of the ladder and
  meets other newcomers, so the widest gaps are rarely fielded against each
  other at all.

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

- **What a rune actually is.** Slots per hero, the stat budget a rune carries,
  whether runes have tiers or a single quality. The sizing above assumes 3 slots
  purely as an illustration — it is not a decision.
- **Earn rate and shard sources.** What a battle pays, whether a *hold* pays
  differently from an attack win, what the front-loaded curve looks like
  concretely, and how long a full 27-hero kit takes at a flat rate.
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
