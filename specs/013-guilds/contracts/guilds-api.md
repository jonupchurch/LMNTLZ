# API Contract: Guilds

**Feature**: `013-guilds` | Versioned JSON REST under `/v1`.

**In scope**: roster, three roles, invites, applications, succession, the emblem.
**Out**: guild events, Wings and guild funds — deferred with their design. A Wing
exists only for an event, so deferring events defers Wings; they are not separable.

---

## `POST /v1/guilds`

```jsonc
{ "name": "The Long Reach", "confirmed": true,
  "acknowledged": ["bot-opponents-end", "income-multiplier-ends"] }
```

| Status | When |
|---|---|
| `201` | founded; **the founder becomes master** |
| `402` | fewer than 650 shards |
| `409` | already in a guild |
| `409` | `acknowledged` incomplete **and the founder is in the starter league** |
| `409` | name taken |

**Founding is one transaction**: charge 650 · create the guild · create the master
membership · **graduate from the starter league**. A partial failure would leave a
paid-for guild that does not exist, or a guild nobody paid for.

> **Founding is a starter-league exit and takes the same warning as joining.** This
> is the door most likely to be missed, because founding feels like a creation flow
> rather than a joining one.

## `POST /v1/guilds/:guildId/applications`

```jsonc
{ "message": "...", "confirmed": true,
  "acknowledged": ["bot-opponents-end", "income-multiplier-ends"] }
```

| Status | When |
|---|---|
| `201` | applied; expires in **7 days** |
| `409` | already in a guild |
| `409` | 5 concurrent applications already open |
| `409` | `acknowledged` incomplete **and the applicant is in the starter league** |

> ### The warning goes HERE, not on the acceptance
>
> A player who applies and is admitted a day later would otherwise be graduated **by
> someone else's click, at a moment they were not present for.** The application is
> where they are actually making the decision.
>
> **Both losses must be named**, because they are two different things: **beginner
> status** ends (real opponents), and **the beginner bonus** ends (income drops from
> 1.5× to base). A player told only *"you'll leave the starter league"* has not been
> told their income drops.
>
> **Enforced by a type, not a string.** Feature 009's `starterExitWarning(accountId)`
> returns a required payload and neither confirm can be **constructed** without it.
> Three screen regenerations have proved a constant string can be dropped silently.
>
> **Do not oversell it either.** The 1.5× mostly replaces dormant hold income — only
> about 11% is actual help.

## `POST /v1/applications/:applicationId/accept`

Officer and above.

```sql
BEGIN;
  INSERT INTO guild_members (account_id, guild_id, role, joined_at)
  VALUES ($applicant, $guild, 'member', now());
  -- UNIQUE(account_id). A 23505 here means this acceptance LOST the race.

  UPDATE guild_applications SET state = 'withdrawn', withdrawn_at = now()
   WHERE account_id = $applicant AND state = 'open' AND id <> $acceptedId;

  UPDATE guild_applications SET state = 'accepted' WHERE id = $acceptedId;

  UPDATE accounts SET starter_exited_at = now(), starter_exit_reason = 'guild'
   WHERE id = $applicant AND starter_exited_at IS NULL;
COMMIT;
```

**The contended resource is the applicant's membership row — not the guild, and not
the application.**

| Lock on | Why not |
|---|---|
| the **guild** row | serialises two *different* guilds accepting two *different* applicants — contention for nothing |
| the **application** row | two guilds accept two *different* applications from the same player: different rows, no conflict, **two memberships** |
| **the membership row** ✓ | the invariant is *"an account belongs to at most one guild"*, and that invariant lives on the applicant. **Lock what the invariant is about.** |

**Withdrawal is in the same transaction.** Two operations leave a window where the
player is in a guild *and* has open applications — and a second acceptance in that
window is a second membership.

| Status | When |
|---|---|
| `200` | accepted |
| **`409`** | **`{ reason: 'already-joined', guildId }`** — the losing officer sees *"Reyna joined The Long Reach a moment ago"*, not a server error |
| `403` | not an officer |
| `410` | the application expired |

## `POST /v1/guilds/:guildId/invites` · `POST /v1/invites/:inviteId/accept`

Officer and above may invite. Acceptance is immediate and carries the same starter
warning — here the warning and the acceptance coincide, because the player is the one
clicking.

## `POST /v1/guilds/:guildId/succession`

Officer and above.

```
master inactive 14 days   →  succession becomes AVAILABLE
                +  7 days →  succession COMPLETES if unchallenged
```

| Status | When |
|---|---|
| `202` | initiated; completes at `completesAt` |
| `409` | the master has been active within 14 days |
| `402` | the initiating officer does not have 650 available |

**The 650 is checked again at completion**, not only at initiation. An officer who
could afford it on day 14 and cannot on day 21 does not inherit.

**The master returning at any point before completion cancels it.** Returning
*after* completion does not reverse it — succession is final, and that decision is
deliberate rather than incidental because a test asserts it.

## `PUT /v1/guilds/:guildId/motd` · `PUT /v1/guilds/:guildId/emblem`

`motd` sets a pin (feature 014).

**The emblem needs no review.** It is **composed from preconfigured assets** — 36
icons × 12 inks × 12 grounds, all vetted at authoring time — so a saved emblem is a
triple of indices into a curated palette and there is nothing a player can put into
it. It saves immediately; a low-contrast combination **warns and never blocks**.

> **This is the difference between the emblem and an avatar.** An avatar is an
> **upload**, so it is pre-moderated and privately stored until approved (feature
> 012). Composition from a fixed palette is what removes the review entirely — not a
> relaxed policy, an absent surface.

## `GET /v1/guilds/:guildId`

```jsonc
{
  "id": "gld_...", "name": "The Long Reach", "emblemUrl": "...",
  "foundedAt": "...", "memberCount": 18, "capacity": 24,
  "members": [ { "playerId": "acc_...", "username": "reyna", "role": "officer",
                 "joinedAt": "...", "league": "gold" } ],
  "motd": "..."
}
```

**Never contains** another player's guild applications, any member's shard balance,
or any squad composition.

---

## Roles

| | invite | accept | kick | succession | motd | emblem | disband |
|---|---|---|---|---|---|---|---|
| **master** | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| **officer** | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| **member** | | | | | | | |

Capacity **24**. (Three Wings of 8 is an *event* structure and is deferred; the
capacity is not.)

---

## Internal contracts

```ts
/** NO module in this feature calls Date.now() or new Date(). Banned by lint, not by
 *  convention — a convention is broken in a one-line fix at the worst moment. */
interface Clock { now(): Date }

async function acceptApplication(applicationId: string, actorId: string, clock: Clock):
  Promise<{ ok: true } | { ok: false; reason: 'already-joined'; guildId: string }>;

async function initiateSuccession(guildId: string, actorId: string, clock: Clock): Promise<Succession>;
async function completeSuccession(successionId: string, clock: Clock): Promise<void>;

/** From feature 009. Required field of both confirms — they cannot be built without
 *  it. Null when the account is not in the starter league. */
function starterExitWarning(accountId: string): StarterExitWarning | null;
```

```jsonc
// eslint, apps/api/src/guilds
"Date.now"                       → error
"new Date()" with no arguments   → error
```

**Shared with `sim/rules`' purity rule** (feature 002), which forbids the same calls
for a different reason. One lint configuration, two motivations — and every other
timer in the codebase (application expiry, invitation expiry, the starter week) is
the same shape and should inherit it.
