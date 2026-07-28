# Phase 0 Research: Authentication & Accounts

**Feature**: `005-auth` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions, all answerable now.

---

## Q1 — Google JWKS verification and its caching

**Decision: `jose`'s `createRemoteJWKSet`, one module-level instance, with a
30-minute cooldown on refetch and a hard requirement that an unknown `kid`
triggers at most one refetch per cooldown window.**

```ts
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { cooldownDuration: 30_000, cacheMaxAge: 30 * 60_000 },
);
```

**Rationale**: the plan named both failure modes and they are genuinely opposed —
fetching per request is a latency and rate-limit problem; caching forever is a
rotation problem. `createRemoteJWKSet` resolves them the right way round: it caches
by default and **refetches on an unknown `kid`**, which is exactly the signal that
rotation happened. The cooldown is what stops a forged token with a random `kid`
from turning into a fetch amplifier against Google.

**`jose` rather than `google-auth-library`**: one dependency covers Google ID token
verification *and* our own JWT signing and verification, it has no transitive
dependencies, and it runs unmodified on Node and on the edge. Constitution XIX
wants the vendor behind an interface anyway — `verifyProviderToken(provider,
token)` is that interface, and `jose` is one implementation detail behind it.

**What must be verified, not just parsed** — the list exists because skipping one
is silent:

| Claim | Requirement |
|---|---|
| signature | against the JWKS, `RS256` only — never `alg: none`, never a symmetric alg |
| `iss` | `https://accounts.google.com` or `accounts.google.com` (Google emits both) |
| `aud` | our client id, exactly |
| `exp` / `iat` | with ≤ 60 s clock skew |
| `sub` | **this is the account key** — stable, never reassigned |
| `email` | stored for contact only, **never used for identity** |

> **`sub` is the identity; `email` is a mutable attribute.** A player can change
> their Google email address. Keying on email means that player becomes a
> different account, or worse, collides with someone who later acquires the
> address. This is the single most common way provider-agnostic identity is
> quietly lost.

**The provider-agnostic seam**: `identities(accountId, provider, providerSubject)`
with `UNIQUE (provider, providerSubject)`. Steam is a second row, never a second
column, and never a second account table. The Steam route exists and returns
**501** at 1.0.

---

## Q2 — Renewal credential storage and rotation

**Decision: rotate on use, store only a hash, group tokens into a *family*, and
resolve the retry problem with a bounded idempotency window rather than with a
grace period.**

```
renewal_tokens
  id            uuid
  family_id     uuid            -- one per sign-in
  token_hash    bytea           -- sha256; the raw token is never stored
  replaced_by   uuid null       -- set when this token is rotated
  issued_pair   jsonb null      -- the pair this rotation produced
  used_at       timestamptz null
  expires_at    timestamptz
```

**The rotation rule, in full:**

1. Present a token. Look it up **by hash**.
2. **Unused** → issue a new pair, mark this one used, record `replaced_by` and
   `issued_pair`. Return the new pair.
3. **Already used, and its successor has *not* itself been used, and it was used
   under 60 seconds ago** → **return the same `issued_pair` again.** This is the
   retry, and it is idempotent.
4. **Already used, any other case** → **revoke the entire family.** Two live
   holders of one token is theft, and the honest response is to sign both out.

**Why an idempotency window rather than a grace period**: a grace period leaves the
old token genuinely valid for its duration, so a stolen token works for that long
by design. Replaying the *stored response* leaves the old token invalid — a thief
presenting it gets the same pair the legitimate client already holds, and the
moment either party rotates again, condition 4 fires and both are signed out.
**The retry is served without widening the theft window.**

Condition 3's "successor not itself used" clause is what makes that true: once the
legitimate client has moved on, the replay stops working and becomes a theft
signal instead.

**Storage**: hash only. A leaked database read must not yield usable credentials.
`sha256` and not a password KDF — the token is 256 bits of entropy, so there is
nothing to brute force and a slow hash would only cost latency on every renewal.

**Lifetimes**: session 15 minutes, renewal 30 days sliding, family absolute
expiry 90 days. A player who plays weekly stays signed in; one who leaves for a
season signs in again.

**Alternatives rejected**: no rotation at all (a leaked token is permanent, and
theft is undetectable); rotation with a 60-second grace (serves the retry, widens
the window, and gives the thief a free window on every legitimate renewal).

---

## Q3 — Username rules

**Decision:**

| Rule | Value |
|---|---|
| Length | 3–16 characters |
| Character set | Unicode letters, digits, and `_` — no leading/trailing `_`, no doubled `_` |
| Display | stored exactly as typed, **NFC**-normalised |
| **Uniqueness key** | a separate `username_key` column, unique, computed |
| Changes | one free at creation, then a shard cost; a **forced rename** by moderation is free (feature 015) |

**`username_key` is computed in three steps and the third is the one that matters:**

```
1. NFKD normalise, strip combining marks     "Ｒéyna" -> "Reyna"
2. case-fold                                  "Reyna" -> "reyna"
3. confusable skeleton (Unicode TR39)         "rеynа" -> "reyna"   (Cyrillic е, а)
```

**Steps 1 and 2 are hygiene; step 3 is the security control.** A case-insensitive
collision is a support ticket. A **homoglyph** collision is an impersonation
vector, and it is the one that matters in a game with guild masters, an officer
role, and a public profile — "the guild master is asking you to hand over the
emblem" is a live attack when someone can register a Cyrillic lookalike of the
guild master's name.

> **Store the display form and the key separately, and never reconstruct one from
> the other.** The key is lossy on purpose. Rendering it back to a player would
> show them a name they did not choose.

**Reserved**: `admin`, `moderator`, `mod`, `system`, `lmntlz`, `support`, `staff`,
`envoy`, `official`, plus anything whose skeleton matches one of them — the
reserved list runs through the same three steps, or it reserves nothing.

**The 12 House names and the 27 hero names are deliberately *not* reserved.** They
are flavor, players will want them, and the impersonation risk is nil — nobody is
socially engineered by a player called Bramwen.

**Rate limit**: 3 changes per 30 days regardless of shards, because a name that
changes hourly defeats every human-scale mechanism that depends on recognising an
opponent — the Battle Record, remembering who you keep losing to, and moderation
reports.

---

## Settled here because every later feature inherits it

**`accountId` comes from the verified session and never from a request body.**
Recorded in the plan; restated because it is the single convention that fifteen
other features depend on, and the one whose violation is invisible in review.

The enforcement is structural: the route handler's context type carries
`accountId`, and there is **no route signature that reads an account identifier
from `body` or `params`**. A route that wants to act on someone else's account —
the scout view, the public profile — takes a *different* parameter name
(`targetId`) so the two can never be confused at a glance.

## What is NOT settled here

- **Steam session tickets.** The route and the identity row exist; the integration
  has never been prototyped. 1.0 must get the **seam** right, not the integration
  — a spike to schedule, not a risk to retire.
- **Account deletion and its cascade.** Belongs with feature 012's export work,
  where the full list of what an account owns is already being enumerated.
