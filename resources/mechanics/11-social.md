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

### Prices — **set 2026-07-28**

| | Cost |
|---|---|
| **Voluntary rename** | **325 shards** — half a rune |
| **Forced rename** | **free**, always |
| **Custom avatar** | **$5 or 1,350 shards** |

**325 is half a rune and 1,350 is a little over two**, which is how they should be
read — 0.84 and 3.5 days of a typical player's income. Both sit outside the $260
advantage cap, since neither can touch a battle.

**The fee's job is to keep the volume small, not to fund the desk.** Shards cost
us nothing to mint, so they cannot literally pay a moderator; what they do is make
a rename a considered act, and a considered act is rare enough that human handling
stays cheap. **AI assists the workflow** — surfacing, matching, preparing — under
the same rule as everywhere else: it **flags and prepares, it never decides.**

#### A dual price must always be worse value than the subscription

> **Any item priced in both dollars and shards implicitly prices shards** — and
> `Shards cannot be bought` is what caps purchasable advantage at $260/year.

Paying $5 rather than 1,350 shards **frees 1,350 shards for runes**, so the
dollars bought power indirectly. That is fine only while the rate is bad:

| | Shards per dollar |
|---|---|
| **Subscription** — $20 for four weeks, **+10,864 shards** | **543** |
| **Custom avatar** — $5 or 1,350 shards | **270** |

**The avatar is 0.50× the subscription's efficiency**, so buying avatars is never
a sensible way to buy progression — anyone optimising for power subscribes
instead, and the leak closes itself.

> **The rule this generalises to: no dual-priced item may exceed ~543 shards per
> dollar.** Cross that line and the item stops being a cosmetic and becomes the
> shard shop the design refuses to build. Check it every time one is priced.

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

### Six scopes

| Scope | Reaches | Who may write | History |
|---|---|---|---|
| **Global** | everyone, **split by language** | all | short — it is ephemeral by nature |
| **Guild** | the ≤24 members | all members | ~30 days — coordination needs it |
| **Direct** | one other player | both | longest — it is the evidence channel |
| **Admin** | everyone | **the team only** | permanent |
| **Guild Ads** | everyone, split by language | **rate-limited** — see below | short |
| **Beginner** | players still in the starter league, **+ Envoys** | all present | short |

**There is still no league chat**, and the two additions below are not it.
`09-matchmaking.md` makes **promotion one-way and permanent**, so a league room
would eject a player from their own conversations as a *consequence of gearing
up* — turning the currency the game is built on into a social cost. Rejected on
that alone, and still rejected.

### Guild Ads — **added 2026-07-28**

> **One channel for both directions: players posting that they are looking for a
> guild, and guilds promoting themselves.**

**Split by language, like Global.** A guild advertisement in a language a reader
does not speak is pure noise, and guilds are language communities in practice
anyway.

> **Separating it from Global is the entire point.** Recruitment is repetitive,
> formulaic and constant; left in Global it is the traffic that makes Global
> unreadable, and moving it out is cheaper than any moderation or sharding rule.

Moderation is Global's, unchanged. The content is formulaic enough that it should
be the quietest queue in the game.

#### A guild posts from a budget, and the budget is the rate limit

> **An active guild receives 2 free ad credits a day. It may post up to 4 a day,
> and the extra two are paid from its guild funds balance. Neither may be topped
> up from a member's own shards.**

**The free half keeps every active guild recruiting; the paid half is what a guild
earns its way to.** At four a day the channel is still **6× tighter than a
one-per-hour cap** — 28 posts a week against 168 — and a guild that never wins
anything still gets two a day forever.

**Nobody pays personally to do recruiting duty.** Guild ads are funded *only* from
guild funds; a member cannot spend their own shards to post one. Recruiting is
unpaid work already, and an officer covering it out of pocket is the version of
this that quietly stops happening.

| | |
|---|---|
| Free daily credits | **2/day** while active — **do not carry over** |
| **Hard posting cap** | **4 guild ads per day — regardless of balance** |
| Cost of a 3rd or 4th post | **5 guild funds** each, from the persistent balance |
| Personal top-up | **Not permitted**, at either tier |

##### The cap is on the posting rate, not on the balance

> **A guild may post four ads a day. Not four a day *on average*, and not more
> because it is holding a large balance — four, whatever that balance says.**

**This is what makes stockpiling structurally unable to become spam**, and it
matters because **guilds recruit part-time.** A guild that goes quiet for a month
and then runs a recruitment drive is the normal case, not an abuse — and without a
rate cap it is indistinguishable from a guild that saved up to flood the channel.
Capping the *rate* lets the first happen and makes the second impossible.

Three rules, doing different jobs:

- **The free credits do not carry over.** Two a day, granted daily, gone daily.
  Granting them daily rather than weekly is what stops a quiet guild banking them
  at all — there is no window in which they accumulate.
- **Event prizes persist**, because a prize that evaporates is not a prize. They
  fund the third and fourth post at 5 apiece.
- **Four is the ceiling for everyone.** A guild holding 10,000 guild funds posts
  exactly as often as one holding 10.

> **So the answer to "what if they stockpile" is: they reach four a day, the same
> as the richest guild in the game, and then they stop.** Winning buys **bounded
> reach** — double, never more — and everything past that goes to logos and
> cosmetics. That bound is doing the work a balance limit would have done, without
> ever making an event prize worth less than it says.

**A guild that never wins anything still recruits forever**, which is the half
worth protecting. Two free posts a day is not a consolation tier — it is most of
the cap, and it is unconditional on anything but being active.

**Guild funds are a separate balance from Rune Shards** — not transferable, not
convertible, spendable only on guild-scoped purchases. Ads are the first; **guild
logo changes are the obvious second** once logos exist, which is why this is
funds rather than a bare post allowance.

#### Two sources: the free daily credits, and event placements

> **A guild's event placement is paid in guild funds** — which is what the
> guild-level reward in `08-guilds.md` has always been structurally, without a
> currency attached until now.

That doc already pays at two levels: **top Wings are paid directly, and the guild
receives a lesser reward on top.** The Wing half pays members in Rune Shards. The
guild half had no defined form, and guild funds are the natural one:

| Level | Paid to | In |
|---|---|---|
| **Wing placement** | its eight members | **Rune Shards** |
| **Guild placement** | the guild | **Guild funds** |

**Two currencies, two recipients, no double-dip** — a member is not paid twice for
the same result, and the guild gets something only a guild can spend.

> **It self-balances by need, which is the pleasing part.** A top guild is
> generally **full at 24/24 and does not need to advertise** — so its winnings go
> to logos and whatever guild cosmetics follow, while a guild still building
> spends the same funds on recruiting. **One reward, two meanings, chosen by
> whoever earned it.**

> **"Active" means at least 3 members active in the past 7 days — set
> 2026-07-28.** Below that, no allowance. A guild that cannot field three players
> is not a guild anyone should be joining, and the gate exists so that recruiting
> into a dead guild is the one thing the channel cannot advertise.
>
> **Except for its first 14 days, when a guild is active regardless of headcount**
> (`08-guilds.md`). A guild founded today has one member and would otherwise be
> unable to advertise at the moment it most needs to — the rule aimed at dead
> guilds would hit newborn ones exactly as hard, and they are opposite things.

**It reuses a definition the game already has.** `09-matchmaking.md` counts a
player active on **an attack battle or a defense-squad edit**; this is that same
signal, counted per guild over 7 days rather than per player over 30. No new
tracking.

> **Note the interaction with the cap above.** A guild that drops under three
> active members simply stops receiving the allowance — it does not lose funds it
> already holds, and event prizes it won are untouched. It can still post twice a
> day until the balance runs out, then goes quiet. **Decline is gradual rather
> than a cliff**, which is right: three members is a bad week for a real guild as
> often as it is the end of one.

#### Nothing in this channel is free

**A player looking for a guild pays 5 personal shards per post — text or embed,
no exceptions.** There is no free post in Guild Ads for anyone.

> **It is the cheapest posting in the game on purpose.** It is made by the player
> who has the least — unguilded, often new, still building — and it is the posting
> the design most wants to *happen*, since it feeds guild formation and guild
> formation is most of what keeps people playing. Pricing it like a squad share
> would tax the one message we should be subsidising.

> **The fee is the rate limit, for both sides.** A guild is capped at 4/day
> outright; an individual's own shards cap them by costing something every time.
> **No separate rate-limit rule is needed anywhere in this channel**, which is
> most of why it stays readable — the one place in chat where paying is the price
> of admission rather than a surcharge on a richer message.

The asymmetry between the two sides is intentional: **a guild speaks for 24 people
and gets a budget; a player speaks for themselves and pays for themselves.**

### Embeds — **added 2026-07-28**

> **A message may carry a structured game object. Prices — set 2026-07-28:**
>
> | Posting | Cost |
> |---|---|
> | **Your own squad** — attack squad or your own Visible defense | **10 shards** |
> | **An opponent's Visible defense** — a wall report | **25 shards** |
> | **Looking for a guild** | **5 shards** — the cheapest, deliberately |
> | A Visible-battle replay | 10 shards |
> | **A guild promotion** | 2 free/day, then **guild funds** — see above |

**An embed is a reference, not an upload** — `{type, id, snapshot}`, rendered
client-side from data the server already holds.

> **That is what makes this cheap, and it is the load-bearing choice.** Nothing in
> a squad or replay embed is authored by a human, so **embeds carry no moderation
> surface at all** — no queue, no review, no cost per post. Compare custom avatars,
> which needed a whole pre-moderation pipeline at ~$0.14 a review. Keep embeds as
> references and that entire class of expense never arrives.

**The gap between 10 and 25 is deliberate.** A wall report is the one posting that
**names another player**, it asks strangers for real analytical work rather than
opinions, and it is worth more — actionable intel against a specific defense.
Charging the same for both would make the cheapest thing to post the one with a
third party in it.

**These are deliberateness, not hard rate limits.** Against 388 shards/day the
three prices are **1.3% · 2.6% · 6.4%** — 77, 38 or 15 posts a day if a player
spent nothing else, which nobody does. The fee makes posting an act rather than a
reflex; per-scope rate limits still do the limiting.

> **The ordering is the design.** Cheapest is **asking to be let in**, then
> **asking about yourself**, then **asking about somebody else.** Price rises with
> how much of other people's attention a posting spends.

> **Guilds remain bounded by guild funds, not by these prices.** A guild promotion
> is never paid for in personal shards at any price (*Nothing in this channel is
> free*), so the two economies never meet: **a player's shards cannot buy a guild
> more reach, and a guild's funds cannot buy a member a squad posting.** The
> ceiling of 4 ads a day holds regardless of how wealthy either side is.

#### A Hidden defense can never be embedded

> **No embed may show a Hidden defense — not by its owner, not in guild chat, not
> anywhere, and not through a replay.**

Two routes exist and both are closed by the one rule:

- **Directly.** Posting your own Hidden squad destroys the mechanic permanently
  for you, and worse, creates social pressure on everyone else to do the same.
- **Through a replay**, which is the subtle one. `02-squads.md` settled that **a
  fought Hidden squad does not stay revealed** — but the attacker holds a replay
  of it. Embedding that replay broadcasts to everybody what the rule declines to
  persist even for the one person who was there.

**So replay embeds are Visible battles only.** Guild chat is not an exception:
guildmates can be matched against each other, so sharing a Hidden squad with 23
people is directly exploitable rather than merely unwise.

#### Guild avatars are curated, not uploaded — **decided 2026-07-28**

> **A guild builds an emblem from parts we author: one of 36 icons, an icon
> colour, and a background colour. Nothing is uploaded, so nothing is
> reviewed.**

#### The emblem is composed, not picked — **set 2026-07-28**

**Three choices rather than one**, which is what stops a curated set feeling
canned:

| | |
|---|---|
| **Icon** | **36**, authored |
| **Icon colour** | 12, from a vivid palette |
| **Background colour** | 12, from a **separate** dark palette |
| **Combinations** | **5,184** |

> **Two palettes, not one shared palette, and that is the whole trick.** If icon
> and background drew from the same list, a player could pick dark-on-dark and
> produce something illegible — so the system would need a contrast check, a
> rejection, and an error message. **Split the palettes and every one of the 144
> pairs is legible by construction.** Same principle as curating the set in the
> first place: make the bad output impossible rather than validating against it.

##### A solid block is allowed, and it is just one of the icons

**One of the 36 is blank.** Choosing it yields a plain field of the background
colour and nothing else — so a guild that wants a solid block picks it the same
way it would pick a wolf, with no toggle, no special case and no combination to
stumble into.

> **A blank entry in the set is a better mechanism than a "match background"
> switch**, which was the alternative. It needs no new control, it cannot be
> reached by accident, and it makes the plain field a **legitimate design choice
> sitting among the others** rather than a loophole the system tolerates.

The arithmetic follows from it: **35 icons × 12 inks × 12 grounds = 5,040**
figured emblems, plus **12 solid fields** — since with the blank symbol the ink
choice has nothing to colour.

> **The curation exists to prevent what is *inappropriate*, not what is in poor
> taste.** A monochrome emblem is silly; it is not harmful, it does not need
> reviewing, and stopping it would be us overriding a guild's choice about their
> own identity for no reason but aesthetics. Some of them will mean it — a flat
> field of colour is a real minimalist look, and telling those guilds no in order
> to protect the ones being careless is a bad trade.

That line is worth holding elsewhere too: **every restriction in this document
should be answerable with "because it could harm someone," never with "because it
would look bad."**

##### Contrast is a warning, never a gate — **set 2026-07-28**

**Showing a guild that its ink and ground are close is helpful. Refusing to save
it is not.** A contrast readout may be displayed, and a low one may be called out
plainly — *"this sigil will be hard to read at small sizes"* — but **it must never
block submission, disable the save, or mark the emblem invalid.**

> **A validator is the shape this design chose against.** Disjoint palettes
> already make illegibility unreachable by accident; anything a player reaches
> after that, they reached **on purpose**. Gating it converts a deliberate
> aesthetic choice into an error message, which is the interface telling a guild
> their taste is a mistake.

**Tell them, do not stop them.** That is the general form of the rule above: harm
is a gate, taste is a note.

**Uniqueness is not the goal and should not be promised.** At 5,184 combinations,
duplicates appear well before a thousand guilds exist — and that is fine, because
**the guild's name is the identifier and the emblem is expression.** Two guilds
sharing a red wolf is how every clan system in the genre has ever worked.

> **If more variety is ever wanted, add a shape.** A background silhouette —
> shield, roundel, diamond, banner — multiplies the space by however many are
> drawn, for the least art per unit of variety of any lever available. Not needed
> now; noted so it is not re-derived.

**This keeps the entire feature at zero moderation cost.** An uploaded logo would
have inherited the custom-avatar pipeline whole — pre-moderation, a review per
change, a per-change fee sized to cover it — and it would have done so on the
**most-read surface in the game**, which is the worst place to put a queue.
Choosing from a set removes the queue rather than staffing it.

Three things fall out of it, all good:

- **Every guild card looks right by construction.** The guild promotion embed is
  the one players see most; an upload guarantees that some fraction of them are
  ugly, low-resolution or misaligned, and no amount of moderation fixes *bad*.
  **A composed emblem cannot be ugly**, because we drew every part of it.
- **It is a real sink for guild funds.** Avatars beyond a free starting handful
  are bought with guild funds, which is exactly the "surplus goes to prestige"
  role event prizes were given. A winning guild wears its winnings.
- **The set is a content lever**, not a fixed cost — new avatars ship whenever
  there is a reason to, the same additive shape as curated bot defenders.

> **This is narrower than it sounds: it settles *guild* avatars only.** Player
> custom avatars remain as decided in *Custom avatars are pre-moderated and paid*
> below — uploads, pre-moderated, charged per change — because there the whole
> point is that it is **yours**. A guild is a shared identity that 24 people wear,
> which is a much better fit for a curated set than a personal one is.

### Beginner chat — **added 2026-07-28**

> **A help channel for people who just arrived. Membership is *gated by* starter-
> league status; it is not the starter league's room.** Players leave when they
> leave the league — at one week, at 3,250 shards, on opting out, or on joining a
> guild.

**The distinction is not cosmetic, and it is what keeps this from being league
chat.** Beginner chat is organised around **being new**, not around a rung on a
ladder — the starter league is merely the cleanest definition of "new" the design
already computes, so it is used as the gate rather than as the identity. Nothing
about the room refers to the league, and no other league ever gets one.

**The no-league-chat objection therefore does not engage.** That rule exists
because partitioning the *whole playerbase* by strength would eject people from
their conversations as a consequence of gearing up. This is one room, for a
population defined by having arrived recently, **temporary by construction and
known to be temporary from the first minute.** Leaving is graduation, not
eviction. A cohort, not a neighbourhood.

**It is also where the need is greatest.** A new player has the most questions and
the fewest people to ask; Global is a room of veterans, and a guild is the thing
they do not have yet. A peer room is the obvious answer and costs one more scope.

> **It is the highest-risk room in the game and must be treated as such.** A
> channel of brand-new players is precisely where scams and grooming are aimed,
> and its occupants are the least equipped to recognise either. **Beginner chat
> gets moderation priority over every other scope**, and **DM gating**
> (*The load, and the three levers* below) matters here more than anywhere else.

### Envoys — **added 2026-07-28**

> **Appointed players who may remain in Beginner chat after graduating, in order
> to help new players. They agree to a code of conduct. They have no powers.**

Without Envoys the beginner room is a room of people who all arrived yesterday,
with no one in it who knows anything. Envoys are the fix, and they are the only
exception to Beginner chat being for beginners.

**They have no moderation powers, and this is not a detail.** An Envoy may
**report** exactly as any player may report; they cannot mute, remove, or act.
Volunteer moderators with real authority and no accountability is a well-mapped
failure mode, and the same principle already governs the classifier — *flag, never
moderate* — so applying it to people is consistency rather than caution.

| An Envoy **may** | An Envoy **may not** |
|---|---|
| Stay in Beginner chat after graduating | Mute, kick, or ban anyone |
| Answer questions, explain systems | See reports, queues, or another player's history |
| Report, like anyone | Bypass **DM gating** — the role grants no messaging privilege |

> **The role is attractive to exactly the people who must not have it.** Standing
> access to a room full of new players is what a bad actor would want most, so
> Envoys are **appointed, never self-serve**, and **revocable at will** for any
> breach of the code. Vetting is the cost of the feature, and it is the feature.

**Recognition is cosmetic, never mechanical.** A badge, a border, or a foil fits
the design's existing habit of paying status in things that cannot touch a battle
(`06-progression.md`). An Envoy must never receive shards, a boost, or anything
that makes the role worth holding for advantage rather than for helping.

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

## The public profile — **settled 2026-07-28**

Mostly fixed, with one configurable pair.

| Field | Visibility |
|---|---|
| **Visible defense squad** | **always** — scouting is the core loop |
| **Both hold streaks** | **always** — public by design, incl. the Hidden squad's |
| **League** · **rating** · **roster power** | **always** |
| **Guild** | **always** — a guild roster shows it regardless |
| **Battle record** | **always, as the last 20 battles** |
| **Time zone** · **languages** | **player's choice**, shown by default |

### Location is the one thing a player may hide

**Time zone and languages are the fields that describe a person rather than an
account**, which is why they are the pair worth making optional. Everything else
above describes *play*, and this is a competitive game where hiding play invites
exactly the suspicion a privacy control is meant to avoid.

**Default to shown**, because both are what recruiters filter on and most players
want to be found. **Hiding them on a profile does not remove them from a
*Looking for a Guild* posting** — that posting is the player's own, and choosing
to include something there is a different act from leaving it on display
permanently.

### The record is the last 20 battles, and never a Hidden one

> **The public record shows the last 20 *Visible* battles. Hidden battles never
> appear in it — not as entries, not as gaps, not as a discrepancy in a count.**

**A rolling window rather than a lifetime tally** because a permanent ratio is a
number worth protecting, and a player protecting it **stops attacking** — which is
the behaviour the entire economy depends on, at 288 of a typical 388 shards a day.
Twenty battles is informative, recovers from a bad run, and is never worth
defending by not playing.

#### Excluding Hidden battles naively is what leaks them

**This is the trap.** Take the player's last 20 battles, filter out the Hidden
ones, and display what remains — and the result **advertises exactly what it was
meant to conceal**, in three separate ways:

- **A short list.** 20 requested, 17 shown, so three were Hidden.
- **A gap in time.** A visible run with an unexplained six-hour hole in it.
- **A count that does not reconcile** with anything else on the page — *"20 of
  23"*, or a total that disagrees with the streaks.

**So it is not a filter over the last 20 battles. It is the last 20 Visible
battles**, selected that way from the start: always exactly 20, contiguous by
their own numbering, with nothing on the page from which a Hidden count can be
subtracted.

> **Same rule as embeds, one layer deeper.** A Hidden battle is *absent*, never
> redacted — and an absence that can be measured is not an absence. The Hidden
> squad's **hold streak stays public**, which is the one Hidden fact the design
> deliberately publishes, and it reveals a count without ever revealing an
> occasion.

#### A player sees all of their own — just not on a profile

> **The restriction is on the *profile*, not on the player.** A player's own
> battle history contains **every** battle they fought, Hidden included, with full
> replays.

This is what *The defender's feedback loop* above already promises, and it must
not be read away: **the whole point of Hidden defenses is that the defender learns
from them.** Two different surfaces —

| Surface | Contains |
|---|---|
| **Battle history** — private, theirs | **everything**, Hidden included, with replays |
| **Profile** — public, and their own view of it | last 20 **Visible** only |

**Their own profile shows the same 20 that everyone else sees**, deliberately. A
profile that showed Hidden battles to its owner and not to visitors would leak
through the first screenshot anyone shared — and players screenshot profiles
constantly. **One surface, one truth, no version of the page that says more than
the public one.**

> **The personal CSV export includes Hidden battles**, since it is the player's
> own data leaving the system and *A player exporting their own data is a
> portability right*. The rule has always been that **we never publish a Hidden
> squad in-game**, not that a player may not possess their own record of it.
> **What it may not carry is somebody else's** — see below.

---

## CSV export — **settled 2026-07-28**

> **Players can download their own data. Guild masters and officers can download
> their guild's. Both by default, free, no tier and no toggle.**

**It costs almost nothing and it suits this game specifically.** The data already
exists server-side and CSV is a serialization; meanwhile LMNTLZ is a
counter-building game whose whole appeal is reading numbers, so the players most
likely to stay are the ones who want a spreadsheet. It also sits naturally beside
a design that publishes its own ceilings rather than hiding them.

| Who | Gets |
|---|---|
| **A player** | their roster, runes and gear score, battle history, shard income — everything about themselves |
| **A guild master or officer** | **event participation and performance only**, per member, plus the guild's own event history and placements |

### A guild export is event data and nothing else — **set 2026-07-28**

> **An officer cannot export a member's roster.** Not their runes, not their gear
> score, not their battle record, not their squads — regardless of what that
> member has made public.

**The reason is aggregation, not secrecy.** Most of what an officer would want is
already visible one profile at a time, so the restriction is not hiding anything
new. What it refuses is the *bulk* of it: **a spreadsheet of 24 players' builds is
a different object from 24 profile visits**, and the difference is exactly what
makes it worth restricting. Aggregation is a privacy change even when every row is
individually public.

**Event data is the carve-out because it is the guild's own record of itself.**
Participation and performance exist *because* the member joined and played under
the guild's banner — an officer cannot run a Wing, judge an assignment, or answer
*why did we place 400th* without them. Everything else is the player's business.

> **This decoupled a dependency I had introduced an hour earlier.** The previous
> version let player-scoped fields follow profile visibility, which made the
> still-open profile question load-bearing for exports. **It no longer is** —
> visibility governs profiles, exports do not read it, and the two can be settled
> independently.

**The Hidden squad appears in no export, ever** — not a player's own, not an
officer's. Same rule as embeds: absent rather than redacted.

### What a battle row contains — **set 2026-07-28**

| Column | Included |
|---|---|
| Date · zone (Visible/Hidden) · attack or defense · outcome | **always** |
| Rating change · shards earned | **always** |
| **Your own squad**, in full | **always** — including your Hidden squad when it defended |
| Opponent's name and league | **always** |
| **Opponent's squad** | **only when it was a Visible defense** |

> **The opponent column is the whole question.** A Visible defense is public and
> scoutable, so exporting it reveals nothing that was not already on offer. **A
> Hidden defense is the one thing this design protects**, and `02-squads.md`
> settles that *a fought Hidden squad does not stay revealed*. A CSV the attacker
> keeps and can hand to anyone is about as revealed as a thing gets.

**The fact of the battle is fine; the composition is not.** *You were ambushed
into this player's Hidden defense and lost* leaks nothing — **everyone** has a
Hidden squad, and its hold streak is public by design. What must not travel is
**which six heroes were standing in it.**

**Symmetrically, your own Hidden squad is yours to export.** You built it, you
already know it, and nobody else's secret is in that column.

> **Settled 2026-07-28 — and `02-squads.md` had already answered it.** That
> document says a Hidden squad is visible *"only inside the battle itself and in
> that battle's replay"*, so an attacker keeping one was always intended. What is
> new is that **every replay in the game expires after 7 days**
> (`../../docs/tech-stack.md`), so the Hidden case needs no special rule. The
> export above is unaffected — it reads metadata, which is permanent.

### Two smaller things that decide whether it is any good

- **A stable schema.** Column names and order are a contract the moment someone
  builds a spreadsheet on them. Add columns at the end; never rename or reorder.
  **ISO-8601 dates, UTF-8, no localisation** — a CSV that changes shape between
  patches is worse than none.
- **A player exporting their own data is a portability right**, not merely a
  feature, which is worth knowing when *Retention* gets its legal read. The guild
  export is the opposite — us handing one player another's data — and that is
  exactly why it is narrowed to the one category the guild generated itself.

---

## Admin tooling via MCP — **direction posed 2026-07-28, not settled**

An **MCP server behind granted per-admin API keys**, letting trusted admins drive
moderation with AI assistance. Recorded because the reasoning should not be
re-derived; nothing is committed.

**The case for it is cost.** `../../docs/tech-stack.md` already notes admin
tooling is *owned rather than provided* and unbuilt — and an MCP server skips the
entire frontend, since the tools are API endpoints that have to exist anyway. It
also makes **"an AI flags; it never moderates"** into tooling rather than a
slogan: the model reads, ranks, summarises and drafts; a human acts.

**Restricting it to trusted admins solves the credential problem and not the
interesting one.** Fewer keys, easy revocation, no insider-threat modelling — real
savings. But the sharp risk is **prompt injection, and it is not aimed at the
admin**:

> **The trust boundary is not *who holds the key*, it is *whose text enters the
> model's context*.** A trustworthy admin with a legitimate key asking a perfectly
> ordinary question — *summarise today's report queue* — pulls hostile
> user-authored content into a model that is simultaneously holding ban tools.
> The admin's trustworthiness is irrelevant because the admin is not the one being
> manipulated. **Structurally it is SQL injection: restricting database access to
> senior engineers does not fix it, because the injection arrives in the data.**

Two things trust also does not cover: **the model can be wrong with no adversary
at all**, and a disputed ban still needs **an audit record** regardless of who
issued it.

**So the shape, if it is built:** read-broad and write-narrow · destructive
actions **propose rather than execute**, writing a pending action a human confirms
where the model cannot reach · user content treated as data and never allowed to
select a tool · per-admin keys with an audit log. **Not a separate service** — a
thin layer over the same Hono API, for the same reasons chat is not one.

**Build the read half first and alone.** It captures most of the value at almost
none of the risk, and it is how you learn what the write tools should actually be.

---

## Open

- **Whether in-game chat is built at all, or whether it is a Discord server** —
  *raised 2026-07-28, to be answered when chat is scheduled.* Chat is already a
  fast-follow rather than a 1.0 feature, so nothing waits on this, but it should
  be asked before the vendor question below rather than after.

  **Everything recurring in this document belongs to chat.** The realtime vendor,
  the AI classifier at $68–$675 a month, and 2–10 human hours a day of moderation
  at 10k–50k DAU are all chat costs; **the rest of the game has none of them.**
  Discord externalizes all three — the transport, the moderation tooling, and the
  legal surface of hosting user speech — for nothing, and its own moderation
  ecosystem is better than anything worth building here.

  What is genuinely lost is smaller than it looks: **Admin broadcast** (a Discord
  announcements channel does it), and **Guild chat scoped to guild membership**
  (Discord cannot know who is in a guild without an integration). The real loss is
  that chat is where a lapsed player gets pulled back, and a Discord a player has
  to remember to open does that far less than a tab in the client does.

  The middle option is worth pricing when this comes up: **Guild chat in-client,
  everything social on Discord.** Guild chat is the scope that actually needs game
  state, it is 24 people rather than a global room, and it is the least
  moderation-exposed of the four — which drops the recurring cost close to zero
  while keeping the retention loop.

  > **This is a passion project funded personally.** Recurring operational cost is
  > a first-class constraint here, not an afterthought — see
  > `06-progression.md`'s revenue curve. A feature that is free to design and
  > expensive to *run* is the shape to be most careful with, and chat is the only
  > one in the design so far.
- **Which managed realtime vendor**, and what it costs at the player counts
  `06-progression.md` sizes the business around. The *shape* — a managed service
  behind an interface, sends routed through our own API — is decided; the vendor
  is a procurement question, and the interface is what keeps it one. **Blocked on
  the question above**: if chat is Discord, there is no vendor to pick.
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
