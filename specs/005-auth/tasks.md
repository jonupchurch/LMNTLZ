# Tasks: Identity & Authentication

**Input**: Design documents from `/specs/005-auth/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/auth-api.md](contracts/auth-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 1

**Tests**: **Included.** The rotation cases and the confusable-username cases are
each a class of bug that a plausible implementation passes most of and fails the
one that matters.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Exact file paths in every task

## Path Conventions

`apps/api/src/auth/`, `apps/api/src/db/schema/`, `apps/api/tests/auth/`.

> **Feature 005 carries the API bootstrap.** It is the first app-layer feature, so
> Phase 1 stands up Hono, Drizzle and Neon once for features 005–016.

> **The decision that touches every table**: `Account.id` is an **immutable
> internal identifier**, and `username` is a separate, mutable, uniquely-indexed
> column. Moderation makes forced rename real, so this is required rather than
> merely wise — with an internal identifier a forced rename is one column; without
> one it rewrites the whole schema.

---

## Phase 1: Setup (the API app, once for features 005–016)

> ### ⛔ STOP — this phase needs accounts Jon has to create
>
> **Features 001–004 need no infrastructure at all. This is the first task in the
> project that does.** Do not start T001 until these exist, and **do not create
> them on Jon's behalf** — they are billable accounts under his name.
>
> | Needed | For | Who |
> |---|---|---|
> | **Vercel project** linked to the repo | T001's Functions entry point, and every deploy after | **Jon** |
> | **Neon project** + connection string | T002's Drizzle client | **Jon** |
> | **Google OAuth client** (web) + client ID | T012 onward — Google ID token verification | **Jon** |
>
> Jon asked to be told when this moment arrives (2026-07-28). **Tell him at the
> 004 → 005 boundary, not when T001 fails.** Credentials go in a gitignored
> `.env.local` he sets himself — never pasted into a session transcript.
>
> **Neon is the database for every environment**, tests included. A local
> PostgreSQL 15 exists on the machine as a fallback if the DB test suite ever gets
> slow enough to tax the edit-test loop; it is not part of the design.

- [x] T001 Scaffold `apps/api/` — `package.json` named `@lmntlz/api`, `tsconfig.json` extending the base, Hono, and a Vercel Functions entry point
- [x] T002 Add Drizzle and the Neon driver to `apps/api/` — `drizzle.config.ts`, a `db/client.ts` with the pooled connection, and `migrate`/`generate` scripts
- [x] T003 [P] Add `jose` to `apps/api/` — one dependency covering Google ID token verification **and** our own JWT signing, with no transitive dependencies and identical behaviour on Node and the edge
- [x] T004 [P] Add the versioned router skeleton in `apps/api/src/index.ts` — everything under `/v1`, with a JSON error shape shared by all sixteen features
- [x] T005 [P] Add an `auth` test project to `apps/api/vitest.config.ts` and a Playwright config at `apps/api/playwright.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, and the request-context convention fifteen other features inherit

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

> **Schema before routes.** `Account.id` versus `username` is the decision every
> later table depends on and it must be settled in **migration one**.

- [x] T006 Define the `accounts` table in `apps/api/src/db/schema/accounts.ts` — `id` (immutable), `username` (display, stored exactly as typed, NFC), `username_key` (unique, computed), `created_at`, `banned_until`, `ban_scope` (FR-001, FR-002)
- [x] T007 Define the `identities` table in `apps/api/src/db/schema/identities.ts` — `account_id`, `provider`, `provider_subject`, with `UNIQUE (provider, provider_subject)`. **Steam is a second row, never a second column and never a second account table** (FR-007, FR-008)
- [x] T008 Define the `renewal_tokens` table in `apps/api/src/db/schema/renewalTokens.ts` — `id`, `family_id`, `token_hash` (sha256; **the raw token is never stored**), `replaced_by`, `issued_pair`, `used_at`, `expires_at`
- [x] T009 Generate and apply migration one from `apps/api/drizzle/`
- [x] T010 Define `RequestContext` in `apps/api/src/auth/context.ts` carrying `accountId` and `sessionId` **from the verified session**, and establish that a route acting on another account takes a differently-named parameter (`targetId`) (FR-018)
- [x] T011 Add the convention guard to `apps/api/tests/auth/convention.test.ts` — `rg "body\.accountId|params\.accountId|query\.accountId" apps/api/src` **must return nothing**

> **T011 is the single convention fifteen other features depend on, and the one
> whose violation is invisible in review.** It is cheap here and unbounded later.

**Checkpoint**: The identity model is settled and every later feature can hang off it

---

## Phase 3: User Story 1 - A player signs in and is themselves (Priority: P1) 🎯 MVP

**Goal**: Google sign-in resolves to an account, and the player receives a token issued by us.

**Independent Test**: Sign in, confirm the account resolves, sign out, sign in again, confirm the same account.

### Tests for User Story 1 ⚠️

- [x] T012 [P] [US1] Write `apps/api/tests/auth/google.test.ts` — a token with `alg: none` or a symmetric algorithm is `401`; a valid Google token minted for a different `aud` is `401`; a tampered or expired token creates **no** account
- [x] T013 [P] [US1] Write `apps/api/tests/auth/jwks.test.ts` — one fetch for the first verification, still one after 100 more, **one** refetch on an unknown `kid`, and **still one** after 100 more unknown `kid`s (the cooldown)
- [x] T014 [P] [US1] Write `apps/api/tests/auth/rotation.test.ts` — the three cases: a fresh renewal gives a new pair; the **same** token replayed inside 60 s with its successor unused gives **the same pair, byte-identical**; using the new pair then replaying the old gives `401` and **kills the entire family**

> **T013 step 4 is the rate-limit guard.** Without the cooldown a forged token with
> a random `kid` is a fetch amplifier pointed at Google, and the first symptom is
> Google rate-limiting real sign-ins.

> **T014 case 3 is the one to write explicitly.** A grace-period implementation
> passes case 2 and fails case 3 — it hands the replayer a genuinely valid
> credential — so case 2 passing does not imply case 3 does.

### Implementation for User Story 1

- [x] T015 [US1] Define the `IdentityProvider` interface in `apps/api/src/auth/provider.ts` — Constitution XIX's seam, with `jose` as one implementation behind it
- [x] T016 [US1] Implement Google verification in `apps/api/src/auth/google.ts` with a **module-level** `createRemoteJWKSet`, `cooldownDuration: 30_000` and `cacheMaxAge: 30 min` (research.md Q1)
- [x] T017 [US1] Verify — not parse — every claim in `apps/api/src/auth/google.ts`: signature against the JWKS **`RS256` only**, `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `aud` exactly our client id, `exp`/`iat` with ≤60 s skew
- [x] T018 [US1] Key the account on `sub` in `apps/api/src/auth/google.ts` and store `email` **for contact only** — a player can change their Google address, and keying on email is the single most common way provider-agnostic identity is quietly lost

- [x] T019 [US1] Implement session and renewal issuance in `apps/api/src/auth/tokens.ts` — session **15 minutes**, renewal **30 days sliding**, family absolute expiry **90 days** (FR-011, FR-012)
- [x] T020 [US1] Implement the four-state rotation rule in `apps/api/src/auth/tokens.ts` — unused → new pair; used <60 s with an unused successor → **replay the stored `issued_pair`**; used in any other case → **revoke the whole family**; expired → `401` (research.md Q2)
- [x] T021 [US1] Store only `sha256(token)` in `apps/api/src/auth/tokens.ts` — not a password KDF, because the token is 256 bits of entropy with nothing to brute force and a slow hash would only cost latency on every renewal (FR-013)
- [x] T022 [US1] Implement `POST /v1/auth/google` in `apps/api/src/auth/routes.ts` with the full status table — `200`, `400`, `401`, `403` (banned, including `scope` and `until`), `503` (maintenance `down`)
- [x] T023 [US1] Implement `POST /v1/auth/renew` and `POST /v1/auth/revoke` in `apps/api/src/auth/routes.ts` — revoke takes the whole family and is idempotent, returning `204`
- [x] T024 [US1] Implement `GET /v1/me` in `apps/api/src/auth/routes.ts` — **never returning the provider subject, the email, or any token** (Constitution XVII)
- [x] T025 [US1] Refuse a suspended account in `apps/api/src/auth/middleware.ts` even when it presents a previously valid token (FR-015)

**Checkpoint**: A player can sign in, stay signed in, and sign out. Every later feature has an `accountId` to work from.

---

## Phase 4: User Story 2 - One player, two doors, one account (Priority: P1)

**Goal**: The seam, built and dormant. Adding Steam later changes nothing outside this feature.

**Independent Test**: Link a second provider to an existing account and confirm one account results, not two.

> **Do not wire Steam.** Build the module, write its shape, leave it unreachable.
> The temptation is to finish it because it is nearly done; the decision is that
> 1.0 ships without it.

### Tests for User Story 2 ⚠️

- [x] T026 [P] [US2] Write `apps/api/tests/auth/linking.test.ts` — linking a provider subject already attached elsewhere is `409` with **no merge**; linking a second provider to the same account yields **one** account; `POST /v1/auth/steam` is `501`
- [x] T027 [P] [US2] Write `apps/api/tests/auth/providerAgnostic.test.ts` — grep every route outside `apps/api/src/auth/` for any read of `provider` and assert **zero** matches (SC-003), and assert `accounts` has **no `steam_id` column**

### Implementation for User Story 2

- [x] T028 [US2] Write `apps/api/src/auth/steam.ts` as a **designed, unwired** module implementing `IdentityProvider` with its session-ticket verification shape recorded and its body returning `501` (FR-010)
- [x] T029 [US2] Implement `POST /v1/auth/steam` in `apps/api/src/auth/routes.ts` returning `501 Not Implemented` — the route, the identity row and the interface all exist and are unused
- [x] T030 [US2] Implement `POST /v1/auth/link` in `apps/api/src/auth/link.ts` — `204` on success, `409` when that subject belongs to another account, `409` when this account already has an identity for that provider. **It never merges two accounts** (FR-008)
- [x] T031 [US2] Refuse unlinking an account's only provider in `apps/api/src/auth/link.ts` — an account must retain at least one way in (FR-009)
- [x] T032 [US2] Exclude `apps/api/src/auth/steam.ts` and any Steam dependency from the browser client build and assert it in `apps/api/tests/auth/providerAgnostic.test.ts` (SC-007)

**Checkpoint**: SC-008 holds — adding Steam later touches this feature and nothing else.

---

## Phase 5: User Story 3 - A renamed player breaks nothing (Priority: P2)

**Goal**: A rename — voluntary or forced — leaves every battle, replay, rune, membership and message intact.

**Independent Test**: Rename an account with history attached and confirm nothing is orphaned.

### Tests for User Story 3 ⚠️

> **Write T033 early.** plan.md is explicit: it is trivial now and it is the
> regression that catches someone later "simplifying" by keying on username.

- [x] T033 [US3] Write `apps/api/tests/auth/rename.test.ts` — create an account, attach records across several tables, rename it, and assert **zero** orphaned references (SC-004)
- [x] T034 [P] [US3] Write `apps/api/tests/auth/usernameKey.test.ts` — the six-line quickstart table: `Reyna` ok, `reyna` `409 case`, `Ｒeyna` `409 exact`, `rеyna` **`409 confusable`** (Cyrillic е), `admin` `422 reserved`, `аdmin` `422 reserved` (the skeleton matches), `Bramwen` **ok** because hero names are not reserved
- [x] T035 [P] [US3] Assert in `apps/api/tests/auth/usernameKey.test.ts` that the **display form survives** — registering `"Reyna Two-Rivers"` and reading `GET /v1/me` returns it exactly as typed, never the folded key

> **The Cyrillic cases are the ones that matter.** A plain lowercase-compare
> implementation passes every other line and fails those two — and a game with
> guild masters, an officer role and a public profile has a live impersonation
> surface.

### Implementation for User Story 3

- [x] T036 [US3] Implement `usernameKey(display)` in `apps/api/src/auth/username.ts` in three steps — NFKD normalise and strip combining marks, case-fold, then the **Unicode TR39 confusable skeleton**. Steps 1–2 are hygiene; **step 3 is the security control** (research.md Q3)
- [x] T037 [US3] Store display and key separately in `apps/api/src/auth/username.ts` and **never reconstruct one from the other** — the key is lossy on purpose and rendering it back would show a player a name they did not choose
- [x] T038 [US3] Implement `isReserved(key)` in `apps/api/src/auth/username.ts` — the reserved list runs through `usernameKey` too, **or it reserves nothing**. Reserve `admin`, `moderator`, `mod`, `system`, `lmntlz`, `support`, `staff`, `envoy`, `official`; **do not** reserve the 12 House names or the 27 hero names
- [x] T039 [US3] Validate length 3–16 and the character set in `apps/api/src/auth/username.ts` — Unicode letters, digits and `_`, with no leading/trailing `_` and no doubled `_`
- [x] T040 [US3] Implement `PUT /v1/me/username` in `apps/api/src/auth/routes.ts` with the full status table — `409` **naming which rule matched** (`exact` · `case` · `confusable`), `422` for length/charset/reserved, `429` for the rate limit, `402` for insufficient shards
- [x] T041 [US3] Enforce **3 changes per 30 days regardless of shards** in `apps/api/src/auth/username.ts` — a name that changes hourly defeats every human-scale mechanism that depends on recognising an opponent
- [x] T042 [US3] Make the first change at creation free, a voluntary rename cost **325 shards** (feature 010's ledger), and a moderation-forced rename **free** (feature 015) — in `apps/api/src/auth/routes.ts` (FR-004)

**Checkpoint**: Renames are safe, and impersonation by lookalike is refused.

---

## Phase 6: User Story 4 - A stolen client learns nothing useful (Priority: P2)

**Goal**: A fully extracted client build contains no key, credential or shared secret.

**Independent Test**: Inspect a full client build for credentials. There are none.

### Tests for User Story 4 ⚠️

- [x] T043 [P] [US4] Write `apps/api/tests/auth/clientSecrecy.test.ts` — scan a built `apps/client` bundle for any signing key, API secret or shared credential and assert **zero** matches (SC-005)
- [x] T044 [P] [US4] Add the authorization test to `apps/api/tests/auth/middleware.test.ts` — a token belonging to another player grants **only that player's** access, never elevated access

### Implementation for User Story 4

- [x] T045 [US4] Implement session verification middleware in `apps/api/src/auth/middleware.ts` — populating `RequestContext.accountId` from the verified token and **never trusting a client-supplied identity or permission claim** (FR-017, FR-018)
- [x] T046 [US4] Confirm no signing key or provider secret reaches the client build — keep every secret in `apps/api` environment configuration and document the list in `apps/api/README.md` (FR-016)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T047 Add response-shape assertions to `apps/api/tests/auth/` — **no** response anywhere contains a provider subject, an email, or a token hash (Constitution XVII)
- [x] T048 [P] Write `apps/api/src/auth/README.md` — the identity model, the four rotation states, and the standing rule that `accountId` comes from the session
- [ ] T049 Run the full quickstart manual pass, including the JWKS rotation check against a fixture — sign with a key absent from the fixture and confirm `401`, add the key, confirm success after the cooldown

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — and it is the API app's bootstrap, so it runs once
- **Foundational (Phase 2)**: depends on Setup — **blocks all four stories**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: needs the `IdentityProvider` interface (T015)
- **US3 (Phase 5)**: needs the `accounts` schema (T006). Otherwise independent of US1 and US2
- **US4 (Phase 6)**: needs token issuance (T019)
- **Polish (Phase 7)**: depends on all four

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P1)**: US1's provider interface only
- **US3 (P2)**: none beyond the schema — **can run fully in parallel with US1**
- **US4 (P2)**: US1

### Within Each User Story

- Tests written and **failing** before implementation
- **Schema before routes**, always
- `usernameKey` before any route that validates a username

### Parallel Opportunities

- T003, T004, T005 in parallel after T001/T002
- T012, T013, T014 in parallel — three test files
- **US3 in parallel with US1** — different files, and its schema dependency lands in Phase 2
- T026, T027 in parallel · T043, T044 in parallel

---

## Parallel Example: User Story 1

```bash
# Three independent test files, all red first:
Task: "google.test.ts — alg:none, wrong aud, tampered token"
Task: "jwks.test.ts — one fetch, one refetch, cooldown holds"
Task: "rotation.test.ts — fresh, idempotent retry, theft kills the family"
```

---

## Implementation Strategy

### MVP First (US1)

Sign-in is the gate on the entire game. Stop after Phase 3 and validate: sign in,
call `/v1/me`, renew, revoke — and run all three rotation cases, because two of
them are only ever exercised by accident in production.

1. Phase 1–2: the API app and **migration one**
2. Phase 3: US1 — **STOP and VALIDATE** the rotation table
3. Phase 4: US2 — the seam, unwired
4. Phase 5: US3 — renames and the confusable check
5. Phase 6–7: client secrecy and polish

### Incremental Delivery

US3 is P2 by urgency and near-P1 by cost: `username_key` is a unique index on a
table that will have rows in it. Land it before real accounts exist.

---

## Notes

- **There are no passwords.** Both providers hand over a verified identity, so
  hashing, reset flows and email verification are simply absent. What is genuinely
  owned is issuance, rotation, revocation and linking.
- **Account merging is out of scope and distinct from linking.** A merge would have
  to reconcile two shard ledgers, two rating histories and two guild memberships,
  every one of which is append-only. `409` and a support path is the honest answer.
- **Steam auth has never been prototyped end to end.** That is a spike to schedule,
  not a risk to retire — 1.0 must get the *seam* right, not the integration.
- **Account deletion and its cascade are not settled here.** They belong with
  feature 012's export work, where the full list of what an account owns is
  already being enumerated.
- Commit after each task or logical group; work goes straight to `main`.
