# Quickstart: Moderation

**Feature**: `015-moderation` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test moderation
```

## Write this one early

### "The classifier changed nothing"

```
1  snapshot every message row
2  run a classifier batch over all of them
3  diff
4  → IDENTICAL. Not one byte.
```

**It is the constitutional property of the feature and it is trivial to assert.**
Then the version that keeps being true:

```bash
rg -n "UPDATE messages|DELETE FROM messages" apps/api/src/moderation workers/
```

**Nothing.** `classify` has no write access to messages at all — FR-003 by capability
rather than by discipline. The cheapest way to guarantee a model never acts is to give
it nothing to act with.

## Nothing here gates

```
1  stop the classifier entirely
2  post a message in every scope
3  → all succeed, normally, at full speed
```

The blocklist belongs to feature 014 and gates **there**. If sending degrades when the
classifier is down, the classifier is on the send path — regardless of what the
architecture diagram says. Two generated diagrams drew it as a gate.

## Queue ordering and the two-table split

```
file reports of mixed severity
→ rankQueue('harm') returns them ordered by score
→ rankQueue('friction') NEVER contains a harm report
```

Then the structural check that makes the second line permanent:

```bash
rg -n "reports_harm|reports_friction" apps/api/src
```

**Two tables.** No shared table with a `category` column, and therefore no `WHERE` to
forget. A harm queue polluted with friction buries the reports that matter under the
ones that do not — and it looks like a busy queue rather than a bug.

Then confirm reclassification is explicit:

```
reclassify a friction report as harm
→ a DELETE from reports_friction and an INSERT into reports_harm
→ not an UPDATE
```

Moving a report between queues is a decision and should look like one.

## The mute threshold

```
5 reports from ONE account            → no mute
5 reports from 5 accounts, 8 days old → MUTE, 1 hour
5 reports from 5 accounts, 2 days old → no mute (reporters too new)
5 reports from 5 accounts in ONE GUILD → NO MUTE — they count as one
3 from one guild + 4 unaffiliated      → MUTE (1 + 4 = 5)
```

**Line 4 is the one that matters and the one a naive distinct-account count gets
wrong.** Five distinct accounts *is* the honest signal — unless they are eight people
in a guild chat who agreed to it. This is the realistic multi-account attack.

Line 3 defeats the five-throwaway-accounts version of the same idea.

### Escalation needs history from the first mute

```
1st offense → 1 hour        4th → 7 days
2nd         → 24 hours      5th → THE QUEUE, a human decides
3rd         → 72 hours
```

Test the second offense **after a service restart**, so history is genuinely read from
storage. Same shape as Constitution XVI: cheap now, unreconstructable later.

### A mute touches nothing but chat

```
after a mute:
✓ rating unchanged      ✓ shards unchanged
✓ league unchanged      ✓ guild membership unchanged
✓ battles still playable
✗ cannot post in any scope
```

**And the player is told**: what happened, when it expires, how to appeal. A silent
mute is a bug report, and it generates exactly the support load the automation saves.

## Bans are human-only, by type

```ts
issueBan(accountId, scope, until)           // ← MUST NOT COMPILE
issueBan(accountId, scope, until, actorId)  // ← the only signature
```

**Assert this as a type test, not a runtime test.** FR-012 is a type error rather than
a policy someone has to remember, and a runtime check tests a policy.

```bash
rg -n "issueBan" apps/api/src workers/
```

No call site in an automated path. Confirm no configuration flag can promote
`applyMute` into `issueBan` — the two are different functions with different
signatures, and **a mute has no human-issued variant and a ban has no automatic one.**

## Notices

```
✓ AI drafts
✓ a human sends
✗ the notice contains NO action links
```

A notice with a one-click *"confirm ban"* turns a draft into an approval flow, and an
approval flow is where a human stops reading.

## Retention holds — test across the seam

**This is the cross-feature test and the one most likely to be skipped**, because it
needs feature 008 running.

```
1  conclude a battle, file a report against it
2  advance 8 days
3  run feature 008's cleanup job
4  → the replay SURVIVES
5  close the report, advance 31 days, run cleanup
6  → NOW deleted
```

**A hold only this feature knows about is a hold the cleanup job ignores.** Testing
within this feature alone passes while the blob is silently deleted on schedule.

## Envoys have no powers

```
an Envoy attempts to mute        → 403
an Envoy attempts to ban         → 403
an Envoy attempts to view a queue → 403
an Envoy files a report          → 201, like anyone else
```

Named explicitly so nobody grants a moderation capability to a role designed not to
have one.

## The classification-quality measurement — Q1, and it needs the live model

**Not a unit test.** A pre-commitment measurement the design explicitly calls for.

```
300 hand-labelled messages:
  150 clearly benign
   60 clearly harmful
   60 FRICTION, not harm      ← the boundary Constitution XVIII draws
   30 adversarial — obfuscated slurs, leetspeak, unicode substitution

Run the identical set through the identical prompt at batch = 1 · 20 · 50 · 100.
```

Report per batch size: precision/recall/F1 on harm · **friction misclassified as
harm** · **position-in-batch effect** · cost per 1,000 · latency.

**Bucket by decile of position within the batch.** Aggregate accuracy can hold while
the tail degrades, and item 97 being judged worse than item 3 is invisible in a mean.

> **The decision rule, fixed in advance: if quality at 100 is materially worse than at
> 20, the BATCH SIZE is the knob — not the coverage.** Full coverage is what makes the
> classifier a *ranker* instead of a queue-creator. Batch-20 costs ~2.3× batch-100 and
> stays near 1% of net revenue, so the knob is affordable — which is worth knowing
> before the measurement, so the result is read honestly rather than against a budget.
