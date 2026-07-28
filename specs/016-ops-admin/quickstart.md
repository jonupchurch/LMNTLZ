# Quickstart: Operations & Admin Tooling

**Feature**: `016-ops-admin` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test ops
```

## The golden path — from the plan

1. Set `draining` with battles in flight. Confirm they **finish** and new ones
   **refuse**.
2. Take one **reversible** and one **irreversible** action. Confirm the different
   paths and the audit entries.

## Maintenance

```
live      → POST /v1/battles 201   ·  act 200
draining  → POST /v1/battles 503   ·  act 200   ← in-flight battles FINISH
down      → both 503
```

Line 2 is the entire reason `draining` exists. Then:

```
✓ the state changes WITHOUT a deploy
```

Flip it in edge config and confirm the API picks it up. This is the one control that
must work when deploys are the thing that is broken.

Then the case the drain does not have to cover:

```
1  set draining with a battle open
2  wait past the drain window
3  → the battle is DISCARDED: no win, no loss, no shards, no rating, no record
```

**The drain is an optimisation, not a correctness requirement** — which is what makes
shipping an unmeasured 15 minutes acceptable. Assert the discard is a genuine no-op,
because that is the property the 15 rests on.

## The action split is a compile error, not a runtime check

```ts
execute({ kind: 'delete-account', accountId }, actor)   // ← MUST NOT COMPILE
```

**Assert this as a type test.** FR-008 is enforced by `execute` accepting only
`ReversibleAction` — there is no runtime branch to forget, and a runtime test would be
testing a branch that should not exist.

Then behaviourally:

```
execute  a timed ban        → applied immediately, audited
propose  a permanent ban    → pending record, NOTHING applied, audited
confirm  it without the operator credential  → 403
confirm  it WITH the credential             → applied, audited
```

## The confirmation surface is unreachable by automation

**This is the load-bearing control and it deserves a real test, not a comment.**

```
1  take the API token — everything an agent holds
2  attempt confirm(pendingId, ...) with it        → 403
3  attempt it via the admin UI, driven by a browser tool, with the same token → 403
```

**Step 3 is the one that matters.** *"An agent will not navigate a web page"* is not a
guarantee — an agent with a browser tool can click a button. The control is that
`confirm` requires a session minted from a **different authentication path**, backed by
a hardware key that is a physical object and cannot be copied into a config file.

Then the audit for what a config file must never contain:

```bash
rg -in "operator|admin_key|ADMIN_TOKEN" .env* apps/api vercel.json .github/
```

**Nothing.** A password would end up in a `.env` for convenience at 2am; a TOTP seed is
a string an agent can be handed. That is why it is a hardware key.

### The three supporting rules

```
a pending action after 25 hours              → expired, cannot be confirmed
the proposer attempts to confirm their own   → 403
a refused confirm                            → APPEARS IN THE AUDIT LOG
```

The third is easy to skip. **A refusal is a signal** — an agent repeatedly attempting
an irreversible action is exactly what this design exists to make visible.

## The audit log

```
✓ every execute, propose, confirm, expiry AND refusal is recorded
✓ actor_kind distinguishes human · agent · system
✗ there is no UPDATE or DELETE against admin_audit anywhere
```

```bash
rg -n "UPDATE admin_audit|DELETE FROM admin_audit" apps/
```

**Unreconstructable, like the battle record.** It ships before anything else here.

## Health checks observe, never self-report

```
1  stop the replay cleanup job entirely
2  advance the clock 9 days
3  health() → expiredButUndeletedCount > 0, and the check FAILS
```

**A job that has silently stopped reports nothing at all**, so a self-report is exactly
the wrong signal. Repeat for each:

```
openBattlesOlderThan24h            feature 007
expiredApplicationsStillOpen       feature 013
unclassifiedMessagesOlderThan1h    feature 015
unreconciledPaymentsOlderThan48h   feature 011
```

**Each check ships with its job, not after.** A detector written later is written by
someone who has not seen the failure.

Then the structural check:

```bash
rg -in "lastRunAt|lastSuccessAt|heartbeat" apps/api/src/ops
```

If a health check reads a job's own timestamp, it reports on a job that is running and
says nothing about one that is not.

## `successionTimers` executes nothing

```
1  a guild master goes inactive past the window
2  run successionTimers
3  → the outcome is SURFACED
4  → ownership has NOT transferred
5  → completion goes through `execute`
```

A job that transfers guild ownership on a timer is an irreversible action running
unattended.

## Source maps

**Break it on purpose — this is the only reliable check.**

```
1  deploy
2  throw a deliberate error from a nested client module
3  read the trace in the error reporter
```

```
✓ it names the original file and line
✗ it names index-a3f9.js:1:48213      ← the upload silently failed
```

Silent failure is the normal mode here, because nothing else changes when it breaks.

Then the step that gets skipped:

```bash
curl -I https://<deployed>/assets/index-a3f9.js.map   # → 404
```

**Served source maps publish the client source.** `sim/rules` ships to the client, and
its exact constants are a scouting advantage nobody should get for free.

And the join that makes it useful:

```
the error report's release tag === the battle record's buildSha
```

*"Which build produced this error, and what were those players fighting under"* becomes
a join rather than an investigation.

## `apps/admin` stays small

```bash
ls apps/admin/src/routes
```

Three things: the pending-action queue, the moderation queues, the avatar/emblem review
queue. **Nothing else.**

**Every capability added here is a capability that must then be secured** behind the
one credential the automation deliberately does not hold. That is a stronger reason to
keep it small than build cost is.

## The one thing to check survives the migration

```sql
SELECT started_at, ended_at FROM battle_records LIMIT 1;
```

**Both are already in the shared model** (`specs/data-model.md` § 4). Nothing needs
adding — what needs checking is that neither is dropped as redundant, which is a real
risk because `turnCount` sits next to them and looks like it covers battle length.

**It covers *engine* length.** The drain must be re-derived from **p99 wall-clock**
(`ended_at − started_at`), and the two differ by however long a player spends
thinking. Unbackfillable, like everything else on that row.
