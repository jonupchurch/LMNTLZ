# Phase 0 Research: Operations & Admin Tooling

**Feature**: `016-ops-admin` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. Q1 is the load-bearing one and the plan already named the honest
answer. Q2 is a build-config check. Q3 wants a number that does not exist yet.

**The shape**: **reversible actions execute; irreversible ones propose.** The
intended operator **may be an agent**, so scoping and logging are structural rather
than procedural.

---

## Q1 — What makes the confirmation surface unreachable by automation

**Decision: a separate credential the tooling never holds. Not a separate UI, not a
separate route, not a robots directive — a separate credential.**

The plan states the problem exactly: *"an agent will not navigate a web page" is not a
guarantee.* An agent with the API token and a browser tool can click a button. **The
control has to be something the automation does not possess**, not something it is
merely unlikely to use.

```
API token           → apps/api. Held by every automated caller. Can EXECUTE
                      reversible actions and CREATE pending irreversible ones.
Operator credential → apps/admin only. Sign-in with a hardware security key.
                      NEVER placed in an environment variable, a CI secret, or
                      any config file the tooling can read.
```

**A hardware key rather than a password or a TOTP secret**, and the distinction is the
whole point: a password can be put in a `.env` for convenience at 2am, and a TOTP seed
is a string an agent can be handed. **A hardware key is a physical object that cannot
be copied into a config file.** That is what makes "the tooling never holds it" a
property rather than an intention.

**`confirm(pendingId, humanActorId)` requires a session minted from that credential.**
Not a role flag on an ordinary session — a **different authentication path**, so no
permission misconfiguration can grant it.

**Three supporting rules, each closing a specific bypass:**

| Rule | Closes |
|---|---|
| a pending action **expires in 24 hours** | an accumulated backlog of pre-approved destruction |
| **the proposer cannot be the confirmer** | an operator with both credentials rubber-stamping their own action |
| **every proposal, confirmation, expiry and refusal is audited** | a refusal is a signal, and an unaudited one is a signal that was thrown away |

**The reversible/irreversible split is expressed in the action TYPES**, not checked at
runtime. `execute` accepts only `ReversibleAction`; there is no runtime branch to
forget and no way for a caller to pass an irreversible action to it. FR-008 becomes a
compile error.

**Where the line falls, because it is not obvious and should be written down:**

| Reversible — `execute` | Irreversible — `propose` |
|---|---|
| set maintenance state | delete an account |
| issue / lift a chat mute | delete a guild |
| issue a **timed** ban | issue a **permanent** ban |
| grant shards | purge a replay before its expiry |
| comp a pass | roll back a migration |
| discard an in-flight battle | anything touching the battle record |

> **"Reversible" means reversible *in the product*, not reversible in principle.** A
> timed ban expires on its own; a permanent ban requires another action to undo and,
> more importantly, the player has already been told. **A granted shard is reversible
> because the ledger is append-only** — a compensating entry is a first-class thing,
> not a repair.
>
> **The battle record is irreversible by construction** (Constitution XVI). Nothing
> touching it is ever in the left column.

---

## Q2 — Source-map upload at build time

**Confirmed as a requirement; it is a build-config item, not a design decision.**

Without it, client stack traces are minified noise and **the entire reason for buying
error monitoring evaporates.** The client is a Vite bundle, so:

```
1  build with `sourcemap: 'hidden'`
   — emits maps, omits the //# sourceMappingURL comment, so they are NOT served
2  upload the maps to the error reporter, tagged with the release
3  DELETE the maps from the deployed output
4  the release tag is `buildSha` — the same stamp on the battle record
```

**Step 3 is the one that gets skipped and it is a real disclosure.** Served source maps
publish the client source. That is not catastrophic for a game whose rules are
public — but `sim/rules` is shipped to the client and its exact constants are a
scouting advantage nobody should get for free.

**Step 4 is the one that makes the tooling useful.** The same `buildSha` on the battle
record and on the error report means *"which build produced this error, and what were
those players fighting under"* is a join rather than an investigation.

**Verify by breaking it on purpose**: deploy, throw a deliberate error from a nested
module, and read the trace. If it names the original file and line, it works. If it
names `index-a3f9.js:1:48213`, the upload silently failed — which is the normal
failure mode, because nothing else changes.

**Server traces need no upload** — the API runs the built output with maps available
in-process.

---

## Q3 — The drain duration

**Decision: 15 minutes, as recorded, as a config value, with the caveat written down
rather than assumed away.**

`draining` exists so in-flight battles finish on their own rather than being
discarded. So the right duration is *"long enough that nearly every open battle
concludes"* — and **that is a wall-clock question about battle length, which nobody
has measured.**

What is known:

```
a 6v6 runs ~102 hero-turns
at ~3 s per hero-turn (an ESTIMATE, not a measurement)  →  ~5 minutes
15 minutes is ~3x that
```

**The ~3 s figure is explicitly an estimate** in `06-progression.md` — *"which nobody
has measured in wall-clock."* So 15 minutes is a defensible starting point built on an
unmeasured input, and it should be labelled that way rather than treated as derived.

**What is genuinely unknown is the tail, not the median.** A player who starts a battle
and walks away is the case that decides the number, and that is a *player behaviour*
distribution, not a simulation one. It cannot be estimated from turn counts at all.

**So the design must not depend on the drain being long enough**, and it does not:

- **A battle open at the end of the drain is discarded** — and a discard is a **no-op**
  (feature 007): no win, no loss, no shards, no rating, no record. Costs the player
  nothing.
- **The drain is therefore an optimisation**, not a correctness requirement. That is
  what makes shipping an unmeasured 15 minutes acceptable.

**Re-derive from p99 battle duration once feature 008 is recording**, using
`endedAt − startedAt`.

**Both columns are already in the shared model** — `specs/data-model.md` § 4 carries
`startedAt, endedAt` on the Battle record. **Nothing needs adding; what is needed is
that they survive into the migration**, which is a real risk precisely because
`turnCount` sits next to them and feels like it covers battle length.

> **It covers *engine* length. The drain needs *wall-clock* length**, and the two
> differ by however long a player spends thinking. Unbackfillable like everything else
> on that row, so a migration that drops them as redundant is a migration that makes
> the drain permanently unmeasurable.

---

## Settled here because the operator may be an agent

**`apps/admin` exists and is small — and the plan is right that the opposite was
claimed earlier and is wrong.** Propose-don't-execute *requires somewhere to confirm*,
so the confirmation surface is unavoidable. What good tooling avoids is the
**expensive half** of an admin console — dashboards, search, bulk editing — not the
whole of it.

```
apps/admin  contains:  the pending-action queue and its confirm button
                       the moderation queues (feature 015)
                       the avatar / emblem review queue (features 012, 013)
            and nothing else.
```

**Every capability added to it is a capability that must then be secured**, behind the
one credential the automation deliberately does not hold. That is the reason to keep
it small, and it is a stronger reason than build cost.

**`health()` checks observed state, never job self-reports.** A job that has silently
stopped reports nothing at all, so a self-report is exactly the wrong signal:

```
✗  "the cleanup job last reported success at 04:00"
✓  expiredButUndeletedCount() = 0            (feature 008)
✓  openBattlesOlderThan24h() = 0             (feature 007)
✓  expiredApplicationsStillOpen() = 0        (feature 013)
✓  unclassifiedMessagesOlderThan1h() = 0     (feature 015)
✓  unreconciledPaymentsOlderThan48h() = 0    (feature 011)
```

**Each is a query against the state the job is supposed to maintain.** Build each one
**alongside** its job, not after — *"a detector written later is written by someone who
has not seen the failure."*

**The audit log is unreconstructable**, which puts it in the same class as the battle
record. It ships before anything else in this feature, and it records **refusals** as
well as actions.

## What is NOT settled here

- **The drain duration's real value.** Needs p99 wall-clock. `started_at` must be on
  the battle record from the first battle.
- **The appeal surface** for bans (feature 015). It belongs in `apps/admin` and
  nothing designs it yet.
- **Alerting destinations and thresholds.** Operational, and they want a running
  system.
