# Phase 0 Research: Progression

**Feature**: `010-progression` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q1 is already answered in canon** and the plan did not know it.
Q2 needed a simulated population and has had one. Q3 is a decision.

**One finding from the simulation that the design has not accounted for**: the
Hidden 2× rating bonus makes rating **non-zero-sum**, so the population inflates.
Recorded at the end with the arithmetic and a recommendation.

---

## Q1 — The daily tier boundaries — ~~open~~ **recorded in canon**

**The plan says *"the shape is decided; the brackets are not."* The brackets are
decided**, in `06-progression.md`:

> *"Attack income is tiered by the day's victory count: the first 5 victories pay
> 1.5×, victories 6–20 pay the base rate, and everything past 20 pays 0.5×. Play is
> never blocked and nothing is ever capped at zero."*

| Victories that day | Multiplier | Chosen door | Ambush |
|---|---|---|---|
| **1 – 5** | **1.5×** | 30 | 60 |
| 6 – 20 | 1.0× | 20 | 40 |
| **21 +** | **0.5×** | 10 | 20 |

**Holds are never tiered** — a hold is driven by how often other people attack you,
which the defender does not control, so there is nothing there to pace.

**Implement these. Nothing here needs a population.** What genuinely wants one is
whether **20** is the right shoulder, and that is a different question from what
the plan asked:

> The 20-battle figure was *"an assumption about typical play"*, and the real
> limiter is battle length — ~102 hero-turns per 6v6, **which nobody has measured in
> wall-clock**. `06-progression.md` says so itself.

So the honest statement: **the boundaries are decided and buildable now; the
assumption underneath the 20 is untested and is testable the moment battles exist.**
`turnCount` on the battle record plus wall-clock duration answers it directly, and
`turnCount` is already mandatory under Constitution XVI.

**Build the boundaries as config, not constants.** Three numbers — 5, 20, and the
three multipliers — in one place, changeable without a deploy.

---

## Q2 — Rating's exact update rule *(simulated)*

**Decision: standard Elo on a 400-point logistic, `K` from the recorded bands, with
the Hidden bonus applied to the winner's gain only.**

```
E_a    = 1 / (1 + 10^((R_d − R_a) / 400))
delta  = K × (score − E_a)              score ∈ {1, 0}
K      = 40   first 30 rated battles     (provisional)
         20   battles 31 – 200           (settling)
         10   battles 201 +              (established)

Hidden zone:  the WINNER's positive delta is doubled.
              A loss costs the same in either zone.

Every account starts at 1000.
```

All of this except the logistic and the 400 is recorded. The 400-point scale is the
Elo convention and the doc takes no position; nothing in the design depends on it.

**Config, not constants.** `06-progression.md` is explicit: *"The bands are a
starting point, not a decision. Convergence speed is exactly the kind of thing a
simulated population settles and reasoning does not; the shape — one number,
convergent, three decaying bands — is the decision."*

### The simulation

2,000 players, latent skill ~ Normal(0, 1) mapped at 1 sd = 400 Elo, everyone
starting at 1000, random same-league pairing, 15% of battles Hidden.

| Battles | median error | p90 error | rank correlation | band |
|---|---|---|---|---|
| 5 | 261 | 618 | 0.655 | provisional |
| 20 | 208 | 512 | 0.864 | provisional |
| **30** | **196** | 476 | **0.897** | → settling |
| 50 | 184 | 456 | 0.939 | settling |
| **100** | **179** | **428** | 0.960 | settling |
| 200 | 192 | 446 | 0.967 | → established |
| 400 | 217 | 480 | 0.984 | established |
| 600 | 262 | 527 | 0.983 | established |

**Two readings, and the second is the finding.**

**The bands work for what they claim.** Rank correlation reaches **0.90 at 30
battles**, which is the doc's stated goal — *"lands near true level in ~1.5 days of
typical play"* — and it keeps climbing to 0.98. **For a ladder, which is ordinal,
the bands are right and need no change.**

**Absolute error bottoms out at ~100 battles and then grows.** 179 → 192 → 217 →
262. That is not convergence failing; it is the whole population drifting upward
together, which is invisible to rank correlation and visible to anything that reads
the number itself.

---

## The finding: the Hidden 2× bonus makes rating non-zero-sum

Standard Elo is zero-sum: the winner gains exactly what the loser loses. **The
Hidden rule breaks that by design** — the winner's gain doubles and the loser's loss
does not change — so **every Hidden battle injects net rating into the population.**

```
injection per Hidden battle = K × (1 − E)     ≈ 0.5 K at even ratings
per player, per Hidden battle they fight      ≈ 0.25 K
```

| Band | K | per player per Hidden battle | at 20 battles/day, 15% Hidden | per year |
|---|---|---|---|---|
| provisional | 40 | +10.0 | +30/day | — (only 30 battles) |
| settling | 20 | +5.0 | +15/day | ~5,500 |
| **established** | **10** | **+2.5** | **+7.5/day** | **~2,700** |

**~2,700 points a year for an active established player**, against a starting value
of 1000 and a meaningful skill spread of about ±400.

**Whether this matters depends entirely on what rating is used for**, and the design
is unusually clear:

> *"One number. Visible, skill-convergent, and it does exactly two jobs: standing,
> and the order league-mates are offered in."*

**Both jobs are ordinal, and both survive inflation** — rank correlation stays at
0.98. So this is **not a defect in the two stated jobs.** It breaks three things
that are *adjacent* to them:

1. **"Every account starts at 1000"** stops meaning "starts at average". After a
   year a new account is ~2,700 below an active peer, so the provisional band is
   spent climbing rather than calibrating.
2. **Any absolute threshold on rating drifts.** None exists today. One would break.
3. **A returning player's rating is stale relative to an inflated population** —
   they are ranked correctly against their past self and low against everyone else.

### The recommendation, offered rather than taken

**Start new accounts at the current population median, not at a fixed 1000**, and
treat rating as strictly ordinal — never threshold on it, never compare it across
time.

That is the **smallest** change and it preserves the recorded rule exactly. The
alternative — making the Hidden bonus redistributive, so a Hidden win takes 2× from
the loser — would restore zero-sum but **contradicts a deliberate decision**: *"A
loss costs the same in either zone"* is stated in `06-progression.md` as the shape
the shards already follow, deliberately.

> **`06-progression.md` says every account starts at 1000. Changing that is a canon
> change, not a Phase 0 call.** Raising it here; not writing it into the rules.
> If the answer is "leave it at 1000 and accept the drift", that is a legitimate
> answer and this analysis is the reason it was chosen rather than defaulted to.

**What would confirm it in production**: median and p90 rating by account age,
which is a single query against data the battle record already carries.

### One thing the simulation confirmed that the design rests on

The zone asymmetry holds and points the way the design says. A defender taking 20
attacks a day at 85/15, holding 40% on Visible and 60% on Hidden:

```
K = 10:   Visible  −17.0 / day        Hidden  +12.0 / day
```

**Visible actively bleeds; Hidden pays.** Shards say fortify Visible; rating says
fortify Hidden. Neither zone dominates because the two currencies disagree — which
is the commitment `02-squads.md` question 0 records as *testable*.

**The caveat in the doc is the real risk and the simulation cannot settle it**: the
whole result depends on **Hidden holding better than Visible**. If the two hold
rates converge, Visible wins both currencies and the choice collapses. Only
`defender_is_bot` + `zone` + outcome on the battle record can detect it, and only
after real play.

---

## Q3 — The rebuild transaction's shape

**Decision: the player pays **650 once**, and destroy-and-rebuild is a single
transaction with a single ledger entry.**

```
BEGIN
  assert balance >= 650
  ledger: −650, reason 'rune-rebuild', ref (heroId, slot)
  destroy the existing rune  (all stages, permanently)
  create the new rune at stage 4
  recompute gear score        ← the league may move
COMMIT
```

**One charge, not four staged ones.** FR-010 requires the observable behaviour to be
atomic either way; one charge is the smaller implementation and the honest one:

| | One charge of 650 | Four staged charges |
|---|---|---|
| Ledger | one entry, one reason | four entries that must be read as a group |
| Partial failure | impossible | possible, and must be compensated |
| Player's mental model | *"a rebuild costs 650"* | *"a rebuild costs 150 + 150 + 175 + 175, unless…"* |
| Cap interaction | one check | four, each of which can fail differently |

**Runes are permanent and destroyed on replacement** — that is the design, and it is
the reason the no-nerf rule exists. So a rebuild is genuinely destructive and the
confirm must say so: **the old rune is gone, including its utility effect, and the
new one is not a strict upgrade.**

**Gear score recompute is inside the transaction.** `09-matchmaking.md` requires the
score to be recomputed **on placement** so *"there is no window between deploying a
month of shards and the league noticing."* A recompute outside the transaction is
exactly that window.

**Grants take a different path, deliberately.** `awardShards` is the only writer of
positive **battle income** and it applies the daily tiers and the 6,500 cap. A
granted prize — the compensation the balance-upward rule promises when a nerf is
genuinely the answer — **must bypass the cap**, or the players most affected by a
nerf are the ones who cannot receive the apology. Two functions, two paths, and the
cap lives in exactly one of them.

---

## The 6,500 cap's three asymmetric behaviours

Stated here because the plan's quickstart tests all three at one boundary and they
are easy to collapse into one rule:

| At the cap | Behaviour |
|---|---|
| **Battle income** | **stops.** No overflow, no queue, no loss notification beyond the balance display |
| **A granted prize** | **lands.** Grants bypass the cap entirely |
| **A purchase** | **is refused.** Before payment, with a clear reason — never take money for shards that cannot be delivered |

**Three different outcomes at one number**, and each is a different function
reaching the same balance. The refusal is the one with a money consequence and it
must happen **before** the payment rail is invoked (feature 011).

---

## What is NOT settled here

- **Whether the 20-victory shoulder is right.** It rests on an untested assumption
  about how long a battle takes in wall-clock. Testable from the first battle.
- **Whether new accounts should start at 1000.** Raised above; a canon decision.
- **Whether Hidden actually holds better than Visible.** The zone commitment rests
  on it entirely and only production data answers it.
- **The hero-numbers pass.** Every figure here is denominated in shards and
  unaffected by it, but gear score is not — a change to stat budgets moves every
  league threshold.
