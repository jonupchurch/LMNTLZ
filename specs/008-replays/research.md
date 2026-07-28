# Phase 0 Research: Replays

**Feature**: `008-replays` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q1 was the one with the largest effect on this feature's size,
and it has been answered against the current vendor documentation** rather than
carried forward as an assumption.

---

## Q1 — Does Vercel Blob support lifecycle expiry? *(verified)*

**No. The cleanup job ships.**

Checked against the Vercel Blob documentation (`vercel.com/docs/vercel-blob`, last
updated 2026-07-13). There is **no lifecycle rule, no TTL, no `expiresAt`, and no
retention setting** on `put()` or on the store. The only expiry-shaped option is
`cacheControlMaxAge`, which controls **CDN caching, not object retention** — a
blob whose cache entry expired still exists and is still billed.

**The only documented deletion path is `del()`.** So `docs/tech-stack.md`'s
recorded assumption — *"assume Vercel Blob has no equivalent and budget a cron"* —
was correct, and is now verified rather than assumed.

### Three facts from the docs that change the design for the better

**1 · `del()` is free. `list()` is billed.**

> *"Delete operations using `del()` are free of charge. They are considered
> advanced operations for operation rate limits but not for billing."*
> *"Advanced operations … when the `list()` method is called to list blobs in your
> store."*

**This independently confirms the recorded decision to drive cleanup from Postgres
rather than from listing the bucket** — a decision made on correctness grounds, and
it turns out to be the cheap one too. Listing 100,000 blobs at 1,000 per page is
**100 billed advanced operations per run**; querying Postgres for expired rows
costs zero blob operations, and the deletes themselves are free.

> **`list()` must not appear in this feature at all.** Not in the cleanup job, not
> in monitoring, not in an admin view. Postgres knows what exists; the bucket is
> write-and-delete only.

**2 · Storage is billed on a 15-minute-snapshot monthly average, not on peak.**

So cleanup **cadence barely matters to the bill** — a daily run and an hourly run
differ by a rounding error in the monthly average. Cadence should be chosen for
operational reasons instead: **daily, off-peak**, small enough batches to be
interruptible, resumable, and safe to re-run.

**3 · Replay blobs must be in a *private* store.**

Public means *"anyone with the URL"*, which would make a replay URL a bearer
capability — permanently, since a URL cannot be revoked. Private blobs are
delivered **through a Function**, so the API authorises each read against the
requester. That matters directly here: a replay under a **retention hold** for a
moderation report must remain readable by moderators and unreadable by everyone
else, and a public URL cannot express that.

> **The access mode cannot be changed after the store is created.** Getting this
> wrong is not a config fix; it is a migration of every blob.

### What ships

```
cleanupExpired()   query Postgres for battles where
                     concluded_at < now() - 7 days
                     AND replay_deleted_at IS NULL
                     AND NOT EXISTS (an open retention hold)
                   del() each blob · set replay_deleted_at
                   batched, resumable, idempotent

expiredButUndeletedCount()   the monitoring signal — the count that should be
                             near zero and grows when the job silently stops
```

---

## Q2 — The report grace period

**Decision: a report places a retention hold that survives the 7-day expiry, and
the hold releases **30 days** after the report closes.**

```
replay lifetime = max( 7 days from conclusion,
                       30 days from the close of the last open report on it )
```

**Rationale for 30 rather than 7 or 90**: the hold exists so a moderation decision
can be reviewed after the fact — by the reporter appealing, by the reported player
appealing, or by a second moderator. 7 days is shorter than a ban appeal typically
takes. 90 days makes a single vexatious report an indefinite storage grant, and the
retention has no upper bound because a closed report can be reopened.

**The hold is a row, not a flag on the blob.** `replay_holds (battle_id,
report_id, placed_at, released_at)`, with the cleanup query joining against it. Two
reasons: a flag cannot express *two* concurrent holds from two reports, and the
blob store cannot be queried without a billed `list()`.

**Release is a state change, not a delete.** `releaseHold` sets `released_at`; the
next cleanup run does the deleting. That keeps deletion in exactly one place, which
is what makes "safe to re-run" true.

**Constitution XVII applies and is worth saying plainly**: retaining reported
content beyond its channel's normal window **is not** a licence to publish it. The
hold makes the replay available **to moderation**, and to nobody else — the same
distinction the export rules draw.

---

## Q3 — Is the record write atomic with battle conclusion?

**Decision: the metadata row is written inside the conclusion transaction. The
blob is written outside it, after commit.**

```
BEGIN
  battles.concluded_at, .winner, .reason
  battle_records  ← the Constitution XVI row
  shard award · rating update · ambush counter · hold streak
COMMIT
-- then, and only then:
  put(replay blob)   →  battle_records.replay_blob_url
```

**The split is the whole answer, and each side is chosen for a different failure:**

| Artifact | If the write fails |
|---|---|
| **metadata row** | the battle is **invisible to every aggregate** — and the aggregate is the entire analytics product, since LMNTLZ runs no analytics vendor. **Unrecoverable.** So: inside the transaction. |
| **replay blob** | one player cannot watch one replay for 7 days. **Annoying, bounded, and self-healing** — the row records that the blob is missing. So: outside. |

**Putting the blob inside would be worse, not better.** A blob write is a network
call to a third party; holding a Postgres transaction open across it means every
Blob latency spike becomes lock contention on the battles table, and a Blob outage
becomes an inability to *finish battles*. The recorded design already says
gameplay must not depend on the replay store.

**The blob write is retried; the row is not.** A failed `put` sets
`replay_blob_url = NULL` and the entry reports itself **unwatchable** (FR-013) —
which is the same surface as an expired replay, and needs no new concept. One retry
on the next request touching the battle; after that it stays unwatchable.

> **`listBattles` returns a `watchable` flag per entry.** Letting the client
> discover expiry — or a failed write — by *failing to open a replay* is exactly
> the behaviour FR-013 exists to prevent. One flag covers expired, held, deleted
> and never-written.

---

## The metadata row — restated because it cannot be fixed later

Constitution XVI's only unretrofittable constraint lands here. From the **first
battle ever recorded**:

```
turn_count            attacker_squad        defender_squad
defender_is_bot       attacker_league       defender_league
attacker_rating       defender_rating       zone (visible | hidden)
engine_version        content_version       build_sha
```

**`defender_is_bot` is the one most likely to be dropped as "obviously not needed",
and without it every aggregate is polluted** — bot defenders are a curated,
deliberately-shaped population, so mixing them into a hold-rate or win-rate figure
measures the curation rather than the meta.

**Three stamps, never merged**: `engine_version` (the rules and the generator),
`content_version` (the roster), `build_sha` (everything else). A single "version"
column cannot answer *"did this change because the roster moved or because the
engine did"*, which is the first question any balance investigation asks.

**Storing composition is not exposing it** (Constitution XVII). The row carries both
squads; the CSV export drops both columns and the profile never shows Hidden.

---

## What is NOT settled here

- **Whether 7 days is right.** It is a cost decision made before any usage data
  exists. `expiredButUndeletedCount` and the watch rate together answer it later —
  if almost nobody opens a replay older than two days, 7 is generous; if the
  Battle Record screen turns out to be how players study opponents, it is short.
- **Replay compression.** ~5 KB per replay is the recorded estimate. At 7-day
  retention the total is small enough that compression is not worth the complexity
  until the estimate is checked against real logs.
