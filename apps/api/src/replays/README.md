# Replays and the battle record (feature 008)

**In plain terms:** when a battle ends, two things get saved. A small **record** in
the database that lasts forever and says who fought, who won, how long it took and
with which heroes — and a larger **replay** file, kept for a week, that lets a
player watch it back. Losing the replay costs nothing but the watching; losing the
record would lose the game's memory of itself.

That asymmetry drives every decision in this directory.

## The two artifacts

| | Where | Lifetime | Size | If the write fails |
|---|---|---|---|---|
| **record** | Postgres, inside 007's conclusion transaction | forever | ~200 B | unrecoverable — roll everything back |
| **replay** | private Vercel Blob store, **after** commit | 7 days | ~5 KB | one replay lost, carry on |

## Why the record is the analytics product

LMNTLZ runs **no analytics vendor**. That was not a cost saving: every question the
design promises to answer is a *battle* question — Visible versus Hidden hold rates,
battle length, league thresholds against the real population, hero pick rates. All
of them are `SELECT`s over `battle_records`.

The consequence is **Constitution XVI**, the only principle in the set that cannot
be retrofitted: *a column missing from the first battle ever fought is missing from
history forever.* A migration can add a column; it cannot invent the value it should
have held. So the complete column set landed before the first row, empty, and
`tests/replays/record.test.ts` asserts the table against an explicit list in both
directions — a new column nobody discussed fails just as loudly as a deleted one.

`tests/replays/commitments.test.ts` is where the claim is either true or isn't. It
answers each commitment against a population built to have a known answer, and
asserts exact numbers rather than that the query runs.

## The three properties worth understanding

### 1. The two writes must not share a code path

Fold them together and the implementation is wrong in whichever direction it picks:

- **Both inside the transaction** — a blob write is a network call to a third party.
  Holding a Postgres transaction across it turns every Blob latency spike into lock
  contention on `battles`, and a Blob outage into **an inability to finish battles**.
  The game would stop because a video recorder was down.
- **Both outside it** — the record stops being atomic with the settlement it
  describes, so a crash between them leaves a battle that paid out and is invisible
  to every aggregate. Permanently, per XVI.

`insertRecord` takes a transaction handle and can only be called inside one;
`writeReplayBlob` takes none and swallows its own failure. The signatures keep them
apart. `tests/replays/atomicity.test.ts` forces both failures.

### 2. Availability is policy, not "whether the blob still exists"

`watchable` and `getReplay` both judge against `concluded_at` and the 7-day window,
never against blob presence. Cleanup runs **daily**, so the sweep lags the policy by
up to a day — deriving from the bucket would make the same battle watchable for one
player and not another depending on when a job last ran, and a cleanup outage would
silently extend everyone's retention.

One flag covers four situations, because a player has the same option in all four
(none): never written · deleted · past the window · held for a report.

### 3. There is no re-simulation path, and that is structural

Nothing in `read.ts` imports the resolver, the seed store or `packet.ts`, and it
never reads the `seed` column. The temptation arrives as a kindness — *the replay
expired, but we still have the seed and the action log, so we could recompute it* —
and the moment that exists, **a balance patch changes a past battle's outcome**,
because a recomputation runs today's rules over yesterday's inputs. The divergence
would be invisible: both versions look like a perfectly ordinary battle.

Expiry is answered with `410` and nothing else. `playback.test.ts` proves the
positive form: move `engine_version` and `content_version` under a recorded battle
and the same bytes come back.

## The standing rule: `list()` appears nowhere

Not in the job, not in monitoring, not in an admin view. `ReplayStorage` has no
`list` member, so the call does not typecheck; `cleanup.test.ts` also scans for an
import straight from `@vercel/blob`.

Correctness first — the bucket cannot answer *"which replays belong to concluded
battles older than seven days with no open hold"*, so a listing would be a second
and worse source of truth. The billing model agrees: `del()` is free, `list()` is a
billed advanced operation, and paging 100k blobs would be 100 billed operations per
run against zero for one indexed query.

**The scan strips comments first**, because four of the matches in this directory are
comments explaining the rule — including the one that states it. A check that cannot
pass teaches people to ignore the colour.

## Cleanup: blobs first, then rows

The ordering is the entire resumability argument.

- **Rows then blobs** — a crash in between leaves blobs whose rows no longer point at
  them. With `list()` forbidden, **nothing can ever find them again**. They pay rent
  forever, invisibly.
- **Blobs then rows** — a crash in between leaves rows pointing at blobs already
  gone. The next run re-deletes them, which the SDK documents as a success.

So `del` being idempotent is load-bearing rather than convenient, and
`store.test.ts` asserts it **against the live store** rather than taking it from the
documentation.

`expiredButUndeletedCount()` is the detector for the job silently stopping — a
schedule never registered, a cron removed in a config edit. All of those report
*nothing*, which is indistinguishable from a job with nothing to do. Healthy is
**not zero**: it rises through the day and drops after each run, so the alarm belongs
on sustained growth. `heldCount()` is kept separate so the retention feature working
cannot be mistaken for cleanup failing.

## Retention holds: a row, not a boolean

`replay_holds` is keyed `(battle_id, report_id)` because **two reports against one
battle are two independent holds**. A boolean breaks on the second: close the first
and the flag reads released while the second dispute is still open, and the evidence
is deleted underneath an active case — invisibly, weeks before anyone looks.

Effective retention is `max(7 days from conclusion, 30 days from the report's
close)`. Measured from the *close* because the dispute is what the evidence is for: a
report opened on day six and closed on day forty needs the replay until day seventy.

**Release is a state change, never a delete.** `releaseHold` sets `released_at` and
the next cleanup run does the deleting, which keeps deletion in exactly one place —
the second deletion path is always the one that is not batched, resumable or
idempotent.

## Storing is not exposing

The record carries **both** squads, because pick rates cannot be computed from
compositions nobody kept. The defender's appears in no response. Those rules live
where data leaves the system, and `exposure.test.ts` holds the *set* of surfaces —
including the two that do not exist yet, so feature 012's CSV export and profile
view cannot ship unconsidered.

## Known incomplete, deliberately

- **A held replay past its window is readable by nobody.** T035 restricts it to
  moderators; the restriction is implemented and the exception is not, because
  operator identity arrives with feature 015 (an env allowlist minting a short-lived
  scoped token — see `specs/016-ops-admin/spec.md`). `getReplay` takes an
  `asModerator` flag no route can set. The restriction being real first is the safe
  direction: 015 adds a grant to an enforced rule, rather than discovering that held
  evidence had been served to participants all along.
- **`defender_is_bot` is only ever `false`.** There are no bots until
  `07-defense-ai.md` and feature 009. The column and its plumbing are tested; the
  values wait.
- **League and rating are null on every row.** Features 009 and 010 do not exist, so
  those values were never real. XVI protects values that *were* real; it does not
  require inventing ones that were not, and a sentinel would be worse than null —
  `rating = 0` is indistinguishable from a real 0, whereas null says *"this battle
  predates rating"* out loud. `commitments.test.ts` fails the day they start being
  written, so somebody confirms it deliberately.
- **The daily schedule is not registered.** `cleanupExpired` is written, batched and
  tested; wiring it to a cron belongs to feature 016 (T029). Until then storage
  grows — which is survivable at current volume and is exactly what
  `expiredButUndeletedCount()` will report.
- **Whether 7 days is right is unsettled.** A cost decision taken before any usage
  data exists. The watch rate and this counter answer it later.

## Operational note

**One variable, on the API project only: `BLOB_READ_WRITE_TOKEN`.**

The client never touches the blob store. Reads are served through a Function so a
browser never holds a blob URL, which is the whole reason the store is private — so
this credential anywhere near the client build would be a write token in shipped
JavaScript.

All three operations use the same credential deliberately. `put` and `del` go
through the SDK, which defaults to `BLOB_READ_WRITE_TOKEN`; the raw `GET` for a
private blob could have used the rotating `VERCEL_OIDC_TOKEN` instead, and does not.
If reads authenticated differently from writes, a credential problem would surface
on exactly one of the three — replays writing fine and refusing to open, or the
reverse — which is much worse to debug than a missing variable. OIDC stays as a
fallback.

Without the token, `writeReplayBlob` logs and gives up: every battle still settles
and records correctly, and every replay reports `watchable: false`. A degradation
rather than an outage, by design — but silent apart from the log line.
