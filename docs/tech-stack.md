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

## Deliberately not used

| Rejected | Why |
|---|---|
| Next.js | Steam requires a static bundle, so its server half is unusable. Nothing left that Vite doesn't do better here. |
| Tauri | Uses each OS's own webview — Chromium on Windows, **Safari's WKWebView on macOS**, WebKitGTK on Linux. Three engines to test for an animation-heavy UI. Electron ships one Chromium everywhere, and 150MB is irrelevant on Steam. |
| tRPC | Assumes client and server move in lockstep; a shipped Steam client can be stale. |
| Redis / a state store | Would create a second source of truth alongside the action log. See above. |
| An auth provider | Steam is custom regardless, there are no passwords, and MAU pricing scales badly for games. |
| Replay validation | Requires the client to hold the RNG seed, leaking every future roll. |

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

**Desktop only.** Electron on Steam and as a standalone installer, plus the same
static build in a desktop browser. Mouse and keyboard, minimum window
**1280×720**, designed for **1600×900**, graceful to ultrawide.

No mobile, no tablet, no touch, no Steam Deck / gamepad target. Design prompts
in `resources/` were updated to match; touch-target guidance is replaced with
mandatory keyboard focus rings.

---

## Still open

- **Steam auth end-to-end has not been prototyped.** Ticket verification is
  documented and well-trodden, but it is the piece with the least certainty and
  is worth spiking before it sits on the critical path.
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
