# Quickstart: Chat

**Feature**: `014-chat` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test chat
```

## The golden path

Post in each of the six scopes. Then the two things that must fail.

## There is no publish credential

```
1  GET /v1/chat/token
2  connect to the broker with it
3  attempt to PUBLISH directly to any channel
4  → FAILS
```

**Then the structural check, which is the one that lasts:**

```bash
rg -n "mintPublish|publishToken|capability.*publish" apps/api/src
```

**Nothing.** The token type minted for clients cannot *express* publication, and
`RealtimeBroker` has no method that produces one at any privilege level. This is
enforcement by construction rather than by a permission check that could be
misconfigured — and it is a **correctness** requirement, because some postings cost
shards and a client that could publish directly would bypass the charge.

## A Hidden defense can never be embedded

Try every route:

```
embed your OWN Hidden defense                → 422
embed an opponent's Hidden defense           → 422
embed a Hidden BATTLE replay                 → 422
embed by raw id, hand-crafted request        → 422
embed in GUILD chat (not an exception)       → 422
embed in a DM to yourself                    → 422
```

**Embeds resolve server-side at send time**, so there is no client-constructible
path. Then confirm the absence is an absence:

```
✓ the message posts without the embed, or is rejected outright
✗ no "[hidden]" placeholder, no redaction marker, no empty embed card
```

**A Hidden battle is *absent*, never redacted.** A redaction marker is a
disclosure — it tells the reader a Hidden battle exists at that point.

## The ordering — blocklist gates, classifier does not

This has been drawn backwards twice, so it is a test.

```
a message with a blocklisted slur   → 422, NOT persisted, NOT published
a message the classifier would flag → 200, persisted, published, THEN flagged
```

**Then the assertion that actually proves it:**

```
stop the classifier entirely
post a message
→ 200. Send is completely unaffected.
```

If sending degrades when the classifier is down, the classifier is on the send path
regardless of what any diagram says.

**And the ordering within the send path:**

```
a blocklisted message from a player with 5 shards
→ 422, and the balance is UNCHANGED
```

Blocklist **before** charge. A player must not pay for a message that is rejected —
refunding is a second mechanism and a second thing to get wrong.

## Token scoping and re-mint

Each of these must invalidate the token and push `token-stale`:

```
join a guild        → old token revoked; new one includes guild:...
leave a guild       → revoked; guild channel gone
change language     → revoked; global:en → global:fr
get chat-banned     → revoked IMMEDIATELY
```

**The hard case, and it is the one the plan names:**

```
1  a starter-league player applies to a guild
2  a day later an OFFICER accepts
3  the player is graduated at that moment
4  → their token is revoked WITHIN A ROUND TRIP, not within 60 minutes
5  → they can no longer read `beginner`
```

**Assert on the revocation, not on the TTL.** A 60-minute TTL alone leaves a player
reading a channel they have left for up to an hour — and, worse, reading one they
were just banned from. Reads never touch our API, so a check-on-publish does not
help.

Then confirm revocation is not a separate step someone can forget:

```bash
rg -n "revokeChatToken" apps/api/src
```

Every call site must be **inside the transaction** that changes the input — guild
membership, starter status, language, ban scope. A revocation issued after the commit
is a revocation that can be skipped by an early return.

## Prices

```
looking for a guild        → 5
your own squad             → 10
a Visible replay           → 10
an opponent's Visible wall → 25
plain text in Guild Ads    → 5   (nothing in that channel is free)
plain text elsewhere       → 0
```

Then the boundary the two economies must not cross:

```
a player with 10,000 shards posts a guild promotion  → REFUSED. Guild funds only.
a guild with full funds buys a member a squad posting → NOT EXPRESSIBLE
```

The 4-ads-a-day ceiling holds regardless of how wealthy either side is.

## Cost — instrument delivered messages from day one

```
metric: delivered messages per day, BY SCOPE
```

**Not published messages — delivered.** The broker bills `published × subscribers`,
and the two diverge by three orders of magnitude on Global.

Verified budget: ~$9/month in connection-minutes at 10k DAU, and **~$270/month in
Global fan-out at the same size**. `docs/tech-stack.md` names presence as the lever
if cost came in high; **presence is the cheap half**.

**Watch the ratio, not the total.** Global delivered messages scale **quadratically**
in players — more players post more, and each post reaches more subscribers. The
metric that predicts the bill is `global delivered / DAU`, and if it is rising, the
room needs a cap. That is a design decision (raised in [research.md](research.md)),
cheap now and expensive once players have a mental model of one global room.
