# API Contract: Operations & Admin Tooling

**Feature**: `016-ops-admin` | Internal API plus `apps/admin`.

> **Reversible actions execute; irreversible ones propose.** The intended operator
> **may be an agent**, so scoping and logging are structural rather than procedural.

---

## The two credentials

```
API token            apps/api. Held by every automated caller — including an agent.
                     Can EXECUTE reversible actions and CREATE pending irreversible
                     ones.

Operator credential  apps/admin ONLY. Sign-in with a HARDWARE SECURITY KEY.
                     Never in an environment variable, a CI secret, or any config
                     file the tooling can read.
```

**A hardware key rather than a password or a TOTP seed, and the distinction is the
point.** A password gets put in a `.env` for convenience at 2am; a TOTP seed is a
string an agent can be handed. **A hardware key is a physical object that cannot be
copied into a config file** — which is what makes *"the tooling never holds it"* a
property rather than an intention.

**`confirm` requires a session minted from that credential** — a different
authentication path, not a role flag on an ordinary session. **No permission
misconfiguration can grant it.**

---

## The action split — expressed in types, not checked at runtime

```ts
type ReversibleAction =
  | { kind: 'set-maintenance'; state: MaintenanceState }
  | { kind: 'mute'; accountId: string; duration: Duration }
  | { kind: 'lift-mute'; accountId: string }
  | { kind: 'ban-timed'; accountId: string; scope: BanScope; until: Date }
  | { kind: 'grant-shards'; accountId: string; amount: number }
  | { kind: 'comp-pass'; accountId: string; sku: Sku }
  | { kind: 'discard-battle'; battleId: string };

type IrreversibleAction =
  | { kind: 'delete-account'; accountId: string }
  | { kind: 'delete-guild'; guildId: string }
  | { kind: 'ban-permanent'; accountId: string; scope: BanScope }
  | { kind: 'purge-replay'; battleId: string }
  | { kind: 'rollback-migration'; version: string };

/** Accepts ONLY ReversibleAction. There is no runtime branch to forget and no way
 *  for a caller to pass an irreversible action — FR-008 is a COMPILE ERROR. */
function execute(action: ReversibleAction, actorId: ActorId): Promise<Result>;

/** Creates a pending record. Does NOT act. Audited. */
function propose(action: IrreversibleAction, actorId: ActorId): Promise<PendingId>;

/** From the confirmation surface ONLY. Requires the operator credential. */
function confirm(pendingId: PendingId, humanActorId: HumanActorId): Promise<Result>;
```

> **"Reversible" means reversible *in the product*, not in principle.** A timed ban
> expires on its own; a permanent ban needs another action to undo and — more
> importantly — the player has already been told. **A granted shard is reversible
> because the ledger is append-only**: a compensating entry is a first-class thing, not
> a repair.
>
> **Nothing touching the battle record is ever reversible** (Constitution XVI).

### Three rules on pending actions

| Rule | Closes |
|---|---|
| expires in **24 hours** | an accumulated backlog of pre-approved destruction |
| **the proposer cannot be the confirmer** | an operator with both credentials rubber-stamping their own action |
| every proposal, confirmation, expiry **and refusal** is audited | a refusal is a signal, and an unaudited one is a signal thrown away |

---

## Maintenance

```ts
type MaintenanceState = 'live' | 'draining' | 'down';
function maintenanceState(): Promise<MaintenanceState>;   // from edge config
```

Read from edge config so it is **changeable without a deploy** — the one control that
must work when deploys are the thing that is broken.

| State | New battles | Open battles | Everything else |
|---|---|---|---|
| `live` | 201 | 200 | normal |
| **`draining`** | **503** | **200 — they finish** | normal |
| `down` | 503 | 503 | 503 |

**Drain duration: 15 minutes, as config.**

> **The number is a starting point built on an unmeasured input, and it is labelled
> that way rather than assumed away.** A 6v6 runs ~102 hero-turns at **~3 s per
> hero-turn — an estimate, not a measurement** — so ~5 minutes, and 15 is ~3×.
>
> **The tail is what actually decides it, and the tail is player behaviour**, not
> simulation: a player who starts a battle and walks away cannot be estimated from turn
> counts at all.
>
> **The design does not depend on the drain being long enough.** A battle still open at
> the end is **discarded**, and a discard is a no-op — no win, no loss, no shards, no
> rating, no record. **The drain is an optimisation, not a correctness requirement**,
> which is what makes shipping an unmeasured 15 minutes acceptable.
>
> **Re-derive from p99 `ended_at − started_at` once feature 008 is recording.** Both
> columns are **already** in `specs/data-model.md` § 4; what matters is that they
> survive into the migration, which is a real risk because `turnCount` sits next to
> them and looks like it covers battle length. **It covers *engine* length; the drain
> needs *wall-clock*.** Unbackfillable like everything else on that row.

---

## Health — observed state, never job self-reports

```ts
function health(): Promise<HealthReport>;
```

```
✗  "the cleanup job last reported success at 04:00"
✓  expiredButUndeletedCount()          = 0   feature 008
✓  openBattlesOlderThan24h()           = 0   feature 007
✓  expiredApplicationsStillOpen()      = 0   feature 013
✓  unclassifiedMessagesOlderThan1h()   = 0   feature 015
✓  unreconciledPaymentsOlderThan48h()  = 0   feature 011
```

**A job that has silently stopped reports nothing at all**, so a self-report is exactly
the wrong signal. Each check above is a query against the state the job is supposed to
maintain.

**Build each check alongside its job, not after.** A detector written later is written
by someone who has not seen the failure.

## Scheduled jobs

| Job | Cadence | Owner |
|---|---|---|
| `cleanupReplays` | daily, off-peak | 008 |
| `expireOpenBattles` | hourly | 007 |
| `expireApplications` | hourly | 013 |
| `classifyMessages` | continuous, batches of 100 | 015 |
| `reconcilePayments` | daily, 48 h window | 011 |
| `successionTimers` | hourly — **surfaces outcomes; executes nothing** | 013 |
| `expirePendingActions` | hourly | this feature |

**All query-driven, resumable, and safe to re-run.** None lists an external bucket —
Postgres knows what exists.

**`successionTimers` executes nothing**, deliberately: a job that transfers guild
ownership on a timer is an irreversible action running unattended. It surfaces the
outcome; completion goes through `execute`.

---

## The audit log

```sql
CREATE TABLE admin_audit (
  id          bigserial PRIMARY KEY,
  actor_id    text NOT NULL,
  actor_kind  text NOT NULL,        -- 'human' | 'agent' | 'system'
  action      jsonb NOT NULL,
  outcome     text NOT NULL,        -- 'executed' | 'proposed' | 'confirmed'
                                    -- | 'refused' | 'expired'
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Unreconstructable, which puts it in the same class as the battle record.** It ships
before anything else in this feature.

**Refusals are recorded.** A refusal is a signal — an agent repeatedly attempting an
irreversible action is the exact thing this design exists to make visible.

---

## `apps/admin` — deliberately small

```
the pending-action queue and its confirm button
the moderation queues                     (feature 015)
the avatar review queue                   (feature 012 — uploads only)
```

**And nothing else.** Propose-don't-execute *requires somewhere to confirm*, so the
surface is unavoidable — what good tooling avoids is the **expensive half** of an admin
console (dashboards, search, bulk editing), not the whole of it.

**Every capability added here is a capability that must then be secured** behind the
one credential the automation deliberately does not hold. That is a stronger reason to
keep it small than build cost is.

## Error monitoring

```
build with sourcemap: 'hidden'   → maps emitted, no sourceMappingURL comment
upload to the reporter            → tagged with the release
DELETE the maps from the deploy   → served maps publish the client source
release tag = buildSha            → the SAME stamp on the battle record
```

**The delete is the step that gets skipped.** `sim/rules` ships to the client and its
exact constants are a scouting advantage nobody should get for free.

**The shared `buildSha` is what makes the tooling useful** — *"which build produced this
error, and what were those players fighting under"* becomes a join rather than an
investigation.
