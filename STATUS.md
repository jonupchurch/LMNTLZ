## Current phase

**Features 001–008 are built. 374 of 772 tasks, and both halves are live on
their own domains.** **997 unit tests** (content 70 · sim 322 · api 474 · client
131, across 90 files) + **36 Playwright end-to-end**; lint, typecheck and build
all clean. Counted 2026-07-29 by running each suite rather than by trusting
Turbo, which had cached four of the six tasks and printed no numbers for them.

| | |
|---|---|
| **client** | `apps/client` → **`www.lmntlz.com`** (apex 308s to www) |
| **api** | `apps/api` → **`api.lmntlz.com`** |

`https://api.lmntlz.com/v1/health` returns `{"status":"ok","commit":"..."}`.
**The commit is the point.** For two features that route returned `{"status":
"ok"}` and nothing else, which is the same answer in every build ever made — and
production spent 13 hours serving a feature-005 build while six deploys failed,
invisibly, because that was the only thing anyone checked. `/v1/roster` answering
**401 rather than 404** is what proves feature 006 actually shipped.

Six migrations are applied to Neon and verified by querying `information_schema`
rather than by trusting the migrator.

**Vercel, as of 2026-07-29.** Scope `jupchurch-7994s-projects`, on **Pro**.
`lmntlz` carries exactly **two** environment variables — `VITE_API_BASE_URL` and
`VITE_GOOGLE_CLIENT_ID` — and `lmntlz-api` seven. It carried nineteen until the
Neon marketplace resource was found connected to the *client* project, which had
put the database password on a static site in four different forms; disconnecting
the resource removed all fifteen at once. **Vercel Web Analytics is live on both
projects**, page views only. If a `PG*` or `POSTGRES_*` variable ever reappears on
`lmntlz`, the resource has been reconnected — fix the connection, not the
variables.

| Feature | Tasks | State |
|---|---|---|
| **001** content-package | 43/43 | roster, derivation, effectiveness, `contentVersion`, CI regenerate-and-diff |
| **002** sim-rules | 54/54 | pure and shared — purity gate, reach, targeting, damage, turn order, ending |
| **003** sim-resolver | 40/40 | SplitMix64, seed custody, replay, re-derivation |
| **004** defense-ai | 45/45 | firing profile, power choice, the five-step tiebreak, role defaults, reach window |
| **005** auth | **49/49** | `apps/api` — Hono, Drizzle, Neon, Google, rotation, linking, usernames |
| **006** roster & squads | **54/54** | `apps/client` — Vite/React/Tailwind · allocation, eviction, streaks, scout, defense config |
| **007** battle | **52/52** | the log is the state · settlement, conclusion, expiry, hold streaks, sign-in wired at last |
| **008** replays | **37/39** | permanent `battle_records` + a 7-day private blob · retention holds, cleanup, watch and list |

**Features 001–008 are complete, bar two tasks that cannot be done yet.** 008's
**T029** (cron registration) waits on 016 and its **T035** moderator exception
waits on 015's operator identity; neither is dead code, and 008's own spec names
012 as the consumer of its list endpoint. **Feature 009, matchmaking, is next** —
it fills the four league and rating columns 008 currently writes null into, and
gives the battle screen an attack button instead of resume-only.

> **006 ended by finding a gap in its own task list.** T018–T020 and T047–T048
> each say "build this component"; nothing said "put them on a page". Every squad
> component was complete and unit-tested while unreachable from the running app.
> `SquadsScreen.tsx` now composes them. **Features 007–016 should each check that
> something renders what they build** — the task template does not.

Spec-Kit itself is finished; all sixteen features carry `tasks.md`.

Design and tech stack are both **complete and closed**; the constitution is
LMNTLZ-specific at **v3.0.0**; **16 specs** are written with zero unchecked
checklist items; and each of the sixteen now carries the full set —
`plan.md` · `research.md` · `contracts/` · `quickstart.md` · `tasks.md` —
against one shared `specs/data-model.md`.

**767 tasks across the sixteen**, each with a checkbox, a sequential id, a story
label where it belongs to one, and an exact file path. Zero malformed, zero
duplicate ids, zero gaps.

| | |
|---|---|
| Total tasks | **767** |
| Parallelizable `[P]` | 207 |
| Inside a user-story phase | 563 |
| Features whose Phase 1 is a one-time bootstrap | **3** — 001 (monorepo) · 005 (`apps/api`) · 006 (`apps/client`) |

**All 49 Phase 0 research questions are answered**, and the answers say honestly
which kind of answer they are:

| | |
|---|---|
| **Decided** from the docs, the vendor's, or the arithmetic | 41 |
| **Computed** — a sweep or a simulated population was actually run | 5 |
| **Specified but not run** — needs the live model or production data; the file names the measurement rather than inventing its result | 3 |

Build order remains settled: `packages/content` → `packages/sim` (rules, then
resolver) → `apps/api` → `apps/client`, headless and tested first.

## What the Phase 0 pass turned up

**The planning pass has now earned its keep several times over.** In order of how
expensive each would have been to find later:

- **The battle metadata row gained nothing and lost nothing** — `startedAt`/`endedAt`
  were already in the shared model, and feature 016 needs them for the drain. The
  risk is a migration dropping them as redundant next to `turnCount`, which measures
  *engine* length where the drain needs *wall-clock*. Flagged in three files.
- **`07-defense-ai.md`'s *"every safe ordering ends `1·0`"* is wrong by one**, and
  its own published Tank default is the exception. The plan had turned that claim
  into a **tripwire** — *"if a re-derivation produces one that does not, the ladder
  changed"* — so following it literally would have sent someone to re-tune a correct
  ladder. The real rule is *tier 0 last*, and it is provable rather than measured.
- **The "12 safe orderings" is a 60-turn statement, and a hero takes ~8.5 turns.**
  At real battle length **no** ordering keeps all six powers live. The four published
  role defaults survive anyway — the only casualty is the tier-0 auto-attack, which is
  the fallback — but the squad builder must show a **9-turn** profile, not a 60-turn
  one, or the number on screen describes a game nobody plays.
- **Ably's cost driver is message fan-out, not presence.** `docs/tech-stack.md` names
  presence as the lever if pricing came in high; presence is **$9/month at 10k DAU**
  against **~$270** for Global fan-out — and fan-out is **quadratic in players**.
  A capped Global room size makes it linear. Raised, not taken: it is player-facing.
- **The Hidden 2× rating bonus makes rating non-zero-sum**, injecting ~2,700 points a
  year into an active account. Both stated jobs of the rating are ordinal and survive
  it; what breaks is *"everyone starts at 1000"* meaning "starts at average".
  Recommendation raised, not taken — the fixed 1000 is recorded canon.
- **Vercel Blob has no lifecycle expiry** (verified against current docs), so the
  cleanup cron ships. `del()` is free and **`list()` is billed** — which independently
  confirms the Postgres-driven design chosen on correctness grounds.
- **Feature 006's plan found the firing profile in `sim/ai`**, which is server-only,
  when the squad builder needs it client-side. It moved to `sim/rules`. Found during
  implementation instead, the natural fix is an endpoint — a round trip on every drag
  of a ranking widget.

## Done

- **Design closed.** `resources/mechanics/` `01`–`09` + `11`. `10-equipment.md` is
  a deliberate fast-follower; guild event design is parked.
- **All 27 heroes authored** with derived bane/fault (`resources/characters/`),
  validated by `tools/validate-matchups.ps1`.
- **Combat fully specified** — five-phase turn, bounded-accumulator turn order,
  reach on a shared 1–6 axis, the damage pipeline, a 300-hero-turn cap resolved on
  pooled HP share.
- **Tech stack complete (2026-07-28).** TypeScript · pnpm + Turborepo · Vite +
  React + Tailwind · Hono on Vercel · Neon + Drizzle · Paddle · Vercel Blob ·
  Ably · Resend · Sentry · Claude Haiku 4.5 · Vitest + Playwright. **No analytics
  vendor** — game telemetry is SQL against the battle metadata row.
- **Monetization settled** — passes, not subscriptions; nothing auto-renews;
  advantage capped at **$160/year**; shard balance capped at 6,500.
- **Architecture diagram** generated and reviewed; three discrepancies logged in
  `resources/README.md`, screens left unedited per the standing rule.
- **Repo layout decided** — one repository for design *and* code. Client and
  server were never separable.
- **Constitution v3.0.0** — Part I process (I–XI) unchanged; **Part II product
  constraints (XII–XX)** added and wired into `plan-template.md`'s gate.
- **Feature set scoped** — 16 features in 6 dependency layers (`specs/README.md`).
- **All 16 specified**: content · sim-rules · sim-resolver · defense-ai · auth ·
  roster-and-squads · battle · replays · matchmaking · progression · payments ·
  profiles · guilds · chat · moderation · ops-admin.
- **The shared data model settled once** (`specs/data-model.md`) — six models cross
  feature boundaries, and the battle record is written by two and read by four.
- **All 16 planned**, each gated on the nine Part II constraints. No violations.
- **Phase 0/1 complete for all 16** — `research.md`, `contracts/` and `quickstart.md`
  each. All 49 research questions answered.
- **Two read-only analysis scripts committed** so every computed figure is
  reproducible: `tools/characterize-orderings.py` and `tools/verify-accuracy.py`.
  The ordering sweep has since been **ported to `tools/characterize-orderings.ts`**
  (feature 004 T003), reading `@lmntlz/content` and importing the engine's own
  cooldown model instead of simulating it a second time. It reproduces every
  recorded figure exactly. Run it with `pnpm sweep:orderings`; it is deliberately
  **not** in CI.
- **`tasks.md` for all 16** — 767 tasks, ordered by user story, each independently
  testable and each carrying the reasoning that would otherwise be lost between the
  plan and the diff.

## Next — code, in the settled build order

`packages/content` → `packages/sim` (rules, then resolver) → `apps/api` →
`apps/client`. **Start at `specs/001-content-package/tasks.md` T001** — it carries
the monorepo bootstrap, which runs once for the whole project.

**Three features open a new app and the rest inherit it**: 001 stands up the pnpm +
Turborepo workspace, 005 stands up `apps/api`, 006 stands up `apps/client`. Nothing
else has a Setup phase worth more than a few tasks.

### ⛔ The infrastructure gate sits at 004 → 005

**Features 001–004 — 182 tasks, roughly a quarter of the project — need no
database, no hosting, no vendor account and no bill.** Pure TypeScript and Vitest.

**Feature 005 is the first task in the project that needs infrastructure**, and
`specs/005-auth/tasks.md` opens with a STOP block listing it: a **Vercel project**,
a **Neon project**, and a **Google OAuth client**. Jon creates all three himself —
they are billable accounts in his name — and he asked to be told when the moment
arrives. **Tell him at the boundary, not when T001 fails.**

**Neon is the database for every environment**, tests included. Local PostgreSQL 15
exists on the machine as a fallback if the DB suite ever gets slow; it is not part
of the design. Vendors after that: **Vercel Blob** at 008, **Paddle** and **Resend**
at 011, **Ably** at 014.

> ### ⚠️ Paddle verification is gated on a live website, not on a queue
>
> **Corrected 2026-07-28.** The earlier note here said to start merchant-of-record
> vetting early because it takes days. That is true and it is not the binding
> constraint: **Paddle will not verify an account until there is a public site to
> review** — so it cannot be started early, however much anyone wants to.
>
> The **sandbox is set up and is enough to build all of feature 011 against**:
> its own keys, its own test cards, the full API. So nothing is blocked today.
>
> **The risk is at the far end.** 011 gets built, everything passes in sandbox,
> and then going live stalls on a review that could not begin until the client
> shipped. To avoid that, treat the pages Paddle needs as **part of feature 006**
> rather than as launch paperwork:
>
> - a real product/pricing page describing what is sold and for how much
> - terms of service · privacy policy · **refund policy**
> - a contact route that reaches a person
>
> None of those were in any `tasks.md`. **✅ Built 2026-07-29** as five static
> pages in `apps/client/public/` — `pricing`, `terms`, `privacy`, `refunds`,
> `contact` — plus `SiteFooter` linking them from every screen. Static HTML and
> not React routes on purpose: a refund policy must render with no JavaScript and
> must survive the app being broken, which is exactly when somebody goes looking
> for it. `tests/site/legal.test.tsx` and `e2e/legal.spec.ts` hold them up.
>
> **Three blanks remain and they are enumerated, not scattered** —
> `[[TRADING_NAME]]`, `[[SUPPORT_EMAIL]]`, `[[JURISDICTION]]`. Each needs a fact
> about the business that is not in this repo. `OPEN_BLANKS` in the test is the
> complete list, and the suite fails both if a *new* blank appears and if a filled
> one is left listed, so neither can drift.

### The deployment shape — decided 2026-07-29

**Two Vercel projects from one Git repo**, each with its own Root Directory
(`apps/api`, `apps/client`). Not two repositories: that would split
`packages/sim` in two, which is the one thing the architecture cannot afford.

**Same-origin was never really available.** It is the only thing a single project
buys, and the Steam build makes it unusable — that bundle loads from disk, so it
is permanently cross-origin. `apps/client/src/lib/api.ts` has treated its base
URL as configuration from the day it was written for that reason.

`lmntlz.com` was bought on 2026-07-29 and belongs to the **client**. The existing
Vercel project becomes the client; the API moves to a new one. **Deploy the new
API project before flipping the existing project's Root Directory**, or there is
a window with no API at all. And **delete `DATABASE_URL` and `JWT_SIGNING_KEY`
from the client project** once it is the client — Vite only inlines `VITE_`
names so they would not reach the bundle, but a project that builds a static site
has no business holding them.

1. ~~**Vercel Deployment Protection has to come off production.**~~
   **✅ Nothing to do — the note was wrong.** Checked 2026-07-29:
   `https://lmntlz.vercel.app/v1/health` returns `{"status":"ok"}` to an
   anonymous request. **Protection never covered the production domain**; what it
   guards is the scoped alias `lmntlz-<scope>.vercel.app`, which still answers
   `302 → vercel.com/sso-api`. Both hostnames point at the same deployment, so
   testing the wrong one reads as an outage that is not there.

   If protection is ever turned on, the setting that matters for a browser client
   is **OPTIONS Allowlist** — a CORS preflight carries no credential, so it is
   refused before the real request is ever made.
2. **Google's authorized JavaScript origins need the client's real domain.**

   **The origin Google checks is the one serving the page, not the one serving
   the API.** Google Identity Services validates the browser origin the sign-in
   button is rendered from; the API is called afterwards with the resulting token
   and its own hostname never comes into it. So an API-only URL in that list is
   inert.

   **The existing registration survives the reshuffle by luck**: the project that
   owns `https://lmntlz.vercel.app` is the one becoming the client, so that entry
   goes on meaning what it says. Add `https://lmntlz.com` (and `www.` if it is
   served rather than redirected) when the domain is attached.

   Google does **not** support wildcard origins and Vercel gives every preview
   deployment a unique URL, so preview deploys cannot do Google sign-in unless a
   stable branch domain is registered. The fallback is that sign-in works locally
   and in production only.
3. **The API had no CORS at all until 2026-07-29.** `apps/api/src/cors.ts` now
   holds it: an exact-match allowlist from `CORS_ALLOWED_ORIGINS`, no
   `Allow-Credentials` (sessions are bearer tokens in memory, never cookies),
   `Origin: null` refused, and **registered before `/v1` is mounted** so a
   preflight is answered before `requireSession` can 401 it. Unset in production
   means no browser can call the API, and there is deliberately no default —
   `src/dev.ts` supplies the local origins and never ships.

### What each feature's MVP stops at

Every `tasks.md` names a **STOP and VALIDATE** point — the smallest slice worth
demonstrating. The three that gate the most downstream work:

| Feature | MVP is done when |
|---|---|
| **001** | the 60-of-72 enumeration passes and all 243 effectiveness results resolve |
| **002** | `purity.test.ts` is green and the recorded 729-pair figures reproduce |
| **007** | a full battle runs in 20–40 requests and survives a cold API restart |

### Where the ordering deviates from spec priority, and why

Four features sequence a later-listed story first, each on an explicit instruction
in its own plan:

- **002** — US2 (purity) before US1, because `purity.test.ts` must be red-then-green
  *before any rule exists* or it gets written to fit whatever got built.
- **007** — US2 (idempotency) before US1, because it is a schema constraint: cheap
  now, a migration later.
- **011** — US3 (the grant path) before US1, because a grant path that trusts the
  client is a free storefront.
- **013 / 014** — the concurrency test and the moderation ordering respectively,
  both **before the happy path**, because a test written afterwards is written
  against an implementation that already has a shape.

### The three cross-feature seams the tasks test *across*

These pass when tested inside one feature and fail in production:

| Seam | Test | Why it is easy to miss |
|---|---|---|
| **015 → 008** retention hold | `retentionSeam.test.ts` | a hold only 015 knows about is a hold the cleanup job ignores |
| **009 → 013** starter warning | `starterWarning.test.ts` | it renders in 013 and is owned by 009; **it has been lost three times** |
| **004 → 006** firing profile | `firingProfile.test.tsx` | if a network request appears while dragging a ranking, it moved back to `ai/` |

## Still open from the Phase 0 pass

**Four tests to write before the code they cover**, each named in its quickstart:

- `purity.test.ts` (002) — no entropy source reachable in `sim/rules`, **and** no
  transitive import of `resolver/` or `ai/` from the client
- `determinism.test.ts` (003) — 1,000 replays, **byte-identical**, not deep-equal
- the alternating-battles leak test (012) — proves *selected*, not *filtered*
- `ordering.test.ts` (014) — the blocklist gates, the classifier does not; drawn
  backwards by two generated diagrams

**Three questions are specified but not yet run**, and each names its measurement:

| Question | Needs | Where |
|---|---|---|
| Classifier quality at 100 items per call | the live model + a 300-message hand-labelled set | `015/research.md` |
| Whether Hidden actually holds better than Visible | production battles — the whole zone commitment rests on it | `010/research.md` |
| Requests per battle (predicted 20–40) | the first real battles; `turnCount` vs action-log length answers it with no new field | `007/research.md` |

**Two proposals raised, not taken** — both are canon changes, both are cheap now and
expensive later:

- **Cap Global chat room size** (feature 014). Fan-out cost is quadratic in players.
- **Start new accounts at the population median** rather than a fixed 1000 (feature
  010), because the Hidden bonus inflates the population.

~~**One open authoring question**: do bots carry Hidden squads?~~ **Settled
2026-07-28 — they do**, and `09-matchmaking.md` had already said so: a bot is *"a
gear score, a Visible squad, a Hidden squad, and a `07-defense-ai.md` configuration
— precisely what a player's defense record is, minus the account."* The Phase 0 pass
raised it as open because it read `07-defense-ai.md`, which covers defenders only.
**The genuinely undecided half was which squad is harder, and it is Hidden** — each
bot's Hidden squad is authored one band up its own ramp (009 T046). The bot pool is
therefore **~130 squads, the single largest authoring job in the project.**

**A working Python 3.13 interpreter is at `py`** — the bare `python` on PATH is a
Store stub.

## Carried risks and deferred work

- **The hero-numbers pass has not run.** Every formula is specified; the values
  are still a Role-shaped template. Blocks no spec; blocks all balance. Under the
  **no-nerf rule** this is the last moment numbers move freely.
- **Zone balance is an untested commitment.** Neither Visible nor Hidden may
  dominate, and it rests on Hidden holding better. **If the hold rates converge,
  Visible wins both currencies and the choice collapses.** Only feature `008`'s
  recorded metadata can detect it.
- **The battle metadata row cannot be backfilled** (Constitution XVI). Turn count,
  squad composition both sides, a bot flag and league-at-battle-time must ship
  with the first battle ever recorded.
- ~~**Two figures to verify before launch**~~ — **both verified 2026-07-28.**
  **Vercel Blob has no lifecycle expiry**, so the cleanup cron ships; `del()` is free
  and `list()` is billed, which confirms the Postgres-driven design twice over.
  **Ably** is 200 peak connections free, $29/mo for 10,000, then $2.50/M messages and
  $1.00/M connection-minutes. **The open figure that replaced them is Global chat
  fan-out**, which is quadratic in players and unbounded without a room cap.
- **Steam auth has never been prototyped.** A spike to schedule, not a risk to
  retire — 1.0 must get the *seam* right, not the integration.
- **Reactive powers are specified but unpopulated**, leaving two unique passives
  dead. Authoring belongs with the hero-numbers pass.
- **Guild events, Wings and guild funds are deferred** with their design. Guilds
  keep roster, roles and permissions.

## Blockers

- None.
