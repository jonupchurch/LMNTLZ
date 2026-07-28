# Quickstart: Battle

**Feature**: `007-battle` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test battle
```

## The golden path — and count the requests

1. `POST /v1/battles` → `201`, a battle id, and a first packet.
2. `act` repeatedly until `conclusion` is non-null.
3. **Count the `act` calls. Expect 20–40.**

Step 3 is a real assertion, not a comment. It is the only check on the packet
boundary that exercises the whole rule at once:

- **Over ~45**: the boundary is too fine. Something that is not a choice is being
  treated as one — most likely "one power, several targets" where the targets are
  equivalent.
- **Under ~15**: worse. Turns that genuinely carried a decision are being folded,
  which means the **player is not being asked**.

The prediction is ~51 player-side turns in a ~102-hero-turn battle, of which 40–80%
present a real choice.

## Retry — the property the whole design rests on

```
act(sequence: 3)                          → packet P
act(sequence: 3)  again, same body        → packet P, BYTE-IDENTICAL
act(sequence: 3)  again, DIFFERENT body   → packet P still
act(sequence: 5)  (skipping 4)            → 409, currentSequence: 4
act(sequence: 4)                          → advances
```

Line 3 is the one that catches a half-implementation: once `(battleId, 3)` exists,
the *stored* packet is returned and the request body is irrelevant. An
implementation that recomputes on conflict passes lines 1–2 and fails line 3.

**Then the real test — kill the connection mid-action:**

```
1  send act(sequence: 3), destroy the socket before the response arrives
2  GET /v1/battles/:id       → sequence is 3 (it committed)
3  act(sequence: 3) again    → the same packet
4  confirm the battle advanced ONCE, not twice
```

**Assert on the action log, not on the response.** `SELECT count(*) FROM
battle_actions WHERE battle_id = ? AND sequence = 3` must be exactly 1. The
response looks right in both the correct and the double-advanced case.

## No stored in-progress state

```bash
rg -i "battleState|inProgress|cache" apps/api/src/battle
```

There must be no table, no Redis key, no in-memory map holding mid-battle state.
Then prove it:

```
1  play three actions
2  restart the API process entirely
3  GET /v1/battles/:id  → identical state
```

If step 3 works after a cold start, the state genuinely is derived. **One source of
truth, no cache, no TTL** — and no invalidation bug is possible because there is
nothing to invalidate.

## One battle at a time

```
POST /v1/battles                → 201
POST /v1/battles  (again)       → 409 with openBattleId
conclude the first
POST /v1/battles                → 201
```

The `409` carries the open battle's id, so the client resumes rather than needing a
separate "resume" concept.

## Expiry is a no-op

```
1  start a battle, act twice
2  advance the clock 24 h + 1 min
3  run the expiry job
4  act(...)  → 410
```

Then assert **nothing happened**:

```
✗ no battle record row          ✗ no shard movement
✗ no rating movement            ✗ no ambush-streak change
✗ no hold-streak change
✓ the account's abandonment counter incremented by 1
```

The last line is the distinction that matters: **recording that a battle was
abandoned is not the same as recording a battle.** Only the second would pollute
the aggregates Constitution XVI protects.

## The seed boundary

```bash
# play a full battle, capture every response body
rg -i "seed|drawIndex|drawsConsumed" battle-responses.json
```

Must return nothing. Then the stronger version: search the serialised responses for
the actual seed bytes taken from the database row.

## Conclusion atomicity

Conclude a battle with the metadata write forced to fail (inject an error on the
battle-record insert). Assert:

```
✓ the whole transaction rolled back
✗ no shards awarded
✗ no rating movement
✓ the battle is still playable — the client can retry the final action
```

**A battle that settles but fails to record is invisible to every aggregate**, and
the aggregate is the entire analytics product. The blob is the one artifact
written *outside* the transaction — a failed blob costs one replay, and a failed
metadata row costs a permanent hole in the history the first balance pass reads.

## Maintenance

```
state = live      → POST /v1/battles  201
state = draining  → POST /v1/battles  503,  but `act` on an OPEN battle still 200
state = down      → both 503
```

`draining` is what lets in-flight battles finish on their own rather than being
discarded, which is the entire reason the state exists.
