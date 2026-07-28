# Phase 0 Research: Simulation Resolver

**Feature**: `003-sim-resolver` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q3 is answered by computation** — the closed form is confirmed
against Monte Carlo below. Q1 and Q2 are decisions that *become part of the engine
contract*: changing either changes every in-flight battle, so both are versioned
rather than incidental.

---

## Q1 — The seeded generator

**Decision: a counter-based generator — `SplitMix64` over a 64-bit seed and a
64-bit draw index — stated as part of `engineVersion`.**

```
draw(seed, index):
    z  = seed + index * 0x9E3779B97F4A7C15
    z ^= z >> 30 ; z *= 0xBF58476D1CE4E5B9
    z ^= z >> 27 ; z *= 0x94D049BB133111EB
    z ^= z >> 31
    return z                                # 64 uniform bits
```

The four requirements from the plan, against this choice:

| Requirement | How it is met |
|---|---|
| **Deterministic** | Pure integer arithmetic. No state, no accumulation. |
| **Portable** | Multiply-xor-shift over 64 bits. `BigInt` in TypeScript, or two 32-bit lanes — identical either way, and identical across engines. |
| **Positionally addressable** | **This is the requirement that decides it.** `draw(seed, n)` is `O(1)` for any `n`. A stateful PRNG would have to be advanced `n` times to answer the same question. |
| **Fast** | Four multiplies. Not the bottleneck; the replay is. |

**Positional addressability is not a nice-to-have here — it is forced by the
architecture.** In-progress battle state is never stored; every request re-derives
the battle from the append-only action log (`docs/tech-stack.md`). A resolver that
must be *advanced* to reach draw 47 makes replay `O(n)` in draws on every request.
A resolver that can be *indexed* makes it a lookup. `SplitMix64` is the smallest
thing with that property.

**Alternatives rejected**:

| Option | Why not |
|---|---|
| `xoshiro256**` | Excellent quality, but **stateful** — no positional addressing. Would force either a stored cursor (which is stored in-progress state, forbidden) or a re-advance per request. |
| Mulberry32 / sfc32 | Same objection, plus 32-bit state is thin for a game that stores seeds. |
| HMAC-SHA256(seed, index) | Positionally addressable and cryptographically strong, but ~100× slower for a property nothing needs — the seed never leaves the server, so an attacker has no output to attack. |
| `crypto.randomUUID` / platform RNG | Not reproducible at all. Fails replay outright. |

**Two constraints on the implementation, both load-bearing:**

- **`BigInt`, or an explicitly-lane-split 32-bit implementation.** JavaScript
  numbers lose precision above 2⁵³ and a silently-truncated multiply produces a
  generator that is deterministic, plausible, and **different on a different
  engine** — which fails replay in the worst possible way, intermittently.
- **The generator is named in `engineVersion`.** A battle resolved under a
  different generator is a different battle. Replays are stored event logs and are
  never re-simulated, so history is safe — but an **in-flight** battle re-derived
  under a changed generator would diverge mid-fight. `reDerive` must therefore
  refuse a version mismatch rather than guess.

---

## Q2 — How draws are sequenced

**Decision: one global monotonic draw counter per battle, incremented lazily, its
value recorded on every appended action.**

```
BattleAction {
  battleId, sequence, …
  drawIndexBefore    // the counter's value when this action began resolving
  drawsConsumed      // how many it took
}
```

**Lazy consumption, and it is safe here specifically because the counter is
recorded.** Only roll a crit after a hit lands; only roll a rider contest after the
payload connects. The sequence is a stable function of history because the history
*contains* the cursor — re-deriving action `n` starts from `drawIndexBefore`, not
from a re-count of everything that came before.

**Global to the battle, not scoped per turn.** Per-turn scoping was the other
candidate and it is worse in a way that only shows up later:

| | Global counter | Per-turn counter |
|---|---|---|
| Draw address | `(seed, n)` | `(seed, turn, n)` |
| A power added mid-version | shifts later draws — caught by `engineVersion` | shifts later draws **within the turn only** — looks contained, still diverges |
| Debugging a divergence | one number to compare | two, and the turn boundary hides which |
| Reordering within a turn | visible as a different `drawsConsumed` | **invisible** |

The last row is the argument. Per-turn scoping makes a class of bug — the same
draws consumed in a different order inside one turn — produce identical cursors
and different outcomes. Global scoping makes it show up as a mismatch.

**The order within one action is fixed and written down, because "lazy" is not an
order.** For a single-target attack:

```
1  hit                      always drawn
2  crit                     only if the hit landed
3  rider contest, per rider only if the payload connected
4  targeting tiebreak 5     only if tiebreaks 1-4 left more than one candidate
```

For a multi-target power the draws are ordered **by target, in row order then
instance order** — never by iteration order over a `Set` or an object's keys.
Crit is **rolled once per packet, not per target** (`01-stats.md`), so it takes
exactly one draw regardless of how many heroes the power hits.

> **Iteration order is a replay hazard and it does not look like one.** A
> `Map` preserves insertion order and a plain object does not, across engines, for
> integer-like keys. Every per-target loop in the resolver must sort explicitly.
> This is the detail the plan means by *"the detail that silently breaks replay."*

---

## Q3 — Confirm the closed-form hit probability *(computed)*

**Confirmed. The fold from feature 002 is the same distribution as rolling two
dice, to within sampling error.**

Method: 36 attacker/defender pairs × **400,000** trials each, drawing
`A ~ U{1..Na}` and `D ~ U{1..Nd}` independently and comparing
`Perception + 20 + A > Agility + D`, against the closed form
`P = (1/(Na·Nd)) · Σ clamp(a − m − 1, 0, Nd)`.

```
max | closed form − empirical |  =  0.00127
3σ at N = 400,000                ≈  0.00237
```

**Every pair lands inside 3σ.** The fold is exact; the residual is the Monte Carlo,
not the formula. The full 729-pair distributional check is in
[feature 002's research](../002-sim-rules/research.md#q2--confirm-the-accuracy-model-computed)
and reproduces the recorded means, deciles, hit rate, auto-hit count and the
1.51× throughput ratio.

**What this buys, and it is the point of asking:** the resolver spends **one** draw
per attack instead of two. Over a 102-hero-turn battle that is ~100 draws saved,
but the real gain is that the *rules* half can state the probability and the
*resolver* half can decide with a single comparison — which is exactly the seam
Constitution XII draws.

**One consequence to implement carefully.** The clamp means the drawn value is
compared against a **clamped** probability, and the clamp is applied in `rules`.
The resolver must not re-derive the probability or apply its own clamp; it calls
`hitProbability` and compares. Two clamps in two places is how they drift.

---

## Decisions that follow from these three

**`replay(seed, log)` is the primitive; `resolveAction` is built on it.** Recorded
in the plan and reinforced by Q2: every request replays, so replay is the hot path
and must be the simple, obviously-correct one. `resolveAction` is `replay` plus one
appended action.

**The seed's type is not serialisable.** Not "we remember not to send it" — the
type that carries the seed has no JSON representation and no `toString` that
reveals it, so a careless `res.json(state)` cannot leak it. Constitution XII by
construction.

**`reDerive` returns `VersionMismatch` rather than throwing or guessing.** An
in-flight battle whose `engineVersion` no longer matches the running engine cannot
be continued honestly. Feature 007 decides what to do with that answer — the
resolver's job is to give it, not to paper over it.

## What is NOT settled here

- **The abandoned-battle timeout.** Feature 007's question; it decides how long a
  version mismatch can sit unresolved, which is the only reason the resolver cares.
- **Whether a version mismatch discards or migrates.** Discard is almost certainly
  right — `docs/tech-stack.md` records the no-op discard costing the player nothing
  — but it is feature 007's call and feature 016's tooling.
