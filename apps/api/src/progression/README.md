# Progression — shards, runes and the ladder

Feature 010. What a player accumulates, what they demonstrate, and the three
properties holding the two apart.

> **Every tunable value lives in `config.ts` and nowhere else.** Not tidiness:
> under the no-nerf rule tuning must never require a client release (SC-010), and
> a competitive constant compiled into a Steam build cannot be corrected without a
> store submission. If you are about to write an economy literal in another file,
> that is the bug.

## The three properties

**1. The ledger is append-only and the balance is derived.** No `UPDATE`, no
`DELETE`, no `balance` column — `balance()` is `SUM(delta)`. A counter answers one
question and silently loses the rest, including the one that matters most under
Constitution XIV: *how much real spend would a proposed balance change write off?*
That answer is a query against `shard_ledger`, and like `battle_records` it
**cannot be backfilled** from a counter that was never a history.

**2. Committing is permanent and it is why we balance upward.** A rune is
destroyed when it is replaced, all four stages, for one charge of 650. There is
deliberately **no refund path**. This is the origin of the balance-upward rule —
a nerf writes off spend that cannot be returned — and it is why a compensating
grant must be able to exceed the cap.

**3. The rating converges; it does not accumulate.** One visible number doing two
jobs: standing, and the order league-mates are offered in. A strong player at two
hours a week outranks a weaker one at twenty, and beating somebody far below you
moves you almost nothing — so neither farming a weak defender nor grinding bots is
a rating strategy. Handled by the *shape of the number* rather than by a rule that
would have to be written, tested and evaded.

## The cap is three behaviours, not one

| At 6,500 | | |
|---|---|---|
| Battle income | **stops** | silently — no overflow, no queue |
| A grant | **lands, and may exceed** | or the cap swallows the apology, for exactly the players a nerf hurt most |
| A purchase | **refused before the rail** | never take money for shards that cannot be delivered |

Three functions, deliberately. One `if (balance >= CAP)` gets at most one right.

Income **truncates** rather than refusing: FR-013 says the balance caps *at*
6,500, so a player 30 short of it winning a 60-shard ambush is credited 30.

## Where this plugs into the rest

| Seam | Owner | What 010 does |
|---|---|---|
| `matchmaking/gearScore.ts` `RuneSource` | 009 | **`install.ts` fills it.** Until it is called, every account scores the 1,500 starter grant forever, silently |
| `matchmaking/starterLeague.ts` `noteShardsEarned` | 009 | `battle/settle.ts` pushes lifetime earned after each settlement |
| `battle/settle.ts` conclusion transaction | 007 | `awardShards` and `applyRating`, **inside** the transaction — settlement is once-only and payment must inherit that |

Progression imports matchmaking, never the reverse. The `RuneSource` injection
seam is what keeps that acyclic.

## Two things to know before changing anything here

**`ratingDeltas` returns one decimal, and that fraction is load-bearing.** Integer
rounding at K=10 quantises a near-even battle to ±5 and erases the gradient the
ladder converges on. It also means the delta must be **bound as numeric and cast**
in SQL — Drizzle otherwise infers the column's `integer` type and Postgres rejects
`-17.7` before the surrounding `round()` runs. That shipped once and surfaced two
features away as a 500.

**⚠️ The day boundary is an assumption, not canon.** `06-progression.md` sets the
curve and never says when the day turns over. `dayStart()` uses **UTC midnight**
because it is the only boundary needing no per-account timezone. It is served as
an absolute instant (`nextBoundaryAt`) so a later per-player decision does not
change the API shape.
