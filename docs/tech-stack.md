# LMNTLZ — Tech Stack Decision Record

**Status: complete as of 2026-07-28.** Every entry below was approved
deliberately. The *why* is recorded alongside the *what*, because the reasoning is
what stops a decision being quietly reversed later by someone who only sees the
outcome.

> **The stack table has no TBD rows.** The five gaps carried since 2026-07-26 —
> object storage, transactional email, error monitoring, analytics and realtime —
> all closed on 2026-07-28. What remains under *Still open* are **numbers to verify
> and spikes to schedule**, not choices to make.

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
| Payments (web) | **Paddle** — merchant of record |
| Replay logs | **Vercel Blob**, 7-day expiry |
| Transactional email | **Resend**, behind an interface |
| CI/CD | **GitHub Actions** + Vercel's own git integration |
| Unit / integration tests | **Vitest** |
| End-to-end tests | **Playwright** |
| Realtime transport | **Ably** — managed pub/sub, behind an interface |
| Chat moderation | **Claude Haiku 4.5** via the batch API, behind an interface |
| Error monitoring | **Sentry** — client and API |
| Game telemetry | **Postgres** — SQL against the battle metadata row. *No analytics vendor.* |
| Web funnel | **Vercel Web Analytics** — live on both projects since 2026-07-29; page views only, no custom events |

## Layout

**One repository holds everything — design and code — decided 2026-07-28.**

```
LMNTLZ/                the single repo
├── resources/
│   ├── mechanics/     the rules — canon
│   ├── characters/    hero data (MATCHUPS.md, hero-stats.xlsx)
│   └── designsystem/  generated screens — look and feel only
├── docs/              this file, the architecture prompt
├── specs/             Spec-Kit feature specs
├── tools/             validators and build scripts
├── packages/
│   ├── sim/           rules (shared) + resolver (server only)
│   └── content/       heroes, powers, matchups, reach — Zod-validated
└── apps/
    ├── client/        Vite React SPA → static bundle
    ├── desktop/       Electron shell → wraps the client, Steam integration
    └── api/           Vercel Functions → imports sim
```

### Why one repo, and why the client/server split was never on the table

**Client and server cannot be separated at all.** `packages/sim`'s *rules* half runs
on **both** sides — that is what lets the client draw targeting, project the turn
queue and preview effectiveness without asking the server. Separate repositories
would force `sim` to become a published package with independent version pins:

```
client → sim@1.2.0  ─┐  they disagree about the damage formula, and the
server → sim@1.3.0  ─┘  client previews numbers the server will not produce
```

That is the **same defect that disqualified MAUI** — two implementations of the
combat math that must agree exactly, forever — except expressed as two *versions*
of one codebase rather than two languages, which is harder to notice and no less
wrong. **Deploy independence is not a reason to split**, because the monorepo
already has it: Vercel deploys `apps/client` and `apps/api` separately and
Turborepo rebuilds only what changed.

**Design and code share the repo because the docs are the spec.**
`resources/mechanics/` is what `packages/sim` implements and `resources/characters/` is what
`packages/content` mirrors. In one repo, changing a rule *and* the code enforcing
it is **one commit**, so the two can never disagree in history. Split, there is
always a window where they do, and a year later nothing records which led.

> **That traceability is worth more here than on a typical project.** Under the
> **no-nerf rule** numbers cannot move freely after launch, and every battle record
> carries `engineVersion` and `contentVersion` precisely so *"which rules produced
> this?"* stays answerable. A repository boundary between the rule and its
> implementation works directly against that.

**The cost is the art.** `resources/` is ~68 MB and git cannot delta-compress PNGs,
so each roster re-render adds a full copy (*Asset storage*, below). It lands almost
entirely on **fresh full clones** — CI is unaffected, since GitHub Actions and
Vercel both clone shallow. **On a solo project the traceability beats the
megabytes**; multi-repo coordination pays off when different people own different
halves, and nobody else owns a half here.

**A wiki is not part of this.** GitHub wikis have no pull-request review and break
relative links, so **no rule or canon ever goes in one** — it would put canon in
two places, which is the failure this whole document set is organized against. A
wiki is worth revisiting **at launch for player-facing docs** — a game guide, patch
notes, a public codex — which is different content for a different audience.

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

## CI and testing — **recorded 2026-07-28**

**Not decisions so much as the absence of any reason to deviate**, written down
because `AGENTS.md` mandates the testing bar and this document never named the
tools.

- **Vitest** for unit and integration tests. It is Vite's own runner, so it shares
  the config, the transform pipeline and the TypeScript setup the client already
  has. Anything else means maintaining a second build.
- **Playwright** for end-to-end, which `AGENTS.md` already names for critical user
  paths.
- **GitHub Actions** for CI — typecheck, lint, Vitest, build — alongside Vercel's
  git integration handling preview and production deploys. Two systems, but the
  second is free and already implied by hosting on Vercel.

> **`packages/sim` is where testing actually earns its keep.** The rules half is
> pure, shared and RNG-free by construction, which makes it **exhaustively
> testable without mocks** — and under the no-nerf rule it is the last place a
> number can move freely. Property tests over the 729 type pairings and the 27-hero
> roster are worth more here than they are anywhere else in the codebase.

---

## Realtime transport — Ably — **decided 2026-07-28**

> **The broker does exactly one job: fan-out.** Clients subscribe; they never
> publish. Every message reaches it only after passing through our own API.

**Chat is in-game and that is now settled** — global, guild, Guild Ads, beginner,
direct and admin (`../resources/mechanics/11-social.md`). Everything else in this
document is request/response, which was right for gameplay because PvP is
asynchronous and a battle turn *is* a request. Chat is the one system that is not.

### Discord was foreclosed by Guild Ads, not by preference

Handing chat to Discord was genuinely on the table as a way to avoid owning this.
**The Guild Ads channel is what makes it impossible**, and it is worth recording
why so it is not revisited as an easy saving:

- Postings **cost shards** — 5 looking-for-guild, 10 your own squad, 25 an
  opponent's — and guild ads draw **guild-fund credits** against a hard **4/day**
  ceiling (`../resources/mechanics/08-guilds.md`).
- Embeds **reference live game state** — open slots, league, roster power, an
  actual squad — rather than carrying uploaded content.
- **No embed may ever show a Hidden defense**, which is enforceable only where we
  control rendering.

Global and beginner chat could plausibly have lived on Discord. Guild Ads never
could — and once the pipe exists for one channel, the others ride it for free.

### Why clients hold subscribe-only tokens

**Four independent rules force every message through our API before delivery**,
and any one of them alone would be sufficient:

| Rule | From |
|---|---|
| Embeds cost shards | `11-social.md` |
| Guild ad credits — 2 free daily, hard cap 4/day, from guild funds | `08-guilds.md` |
| Moderation classification | `11-social.md` |
| Scope authorization — guild membership, beginner-league gating, admin role | `11-social.md` |

```
client → POST /v1/chat/message → our API (authorize · charge · persist · moderate)
                                      → publish → Ably → fans out to subscribers
```

> **A client able to publish directly to the broker would bypass the shard
> charge.** So subscribe-only is a **correctness requirement, not a hardening
> measure** — the economy rules in `11-social.md` are enforced by the fact that
> publishing is a REST call to us. Our API mints short-lived Ably tokens scoped to
> exactly the channels that player may read, which is also where guild membership
> and beginner-league gating are enforced.

### Why Ably specifically

- **Vercel still holds no connections.** We publish over REST; the player's browser
  opens the WebSocket to Ably directly. The serverless architecture is untouched —
  which is the property that ruled out running our own socket server on Vercel in
  the first place.
- **Presence and history are primitives**, not features to build. The Chat screen's
  `1 482 wardens online` and `In battle · round 4` are a subscription, not a
  subsystem.
- **Token auth is scoped by us**, so channel permissions stay server-side.
- **The free tier covers development and soft launch**, and the bill starts only
  when there are players — the right shape for a self-funded project.

**A self-hosted socket process was the runner-up and lost on scope.** Since the
broker is pure fan-out, self-hosting means rebuilding fan-out, reconnection,
presence and scaling by hand — a commodity — and introducing the only stateful,
always-on deployment in an otherwise stateless system.

### Cost, and the one knob that changes its shape

**Concurrency, not message volume, is what is billed.** At 10k DAU with a
~30-minute average daily session that is roughly **200 average and ~600 peak**
concurrent connections — past the 200-connection free tier, so **verify current
pricing before launch** rather than trusting the figure here.

> **Presence is what makes the bill scale with DAU instead of with chat usage.**
> Showing an online count requires holding a connection the whole time a player is
> in the app. Connecting only while the chat panel is *open* drops concurrency
> severalfold. **Presence is therefore the designated cost lever** — if the bill
> bites, that is the thing to turn off, and it is a toggle rather than a rewrite.

### Decide once — three other features want this pipe

**Chat is merely the first caller.** Guild event standings, live leaderboards and
battle-report pushes all want server-initiated delivery, and all of them would
otherwise arrive as polling bolted on separately. **The transport sits behind an
interface** for the same reason email does: so the second and third callers do not
each re-implement it, and so the vendor stays swappable while the broker's job
stays trivially small.

---

## Chat moderation — Claude Haiku 4.5 — **recorded 2026-07-28**

> **This was settled in `../resources/mechanics/11-social.md` on 2026-07-27 and
> never reached this table.** Recorded here because it is an outbound dependency
> with a recurring bill, which is exactly what this document exists to track — and
> because its absence propagated: the architecture diagram prompt did not ask for
> it, so the generated charts have no node for it.

**Every message is read; nothing is sampled.** Classification runs through the
**batch API**, batching **100 messages a call** — the reasoning, the false-positive
math and the *flag, never act* rule all live in `11-social.md` and are not
restated here.

> **It is asynchronous and off the send path, which is an architectural fact rather
> than an implementation detail.** `11-social.md` puts the classifier **after
> send**; what gates a message before it goes out is a **slur blocklist**, a rate
> limit and a length cap — all local. A batch API accumulates 100 messages before
> dispatch and answers in minutes, so gating delivery on it would stall chat for
> hours. **Moderation is two tiers: a synchronous cheap gate, and an asynchronous
> thorough flag.** Anything that draws them as one step is wrong.

| DAU | Messages/day | Monthly |
|---|---|---|
| 10,000 | 60,000 | **$68** |
| 50,000 | 300,000 | $338 |
| 100,000 | 600,000 | **$675** |

> **It is the largest managed-service line in the stack** — more than Ably, Resend
> and Sentry combined at the top end, and the only one that is a per-message
> variable cost rather than a tier. It holds at roughly **1% of net revenue at any
> scale**, because both sides scale with players, which is why it is not a line
> worth optimizing.

**Behind an interface, like the realtime transport and the sender.** `11-social.md`
already requires the moderation vendor to be swappable so that separating chat onto
its own service later stays mechanical. **The batch size is the tuning knob, not
the coverage** — if judging 100 items in one pass degrades classification quality,
the batch shrinks and full coverage is preserved.

---

## Observability — Sentry for crashes, Postgres for everything else — **decided 2026-07-28**

> **Game telemetry is not product analytics.** They answer different questions and
> only one of them needs a vendor.

**The questions this design actually has to answer are all battle questions**, and
a battle already writes a permanent row we own at full fidelity. Routing copies of
that through Amplitude, Mixpanel or PostHog would buy a **sampled, aggregated,
retention-limited** version of data already sitting in Postgres — and charge for
it.

| Question | Answered by |
|---|---|
| Do Hidden squads hold better than Visible? | **SQL** — the zone-balance commitment in `../resources/mechanics/02-squads.md` |
| Is a battle really ~102 hero-turns? | **SQL** |
| Which heroes are over- or under-picked? | **SQL** — the input to the balance pass |
| Are league thresholds right for the real population? | **SQL** — `../resources/mechanics/09-matchmaking.md` |
| Did a player find the guild-creation button? | a product-analytics vendor |
| Did the client just throw an exception? | **Sentry — nothing else can see it** |

**Only the last row is invisible without a purchase**, and that is the whole case
for the one vendor being added. A React exception on a player's machine produces
**no server log at all**; the first signal is a support ticket, if one ever comes.
Sentry also uploads **source maps at build time**, which is the difference between
a usable stack trace and minified noise, and groups by release so *"this started
at deploy X"* is answerable.

**Click-tracking is deferred rather than rejected.** Signup drop-off is a real
question, but it is noise until there is a population, and it is the one question
here that a vendor genuinely answers better. Revisit at traction. **Vercel Web
Analytics** covers page views and the pre-signup funnel and is a dashboard toggle
on an account we already have, so it is switched on at launch and costs nothing to
have been wrong about.

#### Switched on and wired — 2026-07-29

Enabled on both Vercel projects and `@vercel/analytics` added to both apps. Three
things about it are settled and worth not rediscovering:

- **The client reports page views; the API reports nothing.** Web Analytics counts
  what a browser script reports, and nothing `lmntlz-api` returns is a page, so
  there will never be an API page view in the dashboard. Its package is installed
  against `track()` for the two future browser-less events — the Paddle webhook
  (013) and the cleanup cron (016) — and is deliberately unimported until one
  exists. See the `//dependencies` note in `apps/api/package.json`.
- **The client is a single URL, so a per-screen funnel does not exist to be
  measured.** There is no router: every screen is conditional rendering at `/`,
  and for an anonymous visitor the landing page and the sign-in panel render
  *together*. The distinct paths are `/` plus the five policy pages — which does
  answer *"did they open pricing before leaving"*. Visitors come from here,
  sign-ups from `accounts.createdAt`, and their ratio is the conversion rate. What
  is still invisible is a Google popup opened and abandoned; that needs two custom
  events (`signin_started`, and `signup` off the `isNewAccount` the API already
  returns), not routes. **Deferred, because it is plan-gated and has no
  denominator until there is traffic.**
- **Two guards on the mount, in `apps/client/src/lib/analytics.ts`.** It reports
  only from a production build, and only from an `http(s)` origin — the Steam
  bundle loads off disk with no origin the beacon's absolute path can resolve
  against. `beforeSend` strips the query string and fragment from every URL,
  wholesale rather than by name, because the parameters on the way are Steam's
  `openid.sig` and an OAuth `code`.

**Two things to confirm on the account, both independent of analytics.** Hobby's
reporting window is one month, which forecloses a pre-launch baseline; and Hobby is
non-commercial, which becomes a terms problem the day Paddle takes money.

### The consequence: the metadata row must be wider than currently specced

> **This is the load-bearing part of the decision, and it is not about Sentry.**
> Choosing SQL over a vendor means the schema *is* the analytics product — and
> `Two version stamps, not one` already established the rule that applies:
> **it cannot be backfilled, so it ships with the first battle ever recorded.**

The row is specced above as *participants, date, zone, outcome, rating change,
shards*. **That answers zone balance and nothing else on the list.** At ~200 bytes
a row, four more fields are free; not having them means the first balance pass
runs blind, under a **no-nerf rule** that makes the first pass the one that
matters most.

| Add | Without it |
|---|---|
| **Turn count** | The ~102-hero-turn figure stays an estimate forever, and several economy numbers rest on it |
| **Squad composition, both sides** | No pick rate, no per-hero win rate, no counter-matrix validation — the entire balance pass has no input |
| **Defender is a bot** | Every aggregate is polluted by **our own authored loadouts**, which are not player choices and would read as meta signal |
| **League and rating at battle time** | Thresholds cannot be checked against the population that actually experienced them |

> **Storing squad composition is not the same as exposing it, and the two rules
> must not be conflated.** `../resources/mechanics/11-social.md` settled that **CSV
> export carries no squad composition at all, either side**, and that **no embed
> may ever show a Hidden defense**. Those govern *what leaves the system*. This
> governs *what the system records about itself*. Keeping both straight is the
> reason to state them next to each other.

---

## Payments — Paddle, as merchant of record — **decided 2026-07-28**

> **Paddle sells to the customer; we sell to Paddle.** They owe VAT, GST and US
> sales tax in every jurisdiction, and they absorb chargebacks.

**This is the entire storefront at 1.0**, since Steam is a fast-follow — the $5
boost pair, the $20 four-week pass and the $5 avatar all run through it. When Steam
ships it becomes the second rail behind the same entitlement service (*Entitlements
are account-level*, `../resources/mechanics/06-progression.md`).

**The fee is not what decided it.** Paddle runs ~**5% + $0.50** against Stripe's
~**2.9% + $0.30**. Two other things bought that difference:

- **Tax compliance is not one obligation, it is roughly forty.** EU VAT on digital
  goods means charging each customer's local rate and remitting quarterly through
  OSS; then the UK, Norway, Switzerland, Australia, Canada, Japan, South Korea,
  India, and ~30 US states with economic nexus on digital goods. **Stripe Tax
  calculates; it does not file.** For a self-funded solo operator that is a
  recurring part-time job.
- **Games have elevated chargeback rates**, dominated by *"my child used my
  card."* Under merchant-of-record that is Paddle's loss to absorb; under Stripe
  it is ours, and a poor chargeback ratio can put the account itself at risk.

> **The crossover is around $150k/year of direct revenue** — that is where ~2% of
> revenue equals a few thousand in accountancy plus the hours. Below it, MoR is
> **strictly cheaper**. Above it the money is a wash and the fee is buying back
> time. **Same shape as the argument for paying Steam's 30%.**

**Paddle over LemonSqueezy on a customer-facing reason rather than a technical
one.** Under MoR **the reseller's name appears on the customer's card statement**
and often in checkout — so it is branding, not just a vendor choice, and an
unexplained line item is itself a chargeback trigger in exactly the demographic
that produces them.

### Two things to verify before building the flow

- ~~Does Paddle support a 4-week billing interval?~~ **Moot as of 2026-07-28.**
  `06-progression.md` replaced the subscription with **one-time passes** (3 days
  through a year), so **nothing recurs and there is no interval to support.** This
  also removes dunning, cancellation flows, renewal-disclosure law in three
  jurisdictions, and the "I forgot I was subscribed" chargeback category — which
  matters here specifically, because chargeback ratio is what puts a payment
  account at risk.
- **No "integration" is required, and that is worth knowing.** Vercel's
  marketplace integrations provision infrastructure; a payment processor is not
  one. All three candidates are the same work: keys in env vars, API calls, and a
  webhook handler we write. **Stripe's richer template ecosystem is mostly
  Next.js-shaped and does not apply here.**

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
| **Event log** — the replay itself | **Vercel Blob** | ~5 KB | **7 days** |

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

### Vercel Blob, on vendor count rather than price — **decided 2026-07-28**

**At 7–70 GB the three candidates are within pennies of each other**, so price was
never going to decide it. **Vercel Blob wins on being an account we already have**
— no second console, no second set of credentials, no separate bill, and
`@vercel/blob` reads its token from the environment the API already runs in.

R2 would be marginally cheaper with free egress; S3 would be the most portable.
Neither difference is worth a fourth vendor on a self-funded project whose whole
storage footprint fits on a phone.

> **The one real tradeoff: expiry is ours to run.** S3 and R2 both offer lifecycle
> rules, where *"delete objects older than 7 days"* is a config setting the
> provider enforces. **Assume Vercel Blob has no equivalent and budget a cron** —
> Vercel Cron Jobs are built in, so this is a scheduled function, not
> infrastructure. Worth verifying against current Blob docs before building, since
> a lifecycle rule would remove the job entirely.

**Drive the cleanup from Postgres, never from listing the bucket.** The metadata
row already carries the battle date and the report flag, so the job is a query —
*rows older than 7 days, not attached to an open report, log not yet deleted* —
then a delete per blob and a flag flip. That makes it deterministic, resumable
after a partial failure, and re-runnable without side effects. Listing the bucket
instead would make the *storage* the source of truth about retention, which is
precisely the second-source-of-truth problem this design refuses everywhere else.

> **A silently failing cleanup cron is the failure mode**, because nothing breaks
> — storage just grows. **Alarm on the count of expired-but-undeleted rows**, which
> is one query against data we already have, rather than on the job's own success.

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

**Seven days covers the ordinary dispute too**, which is the other reason to hold a
log at all: a cheating report arrives within days, not months — and the one that
arrives late is exactly the case the preservation rule above is for.

### The client shows the last 50

**A player's battle list is capped at 50** — at ~20 battles a day that is two and a
half days, which is the window anyone actually reviews. The **last 20 Visible
battles** shown on a public profile is a separate, narrower rule
(`../resources/mechanics/11-social.md`) and reads from metadata alone.

> **The list is metadata, so it long outlives the replays.** A player can see
> *that* they fought and *what happened* for as far back as we keep rows; they can
> **watch** only what is still inside the 7-day window. Those are different
> promises and the UI should not blur them — an entry whose log has expired should
> say so rather than failing to open.
>
> **At ~20 battles a day the 50-entry list is ~2.5 days deep, which sits inside
> the 7-day window** — so in normal play nearly every visible entry is still
> watchable, and the expired-log state is an edge case rather than the common one.

---

## Transactional email — Resend — **decided 2026-07-28**

**A managed sender behind an interface.** It was not in the stack until guild
succession needed it
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

### Why Resend

**The same reasoning as Vercel Blob: it is the least stack.** A TypeScript-first
SDK, domain verification that walks you through the three DNS records above, and a
free tier well past what this volume needs. Postmark has the better deliverability
reputation and SES is by far the cheapest at volume — **neither advantage is
reachable at four emails a day.**

> **It stays behind an interface for a reason that is not vendor lock-in.**
> Sending mail is **irreversible and outward-facing** — the one class of action
> this project consistently gates. The interface is where the send-time rules live:
> *templated by default*, *AI drafts and a human sends*, and a hard block on
> anything resembling a credential link. A vendor SDK called directly from three
> places has nowhere to put those.

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
| **Discord for chat** | Guild Ads postings cost shards and guild credits, reference live game state, and must never render a Hidden defense. None of that is enforceable outside the game. See *Realtime transport*. |
| **A self-hosted socket process** | The broker's only job is fan-out, so self-hosting rebuilds a commodity — and adds the sole stateful, always-on deployment to an otherwise stateless system. |
| **Polling for chat** | Cheapest today, but the invocation cost grows with concurrency as pure waste, and it silently forecloses presence. |
| **A product-analytics vendor** | The questions this design must answer are battle questions, and battles already write permanent rows we own at full fidelity. A vendor would sell back a sampled copy. See *Observability*. |

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
- ~~Chat needs a realtime transport this stack does not have.~~ **Closed
  2026-07-28 — Ably.** See *Realtime transport* above.
- **Ably's pricing above 200 peak concurrent connections is estimated, not
  verified.** The architecture does not depend on the number, but the launch
  budget does. Check it against current published pricing before launch, and note
  that **presence is the lever** if it comes in high.
- **Whether Vercel Blob supports lifecycle expiry.** If it does, the cleanup cron
  disappears; if not, it ships. Either way the retention rule is unchanged — this
  only decides whether we run the deletion or the provider does.

### Closed on 2026-07-28

Recorded so the gaps are not re-opened as though they were never asked:
**Vercel Blob** for replay logs · **Resend** for transactional email · **Sentry**
for error monitoring · **Postgres and no analytics vendor** for game telemetry ·
**Ably** for realtime. **The stack table has no TBD entries.**
