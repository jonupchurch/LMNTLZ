# Quickstart: Simulation Rules

**Feature**: `002-sim-rules` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/sim test rules
```

**No fixtures beyond `@lmntlz/content`, and no mocks anywhere.** That is SC-005,
and it is the reason this package is where testing earns most in the whole
codebase.

## Write these two first, before the code they cover

### `purity.test.ts` — SC-001, FR-001

Walks the module graph and asserts:

1. No module reachable from `rules/` references `Math.random`,
   `crypto.getRandomValues`, `Date.now`, `new Date`, `performance.now` or
   `process.hrtime`.
2. `apps/client`'s import graph contains **neither** `@lmntlz/sim/resolver`
   **nor** `@lmntlz/sim/ai`, at any depth.

Assertion 2 is the transitive case a lint rule misses. This is the seam that
Constitution XII is about; it is cheap to assert and impossible to retrofit once
something has leaked across it.

### `determinism.test.ts` (the rules half of it) — SC-003

Evaluate the same state 1,000 times through every exported function. Byte-identical
every time. Trivial to write, and it is the guard against someone reaching for a
cache, a memo keyed on object identity, or a `Set` iteration order.

## The exhaustive checks — the ones that need no mocks

### Distance over every configuration — FR-005, FR-006

30 ordered row pairs × 64 occupancy patterns = **1,920 cases**, enumerated.

Three named cases must appear and must pass:

| Case | Expected |
|---|---|
| Row 1 → row 4, full formation | distance **3** — the back seat cannot attack at any reach |
| Row 1 → row 4, attacker's row 3 empty | distance **2** — reach opens as the line collapses |
| A reach-2 front-seat hero with `+1` reach | **three** enemy rows in the window, not two |

The third is the one that fails on a natural implementation, which is why feature
004 carries FR-020 for it.

### Hit probability over all 729 pairings — FR-020, SC-008

```
for each of 27 attackers × 27 defenders:
    p = hitProbability(...)
    expect(p).toBeGreaterThanOrEqual(0.65)
    expect(p).toBeLessThanOrEqual(0.95)
```

Then the same over the **runed** extremes — an `Agility` + `Luck` defender at the
75 cap is a 98.2% miss rate unclamped. SC-008 says the clamp holds *including
fully runed*, and that case is the whole reason the clamp exists.

**Regression-lock the unclamped distribution** against the figures in
[research.md](research.md): mean miss **13.0%**, p90 **28.9%**, **0** pairs
missing above 50%, **42** auto-hits, **0** auto-misses. If a stat edit moves
these, the change is visible instead of silent.

### Damage over every mitigation value — FR-019, SC-009

Sweep `E` from −75 to +150. Assert `final ≥ packet × 0.25` throughout, and assert
mitigation alone never exceeds 50% reduction. At today's numbers the floor
**ties** at the worst case and never bites — assert that too, so the day it starts
binding is the day a test tells you.

### Turn order — SC-007

Run the accumulator 10,000 ticks.

```
Speed 45 acts 1.46× as often as Speed 15
Speed 75 acts 1.92× as often as Speed 15   (the geared ceiling)
```

Then the case FR-013 exists for: a `Speed` 75 hero **acts twice** before a
`Speed` 15 hero acts once. A single `if (acc >= 100)` test passes every other
check and fails this one.

## The manual pass

1. Import `@lmntlz/sim/rules` in a scratch client file. It resolves.
2. Import `@lmntlz/sim/resolver` in the same file. **The build fails.**
3. Call `damagePreview` on a known pair and read the numbers against the worked
   example in `resources/mechanics/01-stats.md`.
4. Confirm nothing you called returned an *outcome* — only probabilities, ranges
   and legal sets. That is SC-004: a player running a modified client gains
   nothing here, because there is nothing here to gain.
