# `@lmntlz/sim`

The rules engine. **One implementation, imported by both sides**, split across a
seam that is the single most important boundary in the codebase.

```
rules/      pure · shared · no randomness · no clock · returns PROBABILITIES
resolver/   server only · holds the RNG · returns OUTCOMES
ai/         server only · plays every defense squad
```

## The seam

**`rules/` answers "what are the odds". `resolver/` answers "what happened".**

That division is Constitution XII, and everything about the architecture rests on
it. The client imports `rules/` and can therefore price any move — show you that
this attack lands 82% of the time and deals 340 — **without a network round
trip**, because the arithmetic is the same arithmetic the server will run. What
the client cannot do is find out whether *this* swing landed, because the draw
happens in a package it never receives, from a seed that never leaves the server.

There is deliberately **no root export**:

```jsonc
"exports": {
  "./rules":    "./rules/index.ts",
  "./resolver": "./resolver/index.ts",
  "./ai":       "./ai/index.ts"
}
```

`import { … } from '@lmntlz/sim'` does not resolve. Not "is discouraged" —
**does not resolve.** A barrel file at the root would let one careless
re-export drag the resolver into a browser bundle, and nobody would notice
until it shipped.

## Why a "temporary" `Math.random()` here is permanent

It would pass review once. It looks like a stub, it is obviously going to be
replaced, and the diff that adds it is three lines in a function that already
does something more interesting.

Then it never gets replaced, because nothing fails. The client and server drift
apart silently — the client's preview says one thing, the server resolves
another, and the bug reports read *"the numbers are wrong sometimes"*. By the
time anyone traces it, the line has been there for months and half a dozen things
depend on its behavior.

`tests/rules/purity.test.ts` exists so that it cannot happen. It **walks the
import graph** from `rules/index.ts` and fails the build on any reachable module
that touches `Math.random`, `crypto.getRandomValues`, `Date.now`, `new Date`,
`performance.now`, `process.hrtime` or `node:crypto` — at any depth, in any
package. It also asserts that nothing reachable from the client reaches
`resolver/` or `ai/`.

It was written and made to fail **before a single rule existed**. That ordering
matters: a purity test written afterwards gets written to fit whatever got built.

## What belongs where

| Question | Where |
|---|---|
| *How likely is this to hit?* | `rules/` |
| *Did it hit?* | `resolver/` |
| *How much damage if it does?* | `rules/` |
| *Which target does the engine pick?* | `ai/` — and it **sorts** `candidates`, never filters |
| *Whose turn is next?* | `rules/` — `turnQueue` is a projection, ticks stay internal |

## Load-bearing constants

Three numbers here are not tuning knobs, and each has a recorded reason:

- **The `+20` attacker edge.** The symmetric contest was a coin flip — median
  miss **45.2%** across all 729 pairs. `+20` takes that to 9.4% and shortens
  battles from ~155 to ~102 hero-turns.
- **The `[0.65, 0.95]` clamp**, applied **after** the fold. An `Agility` + `Luck`
  defender at the 75 cap is a **98.2%** miss rate unclamped: a literal
  invincibility build. Clamping the inputs instead would let the build exist and
  merely slow it down. **Reducing `Luck`'s die multiplier is the wrong lever** —
  it compresses rather than shifts, and at ×0.5 it creates 158 pairs that can
  never hit each other at all.
- **The `50` in `50 + Speed`.** Without it the Speed 45 / Speed 15 ratio is 3×
  and a Speed rune is the only rune anyone buys. With it, 1.46×, and the geared
  ceiling is 1.92×.

The recorded 729-pair distribution — mean miss **13.0%**, p90 **28.9%**, **0**
pairs missing above half, **42** auto-hits, **0** auto-misses — is asserted in
`tests/rules/probability.test.ts` and independently reproduced by
`tools/verify-accuracy.py`.

## The 300-turn cap

**Provisional in its constant, settled in its mechanism.** The corrected
battle-length median is ~102 hero-turns, so 300 is roughly 3× and should almost
never bind. Re-derive it from measured p99 once feature 008 is recording turn
counts — and not before, because the only evidence available today is the same
simulation that produced it.

## A correction found while building this

`effectiveStat` originally floored at 0 and did **not** cap at 75. `01-stats.md`
says *"every stat is capped at 75; anything past it is ignored"* — that is a game
rule, and content only enforces it on *authored* values. A buff or rune pushing a
stat past the cap during play would have gone straight through.

It mattered immediately: three settled consequences rest on the cap holding
here — overcapping is waste so gear must be spread, mitigation alone never
exceeds 50% reduction because `E` is bounded by the cap and `K` is also 75, and
Penetration 75 against Armor 75 gives ×1.00. The damage test caught it by
constructing a defender past the cap and finding the 25% floor binding, which
`01-stats.md` says it never should today.
