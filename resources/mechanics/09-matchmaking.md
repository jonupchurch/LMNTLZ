# LMNTLZ · Mechanics 09 — Matchmaking

Who you are offered as an opponent, and why.

PvP is asynchronous — you attack a **snapshot** of another player's defense, and
the engine plays it. So matchmaking is not pairing two live players; it is
**choosing which defense snapshots to put in front of an attacker.**

---

## Two axes, not one

| Axis | Measures | Mechanism |
|---|---|---|
| **Gear** | How much rune investment a player is carrying | **Leagues** — this document |
| **Skill** | Whether they win with it | **Rating** — still open, see below |

They are separated deliberately. Gear is knowable before a battle and changes
slowly; skill is only knowable from outcomes. Collapsing them into one number
means a well-played weak account and a badly-played strong one are treated as
identical, which is exactly the confusion the design is trying to avoid.

**This document settles the gear axis.** Rating remains open in
`06-progression.md`.

---

## The gear score

> **`score = 2.5 × effective stat points`**, summed over every rune a player has
> currently placed.

Rune stages grant 20, then 10, then 5 stat points, then a utility effect:

| Stage | Grants | Effective points | **Score** | Cumulative shards |
|---|---|---|---|---|
| 1 | +20 | 20 | **50** | 150 |
| 2 | +20 +10 | 30 | **75** | 300 |
| 3 | +20 +10 +5 | 35 | **90** | 450 |
| 4 | + utility effect | 35 + **15** | **125** | 650 |

| | Score |
|---|---|
| Starter grant — 12 heroes, one complete rune each | **1,500** |
| Full kit — 81 runes | **10,125** |

### Why not shards spent

Shards measure **investment**; the league needs **power**. They diverge because
every stage costs a flat 150 while the gains diminish — so 450 shards buys 35
points and the next 200 buys an effect. A shard-proportional score would rate a
player who bought three +5 traces as equal to one who bought three +20 majors.

### Why the effect is scored at 15 points, and what that is tied to

**The number is the utility catalog's own tuning, not a separate decision.**
`06-progression.md` sizes every effect in the **10–20 stat-point band** against
the late-game bar of 6.7 points per 150 shards. Fifteen is the middle of it.

> **If the catalog's magnitudes move, this number moves with them.** They are the
> same quantity asked twice, and letting them drift apart is what creates the
> exploit below.

**A stage-4 value of 200 was proposed and would have been exploitable.** It
implies an effect worth **44 stat points**, nearly triple what the catalog is
written to. The consequence is a park:

| | Score | Stat points |
|---|---|---|
| Full roster of **stage-4** runes | 16,200 | 2,835 + 81 effects |
| Full roster of **stage-3** runes | **7,290** | **2,835** |

**Never buy the last stage: keep 35 of 35 stat points, score 45%, and meet
opponents with half your investment.** One decision, repeated, and it is the
strongest play available. Scoring the effect at what it is worth removes the park
by construction — at 15 points the leverage of stopping early is exactly **1.00×**
at every stage.

| If an effect is worth… | Stage 4 scores | Park leverage |
|---|---|---|
| 10 points | 112 | 1.13× |
| **15 — chosen** | **125** | **1.00×** |
| 20 | 138 | 1.10× |
| 44 *(implied by 200)* | 200 | **2.22×** |

### Placed, not spent

The score reads the runes **currently on heroes**, not lifetime spend. Ten
rebuilds of one slot is 6,500 shards for 125 of power, and a cumulative score
would rate that player eight leagues above their strength.

> **Residual risk, accepted:** a player can destroy a stage-4 rune down to stage 1
> to drop a league — losing 43% of the slot's stat points to shed 77% of its
> score, a **1.8× sandbag leverage**. It costs real power and 150 shards per slot,
> and the rating axis corrects for it over time. Worth watching, not worth a rule
> yet.

---

## Leagues

> **Five leagues on fixed score thresholds. You are only offered opponents from
> your own league.**

| League | Score band | Share of a mature population | Max gear ratio inside |
|---|---|---|---|
| **Bronze** | 1,500 – 2,500 | 15.6% | 1.67× |
| **Silver** | 2,500 – 4,000 | 19.6% | 1.62× |
| **Gold** | 4,000 – 6,200 | 18.9% | 1.52× |
| **Platinum** | 6,200 – 8,700 | 14.9% | 1.41× |
| **Diamond** | 8,700 – 10,125 | **31.0%** | **1.17×** |

*(Shares simulated over 20,000 accounts with exponential tenure and 20%
subscribers.)*

**Nobody ever faces more than 1.67× their own gear.** Diamond is the largest
league because roughly a quarter of a mature population sits at the cap — and
those players are genuinely identical, so a crowd there is the correct outcome
rather than a flaw.

### Fixed thresholds, not population quintiles

Equal-population leagues would guarantee pool size, but **a player would be
demoted because other people geared up.** For a *skill* rating that is normal;
for a *gear* rating it is maddening, because nothing about that player changed.

Fixed thresholds mean **the score only rises as runes are placed, so a league is
never taken away.** Promotion is an event the player earned; demotion effectively
does not happen.

### When a league is thin

**Widen into the adjacent league, nearer first.** A Bronze player short of
opponents sees Silver before anything else; a Diamond player sees Platinum. The
widening is per-request and never persists, so a temporarily quiet league does
not permanently redefine anyone's bracket.

At launch this is the normal case rather than the exception: every account starts
at exactly 1,500, so Bronze holds everyone and the other four are empty.

### Why not one standard deviation

The proposal was a band of ±1 SD, widening to ±2 if thin. Simulated, **it does not
select**:

| Player at | 1 SD band covers |
|---|---|
| **Starter** | percentiles **0–41** |
| Median | 16–69 |
| Maxed | 60–100 |

SD comes out at **36% of the entire power range**, because the population is
right-skewed with a quarter of accounts at the cap — nothing like the normal
distribution the rule assumes. A new player would meet opponents at **3× their
gear**, and widening to 2 SD makes it worse.

**A minimum band width does not help either**, because the failure is that bands
are too *wide*. The problem a minimum solves — an empty pool at launch — is
already answered by every account starting in the same league.

---

## Open

- **The rating axis.** Placement for a new account, what a Visible loss costs
  against a Hidden one, and whether hold streaks rank separately. Tracked in
  `06-progression.md`; three questions in `02-squads.md` wait on it.
- **Whether leagues are visible to players.** A named league is legible and gives
  progression a shape, but it also tells an opponent what they are facing. It
  interacts with the scouting limits in `07-defense-ai.md`.
- **Ambush and league boundaries.** Ambush is earned by consecutive attack wins
  (`02-squads.md`) and routes into a Hidden squad. Whether the ambushed defender
  must be in the attacker's league, or whether an ambush may cross upward, is
  unsettled — and it is the obvious place to look for exploits, since ambush pays
  double.
- **Whether the thresholds survive the hero-numbers pass.** They are drawn from a
  simulated population, not a real one. The *shape* — five leagues, fixed
  thresholds, ratios between 1.2× and 1.7× — is the decision; the numbers are a
  starting point.
