# Quickstart: Progression

**Feature**: `010-progression` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test progression
```

## The golden path — three outcomes at one boundary

Earn to the 6,500 cap, then do three things and get three different answers.

```
1  win a battle          → 0 shards awarded. Income STOPS.
2  receive a grant       → the grant LANDS. Balance exceeds the cap.
3  attempt a purchase    → REFUSED, before the payment rail is touched.
```

**These must not share a code path.** An implementation with one `if (balance >=
CAP)` gets at most one of the three right. Grants bypass the cap because the
balance-upward rule promises shards to everybody when a nerf is genuinely the
answer — and a cap that swallowed the apology would deny it to exactly the players
most affected.

**Line 3 has a money consequence.** Assert that `canAcceptPurchase` is called
*before* the rail, by injecting a failure into the rail and confirming it was never
reached.

## The daily tiers

```
victories  1 –  5   → 30 per chosen door,  60 per ambush     (1.5×)
victories  6 – 20   → 20,  40                                (1.0×)
victories 21 +      → 10,  20                                (0.5×)
holds               → NEVER tiered, at any victory count
```

Then the two properties the design states explicitly:

```
✓ play is never blocked at any victory count
✓ nothing is ever capped at ZERO — the 21+ tier pays 0.5×, not nothing
```

**And the taper must be legible before it bites**: `GET /v1/me/shards` returns
`nextBoundaryAt`, so a player at 18 victories can see that 21 costs them half.

Test the tier boundaries at **exactly** 5/6 and 20/21 — off-by-one here is a
silent, permanent overpay or underpay.

## The ledger is append-only

```bash
rg -n "UPDATE shard_ledger|DELETE FROM shard_ledger" apps/api/src
```

**Nothing.** Then:

```
✓ balance() is SUM(delta) — assert against a hand-computed sum
✗ there is no `balance` column on `accounts`
```

A materialised balance is a cache, and a cache is an invalidation bug waiting for a
concurrent write. The ledger is also what makes any economy question answerable
later without a new field.

## The rune rebuild — one transaction, one charge

```
1  place a stage-4 Earth/Might rune             → 650 spent, gear score up
2  rebuild the same slot as Earth/Toughness     → 650 spent, ONE ledger entry
3  assert: exactly ONE row with reason 'rune-rebuild', delta −650
4  assert: the old rune is GONE, all four stages
5  assert: gear score recomputed, and league may have moved
```

**Line 3 is the assertion.** Four staged charges would produce four rows that have
to be read as a group, and a partial failure that has to be compensated.

**Line 5 must be inside the transaction.** Then prove it:

```
inject a failure AFTER the rune write but BEFORE commit
→ balance unchanged, old rune intact, gear score unchanged
```

A gear recompute outside the transaction is exactly the window
`09-matchmaking.md` exists to close — *"no window between deploying a month of
shards and the league noticing."*

**The confirm must name what is destroyed:**

```
✓ the old rune is gone, all stages
✓ INCLUDING its utility effect
✓ the new rune is not necessarily an upgrade
```

Runes are permanent and destroyed on replacement. That is the design and it is the
reason the no-nerf rule exists — so the destructive confirm is not boilerplate.

## Rating

### The bands do what they claim

Simulate 2,000 players with a known latent skill and assert on **rank correlation**,
not on absolute error:

```
 30 battles → rank correlation ≥ 0.89     (the provisional band's stated goal)
100 battles → ≥ 0.95
400 battles → ≥ 0.98
```

**Assert ordinally.** Absolute error is the wrong measure here and asserting on it
produces a test that fails for a reason that does not matter — see below.

### The Hidden bonus is non-zero-sum, and the test should say so

```
even ratings, K = 10:
  Visible battle → winner +5.0, loser −5.0    net  0
  Hidden  battle → winner +10.0, loser −5.0   net +5.0   ← rating is INJECTED
```

**Write this as an explicit assertion, not as a discovered surprise.** It is
deliberate — *"A loss costs the same in either zone"* is recorded — and it means the
population inflates by roughly **2,700 a year** for an active established player.

**Both stated jobs of the rating are ordinal and survive it.** What does not survive
is any absolute reading of the number. So also assert:

```bash
rg -n "rating\s*[<>]=?\s*[0-9]" apps/api/src apps/client/src
```

**No absolute threshold on rating anywhere.** If one appears, it will drift.

### The zone asymmetry — the commitment the whole design rests on

```
defender: 20 attacks/day, 85/15 Visible/Hidden, holds 40% / 60%, K = 10
  → Visible  −17.0 / day    Hidden  +12.0 / day
```

**Visible bleeds; Hidden pays.** Shards say fortify Visible; rating says fortify
Hidden. Neither zone dominates because the two currencies disagree.

> **This test asserts the arithmetic, not the premise.** The premise — that Hidden
> holds *better* than Visible — is unverified and the whole zone choice rests on it.
> **If the two hold rates converge, Visible wins both currencies and the choice
> collapses.** Only `zone` + outcome + `defender_is_bot` on the battle record can
> detect it, and only after real play. Put the query in the ops runbook now.

## The gear score

```
✓ reads runes CURRENTLY on heroes, never lifetime spend
✓ ten rebuilds of one slot = 6,500 shards spent, 125 of score — NOT 1,250
✓ recomputed on every placement
```

Line 2 is the sandbag guard. A cumulative score would rate that player eight leagues
above their strength.
