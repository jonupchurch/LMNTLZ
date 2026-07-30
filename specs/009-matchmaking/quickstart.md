# Quickstart: Matchmaking

**Feature**: `009-matchmaking` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test matchmaking
```

## The golden path — the continuity sweep

Sweep one player's gear score across a league boundary and confirm the opponent mix
moves **continuously, with no step change**.

```
gearScore 2400  (pos 0.900, Bronze) →   0% Silver — the ramp starts here
gearScore 2450  (pos 0.950, Bronze) →  25% Silver
gearScore 2499  (top of Bronze)     →  49.5% Silver
gearScore 2500  (Silver's floor)    →  50% Bronze
gearScore 2600  (pos 0.067, Silver) →  16.7% Bronze
gearScore 2650  (pos 0.100, Silver) →   0% Bronze — the ramp ends here
gearScore 3000  (middle of Silver)  → 100% Silver
```

> **⚠️ Three of these numbers were wrong until 2026-07-29**, and the sweep as written
> would have produced a wrong test.
>
> - **2,500 belongs to Silver, not Bronze.** `league.ts` settled *floor-inclusive*
>   half-open bands, with the reasoning recorded there: a shared boundary must belong to
>   exactly one league or 2,500 is simultaneously at a ceiling (bleeding up) and at a
>   floor (bleeding down), which is opposite behaviour from one number. So the crossing
>   pair is **2,499 → 2,500**, not 2,500 → 2,501.
> - **2,400 bleeds 0%, not ~50%.** `pos` is exactly 0.9 there, which is where the ramp
>   *starts*: `P(up) = 0.5 × max(0, (0.9 − 0.9) / 0.1) = 0`. The first Bronze score that
>   bleeds at all is **2,401**.
> - **2,600 bleeds 16.7%, not ~50%.** Silver is 1,500 wide, so 2,600 is only `pos` 0.067
>   — two thirds of the way through the downward ramp rather than at its start.

**The crossing is the assertion.** 2,499 → 2,500 must not produce a discontinuity in
expected opponent strength. Leagues bleed at **both** edges precisely because the
upward ramp alone left a sawtooth: a player at the top of Bronze faced 52.5% win
odds, crossed the line, and faced 52.5% again as the *bottom* of Silver.

**How `bleed.test.ts` states it, since a score grid is discrete.** Nothing on a grid of
whole numbers is exactly continuous — 2,499 is `pos` 0.999, a thousandth of a band short
of the ceiling — so the real assertion is that **the boundary is not special**. Measured:
the crossing costs **0.1124** points of win rate and the largest ordinary within-band
step costs **0.1121**, a ratio of **1.002**. Crossing a threshold is 0.2% more expensive
than placing any other single rune. The upward ramp alone leaves **12.6** points there,
112× worse, which is what the test fails with when that half is removed.

Then the end cases: **Bronze bleeds up only, Diamond bleeds down only.** Confirm a
Bronze-floor player sees no league below and a Diamond-ceiling player sees none
above.

## `candidates` cannot filter

```bash
rg -n "candidates" apps/api/src/matchmaking
```

Read the signature. **There must be no parameter that could exclude anybody** — no
`excludeIds`, no `minRating`, no `maxAttempts`. The signature is the enforcement of
*the pool is every defender*.

Then behaviourally:

```
attack the same defender 20 times in a row
→ they appear in candidates all 20 times
```

No slate, no rotation, no cooldown. This is settled design, not an oversight: a rule
restricting *who* you may attack restricts the playing itself, and the daily income
curve already bounds what volume pays.

## Inactivity

```
player idle 29 days  → in the pool
player idle 31 days  → NOT in the pool
they fight one battle → in the pool IMMEDIATELY, no job run
they edit a defense squad → same
they merely log in    → STILL NOT in the pool
```

The last two lines are the pair that matters. **Activity is a deliberate act** — an
attack or a squad edit — because an absent account could otherwise keep collecting
hold income by opening the game and doing nothing.

**Re-entry must be immediate**, which means the 30-day test is in the candidate
query and not in a nightly job. Test it by advancing the clock, playing a battle,
and querying without running any job.

Then confirm what is **not** there:

```bash
rg -i "zeroHoldIncome|suspendIncome|inactivePenalty" apps/api/src
```

Nothing. **Leaving the pool is its own enforcement** — nobody can attack a defense
nobody is offered. A second mechanism is a second thing to keep in step.

## The starter league — all four exits

Run each to completion. These are cheap to test and two of them cross a feature
boundary.

```
1  advance the clock 7 days                        → exited, reason: time
2  award 3,250 shards                              → exited, reason: shards
3  POST /v1/me/starter/exit with both acks         → exited, reason: voluntary
4a accept a guild invitation      (feature 013)    → exited, reason: guild
4b found a guild                  (feature 013)    → exited, reason: guild
```

**4a and 4b are one rule with two doors** — *no member of a guild is ever in the
starter league.* Then: leave the guild. **You do not go back.**

Then the negative case on exit 3:

```
POST /v1/me/starter/exit { confirmed: true, acknowledged: ["bot-opponents-end"] }
→ 409.  BOTH losses must be acknowledged.
```

### The warning — the check that has failed three times

```
✓ the warning appears on the guild APPLICATION
✓ the warning appears on the INVITATION
✓ it names bot opponents ending
✓ it names the income multiplier dropping
✓ it says the change is permanent
```

**Assert on the confirm's constructed payload, not on rendered copy.** The point of
making `StarterExitWarning` a required field is that feature 013 cannot build either
confirm without it. Test that the type forbids it — a test against a string is a
test that a string can be dropped, which is what happened three times.

**The application, not the acceptance.** Set up: player applies, is admitted a day
later. Confirm the warning was shown **at application time**, because that is when
the player was actually present and deciding.

## Bot distribution

```
starter league pool  → 100% bots, ≥ 20 distinct
Bronze               → bots present, ~20% of the bot population
Diamond              → NO generated bots; only hand-seeded ones
every bot            → carries BOTH a Visible and a Hidden squad
```

**The last line is a load-bearing assertion, not a completeness check.** A bot with
one squad is a bot the ambush counter cannot tax, and the ambush counter is the
recorded answer to opponent farming. Assert it over the whole pool — a single
one-squad bot is a farmable hole in the pool.

Then the shape check: **starter bots carry a spread of ratings**, not one value.
Fight all 20 as a provisional player and confirm you can **lose to a strong one and
beat a weak one inside the same league** — that is what makes the resulting rating
mean anything.

And the ramp: bots 1–5 have one glaring exploitable Bane and no rune fill; bots
13–20 have no free answer. A player who cannot beat bot 18 is not ready to graduate,
which is the point of an authored ramp.

**The ramp runs twice.** Each bot's Hidden squad is built one band up its own
rung — bot 3's Hidden to the 6–12 standard, bot 10's to the 13–20 standard. Win ten
in a row against bot 3's Visible squad and the 20% ambush roll drops you into
something a tier harder, which is the first time the game teaches that a solved
opponent is not a solved account.

## The metric to instrument on day one

```
widenRate = widened requests / total candidate requests, by league
```

Bronze is where inactive accounts thin hardest and where widening breaks the 1.67×
gear guarantee — up to **2.67×** at the floor. A Bronze widen rate above a few
percent means the bot allocation was too small. **This is measurable from launch and
answers a question no amount of reasoning will.**
