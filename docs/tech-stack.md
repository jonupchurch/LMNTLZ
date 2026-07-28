# LMNTLZ — Tech Stack Decision Record

**Status: settled 2026-07-26.** Every entry below was approved deliberately.
The *why* is recorded alongside the *what*, because the reasoning is what stops
a decision being quietly reversed later by someone who only sees the outcome.

---

## The stack

| Layer | Choice |
|---|---|
| Language | TypeScript throughout |
| Monorepo | pnpm workspaces + Turborepo |
| Client | Vite + React + Tailwind CSS — static SPA |
| Desktop shell | Electron + `steamworks.js` |
| API | Hono on Vercel Functions, versioned JSON REST |
| Database | Neon Postgres + Drizzle |
| Battle state | *None* — re-derived from the action log |
| Maintenance flag | Vercel Edge Config |
| Auth | Owned in-house: Google ID tokens + Steam session tickets → own JWTs |

## Layout

```
lmntlz/
├── packages/
│   ├── sim/       rules (shared) + resolver (server only)
│   └── content/   heroes, powers, matchups, reach — Zod-validated
└── apps/
    ├── client/    Vite React SPA → static bundle
    ├── desktop/   Electron shell → wraps the client, Steam integration
    └── api/       Vercel Functions → imports sim
```

`packages/sim` splits along a load-bearing seam:

- **Rules** — pure, no RNG. Reach and targeting legality, type effectiveness,
  cooldowns, turn order, the damage *formula*. Runs on **both** client and
  server; this is what lets the client draw the targeting UI and the
  "super effective" preview.
- **Resolver** — consumes RNG. Hit/miss, crits, status application, the defense
  AI's choices. **Server only.** The seed never leaves the server.

---

## Decisions that carry weight

### Gameplay is server-authoritative

The client sends an intent — `{battleId, heroId, powerId, targetId}` — and the
server resolves it and returns what happened. The client renders what it is
told and never decides an outcome.

The alternative considered was replay validation: let the client compute the
battle and have the server verify the result. It was rejected because the
client would need the RNG seed to run the battle, and a client holding the seed
can read every future roll — which attacks will crit, which will miss, what the
AI is about to do. That's unpatchable while the seed is client-side. Server
authority means the exploit does not exist rather than being caught after
the fact.

**Cost:** the game cannot be played offline. Acceptable — asynchronous PvP
against other players' defense squads needs the server regardless. It should be
stated on the Steam store page.

**Latency** is hidden behind animation: fire the request on click, play the
wind-up immediately, and the response lands well before the impact frame. Never
block the animation on the response.

The server resolves the player's action **and everything following it** — enemy
turns, status ticks — up to the next point the player actually chooses
something, returning it as one packet. That keeps a battle at roughly 20–40
requests rather than hundreds.

### In-progress battle state is not stored

Only the append-only action log is written. Each request replays it through the
deterministic resolver to rebuild current state, applies the new action, and
appends.

This was chosen over Redis or a state column because both would mean two
sources of truth that must agree. Here there is one, and state cannot desync
from the log because state *is* the log. No TTL, no cache invalidation, no
cleanup service, and discarding a battle is simply never finishing it.

Replay cost is roughly O(n) per action — a few hundred sim steps, single-digit
milliseconds. **Revisit if battle length grows substantially**; that is the one
condition under which this decision stops being correct.

### Replays are stored JSON, never re-simulated

The server already produces a turn packet per resolution to run the live
battle. A replay is those packets concatenated, so recording it costs a write
rather than a design.

The tempting alternative — store `{seed, actions[]}` and regenerate the replay
by re-running the sim — breaks the first time balance is patched. An old battle
re-run through a newer sim produces different numbers, so you would show a
player a battle they won ending in a loss. Recording what happened sidesteps
that permanently: a replay from launch day still plays exactly as it played.

Store `{seed, actions[], engineVersion, contentVersion}` alongside it anyway —
cheap, and it lets a battle be re-derived when investigating a bug without the
replay itself depending on that path.

### Two version stamps, not one

Every battle record carries **`engineVersion`** (the rules — resolution order,
how reach is counted, status stacking) and **`contentVersion`** (the numbers —
hero stats, power values, reach assignments), plus the git SHA from
`VERCEL_GIT_COMMIT_SHA`.

They change at completely different rates, and merging them destroys the
diagnostic value: "is this a logic bug or a tuning consequence?" is exactly the
question you will be asking, and one merged version cannot answer it.

The stamp exists to answer *which code produced this*, not to re-execute it —
git already archives every historical engine. **It cannot be backfilled**, so it
ships with the first battle ever recorded.

### Maintenance is scheduled, and drains first

Deploys happen in scheduled windows, so a battle is never resolved by two
different engine versions. Three states in Edge Config:

| State | New battles | In-flight battles |
|---|---|---|
| `live` | accepted | resolve normally |
| `draining` | rejected | allowed to finish |
| `down` | rejected | discarded |

Draining for ~15 minutes before the window lets nearly every in-flight battle
finish on its own, so almost nothing is discarded.

**A discarded battle must be a complete no-op**: no rating change either side,
no rewards, and a refund of whatever it cost to start. A discarded battle that
still consumed the attempt reads as the game stealing from the player, and will
be the first support ticket after every window.

Keep the `engineVersion` mismatch check anyway. Under this policy it should
never fire — which is what makes it useful. If it ever does, something genuinely
went wrong (emergency hotfix, rollback, accidental push) rather than being
routine noise.

### The API is versioned because the client can be stale

Unlike a web app, a Steam client is a downloaded artifact and players do not
always update promptly. Endpoints are versioned (`/v1/...`) so a client one
release behind is served correctly instead of failing confusingly.

This is also why tRPC was rejected despite fitting an all-TypeScript monorepo
well: it assumes client and server move together, which a shipped desktop
client does not guarantee.

### Auth is owned rather than bought

Three facts drove this:

1. **Steam is custom work regardless.** In the Steam build there is no browser
   redirect — the client calls `GetAuthSessionTicket()` locally and posts the
   ticket for verification against Steam's Web API. That is not an OAuth flow,
   so no auth provider has a slot for it.
2. **There are no passwords.** No hashing, no reset flows, no email
   verification — Google and Steam both hand over a verified identity. Most of
   what makes auth dangerous to build is simply absent.
3. **Per-MAU pricing scales badly for games.** Auth vendors price for SaaS,
   where a user is worth a lot. A game wants large player counts at low ARPU,
   so the bill grows with exactly the success you want.

Shape:

```
POST /v1/auth/google  → verify ID token against Google's JWKS
POST /v1/auth/steam   → verify session ticket via Steam Web API
        both          → upsert user, issue signed JWT
                        refresh token stored in Postgres
```

One account may carry **both** identities — the same player may arrive via
Steam on desktop and Google in a browser — so account linking is a first-class
requirement, not a later feature.

**What this does not mean:** no hand-written cryptography. Google ID tokens are
verified with a vetted JWT library against Google's published JWKS; tokens are
issued with `jose`. What is genuinely owned is token rotation, revocation, and
any admin tooling for suspending accounts.

---

## Security

**In transit and at rest — automatic on this stack:** Vercel terminates TLS 1.3
on every request with managed certificates. Neon encrypts at rest with AES-256.
Vercel environment variables are encrypted. Add HSTS to prevent downgrade.

**Two things that require discipline rather than a setting:**

1. **Nothing shipped in the Electron client is secret.** An `.asar` archive is
   packaging, not encryption, and is trivially extracted. No API keys, no
   service credentials, no signing secrets in the client bundle, ever. Anything
   the client needs to reach the API is a **per-user token issued at sign-in**,
   never a shared secret baked into the build.
2. **TLS does not protect you from the player.** A player controls their own
   machine and can install a root CA to proxy their own traffic in minutes.
   Encryption defends against third parties — public wifi, network snooping —
   and protects the player's own data. What defends against a *cheating player*
   is the server-authoritative design above. "It's encrypted" is a common source
   of false confidence in exactly this situation.

Certificate pinning in the Electron build is available and raises the bar
against casual self-proxying. It is a speed bump rather than a wall and adds
real friction when rotating certificates — **skipped initially**, revisit if
traffic inspection shows up in cheating reports.

---

## Replay storage and retention — **decided 2026-07-28**

> **Battle *metadata* lives in Postgres forever. Battle *event logs* live in
> object storage and expire.**

**Storing every replay in Postgres indefinitely does not survive contact with the
volume.** Battles run at roughly **DAU × 20 a day**, and a 6v6 log over ~102
hero-turns is about **5 KB compressed**:

| | Battles/day | Replay data/day | One year |
|---|---|---|---|
| 10k DAU | 200,000 | 1 GB | **365 GB** |
| 100k DAU | 2,000,000 | 10 GB | **3.65 TB** |

At Neon's ~$0.35/GB-month that is **$128/month at 10k DAU after a year and $1,278
at 100k** — and it never stops growing, because nothing in the design ever deletes
one.

### Split the row from the log

**They are different objects with different access patterns**, and putting them in
one place costs 23× more than putting them in two:

| | Where | Size | Kept |
|---|---|---|---|
| **Metadata** — participants, date, zone, outcome, rating change, shards | **Postgres** | ~200 B | **forever** |
| **Event log** — the replay itself | **object storage** (R2 / S3 / Vercel Blob) | ~5 KB | **7 days** |

A replay is **written once, read rarely, and never queried** — which is the
definition of a blob, not a relation. Object storage is ~**$0.015/GB-month**
against Postgres's ~$0.35.

**Retention is what actually collapses the number**, and at **7 days** it
collapses it to nothing. The steady state is 7× the daily rate rather than an
ever-growing pile:

| | Steady-state replay data | Cost |
|---|---|---|
| 10k DAU | **7 GB** | **~$0.10/month** |
| 100k DAU | **70 GB** | **~$1.05/month** |

> **At this retention the storage tier barely matters** — 70 GB sits at ~$25/month
> even in Postgres. **The retention decision dominates the architecture decision**,
> and it is worth being honest that the split above is now about keeping the
> database small and fast rather than about saving money.

The cost stops being a function of *how long we have run* and becomes a function
of *how many people play*, which is the shape every other cost in this design
already has.

### A reported battle is preserved past expiry

**Seven days is shorter than a dispute.** A cheating report or a contested ban can
arrive on day 3 and still be under appeal on day 12, by which point the evidence
would be gone — so **any battle attached to a report is retained** until the
report is closed, and for a stated period afterwards.

> **This is one rule and it removes the only real objection to a short window.**
> Without it, the correct retention would be set by the slowest appeal rather than
> by what players actually watch — which is how a 7-day window becomes a 90-day
> one for no gameplay benefit at all.

> **Nothing breaks when a log expires.** The outcome, the rating change and the
> streak are all in the metadata row, which is permanent. `Replays are stored JSON
> event logs, never re-simulated` is a guarantee about **never recomputing a past
> result** — and the result is exactly the part that is kept forever. Only the
> *viewing* of a battle has a shelf life.

**Thirty days also covers the disputes**, which is the other reason to hold a log
at all: a cheating report or a contested ban arrives within days, not months.

### The client shows the last 50

**A player's battle list is capped at 50** — at ~20 battles a day that is two and a
half days, which is the window anyone actually reviews. The **last 20 Visible
battles** shown on a public profile is a separate, narrower rule
(`../resources/mechanics/11-social.md`) and reads from metadata alone.

> **The list is metadata, so it long outlives the replays.** A player can see
> *that* they fought and *what happened* for as far back as we keep rows; they can
> **watch** only what is still inside the 30-day window. Those are different
> promises and the UI should not blur them — an entry whose log has expired should
> say so rather than failing to open.

---

## Transactional email — **added 2026-07-28**

**A managed sender — Resend or equivalent — behind an interface**, same shape as
the realtime transport. It was not in the stack until guild succession needed it
(`../resources/mechanics/08-guilds.md`): notifying an absent guild master is not
something an in-app message can do, because the whole premise is that they are
not opening the app.

**Once it exists, three other things want it**, all of which are currently
hand-waved as "the player is told":

- **Moderation outcomes** — a ban or a forced rename, where the point is reaching
  someone who may not log in again.
- **Avatar review outcomes** — approved, or rejected with a free resubmit.
- **Guild succession**, the case that forced it.

**The volume is trivial and so is the cost.** Succession runs roughly **4 a day at
100k DAU**; moderation and avatar notices add a few thousand a month at that
scale. That is inside the ~$20/month tier of any managed sender — worth stating
plainly given how much else in this design was sized against recurring cost.

### Templated by default, AI-assisted where context varies

**A succession notice is the same message every time and should be a template** —
auditable, translatable, and incapable of inventing a fact. **AI is useful where
the content genuinely differs**, principally moderation notices, and it operates
under the rule that governs it everywhere else: **it drafts; a human sends.**
Email is outward-facing and irreversible, and it speaks in our voice.

> **The succession email needs no clickable action, and that is worth preserving.**
> The master responds by **logging in** — presence *is* the reply. So the message
> can contain no link that grants anything, which makes it structurally resistant
> to the phishing lookalike that *"click here to keep your guild"* would invite.
> **Any future transactional mail should be held to the same test:** if it needs a
> link that does something, ask whether the in-app path would do instead.

**Deliverability is the part that fails silently.** SPF, DKIM and DMARC on the
sending domain, set up once, before the first real notice goes out rather than
after someone reports never receiving one.

---

## Deliberately not used

| Rejected | Why |
|---|---|
| Next.js | Steam requires a static bundle, so its server half is unusable. Nothing left that Vite doesn't do better here. |
| Tauri | Uses each OS's own webview — Chromium on Windows, **Safari's WKWebView on macOS**, WebKitGTK on Linux. Three engines to test for an animation-heavy UI. Electron ships one Chromium everywhere, and 150MB is irrelevant on Steam. |
| tRPC | Assumes client and server move in lockstep; a shipped Steam client can be stale. |
| Redis / a state store | Would create a second source of truth alongside the action log. See above. |
| An auth provider | Steam is custom regardless, there are no passwords, and MAU pricing scales badly for games. |
| Replay validation | Requires the client to hold the RNG seed, leaking every future roll. |
| **A standalone installer** | The only artifact that needs a code-signing certificate, and the one with the smallest audience. See *No standalone installer* below. |
| **.NET MAUI** | Would rewrite the client in C#/XAML, has no web target, discards the design system — and **duplicates `packages/sim`'s rules in a second language**. Does not solve signing either; MSIX requires it. See below. |

---

## Asset storage

**Binary art lives in plain git.** No Git LFS, no object storage. Decided
2026-07-26 with the tradeoff understood: git cannot delta-compress PNGs, so
each re-render of the roster adds a full copy to history (~65 MB per pass at
current portrait sizes).

This is comfortable at present scale and keeps the toolchain free of LFS.
If history growth ever becomes a problem, the fix is `git lfs migrate import`
plus a force-push — cheap while the clone count is low, disruptive once it
isn't. Worth revisiting *before* adding collaborators rather than after.

---

## Platform target

**Desktop only.** The static build in a desktop browser at 1.0, and the same
bundle wrapped in Electron on Steam afterwards — **those two channels and no
others.** Mouse and keyboard, minimum window **1280×720**, designed for
**1600×900**, graceful to ultrawide.

No mobile, no tablet, no touch, no Steam Deck / gamepad target. Design prompts
in `resources/` were updated to match; touch-target guidance is replaced with
mandatory keyboard focus rings.

> **Steam ships after 1.0 — decided 2026-07-28.** 1.0 is the browser build,
> selling direct. The Steam target is unchanged and
> still primary; it is only later, because the Steam launch window is a one-shot
> marketing asset and is worth spending on a finished game
> (`../resources/mechanics/06-progression.md`, *Steam ships after 1.0*).
>
> **Every Steam seam is built at 1.0 even though none of it runs.** Identity is
> provider-agnostic (username is the identity, providers link to it),
> entitlements are account-level rather than per-storefront, payment sits behind
> a rail interface, and **`steamworks.js` stays isolated in `apps/desktop/`
> behind a capability check** so the browser build never imports it. All four
> cost nothing now and are expensive to retrofit.

### Shipping order — **confirmed 2026-07-28**

> **Step 1 — the web version.** Static bundle, direct sales, no binary anywhere.
> **Step 2 — the Steam version.** Same bundle in Electron, once the game is worth
> the launch window.
> **Then decide.** Any further channel is a decision made *from a position of
> traction*, not now.

The third step is deliberately unnamed. A standalone installer, macOS, a
storefront besides Steam — each is a real option and none of them is worth
pricing against a player base that does not exist yet. What the two committed
steps buy is that **none of those decisions get harder by being deferred**: the
seams below are built at step 1 regardless.

### No standalone installer — **decided 2026-07-28**

> **1.0 is the browser build alone. Electron appears only when Steam does.**

**Code signing is the whole reason, and it lands on exactly one artifact.**

| Channel | Needs a certificate? |
|---|---|
| Browser build | **No** — there is no binary |
| Steam | **No** — Valve does not require signed builds, and Steam's own client delivers the files |
| **Standalone installer from our site** | **Yes** — unsigned, Windows SmartScreen shows *"Windows protected your PC"* to every first-time user |

Since the CA/Browser Forum moved private keys onto hardware in June 2023, an OV
certificate runs roughly **$200–400/year** and EV **$300–600/year**, plus a token;
macOS notarization is a separate **$99/year** Apple Developer membership. The
cheap modern path is **Azure Trusted Signing at ~$10/month**, which is open to
individuals — so this is a **~$120/year** door rather than a closed one.

**But the standalone is the artifact worth least.** A player who wants a desktop
app and is not on Steam is a narrow slice, and against the browser build the
wrapper adds almost nothing: the game is **server-authoritative**, so it cannot
work offline; it needs no filesystem access; and the rendering is identical
Chromium either way. What it does add is a second build target, an auto-update
feed to host, and the certificate.

**Dropping it makes 1.0 markedly smaller** — a static Vite bundle on a CDN plus
the Hono API, with no Electron, no packaging pipeline and no signing at all. It
is reversible for ~$120/year the moment there is demand for it.

### Why not MAUI (or any non-TypeScript client)

Raised and rejected 2026-07-28. **It does not solve the problem it would be
adopted for, and it breaks the architecture's best property.**

- **It does not fix signing.** A MAUI Windows app ships as MSIX, which *requires*
  a signature — strictly worse than Electron, which merely benefits from one.
- **It has no web target.** MAUI is a native UI framework; Blazor is the .NET web
  story, and it is a different framework. Choosing MAUI means giving up the
  browser build — which is the entire 1.0 channel.
- **It discards the design system.** Everything in `resources/designsystem/` is
  HTML and CSS.
- **It would duplicate `packages/sim`.** This is the disqualifying one. The sim
  splits into *rules* — pure, shared, no RNG — and *resolver*, server-only. **The
  client runs the same rules the server does**, which is what lets it project a
  turn queue and preview damage without the server agreeing to anything. A C#
  client means **two implementations of the combat math that must agree
  exactly**, forever, in a game whose entire loop is reading numbers off a
  screen. One TypeScript rules engine shared by both sides is the single best
  structural decision in this document; nothing is worth trading it for.

---

## Still open

- **Steam auth end-to-end has not been prototyped.** Ticket verification is
  documented and well-trodden, but it is the piece with the least certainty and
  is worth spiking before it sits on the critical path. **No longer near it** —
  Steam is a fast-follow to 1.0, so this is a spike to schedule rather than a
  risk to retire now. What 1.0 must get right is the *seam*, not the integration.
- **Vercel invocation cost at scale.** 20–40 function calls per battle scales
  with engagement rather than user count. Worth modelling before launch, not
  after.
- **Admin/moderation tooling** is now owned rather than provided. Nothing needed
  on day one, but banning a cheater has to be possible before the ladder means
  anything.
- **Chat needs a realtime transport this stack does not have.** Everything
  settled above is request/response — versioned JSON REST over Hono on Vercel —
  and that was a sound call *for gameplay*, because PvP is asynchronous and a
  battle turn is a request. Chat is not asynchronous. The generated Chat screen
  assumes live message delivery, presence (`1 482 wardens online`), per-member
  status (`In battle · round 4`) and typing indicators, none of which REST
  provides.

  This is a genuine gap rather than an oversight: Vercel's serverless functions
  cannot hold an open WebSocket, so the answer is either a managed realtime
  service, a separate long-lived process outside Vercel, or dropping to polling
  and accepting that presence and typing indicators go with it. **Note the
  ordering risk** — chat is the first feature to need this, but guild events,
  live leaderboards and battle-report pushes all want the same pipe, so it is
  worth deciding once rather than per-feature.

  Not blocking anything today. It *is* the largest unpriced item in the stack,
  and picking polling now quietly forecloses the presence features the screens
  already show.
