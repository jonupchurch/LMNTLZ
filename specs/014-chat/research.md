# Phase 0 Research: Chat

**Feature**: `014-chat` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q1 has been checked against current vendor pricing and turned up
something the stack did not anticipate** — the dominant cost term is not the one the
recorded analysis expected. Q2 and Q3 are decisions.

---

## Q1 — Transport pricing above 200 peak concurrent connections *(verified)*

Checked against Ably's published pricing.

| Tier | Peak connections | Channels | Messages | Rate | Price |
|---|---|---|---|---|---|
| **Free** | **200** | 200 | 6M/mo | 500/s | $0 |
| **Standard** | 10,000 | 10,000 | included allowance | 2,500/s | **$29/mo** + usage |

Usage above the tier: **messages $2.50/M** (to $0.50/M at volume) · **connections
$1.00 per million connection-minutes** (to $0.20/M at volume).

### The connection cost is small. The message cost is not.

`docs/tech-stack.md` records **presence as the designated lever** if pricing came in
high, on the reasoning that presence makes the bill scale with total players rather
than with chat use. **The arithmetic says presence is the cheap half.**

At **10,000 DAU**, 30-minute average sessions:

```
connection-minutes  =  10,000 × 30 × 30 days   =   9.0M / month
                    →  9.0 × $1.00             =   $9 / month
peak concurrent     ≈  600            (over the free 200, far under Standard's 10k)
```

**$9 a month.** Presence is not the problem.

Messages are billed on **delivery**, and delivery is `published × subscribers on the
channel`. Using feature 015's figure of ~60,000 messages/day at 10k players:

| Scope | Fan-out | Share of traffic | Delivered/month |
|---|---|---|---|
| Guild (≤24, ~8 online) | ×8 | ~60% | ~8.6M |
| Direct | ×1 | ~25% | ~0.5M |
| Beginner / Guild Ads | ×~50 | ~5% | ~4.5M |
| **Global** | **× peak concurrent in the channel** | **~10%** | **~108M** |

```
Global:  6,000 msg/day × 600 concurrent × 30 = 108M delivered/month
         → $270/month at list, ~$54 at volume pricing
Total   ≈ $290/month at 10k DAU
```

### The finding: Global chat does not scale, and the reason is quadratic

**Delivered messages in a single global channel scale as `players × players`** —
more players post more, and each post reaches more subscribers.

| DAU | Peak concurrent | Global delivered/month | At list |
|---|---|---|---|
| 10,000 | ~600 | 108M | $270 |
| 50,000 | ~3,000 | 2.7B | $6,750 |
| **100,000** | **~6,000** | **10.8B** | **$27,000** |

**At 100k DAU a single Global channel costs more than the entire rest of the stack
combined**, and it is not a vendor problem — any broker bills fan-out, and a
self-hosted one pays for it in egress and CPU instead.

**The mitigation is a design decision, not a vendor one: shard Global into rooms with
a capped population.** Cap a room at ~500 concurrent and cost becomes **linear in
players** rather than quadratic — 100k DAU is 12 rooms of 500, each costing what one
600-person channel costs today.

**The design is already halfway there.** Global is *"everyone, **split by
language**"*, and Guild Ads was split out of Global precisely because *"recruitment
is the traffic that makes Global unreadable."* **Language split is already sharding;
it is just sharding on a key that does not bound room size.** Adding a numbered
overflow room per language — `Global · English 2` — is a small change to a mechanism
that exists.

> **This is a proposal, not a decision taken.** It changes a player-facing thing —
> "everyone" becomes "everyone in your room" — and that is a design call.
> **Raising it here with the arithmetic.** It costs nothing at launch and is
> expensive to retrofit once players have a mental model of one global room.

**Rate is not the binding constraint.** 108M/month is ~42 messages/second average
against Standard's 2,500/s ceiling. **Volume cost binds long before rate does.**

**Revised budget line**: ~$30/month at launch, ~$290/month at 10k DAU, and
**unbounded above that without sharding**. `docs/tech-stack.md` should carry the
message-fan-out term rather than the presence term as the thing to watch.

---

## Q2 — Token scoping

**Decision: a short-lived, subscribe-only token naming exactly the channels a player
may read, re-minted whenever any input to that set changes.**

```ts
mintChatToken(accountId) → {
  token,                    // subscribe capability ONLY
  channels: string[],       // exactly what they may read
  expiresAt,                // 60 minutes
}
```

**The inputs to the channel set, and every one of them can change mid-session:**

| Input | Changes when |
|---|---|
| guild membership | joining, leaving, being kicked, the guild disbanding |
| **starter-league status** | **any of the four exits — including one fired by someone else's click** |
| language preference | the player changes it |
| ban scope | a moderator acts (feature 015) |

**The starter case is the one the plan names and it is the awkward one.** A player
who is admitted to a guild by an officer's acceptance leaves the starter league at
that moment — and their token still names `beginner`. Three ways to handle it:

| Approach | Verdict |
|---|---|
| Short TTL alone | Up to 60 minutes in a channel they have left. Unacceptable for the ban case. |
| **Server-side revocation + client re-mint** ✓ | Revoke the token, publish a `token-stale` event on a per-account control channel, client re-mints. Bounded by round-trip, not by TTL. |
| Long-lived token, check on every publish | Publishing already goes through our API, so this is free for writes — but **reads are the problem**, and reads never touch our API. |

**So: 60-minute TTL as the backstop, and explicit revocation as the mechanism.**
Every one of the four inputs above calls `revokeChatToken(accountId)` in the same
transaction that changes it, so revocation cannot be forgotten separately from the
change that requires it.

**The per-account control channel is the one channel every player always
subscribes to.** It carries `token-stale` and nothing else — no content, so no
moderation surface, and no cost worth counting.

**There is no publish credential, and that is the load-bearing property.** The token
type minted for clients **cannot express publication**. Enforcement by construction
rather than by a permission check that could be misconfigured — and it is a
*correctness* requirement rather than hardening, because **some postings cost
shards** and a client able to publish directly would bypass the charge.

---

## Q3 — Confirm the ordering, one more time

**Blocklist gates. Classifier does not. Two generated architecture diagrams drew this
backwards, so it gets a test rather than a comment.**

```
POST /v1/chat/:scope/messages
  1  authorize scope          ← may reject
  2  BLOCKLIST                ← SYNCHRONOUS. MAY REJECT. 422.
  3  charge shards            ← may reject (402)
  4  persist
  5  publish to the broker
  6  enqueue for classification   ← ASYNCHRONOUS. NEVER REJECTS.
  → 200
```

**Step 6 happens after step 5 and cannot affect it.** The classifier reads messages
in batches of 100 and only **flags**; a batch answers in minutes. Drawn as a gate — as
both diagrams drew it, because the prompt told them to — it would stall a quiet guild
channel for hours behind a batch waiting to fill.

**The test, and why it is a test:**

```
ordering.test.ts
  a message containing a blocklisted slur   → 422, NOT persisted, NOT published
  a message the classifier would flag       → 200, persisted, published, THEN flagged
  the classifier is unavailable entirely    → 200. Send is unaffected.
```

**The third line is the real assertion.** If sending degrades when the classifier is
down, the classifier is on the send path regardless of what the diagram says.

**Step ordering within the send path also matters**: **blocklist before charge.** A
player must not pay shards for a message that is then rejected. Refunding is a second
mechanism and a second thing to get wrong.

---

## Settled here: the six scopes and the prices

| Scope | Reaches | Who writes | History |
|---|---|---|---|
| **Global** | everyone, **split by language** | all | short |
| **Guild** | the ≤24 members | all members | ~30 days |
| **Direct** | one other player | both | longest — **the evidence channel** |
| **Admin** | everyone | **the team only** | permanent |
| **Guild Ads** | everyone, split by language | rate-limited by cost | short |
| **Beginner** | starter-league players **+ Envoys** | all present | short |

**No league chat.** Promotion is one-way and permanent, so a league room would eject
a player from their own conversations *as a consequence of gearing up* — turning the
currency the game is built on into a social cost.

| Posting | Cost |
|---|---|
| Looking for a guild | **5** — the cheapest, deliberately |
| Your own squad, or a Visible-battle replay | **10** |
| **An opponent's Visible defense** — a wall report | **25** |
| A guild promotion | 2 free/day, then **guild funds** |

**The ordering is the design**: cheapest is *asking to be let in*, then *asking about
yourself*, then *asking about somebody else*. Price rises with how much of other
people's attention a posting spends.

**An embed is a reference, not an upload** — `{type, id, snapshot}`, resolved
**server-side at send time**. Two consequences:

- **Embeds carry no moderation surface at all.** Nothing in them is authored by a
  human, so there is no queue and no per-post review cost. Compare avatars, which
  needed a whole pipeline at ~$0.14 a review.
- **The Hidden prohibition is unbypassable.** Server-side resolution means no client
  can construct an embed of a Hidden defense — not by its owner, not in guild chat,
  not anywhere. **A Hidden battle is *absent*, never redacted.**

**The two economies never meet.** Personal shards cannot buy a guild more reach;
guild funds cannot buy a member a squad posting. The 4-ads-a-day ceiling holds
regardless of how wealthy either side is.

## What is NOT settled here

- **Whether to shard Global.** Raised in Q1 with the arithmetic. A player-facing
  design decision, cheap now and expensive to retrofit.
- **The exact per-scope rate limits.** The fee makes posting *deliberate*; rate
  limits still do the limiting, and their values want real traffic.
- **Language detection versus selection.** Global is split by language; whether that
  is declared or inferred is a UX call with no contract consequence.
