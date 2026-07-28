# Quickstart: Matchmaking

**Feature**: `009-matchmaking` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test matchmaking
```

## The golden path — the continuity sweep

Sweep one player's gear score across a league boundary and confirm the opponent mix
moves **continuously, with no step change**.

```
gearScore 2400  (top of Bronze)     → ~50% Silver in the pool
gearScore 2500  (Bronze ceiling)    → 50% Silver
gearScore 2501  (Silver floor)      → 50% Bronze
gearScore 2600  (bottom of Silver)  → ~50% Bronze
gearScore 3000  (middle of Silver)  → 100% Silver
```

**The crossing is the assertion.** 2500 → 2501 must not produce a discontinuity in
expected opponent strength. Leagues bleed at **both** edges precisely because the
upward ramp alone left a sawtooth: a player at the top of Bronze faced 52.5% win
odds, crossed the line, and faced 52.5% again as the *bottom* of Silver.

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
