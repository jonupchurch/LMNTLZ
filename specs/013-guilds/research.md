# Phase 0 Research: Guilds

**Feature**: `013-guilds` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. Q1 and Q2 are about making two hard-to-test things testable; Q3 is
the cross-feature warning that has already been lost three times.

**What is in and what is not**: guilds keep **roster, roles, permissions, invites,
applications, succession and the emblem**. **Guild events, Wings and guild funds are
deferred with their design** — a Wing exists only for an event, so deferring events
defers Wings; they are not separable.

---

## Q1 — Make the clock injectable before writing succession

**Decision: no module in this feature calls `Date.now()` or `new Date()`. A `Clock`
is a constructor dependency, and the ambient calls are banned by lint.**

```ts
interface Clock { now(): Date; }

const systemClock: Clock = { now: () => new Date() };
const fixedClock  = (t: Date): Clock => ({ now: () => t });
```

**Succession is the feature where an untested timer is most expensive, because it
transfers ownership.** Two timers span 21 days:

```
guild master inactive 14 days   →  succession becomes AVAILABLE to officers
                    +  7 days   →  succession completes if unchallenged
```

**Nobody will wait 21 days to test this, so an implementation that requires waiting
is an implementation that ships untested.** With an injectable clock every branch is
a few lines:

```
master returns at day 13          → succession never becomes available
master returns at day 20          → succession is available and CANCELS
master never returns              → succession completes at day 21
master returns at day 22          → too late; they are no longer master
```

**The last one is the branch worth naming**, because it is the one a real person
experiences as unfair and the one nobody thinks to test. The decision — succession
is final once complete — needs to be *deliberate*, and it is only deliberate if
somebody wrote the test.

**Ban the ambient calls, do not merely avoid them:**

```jsonc
// eslint no-restricted-globals / no-restricted-syntax in apps/api/src/guilds
"Date.now"  → error
"new Date()" with no arguments → error
```

A convention that says "inject the clock" is a convention someone breaks in a
one-line bug fix at the worst moment. **The lint rule is the enforcement**, and the
same rule should extend to every feature with a timer — application expiry (7 days),
invitation expiry, and the starter week are all the same shape.

> **`sim/rules` already forbids clock access for a different reason** (purity, feature
> 002). This is the same rule arriving from the testing side, and the two should share
> the lint configuration rather than each having their own.

---

## Q2 — First-acceptance-wins under concurrency

**Decision: one transaction, with the **applicant's membership row** as the contended
resource. Not the guild, and not the application.**

```sql
BEGIN;
  -- The contended resource. UNIQUE(account_id) means at most one membership.
  INSERT INTO guild_members (account_id, guild_id, role, joined_at)
  VALUES ($applicant, $guild, 'member', now());
  -- 23505 here => the applicant is already in a guild => this acceptance loses

  UPDATE guild_applications
     SET state = 'withdrawn', withdrawn_at = now()
   WHERE account_id = $applicant AND state = 'open' AND id <> $acceptedId;

  UPDATE guild_applications SET state = 'accepted' WHERE id = $acceptedId;

  -- graduate from the starter league — the guild exit (feature 009)
  UPDATE accounts SET starter_exited_at = now(), starter_exit_reason = 'guild'
   WHERE id = $applicant AND starter_exited_at IS NULL;
COMMIT;
```

**Why the membership row and not the guild row.** Locking the guild serialises two
*different* guilds accepting two *different* applicants, which is pure contention for
nothing. The invariant being protected is *"an account belongs to at most one
guild"*, and that invariant lives on the applicant. **Lock what the invariant is
about.**

**Why not the application row.** Two guilds accept two *different* applications from
the same player — different rows, no conflict, two memberships. The application is
the wrong grain entirely.

**The losing acceptance gets a clean answer**, not a crash: catch `23505`, return
`409` with `{ reason: 'already-joined', guildId }`. The officer whose click lost sees
*"Reyna joined The Long Reach a moment ago"* rather than a server error.

**Confirm it before building the happy path**, as the plan says. A concurrency test
written afterwards is written against an implementation that already has a shape,
and the shape is the thing being tested.

```
test: two guilds accept the same applicant simultaneously
  → exactly ONE guild_members row
  → exactly ONE application in state 'accepted'
  → every other open application in state 'withdrawn'
  → the loser received 409, not 500
```

**Withdrawal must be in the same transaction as the membership.** Two operations
leave a window where the player is in a guild *and* has open applications — and a
second acceptance in that window is a second membership. That is the whole bug.

---

## Q3 — The starter-league warning, coordinated with feature 009

**Confirmed and specified in feature 009's contract. Restated here because this
feature is where it renders, and where it has been lost three times.**

**Two doors, and both need it:**

| Door | Warning appears |
|---|---|
| **Invitation** | on the invitation, which the player accepts themselves |
| **Application** | **on the application** — not on the acceptance |

> **The application is the load-bearing case.** A player who applies and is admitted
> a day later would otherwise be graduated **by someone else's click, at a moment
> they were not present for.** The application is where they are actually making the
> decision, so that is where the decision has to be described.

**Both losses must be named**, because they are two different things:

1. **Beginner status** ends — real opponents instead of authored ones.
2. **The beginner bonus** ends — attack income drops from 1.5× to the base rate.

A player told only *"you'll leave the starter league"* has **not** been told their
income drops.

**The enforcement is a type, not a string.** Feature 009 exposes
`starterExitWarning(accountId)` returning a required payload, and neither confirm can
be **constructed** without it. A shared constant string is not enough — three screen
regenerations have proved a string can be dropped, and a string can be dropped
silently.

**Founding a guild is the same exit and needs the same warning.** `POST /v1/guilds`
graduates the founder, so it takes the same confirm. This is the door most likely to
be missed, because founding feels like a creation flow rather than a joining one.

**Do not oversell the loss either.** The 1.5× mostly replaces dormant hold income —
nothing attacks a starter player's defense, and holds are ~26% of a typical day. Only
about 11% is actual help.

---

## Settled here because the shape forces it

**Founding costs 650 shards and the founder becomes master.** The charge and the
guild creation are one transaction, for the same reason the rune rebuild is — a
partial failure would leave a paid-for guild that does not exist, or a guild nobody
paid for.

**Succession requires 650 available**, which is a real check at the moment of
completion and not at the moment it becomes available. An officer who could afford it
on day 14 and cannot on day 21 does not inherit.

**Three roles: master, officer, member.** Officer and above may invite; officers may
initiate succession; only the master may set the emblem and disband.

**Applications: at most 5 concurrent, 7-day expiry.** Expiry is a scheduled job
(feature 016), driven from Postgres, resumable, safe to re-run — the same shape as the
replay cleanup.

**The emblem is composed from preconfigured assets and therefore needs no review.**
36 icons × 12 inks × 12 grounds, every one vetted at authoring time, so a saved
emblem is a triple of indices into a curated palette — **5,184 combinations, none of
them player-supplied content**. It saves immediately, and a low-contrast combination
**warns and never blocks** (FR-004).

> **Composition is what removes the review, not a relaxed policy.** An avatar is an
> **upload**, so feature 012 pre-moderates it and stores it privately until approved.
> There is no equivalent step here because there is no equivalent surface — nothing
> in an emblem is authored by the player, which is the same reason feature 014's
> embeds carry no moderation cost.
>
> **The guild *name* and *pitch* are text and do go through feature 015.** An
> unacceptable name is the one case where a permanent name changes, handled as a free
> forced rename.

## What is NOT settled here

- **Guild events, Wings, guild funds.** Deferred with their design. Guilds keep
  roster, roles and permissions; they simply have nothing to compete in yet.
- **Whether 14 + 7 days is right for succession.** The shape is decided; the numbers
  want a real population, and they are config.
- **Whether a disbanded guild's name is reclaimable.** Small, and no contract here
  depends on it.
