# Feature Specification: Chat & Embeds

**Feature Branch**: `014-chat` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 14 of the LMNTLZ 1.0 set (`specs/README.md`). Six chat scopes, realtime delivery, and paid structured postings.

---

## Six scopes

| Scope | Reaches | Who may write | History |
|---|---|---|---|
| **Global** | everyone, **split by language** | all | short |
| **Guild** | the ≤24 members | all members | ~30 days |
| **Direct** | one other player | both | **longest — the evidence channel** |
| **Admin** | everyone | the team only | permanent |
| **Guild Ads** | everyone, split by language | **rate-limited** | short |
| **Beginner** | starter-league players **+ Envoys** | all present | short |

**There is deliberately no league chat.** Promotion is one-way and permanent, so a
league room would eject a player from their own conversations **as a consequence
of gearing up** — turning the currency the game is built on into a social cost.

## Two structural facts

> **The broker only fans out. Clients subscribe; they never publish.**

Every message passes through our own service first — to authorise the scope,
charge any cost, persist it, and queue it for classification. **That is
correctness, not hardening:** some postings cost shards, so a client able to
publish directly would bypass the charge.

> **Moderation is two tiers, and only one of them gates.** A blocklist, rate limit
> and length cap run **synchronously before send**. The classifier runs
> **asynchronously alongside delivery** and only flags.

Drawing the classifier as a gate would stall a quiet guild channel for hours
behind a batch that answers in minutes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Players talk, and it feels live (Priority: P1)

A player types in a channel and everyone present sees it immediately.

**Why this priority**: It is the feature.

**Independent Test**: Post in each scope and confirm delivery to exactly the right
audience.

**Acceptance Scenarios**:

1. **Given** a message, **When** sent, **Then** it reaches exactly the scope's audience and nobody else.
2. **Given** a client, **When** it connects, **Then** it holds a **subscribe-only** credential scoped to the channels that player may read.
3. **Given** a client, **When** it attempts to publish directly to the broker, **Then** it cannot.
4. **Given** a guild channel, **When** a non-member attempts to read it, **Then** they cannot.
5. **Given** Beginner chat, **When** a player who has left the starter league attempts to write, **Then** they cannot — unless they are an **Envoy**.
6. **Given** Global and Guild Ads, **When** shown, **Then** they are **split by language**.

---

### User Story 2 - A message is checked before it goes out, and reviewed after (Priority: P1)

An obvious slur never appears. Everything else appears immediately and is
reviewed behind the scenes.

**Why this priority**: Equal-first. Getting the ordering wrong makes chat either
unsafe or unusable.

**Independent Test**: Send a blocklisted term and confirm refusal; send ordinary
text and confirm immediate delivery with asynchronous classification.

**Acceptance Scenarios**:

1. **Given** a message containing a blocklisted term, **When** sent, **Then** it is refused **before** delivery.
2. **Given** an ordinary message, **When** sent, **Then** it is delivered **immediately** and classified afterwards.
3. **Given** the classifier, **When** it runs, **Then** it **never holds, blocks or edits** a message — it only flags.
4. **Given** a rate limit or length cap, **When** exceeded, **Then** the message is refused before delivery.
5. **Given** the blocklist, **When** examined, **Then** it is a **slur blocklist, not a general profanity filter**.

---

### User Story 3 - A player shares a squad for advice (Priority: P2)

A player posts their own squad, or an opponent's wall, as a readable card rather
than as typed-out text — and pays for it.

**Why this priority**: The reason chat is in-game rather than on Discord.

**Independent Test**: Post each embed type, confirm the charge and the rendering,
and confirm no Hidden squad can be posted by any route.

**Acceptance Scenarios**:

1. **Given** an embed, **When** posted, **Then** it costs **10** for your own squad, **25** for an opponent's Visible defense, **5** for looking-for-guild, and **10** for a Visible-battle replay.
2. **Given** any embed, **When** rendered, **Then** it is a **reference** — rendered from data the server already holds, never uploaded content.
3. **Given** **any** route whatsoever, **When** a Hidden defense is involved, **Then** it **cannot be embedded** — including via a replay.
4. **Given** an embed, **When** displayed, **Then** it **stands out significantly** from ordinary messages.
5. **Given** insufficient shards, **When** an embed is attempted, **Then** it is refused.

---

### User Story 4 - A guild recruits without anyone paying personally (Priority: P2)

A guild posts a promotion from guild credits, and a player looking for a guild
posts for a small personal fee.

**Why this priority**: Guild formation is most of what keeps people playing, and
this is the channel that feeds it.

**Independent Test**: Exhaust a guild's daily credits and confirm the hard cap
holds regardless of balance.

**Acceptance Scenarios**:

1. **Given** an active guild, **When** the day begins, **Then** it receives **2 free ad credits**.
2. **Given** a guild, **When** it posts ads, **Then** it may post at most **4 per day regardless of balance**.
3. **Given** unused credits, **When** the day ends, **Then** they **do not accumulate**.
4. **Given** a player posting looking-for-guild, **When** charged, **Then** it costs **5 shards** of their **own** — the cheapest posting, deliberately.
5. **Given** Guild Ads, **When** examined, **Then** there is **no free post for anyone** — the fee **is** the rate limit, and no separate rate-limit rule exists in this channel.

---

### Edge Cases

- **A guild stockpiling credits then spamming.** Impossible — the cap is on the **posting rate**, not the balance.
- **A newly founded guild with no funds.** The 2 free daily credits are what make recruiting possible at 1.0, since guild funds are deferred with events.
- **Beginner chat with no experienced players in it.** Envoys are the fix, and they are the **only** exception to the room being for beginners.
- **An Envoy attempting to moderate.** They have **no powers at all** — they may report exactly as any player may, and the role grants **no bypass of DM gating**.
- **A player posting their own Hidden squad.** Refused. Doing so destroys the mechanic permanently, and it is directly exploitable rather than merely unwise.
- **A message in a channel a player has been banned from.** Refused, scoped by the ban's own scope.
- **Direct messages as evidence.** Kept longest of any scope, precisely because it is the evidence channel.

## Requirements *(mandatory)*

**Scopes and delivery**

- **FR-001**: Six scopes MUST exist — Global, Guild, Direct, Admin, Guild Ads, Beginner — each with its own audience, write permission and retention.
- **FR-002**: Global and Guild Ads MUST be split by language.
- **FR-003**: Beginner chat MUST admit starter-league players and **Envoys**, and nobody else.
- **FR-004**: There MUST be no league-scoped chat.
- **FR-005**: Messages MUST be delivered to exactly their scope's audience.

**The publish path**

- **FR-006**: Every message MUST pass through our own service before delivery, for scope authorisation, charging, persistence and classification queuing.
- **FR-007**: Clients MUST hold **subscribe-only** credentials scoped to the channels they may read, and MUST NOT be able to publish to the broker directly.
- **FR-008**: The realtime transport MUST be reached through an interface.
- **FR-009**: Chat messages MUST be stored in **their own tables under their own retention policy**, so that separating chat later is mechanical.

**Moderation ordering**

- **FR-010**: A **slur blocklist**, rate limit and length cap MUST run synchronously and MUST refuse before delivery.
- **FR-011**: The blocklist MUST NOT be a general profanity filter.
- **FR-012**: The classifier MUST run **asynchronously**, after delivery, and MUST NOT hold, block or edit any message.

**Embeds**

- **FR-013**: An embed MUST be a **reference** rendered from server-held data, never uploaded content.
- **FR-014**: Embed costs MUST be **10** own squad, **25** opponent's Visible defense, **5** looking-for-guild, **10** Visible-battle replay.
- **FR-015**: **No embed MAY ever contain a Hidden defense, by any route, including via a replay.**
- **FR-016**: Embeds MUST be visually distinct from ordinary messages.

**Guild Ads economy**

- **FR-017**: An active guild MUST receive **2 free ad credits per day**, which MUST NOT accumulate.
- **FR-018**: A guild MUST post at most **4 ads per day regardless of balance**.
- **FR-019**: Guild ads MUST be funded only from guild credits, never from a member's personal shards.
- **FR-020**: A looking-for-guild posting MUST cost **5 shards** of the poster's own.
- **FR-021**: There MUST be **no free posting** in Guild Ads for anyone.

### Key Entities

- **Scope** — a channel with an audience, a write rule and a retention policy.
- **Message** — text, an author, a scope, a timestamp, and optionally one embed.
- **Embed** — a typed reference to a game object, rendered from server data.
- **Ad credit** — a guild's daily, non-accumulating posting allowance.
- **Envoy** — an appointed, revocable helper in Beginner chat with **no powers**.

## Success Criteria *(mandatory)*

- **SC-001**: A client can publish to the broker **zero** times without going through our service.
- **SC-002**: A Hidden defense appears in **zero** embeds, by **zero** routes.
- **SC-003**: A guild can post at most **4** ads in a day, regardless of accumulated funds.
- **SC-004**: The classifier delays **no** message.
- **SC-005**: A blocklisted term is refused **before** any recipient sees it.
- **SC-006**: An Envoy can take **zero** moderation actions and bypasses **no** messaging restriction.
- **SC-007**: Chat retention is enforced per scope, with Direct retained longest.
- **SC-008**: Separating chat onto its own store later requires **no change** to the message model.

## Assumptions

- **Embeds carry no moderation surface**, because nothing in them is authored by a human — they are references to data the server already holds. This is the load-bearing reason they are cheap.
- **Chat is text-only**, which avoids the expensive half of moderation entirely. Custom avatars reintroduce image moderation deliberately, in feature 12.
- **The fee is the rate limit in Guild Ads**, for both sides — so no separate rate-limit rule exists there. A guild speaks for 24 people and gets a budget; a player speaks for themselves and pays for themselves.
- **Looking-for-guild is priced lowest deliberately.** It is posted by whoever has the least, and it is the posting the design most wants to happen.
- **Guild funds are deferred with events**, so the 2 free daily credits are the entire ad economy at 1.0.
- **Beginner chat is the highest-risk room in the game** — a channel of brand-new players is precisely where scams and grooming are aimed. It gets **moderation priority over every other scope**, and DM gating matters there more than anywhere.
- **Presence is the designated cost lever.** Showing an online count makes the transport bill scale with total players rather than with chat use, and it is a screen suggestion rather than a rule.

## Dependencies

**Upstream**: 05 (`auth`), 06 (`roster-and-squads`) for squad embeds, 09
(`matchmaking`) for starter-league membership, 10 (`progression`) for shard
charges, 13 (`guilds`) for guild scope and membership.

**Downstream**: 15 (`moderation`) consumes the classification queue and issues
scoped bans.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority | FR-006, FR-007 — subscribe-only is **correctness**: a direct publisher would bypass the shard charge |
| **XVII** | Storing is not exposing | FR-015 — a Hidden squad exists in the record and may never be embedded |
| **XVIII** | Harm is a gate, taste is a note | FR-011 — a **slur** blocklist, not a profanity filter; over-filtering reads as contempt and is trivially defeated |
| **XIX** | Vendors behind interfaces | FR-008, FR-009 — transport behind an interface, messages in their own tables |
