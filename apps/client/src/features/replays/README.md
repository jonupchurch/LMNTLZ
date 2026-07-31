# The replay viewer, and the board it does not draw

## TL;DR

The plan said the replay screen should reuse the live battle board. **It can't** —
the thing the server saves when a battle ends doesn't include a picture of the
board, only a list of what happened. So the replay plays as a list of turns.

Making the board possible means saving more, and saving more has a side effect
worth deciding on purpose rather than by accident: **it would show each player
the six champions the other one brought**, which the game never reveals anywhere
else. That is a design call, so it is written down here rather than made
quietly.

---

## What `research.md` R4 decided

> **Decision.** No second board and no second turn queue. `BattleScreen` and
> `TurnQueue` render from a `BattleState`; a replay is the same state driven
> from a stored log instead of a live one.

The reasoning is right and stands: a second renderer is a second place for the
game to be described, and the moment a replay path can re-simulate, a balance
patch can change a past battle.

## Why it could not be executed as written

The stored log is assembled by `apps/api/src/replays/record.ts` and is exactly:

```ts
interface ReplayLog {
  battleId: string;
  engineVersion: string;
  contentVersion: string;
  events: TurnEvent[];   // the opening fold, then every stored packet
  conclusion: Conclusion;
}
```

There is **no `BattleState` in it**, and both components R4 names take one:

| what the component needs | where it comes from | in the log? |
|---|---|---|
| `TurnQueue` — a projected order | `HeroState.accumulator` | no |
| the board — health bars | `HeroState.maxHp` | no |
| the board — who is in a seat | `HeroState.heroId` | no |
| the board — where they stand | `HeroState.row` | **implied by the seat id** |

A `TurnEvent` names its actor `a-front-0`, because `instanceIdOf()` mints ids
from **side and seat** and deliberately not from the hero sitting in one.

So the viewer shows what the log actually holds: the sequence of recorded turns,
by seat, with the outcome the server wrote down. It builds **no second board and
no second turn queue** — it builds neither, and nothing in it evaluates a rule.
The upcoming turns are not projected, they are *known*: they are the rest of the
list.

## Restoring the board is a server change, and it is not free

The fix is one field: put the opening `ActionPacket`'s `state` into the log at
`writeReplayBlob()` time. It is cheap, it is seedless by construction, and
`assertNoSeed()` already guards the serialised text.

**Two consequences to weigh first.**

### 1. It would put both squads into the replay

The log names no champion today, so a replay reveals no composition to anybody.
Adding the opening state puts `heroId` for all twelve heroes into a payload the
two participants can read.

- For the **attacker**, that is nothing new — they fought the board and watched
  it the whole time.
- For the **defender**, it is new. The engine runs their defense, so they never
  saw the attack squad, and **attack squads are not scoutable anywhere else in
  the game** — only the Visible *defense* squad is.

That is not obviously wrong. Reading how you were beaten is close to the heart
of a counter-building game, and it is information about a battle you were in.
But it is a deliberate widening of what a player can learn, and Constitution XVII
says storing is not exposing — so it wants a decision, not a default.

### 2. Old logs would not have it

Replays live seven days, so within a week every log carries the field and the
gap closes itself. Until then the field is optional and the viewer needs both
paths. That is the ordinary shape of Constitution XVI — the past cannot be
backfilled — and it is mild here precisely because replays expire.

## What is not on the table

**Re-simulating an expired replay.** The record keeps the seed, so the events
*could* be recomputed. The moment that path exists, today's rules run over
yesterday's inputs, replays silently diverge from results already paid out, and
the divergence is invisible — both versions look like a perfectly ordinary
battle. 008 T023 forbids it, `playback.test.tsx` scans this directory for it,
and eslint refuses the import.

## The other export discrepancy, recorded and not fixed

`LMNTLZ Battle Record.dc.html` draws a **SQUAD SENT** column of six hero emblems
per row, plus a rating delta and a whose-record scope picker. `GET /v1/me/battles`
carries none of the three: it carries neither squad on purpose — *"a list is not
a scouting surface"* — and rating-at-battle-time is on the record but not in the
response.

Per `CLAUDE.md`, a generated screen is look and feel rather than a source of
rules, so the column is not drawn and the export is not rewritten.
`tests/replays/watchable.test.tsx` asserts no champion name appears in the list,
so adding it would fail there rather than ship.
