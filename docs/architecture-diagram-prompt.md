# Claude Design Prompt — LMNTLZ System Architecture

> **How to use:** Paste the PROMPT section into Claude Design. It is self-contained
> — it does not assume access to this repo.
>
> **Source of truth is `docs/tech-stack.md`.** This prompt is derived from it and
> is downstream of it. If the generated diagram and that document disagree, the
> document is right and the diagram is wrong — the same rule that governs
> `resources/designsystem/` (`CLAUDE.md`, *Where the rules actually live*).
>
> **This lives in `docs/` rather than `resources/`** because `resources/00`–`07`
> are player-facing screen prompts built on the LMNTLZ style system. This is an
> internal technical document and is read, not played.

---

## PROMPT

Design a **system architecture diagram** for **LMNTLZ**, a competitive asynchronous
fantasy squad battler. It is a technical reference for the developer building it —
a single page that can be read at a glance and returned to for detail.

**What the game is, only as far as the architecture needs:** players build squads
of 6 heroes and attack snapshots of other players' defense squads. There is no
realtime multiplayer and no netcode — a battle is one player against a stored
squad, resolved turn by turn. Combat is discrete and turn-based. The game ships
first as a **browser build**, with a **Steam/Electron build as a later
fast-follow** running the identical bundle.

### MUST SHOW — the simulation seam

**This is the single most important thing on the page, and it is the thing a
diagram most easily blurs.** The shared simulation package splits in two, and the
split is a security boundary, not a code-organization preference:

| Half | Contains | Runs on |
|---|---|---|
| **Rules** | Targeting legality and reach, type effectiveness, cooldowns, turn order, the damage *formula*. **Pure — no randomness.** | **Both** client and server |
| **Resolver** | Hit/miss, critical hits, status application, the defense AI's decisions. **Consumes randomness.** | **Server only** |

Draw these as **two distinct blocks inside one package**, not as one box labeled
with both names. Then draw the boundary explicitly:

> **The random seed never crosses to the client.** Show this as a visible,
> labeled line. It is *why* the architecture is shaped this way: a client holding
> the seed could read every future roll — which attacks will crit, which will miss,
> what the AI is about to do. Server authority means that exploit does not exist,
> rather than being caught afterwards.

Show the **payoff** of sharing the rules half too, since it is the reason the seam
is worth the complexity: because the client runs the same rules the server does, it
can draw the targeting UI, project the turn queue, and preview "super effective"
**without asking the server anything**.

### The zones

Lay the page out in five zones. Group by trust and ownership, not by vendor.

**1 · Clients — untrusted**

- **Browser SPA** — Vite + React + Tailwind, a static bundle served from a CDN.
  **This is the entire 1.0 client.**
- **Electron + Steam** — the same bundle wrapped, plus the Steam integration
  library. **Mark it visually as a later fast-follow** (dashed outline or a
  "post-1.0" tag) — it does not exist at launch, but the seams for it do.
- Both clients contain the **rules** half of the simulation and nothing else from
  it.

**2 · Edge and API — trusted**

- **Versioned JSON REST API** (`/v1/...`) on serverless functions. Versioned
  deliberately, because a downloaded Steam client can be several releases stale.
- The API is the **only** writer to every store below it.
- A **maintenance flag** read from edge config with three states — `live`,
  `draining`, `down` — where `draining` refuses new battles but lets in-flight ones
  finish.

**3 · Data**

- **Postgres** — accounts, guilds, squads, ratings, entitlements, refresh tokens,
  and **battle metadata**.
  > **Do not label this store "kept forever."** Only **battle metadata** is
  > permanent. **Chat messages live in their own tables under their own retention
  > policy** — a deliberate separation, because it is what makes moving chat onto a
  > separate store later a mechanical change rather than a rewrite. Show chat as a
  > **distinct, retention-bound** group inside the relational store, not as one more
  > item in a list labeled permanent.
- **Blob storage** — battle replay event logs, **expiring after 7 days**.
- **Edge config** — the maintenance flag only.

**4 · Managed services**

Realtime pub/sub · transactional email · payments (merchant-of-record) · error
monitoring · **AI chat moderation**. Draw error monitoring receiving from **both**
the client and the API, since client-side crashes are otherwise invisible.

**The moderation classifier is a real outbound dependency and needs its own node.**
The API calls it for **every message** — nothing is sampled — in batches of 100
through a batch API. It is easy to omit because the chat flow reads as a single
step ("the API moderates"), but that step leaves our infrastructure.

**5 · Identity providers**

Google (ID token verification) and Steam (session ticket verification). **Both feed
into one account.** A single player may hold both identities — show them
converging, not as parallel silos.

### The flows to label

Number these on the diagram and give each a one-line caption. They are what makes
it a diagram rather than an inventory.

1. **A battle turn.** Client sends an *intent* (`battleId, heroId, powerId,
   targetId`) → API replays the append-only action log to rebuild state → resolver
   applies it → appends → returns one packet covering the player's action *and
   everything following it* until the next real choice. **Label clearly: no
   in-progress battle state is ever stored.** State is re-derived from the log every
   request, so there is exactly one source of truth and it cannot desynchronize.

2. **Chat.** Client POSTs a message to the API → the API authorizes the scope,
   charges any currency cost, persists, and **calls the moderation classifier** →
   **then** publishes to the realtime service → which fans out to subscribers.
   > **Draw the classifier call as its own arrow leaving Zone 2.** Collapsing it
   > into the word "moderates" hides the stack's largest per-message dependency.
   > **Show the arrows asymmetrically: clients subscribe, clients never publish.**
   > This is correctness, not hardening. Some chat postings cost in-game currency,
   > so a client able to publish directly to the broker would bypass the charge.
   > The broker's only job is fan-out.

3. **Sign-in.** Google ID token or Steam session ticket → API verifies against the
   provider → upserts the account → issues **our own** signed token. Refresh tokens
   live in Postgres.

4. **Purchase.** Checkout at the payment provider → webhook to the API → entitlement
   granted. **Label the entitlement as belonging to the account, never to the
   storefront** — a purchase made in a browser is present in the Steam build.

5. **Replay lifecycle.** On battle completion the metadata row is written to
   Postgres (permanent) and the event log to blob storage (7 days). A scheduled job
   deletes expired logs, **driven by a Postgres query rather than by listing the
   bucket** — so the database stays the authority on retention.

### Things that are easy to get wrong

Worth checking the finished diagram against:

- **The API never holds an open socket.** The client's realtime connection goes
  **directly to the pub/sub service**; the API only publishes to it over REST. Draw
  those as two separate arrows, not one line through the API.
- **Replays are stored, never regenerated.** Do not draw an arrow suggesting a
  replay is re-simulated on demand. It is played back as recorded, so a balance
  patch can never change the outcome of a past battle.
- **The seed line is a boundary, not a data flow.** Nothing should cross it.
- **Rules appear in two places on purpose.** That is not duplication to flag — it is
  one package imported by both sides, and it should read that way.
- **Steam is not a second backend.** It is a second client shell and a second
  identity provider. Everything behind the API is identical.
- **The relational store is not uniformly permanent.** Battle metadata is; chat is
  retention-bound in its own tables. A single "kept forever" label across the whole
  store is wrong and would mislead anyone building the schema.
- **"The API moderates" is an outbound call, not an internal step.** If the chat
  flow shows no arrow leaving Zone 2 for a classifier, the diagram is incomplete.

### Visual direction

Legibility outranks style here — but this sits in a project with a strong visual
identity, so it should not look like default diagramming software.

- **Dark background**, consistent with the game's UI. Restrained accent color used
  to carry meaning, not decoration.
- **One accent reserved for the trust boundary** and the seed line, so the eye finds
  the security story first.
- **Clean typography, generous spacing, high contrast.** Every label readable at
  100% without zooming.
- **Vendor names in a secondary weight** beneath the role they serve, so the
  architecture reads even to someone who does not recognize them — *"Realtime
  pub/sub"* in primary, the product name beneath.
- Distinguish **synchronous request/response** from **asynchronous push** with two
  different line treatments, and include a small legend.
- **Fits one page** at desktop width. Detail belongs in the captions, not in more
  boxes.

### Non-goals

Do not include: a database schema or table list, sequence diagrams, deployment
regions or scaling topology, monorepo folder structure, or any per-screen UI
breakdown. This is one systems view — what talks to what, which way, and where the
trust boundary sits.
