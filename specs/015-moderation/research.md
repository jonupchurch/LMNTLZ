# Phase 0 Research: Moderation

**Feature**: `015-moderation` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q1 is the one pre-commitment measurement the design explicitly
calls for**, and it cannot be done without the live model — so this file specifies the
measurement rather than inventing its result. Q2 and Q3 are decisions.

**The shape of the whole feature**: *a model scores; a human decides.* At 99%
specificity over 60,000 daily messages a classifier that created the queue would
produce **600 false flags against 60 real reports** — so it **ranks** the queue and
never creates it.

---

## Q1 — Classification quality at 100 items per call

**This cannot be answered by reasoning and has not been guessed. Here is the
measurement, ready to run.**

### The evaluation set

**300 messages, labelled by hand**, drawn to a fixed composition rather than sampled
randomly — random sampling of real chat yields ~99.9% benign and measures nothing:

| Class | Count | Why it is in the set |
|---|---|---|
| clearly benign | 150 | the false-positive rate is the whole cost |
| clearly harmful — hate, sexual content, threats | 60 | the true-positive rate |
| **friction, not harm** — rudeness, salt, trash talk | **60** | **the boundary the design draws.** Constitution XVIII: harm is a gate, taste is a note |
| **adversarial** — obfuscated slurs, leetspeak, unicode substitution | 30 | what a blocklist misses and a model should not |

### The comparison

Run the identical 300 through the identical prompt at four batch sizes:

```
batch = 1 · 20 · 50 · 100
```

**Report, per batch size:**

| Metric | Why |
|---|---|
| precision, recall, F1 on **harm** | the headline |
| **friction misclassified as harm** | the design's specific worry — over-flagging salt |
| **position-in-batch effect** | does item 97 get judged worse than item 3? |
| cost per 1,000 messages | the reason for batching at all |
| latency per batch | it is asynchronous, so this is nearly free budget |

**The position-in-batch effect is the one that matters and is easy to omit.**
Aggregate accuracy can hold while the tail degrades — bucket by decile of position
within the batch and look for a gradient.

### The decision rule, fixed in advance

> **If quality at 100 is materially worse than at 20, the batch size is the knob —
> not the coverage.**

Recorded in the plan and restated because a bad result invites the wrong fix.
Coverage is what makes the classifier a **ranker** instead of a queue-creator; the
queue's whole defence against 600 false flags a day is that it is fed by human
reports and merely *ordered* by the model. **Dropping to sampled coverage saves money
and destroys the ranking.**

**Cost, so the knob's price is known before it is turned** (~$68/month at 10k daily
players, ~$675 at 100k, roughly **1% of net revenue at any scale**):

| Batch | Relative cost | Effect of halving to 50 |
|---|---|---|
| 100 | 1.0× | — |
| 50 | ~1.4× | ~$95/month at 10k |
| 20 | ~2.3× | ~$155/month at 10k |
| 1 | ~8× | ~$550/month at 10k |

**Even batch-of-20 stays near 1% of net revenue.** The knob is affordable; that is
worth knowing before the measurement, so the result can be read honestly rather than
against a budget.

**Prerequisite**: the labelled set is a real content task and it should be built
alongside the blocklist (feature 014), not after — the blocklist's own false
positives are free training data for what the boundary looks like.

---

## Q2 — The mute threshold, in distinct accounts

**Decision: an automatic mute triggers at **5 distinct reporting accounts** against
one target within **24 hours**, and the mute is **1 hour** on the first occasion.**

**Distinct *accounts*, never distinct reports.** One player filing five reports is
one person's opinion; five players filing one each is a signal. This is what defeats
a single-actor brigade, and it is the entire content of the rule.

**Three qualifiers on what counts as distinct, because "distinct account" is
gameable:**

| Qualifier | Reason |
|---|---|
| the reporter must be **older than 7 days** | otherwise five throwaway accounts is a five-minute attack |
| **at most one report per reporter per target per 24 h** | stops one person's repeated reporting from looking like volume |
| reports from **one guild** count as **one** toward the threshold | a coordinated guild brigade is the realistic multi-account attack, and it is the one a naive distinct-account count cannot see |

**The third is the non-obvious one and it is the one that matters.** Five distinct
accounts *is* the honest signal — unless they are eight people in a guild chat who
agreed to it. Collapsing same-guild reports to one makes the threshold mean *five
independent complaints*.

**One hour, and it escalates.** A mute is automatic, so it must be small enough that
a false positive is an annoyance rather than an injury:

```
1st  → 1 hour       4th → 7 days
2nd  → 24 hours     5th+ → the queue: a HUMAN decides on a ban
3rd  → 72 hours
```

**Escalation needs history from the first mute**, or the second offense starts at the
bottom. Same shape as Constitution XVI: cheap now, unreconstructable later.

**A mute is chat-only and touches no gameplay standing** (FR-014) — no rating, no
shards, no league, no guild membership. That is the balance-upward rule applied to
moderation: the punishment is scoped to the thing that went wrong.

**A muted player is told they are muted, when it expires, and how to appeal.** A
silent mute is a bug report, and it generates exactly the support load the automation
was supposed to save.

---

## Q3 — The two-queue split, at the data layer

**Decision: two tables, not one table with a `category` column.**

```sql
CREATE TABLE reports_harm     ( … );   -- hate · sexual content · threats · impersonation
CREATE TABLE reports_friction ( … );   -- rudeness · spam · salt
```

**A shared table with a filter is one forgotten `WHERE` from the drowning problem the
split exists to prevent.** And the failure is silent and asymmetric: a harm queue
polluted with friction buries the reports that matter under the reports that do not,
and it looks like a busy queue rather than like a bug.

**Two tables make the mistake unrepresentable.** A query against `reports_harm`
cannot accidentally include friction, because friction is not in it. There is no
`WHERE` to forget.

**The cost is real and it is small**: two nearly-identical schemas, and a
reclassification is a delete-and-insert across tables rather than an `UPDATE`. Making
reclassification *explicit* is a benefit — moving a report between queues is a
decision, and it should look like one.

**The router runs once, at report time, from the reporter's chosen category**, and a
moderator may reclassify. The classifier's score **never** routes: it ranks within a
queue it did not choose. That is FR-003 — *the classifier changed nothing* — extended
to the queue itself.

**`reports_harm` gets a distinct SLA and distinct staffing.** The split is pointless
if both queues are worked by the same person in the same sitting, in arrival order.

---

## The human load is the real constraint

~**2 hours a day at 10k players, ~10 at 100k.** Every choice in this feature is
shaped by keeping that number small, and it is worth naming which choices are doing
that work:

| Choice | Effect on human load |
|---|---|
| reports create the queue; the classifier only ranks | **the largest single factor** — 60 real reports/day instead of 660 |
| **embeds carry no moderation surface** (feature 014) | an entire category of review never arrives |
| avatars cost $5 (feature 012) | the image queue is self-limiting |
| mutes are automatic | the volume case never reaches a person |
| bans are human-only | the consequential case always does |

---

## Structural decisions, restated because they are the feature

**`issueBan` takes an actor and there is no overload without one.** FR-012 becomes a
type error rather than a policy someone has to remember.

**`classify` returns scores and has no write access to messages at all.** FR-003 by
capability rather than by discipline. The constitutional property of this feature is
that a model never acts, and the cheapest way to guarantee it is to give the model
nothing to act with.

**Notices are drafted by AI and sent by a human, and they carry no action links.** A
notice with a one-click "confirm ban" turns a draft into an approval flow, and an
approval flow is where a human stops reading.

**Envoys have no powers.** They are present in the Beginner scope and can report like
anyone else. Naming them here so nobody grants a moderation capability to a role
designed not to have one.

**Retention holds are cross-feature.** A report places a hold that feature 008
honours; the replay outlives its 7 days by `max(7d, 30d from the report's close)`.
**Test across the seam, not just within this feature** — a hold that only this
feature knows about is a hold that the cleanup job ignores.

**Constitution XVII applies to the evidence.** Retaining reported content beyond its
channel's normal window makes it available **to moderation** and to nobody else.

## What is NOT settled here

- **Classification quality at 100.** Specified above; needs the live model.
- **Whether 5 distinct accounts is the right threshold.** It wants real report
  volume. Config, not a constant.
- **Appeal handling.** A ban must be appealable and nothing here designs the flow.
  Feature 016 owns the surface; the escalation ladder above assumes it exists.
