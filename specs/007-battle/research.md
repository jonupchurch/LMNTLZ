# Phase 0 Research: Battle

**Feature**: `007-battle` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. Q1 and Q2 are decisions; **Q3 needs a definition that decides a
number the design already quotes**, and getting it wrong changes the request count
by roughly 2×.

---

## Q1 — The idempotency mechanism

**Decision: a unique constraint on `(battle_id, sequence)`, with the client
supplying the sequence it believes it is writing.**

```sql
CREATE TABLE battle_actions (
  battle_id   uuid    NOT NULL REFERENCES battles(id),
  sequence    integer NOT NULL,
  actor_instance_id text NOT NULL,
  power_id          text NOT NULL,
  target_instance_id text,
  draw_index_before  bigint NOT NULL,
  draws_consumed     bigint NOT NULL,
  resolved_packet    jsonb  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, sequence)
);
```

**This makes a duplicate a constraint violation rather than a race to detect.**
The insert either succeeds or raises `23505`; there is no window between a check
and a write for a second request to slip through. Application-level detection —
"select, then insert if absent" — has that window, and it is exactly the window a
mobile connection drop produces.

**The retry path, in full:**

```
INSERT ... ON CONFLICT (battle_id, sequence) DO NOTHING RETURNING resolved_packet

  returned a row  → first write; return that packet
  returned none   → already written; SELECT resolved_packet and return IT
```

**The stored packet is returned, not a recomputed one.** Recomputing would be
correct — the resolver is deterministic — but it would be *correct by argument*
rather than by construction, and a version change between the two calls would make
it wrong. Storing the packet also makes the retry cheap.

**A sequence that skips is rejected.** `sequence` must be exactly one more than the
battle's current maximum. A gap means the client and the server disagree about
history, and continuing would resolve an action against a state neither believes
in. `409` with the current sequence lets the client resynchronise by re-reading.

**The client supplies the sequence, and that is safe here.** Normally trusting a
client-supplied ordinal is a mistake; it is safe because the constraint is the
enforcement and the value is *checked*, not *believed* — a wrong value produces a
conflict or a `409`, never a wrong battle.

---

## Q2 — The abandoned-battle policy

**Decision: one battle open at a time, and an open battle expires 24 hours after
its last action.**

### One at a time

**Rationale**: several open battles is a real exploit surface rather than a
convenience. With `n` open, a player can start battles against several opponents,
play each a few turns, and **abandon the ones going badly** — which converts the
attack-income tiers and the ambush counter into something you can farm by
selection. The ambush chance rises `+2%` per consecutive win and caps at 90%
(`CLAUDE.md`); a player able to discard losses climbs it on a filtered record.

One at a time also makes the whole feature simpler: `POST /v1/battles` with one
already open returns `409` and the open battle's id, so "resume" needs no separate
concept.

### 24 hours, then expire

**Expiry discards the battle: no win, no loss, no shards, no rating movement, no
ambush-streak change, and no battle record.** It is a no-op, exactly like the
maintenance discard (`docs/tech-stack.md`), and for the same reason — a battle the
player did not finish should cost them nothing and teach the system nothing.

| Considered | Verdict |
|---|---|
| **Discard (chosen)** | Costs the player nothing. Records nothing false. |
| Count as a loss | Punishes a dropped connection, and *every* aggregate the battle record feeds becomes a record of network quality. |
| Count as a win for the defender | Same problem, plus it makes disconnecting a defensive strategy for the attacker's opponent — who did not participate. |
| Resolve it on the 300-turn tiebreak | Resolves a battle the player never played. The pooled-HP tiebreak is for a battle that ran long, not one that stopped. |

**24 hours rather than an hour**: an interrupted session should be resumable after
work, and the storage cost of an open battle is an action log of at most a few
hundred rows. The number is a starting point and it is config, not a constant.

**Expiry is a scheduled job (feature 016) driven from Postgres**, never from a
scan. It must be resumable and safe to re-run — the same shape as the replay
cleanup, and for the same reason.

> **The discard must be recorded even though the battle is not.** An operations
> question — *"how many battles are being abandoned, and by whom"* — is a real
> signal, and abandonment rate is one of the few things that could indicate a
> client bug. A counter on the account, not a battle row: **recording that a
> battle was abandoned is not the same as recording a battle**, and only the second
> would pollute the aggregates Constitution XVI protects.

---

## Q3 — The packet boundary

**Decision: a request boundary falls where the player makes a *choice with more
than one legal outcome*. Everything between two such points resolves in one
packet — including every engine turn.**

```
A player choice exists iff, after stages 1-3 of targeting:
    the actor has  > 1  available power   OR
    the chosen power has  > 1  legal target
```

**Both halves must be false for the turn to fold into the packet.** The plan asked
about two specific cases and this settles both:

| Case | Is it a choice? |
|---|---|
| A hero passing with no legal target | **No.** Nothing to decide. Folds in. |
| One legal power, one legal target | **No.** The outcome is forced. Folds in. |
| One legal power, three legal targets | **Yes.** Stop and ask. |
| Four available powers, one enemy left | **Yes.** Power choice is a real decision — different tiers, different types, different cooldown costs. |
| Any defender turn | **No.** The engine decides. Folds in. |

**"One power and one target is not a choice" is the load-bearing half**, and it is
the one that could reasonably go the other way. It folds in because a UI that stops
to ask a question with one answer is a click that teaches the player nothing —
and the design already treats a forced move as forced elsewhere (a hero *passes*
rather than being asked whether to pass).

### The arithmetic this decides

A 6v6 runs ~102 hero-turns, roughly half of them the attacker's — about **51
player-side turns**. Under this rule a request is spent only on the turns that
carry a decision, and the design quotes **20–40 requests per battle**.

That range implies **40–80% of player turns present a real choice**, which is
consistent with the shape of the game: the tier-0 auto-attack is always available,
so a hero with any second power off cooldown has a choice; and reach-2 champions
see 2–5 candidates for most of a battle.

> **This is a prediction, not a measurement, and it is worth checking against the
> first real battles.** If the figure comes in at 45–50 requests, the boundary is
> too fine and the "one power, several targets where the targets are equivalent"
> case is worth folding. If it comes in under 15, something is folding turns that
> genuinely had a decision in them — which is worse, because it means the player is
> not being asked.
>
> **`turnCount` on the battle record answers this directly** and it is already
> mandatory under Constitution XVI. Requests-per-battle is `turnCount` against the
> action-log length, so **the check needs no new field** — it needs the field that
> already cannot be backfilled.

**Never round-trip on an animation.** The packet carries everything up to the next
choice; the client plays it out at its own pace. A player who alt-tabs mid-packet
loses nothing, because the server already resolved it.

---

## What is NOT settled here

- **What happens to an in-flight battle on a version change.** `reDerive` returns
  `VersionMismatch` (feature 003); this feature must decide between discarding and
  refusing. Discard is almost certainly right — it matches the abandonment and
  maintenance answers, and it costs the player nothing — but it needs feature 016's
  tooling to be observable, so it is settled with the ops surface.
- **The exact drain duration.** ~15 minutes is recorded; feature 016 owns it and
  it wants real battle lengths, which do not exist yet.
