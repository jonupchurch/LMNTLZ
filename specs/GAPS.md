# The gap register

**Compiled 2026-07-30.** Every gap between what is built and what a player can
reach, with the evidence for each. Reproduce it with
`py tools/gap-audit.py` — the script diffs API routes against client call sites,
verb-aware, and is the source of the route numbers below.

---

## TL;DR

The server is far ahead of the client, and not by accident — **three features were
specified with a complete server half and no client half at all.** 008's user story
is literally *"a player watches a recent battle"* and not one of its tasks builds a
viewer. 010 has **zero** client tasks. 011 has exactly one, and it edits a screen no
task creates.

The result is **16 routes that are built, tested, deployed and unreachable**. Among
them: nobody can accept a guild application, nobody can place a rune, nobody can buy
anything, and nobody can leave the starter league. Every one of those features is
marked complete, and every one of those task lists was closed honestly.

---

## 1 · Routes with no caller — a player cannot reach these

57 routes are defined; the client can request 37 (verb, path) pairs. **23 routes
have no client caller.** Seven are correct — a webhook, a health probe, two cron
targets, three Steam seams built unused by design. The other **16 are gaps**.

| Verb | Route | Owner | What is unreachable |
|---|---|---|---|
| GET | `/catalog` | 011 | **the store does not exist** |
| POST | `/checkout` | 011 | **nothing can be bought** |
| GET | `/me/entitlements` | 011 | a purchase is invisible to the player |
| POST | `/heroes/:id/runes/:slot` | 010 | **runes cannot be placed** |
| GET | `/replays/:id` | 008 | **no replay can be watched** |
| GET | `/guilds/:id/applications` | 013 | an officer cannot see who applied |
| POST | `/applications/:id/accept` | 013 | **an application can never be accepted** |
| POST | `/applications/:id/dismiss` | 013 | nor declined |
| POST | `/guilds/:id/invites` | 013 | an invitation cannot be sent |
| PUT | `/guilds/:id/pitch` | 013 | a guild cannot edit its recruiting pitch |
| GET | `/guilds/:id` | 013 | a guild has no page of its own |
| POST | `/me/starter/exit` | 009 | **the starter league cannot be left** |
| GET | `/matchmaking/config` | 009 | ambush odds and thresholds are never shown |
| GET | `/me/battles` | 008/012 | *redundant — the profile payload carries it* |
| GET | `/me` | 005 | *redundant — session bootstrap does not need it* |
| GET | `/invites` | 013 | *redundant — `/me/guild` carries invites* |

The last three are **dead routes, not player-facing gaps** — the data reaches the
screen another way. They are listed so the count reconciles, and they want deleting
rather than wiring.

> ### Guild recruitment is one-directional, and that is the sharpest one
>
> A player can browse guilds, apply, view their applications and withdraw. **An
> officer has no way to see an application, accept it, or decline it**, and no way
> to send an invitation. `POST /applications/:id/accept` is implemented, authorised
> (`Officers and above only.`) and tested. Nothing calls it.
>
> Applications expire after seven days, so today every application is submitted,
> ignored by a system that cannot show it to anyone, and swept.

## 2 · The cause — three features were specified server-only

This is not sixteen unrelated oversights. It is one decomposition failure repeated:

| Feature | Its user story | Client tasks written |
|---|---|---|
| **008 replays** | *"A player watches a recent battle"* (US2, P1) | **0** |
| **010 progression** | rune placement, the shard economy | **0** |
| **011 payments** | *"A player buys a pass"* | **1** — and it edits `features/store/Checkout`, which **no task creates** |

Every task under 008's US2 is a server test or a server route. The story is written
in player language and its task list cannot satisfy it. All were closed honestly,
because each task was genuinely done.

**This is the fourth shape of the same defect this project has recorded** — after a
component nothing renders, a route nothing calls, and a seam nothing installs. The
new one is: **a user story whose own tasks cannot deliver it.** The wiring rule in
`.specify/templates/tasks-template.md` catches the first three. It does not catch
this, because there is nothing to wire *to* — the caller was never specified.

## 3 · Vendor and installer gaps

- **⛔ There is no payment provider.** `apps/api/src/payments/vendor/` contains only
  `mailer.ts`. `PaymentRail` is defined, `setRail()` exists and is called **by tests
  only**; there is no `installRail()` and no adapter. `POST /checkout` in production
  would raise `NoRailError`. Paddle is verified and the account is ready — the code
  is what is missing (011 T031).
- ✅ `installRuneSource()` and `installMailer()` **are** called at startup in
  `apps/api/src/index.ts`. Those two seams are correctly wired.
- `setBroker` (014) and `setClassifier` (015) have no caller, which is **expected** —
  both features are mid-build.

## 4 · Nothing is scheduled

**There is no `vercel.json` anywhere in the repository and no cron configuration of
any kind.** Three jobs need one, and all three fail silently rather than loudly:

| Job | Consequence today | Owner |
|---|---|---|
| Replay cleanup | blob storage grows without bound | 008 T029 → 016 T034 |
| Guild application expiry | resolved lazily on read; unread means unresolved | 013 → 016 T037 |
| Guild succession completion | same | 013 → 016 T037 |

**016 T034 and T037 own this and are specified.** It is a gap in the build, not in
the plan.

## 5 · Designed screens with no implementation

From 017's inventory. Five exports have no client surface:

| Export | Owner | State |
|---|---|---|
| **Rune Forge** | 010 | ⛔ **no task anywhere in any feature builds it** |
| Codex | — | ✅ now owned by **017 US5** |
| Chat | 014 | specified, mid-build |
| News · Broadcast Messages | 016 | specified, unbuilt |
| *(THE COURT)* | — | ⛔ **a rail entry with no design at all** |

## 6 · Features not yet built

| Feature | Open / total |
|---|---|
| 014 chat | 42 / 53 |
| 015 moderation | 53 / 53 |
| 016 ops-admin | 47 / 47 |

**162 open tasks in total**, of which 142 are these three. 001–007 are fully closed.

## 7 · Stragglers in the closed features

| Task | Why it is open |
|---|---|
| 008 T029 | blocked on 016's cron |
| 008 T039 | partial — the load-bearing half is automated |
| 009 T047 | **~130 bot squads**, deferred authoring |
| 010 T054, T056 | ops runbook query; manual pass |
| 011 T026, T031, T042, T044 | the provider, the descriptor, the screens, the manual pass |
| 012 T021 | guild export — blocked on parked event design |
| 012 T028–T034 | custom avatars — blocked on 016's review queue |
| 013 T007 | ambient-clock lint, extended to every timer |
| 013 T039 | `/motd` — needs 014's chat half |
| 013 T056 | manual pass |

---

## What was unowned — closed 2026-07-30

Every gap above now has a home. The decomposition was added the same day the audit
ran, before any further development, so nothing here is waiting on a decision.

| Gap | Now owned by |
|---|---|
| Replay viewer · Rune Forge · store + checkout | **[018 US3 · US1 · US2](018-client-halves/spec.md)** — three screens over shipped backends |
| Officer half of 013 — applicants, accept, dismiss, invites, pitch, guild page | **[013 Phase 8](013-guilds/tasks.md)** (T071–T079) |
| Starter-league exit · matchmaking config readout | **[009 Phase 9](009-matchmaking/tasks.md)** (T058–T063) |
| Dead routes `/invites`, `/me` | 013 T079 · 009 T063 — **delete, don't wire** |
| Dead route `/me/battles` | 018 US3 decides: the viewer either uses it or it goes |
| Payment provider adapter | **011 T031** — unchanged, and the real blocker on revenue |
| Cron for all three jobs | **016 T034 / T037** — unchanged |
| Codex | **017 US5** |

**008, 010 and 011 now carry a warning at the top of their task lists** saying which
of their user stories their own tasks cannot deliver, and where the work went. A
fully-checked list should not read as a delivered feature.

## Still genuinely open

**⛔ The store has no design, and it is the only screen that takes money.** Twenty
exports and not one is a store, shop, checkout or pricing screen. 018 US2 specifies
its **behaviour** completely; its appearance has nothing to port from. *Being
designed as of 2026-07-30.*

`DISPATCHES` is the one rail entry with no home — 016's news, unbuilt but specified.

> ### ~~THE COURT has no design~~ — withdrawn 2026-07-30
>
> **It is a rail section, not a missing screen, and everything under it exists.**
> Each export marks exactly one rail entry active with a gold icon (`#F2C744`);
> reading that state across the library settles it — `THE COURT` is active on
> **Profile, Battle Record, Guild Roster and Guild Admin**, the Chat export is
> titled *"THE COURT · CHAT"*, and Guild Creation's button reads *"FOUND THE
> COURT"*.
>
> **The Court is the game's word for the social half, and a guild is a court.**
> *Court-Champion* is a rank inside that vocabulary. Nothing needs designing and
> nothing needs building — the rail gains a group over screens 017 already ports.
>
> Recorded rather than quietly deleted: the first reading took *Court-Champion*
> beside a rating as evidence the Court was a **standings** screen. It was a rank,
> the same word used two ways. **The active-state colour was the evidence that
> settled it, and it was in every export the whole time.**

## Reading order

`specs/README.md` for the feature index · `specs/017-design-port/spec.md` for the
component layer these screens are built on · `specs/018-client-halves/spec.md` for
the three screens · this file for what is missing and why.
