# `guilds` — feature 013

**TL;DR for someone who has not read the spec.** A guild is up to 24 players with
one leader, up to three deputies, and everyone else. You pay 650 shards to make
one and the name can never be changed. You can apply to five at once; the first
guild to say yes takes you and the rest close themselves. If a leader stops
playing for two weeks a deputy can ask to take over, the leader gets a week, and
**simply opening the game cancels it**.

There are no Wings, no events and no guild funds. That is deliberate — see below.

---

## The one constraint the feature rests on

`UNIQUE (account_id)` on `guild_members`, **on the account alone**.

Two guilds can accept the same applicant at the same instant from two connections.
Exactly one must win, and the mechanism is not a lock anybody takes — it is that
constraint, with the winner being whoever's `INSERT` lands first. The loser catches
`23505` and answers `409 { reason: 'already-joined', guildId }`, so the officer
whose click lost reads *"Reyna joined The Long Reach a moment ago"* rather than a
server error.

| Lock on | Why not |
|---|---|
| the **guild** row | serialises two *different* guilds accepting two *different* applicants — contention bought for nothing |
| the **application** row | two guilds accepting two *different* applications from the same player touch different rows, conflict on nothing, and produce **two memberships** |
| the **membership** row ✓ | the invariant is *"an account belongs to at most one guild"*, and it lives on the applicant |

**Lock what the invariant is about.**

Two things about this that are not obvious:

- **Drizzle wraps the driver error.** `error.code` on what you catch is `undefined`;
  the `23505` is on `cause`. A top-level-only check compiles, reads correctly, and
  turns every losing acceptance into a 500.
- **The withdrawal must be in the same transaction as the membership.** Two steps
  leave a window in which the player is in a guild *and* has open applications, and
  a second acceptance inside it is a second membership. That window is too small to
  fail a test reliably — mutating it out left all 18 behavioural tests green — so it
  is asserted **structurally**, by brace-matching the transaction block in
  `firstAcceptance.test.ts`.

## The clock is injected, and banned by lint

Succession spans **21 days across two timers**, which cannot be tested by waiting.
`clock.ts` is the only file here allowed to read the wall clock, and
`eslint.config.js` makes `Date.now()` and argument-less `new Date()` errors
anywhere under `src/guilds`. The rule object is shared with `packages/sim/rules`,
which forbids the same two calls because a clock read breaks replay determinism —
**one configuration, two motivations**.

> ⚠️ **The rest of the API is not under this ban.** Measured: **45 ambient clock
> calls across 24 files in 8 features** — token rotation, battle expiry, replay
> retention, the daily curve. Adding a path to the array in `eslint.config.js` is
> the whole change when somebody takes it on.

## Succession: two clocks, deliberately different

```
master inactive 14 days   →  an officer MAY ask
               +  7 days  →  it completes, unless the master signs in
```

*Availability* is measured in **gameplay** (`player_ratings.last_activity_at`).
*Lapsing* is measured in **presence** (signing in). So it is **hard to start and
easy to stop**, which is the correct bias: a dead guild nobody can fix is bad, and
somebody losing their guild while on holiday is worse.

**The email carries no link, and that is a security property.** There is nothing to
click, so there is nothing to phish — *"confirm you are still here"* would be the
most impersonatable message this game could send.

**The 650 is checked twice**, at the request and again at completion. Without the
second check the transfer would credit the former master from an account that no
longer has it, minting shards.

`noteSignedIn()` is called from **`auth/routes.ts`**, not from anything here. An
absent master hits no guilds route by definition, so a lapse living only in this
module is a function the one person it protects never triggers.

## ⛔ Two schedules with no scheduler

Neither the 7-day application/invitation expiry nor succession completion has a
registered cron. **016 owns schedules**, and 008's replay cleanup has been waiting
on it since feature 008. Rather than pretend otherwise:

| | mitigation |
|---|---|
| `expireOverdue()` | also runs on the read path (`apply`, `GET /me/guild`, the review queue) |
| `resolveDue()` | also runs on `GET /me/guild` |
| both | exposed as `POST /v1/jobs/guild-*` for 016 to point at |

Succession's lazy resolve matters most: *"the job never ran"* would mean a guild
frozen forever, which is the exact failure the story exists to prevent.

## What is deliberately absent

- **Wings, events, guild funds.** A Wing exists *only* for an event, so deferring
  events defers Wings — they are not separable. `boundary.test.ts` fails if the
  words appear in this directory. A "harmless" Wing column now is a structure with
  no rules attached, and it will acquire wrong ones.
- **A guild tag.** Three characters cannot be read in context, and compression is
  exactly what defeats a blocklist.
- **A player-search route.** `GET /v1/players?q=` would be a prefix-enumerable index
  of every account in the game. The username lookup lives inside the invite action
  and matches one exact folded name. `directory.test.ts` fails if a `LIKE` over
  `accounts` appears anywhere here.
- **Emblem review.** An emblem is three indices into a palette vetted at authoring
  time — all 5,184 combinations. **Composition is what removes the review, not a
  relaxed policy**; an avatar is an *upload* and is still pre-moderated (012). The
  **name** and **pitch** are text and do go through 015.
- **Any caller of `guildActive()`.** It answers the question; nothing dissolves a
  guild for inactivity. A destructive sweep with no undo wants a real population and
  a warning email first.
- **`forcedRename()` has no caller.** Feature 015 owns moderation. Recorded here
  rather than discovered later — the same shape as 009's `guildJoined`, which sat
  uncalled for four features.

## The directory was not in the contract

`contracts/guilds-api.md` specifies `POST /v1/guilds/:guildId/applications` and no
way on earth to learn a `guildId`. Every route worked and the feature was unusable.
`directory.ts` is the fix.

**Its ordering is a decision, not a default.** Not by member count: the biggest
guild would be seen most, so it fills first, so it stays biggest — *"nobody can
out-roster anybody"* losing at the recruiting layer instead of the roster one. It is
**room-first, newest-first**, so an hour-old guild is on page one and a full one
sinks without vanishing from a name search.

## Files

| | |
|---|---|
| `clock.ts` | `Clock`, `fixedClock`, `movableClock` — the only wall-clock read |
| `config.ts` | every number, `env`-overridable; stored expiries mean changes cannot move a live timer |
| `membership.ts` | roles, the permission grid as data, capacity, kick/leave/dissolve |
| `applications.ts` | first-acceptance-wins, the 5-budget, expiry, the 24h cooldown |
| `invites.ts` | immediate acceptance, one open offer per guild (partial unique index) |
| `found.ts` | the 650 charge and creation as one transaction; emblem and pitch |
| `directory.ts` | browse, search, and the exact-name lookup for invites |
| `succession.ts` | the two timers, the transfer, `noteSignedIn` |
| `activity.ts` | the newborn grace as part of the definition, not an exception |
| `notify.ts` | a one-line adapter over 011's installed `Mailer` — not a second sender |
| `routes.ts` | permissions enforced here, never by hiding a control |
