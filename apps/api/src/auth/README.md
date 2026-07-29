# `apps/api/src/auth`

Identity, sessions, and the one convention fifteen other features depend on.

## The rule that matters more than any code here

> **`accountId` comes from the verified session. Never from a request body, a
> path parameter, or a query string.**

This is the whole of authorization in this project, and **its violation is
invisible in review**. `PUT /v1/me/username` reading `body.accountId` looks
exactly like the correct version — one word different, tests pass either way,
because the author sends their own id. It only misbehaves when somebody sends
*someone else's*, and that is not a case anybody thinks to write.

Three defences, and the third is what makes the first two hold in a year:

1. `RequestContext` carries `accountId`, so the correct source is nearest to hand
2. A route acting on somebody else takes **`targetId`** — a distinct, branded
   type, so passing one where the other belongs is a compile error
3. `convention.test.ts` greps the source tree and fails the build

## Identity is `sub`, never email

A player can change their Google address. Keying on email makes them a different
account on their next sign-in — or worse, collides them with whoever later
acquires it. **This is the single most common way provider-agnostic identity is
quietly lost**, and it fails silently until the day somebody actually changes
their address.

`email` is stored for contact, refreshed on every sign-in, and **never read to
find anything**.

## Steam is a row, not a column and not a table

```
identities(accountId, provider, providerSubject)   UNIQUE (provider, providerSubject)
```

Adding Steam at 1.1 means one more `IdentityProvider` and one more row.
`linking.test.ts` asserts SC-003 structurally: **no code outside this directory
reads a provider name**, and `accounts` has no `steam_id` column.

`steam.ts` is designed and deliberately unwired — 501, with its ticket
verification shape recorded and `steamid` typed as a **string**, because it
exceeds 2^53 and parsing it as a number corrupts the last digits silently.

## Google is verified, not parsed

A JWT is three base64url segments; decoding the middle one shows `sub` and
`email` in plain sight. An implementation that stops there **works** — for every
honest user, forever, until somebody hands it a token they wrote themselves.
There is no functional symptom.

| Claim | Requirement |
|---|---|
| signature | against the JWKS, **`RS256` only** — never `none`, never symmetric |
| `iss` | `accounts.google.com` **or** `https://accounts.google.com` — Google emits both |
| `aud` | our client id, **exactly** |
| `exp` / `iat` | ≤ 60 s clock skew |
| `sub` | the account key |

**The `aud` check catches the whole class.** A token from any other Google app is
real, signed by Google, unexpired, and passes every check but that one.

Two things worth knowing:

- **`jose` does not check `iat`.** It validates `exp` and `nbf`; `iat` is
  informational under the RFC unless you pass `maxTokenAge`. Checked explicitly
  here, and its value is modest — the signature already makes a forged `iat`
  impossible, so what it catches is a badly skewed clock.
- **The JWKS cooldown is a hard floor, not "one free refetch".** For up to 30 s
  after a Google key rotation, sign-ins with the new key fail. That is the price
  of not being a fetch amplifier: without the cooldown, forged tokens bearing
  random `kid`s each trigger a fetch, and the first symptom is Google
  rate-limiting our real sign-ins.

## Tokens: four states, and no grace period

| Presented token | Response |
|---|---|
| unused | rotate — new pair, same family |
| used, successor **unused**, inside 60 s | **the same pair, byte-identical** |
| used, any other case | **revoke the entire family**, 401 |
| expired / revoked / unknown | 401 |

Row two is the honest client retrying a request whose response was lost. Row
three is a thief. **They are told apart by whether the successor was consumed,
not by a clock** — which is why a grace period is the wrong answer: it cannot
distinguish them at all, and hands the thief a genuinely valid credential for the
length of the grace. A suite that stops at row two certifies it.

The family dies, not just the token: revoking one would leave the thief holding
the successor they already minted, so the attack would survive its own detection.

**Only `sha256(token)` is stored** — not a password KDF. The token is 256 bits
from a CSPRNG, so there is no dictionary to attack and no rainbow table to build;
a slow hash would only add latency to the most frequent authenticated call in the
game.

Session 15 min · renewal 30 days sliding · family absolute 90 days.

## A ban is checked on every authenticated request

Session tokens are stateless and cannot be un-issued. Verifying the signature and
stopping there means **a ban does not take effect for up to fifteen minutes** —
precisely the minutes somebody spends doing whatever got them banned. One indexed
lookup is the price of a ban meaning something immediately.

`bannedUntil` is a **timestamp, not a flag**: an expiry in the past simply stops
applying, so no job runs, and no job can fail and leave somebody banned past
their time.

## Usernames: display and key are two columns

```
1  NFKD normalise, strip combining marks   "Ｒéyna" → "Reyna"
2  case-fold                                "Reyna" → "reyna"
3  confusable skeleton (Unicode TR39)       "rеynа" → "reyna"   ← Cyrillic е, а
```

Steps 1–2 are hygiene; **step 3 is a security control.** A case-insensitive
collision is a support ticket; a homoglyph collision is impersonation, and this
game has guild masters, an officer role and public profiles. A plain lowercase
comparison passes every other row of the test table and fails exactly the two
that matter.

**The key is lossy and is never shown to anybody.** `admin` keys to `adrnin`,
because the table maps `m` and `rn` onto each other. It reads like a bug; the
mapping is consistent, which is the only property a collision key needs.

**The reserved list runs through `usernameKey` too, or it reserves nothing.** The
27 hero names and 12 House names are deliberately *not* reserved — nobody is
socially engineered by a player called Bramwen.

### Two open items

- **A spec contradiction, resolved.** T035 wants `"Reyna Two-Rivers"` to survive a
  round trip; research.md Q3 fixes the charset as letters, digits and `_`, which
  forbids the space and the hyphen in that very example. The charset is the
  decision; the name was an illustration borrowed from the roster.
- **The 3-character minimum excludes two-character CJK names.** `雷娜` is entirely
  ordinary and is rejected. Recorded in `usernameKey.test.ts` rather than quietly
  changed — lowering the minimum hands a scarce, memorable namespace to whoever
  registers fastest and cannot be undone. **A script-aware minimum is the real
  answer**, and it is a design decision.

## Secrets

Every one lives in `apps/api` environment configuration and is listed by name in
`.env.example`. **`clientSecrecy.test.ts` scans for literals and, once feature 006
builds a bundle, will scan that too.**

There is **no Google client secret**, and that is the point of the ID-token flow:
nothing to ship in a static bundle, nothing to leak from a Steam download,
nothing to rotate. `GOOGLE_CLIENT_ID` is public by design.
