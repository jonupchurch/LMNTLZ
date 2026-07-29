# `@lmntlz/sim/resolver`

Where a probability becomes an outcome. **Server only.**

## The one fact everything else follows from

**The resolver consumes randomness and is nonetheless a pure function of
`(seed, initialState, log)`.**

That reads like a contradiction and is the whole design. In-progress battle
state is never stored — there is no cache, no TTL, no "current state" row. Every
request re-derives the battle from its action log. So if a single draw came from
a live entropy source, the same request replayed would produce a *different
past*: the battle would change underneath the player between one action and the
next, and neither the client nor the server would have a way to notice.

Three consequences, all load-bearing:

1. **The generator must be positionally addressable.** `draw(seed, index)` is
   O(1) at any index, so re-derivation is a lookup rather than a re-advance.
   A generator that had to be stepped would make replaying a 300-turn battle
   quadratic in the number of requests — and every request replays.
2. **Draw order is part of the engine contract.** Adding, removing or reordering
   a draw changes every in-flight battle's future. That is what `engineVersion`
   identifies, and why deploys drain before switching (feature 016).
3. **Iteration order can never be implicit.** A `Map` preserves insertion order
   and a plain object does not, across engines, for integer-like keys. Every
   per-target loop here sorts explicitly — by row, then instance id.

## Draw order within one action

Fixed, and skipped rather than drawn-and-discarded. "Lazy" is not an order.

| Step | Draws | When |
|---|---|---|
| **hit** | 1 | always |
| **crit** | 1 **per packet**, not per target | only if the hit landed |
| **riders** | 1 per rider | only if the payload connected |
| **targeting tiebreak** | 1 | only if the earlier stages left a choice |

So **a miss consumes 1 index and a landed hit consumes 2** — which is what
proves the laziness is real. An eager-with-discards implementation would consume
2 either way and look identical from outside.

## The seed cannot leave

`Seed` has no serialised form:

- `toJSON()` **throws `SeedLeakError`** — so a careless `res.json(state)` fails
  loudly rather than shipping the seed
- `toString()` returns `'[seed]'`, and so does Node's inspector, because a log
  line is a leak too and logs outlive the request that wrote them
- the 64-bit value is held in a module-level `WeakMap`, **not on the object** —
  `Object.keys`, a spread and `structuredClone` all see nothing
- `createSeed()` **takes no parameters**, so there is nothing a client-supplied
  value could be passed as. Seed shopping has no surface to attack.
- `persistSeed` / `restoreSeed` are **not exported from the package root**.
  Reaching them means importing `./seed.js` by path — a deliberate act rather
  than an autocomplete.

## Two deliberate deviations from the contract

**`replay` takes the initial state as a parameter.** `contracts/resolver.d.ts`
writes `replay(seed, log)`, but the squads are not in the action log — they
belong to the battle row, which is feature 007's repository. A two-argument
`replay` would have to *fetch* them, and FR-002 forbids exactly that. Feature 007
reads the row and passes it in; the function stays pure.

**`resolveDefenderTurn` takes an injected chooser.** Feature 004 owns the
ranking. Injecting it rather than importing keeps this module from depending on
a package that does not exist yet, and lets a test drive a known choice.

## Known gap

**No rider is authored on any power.** The contested-status machinery and its
draw slot are in place, so the ordering is right the day riders exist, but the
loop is empty today and consumes nothing. `03-powers.md` describes riders in
prose and the workbook has no column for them — see `packages/content/README.md`.

## A flagged ambiguity in `ResolvedPacket`

**A pass and a miss are the same packet.** A hero with no legal target passes
(FR-011) and produces `hit: false`, exactly like a swing that missed, because
`ResolvedPacket` has one boolean and no third state.

They are distinguishable — a pass consumes **0** draws and a miss consumes
**1** — but only by reading the action alongside the packet. A replay viewer
reading packets alone would render "missed" for a hero that never swung.
Flagged rather than fixed: adding a field is a contract change, and feature 008
is the consumer that would care.
