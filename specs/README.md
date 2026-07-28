# LMNTLZ — the 1.0 feature set

**Scope locked 2026-07-28.** Principle VII requires every feature in the initial
set to be specified *and* planned before any of it is implemented, so this index
exists before the specs do. Its job is to make the shared models and the build
order visible on paper, which is the whole point of planning the set rather than
the feature.

## What is in, and what is not

| In 1.0 | Out, and why |
|---|---|
| The full playable loop | **Runic equipment** — explicit *"planned fast-follower"* (`../resources/mechanics/README.md`) |
| Passes and entitlements | **Steam / Electron** — *"1.0 is the browser build alone"*; the seams are built, nothing runs |
| Guilds, chat, profiles, moderation | **Guild events, Wings, guild funds** — **event design is parked**, and you cannot specify what is not designed |

> **Wings go with events.** A Wing exists only for an event, so deferring events
> defers Wings — they are not separable. Guilds keep their roster, roles and
> permissions; they simply have nothing to compete in yet.

> **Two starter-league exits survive the cut and two are load-bearing.** Joining a
> guild and founding one are both doors out of the beginner league
> (`../resources/mechanics/09-matchmaking.md`), which is why guilds are in 1.0
> rather than deferred with the rest of the social layer.

## The sixteen features, in dependency order

Nothing here may be implemented until every row is specified and planned.

### Layer 0 — depends on nothing

| # | Feature | Covers | Source |
|---|---|---|---|
| 01 | **content** | The 27-hero roster as validated data. The `counter` bijection, **generated** bane/fault, the generated 9×9 matrix, the three distinctness rules in schema, powers, reach. | `01`, `02`, `03` |

### Layer 1 — the simulation

| # | Feature | Covers | Source |
|---|---|---|---|
| 02 | **sim-rules** | Pure, no randomness, **runs on both client and server**. Reach and targeting legality, type effectiveness, cooldowns, the turn-order accumulator, the damage formula. | `01`, `02`, `03`, `04` |
| 03 | **sim-resolver** | Consumes randomness, **server only**. Hit/miss, crits, status application, the 300-turn cap and its pooled-HP resolution. | `01`, `04`, `05` |
| 04 | **defense-ai** | The engine plays *every* defense squad — the defensive half of the game. | `07` |

> **02 and 03 are specified separately on purpose.** They are one package with one
> internal seam, and that seam is Principle XII: rules are pure and shared,
> the resolver holds the RNG, and the seed never crosses. Specifying them as one
> feature would let the boundary blur exactly where it must not.

### Layer 2 — the spine

| # | Feature | Covers | Source |
|---|---|---|---|
| 05 | **auth** | Accounts, Google ID tokens, our own JWTs, refresh tokens. **Provider-agnostic identity** with the Steam seam built and unused. | `docs/tech-stack.md` |
| 06 | **roster-and-squads** | View all 27. Build two defense zones (12 heroes) and up to three attack squads from the remaining 15. Overlap, eviction, and the hold streak that resets on edit. | `02` |

### Layer 3 — the loop

| # | Feature | Covers | Source |
|---|---|---|---|
| 07 | **battle** | Intent → resolve → one packet. The **append-only action log** and no stored in-progress state. Maintenance drain and the no-op discard. | `04`, `docs/tech-stack.md` |
| 08 | **replays** | Event logs to Blob for 7 days; the **metadata row kept forever**. The 50-entry list, report preservation, the cleanup job driven from Postgres. | `docs/tech-stack.md` |
| 09 | **matchmaking** | Rating, leagues, bot distribution, the **starter league**, Visible/Hidden zone selection, ambush at +2%/win capped at 90%. | `09` |

### Layer 4 — the economy

| # | Feature | Covers | Source |
|---|---|---|---|
| 10 | **progression** | Shards, runes (3 slots × 4 stages), gear score recomputed on placement, the **6,500 balance cap** and its three asymmetric rules. | `06` |
| 11 | **payments** | Paddle as merchant of record, seven pass durations, **account-level entitlements**, the rail interface. | `06`, `docs/tech-stack.md` |

### Layer 5 — social

| # | Feature | Covers | Source |
|---|---|---|---|
| 12 | **profiles** | The public profile, the **last 20 Visible battles selected rather than filtered**, CSV export with no squad composition. | `11` |
| 13 | **guilds** | Founding at 650, three roles, invites, concurrent applications with first-acceptance-wins, succession, the emblem. | `08` |
| 14 | **chat** | Six scopes, Ably as **fan-out only**, the synchronous blocklist gate, paid embeds at 5/10/25. | `11` |
| 15 | **moderation** | The **asynchronous** classifier, reports, automatic mutes and human bans, Envoys with no powers. | `11` |

### Layer 6 — operations

| # | Feature | Covers | Source |
|---|---|---|---|
| 16 | **ops-admin** | The three maintenance states, admin and moderation tooling, scheduled jobs. | `docs/tech-stack.md` |

## The shared models — why the set is planned before it is built

These cross feature boundaries. Each one is a place where specifying features one
at a time would let two of them assume different shapes.

| Model | Defined by | Consumed by |
|---|---|---|
| **Hero** | 01 | everything |
| **Squad** — 6 heroes in 2/3/1 | 06 | 07, 04, 08, 12, 14 |
| **Account** | 05 | everything |
| **Shards** | 10 | 11, 13 *(founding)*, 14 *(embeds)* |
| **Rating and league** | 09 | 08, 12, 13 |
| **Battle record** | 07 | 08, 09, 10, 12 |

> ### The battle record is the one that cannot be fixed later
>
> **Constitution XVI.** Because LMNTLZ runs **no analytics vendor**, this row *is*
> the analytics product — every testable commitment in the design is a battle
> question answered by SQL against it. It must carry **turn count · squad
> composition for both sides · whether the defender was a bot · league and rating
> at the time**, alongside `engineVersion` and `contentVersion`.
>
> Four features write to it and four read from it, so its shape has to be settled
> once, here, rather than negotiated four times. **A field missing from the first
> battle ever recorded is missing from the history the first balance pass reads** —
> and under the no-nerf rule that pass is the one that matters most.

## Build order

`packages/content` then `packages/sim`, headless, with tests — settled, and not a
matter of preference. They depend on nothing while everything depends on them, and
the design is server-authoritative, so **the sim *is* the game**. Do not propose
starting with a screen, a schema, or an API route.

`packages/sim`'s rules half is where testing earns most: pure, shared and RNG-free
by construction, therefore **exhaustively testable without mocks**. Property tests
over the 729 type pairings and the 27-hero roster are worth more here than
anywhere else in the codebase.
