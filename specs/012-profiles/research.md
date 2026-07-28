# Phase 0 Research: Profiles & Export

**Feature**: `012-profiles` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. Q1 is a test to write *before* the query it tests. Q2 and Q3 are
decisions.

**The principle the whole feature turns on**: *an absence that can be measured is
not an absence.* A Hidden battle must be **selected out**, never **filtered out** —
because a filtered list has a measurable gap and the gap is the disclosure.

---

## Q1 — Write the leak test before the query

**Decision: the test is a fixture and an assertion, and it exists before any query
does.**

```
Fixture: a player whose last 40 battles alternate strictly
         Visible, Hidden, Visible, Hidden, …

SELECT the "last 20 Visible battles" for the profile.

  a FILTERED implementation  → ~10 entries   ← WRONG, and it looks fine in isolation
  a SELECTED implementation  → 20 entries    ← reaches back 40 battles
```

**That is the whole test, and it fails loudly on the wrong implementation** — which
no amount of code review reliably catches, because both implementations read
correctly and differ only in a `LIMIT` position:

```sql
-- WRONG: take 20, then drop Hidden. The gap is measurable.
SELECT * FROM (SELECT … ORDER BY concluded_at DESC LIMIT 20) t WHERE zone = 'visible';

-- RIGHT: select 20 Visible, however far back that reaches.
SELECT … WHERE zone = 'visible' ORDER BY concluded_at DESC LIMIT 20;
```

**Why the difference is a disclosure and not a cosmetic bug.** Under the filtered
query, a viewer who counts entries learns how many of the last 20 battles were
Hidden. Repeat the observation over days and you learn the player's ambush rate,
their Hidden hold rate, and roughly when they were ambushed — all of which the
design withholds deliberately, because a Hidden squad that can be inferred is not
hidden.

**Three sharper fixtures, all cheap, because the naive one passes accidentally:**

| Fixture | Correct result |
|---|---|
| 40 battles, strictly alternating | 20 entries |
| **fewer than 20 Visible battles ever** | **as many as exist** — never padded, never a placeholder gap |
| **the 20 most recent battles are ALL Hidden** | 20 Visible entries from further back, or fewer if that is all there is |
| a brand-new account, 0 battles | an empty list, and the profile still renders |

**And the timestamp is part of the leak.** If entries carry exact conclusion times,
the *intervals* between them reveal how many battles happened in the gaps. **Round
displayed timestamps to the day**, or the selected query leaks what the filtered one
leaked, one step removed.

---

## Q2 — The export's row shape

**Decision: the export builds its own row from an explicit column list. It never
serialises a battle record and drops fields.**

```
battleId · concludedAt · role · opponentUsername · opponentWasBot
zone · outcome · turnCount · leagueAtTime · ratingAfter
```

**And nothing else. Specifically not `attackerSquad` and not `defenderSquad`**,
either of them, in either direction.

> **The battle record *does* carry both compositions** — it has to, because it is
> the analytics product and LMNTLZ runs no analytics vendor. **Storing is not
> exposing** (Constitution XVII), and this file is where that stops being a slogan.

**The export must drop *both* columns rather than conditionally emitting one.** A
conditional — *"include your own squad, drop your opponent's"* — is wrong twice
over:

1. **A player's own Hidden composition is still secret**, because they can publish
   their own export. An export that includes their Hidden squad is a self-service
   leak of the thing the design most protects.
2. **A conditional is one inverted boolean from full disclosure**, and the inverted
   version produces a plausible-looking file that nobody notices for months.

**So the implementation is a `SELECT` naming ten columns, never `SELECT *` and never
an object spread.** New columns on `battle_records` — and there will be some — must
not appear in the export by default. **Default-deny by construction**: adding a
column to the record is a schema change; adding one to the export is an edit to this
list.

**A test asserts the header row exactly**, so a widened export fails CI rather than
shipping.

**Two exports, two routes, not one parameterised route.** `GET /v1/me/export` and
`GET /v1/guilds/:id/export` run **different queries**. A `scope` parameter invites
the bug where an officer requests the wider scope; two routes with two queries cannot
express that mistake. The guild export is **event data only** — never member battle
detail.

---

## Q3 — Avatar review throughput

**Decision: the $5 fee is the throughput control, the review is a ~20-second glance,
and the queue surface is feature 016's.**

The arithmetic that makes this work:

| | |
|---|---|
| review time | ~20 seconds |
| fee per submission | $5 |
| reviewer capacity | ~180/hour at that pace |
| **submissions needed to fill one hour** | **180 — i.e. $900 of submissions** |

**The fee is what keeps the queue human-sized.** A free avatar upload at 10,000 DAU
is an unbounded moderation queue; at $5 it is self-limiting, and every hour of review
is funded several times over.

**Three implementation consequences:**

- **The fee is charged on submission, not on approval**, or a rejected submission is
  free and the throttle disappears. **A rejection refunds nothing and says so before
  payment.** That is harsh and it is the mechanism.
- **A resubmission is a new submission and a new fee.** Otherwise one purchase buys
  unlimited attempts and the throttle is gone.
- **The queue lives in `apps/admin`** (feature 016), alongside the moderation
  queues. Confirmed: the plan asked whether that surface exists, and it does — feature
  016's structure carries `apps/admin` as a deliberately small confirmation surface,
  and a review queue is the same shape as a pending-action confirmation.

**Avatars are hosted in the same private Blob store as replays**, under a distinct
prefix. Private matters here for the same reason it does there: an **unapproved**
avatar must not be reachable by URL while it sits in the queue, and a public store
cannot express that.

**Harm is a gate; taste is a note** (Constitution XVIII). The review rejects on harm
— hate imagery, sexual content, impersonation. It does **not** reject on quality. A
$5 ugly avatar is approved.

---

## Settled here: what a public profile shows

| Shown | Withheld |
|---|---|
| username, avatar, account age | email, provider identity, entitlements |
| league, rating, gear score | shard balance |
| both zones' **hold streaks** | either zone's **composition** |
| the last **20 Visible** battles | every Hidden battle, **and any gap where one would be** |
| guild name and role, if any | anything about another player's guild application |

**The Visible squad is scoutable via feature 006's `scout` route, not here.** Two
routes, two disclosure rules, no shared serialiser — a shared serialiser between
`profile` and `scout` is precisely how the Hidden squad leaks.

## What is NOT settled here

- **Whether the last-20 window is right.** 20 is a legibility choice. It is
  changeable without a schema change and wants a look once the Battle Record screen
  has real use.
- **Avatar dimensions and file-size limits.** Client-side detail; no contract here
  depends on them.
