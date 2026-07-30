# Payments, passes and entitlements

Feature 011. One product — the boost pair — in seven durations. Every price is a
multiple of $5. **There is no second currency, nothing auto-renews, and shards
cannot be bought.**

## The one grant path

**Every entitlement in the system is created by `webhook.ts` and nowhere else.**
That is enforced structurally rather than by convention:

- `entitlement_grants.provider_event_id` is `NOT NULL` with a foreign key, so a
  grant with no payment behind it cannot be written even by mistake.
- There is no `grantPass(accountId, days)` anywhere — not for tests, not for admin.
- An operator's comped pass (016) goes through the **same handler** with a
  synthetic event of kind `comp`. A second path would be a second place to get
  idempotency wrong, and the comp path is the one nobody load-tests.

`tests/payments/grantPath.test.ts` scans for a second inserter and plants one to
prove the scan can fail.

## Three things that look like details and are not

**1. `provider_event_id` is the primary key, and it is *theirs*.** Retries are the
normal case, so exactly-once has to be a database constraint. A key derived from
`(account, sku, amount)` looks equivalent and silently de-duplicates **a real
second purchase** — they paid twice and hold one pass, with no error anywhere.

**2. The signature is verified over raw bytes, before anything parses.** Parse
first and you verify against a re-serialisation, which fails only when the
provider's serialiser disagrees with V8's — unusual key order, a unicode escape —
so it is silent and intermittent. `signature.test.ts` posts a hand-built body
whose bytes `JSON.stringify` would not reproduce.

**3. Entitlement is computed from the set of grants, never mutated in arrival
order.** Notifications arrive out of order; a refund can land before the purchase
it reverses. Two mechanisms make the answer order-independent, and **both are
needed**: the fold sorts by `startsAt`, *and* a grant checks whether a reversal
naming it has already been recorded, so it can be born revoked.

## Reconciliation is deliberately asymmetric

Daily, over a **48-hour** window — wider than the cadence, so a failed run leaves
no permanent hole.

| | Action |
|---|---|
| They have it, we do not | **grant automatically**, and alert |
| We have it, they do not | **alert only — never revoke** |

Class one is a customer who paid and is owed something: acting costs nothing and
waiting costs a support ticket. Class two is ambiguous — a bad grant, *or* a late
or paginated export — and revoking on it takes a pass away from somebody who paid.
**An empty provider response is not an empty diff**; it is the loudest version of
the second class.

## The ceiling is computed

`maxPurchasableAdvantage()` walks the catalog for the cheapest cover of a year.
**Never a constant**: a constant stops being true the moment somebody adds a SKU,
and it stops being true silently. `ceiling.test.ts` adds a hypothetical
`pass-500d` and asserts the answer moves.

## The vendor boundary

**No file outside `vendor/` names a vendor** (Constitution XIX), scanned in
`grantPath.test.ts` — which caught a `paddle-signature` header string in the first
draft of `routes.ts`. The rail declares its own `signatureHeader` so the route
does not have to know one.

**Every behavioural claim here is tested without a vendor account**, against a fake
rail with real SHA-256 HMAC in `tests/payments/fixtures.ts`. What a real provider
adds is one implementation of five members.

## ⛔ Not built yet, and why

| | Blocked on |
|---|---|
| `vendor/` — the real rail | a Paddle account: API key + webhook secret |
| `receipt.ts` — the confirmation email | a Resend account + DNS verification on `lmntlz.com` |
| The statement descriptor string | reading it from the live provider dashboard |
| `apps/client/src/features/store/` | the descriptor above; no store screen exists |

`railInstalled()` is false until a provider is installed, and `/v1/catalog`
reports `available: false` rather than erroring at checkout — the store is honest
about being unavailable instead of failing at the last step.
