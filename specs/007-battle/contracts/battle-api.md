# API Contract: Battle

**Feature**: `007-battle` | Versioned JSON REST under `/v1`.

**The two properties that shape every route here:**

1. **In-progress state is never stored.** It is re-derived from the append-only
   action log on every request. One source of truth, no cache, no TTL.
2. **The seed never leaves the server.** Enforced by the resolver's own type
   boundary (feature 003), not by remembering here.

---

## `POST /v1/battles`

```jsonc
// request
{ "opponentId": "acc_...", "attackSquadSlot": 0 }
```

```jsonc
// 201
{
  "battleId": "btl_...",
  "zone": "visible",                  // or "hidden" — see below
  "sequence": 0,                      // the next sequence the client must write
  "initialState": { /* BattleState, seedless */ },
  "packet": { /* everything up to the first real choice — often several turns */ }
}
```

| Status | When |
|---|---|
| `201` | started |
| `409` | **a battle is already open** — body carries `openBattleId` |
| `403` | opponent outside the caller's candidate set (feature 009) |
| `503` | maintenance is `draining` or `down` |

**One battle open at a time.** Several open battles lets a player start against
many opponents and abandon the ones going badly — which turns the attack-income
tiers and the ambush counter into something farmed by selection. `409` carrying the
open battle's id also means "resume" needs no separate concept.

**The zone is the server's to decide, never the client's.** The Visible squad is
the only one anyone can *choose* to attack; a Hidden battle happens **only** by
ambush, rolled server-side against the displayed chance. A client cannot request
`hidden`, and the field is absent from the request body — enforcement by absence.

## `POST /v1/battles/:battleId/act`

```jsonc
// request
{ "sequence": 3, "actorInstanceId": "a-bramwen", "powerId": "p_avalanche",
  "targetInstanceId": "d-ossic" }
```

```jsonc
// 200
{
  "sequence": 3,
  "packet": {
    "events": [ /* the acted turn, then every forced turn and every engine turn,
                   up to the next real player choice */ ],
    "state": { /* BattleState after the packet */ },
    "conclusion": null
  },
  "nextSequence": 4
}
```

| Status | When |
|---|---|
| `200` | resolved — **or replayed; the two are indistinguishable, by design** |
| `409` | `sequence` is not exactly `max + 1`; body carries `currentSequence` |
| `410` | battle expired (24 h since last action) or discarded |
| `422` | illegal action — power on cooldown, target out of reach, not this hero's turn |
| `503` | maintenance `down` |

### Idempotency

```sql
INSERT INTO battle_actions (...) VALUES (...)
ON CONFLICT (battle_id, sequence) DO NOTHING
RETURNING resolved_packet;
-- a row → first write, return it
-- no row → SELECT resolved_packet and return THAT
```

**The `PRIMARY KEY (battle_id, sequence)` is the enforcement.** A duplicate is a
constraint violation, not a race to detect — there is no window between a check and
a write. **`act` returns the same packet for a repeated `sequence`**, which is what
makes retry safe without the client knowing it retried.

**The stored packet is returned, never a recomputed one.** Recomputing would be
correct by argument; returning the stored one is correct by construction, and it
survives a version change between the two calls.

### The packet boundary

A packet ends where the player faces a **choice with more than one legal outcome**:

```
choice  iff  ( available powers > 1 )  OR  ( legal targets for the chosen power > 1 )
```

| Situation | Folds into the packet? |
|---|---|
| a hero passing with no legal target | **yes** — nothing to decide |
| one legal power, one legal target | **yes** — the outcome is forced |
| one legal power, three legal targets | no — stop and ask |
| four available powers, one enemy left | no — power choice is a real decision |
| **every defender turn** | **yes** — the engine decides |

Predicted **20–40 requests** against ~51 player-side turns in a ~102-hero-turn
battle. Checkable against `turnCount` versus action-log length, using a field
Constitution XVI already makes mandatory.

**Never round-trip on an animation.** The client plays the packet out at its own
pace; the server already resolved it.

## `GET /v1/battles/:battleId`

```jsonc
{ "battleId": "btl_...", "sequence": 7, "state": { ... }, "conclusion": null }
```

**Re-derived from the action log on every call.** There is no cached state to go
stale and no invalidation to get wrong. This is also the resynchronisation route
after a `409`.

`410` if expired. **Never** contains the seed, `drawIndexBefore`, or
`drawsConsumed`.

## `GET /v1/battles/open`

```jsonc
{ "battleId": "btl_...", "startedAt": "...", "expiresAt": "..." }  // or 204
```

---

## Conclusion, and what is written

When `packet.conclusion` is non-null the battle settles **atomically** with the
final action:

```
one transaction:
  battles.concluded_at, .winner, .reason
  the battle metadata row              (Constitution XVI — feature 008)
  the shard award                      (feature 010)
  the rating update                    (feature 010)
  the ambush counter                   (feature 009)
  the hold streak, if the defender held (feature 006)
then, outside it:
  the replay blob                      (feature 008)
```

**The metadata row is inside the transaction; the blob is outside.** A battle that
settles but fails to record is invisible to every aggregate, and the aggregate is
the entire analytics product. A blob that fails to write costs one replay.

## Expiry — a discard, not a result

24 hours after its last action an open battle expires. **No win, no loss, no
shards, no rating movement, no ambush-streak change, no battle record.** A no-op,
exactly like the maintenance discard.

> **The discard is counted; the battle is not.** An abandonment counter on the
> account is a real operational signal and a plausible client-bug detector.
> Recording *that* a battle was abandoned is not the same as recording a battle —
> only the second would pollute the aggregates.

---

## Internal contracts

```ts
/** The only in-progress state. Nothing else is persisted mid-battle. */
async function appendAction(battleId: string, action: BattleAction):
  Promise<{ packet: ResolvedPacket; replayed: boolean }>;

/** Re-derives from the log. Called on EVERY request. */
async function currentState(battleId: string):
  Promise<BattleState | { expired: true } | { versionMismatch: true }>;

/** True when the player faces a choice with more than one legal outcome. */
function isChoicePoint(state: BattleState, instanceId: string): boolean;

/** Resolves forward until `isChoicePoint` or the battle concludes. */
function resolveToNextChoice(seed: Seed, log: readonly BattleAction[]): Packet;
```
