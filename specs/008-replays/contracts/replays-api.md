# API Contract: Replays & Battle Records

**Feature**: `008-replays` | Versioned JSON REST under `/v1`, plus internal jobs.

**Two artifacts with opposite lifetimes**, and the difference is the feature:

| | Where | Lifetime | If the write fails |
|---|---|---|---|
| **metadata row** | Postgres | **forever** | unrecoverable — inside the transaction |
| **event log** | Vercel Blob (**private** store) | **7 days** | one replay lost — outside the transaction |

---

## The metadata row — Constitution XVI

```sql
CREATE TABLE battle_records (
  battle_id        uuid PRIMARY KEY,
  started_at       timestamptz NOT NULL,   -- WALL-CLOCK. turnCount is ENGINE length;
  concluded_at     timestamptz NOT NULL,   -- the drain (016) needs the difference

  attacker_id      uuid NOT NULL,
  defender_id      uuid NOT NULL,
  defender_is_bot  boolean NOT NULL,     -- WITHOUT THIS EVERY AGGREGATE IS POLLUTED
  zone             text NOT NULL,        -- 'visible' | 'hidden'

  winner           text NOT NULL,
  reason           text NOT NULL,        -- 'wipe' | 'cap-hp-share' | ...
  turn_count       integer NOT NULL,

  attacker_squad   jsonb NOT NULL,       -- six hero ids + seats
  defender_squad   jsonb NOT NULL,       -- stored, NOT exposed (Constitution XVII)

  attacker_league  text NOT NULL,
  defender_league  text NOT NULL,
  attacker_rating  integer NOT NULL,
  defender_rating  integer NOT NULL,

  engine_version   text NOT NULL,        -- rules + generator
  content_version  text NOT NULL,        -- the roster
  build_sha        text NOT NULL,        -- everything else
  --                THREE STAMPS, NEVER MERGED. A single "version" column cannot
  --                answer "did this move because the roster changed or the
  --                engine did" — the first question any balance pass asks.

  replay_blob_url  text,                 -- NULL once expired, or if the put failed
  replay_deleted_at timestamptz
);
```

**Every field must be present from the first battle ever recorded.** This table is
the analytics product — LMNTLZ runs no analytics vendor because every question the
design promises to answer is a battle question. A column added later is a column
missing from the history the first balance pass reads, and under the no-nerf rule
that pass is the one that matters most.

---

## Routes

### `GET /v1/me/battles`

```jsonc
{
  "battles": [
    {
      "battleId": "btl_...", "concludedAt": "...", "role": "attacker",
      "opponent": { "id": "acc_...", "username": "reyna", "isBot": false },
      "zone": "visible", "outcome": "win", "turnCount": 96,
      "watchable": true
    }
  ],
  "total": 50
}
```

Most recent **50**. **`watchable` is per entry and is the whole point** — letting
a client discover expiry by *failing to open a replay* is the behaviour FR-013
exists to prevent. One flag covers **expired · held · deleted · never-written**.

The list shows **both** squads' outcomes but **never** the defender's composition;
composition is stored and not exposed.

### `GET /v1/replays/:battleId`

| Status | When |
|---|---|
| `200` | the event log |
| `404` | no such battle, or the caller was not a participant |
| `410` | expired, deleted, or never written — `{ "reason": "expired" \| "unavailable" }` |

**Served through a Function from a private blob store.** The store is private
because public means *"anyone with the URL"*, which makes a replay URL a permanent
bearer capability — and a replay under a moderation hold must be readable by
moderators and by nobody else. **The access mode cannot be changed after store
creation**; getting it wrong is a migration of every blob, not a config fix.

```jsonc
// 200
{
  "battleId": "btl_...",
  "engineVersion": "e_...", "contentVersion": "c_...",
  "events": [ /* the stored ResolvedPacket sequence */ ],
  "conclusion": { "winner": "attacker", "reason": "wipe" }
}
```

**Never re-simulated.** A balance patch cannot change a past battle's outcome
because nothing recomputes one. The log carries **no seed and no draw indices**.

---

## Internal contracts

```ts
/** Called from inside the conclusion transaction for the row, and after commit
 *  for the blob. The split is the feature — see research.md Q3. */
async function recordBattle(conclusion: BattleConclusion): Promise<void>;

/** Most recent 50, with `watchable` per entry. */
async function listBattles(accountId: string): Promise<BattleListEntry[]>;

async function getReplay(battleId: string, requesterId: string):
  Promise<ReplayLog | { expired: true } | { notFound: true }>;

/** A report places a hold. Retention becomes
 *    max(7 days from conclusion, 30 days from the report's close). */
async function placeHold(battleId: string, reportId: string): Promise<void>;
async function releaseHold(reportId: string): Promise<void>;
// Release sets `released_at`; the next cleanup run deletes. Deletion lives in
// exactly ONE place, which is what makes "safe to re-run" true.

/** Batched, resumable, idempotent. Driven ENTIRELY from Postgres. */
async function cleanupExpired(batchSize?: number): Promise<{ deleted: number }>;

/** The monitoring signal. Near zero; grows when the job silently stops. */
async function expiredButUndeletedCount(): Promise<number>;
```

### The cleanup query — and the call that must never appear

```sql
SELECT battle_id, replay_blob_url
FROM battle_records
WHERE concluded_at < now() - interval '7 days'
  AND replay_blob_url IS NOT NULL
  AND replay_deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM replay_holds h
    WHERE h.battle_id = battle_records.battle_id AND h.released_at IS NULL
  )
ORDER BY concluded_at
LIMIT $1;
```

> **`list()` must not appear anywhere in this feature** — not in the job, not in
> monitoring, not in an admin view. Postgres knows what exists; the bucket is
> write-and-delete only.
>
> Verified against the Blob docs: **`del()` is free of charge; `list()` is a billed
> advanced operation.** Listing 100k blobs at 1,000/page is 100 billed operations
> per run against zero for the query above. The Postgres-driven design was chosen
> on correctness grounds and happens to be the cheap one.

**Cadence: daily, off-peak.** Storage is billed on a monthly average of 15-minute
snapshots, so an hourly run and a daily run differ by a rounding error. Cadence is
therefore an operational choice, not a cost one.

```sql
CREATE TABLE replay_holds (
  battle_id   uuid NOT NULL REFERENCES battle_records(battle_id),
  report_id   uuid NOT NULL,
  placed_at   timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (battle_id, report_id)   -- two reports = two independent holds
);
```

A hold is a **row**, not a flag: a flag cannot express two concurrent holds, and
the blob store cannot be queried without a billed `list()`.

**Constitution XVII**: a retention hold makes a replay available **to moderation**
and to nobody else. Retaining reported content beyond its normal window is not a
licence to publish it.
