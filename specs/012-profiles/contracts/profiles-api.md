# API Contract: Profiles & Export

**Feature**: `012-profiles` | Versioned JSON REST under `/v1`.

**The governing principle**: *an absence that can be measured is not an absence.*
Hidden battles are **selected out**, never **filtered out** — a filtered list has a
measurable gap, and the gap is the disclosure.

---

## `GET /v1/players/:targetId/profile`

```jsonc
{
  "playerId": "acc_...",
  "username": "reyna",
  "avatarUrl": "...",
  "accountAgeDays": 214,
  "league": "gold",
  "rating": 1412,
  "gearScore": 4180,
  "guild": { "id": "gld_...", "name": "The Long Reach", "role": "officer" },
  "holdStreaks": { "visible": 14, "hidden": 3 },
  "recentBattles": [
    { "battleId": "btl_...", "concludedOn": "2026-07-27",   // DAY, not timestamp
      "role": "attacker", "opponent": "vantric-main",
      "outcome": "win", "turnCount": 96 }
    /* … up to 20, ALL Visible … */
  ]
}
```

### `recentBattles` — the query, and the one that is wrong

```sql
-- RIGHT: select 20 Visible, however far back that reaches
SELECT … FROM battle_records
WHERE (attacker_id = $1 OR defender_id = $1) AND zone = 'visible'
ORDER BY concluded_at DESC
LIMIT 20;

-- WRONG: take 20, then drop Hidden. Leaves a MEASURABLE gap.
SELECT * FROM (
  SELECT … WHERE attacker_id = $1 OR defender_id = $1
  ORDER BY concluded_at DESC LIMIT 20
) t WHERE zone = 'visible';
```

The two differ only in where `LIMIT` sits, and both read correctly. Under the wrong
one, a viewer who **counts entries** learns how many of the last 20 battles were
Hidden — and repeated over days that yields the player's ambush rate, their Hidden
hold rate, and roughly when they were ambushed.

**`concludedOn` is a DAY, not a timestamp.** Exact times leak the same information
one step removed: the *intervals* between entries reveal how many battles happened
in the gaps.

**Never padded and never a placeholder.** A player with 8 Visible battles ever gets
8 entries. A player whose last 20 battles were all Hidden gets 20 Visible entries
from further back.

### What a profile never contains

```
✗ email, provider identity, entitlements       ✗ shard balance
✗ either zone's composition                     ✗ any Hidden battle
✗ any gap where a Hidden battle would be        ✗ another player's guild application
```

**The Visible squad is scoutable via feature 006's `/scout`, not here.** Two routes,
two disclosure rules, **no shared serialiser** — a shared serialiser between
`profile` and `scout` is precisely how the Hidden squad leaks.

## `GET /v1/me/export`

`Content-Type: text/csv`

```csv
battleId,concludedAt,role,opponentUsername,opponentWasBot,zone,outcome,turnCount,leagueAtTime,ratingAtBattle
```

**Ten columns, named explicitly. Never `SELECT *`, never an object spread.**

> ### ⚠️ Corrected during implementation, 2026-07-30: `ratingAfter` → `ratingAtBattle`
>
> **Nothing stores a post-battle rating.** `player_ratings` holds one current
> value per account with no history, and `battle_records.attacker_rating` is
> written by `battle/create.ts` — at battle **creation** — so it is unambiguously
> the rating the player went in with. The per-battle delta is not recorded either,
> so the post-battle value cannot be reconstructed.
>
> Emitting the pre-battle number under the name `ratingAfter` would be a lie in the
> one file whose entire purpose is telling a player the truth about their own data.
> The column is named what it is.
>
> **Recording a post-battle rating would be a schema change under Constitution
> XVI** — it could not be backfilled for battles already recorded. It is cheap
> today and not obviously worth it; raised here rather than taken.

> **`attackerSquad` and `defenderSquad` are absent — BOTH of them, in BOTH
> directions.** The battle record carries them because it is the analytics product;
> **storing is not exposing** (Constitution XVII).
>
> **A conditional — "include your own squad, drop your opponent's" — is wrong twice.**
> A player can publish their own export, so including their own squad is a
> self-service leak of their Hidden composition. And a conditional is one inverted
> boolean from full disclosure, producing a plausible file nobody notices for months.

**Default-deny by construction.** New columns will be added to `battle_records`;
adding one to the export is an edit to this list, not a side effect of a migration.
**A test asserts the header row exactly**, so a widened export fails CI.

## `GET /v1/guilds/:guildId/export`

Officers and above. **Event data only** — never member battle detail.

```csv
guildId,memberUsername,role,joinedAt,eventId,eventMetric,eventValue
```

**A separate route, not a `scope` parameter on the one above.** A scope parameter
invites the bug where an officer requests the wider scope; **two routes running two
queries cannot express that mistake.**

## `POST /v1/me/avatar`

```jsonc
{ "confirmed": true }   // → { uploadUrl, submissionId }; 500 shards or $5 charged NOW
```

```jsonc
// GET /v1/me/avatar/submissions
{ "submissions": [ { "id": "...", "state": "pending" | "approved" | "rejected",
                     "rejectedReason": "impersonation", "submittedAt": "..." } ] }
```

| Rule | Value |
|---|---|
| when charged | **on submission, not on approval** |
| a rejection | refunds **nothing**, and says so before payment |
| a resubmission | **a new submission and a new fee** |
| storage | the **private** Blob store, avatar prefix |
| review | ~20 seconds, in `apps/admin` (feature 016) |

**The fee is the throughput control.** A free upload at 10,000 DAU is an unbounded
moderation queue; at $5 it is self-limiting — 180 reviews fill an hour and represent
$900 of submissions. Charging on approval instead would make rejection free and
remove the throttle entirely.

**Private storage matters here for the same reason it does for replays**: an
**unapproved** avatar must not be reachable by URL while it sits in the queue, and a
public store cannot express that.

**Harm is a gate; taste is a note** (Constitution XVIII). The review rejects hate
imagery, sexual content and impersonation. It does **not** reject on quality. **A $5
ugly avatar is approved.**

---

## Internal contracts

```ts
/** Twenty Visible battles, however far back that reaches. There is no `zone`
 *  parameter and no post-filter — the signature cannot express the wrong query. */
function recentVisibleBattles(playerId: string, limit: 20): Promise<ProfileBattle[]>;

/** Builds its row from an explicit column list. Takes no record object, so it
 *  cannot accidentally spread one. */
function exportRow(record: BattleRecord): readonly [string, ...string[]];

/** The exact header. Asserted in CI. */
const EXPORT_HEADER = [
  'battleId', 'concludedAt', 'role', 'opponentUsername', 'opponentWasBot',
  'zone', 'outcome', 'turnCount', 'leagueAtTime', 'ratingAfter',
] as const;

function submitAvatar(accountId: string): Promise<{ uploadUrl: string; submissionId: string }>;
function reviewAvatar(submissionId: string, verdict: 'approve' | 'reject',
                      reason: HarmReason, actorId: string): Promise<void>;
//                            ^ HARM reasons only. There is no 'low-quality' member.
```
