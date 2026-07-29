# `battle/` — the module the whole game runs through

**TL;DR for anyone new:** a battle is stored as a list of the moves that were
made, and nothing else. Every time the player does something, the server replays
that list from the beginning, applies the new move, plays out everything that
follows automatically, and writes one row. There is no saved "current state of
the fight" anywhere, on purpose — so it can never disagree with the record. The
number to watch is how long that replay takes; it grows with the length of the
battle, and if it ever stops being cheap this is the decision to revisit.

---

## The three properties everything here is shaped by

**1. In-progress state is never stored.** There is no `current_hp` column and
there will not be one. `currentState` rebuilds the board from the frozen squad
snapshots and the append-only action log on *every* request. One source of truth,
no cache, no TTL, no invalidation to get wrong — and state cannot drift from the
log because there is no state *to* drift.

**2. The seed never leaves the server.** Constitution XII. The `Seed` type throws
on serialisation, so a careless `c.json(battle)` fails loudly rather than handing
a player every roll for the rest of the fight. Draw indices are as dangerous and
have none of that protection — `drawsConsumed` reads like harmless telemetry and
tells an attacker exactly how many rolls a turn spent.

**3. A duplicate is a constraint violation, not a race to detect.**
`PRIMARY KEY (battle_id, sequence)` with the client saying which sequence it
believes it is writing. There is no window between a check and a write, because
there is only one statement.

## The files, in the order a request touches them

| File | What it owns |
|---|---|
| `maintenance.ts` | `live` / `draining` / `down`, read per request, never cached |
| `create.ts` | one battle at a time · the ambush roll · both snapshots · the seed |
| `seedStore.ts` | the **only** crossing between a `Seed` and the `seed` column |
| `snapshot.ts` | `jsonb` → typed, because a column has no type |
| `board.ts` | snapshot → `BattleState` on the shared 1–6 row axis |
| `turnLoop.ts` | the accumulator, Resolution, one whole hero turn |
| `choicePoint.ts` | where a packet ends |
| `packet.ts` | resolve one intent, then fold forward to the next real choice |
| `act.ts` | re-derive from the log · refuse an illegal intent |
| `idempotency.ts` | append once, or hand back what was appended |
| `settle.ts` | conclude exactly once · discard as a complete no-op |
| `expiry.ts` | the sweep, driven from Postgres |
| `routes.ts` | the four routes and the status table |

## The packet boundary

```
choice  iff  ( usable powers > 1 )  OR  ( legal targets for the only power > 1 )
```

A packet runs the acted turn, then **every forced attacker turn and every
defender turn**, and stops where the player faces a decision with more than one
legal outcome. The engine plays all defense, so a request that stopped at each
defender turn would be asking the player to watch rather than to decide.

Getting this wrong is not a crash. It is a game that feels wrong in one of two
opposite directions, and the request count is the only place it shows:

| Requests per battle | What it means |
|---|---|
| too many | something forced is being treated as a decision — the game asks constantly |
| too few | **worse** — turns that carried a decision are being folded, and *the player is not being asked* |

The second is the quiet one. Nobody files a bug saying "I had fewer choices than
I should have"; they say the game felt shallow.

## The number to watch

**Replay cost is quadratic in the action count, by construction.** Every request
replays the whole log. That is the accepted price of property 1, and the thing
that would change the answer is a battle long enough that the fold stops being
cheap.

Measured over a full battle on **2026-07-29**:

| | |
|---|---|
| actions per battle | **81** |
| first ten requests | **66 ms** |
| last ten requests | **71 ms** — **1.1×** |

The two database round trips dominate, not the fold. So the decision is
comfortable today, and `act.ts` logs `[replay] battle=… actions=… ms=…` past
400 ms so that stops being true out loud rather than quietly. **That line is
instrumented from the first battle ever fought** — adding it when somebody
notices latency leaves nothing to compare against.

Related: the same run measured **242 hero turns against a design target of ~102**
and **~70 requests against a predicted 20–40**. The boundary rule is verified
turn by turn; the *content* is untuned. `resources/mechanics/README.md` carries
those figures under the parked hero-numbers pass.

## Two claims that are weaker than they look

**A replay re-runs the defense AI.** The stored packets carry the intent behind
every turn, engine turns included, and it is tempting to conclude the AI never
runs twice. It does, and it has to: `decideAction` spends draws breaking
targeting ties, and those sit *between* one turn's resolution draws and the
next, so skipping the decision reads every later index from a cursor the original
battle had already moved past. Fixing that would mean a per-event draw cursor,
and the packet is handed back to the client verbatim on a retry. What the
recorded intents buy is a **check**; what makes re-derivation safe is the
`engineVersion` / `contentVersion` gate, and `drawsConsumed` is what makes a
disagreement impossible to miss.

**`assertLegalIntent`'s side check is unreachable.** A packet only ever stops at
an attacker choice point, so `turnOfInstance` is always an attacker and the turn
check refuses every defender id a client could send. The branch stays because the
day it *is* reachable, the packet boundary has broken in a way that hands the
attacker control of the squad defending against them.

## One rule here is an assumption

**A defense loss resets that zone's hold streak.** The design documents say
editing a defense resets it (`02-squads.md`, `08-guilds.md`); what a *defeat*
does is nowhere written down. Implemented as a reset, because the number is
scouted and read as *"their Closed Gate has held 9 times"* — a count that
survived being beaten claims a squad held when it demonstrably did not. Worth
confirming before holds pay anything, since it would then decide how much defense
earns.

## Not built here, and why

| | Waiting on |
|---|---|
| the shard award, the rating update | feature 010 — no wallet table, no rating column; `06-progression.md` is the parked blocker. They slot into `settle`'s existing transaction |
| the replay blob | feature 008. It goes **outside** the settlement transaction: a battle that settles but fails to record is invisible to every aggregate, and the aggregate is the analytics product. A failed blob costs one replay |
| choosing an opponent | feature 009. There is no attack button; `ResumeBattle.tsx` is the only route into the battle screen |
| the maintenance flag's real source | feature 016's Edge Config. `setMaintenanceSource` is the seam; the default reads the environment |
