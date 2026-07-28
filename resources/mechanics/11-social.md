# LMNTLZ · Mechanics 11 — Identity, reports and chat

Everything player-to-player that happens **outside a battle**: who you are, what
you learn about battles you did not play, and how you talk to anyone.

---

## Identity — **settled 2026-07-27**

> **The username is the identity. Steam and Google are both just ways to reach
> it.**

`../../docs/tech-stack.md` already establishes that **one account may carry both
identities** — the same player arrives via Steam on the desktop build and via
Google in a browser — and that account linking is a first-class requirement
rather than a later feature. This settles what the two link *to*: a single
username-bearing account, not two.

**Nothing else in the game reads a provider.** Leagues, rating, guilds, hold
streaks and the rune ledger all hang off the account, so where a session came
from is an auth detail and never a gameplay one.

### One caution, and it is a schema decision rather than a design one

> **"Username is the primary key" should mean *the user-facing identity*, not the
> database primary key.**

A mutable string as a real PK means every foreign key in the schema — battles,
replays, runes, guild membership, chat messages — carries a value that changes
when someone renames. The standard shape gives the same guarantee without that:

| | Column | Property |
|---|---|---|
| **Internal** | immutable `id` | what every foreign key references |
| **User-facing** | `username`, unique index | what players see, type and search |

**This costs nothing now and is very expensive to retrofit**, because it is the
one decision that touches every table at once. It also leaves renaming as an open
product question rather than foreclosing it — see *Open* below.

---

## The defender's feedback loop — **settled 2026-07-27**

**A defender never plays their own defense.** The engine does, continuously,
against every attacker, whether or not the player is online. So a report is not a
convenience — it is the *only* channel through which defensive play exists at all.

> **A defender receives the record of every battle fought against them, the
> rating and shards it produced, and notice when a hold streak advances or
> breaks.**

| What arrives | Why it is the right thing to send |
|---|---|
| **The battle record** | full replay per `../../docs/tech-stack.md` — stored event logs, never re-simulated, so an old defense is replayed exactly as it was fought |
| **Points for a hold** | rating and shards both, per `06-progression.md` — including the **2×** on a Hidden hold |
| **Hold-streak notices** | the streak is already public per zone (`02-squads.md`); the defender should not learn about their own from a leaderboard |

**This is where a defensive configuration becomes learnable.** `07-defense-ai.md`
gives a defender two ordered lists per hero and no way to watch them run. The
replay is the feedback that makes tuning them a skill rather than a guess.

**A Hidden battle's replay is the one place a Hidden squad is visible** —
`02-squads.md` question 1 keeps it out of scouting, listings and profiles, but
the defender obviously sees their own, and the attacker keeps the replay of the
fight they were in.

---

## Chat — **settled 2026-07-27**

### Four scopes

| Scope | Reaches | Who may write | History |
|---|---|---|---|
| **Global** | everyone, **split by language** | all | short — it is ephemeral by nature |
| **Guild** | the ≤24 members | all members | ~30 days — coordination needs it |
| **Direct** | one other player | both | longest — it is the evidence channel |
| **Admin** | everyone | **the team only** | permanent |

**There is no league chat**, and it was considered. `09-matchmaking.md` makes
**promotion one-way and permanent**, so a league room would eject a player from
their own conversations as a *consequence of geaing up* — turning the currency
the game is built on into a social cost. Rejected on that alone.

### Global is split by language, not by strength

One room for everybody stops being readable long before it stops being popular:

| Concurrent in one room | Messages/min at one per player per 10 min | Readable |
|---|---|---|
| 200 | 20 | yes |
| 500 | 50 | marginal |
| **2,000** — 10k DAU with a fifth in chat | **200** | **no, 3.3 a second** |

**Language is the right first axis and is needed regardless**, because Steam ships
worldwide and a room where most messages are unreadable to a given player is worse
than a smaller one. Past roughly **500 concurrent**, a language shards into
numbered rooms.

> **This is a capacity mechanism, not a social one** — which is exactly why it
> avoids the problem that killed league chat. Nobody is ever moved out of a room
> for something they achieved.

### Admin is a broadcast, not a conversation

**Read-only for players.** It carries patch notes, events, and — the load-bearing
case — **maintenance and downtime**, which is the one message that must reach a
player who is about to lose a session. `../../docs/tech-stack.md` already holds
the maintenance flag in Edge Config; this is how it gets narrated.

**A player may mute it but never leave it.** An unreachable player is an
unwarnable one.

> **It overlaps `../designsystem/LMNTLZ News.dc.html`, and the clean split is
> delivery versus archive** — the Admin channel is how an announcement *arrives*,
> the News screen is where it is *read back*. Same content, two surfaces, one
> source. **Proposed rather than decided**, per the rule that a generated screen
> is never authoritative.

### Presence leaks nothing, and that is worth stating

The generated Chat screen shows `1 482 wardens online` and per-member status like
`In battle · round 4`. **Neither reveals anything exploitable**, because PvP is
asynchronous: a defense is a snapshot the engine plays whether its owner is online
or not, so knowing somebody is mid-battle tells an attacker nothing they could
act on. Presence here is social information only.

### Transport — a managed realtime service

**Chat is the only hard realtime requirement in the game.** Battles are turn-based
and a turn is a request; leaderboards tolerate a thirty-second refresh. So this is
solved *beside* the stack rather than by rebuilding it.

| Option | Presence + typing | Ops burden |
|---|---|---|
| Polling | **lost** | none |
| SSE on Vercel | possible | held connections bill for duration |
| **Managed service** | **yes** | **none** |
| Self-hosted WebSocket | yes | an always-on service to operate |

`../../docs/tech-stack.md` names this the largest unpriced item in the stack and
notes that **Vercel's functions cannot hold a WebSocket**. A managed service is
the only option that keeps presence at no operational cost, and chat is not where
a small team should spend its infrastructure attention.

**Put it behind an interface.** The choice is reversible only if nothing above the
transport knows which vendor it is.

#### Messages route through our own API, always

```
client → Hono API  →  auth · rate limit · filter · persist  →  realtime service → fanout
```

**Never client → service directly.** That hop is where moderation and persistence
happen, and without it neither is possible. The ~50 ms it costs is irrelevant to
chat.

### Chat is not a separate service — **decided 2026-07-27**

> **One application. Chat lives in the same Hono app as everything else, and the
> managed transport is the only separate moving part.**

**Choosing a managed transport is what makes this safe.** With connections,
presence and fanout owned by the vendor, our half of chat is ordinary REST:

| Concern | Where |
|---|---|
| Send · read history | **existing app** — about five endpoints |
| Auth | **existing JWT middleware** |
| Rate limit · filter · persist | **existing app** |
| Connections · presence · typing · fanout | **the vendor** |

A service is not warranted for five endpoints that share auth, user lookup and a
database with everything around them. **The isolation a second app would buy is
already bought** — by the vendor, at no operational cost.

**Nor is chat the load worth isolating against.** `../../docs/tech-stack.md` puts
a battle at 20–40 function calls:

| Per player per day | Invocations |
|---|---|
| 20 battles | **400 – 800** |
| A chatty session, ~20 messages | **20** |

Chat is **3–5%** of the game's invocation load. Splitting it out to protect the
game would be protecting against the smaller thing.

#### Split later, on a trigger

Written down so this stays revisitable rather than permanent. Separate chat when:

- message volume moves game-API latency or cost;
- **moderation needs a different deploy cadence than game patches** — the likeliest
  trigger, since a moderation hotfix should not wait on a balance release;
- message storage outgrows the game database.

**Two things now make a later split mechanical rather than a rewrite, and both
cost nothing today:** keep messages in **their own tables** under the retention
above, and keep the vendor **behind an interface** so nothing upstream knows which
one it is.

### Moderation ships with chat, not after it

| Stage | Mechanism |
|---|---|
| **Before send** | rate limit · length cap · a **slur blocklist**, not a general profanity filter |
| **After send** | report → queue → action |
| **Actions** | escalating mute · chat ban · account ban |

**A blocklist, not a profanity filter.** Over-filtering reads as contempt for the
player and is trivially defeated; the narrow list is the one that survives.

> **Reported content is retained independently of its channel's history**, or a
> report can outlive its own evidence. This is the reason Direct keeps the longest
> history despite being the least public.

**Usernames are a moderation surface too**, because `Identity` above makes the
username the identity and renaming is still open. An offensive username that its
owner cannot change is a problem the moderation queue inherits.

---

## Onboarding — planned now, shipped after 1.0

**Decided 2026-07-27: design it in this pass, implement it as a fast-follower.**

The feature-unlock ramp in `06-progression.md` — gating the Hidden zone, the
second and third attack squads, and guild membership on account progress — is
**progression that gates complexity rather than power**, so it cannot violate the
promise that every player's roster is identical and unlocked.

**Planning it now is what makes deferring it safe.** A ramp bolted on later has to
retrofit gates into systems that assumed everything was available, which is
exactly the kind of change the no-nerf rule makes expensive.

---

## Open

- **Which managed realtime vendor**, and what it costs at the player counts
  `06-progression.md` sizes the business around. The *shape* — a managed service
  behind an interface, sends routed through our own API — is decided; the vendor
  is a procurement question, and the interface is what keeps it one.
- **Retention numbers.** Short / ~30 days / longest is the shape; the actual
  figures want a legal read as much as a technical one, since Direct is the
  evidence channel.
- **Whether renaming is allowed**, and at what cost. The schema note above keeps
  the option open; the product decision is separate. Note that a permanent
  username is itself a moderation surface, since an offensive one cannot be
  corrected by its owner.
- **Profiles** — what is public beyond the Visible squad, hold streaks and league,
  all of which are already public by other rules.
- ~~**Store platform reality.**~~ **Decided 2026-07-27** — `06-progression.md`,
  *Steam is the primary storefront*. Steam plus a secondary direct channel from
  the browser build; auth is already owned, so one entitlement service serves
  both. What remains is to **verify against the current Steam Distribution
  Agreement** before a purchase flow is built.
- **Live-ops.** Maintenance flag, patch cadence, and what happens to a battle in
  flight at deploy. Parked until closer to launch by decision, **not** dropped.
