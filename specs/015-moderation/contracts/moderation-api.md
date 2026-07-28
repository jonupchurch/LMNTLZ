# API Contract: Moderation

**Feature**: `015-moderation` | Versioned JSON REST under `/v1`, plus internal jobs.

> **A model scores; a human decides.** At 99% specificity over 60,000 daily messages a
> classifier that *created* the queue would produce **600 false flags against 60 real
> reports**. So it **ranks** the queue and never creates it.
>
> **Nothing in this feature gates anything.** The blocklist belongs to feature 014 and
> gates there.

---

## `POST /v1/reports`

```jsonc
{ "targetType": "message" | "profile" | "avatar" | "guild-emblem" | "username",
  "targetId": "...",
  "category": "harm" | "friction",
  "detail": "..." }
```

```jsonc
// 201
{ "reportId": "rpt_...", "queue": "harm" }
```

**Routing happens once, here, from the reporter's chosen category.** A moderator may
reclassify. **The classifier's score never routes** — it ranks within a queue it did
not choose. That is FR-003 extended to the queue itself.

**Filing a report places a retention hold** (feature 008). The replay or message
outlives its normal window by `max(7 days from conclusion, 30 days from the report's
close)`.

## Two queues, two tables

```sql
CREATE TABLE reports_harm     ( … );  -- hate · sexual content · threats · impersonation
CREATE TABLE reports_friction ( … );  -- rudeness · spam · salt
```

**Not one table with a `category` column.** A shared table with a filter is one
forgotten `WHERE` from the drowning problem the split exists to prevent — and the
failure is **silent and asymmetric**: a harm queue polluted with friction buries the
reports that matter, and it looks like a busy queue rather than a bug.

**Two tables make the mistake unrepresentable.** There is no `WHERE` to forget.

Reclassification is a delete-and-insert across tables rather than an `UPDATE`.
**Making it explicit is a benefit** — moving a report between queues is a decision and
should look like one.

`reports_harm` gets a **distinct SLA and distinct staffing**. The split is pointless if
both queues are worked by the same person in the same sitting, in arrival order.

---

## Actions — automatic and human-only are separated at the function level

```ts
/** AUTOMATIC. Threshold-triggered. There is NO human-issued variant. */
function applyMute(accountId: string, duration: Duration, trigger: MuteTrigger): Promise<void>;

/** HUMAN ONLY. Takes an actor and THERE IS NO OVERLOAD WITHOUT ONE — FR-012 becomes
 *  a type error rather than a policy someone has to remember. */
function issueBan(accountId: string, scope: BanScope, until: Date, actorId: HumanActorId): Promise<void>;

/** HUMAN ONLY. FREE to the player — a forced rename is a correction, not a charge. */
function forceRename(accountId: string, actorId: HumanActorId): Promise<void>;
```

**A mute has no human-issued variant and a ban has no automatic one.** The split is
structural, so **no configuration mistake can promote automation into issuing a ban.**

### The automatic mute threshold

```
5 DISTINCT REPORTING ACCOUNTS against one target within 24 hours
```

**Distinct *accounts*, never distinct reports.** One player filing five reports is one
person's opinion; five players filing one each is a signal.

Three qualifiers, because "distinct account" is gameable:

| Qualifier | Defeats |
|---|---|
| reporter must be **older than 7 days** | five throwaway accounts as a five-minute attack |
| **one report per reporter per target per 24 h** | one person's repetition looking like volume |
| **reports from one guild count as ONE** | a coordinated guild brigade — the realistic multi-account attack, and the one a naive distinct count cannot see |

The third is the non-obvious one. Five distinct accounts *is* the honest signal —
unless they are eight people in a guild chat who agreed to it.

### Escalation

```
1st  → 1 hour        4th  → 7 days
2nd  → 24 hours      5th+ → THE QUEUE. A human decides on a ban.
3rd  → 72 hours
```

**History is needed from the first mute**, or the second offense starts at the bottom.
Same shape as Constitution XVI: cheap now, unreconstructable later.

**A mute is chat-only and touches no gameplay standing** (FR-014) — no rating, no
shards, no league, no guild membership. The balance-upward rule applied to moderation:
the punishment is scoped to the thing that went wrong.

**A muted player is told they are muted, when it expires, and how to appeal.** A silent
mute is a bug report, and it generates exactly the support load the automation saves.

---

## The classifier

```ts
/** Returns SCORES. Touches nothing.
 *
 *  It has NO WRITE ACCESS TO MESSAGES AT ALL — FR-003 by capability rather than by
 *  discipline. The constitutional property of this feature is that a model never
 *  acts, and the cheapest way to guarantee it is to give the model nothing to act
 *  with.
 *
 *  ASYNCHRONOUS. Off the send path entirely. Batches of 100; a batch answers in
 *  minutes. Drawn as a gate — as two generated diagrams drew it — it would stall a
 *  quiet guild channel for hours. */
interface Classifier {
  classify(batch: readonly MessageForReview[]): Promise<readonly Score[]>;
}

/** Orders an existing queue. NEVER creates one. */
function rankQueue(queue: 'harm' | 'friction'): Promise<RankedReport[]>;
```

**Batch size is the knob, not coverage.** If quality at 100 is materially worse than at
20, halve the batch — coverage is what makes the classifier a *ranker* instead of a
queue-creator, and sampled coverage destroys the ranking. Cost at batch-20 is ~2.3× of
batch-100, which stays near **1% of net revenue at any scale**.

## Notices

```ts
/** AI DRAFTS. A HUMAN SENDS. The notice carries NO ACTION LINKS. */
function draftNotice(action: ModerationAction): Promise<string>;
function sendNotice(draft: string, accountId: string, actorId: HumanActorId): Promise<void>;
```

A notice with a one-click *"confirm ban"* turns a draft into an approval flow, and an
approval flow is where a human stops reading.

## Bans — two axes

| Axis | Values |
|---|---|
| **scope** | `chat` · `chat+social` · `full` |
| **duration** | hours … permanent |

A **chat** ban leaves gameplay untouched. A **full** ban is human-only and permanent
bans are human-only twice over.

---

## What is deliberately absent

**Envoys have no powers.** They are present in the Beginner scope and report like
anyone else. Named here so nobody grants a moderation capability to a role designed
not to have one.

**There is no gate in this feature.** `rg -n "reject|block|deny" apps/api/src/moderation`
should find nothing on the send path. The blocklist is feature 014's and gates there.

**Retention holds are cross-feature.** A report places a hold that **feature 008
honours**. A hold only this feature knows about is a hold the cleanup job ignores —
test across the seam.

**Constitution XVII**: retaining reported content beyond its normal window makes it
available **to moderation** and to nobody else.

---

## The human load is the constraint

~**2 hours/day at 10k players, ~10 at 100k.** What keeps it there:

| Choice | Effect |
|---|---|
| reports create the queue; the classifier only ranks | **largest factor** — 60 real reports/day, not 660 |
| embeds carry no moderation surface (feature 014) | a whole category never arrives |
| avatars cost $5 (feature 012) | the image queue is self-limiting |
| mutes are automatic | the volume case never reaches a person |
| bans are human-only | the consequential case always does |
