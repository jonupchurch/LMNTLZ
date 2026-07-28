# Quickstart: Simulation Resolver

**Feature**: `003-sim-resolver` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/sim test resolver
```

## Write this one first

### `determinism.test.ts` — the feature's constitutional property

```
for i in 1..1000:
    state = replay(seed, log)
    expect(serialize(state)).toBe(baseline)     # byte-identical
```

Then the same log replayed on a **fresh process**, to catch anything that depends
on module-load order or a warmed cache. Then the same log with its actions
**delivered in a different arrival order but the same `sequence` values** — the
result must be identical, because `sequence` orders the log and arrival does not.

**Byte-identical, not deep-equal.** Deep equality passes on a `Set` that iterates
differently, which is precisely the bug class this test exists to catch.

## The seed boundary — Constitution XII

Three checks, all cheap, all impossible to add convincingly later:

1. `JSON.stringify(seed)` **throws** `SeedLeakError`.
2. `JSON.stringify({ ok: true, state })` for any value returned by `replay`,
   `resolveAction` or `resolveDefenderTurn` contains no seed material — asserted
   by searching the serialised output for the seed's bytes.
3. `rg "@lmntlz/sim/resolver" apps/client` returns nothing, and the import-graph
   assertion in feature 002's `purity.test.ts` covers the transitive case.

## The generator

```
draw(seed, n)  is O(1) for any n            # positional addressing
draw(seed, n)  is identical on Node and in a browser
draw(seed, n)  over 10^7 indices passes a chi-squared uniformity check
```

The portability check is the one that matters and the one that is easy to skip.
Run the same seed/index pairs under Node and under a headless browser and diff.
A `Number`-based multiply passes locally and diverges in production —
**deterministically, plausibly, and only sometimes.**

## Draw sequencing — the replay hazard

### Lazy consumption is stable

Resolve a battle to conclusion. Then re-derive it action by action, starting each
action from its recorded `drawIndexBefore`. Every packet must match.

### A miss consumes fewer draws than a hit

```
missed attack  → 1 draw   (hit only)
landed attack  → 2 draws  (hit, crit)
landed + rider → 2 + one per rider
```

Assert `drawsConsumed` matches. This is what proves consumption is genuinely lazy
rather than eager-with-discards, and the two are indistinguishable from outcomes
alone.

### Multi-target order is explicit

Resolve a row-target power against three defenders. Assert the per-target order is
**row then instance id**, and assert **exactly one** crit draw for the whole
packet — not three.

Then the adversarial version: shuffle the internal collection the resolver
iterates, re-resolve, and confirm the result is unchanged. If it changes, an
implicit iteration order is load-bearing somewhere.

## Version mismatch

1. Resolve three actions.
2. Bump `engineVersion`.
3. `reDerive(...)` returns `{ ok: false, reason: 'engine-version' }` — it does not
   throw, and it does not return a state.

Repeat for `contentVersion`. **Two stamps, checked separately** (Constitution XVI
says they are never merged, and this is where that stops being a slogan).

## The manual pass

Play one battle end to end through `resolveAction`, then:

- `toReplayLog(...)` — confirm the artifact carries **no seed and no draw
  indices**. It records what happened; it is not a recipe for recomputing it.
- Confirm the log survives a change to `engineVersion` unaltered. Replays are
  never re-simulated, so a balance patch cannot reach backwards into one.
