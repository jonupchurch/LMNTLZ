# Tasks: Chat & Embeds

**Input**: Design documents from `/specs/014-chat/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/chat-api.md](contracts/chat-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § Social models ·
**features 005, 006, 009, 010 and 013 complete**

**Tests**: **Included.** The blocklist-gates / classifier-does-not ordering has been
drawn **backwards twice** by generated diagrams, so it gets a test rather than a
comment.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/chat/`, `apps/api/src/db/schema/chat.ts` (**its own tables**),
`apps/client/src/features/chat/`.

> **Two structural facts.** *The broker only fans out* — clients subscribe and never
> publish, so every message passes through our own service first. **That is
> correctness, not hardening**: some postings cost shards, so a client able to
> publish directly would bypass the charge. And *moderation is two tiers, only one of
> which gates* — a blocklist, rate limit and length cap run **before** send; the
> classifier runs **alongside delivery** and only flags.

---

## The wiring pass — run **before** any code, as 013's was

013 got this pass first and it found five wires its generated list never named,
one of which made joining a guild impossible while every test passed. This is the
same pass over 014, run 2026-07-30 against the code as it actually stands.

**Six wires. Two of them are dependencies on data that does not exist**, which is
a different and worse shape than a seam nobody calls — a test can pass vacuously
against them forever.

| # | The wire | State today | Owner |
|---|---|---|---|
| **W1** | **A language preference** — FR-002 splits Global *and* Guild Ads by it, and T007 revokes a token when it changes | **Does not exist.** No column, no setter, no UI. `profiles/publicProfile.ts` says it outright: *"neither is collected yet"* | **DEFERRED 2026-07-30** — one Global room; the scope key keeps an unused `lang` slot so turning it on is a migration. T047–T048 |
| **W2** | **The Envoy role** — T026 admits Envoys to Beginner, T027 gives them no powers, 015's T023 tests they get 403 | **Does not exist.** `auth/username.ts` reserves the *word* `envoy` and nothing else. No column, no grant route, nobody can become one | **new, T050–T051** |
| **W3** | **Issuing a chat ban** — T007 revokes on ban | `BAN_SCOPES` already contains `'chat'` and `banScope` is **only ever read**, in `auth/accounts.ts`. Nothing writes it | **015 writes the caller**; 014 owns the hook and must say so |
| **W4** | **The client surface** — T028 builds `ChatPanel.tsx` | `App.tsx`'s `Screen` union has no `chat`, and no tab renders it. **Exactly 013's shape** | **new, T052** |
| **W5** | **The guild MOTD announcement** — 013's T039 deferred the *"announce in guild chat"* half to 014 | **Orphaned.** 014's task list and its contract never mention `motd`. Meanwhile the pin half was never built either, so today a MOTD **renders and can never be set by anyone** | **new, T053**, and it closes 013 T039 |
| **W6** | **The broker itself** | `ably` is **not a dependency of any package**, and there is no account. T005's interface is correct and buildable without it; *delivery* is not | **Jon** — a vendor gate |

### Why W1 and W2 are the dangerous ones

A seam with no caller is invisible but *testable* — you can grep for the symbol.
**A dependency on data nothing produces is worse: the tests pass.** `envoys.test.ts`
asserting *"an Envoy gets 403"* is green when no Envoy can exist, because the
fixture cannot make one and the route refuses everybody. That is the fixture-vacuity
trap this project has already hit twice — the starter warning that returned `null`
because the database held zero bots, and the boundary test that selected a raw row
instead of calling the route.

So **W1 and W2 get their data model and their setter before the tasks that consume
them**, and each gets a test that fails when the data is absent rather than passing.

### Not in scope, deliberately

**League-scoped chat stays unbuilt (T010)** — that is a decision, not an omission.
And **presence stays out (T029)**: it is a screen suggestion, and it makes the bill
scale with total players rather than with chat use.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/chat/` and `apps/client/src/features/chat/`, and register `/v1/chat/:scope/messages`, `/v1/chat/token` and `/v1/chat/:scope/history` in `apps/api/src/index.ts`
- [ ] T002 Define the chat schema in **its own file** `apps/api/src/db/schema/chat.ts` — `chat_messages` (scope, author_id, body, embed, created_at), `chat_embeds`, `ad_credits` (guild_id, date, granted, used). **Separate from the outset** (FR-009): it costs nothing now and is what makes a later split mechanical rather than a rewrite
- [ ] T003 [P] Add a `chat` test project to `apps/api/vitest.config.ts`
- [ ] T004 Generate and apply the chat migration from `apps/api/drizzle/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The transport interface and a token type that **cannot express publication**.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

> **Token scoping before message sending.** If clients ever hold a publish-capable
> credential during development, the charge is bypassable and the habit is set.

- [ ] T005 Define `RealtimeBroker` in `apps/api/src/chat/transport.ts` — **publish only, from us**. The interface has **no method that produces a publish credential at any privilege level** (FR-008, Constitution XIX)
- [ ] T006 Implement `mintChatToken(accountId)` in `apps/api/src/chat/tokens.ts` returning a **subscribe-only** token, the exact channel list, and a **60-minute** expiry (FR-007)
- [ ] T007 Implement `revokeChatToken(accountId)` in `apps/api/src/chat/tokens.ts`, and call it **inside the transaction** that changes each of the four inputs — guild membership, starter-league status, language preference, and ban scope. **A revocation issued after the commit is a revocation an early return can skip**
- [ ] T008 Add the per-account control channel in `apps/api/src/chat/tokens.ts` carrying `token-stale` **and nothing else** — no content, so no moderation surface and no cost worth counting
- [ ] T009 Define the six scopes, their audiences and their retention in `apps/api/src/chat/scopes.ts` — Global (split by language) · Guild (≤24, ~30 days) · Direct (**longest, the evidence channel**) · Admin (team only, permanent) · Guild Ads (split by language) · Beginner (starter players **+ Envoys**)
- [ ] T010 **Build no league-scoped chat.** Promotion is one-way and permanent, so a league room would eject a player from their own conversations **as a consequence of gearing up** — turning the currency the game is built on into a social cost (FR-004)

**Checkpoint**: A client holds a credential that cannot publish, and the six scopes exist

---

## Phase 3: User Story 2 - A message is checked before it goes out, and reviewed after (Priority: P1) 🎯 the ordering

**Goal**: An obvious slur never appears; everything else appears immediately and is reviewed behind the scenes.

**Independent Test**: Send a blocklisted term and confirm refusal; send ordinary text and confirm immediate delivery with asynchronous classification.

> **Sequenced first among the P1s.** Getting the ordering wrong makes chat either
> unsafe or unusable, and two generated architecture diagrams drew it backwards.

### Tests for User Story 2 ⚠️

- [ ] T011 [US2] Write `apps/api/tests/chat/ordering.test.ts` — a blocklisted slur is `422`, **not persisted and not published**; a message the classifier would flag is `200`, persisted, published, **then** flagged
- [ ] T012 [US2] Add the assertion that actually proves it, in `apps/api/tests/chat/ordering.test.ts` — **stop the classifier entirely, post a message, and get `200` with send completely unaffected**. If sending degrades when the classifier is down, the classifier is on the send path regardless of what any diagram says (SC-004)
- [ ] T013 [P] [US2] Add the within-path ordering to `apps/api/tests/chat/ordering.test.ts` — a blocklisted message from a player with 5 shards is `422` **with the balance unchanged**. **Blocklist before charge**: a player must not pay for a message that is rejected, and refunding is a second mechanism and a second thing to get wrong

### Implementation for User Story 2

- [ ] T014 [US2] Implement `send` in `apps/api/src/chat/send.ts` in the six recorded steps — authorize scope → **blocklist / rate / length (synchronous, may reject)** → charge → persist → publish → **enqueue for classification (asynchronous, never rejects)** (FR-006, FR-010)
- [ ] T015 [US2] Implement the **slur blocklist, not a general profanity filter**, in `apps/api/src/chat/blocklist.ts` — over-filtering reads as contempt and is trivially defeated (FR-011, Constitution XVIII)
- [ ] T016 [US2] Enqueue for classification **after** publishing in `apps/api/src/chat/send.ts`, with no code path by which the classifier can hold, block or edit a message (FR-012)
- [ ] T017 [US2] Implement the rate limit and length cap synchronously in `apps/api/src/chat/send.ts` (FR-010)

**Checkpoint**: A slur never reaches a recipient, and a classifier outage costs nothing.

---

## Phase 4: User Story 1 - Players talk, and it feels live (Priority: P1)

**Goal**: A message reaches exactly its scope's audience and nobody else.

**Independent Test**: Post in each scope and confirm delivery to exactly the right audience.

### Tests for User Story 1 ⚠️

- [ ] T018 [US1] Write `apps/api/tests/chat/publishCredential.test.ts` — mint a token, connect to the broker, **attempt to publish directly, and fail**. Then the structural check that lasts: `rg -n "mintPublish|publishToken|capability.*publish" apps/api/src` returns **nothing** (SC-001)
- [ ] T019 [P] [US1] Write `apps/api/tests/chat/scopes.test.ts` — each of the six delivers to exactly its audience; a non-member cannot read a guild channel; a graduated player cannot write in Beginner **unless they are an Envoy**; Global and Guild Ads are **split by language**
- [ ] T020 [US1] Write `apps/api/tests/chat/tokenRevocation.test.ts` — joining a guild, leaving one, changing language and being chat-banned each **revoke immediately and push `token-stale`**
- [ ] T021 [P] [US1] Add the hard case to `apps/api/tests/chat/tokenRevocation.test.ts` — a starter player applies, an **officer** accepts a day later, and their token is revoked **within a round trip, not within 60 minutes**. **Assert on the revocation, not on the TTL** — reads never touch our API, so a check-on-publish does not help
- [ ] T022 [P] [US1] Add the call-site check to `apps/api/tests/chat/tokenRevocation.test.ts` — every `revokeChatToken` call is **inside** the transaction that changes its input

### Implementation for User Story 1

- [ ] T023 [US1] Implement `POST /v1/chat/:scope/messages` in `apps/api/src/chat/routes.ts`
- [ ] T024 [US1] Implement `GET /v1/chat/token` in `apps/api/src/chat/routes.ts` returning the subscribe-only credential and its channel list
- [ ] T025 [US1] Implement `GET /v1/chat/:scope/history` in `apps/api/src/chat/routes.ts`, bounded by that scope's retention (FR-005, SC-007)
- [ ] T026 [US1] Admit **starter-league players and Envoys, and nobody else**, to Beginner chat in `apps/api/src/chat/scopes.ts` (FR-003)
- [ ] T027 [US1] Give Envoys **no powers at all** in `apps/api/src/chat/scopes.ts` — they report exactly as any player may, and the role grants **no bypass of DM gating** (SC-006)
- [ ] T028 [P] [US1] Build the chat client in `apps/client/src/features/chat/ChatPanel.tsx`, subscribing to the broker directly and re-minting on `token-stale`
- [ ] T029 [US1] **Leave presence out of the first pass** — it is a screen suggestion, not a rule, and it makes the bill scale with total players rather than with chat use

**Checkpoint**: Chat is live, correctly scoped, and unpublishable from a client.

---

## Phase 5: User Story 3 - A player shares a squad for advice (Priority: P2)

**Goal**: Post a squad or a wall as a readable card rather than typed-out text — and pay for it.

**Independent Test**: Post each embed type, confirm the charge and the rendering, and confirm no Hidden squad can be posted by any route.

### Tests for User Story 3 ⚠️

> **Write the Hidden prohibition as a test over every embed type**, including the
> replay path — a Visible-battle replay is embeddable, and **an ambush replay is the
> legitimate-looking hole**.

- [ ] T030 [US3] Write `apps/api/tests/chat/hiddenEmbed.test.ts` covering **every** route — your own Hidden defense, an opponent's, a **Hidden battle replay**, a hand-crafted request by raw id, guild chat, and a DM to yourself. All `422` (SC-002)
- [ ] T031 [P] [US3] Add the absence assertion to `apps/api/tests/chat/hiddenEmbed.test.ts` — the message posts without the embed or is rejected outright, with **no `[hidden]` placeholder, no redaction marker and no empty embed card**. **A redaction marker is a disclosure**: it tells the reader a Hidden battle exists at that point
- [ ] T032 [P] [US3] Write `apps/api/tests/chat/embedPricing.test.ts` — **5** looking-for-guild, **10** own squad, **10** Visible replay, **25** opponent's Visible wall, and a refusal on insufficient shards

### Implementation for User Story 3

- [ ] T033 [US3] Implement embeds as **typed references resolved server-side at send time** into `{type, id, snapshot}` in `apps/api/src/chat/embeds.ts` — **never uploaded content** (FR-013)
- [ ] T034 [US3] Make the Hidden prohibition **unbypassable by construction** in `apps/api/src/chat/embeds.ts` — server-side resolution means no client can construct an embed of a Hidden defense, by any route (FR-015)
- [ ] T035 [US3] Implement the four embed charges in `apps/api/src/chat/embeds.ts` (FR-014)
- [ ] T036 [P] [US3] Render embeds **visually distinct** from ordinary messages in `apps/client/src/features/chat/Embed.tsx` (FR-016)

> **Embeds carry no moderation surface at all**, because nothing in them is authored
> by a human. That is the load-bearing reason they are cheap — compare avatars,
> which needed a whole pipeline.

**Checkpoint**: A player can ask for advice about a squad, and a Hidden defense is *absent* rather than redacted.

---

## Phase 6: User Story 4 - A guild recruits without anyone paying personally (Priority: P2)

**Goal**: A guild posts from guild credits; a player looking for a guild posts for a small personal fee.

**Independent Test**: Exhaust a guild's daily credits and confirm the hard cap holds regardless of balance.

### Tests for User Story 4 ⚠️

- [ ] T037 [P] [US4] Write `apps/api/tests/chat/adCredits.test.ts` — **2** free credits per active guild per day; a hard cap of **4 per day regardless of balance**; unused credits **do not accumulate** (SC-003)
- [ ] T038 [P] [US4] Write `apps/api/tests/chat/economyBoundary.test.ts` — a player with 10,000 shards posting a guild promotion is **refused, guild funds only**; a guild buying a member a squad posting is **not expressible in the API**

### Implementation for User Story 4

- [ ] T039 [US4] Implement ad credits as a **rate cap, not a balance**, in `apps/api/src/chat/adCredits.ts` — implement the daily cap directly and **never model it as a stockpile that happens to be limited** (FR-017, FR-018)
- [ ] T040 [US4] Fund guild ads **only from guild credits, never from a member's personal shards**, in `apps/api/src/chat/adCredits.ts` (FR-019)
- [ ] T041 [US4] Charge **5 shards** of the poster's own for a looking-for-guild posting in `apps/api/src/chat/embeds.ts` — **the cheapest posting, deliberately**, because it is posted by whoever has the least and it is the posting the design most wants to happen (FR-020)
- [ ] T042 [US4] Make **the fee the rate limit** in Guild Ads, with **no free posting for anyone** and no separate rate-limit rule in that channel (FR-021)

**Checkpoint**: All four stories independently functional.

---

## Phase 6b: WIRING — the six the generated list never named

**Purpose**: the things that make the routes above reachable, and the data they
assume. **W1 and W2 come first inside this phase**, because tasks T009, T019, T020,
T026 and T027 are all written against data that does not exist yet.

### W1 — the language split, **deferred by decision 2026-07-30**

**One Global room and one Guild Ads room at 1.0.** FR-002 splits both by language;
there is no language data anywhere in the game, so satisfying it would mean adding
a column, a route and a profile control to buy a benefit that is invisible until
Global is busy enough to need splitting — and at *that* point the room needs a
**cap** as well, which is already an open question in the Notes below.

**This is a deferral, not a silent drop.** The obligation it carries:

- [ ] T047 **WIRING** Make the scope key carry an **unused `lang` slot from the
  outset** in `apps/api/src/chat/scopes.ts` — `global:<lang>` and `ads:<lang>`,
  resolving to a single constant room today. Turning the split on later becomes a
  **data migration and a default**, not a redesign of every channel name, every
  token and every stored message. Assert in `apps/api/tests/chat/scopes.test.ts`
  that **every Global subscriber lands in exactly one room and it is the same
  one** — the property that makes the single room correct rather than accidental
- [ ] T048 **WIRING** Record the deferral in `apps/api/src/chat/README.md` against
  **FR-002 by name**, with what turning it on costs. An unimplemented `MUST` that
  no document mentions is indistinguishable from one nobody noticed

> **`languages` on the public profile is a different field and stays that way** —
> it is plural, it is a *description* of a player, and it is not collected either.
> A room needs one routing key; a profile can list five. Do not conflate them.

### W2 — the Envoy role (T026, T027, and 015's T023)

- [ ] T050 **WIRING** Add `is_envoy` to `apps/api/src/db/schema/accounts.ts` and a grant path in `apps/api/src/chat/envoys.ts`. **Without this nobody can be an Envoy**, and every test that asserts an Envoy is refused a power passes because the route refuses everybody
- [ ] T051 **WIRING** Prove the role is real in `apps/api/tests/chat/envoys.test.ts` — **grant it, then assert the Envoy reaches Beginner chat after graduating**, which is the one thing the role does. Then assert it grants nothing else. **The positive case is the one that fails when the role is fake**; the negative case is green either way

### W3 — the ban hook, whose caller arrives in 015

- [ ] T052 **WIRING** Export `revokeChatToken` from `apps/api/src/chat/index.ts` as a named seam, and record in `apps/api/src/chat/README.md` that **`banScope` is written by nobody until feature 015** — `BAN_SCOPES` already contains `'chat'` and today it is only ever read, in `auth/accounts.ts`. 015's ban issuer calls this **inside its transaction**; until then the hook is deliberately uncalled and says so

### W4 — the client surface

- [ ] T053 **WIRING** Add `| { readonly kind: 'chat' }` to the `Screen` union in `apps/client/src/App.tsx`, a Chat tab, and render `ChatPanel`. **T028 builds the panel and nothing mounts it** — the same shape as 013, where every guild route worked and no screen reached them

### W5 — the guild MOTD, orphaned between 013 and 014

- [ ] T054 **WIRING** Implement `PUT /v1/guilds/:guildId/motd` in `apps/api/src/guilds/motd.ts`, permission-gated to master and officers by the existing table in `guilds/membership.ts` — which **already lists `motd` as a permission nothing checks**. Then announce the change into Guild chat via `send`. This closes **013 T039**, whose pin half was never built: a MOTD renders in `GuildRoster.tsx` today and **no route on earth can set one**

**Checkpoint**: every route above is reachable by a hand, and no test passes because its subject cannot exist.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T055 **Instrument delivered messages per day, by scope**, in `apps/api/src/chat/transport.ts` — **delivered, not published**. The broker bills `published × subscribers`, and the two diverge by three orders of magnitude on Global
- [ ] T056 Track `global delivered / DAU` as the ratio that predicts the bill, in the ops runbook — **not the total**. Global delivered messages scale **quadratically** in players, and a rising ratio means the room needs a cap
- [ ] T057 [P] Write `apps/api/src/chat/README.md` — the fan-out-only rule, the two-tier moderation ordering, and the standing note that the two economies never meet
- [ ] T058 Run the full quickstart manual pass

---

## Status

**53 tasks, numbered to T058** — 46 generated, **7 added by the wiring pass**
(T047, T048, T050–T054); the four polish tasks moved to T055–T058 to make room.

**T049 is deliberately vacant.** It was the client control for a language
preference, dropped when the language split was deferred on 2026-07-30. The id is
left as a hole rather than closed up, because renumbering would churn every
reference in the file to save a cosmetic gap — and a vacant id somebody can look up
is better than a task that quietly changed meaning. The highest id and the count
are not the same number, for the same reason.
**Nothing implemented yet**; `apps/api/src/chat/`, `apps/client/src/features/chat/`
and `apps/api/src/db/schema/chat.ts` do not exist. Verified 2026-07-30, not assumed:
013's list claimed three tasks 009 had already built.

### Blocked on somebody else

| | |
|---|---|
| **W6 — Ably** | Not a dependency of any package and there is no account. **Jon creates vendor accounts.** T005's `RealtimeBroker` interface is buildable now and everything can be developed and tested against an in-memory broker; only *delivery to a real client* needs the account (Constitution XIX is exactly this shape) |
| **W3 — the ban issuer** | Feature **015**. 014 owns the hook; nothing writes `banScope` until then |
| **The classifier** | Feature **015**. T016 enqueues; the consumer arrives later. T012 asserts send is unaffected when it is **absent**, which is the state it will genuinely be in |

### Read this before starting

- **Prerequisites are real and met**: 005, 006, 009, 010 and 013 are built.
- **T009, T019, T020, T026 and T027 are written against data that does not exist**
  (W1, W2). Do those wiring tasks *first* or those five will pass vacuously.
- **The exact per-scope rate limits are still unsettled** and want real traffic —
  named in the Notes, not a gap to close by guessing.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 005, 006, 009, 010, 013
- **Foundational (Phase 2)**: **the token type — blocks all four stories**
- **US2 (Phase 3)**: Foundational only. **Sequenced first**
- **US1 (Phase 4)**: needs `send` (T014)
- **US3 (Phase 5)**: needs `send` (T014) and feature 010's charge
- **US4 (Phase 6)**: needs feature 013's guild membership
- **Wiring (Phase 6b)**: **W1 and W2 block T009/T019/T020/T026/T027** and should be
  pulled forward ahead of them; W3–W5 depend on `send` (T014)
- **Polish (Phase 7)**: depends on US1 and US3

### User Story Dependencies

- **US2 (P1)**: none
- **US1 (P1)**: US2's send path
- **US3 (P2)**: US1
- **US4 (P2)**: none beyond Phase 2 — **fully parallel with US3**

### Within Each User Story

- Tests written and **failing** before implementation
- **Token scoping before message sending**
- Blocklist **before** charge, inside the send path

### Parallel Opportunities

- **US4's ad credits are fully parallel with US3's embeds** — different modules
- T013 alongside T011/T012's implementation half
- T019, T021, T022 in parallel
- T030, T031, T032 in parallel · T037, T038 in parallel
- T028 (the client panel) alongside all server work, against fixture messages

---

## Parallel Example: User Story 3

```bash
# Three independent assertions, all red first:
Task: "hiddenEmbed.test.ts — six routes, all 422 including the replay"
Task: "hiddenEmbed.test.ts — absence, not a redaction marker"
Task: "embedPricing.test.ts — 5 / 10 / 10 / 25, and refusal at 0"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

Together they are chat: **it is safe, and it is live.** Stop after Phase 4 and
validate — a slur is refused before delivery, a classifier outage changes nothing,
and a client cannot publish.

1. Phase 2: **the token that cannot publish**
2. Phase 3: US2 — **the ordering, as a test**
3. Phase 4: US1 — **STOP and VALIDATE** the direct-publish failure and the
   officer-accepts revocation case
4. Phase 5–6: embeds and the ad economy

### Incremental Delivery

US3's embeds are *the reason chat is in-game rather than on Discord* — a Guild Ads
posting embeds live game state, which is unenforceable anywhere we don't control
rendering. They are P2 by urgency and central to why the feature exists at all.

---

## Notes

- **Global chat does not scale, and the reason is quadratic.** Delivered messages in
  a single global channel scale as `players × players` — **~$270/month at 10k DAU
  and ~$27,000 at 100k**. Capping a room at ~500 concurrent makes it **linear**.
  **Raised, not taken**: it changes a player-facing thing, and the language split is
  already sharding on a key that does not bound room size.
- **`docs/tech-stack.md` names presence as the cost lever and presence is the cheap
  half** — $9/month in connection-minutes at 10k DAU against ~$270 in fan-out.
- **The exact per-scope rate limits are not settled.** The fee makes posting
  *deliberate*; rate limits still do the limiting, and their values want real traffic.
- **Beginner chat is the highest-risk room in the game** — a channel of brand-new
  players is precisely where scams and grooming are aimed. It gets moderation
  priority over every other scope (feature 015).
- Commit after each task or logical group; work goes straight to `main`.
