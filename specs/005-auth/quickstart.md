# Quickstart: Authentication & Accounts

**Feature**: `005-auth` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test auth
pnpm --filter @lmntlz/api dev            # then the manual pass below
```

## The golden path

1. `POST /v1/auth/google` with a test ID token → account created, pair returned.
2. `GET /v1/me` with the session → the account.
3. `POST /v1/auth/renew` → a new pair; the old session still works until it expires.
4. `POST /v1/auth/revoke` → `204`; the renewal no longer works.

## Rotation — the three cases that must behave differently

This is the part worth testing properly, because two of the three are only ever
exercised by accident in production.

```
1  renew with a fresh token                    → new pair
2  renew AGAIN with the same token, < 60 s,
   without having used the new one             → THE SAME PAIR, byte-identical
3  use the new pair, THEN replay the old token → 401, and the whole family dies
```

Case 2 is the client that lost its connection mid-renewal. Case 3 is theft. **A
grace-period implementation passes case 2 and fails case 3** — it hands the
replayer a genuinely valid credential — so test 3 explicitly rather than assuming
2 implies it.

Then: after case 3, confirm **every** session in that family is dead, not just the
one that was replayed.

## JWKS caching

```
1  verify a token                    → one fetch of Google's JWKS
2  verify 100 more                   → still one fetch
3  present a token with a random kid  → one refetch
4  present 100 more with random kids  → STILL one refetch (the cooldown)
```

Step 4 is the rate-limit guard. Without the cooldown, a forged token with a random
`kid` is a fetch amplifier pointed at Google, and the first symptom is Google
rate-limiting real sign-ins.

Then confirm rotation actually works: point the verifier at a JWKS fixture, sign a
token with a key that is not in it, confirm `401`; add the key to the fixture,
confirm the next attempt succeeds after the cooldown.

## Username uniqueness — the confusable check

```
register  "Reyna"          → ok
register  "reyna"          → 409  rule: case
register  "Ｒeyna"          → 409  rule: exact       (fullwidth R, NFKD-folded)
register  "rеyna"          → 409  rule: confusable   (Cyrillic е)
register  "admin"          → 422  reserved
register  "аdmin"          → 422  reserved           (Cyrillic а — the skeleton matches)
register  "Bramwen"        → ok                      hero names are NOT reserved
```

The Cyrillic cases are the ones that matter. A game with guild masters, an officer
role and a public profile has a live impersonation surface, and a plain
lowercase-compare implementation passes every other line here and fails these two.

Confirm the display form survives: after registering `"Reyna Two-Rivers"`,
`GET /v1/me` returns it **exactly as typed** — never the folded key.

## The convention that fifteen features inherit

```bash
rg "body\.accountId|params\.accountId|query\.accountId" apps/api/src
```

**Must return nothing.** `accountId` comes from the verified session. A route
acting on someone else's account uses `targetId`, so the two are distinguishable
on sight and a reviewer does not have to trace the value.

## Provider-agnostic identity

1. Sign in with Google. Note the `accountId`.
2. `POST /v1/auth/steam` → **`501`**. The route exists; the integration does not.
3. Inspect `identities` — one row, `provider = 'google'`.
4. Confirm there is **no** `steam_id` column on `accounts`. Steam is a row.

## What must NOT work

- A token with `alg: none` or a symmetric algorithm → `401`.
- A valid Google token minted for a **different** `aud` → `401`.
- Linking a provider subject already attached elsewhere → `409` and **no merge**.
- Any response containing a provider subject, an email, or a token hash.
