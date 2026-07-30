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
| 3 | +20 +10 +5 | 35 | **87.5** | 450 |
| 4 | + utility effect | 35 + **15** | **125** | 650 |

> **⚠️ Stage 3 read `90` until 2026-07-29 and that was an arithmetic slip.** The
> formula gives `2.5 × 35 = 87.5`; `90` implies 36 effective points, which no stage
> grants. The other three rows agree with the formula exactly, and **nothing
> load-bearing was affected** — both anchors below are built on stage 4, and both
> are league boundaries. Found by `apps/api/tests/matchmaking/gearScore.test.ts`,
> which asserts 88 (the rounded total) and carries the reasoning.
>
> **Rounding happens once, on the total**, not per rune: the score sums effective
> points across every placed rune and multiplies by 2.5 once. Rounding each rune
> would drift — forty stage-3 runes would gain 20 points of phantom power.

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

#### Hoarding is not a sandbag — **examined and dismissed 2026-07-28**

The obvious neighbour of the risk above is **banking shards instead of spending
them**, staying at the Bronze floor with a wallet full of undeployed power. It
looks cheaper than destroying a rune, since it costs neither stat points nor
shards. **It is not an exploit, and the reason is worth stating as a rule.**

> **A sandbag exists only where score and power move by different amounts.**
> Destroying a stage-4 rune sheds **77% of its score for 43% of its stat
> points** — that gap is the exploit. **Hoarding moves neither.** It declines to
> move both, together, and leaves them exactly in step.

So a hoarder is **never stronger than their leaguemates.** Their score is their
power, the league is computed from that score, and every match they play is
correctly bounded the whole time. There is no mismatched opponent anywhere in the
scenario and therefore nobody to protect.

**Nor does it pay.** The income case was checked and does not survive: the notion
that a hoarder farms easy opponents assumes they are strong for their league,
which is precisely what they are not. They face their own level, win at their own
rate, and **shard income is flat per victory regardless of opponent strength**
(20 / 40 / 10 / 20). Hoarding earns exactly what deploying earns. What it buys is
a delay, and delay is its own cost.

**Priced and rejected: scoring the unspent balance.** `score = 2.5 × placed stat
points + 0.2 × banked shards` was drafted before the above was clear. It should
stay rejected on its own merits even if hoarding ever does become a problem:

> **Banked shards are not power, and the league's whole job is to bound power.**
> Scoring them puts a player *above* their real combat strength — inventing the
> very mismatch the league exists to prevent, in order to punish someone who was
> not creating one.

##### The one real window — recompute on placement

There is a single moment where hoarding *does* create a mismatch: **between
deploying a month of shards and the league noticing.** A player who spends 11,640
shards at once jumps from 1,500 to ~3,738, and until that is reflected they are a
Gold-weight player sitting in Bronze — genuinely stronger than their leaguemates,
which is the exact condition named above.

> **So the gear score is recomputed on every rune placement, and league
> membership follows it immediately.** Not nightly, not per-season. This is the
> only rule hoarding needs, it is cheap — the score is a sum over placed runes,
> recomputed exactly when that set changes — and it closes the window to zero.

`packages/sim` should still watch the rune-destruction sandbag above, which is a
real 1.8× and is not addressed by any of this.

##### One caveat: this bounds gear, not skill

Everything above is about **power**, and the league system only ever promised to
bound power. **A skilled player holding a low gear score still faces their own
gear level and not their own skill level** — rating orders within a league and
never restricts it, so it can sort them to the top of a weak pool but cannot put
a worthy opponent in it.

**The ladder is immune and the events are not.** A convergent rating pays almost
nothing for beating opponents below you, so farming a low league cannot climb it —
that is the two-axis design working exactly as intended. What is exposed is
anything counting *raw victories*, which is why `08-guilds.md` sizes the same
sandbag against the event metric and lands at **1.17×** after the punching-up
bonus and the hold term absorb it. Measured there, not here.

---

## Leagues

> **Five leagues on fixed score thresholds. You are only offered opponents from
> your own league.**

| League | Score band | Share of a mature population | Max gear ratio inside |
|---|---|---|---|
| **Bronze** | 1,500 – 2,500 | 15.6% | 1.67× |
| **Silver** | 2,500 – 4,000 | 19.6% | 1.60× |
| **Gold** | 4,000 – 6,200 | 18.9% | 1.55× |
| **Platinum** | 6,200 – 8,700 | 14.9% | 1.40× |
| **Diamond** | 8,700 – 10,125 | **31.0%** | **1.16×** |

*(Shares simulated over 20,000 accounts with exponential tenure and 20%
pass holders.)*

> **⚠️ The ratio column read `1.62 / 1.52 / 1.41 / 1.17` until 2026-07-29.** The
> ratio inside a band is just `ceiling ÷ floor`: Silver is `4000 ÷ 2500 = 1.60`,
> not 1.62, and Gold is `6200 ÷ 4000 = 1.55`, not 1.52 — the two middle rows were
> out by more than rounding and in opposite directions. Platinum (1.403) and
> Diamond (1.164) had simply been rounded up rather than to nearest.
>
> **Nothing load-bearing moved.** Bronze's 1.67× was correct, and Bronze is the
> row that matters — it is the tightest ratio in the game and the sole source of
> the `1.67×` promise, because it is the narrowest band on the lowest floor. The
> corrected numbers also strengthen the claim below: the bound gets *monotonically*
> kinder as players climb, which the old Silver/Gold pair broke.
> `apps/api/tests/matchmaking/gearBound.test.ts` sweeps all 8,626 scores and pins
> every one of these five values.

**The shares are reproduced independently.** `population.test.ts` builds the same
20,000-account model from `06-progression.md`'s income rates and lands all five
within 1.3 points — the largest gap is Gold at 20.1% against 18.9%. Silver and
Gold come out in the opposite order there, and **neither derivation is precise
enough to settle which of the two middle leagues is larger**; both agree they are
close to equal and close to a fifth each.

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
| **Pass holder**, $20 / 4 weeks | 10 | 775 | **2.00×** |
| **Farming one weak defender** | 18 | **879** | **2.27×** |

1. ~~**The farm out-earns the subscription.**~~ **Accepted.** It does — a player
   at the top of a league holds up to 1.67× the weakest league-mate's gear, wins
   ~90%, and rides that to the capped ambush rate. But the boosts sell *speed to a
   common ceiling*, and a grinder reaching it faster than a pass holder costs the
   pass holder nothing. Long-term monetization moves toward **cosmetics**, which
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

### Where the bots live — **settled 2026-07-28**

> **Bots carry a wide spread of ratings, not one per league**, and they are
> distributed heavily toward the bottom:

| Where | Share of the bot population |
|---|---|
| **Starter league** | **30%** |
| Bronze — the lowest gear league | 20% |
| Silver | 20% |
| Gold | 20% |
| Platinum | 10% |
| **Diamond and any league above it** | **0% — hand-seeded only** |

**The weighting is upside-down from the player population on purpose**, and every
part of it is load-bearing:

- **The starter league is 100% bots by definition**, so it needs the deepest pool
  — every opponent a new player sees for a week comes from it, and at launch that
  is the entire population.
- **Low leagues are where the pool is genuinely thinnest.** Not just at launch:
  Bronze is also where **inactive accounts thin hardest** (*Inactive accounts
  leave the pool*), so it stays thin permanently.
- **Bronze is where the widen breaks a guarantee.** *When a league is thin*
  serves a Bronze-floor player opponents up to **2.67× their gear** against a
  stated maximum of 1.67×. Padding Bronze is what repairs it, which is why it
  gets the largest league share.
- **High leagues need it least.** Platinum holds the most engaged players, who are
  the least likely to find an empty pool.

#### Diamond gets bots that were written, not bots that were needed

**Bots below the top league are padding; bots at the top are commentary.** They do
different jobs and should be authored differently:

- **Padding bots fill a pool** and are generated to a spec. They are **scaffolding
  and they retire** as the real population arrives (*Scaffolding, not furniture*).
- **A Diamond bot is a balance lever.** At the top there is no pool to fill — the
  best players are all there — and a generic bot would just be a free win
  distorting the ladder. Every one is **specifically designed and seeded** to
  apply meta pressure, which is the additive lever the no-nerf rule reaches for
  before touching a number.

> **So the percentages are the scaffolding and they decay; the hand-seeded ones
> are the furniture and they do not.** That is the same distinction *Scaffolding,
> not furniture* already draws, now with a line showing exactly where it falls.

#### A spread of ratings, not a midpoint

**Pegging every bot in a league to that league's midpoint was the alternative and
it is worse.** Bots are **calibration anchors** (*A fixed rating makes them
calibration anchors*) — and one anchor per league calibrates a single point, while
a spread calibrates the whole band. A new player converging over ~30 provisional
battles should be able to lose to a strong bot and beat a weak one **inside the
same league**, which is what makes the resulting rating mean anything.

### Open

- **How many bots in total.** The shape above is settled; the absolute count is a
  launch-tuning number that wants a real population. One floor worth noting: a
  starter player fights roughly **140 battles in their week**, so the starter pool
  has to be deep enough that an authored *ramp* still reads as a ramp rather than
  as the same six opponents on repeat.

---

## The starter league — **settled 2026-07-28**

> **A new account begins in a league whose entire defender pool is authored bots.
> It lasts one week or 3,250 shards earned, whichever comes first, and a player
> may leave early at any time. Leaving is permanent.**

**This replaces the early-progression bonus rather than adding to it.** The
question it answers was whether new players need extra shards; the answer is that
they need **beatable opponents**, and easier opponents produce more victories,
which produce more shards on their own. The front-load arrives as *difficulty*
instead of as currency — which matters in an economy built as a bounded ceiling
over an unbounded sink, where every granted shard is one the mid-game never gets
to absorb.

### What it fixes, beyond onboarding

- **The new-player gap, absolutely.** A fresh account is **1,500 gear score
  against a full kit's 10,125 — 6.75×.** Leagues bound that to 1.67× *only if
  Bronze is populated*. An authored pool bounds it by construction, with no
  dependence on who happens to be playing.
- **Cold start at launch.** Every account begins here, so **launch week is
  bot-only for the entire population** and everyone graduates together. The
  emptiest the game will ever be is the one week nobody can tell.
- **It can teach counter-building**, which nothing else does. The ramp is
  authored, so bot 1 can carry one obvious exploitable Bane and bot 6 none — a
  tutorial for the game's actual thesis without a tutorial mode existing.
- **It calibrates rating against known quantities.** Bots carry fixed ratings as
  anchors (above), and provisional **K=40 covers the first 30 battles** — so a
  starter week sets a player's initial rating against authored opponents rather
  than against whoever was in the pool.

### Defense is dormant, and the income is corrected for it

**Nothing attacks a starter player's defense.** The offered pool is bots, so no
starter attacks another, and bots do not attack — bot *offense* AI does not exist
and is not worth building for one week (`07-defense-ai.md` covers defenders only).
Building a defense during the starter week is **preparation for graduation**, and
should be presented that way.

That removes **holds — 100 of a typical 388 shards a day, 26%** — so the starter
league pays **1.5× on attack income**, daily curve intact:

| | Normal | Starter, ×1.5 | Net |
|---|---|---|---|
| Light | 223 | 248 | 1.11× |
| **Typical** | **388** | **432** | **1.11×** |
| Heavy | 603 | 675 | 1.12× |

> **Most of that multiplier is not a bonus.** 1.35× merely replaces the dormant
> holds; only the remaining **11%** is help. Stating it honestly matters, because
> a 1.5× that reads as a 50% head start would misprice every figure downstream.

**The daily curve stays on**, taper included. A flat 1.5× replacing the curve was
considered and has the wrong gradient — it pays a heavy player **1.37×** against a
typical player's 1.2×, rewarding exactly the behaviour an authored pool should not
encourage.

### Two exits, and why both are needed

**One week, or 3,250 shards — five full runes — whichever lands first.** They fire
for different players:

| | Days to 3,250 | Exits on |
|---|---|---|
| Light — 248/day | 13.1 | **Time** |
| Typical — 432/day | 7.5 | **Time**, barely |
| Heavy — 675/day | **4.8** | **Shards** |

**Time protects the slow player; the shard cap stops the fast one over-farming an
authored pool.** A heavy player would otherwise take a full week of guaranteed-
beatable opponents, which is neither a fair head start nor an interesting week.

**Opting out is voluntary and permanent.** A player who wants real opponents on
day two should have them; a player who returns after leaving would be farming a
pool built for beginners. One-way keeps it honest and needs no rule beyond a flag.

#### Joining a guild is the third exit

> **No member of a guild is ever in the starter league.** Accepting an invitation
> graduates a player immediately, and leaving the guild later does not send them
> back.

**This gives the exit a reason rather than a button.** "Opt out" asks a player who
has been playing for two days to judge whether they are ready; *joining a guild*
is a thing they wanted to do anyway, and it answers the same question by
implication. Finding people is the signal.

**It also keeps one invariant clean.** Guild event assignments **lock when an
event starts** (`08-guilds.md`), so a member graduating mid-event would change
their own scoring context after the lock — a whole class of edge cases that simply
cannot arise if guild membership and starter membership are mutually exclusive.

> **It is not closing an event exploit, which is worth recording because it looks
> like it should be.** A guild parking members in the bot pool gains essentially
> nothing: a starter wins far more often but banks **no holds**, and the two
> cancel to within 3% — **20.5 event points a day against a normal player's
> 21.1.** The dormant defense pays for the easy opponents almost exactly.

**Both doors carry the warning.** A guild has every reason to recruit new players,
and this rule means recruiting ends their protection — so the cost is stated at
**every point a player could cross the line, in either direction**:

| Trigger | Must warn |
|---|---|
| Receiving a guild invitation | Before accepting |
| **Applying to a guild** | Before submitting — the application itself is the commitment |

The warning names both things that end, because they are not the same thing:
**beginner status** — bot-only opponents, the protection — and **the beginner
bonus** — the 1.5× on attack income. A player who reads only "you'll leave the
starter league" has not been told their income drops.

> **Warn on the application, not just on the acceptance.** A player who applies
> and is admitted a day later would otherwise be graduated by someone else's
> click, at a moment they were not present for. The application is where they are
> actually making the decision, so that is where the decision has to be described.

Accepting or applying is a confirmed action stating what it costs — never a
one-click yes.

> **This is the one carve-out from *The pool is every defender*.** That rule is
> otherwise absolute, and the exception is deliberately bounded — a single week,
> once per account, at the very start, opt-out at will. Naming it as an exception
> is what stops it becoming a precedent for others.

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
