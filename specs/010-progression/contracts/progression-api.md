# API Contract: Progression

**Feature**: `010-progression` | Versioned JSON REST under `/v1`, plus internal functions.

**The shard ledger is append-only.** Balance is derived from it, never stored as a
mutable column — the same principle as in-progress battle state.

---

## The ledger

```sql
CREATE TABLE shard_ledger (
  id          bigserial PRIMARY KEY,
  account_id  uuid NOT NULL,
  delta       integer NOT NULL,          -- signed
  reason      text NOT NULL,             -- see the enum below
  battle_id   uuid,                      -- for battle income
  ref         jsonb,                     -- e.g. { heroId, slot } for a rune
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON shard_ledger (account_id, created_at);
```

```
reason ∈  'attack-victory' | 'ambush-victory' | 'hold'          -- capped income
       |  'purchase' | 'grant' | 'compensation'                 -- BYPASS the cap
       |  'rune-place' | 'rune-rebuild' | 'guild-found' | 'chat-embed'  -- sinks
```

**`balance(accountId)` is `SUM(delta)`.** Derived, not stored. A materialised
balance is a cache, and a cache is an invalidation bug waiting for a concurrent
write.

---

## `POST /v1/battles/:id/conclude` → internal `awardShards`

**`awardShards` is the only writer of positive battle income**, so the daily tiers
and the cap live in exactly one place.

### The daily tiers — recorded in `06-progression.md`, not open

| Victories that day | Multiplier | Chosen door | Ambush |
|---|---|---|---|
| **1 – 5** | **1.5×** | 30 | 60 |
| 6 – 20 | 1.0× | 20 | 40 |
| **21 +** | **0.5×** | 10 | 20 |

**Holds are never tiered** — a hold is driven by how often other people attack you,
which the defender does not control, so there is nothing there to pace.

**Play is never blocked and nothing is ever capped at zero.**

**The three numbers (5, 20, and the multipliers) are config, not constants.** The 20
rests on an assumption about typical play that nobody has measured in wall-clock;
`turnCount` plus battle duration will answer it, and both are already recorded.

### The 6,500 cap — three different behaviours at one number

| Path | At the cap | Function |
|---|---|---|
| **battle income** | **stops** — no overflow, no queue | `awardShards` |
| **a granted prize** | **lands** — bypasses the cap entirely | `grantShards` |
| **a purchase** | **refused, before payment** | `purchaseShards` |

**Grants bypass the cap deliberately.** The balance-upward rule promises shards to
everybody when a nerf is genuinely the answer; a cap that swallowed the apology
would deny it to exactly the players most affected.

**A purchase is refused before the payment rail is invoked** — never take money for
shards that cannot be delivered. Feature 011 calls `canAcceptPurchase` first.

## `GET /v1/me/shards`

```jsonc
{
  "balance": 4820,
  "cap": 6500,
  "todayVictories": 12,
  "currentTier": { "multiplier": 1.0, "nextBoundaryAt": 21 },
  "recent": [ { "delta": 40, "reason": "ambush-victory", "at": "..." } ]
}
```

`currentTier.nextBoundaryAt` is shown so the taper is **legible before it bites**,
not discovered after.

## `POST /v1/heroes/:heroId/runes/:slot`

```jsonc
// request
{ "spec": { "element": "earth", "stat": "might", "targetStage": 4 }, "confirmed": true }
```

| Status | When |
|---|---|
| `200` | placed; body carries the new gear score and league |
| `402` | insufficient shards |
| `409` | `confirmed` absent and the slot is occupied — a rebuild is destructive |
| `422` | element does not match the slot (`primary` · `secondary` · `common`) |

```jsonc
// 200
{ "rune": {...}, "gearScore": 2610, "league": "silver", "leagueChanged": true,
  "shardsSpent": 650, "balance": 4170 }
```

### `rebuildRune` — one transaction, one charge

```
BEGIN
  assert balance >= 650
  ledger: −650, reason 'rune-rebuild', ref { heroId, slot }
  destroy the existing rune  (ALL stages, permanently)
  create the new rune at stage 4
  recompute gear score          ← inside the transaction
COMMIT
```

**650 once, not four staged charges.** One ledger entry with one reason; a partial
failure is impossible rather than compensated; and the player's model is *"a rebuild
costs 650"* rather than four numbers with a caveat.

**The gear recompute is inside.** `09-matchmaking.md` requires recomputation **on
placement** so there is no window between deploying a month of shards and the league
noticing. A recompute outside the transaction *is* that window.

**The confirm must say what is destroyed**: the old rune is gone, **including its
utility effect**, and the new one is not a strict upgrade. Runes are permanent and
destroyed on replacement — that is the design, and it is the reason the no-nerf rule
exists.

---

## Rating

```
E_a   = 1 / (1 + 10^((R_d − R_a) / 400))
delta = K × (score − E_a)                    score ∈ {1, 0}

K = 40   rated battles   1 –  30      provisional
    20                  31 – 200      settling
    10                 201 +          established

Hidden zone: the WINNER's positive delta is DOUBLED.
             A loss costs the same in either zone.

Start: 1000.
```

**Gear is not in this number.** League measures rune power; rating measures only
whether a player wins with what they have. The two axes stay separate.

**The bands are config.** The *shape* — one number, convergent, three decaying
bands — is the decision; the values are a starting point.

> ### The Hidden bonus makes rating non-zero-sum
>
> The winner's gain doubles and the loser's loss does not, so **every Hidden battle
> injects `K × (1 − E)` of net rating** — about **+2.5 per player per Hidden battle
> at K = 10**, or **~2,700 a year** for an active established player, against a
> starting value of 1000.
>
> **Both stated jobs are ordinal and both survive it** — simulated rank correlation
> holds at 0.98. What drifts is the meaning of the *number*: "everyone starts at
> 1000" stops meaning "starts at average", and any absolute threshold on rating
> would break. See [research.md](research.md) for the arithmetic and the
> recommendation (start new accounts at the population median), which is **raised,
> not taken** — `06-progression.md` records the fixed 1000 and changing it is a
> canon decision.

---

## Internal contracts

```ts
/** The ONLY writer of positive battle income. Applies the daily tier AND the cap.
 *  At the cap, income silently stops — no overflow, no queue. */
function awardShards(accountId: string, reason: BattleReason, battleId: string): Promise<number>;

/** BYPASSES the cap. Compensation, prizes, the balance-upward grant. Deliberately a
 *  different function so the cap cannot be forgotten in one place and applied in
 *  the other. */
function grantShards(accountId: string, amount: number, reason: GrantReason): Promise<void>;

/** Called by feature 011 BEFORE invoking the payment rail. */
function canAcceptPurchase(accountId: string, amount: number):
  { ok: true } | { ok: false; reason: 'would-exceed-cap'; headroom: number };

/** SUM(delta). Derived, never a stored column. */
function balance(accountId: string): Promise<number>;

function placeRune(accountId: string, heroId: string, slot: number, spec: RuneSpec): Promise<PlacementResult>;
function rebuildRune(accountId: string, heroId: string, slot: number, spec: RuneSpec): Promise<PlacementResult>;

/** Convergent, banded, Hidden-doubled on a win. Called inside the conclusion
 *  transaction (feature 007). */
function updateRating(battle: BattleConclusion): Promise<{ attacker: number; defender: number }>;

/** Reads runes CURRENTLY ON HEROES, never lifetime spend. Recomputed on placement,
 *  inside the same transaction. */
function gearScore(accountId: string): Promise<number>;
```
