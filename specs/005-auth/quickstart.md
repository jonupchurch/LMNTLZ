# Quickstart: Authentication & Accounts

**Feature**: `005-auth` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test           # 43 files, 520 tests
pnpm --filter @lmntlz/api dev            # http://localhost:3000 — then the pass below
```

> **`dev` is a local Node server, not `vercel dev`.** It was `vercel dev` and it
> could not start: the Hono preset's Development Command is `pnpm dev`, so it
> recursively invoked itself and refused. `vercel dev` is kept as `dev:vercel`
> for checking routing as Vercel actually serves it — it needs a linked project
> and a logged-in CLI. See `apps/api/src/dev.ts`.

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

**Must return nothing but comments.** `accountId` comes from the verified
session. A route acting on someone else's account uses `targetId`, so the two are
distinguishable on sight and a reviewer does not have to trace the value.

> As written this grep returns two hits — `auth/context.ts` and `auth/README.md`,
> both of which *quote* the forbidden shape in prose to explain the rule.
> **`convention.test.ts` is the real gate**: it strips comments before scanning,
> so it does not have this problem and it fails the build rather than relying on
> somebody running a command. Read the two hits, do not try to make the grep
> return zero — deleting the explanation to satisfy a grep is the wrong trade.

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

## The pass, run 2026-07-28 (T049)

Everything above holds. Two things it found, both now fixed above: **`dev` could
not start**, and the convention grep **cannot return zero** because the rule is
explained in prose.

**What is automated and what is not.** Almost all of this is covered by
`apps/api/tests/auth/` against the real Neon database, so the honest description
of the manual pass is *"confirm the live server behaves as the suite says"* — it
was run against `localhost:3000` and it does: `400` and `401` are distinguished,
no response names which check failed, `revoke` is `204` and idempotent, `steam`
is `501`, and an unversioned `/health` is `404`.

**The genuinely uncovered case was key rotation**, and it is now
`jwks.test.ts` → *"accepts a rotated key once the key set catches up"* rather
than a manual step. The suite proved the verifier **refuses** to refetch; nothing
proved the refusal ever **ends**. Those are indistinguishable until the day
Google rotates, at which point the difference is a 30-second blip versus a
permanent outage. It needs a mutable key set — a forgery and a real rotation look
identical on arrival, and only the key set catching up tells them apart.

The two assertions were mutation-checked: not advancing past the cooldown, and
never publishing the key, each fail it.

**What cannot be checked here:** the real Google JWKS. Every token in the suite
is signed by a fixture keypair. `aud`, `iss` and the signature are verified
against real code paths, but *Google actually issuing a token this code accepts*
is only proven by a browser sign-in — feature 006's first job.
