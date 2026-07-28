# Quickstart: Replays & Battle Records

**Feature**: `008-replays` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test replays
```

## The golden path

1. Conclude a battle.
2. Confirm **both** artifacts: a `battle_records` row and a blob.
3. Advance the clock past 7 days, run `cleanupExpired()`.
4. **The record survives. The entry reports itself unwatchable.**

Step 4 is the feature in one line — two artifacts, two lifetimes.

## The metadata row — check every column, once

Conclude one battle and assert the row is **complete**. Not "has the fields we
happened to think of" — complete, against the list:

```
turn_count · attacker_squad · defender_squad · defender_is_bot · zone
attacker_league · defender_league · attacker_rating · defender_rating
engine_version · content_version · build_sha
```

**Write the test as a schema assertion, not as field-by-field checks.** A
field-by-field test grows a hole the moment someone adds a column and forgets the
test; asserting the full column set fails loudly instead.

**`defender_is_bot` deserves its own test** because it is the one most likely to be
dropped as obviously-unnecessary. Fight a bot, fight a human, and confirm the flag
distinguishes them. Bot defenders are a curated population — mixing them into a
hold-rate figure measures the curation, not the meta.

**Three stamps, three columns.** Assert `engine_version ≠ content_version ≠
build_sha` on a build where all three genuinely differ. A single merged "version"
cannot answer *did this move because the roster changed or the engine did*, which
is the first question a balance investigation asks.

## Atomicity — the failure that matters

```
1  inject a failure on the battle_records INSERT
2  conclude a battle
3  assert: transaction rolled back
           NO shards awarded, NO rating movement, NO ambush-streak change
           the battle is still playable — the client retries the final action
```

Then the **other** side, which must behave completely differently:

```
1  inject a failure on the blob put()
2  conclude a battle
3  assert: the battle CONCLUDED normally — shards, rating, streak all applied
           replay_blob_url IS NULL
           the list entry reports watchable: false
```

**These two must not share a code path.** A failed metadata row is unrecoverable
and rolls everything back; a failed blob costs one replay and is ignored. An
implementation that treats them the same is wrong in one direction or the other.

## The cleanup job

```
✓ deletes blobs older than 7 days
✓ leaves every battle_records row untouched
✓ is safe to run twice — the second run deletes nothing and errors on nothing
✓ is resumable — kill it mid-batch, re-run, no double-delete and no skipped rows
✓ never calls list()
```

The last line is a grep, and it is worth automating:

```bash
rg "\blist\(" apps/api/src/jobs apps/api/src/replays apps/admin
```

**Must return nothing.** `del()` is free; `list()` is a billed advanced operation.
Postgres knows what exists; the bucket is write-and-delete only. This was decided
on correctness grounds and the billing model happens to agree.

Then the monitoring signal: stop the job, advance the clock, and confirm
`expiredButUndeletedCount()` **grows**. A job that silently stops is the failure
this number exists to catch, and a detector written after the fact is written by
someone who has not seen it happen.

## Retention holds

```
1  conclude a battle
2  file a report against it            → hold placed
3  advance 8 days, run cleanup         → the blob SURVIVES
4  close the report                    → releaseHold sets released_at
5  advance 29 days, run cleanup        → still survives
6  advance 31 days, run cleanup        → NOW deleted
```

`max(7 days from conclusion, 30 days from the report's close)`.

Then the case a boolean flag cannot express:

```
1  two separate reports against one battle
2  close ONE of them
3  run cleanup   → the blob survives, because the other hold is open
```

Holds are **rows**, not a flag. Two reports are two independent holds.

## Access control

```
participant requests their own replay          → 200
non-participant requests it                    → 404 (not 403 — do not confirm it exists)
moderator requests a HELD replay               → 200
non-moderator requests a held replay           → 404
anyone with the raw blob URL, unauthenticated  → BLOCKED
```

The last line is the private-store check. If it succeeds, the store was created
public and a replay URL is a permanent bearer capability. **The access mode cannot
be changed after store creation** — this is the one thing here worth verifying
before writing any other code, because the fix is a migration of every blob.

## Constitution XVII

The record stores both squads' compositions. Confirm:

```
✓ battle_records.defender_squad is populated
✗ GET /v1/me/battles never returns it
✗ the CSV export never contains it (feature 012)
✗ the profile never shows a Hidden squad
```

**Storing is not exposing.** The row is the analytics product; the disclosure rules
are separate and live where the data leaves the system.
