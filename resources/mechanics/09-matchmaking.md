# LMNTLZ · Mechanics 09 — Matchmaking

Who you are offered as an opponent, and why.

PvP is asynchronous — you attack a **snapshot** of another player's defense, and
the engine plays it. So matchmaking is not pairing two live players; it is
**choosing which defense snapshots to put in front of an attacker.**

---

## Two axes, not one

| Axis | Measures | Mechanism | Does |
|---|---|---|---|
| **Gear** | How much rune investment a player is carrying | **Leagues** — this document | **restricts** who is in the pool |
| **Skill** | Whether they win with it | **Rating** — `06-progression.md` | **orders** the pool; never restricts it |

They are separated deliberately. Gear is knowable before a battle and changes
slowly; skill is only knowable from outcomes. Collapsing them into one number
means a well-played weak account and a badly-played strong one are treated as
identical, which is exactly the confusion the design is trying to avoid.

> **Only the gear axis filters.** *The pool is every defender* below means rating
> can order what a player sees first but can never remove anybody from it. That
> division is what lets both rules stand together.

**This document settles the gear axis**; `06-progression.md` settles rating.

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

#### Considered and rejected: drawing only from the lower half above

**Raised and dropped 2026-07-27.** The proposal was that a player bleeding upward
should meet only the *bottom half* of the league above, so the jump is gentler.

**It tightens the worst case, and 1.67× was never the problem.** The upward bleed
fires above `pos` 0.9 — score **2,400** in Bronze — so the widest gap it can
produce is 4,000 / 2,400 = **1.67×**, exactly the bound *Leagues* already
promises. The rule that genuinely broke that promise was the thin-league widen at
**2.67×**, and bots fix that instead.

| Upper-league draw | Range | Worst ratio | Parking advantage |
|---|---|---|---|
| **All of Silver — as written** | 2,500 – 4,000 | 1.67× | **0** |
| Bottom half of Silver | 2,500 – 3,250 | **1.35×** | **+2.5 pts** |

**And it costs the property the section exists for.** The bleed's job at a ceiling
is to make the top of a league *harder*, so parking below the line is not
attractive. Drawing from the nearer half makes it easier, which hands back an
advantage that was zero by construction — 52.5% at the top of Bronze becomes 55%
against the 52.5% at the bottom of Silver.

**It is recoverable — the fix is a constant, not a different rule.** Bleeding
**62.5%** at the ceiling rather than 50% restores 52.5% and buys the tighter ratio
for free. That is the version to reach for if the 1.67× ever reads badly in
practice.

> **Do not mirror the restriction downward.** Restricting *both* directions pulls
> both blends toward the middle and widens the step to **5 points** — it is the
> far tail of the adjacent league that does the compensating.

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

**Pad it with bots first; widen only if that is not enough.** See *Curated bot
defenders* below — a bot placed inside the band keeps matching in-band, while
widening reaches outside it and **breaks the 1.67× guarantee above**, up to 2.67×
for a player at a league floor.

**Widening is the fallback to the fallback.** Into the adjacent league, nearer
first: a Bronze player short of opponents sees Silver before anything else; a
Diamond player sees Platinum. It is per-request and never persists, so a
temporarily quiet league does not permanently redefine anyone's bracket.

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

## The pool is every defender — **settled 2026-07-27**

> **Every eligible defender in your league is in the pool, every time. There is
> no slate, no rotation, and no cooldown on re-attacking someone you have already
> fought.**

**The design goal is that people play a lot**, and a rule restricting *who* you
may attack restricts the playing itself. `06-progression.md`'s daily curve already
bounds what volume *pays*; bounding the opponent as well would tax the same
behaviour twice.

### What was considered, and why it was dropped

A **slate of five** refilling on use, plus *no reappearance until you have fought
20 others*. It was proposed against three costs, and analysis of the decision
found two of the three weaker than they first read:

| 20 battles/day | Wins | Shards/day | vs. typical free |
|---|---|---|---|
| Typical free player | 10 | 388 | — |
| **Subscriber**, $20 / 4 weeks | 10 | 775 | **2.00×** |
| **Farming one weak defender** | 18 | **879** | **2.27×** |

1. ~~**The farm out-earns the subscription.**~~ **Accepted.** It does — a player
   at the top of a league holds up to 1.67× the weakest league-mate's gear, wins
   ~90%, and rides that to the capped ambush rate. But the boosts sell *speed to a
   common ceiling*, and a grinder reaching it faster than a subscriber costs the
   subscriber nothing. Long-term monetization moves toward **cosmetics**, which
   this cannot touch at all.
2. ~~**The defender's income inverts.**~~ **It self-corrects.** Being farmed 300
   times a day pays ~300 shards passively — which funds that player *out of* being
   the softest target in their league. It is floor protection, and it cannot be
   sought, because only one account can be the weakest.
3. ~~**Counter-building becomes solve-once.**~~ **The ambush already taxes it** —
   see below. Solving a Visible squad drives the streak that stops you fighting
   Visible squads.

### Inactive accounts leave the pool

The one case where none of the three self-corrections applies is an account that
has stopped playing: it never edits a squad, never gears up, and its hold income
accrues to somebody who is not there.

> **An account idle for 30 days is removed from the matchmaking pool, and
> re-enters on its next activity.** Settled 2026-07-27.

**Activity means an attack battle or a defense-squad edit** — both are deliberate
acts by a player who is still tuning. A bare login is not enough, or an absent
account could keep collecting hold income by opening the game and doing nothing.

**Leaving the pool is its own enforcement.** Nobody can attack a defense nobody is
offered, so an idle account's passive income goes to zero without a second rule
saying so. Nothing is taken away, and a returning player is back in the pool
immediately — with a 30-day-stale squad against a moved meta, which is a fair
cost and not a punishment.

#### It thins Bronze the most, which is where it hurts

Churn concentrates in the first weeks, and **every account starts at Bronze's
floor**. So the league with the most accounts on paper has the fewest *active*
ones, and this rule takes the difference out of exactly the pool that can least
afford it.

It does not bite at launch — everyone is in Bronze and everyone is new — but it
should be expected around the point the first cohort ages out. **No new rule is
needed**: *When a league is thin* already widens into the adjacent league per
request, and this is precisely the case it was written for. What it does mean is
that the league share percentages above describe **accounts, not opponents**, and
the two will diverge.

---

## Curated bot defenders — **direction set 2026-07-27**

> **The pool is seeded with authored defense records that no player owns, placed
> deliberately across leagues and revised as the meta moves.**

A bot is not an AI opponent in the usual sense. It is **a gear score, a Visible
squad, a Hidden squad, and a `07-defense-ai.md` configuration** — which is
precisely what a player's defense record is, minus the account.

### Why they cost this design almost nothing

**Nobody ever fights a human in LMNTLZ.** PvP is asynchronous: every defense is a
snapshot the engine plays, a live player's included. A bot and a human defender
are therefore not merely indistinguishable, they are **the same kind of thing** —
the only difference is whether the hold income accrued to someone.

That is unusual, and it has a practical consequence: **disclosing which defenders
are bots would cost very little**, because there is no hidden-human illusion to
protect. Most games cannot say that.

### Curation is a balance lever the rest of the design lacks

Two settled rules make ordinary balancing expensive here. Runes are **permanent
and destroyed on replacement**, so nerfing an effect devalues something a player
spent 650 shards on. And **replays are stored, never re-simulated**
(`../../docs/tech-stack.md`), so a patch can never reach backwards.

**Seeding the pool with squads that punish whatever is over-represented moves the
meta without changing a number.** If everyone stacks Fire, the answer can be more
Water defenders rather than a Fire nerf — reversible, targeted by league, and it
takes nothing away from anyone.

### What follows without needing a decision

- **A bot needs both zones**, or the ambush roll has nothing to route into.
- **Bots earn nothing and hold nothing.** There is no account for shards to reach.
- **Bots never join guilds and never score in events.** `08-guilds.md` counts
  members.
- **A bot's gear score places it**, exactly as a player's does, so the league
  bands and the edge-bleeding rules apply unchanged.
- **They answer the thin-pool cases directly** — launch, when every account is in
  Bronze, and the churn-thinning described above.

### Scaffolding, not furniture — **settled 2026-07-27**

> **Bots sit in the pool always, not only when a request comes up short. They are
> built to be competitive, they carry a fixed rating, and beating one counts.
> Their numbers are a per-league dial, and the intent is to remove them
> eventually.**

**Three jobs, and they retire in order.**

| Job | Lifespan |
|---|---|
| Make the pool real when there is no population | launch only |
| **Even out league populations** | as long as the distribution is lumpy |
| Apply meta pressure without touching a number | indefinite, and the reason to keep a few |

**Nothing may depend on them permanently.** They are a dial the design can turn to
zero, so any rule that would break when the last bot is removed is a rule written
wrong. The rating anchors below are safe on exactly this test: an anchor
bootstraps a population and is not needed once one exists.

#### Evening out leagues repairs a guarantee that was broken

*Leagues* above states flatly that **nobody ever faces more than 1.67× their own
gear** — and *When a league is thin* quietly breaks it. Widening is unconditional,
so a Bronze player at the **1,500 floor** can be served a Silver player at the
**4,000 ceiling**: **2.67×**, well outside the promise.

**Edge-bleeding never does this**, because it fires only near a boundary where the
two bands nearly touch. Widening does, because it fires regardless of position.

| Fallback for a thin league | Worst gear ratio faced |
|---|---|
| Widen into the adjacent league | **2.67×** — breaks the guarantee |
| **Pad the league with bots** | **1.67×** — the guarantee holds |

> **So bots are the preferred answer to a thin league and widening is the last
> resort**, rather than the other way round. A bot placed inside the band keeps
> matching in-band; reaching into the next league does not.

#### A fixed rating makes them calibration anchors

A rating means nothing without a population to derive it from, and at launch there
isn't one. **Bots have a rating that does not move**, so they are fixed points the
live population sorts itself against. That is worth more than the pool-filling.

#### Why "worth points" is safe here

An always-present, curated opponent that never adapts would be a rating farm under
an accumulating score. It is not one under
`06-progression.md`'s **convergent** rating: beating an opponent below you moves
you almost nothing, so grinding bots converges you to the bots' level and stops.

**The shape of the number defends this, not a rule** — the same property that
makes farming one weak defender pointless.

### Open

- **What a bot's rating should be**, and how many sit in each league. Both are
  numbers rather than mechanisms, and both want a real population to check
  against.

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

**It can be farmed, and that is priced rather than prevented.** An earlier
version of this section argued the streak was safe because reaching the 90% cap
takes **45 straight wins**, *"which even a dominant player inside their own league
does not sustain."* That is true against 45 *different* league-mates and false
against the same one — and *The pool is every defender* below makes the same one
available. The honest version:

> **A capped ambush rate is the streak routing you into the squad you cannot
> scout.** At 90%, nine attacks in ten land on a Hidden defense the attacker has
> never seen.

So farming a single defender does not compound the way it first appears. It
solves the Visible squad and then stops mattering, because the Visible squad is
what the attacker stops fighting. The Hidden one has to be solved separately,
through battles that are lost before they are won and from replays rather than
from scouting. **The streak is still a by-product of playing well; what it buys
is a harder fight that pays more.**

---

## Open

- ~~**The rating axis.**~~ **Settled 2026-07-27 in `06-progression.md`** — one
  visible, skill-convergent number that orders the pool and never restricts it,
  starting at 1000 and converging over ~30 battles, with a **2× bonus on a Hidden
  victory**. `02-squads.md` questions 0 and 2 are answered by it.
- ~~**Whether leagues are visible to players.**~~ **Settled: yes** — see
  *Leagues are visible* above.
- ~~**Ambush and league boundaries.**~~ **Not a question — see below.**
- **Whether the thresholds survive the hero-numbers pass.** They are drawn from a
  simulated population, not a real one. The *shape* — five leagues, fixed
  thresholds, ratios between 1.2× and 1.7× — is the decision; the numbers are a
  starting point.
