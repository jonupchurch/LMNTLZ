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
one decision that touches every table at once. **Moderation makes it required
rather than merely wise** — see *Forced rename* below.

### Renaming — **settled 2026-07-27**

| Kind | Cost | Trigger |
|---|---|---|
| **Forced** | **always free** | a moderator acts on a reported username |
| **Voluntary** | **sold, per change** | the player wants a different name |

**Reports of inappropriate usernames go to the moderation queue** — the team, for
now — and the outcome is a forced rename. Same queue, same actions as chat.

> **A forced rename is never charged for.** Selling name changes *and* charging a
> violator to correct their own violation is monetizing enforcement, and it is the
> kind of thing that ends up in a screenshot. The paid SKU is for voluntary
> changes only.

**The forced path clears the name to a placeholder and lets the player choose the
replacement** on next login, free. An assigned name reads as punishment and
generates the support load the action was meant to close.

**Age floor: 13+, with the store rating carrying mature content honestly.**
Decided 2026-07-27. An 18+ claim that is not enforced is worse exposure than a
lower floor that is — and the moderation bar in *Moderation* below is already a
13+ bar, so the stated floor should match what is actually enforced.

**Two consequences of a name being an identity.** A released name should return to
the pool only after a cooldown, or renaming becomes a squatting tool; and account
deletion releases a name on the same terms.

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

## Moderation — **settled 2026-07-27**

Ships **with** chat, not after it.

### What is watched

> **Racist and hate content, and overtly NSFW content. Not general profanity, and
> not rudeness.**

**The bar is a non-toxic chat for a broad audience**, and it is deliberately
narrow, because a narrow bar is the only one a small team can actually enforce.

| Stage | Mechanism |
|---|---|
| **Before send** | rate limit · length cap · a **slur blocklist**, not a general profanity filter |
| **After send** | report → queue → **human decision** |
| **Actions** | **mute** (automatic, temporary) · **ban** (scoped and timed) · **forced rename** |

**A blocklist, not a profanity filter.** Over-filtering reads as contempt for the
player and is trivially defeated; the narrow list is the one that survives.

### Mute and ban are different things

| | Who issues it | Duration | Means |
|---|---|---|---|
| **Mute** | **automatic** — N reports from distinct accounts | short, pending review | *"we are looking at this"* |
| **Ban** | **a human, always** | hours to permanent | *"we looked, and decided"* |

**A mute is not a verdict**, which is why automation is allowed to issue one and
never a ban.

### Bans have two axes: scope and duration — **settled 2026-07-27**

> **A chat ban names which rooms it covers and how long it lasts. It never
> touches gameplay.**

| Scope | Loses | Keeps |
|---|---|---|
| **Global** | Global rooms | **Guild and Direct** |
| **All chat** | Global, Guild, Direct | — |
| *Account* | everything | *not a chat action — see below* |

**Global-only is the important one and will be the common case.** Global is where
strangers meet: highest volume, lowest stakes, and where nearly all friction
happens. Someone abrasive in Global but fine with their own guild should not lose
their guild over it, and a single all-or-nothing ban would force exactly that
choice on a moderator.

**Durations escalate on repeat:** 1 hour · 24 hours · 7 days · 30 days ·
permanent. That requires per-account ban history, so the *next* offense starts
where the last one left off rather than at the bottom.

#### Gameplay is never touched

A chat ban costs no shards, no rating, no hold streak, no defense, and no guild
membership. **The player keeps playing the game; they lose a room.** Coupling the
two would make every moderation decision a competitive one, which is a bar no
moderation queue should have to clear.

> **The chat queue cannot issue an account ban.** That is a separate decision with
> a separate bar — cheating, payment fraud, or conduct far past what a chat rule
> covers — and it belongs beside those, not at the top of this ladder.

#### The player is told

**No shadowbans.** A silently muted player keeps talking to nobody, which is both
unkind and generates the support load the action was meant to close. It also sits
badly in a design that shows hold streaks, ambush chance and league openly —
this would be the only thing kept back.

**It costs something real:** a told ban is an evadable ban. Accepted, because the
next rule reduces the payoff.

#### A ban attaches to the identity, not the username

> **Ban the Steam or Google identity, not just the account.**

`../../docs/tech-stack.md` owns auth in-house and takes **verified identities from
both providers**, so a banned player creating a fresh username through the same
Steam account is caught for free. That is unusually strong for a game this size,
and it exists only because auth was not outsourced.

**It is not airtight** — a second Steam account defeats it — but it raises evasion
from *thirty seconds* to *buying another copy*, which is where the ceiling should
be.

### Hate and NSFW never share a queue with toxicity

They look like one job and behave nothing alike:

| | Objective | Frequency | Can the victim fix it? |
|---|---|---|---|
| **Racist / hate** | **yes** | rare | **no** — it harms bystanders too |
| **Overtly NSFW** | **yes** | rare | no |
| Flaming, trash talk, tilt | **no** | **constant** | **yes — block them** |

In competitive games the overwhelming majority of reports are *"this person was
rude."* **One undifferentiated queue means the rare serious report drowns in the
common trivial one**, which is how a two-hour-a-day load becomes unanswerable.

> **The principle that sorts them: staff handle what blocking cannot fix.**
> A racist message harms everyone who reads it, so a mute button is no remedy —
> staff, always, fast. A rude message harms one person who has a mute button, so
> give them the button.

That is not a lower standard for toxicity. It routes it to the tool that works,
and it is what keeps the serious queue answerable inside a day.

### An AI flags; it never moderates — **decided 2026-07-27**

> **No automated action is ever taken on a message or an account. A model scores;
> a human decides.**

That is a policy choice first, and it happens to be what makes the economics
work: **a flag blocks nothing, so latency stops mattering**, which allows batching
and the discounted batch API.

#### It ranks the queue; it does not create it

**This is the distinction that decides whether the feature helps or hurts.** At
60,000 messages a day, a classifier at even 99% specificity produces **600 false
flags** — ten times the 60 player reports it was meant to triage. Automating that
way makes *more* work.

| Job | Volume | Effect |
|---|---|---|
| **Score each player report** | ~60/day | the 2–3 genuine hate/NSFW reports sort to the top; the rest sink |
| **Proactively scan all messages** | escalate only at very high confidence | catches what nobody reported — the one thing a report-driven queue structurally cannot do |

The first fixes the drowning problem in *Hate and NSFW never share a queue*
above. The second is the only reason to read every message at all.

#### Cost — full coverage, 100 messages a call

> **Every message is read. Nothing is sampled.** Settled 2026-07-27.

**Claude Haiku 4.5** at $1 / $5 per million tokens, batching **100** messages a
call, through the discounted batch API:

| DAU | Messages/day | Monthly | Human hours/day it triages |
|---|---|---|---|
| 10,000 | 60,000 | **$68** | 2 |
| 50,000 | 300,000 | $338 | 5 |
| 100,000 | 600,000 | $675 | 10 |

**That is roughly 1% of net revenue, and the fraction is constant at any scale**,
because both sides scale with players. It is not a line worth optimizing.

**100 a call rather than 20 is a free 20%.** Output cost does not move — the same
number of classifications is produced either way — so batching harder only shrinks
prompt overhead. **One thing to measure before committing:** classification
quality can degrade when a model judges 100 items in one pass rather than 20. If
it does, the batch size is the knob, not the coverage.

> **Prompt caching buys a better prompt, not a cheaper one.** Haiku's minimum
> cacheable prefix is **4,096 tokens**, so a short policy prompt does not cache at
> all — but a ~5,000-token prompt full of worked examples, cached at 0.1× read
> cost, comes to the same price as a 500-token prompt sent uncached. **Spend the
> difference on boundary cases**, since *racist* versus *heated trash talk* is
> exactly the line that needs examples rather than definitions.

##### Sampling was considered — the reason to reject it is coverage, not cost

Reading one message in five would cost ~$14 a month at 10k DAU. **Rejected because
1% of revenue is not worth buying anything with**, and full coverage is strictly
better.

Worth recording what sampling *would* have been good at, because it is the right
fallback if the bill ever stops being noise: **sampling catches patterns and
misses one-offs**, which is the exact inverse of what player reports catch. A
persistent low-grade offender nobody bothers reporting turns up within a handful
of messages; a single egregious message gets reported by whoever saw it. The two
are complementary rather than redundant.

**Scoring the reports is free either way** — 60 a day is about $0.04. The whole
bill is the proactive scan.

### The load, and the three levers that keep it answerable

Moderation cost scales linearly with players and with nothing else. At 10,000 DAU,
a third of them in chat at ~20 messages each, a ~0.1% report rate and two minutes
a review:

| DAU | Reports/day | Human hours/day |
|---|---|---|
| 10,000 | 60 | **2** |
| 25,000 | 150 | 5 |
| **50,000** | **300** | **10** |

**A small team hits the wall around 15–20k DAU**, which is inside the player count
the business needs. Three levers, in order of effect:

1. **Prevention — gate who may open a Direct message.** A stranger reaching you
   privately is where harassment lives and the one place no bystander can flag it.
   Guild recruiting is the legitimate stranger case, so the shape is a **request**:
   a stranger may ask, and nothing lands until it is accepted.
2. **Delegation — guild leaders moderate their own room.** `08-guilds.md` already
   has 24 known members and a leadership structure; mute and kick inside a guild
   room take a whole scope off the central queue at no new concept.
3. **Automation — thresholds, not judgment.** *N reports from **distinct**
   accounts* auto-mutes pending review. Distinct reporters is what makes it
   brigade-resistant.

### Forced rename is required, and it settles a schema question

`Identity` above makes the username the identity and leaves renaming open. **An
offensive username its owner will not change is unanswerable without a forced
rename**, so the action is not optional.

> **That makes the immutable-`id` note in `Identity` load-bearing rather than
> advisory.** With the username as a real primary key, a forced rename rewrites
> every foreign key in the system; with an internal id, it is one column.

### Retention

> **Reported content is retained independently of its channel's history**, or a
> report outlives its own evidence. This is why Direct keeps the longest history
> despite being the least public.

---

## Custom avatars are pre-moderated and paid — **decided 2026-07-27**

**Chat is text-only, which avoids the expensive half of moderation entirely** — no
image classification, no upload pipeline. **Custom avatars reintroduce it
deliberately**, and the fee is what pays for it.

### Pre-moderation is the condition the whole thing rests on

> **An uploaded avatar is not visible to anybody until a human has approved it.**

| | A bad image is seen | The queue is a… |
|---|---|---|
| Post-moderate — live now, removed on report | **yes, by every opponent** | harm problem |
| **Pre-moderate — approved before visible** | **never** | **throughput problem** |

A day's wait for a paid cosmetic is acceptable. A racist avatar broadcast to every
opponent for six hours is not — and reports would arrive *after* the damage.

### The economics work, with one condition

An avatar review is a **glance**, not a read — roughly 20 seconds against the two
minutes a chat report takes, so about **$0.14**. A **$5** fee is ~35× that.

> **The fee is charged per change, not once to unlock the feature.** Changing an
> avatar means paying again, and so does changing a name.

**That is what makes the economics unbreakable rather than merely comfortable.** A
one-time unlock with free changes inverts at about 36 changes a year — a player
who swaps weekly generates 52 reviews against a single payment. Per-change
pricing means **every review that exists has already been paid for**, so no volume
of changes can ever cost more than it earns.

**It also removes the need for a rate limit.** A cooldown was the alternative way
to bound this; the fee does the same job without a rule, and without telling an
enthusiastic customer to wait.

**A rejection must still allow a free resubmit.** The fee buys an *approved*
avatar; charging again for a rejection produces chargebacks and support load that
dwarf it.

**Moderation is disclosed at purchase**, not discovered afterwards.

### What accepting uploads commits us to

These attach the moment an upload is accepted, fee or no fee:

- **DMCA** — copyrighted art will be uploaded; a takedown path is required.
- **CSAM reporting obligations** — non-negotiable in the US, with a required
  reporting route **on discovery**, which is not the same as on publication.
- **Storage and deletion**, including honoring account deletion.

**None of this argues against doing it**; it argues for having the paths written
before the first upload — and it is a further argument for pre-moderation, since
every image is being looked at regardless.

### The curated tier carries the volume

**A gold border on a player's heroes, seen by everyone who battles them, is the
same broadcast surface as a foil at zero moderation cost.** That gives the clean
two-tier shape:

| Tier | Moderation | Role |
|---|---|---|
| **Curated** — foils, borders, frames | **none** | the volume |
| **Custom upload** | pre-moderated, paid | the premium, self-funding |

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
- **Profiles** — what is public beyond the Visible squad, hold streaks and league,
  all of which are already public by other rules.
- **The price of a name change and of an avatar change.** Both are per-change and
  both sit outside the $260 advantage cap (`06-progression.md`), since neither
  can touch a battle. The avatar fee has a floor the name change does not: it must
  clear the ~$0.14 review it triggers, which $5 does 35× over.
- ~~**Store platform reality.**~~ **Decided 2026-07-27** — `06-progression.md`,
  *Steam is the primary storefront*. Steam plus a secondary direct channel from
  the browser build; auth is already owned, so one entitlement service serves
  both. What remains is to **verify against the current Steam Distribution
  Agreement** before a purchase flow is built.
- **Live-ops.** Maintenance flag, patch cadence, and what happens to a battle in
  flight at deploy. Parked until closer to launch by decision, **not** dropped.
