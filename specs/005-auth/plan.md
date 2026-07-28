# Implementation Plan: Identity & Authentication

**Feature**: `005-auth` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Shared model**: [`specs/data-model.md`](../data-model.md) § 1 · Account

## Summary

Accounts, provider sign-in and our own session tokens. **Google at 1.0; the Steam
seam built and dormant.** The schema decision — an immutable internal identifier
distinct from the username — is the most expensive thing in the set to retrofit,
so it lands first among the app-layer features.

## Technical Context

**Language**: TypeScript · **Runtime**: Hono on Vercel Functions
**Storage**: Neon Postgres + Drizzle · **Tokens**: `jose`; Google verified against
published JWKS with a vetted library · **Testing**: Vitest + Playwright

**Constraints**: **no hand-written cryptography.** No passwords anywhere. No
credential in any client build.

**Scale**: sign-in is infrequent per player; token renewal is the common call.

## Constitution Check

| # | Constraint | Verdict | Note |
|---|---|---|---|
| XII | Server authority & seed | **PASS** | Authorization decided server-side; no secret in the client |
| XIII | One rules engine | **N/A** | No game rules |
| XIV | Balance upward | **N/A** | No economy surface |
| XV | Derived data is generated | **N/A** | — |
| XVI | Cannot be backfilled | **PASS** | **`Account.id` is the archetype.** Touches every table at once |
| XVII | Storing is not exposing | **PASS** | Provider identity stored, never exposed to another player |
| XVIII | Harm is a gate | **N/A** | Forced rename is feature 15's action |
| XIX | Vendors behind interfaces | **PASS** | Provider-agnostic identity; adding Steam changes nothing outside this feature |
| XX | Written docs are canon | **PASS** | — |

**No violations.**

## Project Structure

```text
apps/api/src/
├── auth/
│   ├── google.ts        ID token verification against JWKS
│   ├── steam.ts         ticket verification — DESIGNED, NOT WIRED at 1.0
│   ├── tokens.ts        issue, renew, revoke
│   ├── link.ts          provider ↔ account linking
│   └── routes.ts        /v1/auth/*
└── db/schema/
    ├── accounts.ts
    └── providerLinks.ts
```

**Structure decision**: `steam.ts` exists at 1.0 as an unwired module with its
verification shape written down. It is not dead code to delete — it is the seam,
and SC-008 is its test.

## Phase 0 — Research

1. **Confirm the Google JWKS verification library and its caching behaviour.**
   Fetching keys per request is a latency and rate-limit problem; caching them
   forever is a rotation problem.
2. **Decide renewal-credential storage and rotation.** Rotation on use is
   standard and detects theft; it also breaks a client that retries a renewal.
   Settle the retry behaviour explicitly.
3. **Settle username rules** — length, character set, normalisation for
   uniqueness, and reserved names. Normalisation matters because a
   case-insensitive collision is a support ticket and a homoglyph collision is an
   impersonation vector.

## Phase 1 — Design

**Contracts**:

```
POST /v1/auth/google   { idToken }        → { session, renewal }
POST /v1/auth/steam    { ticket }         → 501 at 1.0
POST /v1/auth/renew    { renewal }        → { session, renewal }
POST /v1/auth/revoke   { renewal }        → 204
POST /v1/auth/link     { provider token } → 204 | 409 already linked
```

**Every other route in the API takes `accountId` from the verified session and
never from the request body.** That is FR-018 expressed as a convention, and it is
worth stating once here because every later feature inherits it.

**Quickstart**: sign in with a test Google token, confirm an account, rename it,
confirm nothing orphans.

## Phase 2 — Notes for `speckit-tasks`

**Schema before routes.** `Account.id` versus `username` is the decision every
later table depends on, and it must be settled in migration one.

**Write the rename test early** — create an account, attach records, rename,
assert nothing orphans. It is trivial now and it is the regression that catches
someone later "simplifying" by keying on username.

**Do not wire Steam.** Build the module, write its shape, leave it unreachable.
The temptation is to finish it because it is nearly done; the decision is that
1.0 ships without it.
