# API Contract: Authentication & Accounts

**Feature**: `005-auth` | Versioned JSON REST under `/v1`.

**The convention every other feature inherits**: `accountId` is taken from the
verified session, **never** from a request body or path. A route acting on another
account uses a differently-named parameter (`targetId`) so the two cannot be
confused at a glance.

---

## Routes

### `POST /v1/auth/google`

```jsonc
// request
{ "idToken": "eyJhbGciOiJSUzI1NiIs..." }

// 200 — signed in
{
  "session": { "token": "...", "expiresAt": "2026-07-28T12:15:00Z" },
  "renewal": { "token": "...", "expiresAt": "2026-08-27T12:00:00Z" },
  "account": { "id": "acc_...", "username": "reyna", "createdAt": "..." },
  "isNewAccount": false
}
```

| Status | When |
|---|---|
| `200` | verified; account found or created |
| `400` | malformed token |
| `401` | signature, `iss`, `aud`, or `exp` failed verification |
| `403` | account banned — includes `scope` and `until` |
| `503` | maintenance state is `down` |

**Verified, not parsed**: signature against the JWKS with `RS256` only · `iss` ∈
{`accounts.google.com`, `https://accounts.google.com`} · `aud` = our client id ·
`exp`/`iat` with ≤60 s skew.

**`sub` is the identity. `email` is stored for contact and is never an identity
key** — a player can change their Google address.

### `POST /v1/auth/steam`

```jsonc
{ "ticket": "..." }
```

**`501 Not Implemented` at 1.0.** The route, the identity row and the interface all
exist and are unused. Building the seam is the requirement; running it is not.

### `POST /v1/auth/renew`

```jsonc
{ "renewal": "..." }
```

Same `200` body as `/auth/google` minus `isNewAccount`.

**Rotation semantics — the whole contract is in these four rows:**

| Token state | Response |
|---|---|
| unused | new pair; this token marked used |
| used < 60 s ago **and** its successor is itself unused | **the same pair, again** — the retry, idempotent |
| used, any other case | `401`, and **the entire token family is revoked** |
| expired | `401` |

The second row serves a client that retried a renewal it had already completed,
**without widening the theft window** — the old token stays invalid; a thief
presenting it receives the pair the legitimate client already holds, and the next
legitimate rotation fires row three on both.

### `POST /v1/auth/revoke`

```jsonc
{ "renewal": "..." }     // → 204. Revokes the whole family. Idempotent.
```

### `POST /v1/auth/link`

```jsonc
{ "provider": "steam", "token": "..." }
```

| Status | When |
|---|---|
| `204` | linked |
| `409` | that provider subject already belongs to another account |
| `409` | this account already has an identity for that provider |

**Never merges two accounts.** A merge would have to reconcile two shard ledgers,
two rating histories and two guild memberships — and every one of those is
append-only. `409` and a support path is the honest answer.

### `GET /v1/me`

```jsonc
{
  "id": "acc_...",
  "username": "reyna",
  "createdAt": "...",
  "identities": [{ "provider": "google", "linkedAt": "..." }],
  "entitlements": [ /* feature 011 */ ],
  "starterLeague": { "active": true, "exitsRemaining": [...] }  // feature 009
}
```

Never returns the provider subject, the email, or any token.

### `PUT /v1/me/username`

```jsonc
{ "username": "Reyna Two-Rivers" }
```

| Status | When |
|---|---|
| `200` | accepted |
| `409` | `username_key` collision — **includes which rule matched**: `exact`, `case`, or `confusable` |
| `422` | length, character set, or reserved |
| `429` | 3 changes per 30 days exhausted |
| `402` | shards insufficient (feature 010) — free for the first change and for a moderation-forced rename |

---

## Internal contracts

```ts
/** Constitution XIX — the vendor sits behind this. `jose` is one implementation. */
interface IdentityProvider {
  readonly name: 'google' | 'steam';
  verify(token: string): Promise<
    | { ok: true; subject: string; email?: string }
    | { ok: false; reason: 'malformed' | 'signature' | 'issuer' | 'audience' | 'expired' }
  >;
}

/** NFKD → strip marks → case-fold → TR39 confusable skeleton.
 *  Lossy on purpose. NEVER rendered back to a player. */
function usernameKey(display: string): string;

/** Reserved names run through `usernameKey` too, or they reserve nothing. */
function isReserved(key: string): boolean;

/** The session type. There is no route signature that reads an account
 *  identifier from `body` or `params`. */
interface RequestContext {
  readonly accountId: string;      // from the verified session, always
  readonly sessionId: string;
}
```

## Data

```sql
accounts          id, username, username_key UNIQUE, created_at, banned_until, ban_scope

identities        account_id, provider, provider_subject,
                  UNIQUE (provider, provider_subject)
                  -- Steam is a second ROW, never a second column

renewal_tokens    id, family_id, token_hash, replaced_by, issued_pair,
                  used_at, expires_at
                  -- token_hash is sha256. The raw token is never stored.
```
