# Quickstart: Content Package

**Feature**: `001-content-package` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

How to prove this feature works, in the order the proofs get cheap.

## Build and test

```bash
pnpm --filter @lmntlz/content build    # reads the workbook, emits the module
pnpm --filter @lmntlz/content test     # the derivation suite
```

The build reads `resources/characters/hero-stats.xlsx` and writes generated
output that is **committed** (FR-019). CI re-runs the build and fails on a diff —
which is what stops a hand-edit to generated content from surviving.

## The six checks that matter

### 1 · The 60-of-72 enumeration — FR-005

Author every one of the 72 ordered `(primary, secondary)` pairs and count.

```
expect(legal).toHaveLength(60)
expect(rejected).toHaveLength(12)
```

Each rejection names one of the three distinctness rules. **This is a count
assertion on purpose** — it fails if `counter` is ever changed in a way that
silently widens or narrows the legal space, which no spot check would catch.

### 2 · Melee+melee is impossible as a consequence, not a rule — FR-006

Search the package for any rule that mentions melee pairing. There must not be
one. Then assert the property holds anyway:

```
for (const h of getAllHeroes())
  if (family(h.primary) === 'melee') expect(family(h.secondary)).toBe('magic')
```

The test passes because the 3-cycle is too small, not because anything checks.

### 3 · Nothing authored appears in the derived fields — FR-001, FR-008

```bash
rg -i "bane|fault" packages/content/src --glob '!**/derive.ts'
```

Should return nothing but type declarations. Then confirm the workbook's own
`Bane (derived)` / `Fault (derived)` columns are **read as an assertion and never
as a source**: change one of them by hand, rebuild, and expect a
`derived-column-disagrees` failure naming the hero.

### 4 · A change propagates with no other file edited — Acceptance Scenario 6

Change one hero's `Primary` in the workbook. Rebuild. Confirm:

- its `bane` moved,
- every effectiveness result involving it moved,
- `git status` shows the workbook and the generated output — **nothing else**.

### 5 · The version stamp tracks the source, not the output — FR-020

```
edit one cell  → rebuild → contentVersion() differs
rebuild again  → no edit → contentVersion() identical
```

### 6 · An invalid roster cannot start the game — FR-015

Break a stat past the 75 cap, rebuild, and confirm startup **fails** rather than
surfacing the bad value during play. The failure message must name the hero and
the field (FR-017).

## What "done" does not mean

The values in the workbook are still a Role-shaped template — the hero-numbers
pass has not run. This feature is done when the roster is **well-formed and
self-consistent**, not when it is balanced. Balance is checked against battles,
which do not exist yet.
