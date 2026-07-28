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

### Leagues are visible

**Settled 2026-07-27.** A player sees their own league, their score, and the
threshold to the next one.

**It leaks nothing about a specific opponent**, which was the concern raised
against it. Matchmaking only offers same-league defenders, so knowing your own
league already tells you every opponent's band — naming it adds no information an
attacker did not have. The scouting limits in `07-defense-ai.md` are untouched:
filled rune slots and their elements, never stats, never effects.

**Show it on a widened match too.** When a thin league reaches into the adjacent
one the opponent genuinely is from a different band, and hiding that would leave
a player unable to explain why a defense felt off.

**Promotion is a one-way event.** The score only rises as runes are placed, so
crossing a threshold is something a player earns and cannot lose.

**Visibility makes one exploit actionable: parking just below a threshold.** At
the top of a league you hold up to **1.67× the gear of your weakest
league-mate**; cross the line and you are the weakest in the next one. Published
thresholds tell a player exactly where that line is. The next section answers it.

### Leagues bleed at both edges

> **The nearer a player is to either end of their league, the more often they are
> offered a defender from the league beyond it.**

```
pos     = (score − league floor) / (league ceiling − league floor)
P(up)   = 0.5 × max(0, (pos − 0.9) / 0.1)
P(down) = 0.5 × max(0, (0.1 − pos) / 0.1)
```

| Position in the league | Mix |
|---|---|
| at the floor | **50% from the league below** |
| 5% | 25% below |
| **10% – 90%** | **pure league** |
| 95% | 25% above |
| at the ceiling | **50% from the league above** |

**Position is measured against the league's own score range, not against the
population.** It therefore depends only on the player's own score — nobody's
matching changes because other people geared up, which is the same principle that
made thresholds fixed rather than percentile.

**The end leagues bleed one way only.** Diamond has nothing above it and Bronze
nothing below. Neither matters: Diamond spans just 1.17×, and every account
starts at Bronze's floor, so its bottom is where the game begins rather than
where anyone lands.

#### Both edges together make the curve continuous

This is what the pair achieves that the upward ramp alone cannot. Take a player
who beats league-mates below them ~65% of the time and those above them ~40%:

| Position | Mix | Win rate |
|---|---|---|
| Top of Bronze | 50% Silver | **52.5%** |
| **Bottom of Silver** | **50% Bronze** | **52.5%** |
| Middle of any league | none | ~50% |

**Crossing a threshold costs nothing**, because the two blends are the same
blend. The upward ramp alone left a sawtooth — 52.5% at the top of Bronze
dropping to 40% the moment a rune was placed — and that step *was* the reason to
park. Removing the step removes the incentive rather than taxing it:

| | Parking advantage |
|---|---|
| No mixing | +25.0 pts |
| Flat 5–10% for the top decile | +22.5 pts |
| Upward ramp only | +12.5 pts |
| **Both edges** | **0** |

So the design gets what a score band centred on the player would have given —
a continuous difficulty curve with no cliff — **while keeping leagues as a real
unit**: a name, a leaderboard, a threshold to earn, and pure same-league matching
for the 80% of players who sit in the middle of their band.

It also helps a thin league without a special case. Overlapping edges mean the
pool at a boundary is drawn from two leagues at once.

#### Promotion stops being a wall

The larger win is not the exploit. **Fixed-threshold leagues have a problem
nobody had named**: placing one rune takes a player from *strongest in their
league* to *weakest in the next*, in a single purchase — plausibly the worst
moment in the whole progression, and a direct disincentive to spend the currency
the game is built around.

Both ramps together remove it. A player crossing into Silver has already been
fighting Silver opponents up to half the time, and on arrival still meets Bronze
opponents half the time. **Promotion becomes a gradient with no felt edge.**

That also makes the currency safe to spend. Without it, a careful player learns
to hold shards near a threshold — which is the one behaviour a progression system
built on *placing runes permanently* cannot afford to teach.

> **The 65/40 figures above are illustrative, not measured.** The *shape* — a
> continuous curve with no step at a threshold — holds for any pair of win rates,
> because both edges blend the same two populations in the same proportion. The
> magnitudes want checking against `packages/sim`.

**The rating axis still carries what gear matching cannot.** Two players with
identical scores are not equally dangerous, and only outcomes reveal which.

**Neither roll is announced, but the opponent's league is labelled as always.** A
player near either end simply starts seeing names from the neighbouring league,
which is honest feedback about where they sit in their band rather than a hidden
mechanic. Nothing is concealed and nothing is proclaimed.

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

## Ambush needs no rule here

> **An ambush selects a *door*, not an opponent.**

Every battle starts the same way: matchmaking offers defenders **from your own
league**, and you choose one. The ambush roll then decides whether you meet that
player's **Visible** squad or their **Hidden** one. Both squads belong to the same
account, so both carry the same gear score and sit in the same league.

**League constraint is therefore automatic**, and no separate rule is needed —
there is no path by which an ambush reaches outside the bracket, because it never
picks anybody.

**Fighting a Hidden squad does not reveal it.** A Hidden squad is visible only
inside the battle and in that battle's replay — never in scouting, never in a
match listing, never on a profile (`02-squads.md` question 1). So an ambush
gives the attacker a fight, not a foothold: they cannot choose that door again,
and the defender may have rebuilt behind it.

**Nor can it be farmed.** The rate is +2% per *consecutive* attack win
(`02-squads.md`), so a high rate requires a long unbroken streak against
league-mates of comparable gear. Reaching the 90% cap means **45 straight wins**,
which even a dominant player inside their own league does not sustain. The rate
is a by-product of playing well, not a resource that can be accumulated.

---

## Open

- **Whether the same defender can be attacked repeatedly.** No rule says either
  way, and this document leans on the answer without stating it: *Ambush needs no
  rule here* argues a streak cannot be farmed because reaching the 90% cap takes
  45 straight wins. **That is only true if an attacker cannot pick the softest
  Visible squad in their league and beat it 45 times.** It is the other half of
  the session loop — `06-progression.md`'s daily curve bounds *how much* a day of
  play pays, and this bounds *who* it can be farmed against. It also decides
  whether one weak defender can absorb hundreds of attacks a day.
- **The rating axis.** Placement for a new account, what a Visible loss costs
  against a Hidden one, and whether hold streaks rank separately. Tracked in
  `06-progression.md`; three questions in `02-squads.md` wait on it.
- ~~**Whether leagues are visible to players.**~~ **Settled: yes** — see
  *Leagues are visible* above.
- ~~**Ambush and league boundaries.**~~ **Not a question — see below.**
- **Whether the thresholds survive the hero-numbers pass.** They are drawn from a
  simulated population, not a real one. The *shape* — five leagues, fixed
  thresholds, ratios between 1.2× and 1.7× — is the decision; the numbers are a
  starting point.
