# Phase 0 Research: Simulation Rules

**Feature**: `002-sim-rules` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q2 was the one with real work in it and it has been done** — the
closed-form hit probability is derived below and verified against the recorded
729-pair analysis. Q1 and Q3 are decisions.

---

## Q1 — How the client build excludes `resolver/`

**Decision: subpath exports for the shape, an import-graph test in CI for the
enforcement, and an ESLint rule in `apps/client` for the fast local signal.**

```jsonc
// packages/sim/package.json
"exports": {
  "./rules":    "./dist/rules/index.js",     // client + server
  "./resolver": "./dist/resolver/index.js",  // server only
  "./ai":       "./dist/ai/index.js"         // server only
}
```

There is deliberately **no root export**. `import { … } from '@lmntlz/sim'` fails
to resolve, so nobody can reach the resolver by accident through a barrel file —
which is the single most common way a seam like this leaks.

**The enforcement is `purity.test.ts`, which fails the build:**

1. Resolve the full import graph from `apps/client`'s entry.
2. Assert `@lmntlz/sim/resolver` and `@lmntlz/sim/ai` appear **nowhere** in it,
   at any depth.
3. Assert no module reachable from `packages/sim/rules` references
   `Math.random`, `crypto.getRandomValues`, `Date.now`, `new Date`,
   `performance.now`, or `process.hrtime` — SC-001 and FR-001 as an assertion
   rather than a convention.

**Rationale**: the plan asked for the *build* to fail rather than a reviewer to
notice. A CI test does that, it lives in the repository where it can be read, and
it catches the transitive case — which a lint rule on direct imports does not.
The ESLint `no-restricted-imports` rule is kept anyway because it fails in the
editor in under a second, and the CI test is the thing that is actually true.

**Alternatives considered**:

| Option | Verdict |
|---|---|
| Three packages — `@lmntlz/sim-rules`, `-resolver`, `-ai` | **Strictly stronger**: pnpm's strict layout would make the import literally unresolvable from a client that does not depend on it. Not adopted because `CLAUDE.md` records the split as subtrees of `packages/sim`, and changing that is a canon change, not a Phase 0 call. **Worth raising separately** — if the graph test is ever found to have been skipped or weakened, this is the fix. |
| Lint rule alone | Catches direct imports, misses transitive ones. A shared utility that imports the resolver would pass. |
| Bundler config (Vite `resolve.alias` to a throwing stub) | Configuration, editable by anyone, and silent when it works — no signal that it is still doing its job. |

---

## Q2 — Confirm the accuracy model *(computed)*

**Decision: the contest folds into one exact closed form, evaluated in `rules`,
clamped, and handed to the resolver as a single probability.**

`CLAUDE.md` writes two `rand()` terms and annotates *"one draw, not two."* Here is
the fold.

```
attack  = Perception_a + 20 + A,   A ~ Uniform{1 … Na},  Na = floor(Luck_a × 1.5)
defense = Agility_d         + D,   D ~ Uniform{1 … Nd},  Nd = floor(Luck_d × 1.5)
hit iff attack > defense                                  (ties to the defender)

Let m = Agility_d − Perception_a − 20            # the margin A must exceed D by

                1     Na
P(hit)  =  ───────── · Σ  clamp( a − m − 1, 0, Nd )
            Na · Nd   a=1

P(hit)  is then clamped to [0.65, 0.95]                            (FR-020)
```

Exact, integer-only, `O(Na)` with `Na ≤ 60` — cheaper than the two draws it
replaces, and it is what lets FR-004 expose a probability without resolving it.

### Verified against the recorded 729-pair analysis

Computed over the authored roster, unclamped, and compared with the table in
`01-stats.md` → *Why the attacker gets a base edge*:

| Miss rate | symmetric (computed / recorded) | with `+20` (computed / recorded) |
|---|---|---|
| min | 6.8% / 6.8% ✓ | 0.0% / 0.0% ✓ |
| p10 | 19.5% / 19.5% ✓ | 0.2% / 0.3% |
| median | 44.6% / **45.2%** | 9.6% / **9.4%** |
| mean | 42.6% / 42.6% ✓ | 13.0% / 13.1% ✓ |
| p90 | 70.2% / 70.2% ✓ | 28.9% / 28.9% ✓ |
| max | 83.1% / **82.5%** | 46.2% / **45.2%** |
| pairs missing >50% | 315 / 315 ✓ | 0 / 0 ✓ |

And the consequences the design rests on, all reproduced exactly:

- hit rate **57.4% → 87.0%** (recorded 57.4% → 86.9%)
- throughput ratio **1.516×** (recorded 1.51×)
- `155 / 1.516 = 102` hero-turns (recorded ~102) — **the corrected battle-length
  median is confirmed, not merely asserted**
- **42 auto-hits, 0 auto-misses** (recorded 42 / 0)
- the die-shrink table reproduces, including the **158 deterministic pairs** at
  `Luck × 0.5` that make shrinking the die the wrong lever

**The model is confirmed.** Everything load-bearing matches.

### Two small discrepancies, and what they are

Two order statistics differ by 0.6–1.0 pp while every mean, decile and count
matches. Testing three rounding conventions for the die:

| `Luck × 1.5` rounded by | symmetric median | symmetric max | +20 median | +20 max |
|---|---|---|---|---|
| **floor** (what the prose states) | 44.6% | 83.1% | 9.6% | 46.2% |
| half-up / ceil | 45.0% | 82.5% | 10.4% | 46.2% |
| **recorded** | **45.2%** | **82.5%** | **9.4%** | **45.2%** |

Two findings:

1. **`floor` is canon and stays.** `01-stats.md` states it in prose — *"a hero
   with `Luck` 15 rolls 1–22"*, and `15 × 1.5 = 22.5`. It is also the convention
   the recorded **means** reproduce. The recorded *max* of 82.5% came from a
   half-up die; the table mixes two conventions.
2. **The `+20 max` cell reads 45.2%, which is the symmetric *median* from the
   cell diagonally above it.** Under every rounding convention the true value is
   **46.2%**. This is a transcription between adjacent cells, not a rounding
   difference. → logged in `resources/README.md`; nothing depends on it.

### Implementation notes that follow

- **`floor(Luck × 1.5)`, and `Na ≥ 1` always.** A `Luck` of 0 is not reachable
  today, but the guard costs nothing and a division by zero costs a battle.
- **Clamp after folding, never before.** `01-stats.md`'s rune analysis depends on
  the clamp seeing the true probability: an `Agility` + `Luck` defender is 98.2%
  miss unclamped, and the clamp is what makes that a 35% miss instead of an
  invincibility build.
- **The same fold resolves rider landing** — `potency + rand(1..Luck×1.5)` against
  `Resolve + rand(1..Luck×1.5)` (`05-status.md`), with `m = Resolve − potency` and
  **no `+20`**. One function, two callers; the edge is a parameter.

---

## Q3 — Row indexing

**Decision: one absolute axis, rows 1–6. Row 1 is the attacker's *rearmost* seat;
row 3 is the attacker's front line. Rows 4, 5, 6 mirror it for the defender —
row 4 is the defender's front.**

Confirmed against `02-squads.md`: *"The axis is **absolute**, not per-side. Row 1
is the attackers' rearmost hero"*, and *"a defender in row 4 with reach 2 reaches
rows 3 and 2."*

```
   1        2 2 2      3 3        |        4 4        5 5 5        6
 back      middle     front       |      front       middle      back
        ATTACKER (2/3/1)          |        DEFENDER (2/3/1)
```

> **The formation is 2 front · 3 middle · 1 back**, so the *front* row holds two
> and the *middle* holds three. Read left to right the attacker's seats are
> 1 (one hero) · 2 (three heroes) · 3 (two heroes). Numbering ascends toward the
> enemy for the attacker and **away** from the enemy for the defender. That
> asymmetry is what makes one shared axis work, and it is the second thing to get
> backwards after the row-1 question.

**Distance is the count of *occupied* rows crossed, including the target's row and
excluding the actor's own** (FR-005, FR-006). Three consequences that the tests
must cover, all recorded in `02-squads.md`:

- **Row 1 cannot attack at any reach.** Row 1 → row 4 crosses rows 2, 3, 4 =
  distance 3, against a maximum reach of 2. It supports at reach 2 and does
  nothing else. Not a bug — the seat is priced.
- **Reach opens up as the battle wears on.** Empty rows count zero, so once the
  attacker's own front row (3) is wiped, row 1's distance to the enemy front
  falls to 2 and the back seat starts fighting.
- **Reach is not bounded at two enemy rows.** The Air rune `Further Than It Looks`
  grants +1 reach for a turn, putting three enemy rows in the window. Any
  implementation that assumes two is wrong — see feature 004 FR-020, which exists
  for this.

**Verification**: `distance(from, to)` is exhaustively testable over all 30 ordered
row pairs × the 2⁶ occupancy patterns = **1,920 cases with no mocks**, which is
SC-005's argument applied to the cheapest function in the package.

---

## Confirmed by computation, not restated

**SC-007's speed ratios fall directly out of the accumulator** and need no
simulation: a hero gains `50 + Speed` per tick and acts at 100, so its acts-per-tick
is `(50 + Speed)/100`.

| | acts/tick | ratio vs `Speed` 15 |
|---|---|---|
| `Speed` 15 | 0.65 | 1.00× |
| `Speed` 45 | 0.95 | **1.462×** (recorded 1.46) ✓ |
| `Speed` 75 (rune cap) | 1.25 | **1.923×** (recorded 1.92) ✓ |

**This is also the proof that FR-015 must be flat points.** The base constant 50
is what compresses the ratio; a *percentage* `Speed` buff would multiply the whole
`50 + Speed` term and hand the fastest hero the largest absolute gain, which is
the outcome the flat rule exists to prevent.

**The damage floor never binds at today's numbers** and that is worth knowing
before someone "fixes" it. Mitigation caps at 50% reduction and the lowest type
multiplier is ×0.50, so the worst case is exactly `0.5 × 0.5 = 25%` — the floor
ties and never bites. It is insurance against stacked mitigation once runic
equipment ships, and it quietly caps how low the resisted multiplier can usefully
be set. FR-019 must still be implemented; SC-009 must still be tested.

## What is NOT settled here

- **The eight distinct damage factors.** `01-stats.md` records that only 7
  `(Armor, MR, Penetration)` profiles exist across 27 heroes, so mitigation is
  coarse. That is a **hero-numbers** finding, not a rules one — the formula is
  right and the inputs are a template.
- **Whether reach stays a separate field from Role.** All 12 reach-1 heroes are
  Strikers, so reach carries no information Role does not. Open in `01-stats.md`
  and it changes no signature here.
