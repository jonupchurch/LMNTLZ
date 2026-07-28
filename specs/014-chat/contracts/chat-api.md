# API Contract: Chat

**Feature**: `014-chat` | Versioned JSON REST under `/v1`, plus a subscribe-only
broker channel set.

> **The broker does exactly one job: fan-out. Clients subscribe; they never
> publish.** Every message reaches it only after passing through our own API — to
> authorize scope, run the blocklist, charge shards, persist and queue moderation.
>
> **This is a correctness requirement, not hardening.** Some postings cost shards, so
> a client able to publish directly would bypass the charge.

---

## `POST /v1/chat/:scope/messages`

```jsonc
// request
{ "body": "wall report on vantric-main", "embed": { "type": "defense", "id": "acc_..." } }
```

### The order of operations — and it has been drawn backwards twice

```
1  authorize scope        may reject   403
2  BLOCKLIST              may reject   422   ← SYNCHRONOUS GATE
3  charge shards          may reject   402
4  persist
5  publish to the broker
6  enqueue for classification                ← ASYNCHRONOUS. NEVER REJECTS.
→ 200
```

**Step 2 before step 3.** A player must not pay shards for a message that is then
rejected — refunding is a second mechanism and a second thing to get wrong.

**Step 6 after step 5, and it cannot affect it.** The classifier reads messages in
batches of 100 and only **flags**; a batch answers in minutes. Drawn as a gate — as
two generated architecture diagrams drew it — it would stall a quiet guild channel for
hours behind a batch waiting to fill.

| Status | When |
|---|---|
| `200` | sent |
| `402` | insufficient shards |
| `403` | not a member of that scope, or chat-banned |
| `422` | blocklist rejection, or an illegal embed |
| `429` | per-scope rate limit |

### Prices

| Posting | Cost | Scope |
|---|---|---|
| Looking for a guild | **5** | Guild Ads |
| Your own squad, or a Visible-battle replay | **10** | any |
| **An opponent's Visible defense** — a wall report | **25** | any |
| A guild promotion | 2 free/day, then **guild funds** | Guild Ads |
| Plain text | 0, except Guild Ads where **nothing is free** | — |

**The ordering is the design**: cheapest is *asking to be let in*, then *asking about
yourself*, then *asking about somebody else*. Price rises with how much of other
people's attention a posting spends.

**The two economies never meet.** Personal shards cannot buy a guild more reach;
guild funds cannot buy a member a squad posting.

### Embeds resolve server-side, at send time

```jsonc
// stored and published
{ "type": "defense", "id": "acc_...",
  "snapshot": { /* the Visible squad AS IT WAS when posted */ } }
```

**A reference, not an upload.** Two consequences:

- **No moderation surface at all.** Nothing in an embed is authored by a human, so
  there is no queue and no per-post review cost.
- **The Hidden prohibition is unbypassable.** No client can construct an embed of a
  Hidden defense — not by its owner, not in guild chat, not anywhere. **A Hidden
  battle is *absent*, never redacted.**

The snapshot is what makes an embed honest later, when the squad has changed.

## `GET /v1/chat/token`

```jsonc
{
  "token": "...",
  "channels": ["global:en", "guild:gld_...", "dm:acc_...", "admin", "ads:en", "ctl:acc_..."],
  "expiresAt": "2026-07-28T13:00:00Z"      // 60 minutes
}
```

**Subscribe-only. The token type cannot express publication** — enforcement by
construction rather than by a permission check that could be misconfigured.

### Re-minting: TTL is the backstop, revocation is the mechanism

Four inputs decide the channel set, and every one can change mid-session:

| Input | Changes on |
|---|---|
| guild membership | join · leave · kick · disband |
| **starter-league status** | **any of the four exits — including one fired by someone else's click** |
| language preference | the player changes it |
| ban scope | a moderator acts (feature 015) |

**Each of those calls `revokeChatToken(accountId)` in the same transaction that
changes it**, so revocation cannot be forgotten separately from the change requiring
it. The server then publishes `token-stale` on the player's control channel and the
client re-mints.

**`ctl:<accountId>` is the one channel every player always holds.** It carries
`token-stale` and nothing else — no content, so no moderation surface and no cost
worth counting.

> A 60-minute TTL alone would leave a player reading `beginner` for up to an hour
> after being admitted to a guild, and — worse — reading a channel they were just
> banned from. Reads never touch our API, so a check-on-publish does not help.

## `GET /v1/chat/:scope/history`

Within that scope's retention. `403` if not a member.

---

## The six scopes

| Scope | Reaches | Who writes | History |
|---|---|---|---|
| **Global** | everyone, **split by language** | all | short |
| **Guild** | the ≤24 members | all members | ~30 days |
| **Direct** | one other player | both | longest — **the evidence channel** |
| **Admin** | everyone | **the team only** | permanent |
| **Guild Ads** | everyone, split by language | rate-limited by cost | short |
| **Beginner** | starter-league players **+ Envoys** | all present | short |

**No league chat.** Promotion is one-way and permanent, so a league room would eject a
player from their own conversations *as a consequence of gearing up*.

---

## Internal contracts

```ts
/** Constitution XIX. Ably is one implementation. Note what is ABSENT: there is no
 *  method that mints a publish capability, at any privilege level. */
interface RealtimeBroker {
  publish(channel: string, payload: unknown): Promise<void>;   // SERVER ONLY
  mintSubscribeToken(channels: string[], ttlSeconds: number): Promise<string>;
  revokeTokensFor(accountId: string): Promise<void>;
}

/** SYNCHRONOUS. Gates. Runs before the charge. */
function blocklistCheck(body: string): { ok: true } | { ok: false; matched: string };

/** ASYNCHRONOUS. Enqueue only — this returns void and has no failure the caller
 *  reacts to. Feature 015 owns the classifier and it FLAGS, never acts. */
function enqueueForClassification(messageId: string): void;

/** Server-side. A client cannot construct one. */
function resolveEmbed(spec: EmbedSpec, authorId: string):
  Promise<ResolvedEmbed | { rejected: 'hidden-defense' | 'not-visible' | 'not-found' }>;

function revokeChatToken(accountId: string): Promise<void>;
```

---

## Cost — the term to watch is fan-out, not presence

Verified against current vendor pricing: free tier **200** peak connections; the first
paid tier is **$29/month** for 10,000 connections and 10,000 channels; usage runs
**$2.50/M messages** and **$1.00/M connection-minutes**.

**Messages are billed on *delivery*** — `published × subscribers on the channel`.

| DAU | Connections | **Global fan-out** | Total/month |
|---|---|---|---|
| 10,000 | $9 | ~108M msgs → **$270** | **~$290** |
| 50,000 | $45 | ~2.7B | ~$6,800 |
| **100,000** | $90 | **~10.8B** | **~$27,000** |

> **`docs/tech-stack.md` names presence as the lever if pricing came in high.
> Presence is the cheap half — $9/month at 10k DAU.** The dominant term is Global
> fan-out, and it is **quadratic in players**: more players post more, and each post
> reaches more subscribers.
>
> **The fix is a capped room size, which is a design decision and not a vendor one.**
> Global is already *split by language* — that is sharding on a key that does not
> bound room size. A numbered overflow room per language makes cost **linear**.
> **Raised, not taken**: it changes "everyone" to "everyone in your room", it costs
> nothing at launch, and it is expensive to retrofit once players have a mental model
> of one global room.

**Rate is not the constraint.** 108M/month is ~42 msg/s against a 2,500/s ceiling.
Volume cost binds long before rate does.
