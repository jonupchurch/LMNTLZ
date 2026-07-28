# Phase 0 Research: Matchmaking

**Feature**: `009-matchmaking` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q3 turned out to be settled in canon already** and the plan did
not know it. Q1 has a derivable floor. Q2 is a cross-feature integration point that
has been lost three times.

**One finding beyond the three questions**, from simulating the rating system: the
recorded opponent-reuse analysis examined **shards** and did not examine **rating**,
and the rating case behaves differently. Recorded at the end.

---

## Q1 — The bot total, and the starter pool's depth first

**Decision: the starter pool sets the floor, and the floor is ~20 authored
defenders — which implies ~65 bots in total under the recorded 30% share.**

### Deriving the starter floor

A starter player fights roughly **140 battles** in their week
(`09-matchmaking.md`). The requirement is that an authored **ramp** still reads as
a ramp rather than as the same six opponents on repeat.

| Starter bots | Times each is fought | Reads as |
|---|---|---|
| 6 | 23 | the same six opponents. This is the failure the doc names. |
| 12 | 12 | repetitive by day three |
| **20** | **7** | a ramp — one new opponent every ~7 battles |
| 40 | 3.5 | comfortable, and twice the authoring cost |

**20 is the recommendation, and it is an authoring cost as much as a tuning one.**
Each bot is a full defense record: six heroes, seats, two targeting rules and a
six-power ranking per champion, plus rune fill. That is a real content task, and
the doc is explicit that these are *scaffolding* — they retire as the real
population arrives.

**The ramp needs structure, not just count.** `09-matchmaking.md` says the starter
pool *"can teach counter-building, which nothing else does — bot 1 can carry one
obvious exploitable Bane and bot 6 none."* So the 20 are not interchangeable:

```
bots  1-5    one glaring Bane, mono-type squad, no rune fill
bots  6-12   two types, partial rune fill, one coherent counter still available
bots 13-20   mixed types, full rune fill, no free answer — graduation standard
```

### The implied total

At the recorded distribution — starter 30% · Bronze 20% · Silver 20% · Gold 20% ·
Platinum 10% · Diamond 0% (hand-seeded only):

```
20 / 0.30  ≈  67 bots  →  20 starter · 13 Bronze · 13 Silver · 13 Gold · 7 Platinum
                          + Diamond, hand-seeded, counted separately
```

**~65–70 padding bots, plus a hand-seeded Diamond set.** The Diamond bots are
excluded from the percentage because they do a different job: *padding bots fill a
pool; a Diamond bot is a balance lever* — the additive tool the no-nerf rule reaches
for before touching a number.

> **This is a floor, not a launch plan.** The doc calls the absolute count *"a
> launch-tuning number that wants a real population"*, and it is right. What the
> arithmetic above settles is that it cannot be **fewer** than ~20 in starter, and
> that the starter requirement — not Bronze's — is what sets the total.

**Bronze at 13 is thin and it is the known weak point.** Bronze is where inactive
accounts thin hardest, and it is where widening breaks the 1.67× gear guarantee
(up to 2.67× at the floor). If any number wants raising after launch it is this
one, and `expiredButUndeleted`-style monitoring has an analogue here: **track how
often a Bronze request has to widen.** A widen rate above a few percent means
Bronze needs more padding, and it is measurable from day one.

---

## Q2 — The four starter-league exits

**Confirmed: four exits, and two of them live in feature 013.** This is the
cross-feature integration point, and the required warning **has already been lost
three times** in screen regeneration.

| # | Exit | Fires when | Owned by |
|---|---|---|---|
| 1 | **Time** | 7 days after account creation | this feature |
| 2 | **Shards** | 3,250 shards earned — five full runes | feature 010 signals it |
| 3 | **Voluntary** | the player opts out; **permanent** | this feature |
| 4 | **Guild** | accepting an invitation **or founding a guild** | **feature 013** |

**Exit 4 is one rule with two doors**: *no member of a guild is ever in the starter
league.* Founding makes you a member, so it graduates you exactly as accepting does.
Leaving the guild later does **not** send you back.

### The warning, and why it keeps getting lost

**It must appear on *both* doors and name *both* losses.**

```
Joining a guild ends your starter week.

  You will face real players instead of authored opponents.
  Your attack income drops from 1.5× to the normal rate.

This cannot be undone.
                                   [ Cancel ]  [ Join anyway ]
```

Two failure modes, and the design names both:

1. **Naming only one loss.** A player told *"you'll leave the starter league"* has
   **not** been told their income drops. Beginner *status* and the beginner *bonus*
   are two different things and both end.
2. **Warning on acceptance only.** A player who **applies** and is admitted a day
   later is graduated by someone else's click, at a moment they were not present
   for. **The application is where the decision is actually made**, so that is
   where the decision has to be described.

**So: the warning is on the application and on the invitation, not on the
acceptance.** Invitations are accepted by the player, so those coincide;
applications are not.

**The enforcement is a shared contract, not shared copy.** Feature 013 calls
`starterStatus(accountId)` before rendering either door and refuses to render an
un-warned confirm. A constant string in a shared module is not enough — three
regenerations have proved that a string can be dropped. **The check is that the
confirm cannot be constructed without the warning payload**, because the payload is
a required field of the confirm's type.

**Most of the 1.5× is not a bonus, and the copy must not oversell it.** The
multiplier replaces dormant hold income — holds are 26% of a typical day, and
nothing attacks a starter player's defense. Only about **11%** is actual help. A
warning that reads as *"you're losing a 50% head start"* misprices it.

---

## Q3 — Inactivity — ~~open~~ **already settled in canon**

**The plan asked for a threshold that `09-matchmaking.md` had already set.**

> *"An account idle for 30 days is removed from the matchmaking pool, and re-enters
> on its next activity."* — settled 2026-07-27.
>
> *"Activity means an attack battle or a defense-squad edit."* A bare login is not
> enough, or an absent account could keep collecting hold income by opening the game
> and doing nothing.

**Nothing to decide. Two things to implement carefully:**

- **Leaving the pool is its own enforcement.** Nobody can attack a defense nobody is
  offered, so an idle account's hold income goes to zero without a second rule.
  Do **not** add a rule that zeroes it — that would be a second mechanism to keep
  in step with the first.
- **Re-entry is immediate and needs no job.** `lastActivityAt >= now() - 30 days` in
  the candidate query. A nightly "mark inactive" job would leave a returning player
  invisible until it next ran.

**And the part the plan was actually right to worry about**: *does bot padding cover
the thinning?* **Not by itself.** The doc is explicit that this *"thins Bronze the
most, which is where it hurts"*, and that **no new rule is needed** because *When a
league is thin* already widens per request. So the answer is: bots pad, widening
covers the rest, and **the widen rate is the metric that tells you whether 13
Bronze bots was enough.** Instrument it from day one.

---

## Beyond the three questions: rating farming was analysed in shards, not in rating

**`09-matchmaking.md`'s *The pool is every defender* settles that there is no slate,
no rotation and no cooldown on re-attacking.** The three objections it examined and
dismissed are all **economic** — the farm out-earns a subscription (accepted), the
defender's income inverts (self-corrects), counter-building becomes solve-once (the
ambush taxes it).

**The rating consequence was not examined, and simulation says it behaves
differently.** Under a convergent rating with the recorded K bands:

| | Rating per battle, for a converged player |
|---|---|
| Honest play against an equal-rated opponent | **exactly 0** in expectation — that is what convergent means |
| Beating a reliable opponent 200 points below | **+2.4** per win, at K=10 |
| Beating one 400 points below | **+0.9** per win |

**Convergence makes honest play worth zero, so *any* reliable win source strictly
dominates it.** Starting level against a 1,000-rated bot at K=10, a player who wins
every time reaches **+200 in 58 battles (≈3 days at 20/day)** and **+400 in 196**.
The gain decays but never reaches zero, while the alternative is exactly zero.

**This is not necessarily a defect, and I am not proposing a rule.** Two things
already in the design push back, and whether they are sufficient is a real question:

- **The ambush counter.** `+2%` per consecutive attack win, capped at 90%, so a
  farmer on a 45-win streak is pulled into Hidden battles 90% of the time — and
  cannot scout them. `09-matchmaking.md` already cites this as the answer to
  solve-once.
- **Bots carry a spread of ratings**, not one per league, so the pool is not
  uniformly farmable.

> **Bots carry Hidden squads — settled 2026-07-28, and it was already canon.**
> This pass raised it as open after reading `07-defense-ai.md`, which covers
> defenders only and does not say. It is stated plainly one document over:
> `09-matchmaking.md`'s *Curated bot defenders* section defines a bot as **"a gear
> score, a Visible squad, a Hidden squad, and a `07-defense-ai.md` configuration —
> which is precisely what a player's defense record is, minus the account."**
> FR-018 carries the same thing by implication: a player's defense record is 12
> heroes across two zones, so *the same configuration model as players* was never
> compatible with a one-squad bot.
>
> **The ambush tax therefore has something to bite on, provided the authoring
> makes Hidden the harder of the two** — that is the half the canon does not
> state, and it is an authoring instruction rather than a rule. It is recorded on
> T045 and T046.

**What would answer the farming question properly**: the battle metadata row.
`defender_is_bot`, `attacker_rating` and `zone` together make *"how much rating is
being gained against bots, by whom, in which zone"* a single query — and all three
are already mandatory under Constitution XVI. **No new field is needed.**

---

## What is NOT settled here

- **The absolute bot count.** ~65–70 is a floor derived from the starter
  requirement. The real number wants a real population.
- ~~**Whether bots carry Hidden squads.**~~ **Settled 2026-07-28: they do**, and
  `09-matchmaking.md` had already said so. See above.
- **The exact widen-rate threshold** that means "Bronze needs more bots." Needs the
  metric running first.
