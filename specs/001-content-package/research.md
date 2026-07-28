# Phase 0 Research: Content Package

**Feature**: `001-content-package` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions were raised in the plan. All three are **answerable now** — none
needs a measurement, a live model or a running game.

---

## Q1 — Neutralize `tools/build-hero-stats.py` (FR-018)

**Decision: delete it, and delete the four sibling mutators with it.**

`tools/` currently holds five scripts that open `resources/characters/hero-stats.xlsx`
and write it back: `build-hero-stats.py`, `add-passives.py`, `add-powers-sheet.py`,
`apply-power-balance.py`, `apply-roster-fixes.py`. Each was a one-shot migration
that has already run. Their only guard against a second run is a docstring.

**The workbook is the authored source, not an output.** That inverts the usual
generated-file rule and it is the whole reason FR-018 exists: a "regenerate"
script pointed at an authored file is a shredder with a helpful name. Once the
reader in `packages/content` exists, nothing in the repository should ever open
the workbook for writing.

**Rationale**: deletion is the only option that cannot be defeated by a tired
person at the wrong hour. Git keeps them recoverable, and their output — the
workbook — is committed, so nothing is lost.

**Alternatives rejected**:

| Option | Why not |
|---|---|
| Rename to `DESTRUCTIVE-rebuild-hero-stats.py` | Renaming makes the danger legible; it does not make the action harder. The next person to `python tools/*.py` still loses the roster. |
| Gate behind `--i-mean-it` | Same objection, plus it keeps five dead scripts alive as maintenance surface and as an implicit claim that regenerating is a supported workflow. It is not. |
| Move to `tools/archive/` | Better than nothing, and the honest fallback if any of the five turns out to still be needed. But none is: the workbook is complete and authored from here on. |

**Verification**: after deletion, `rg -l "hero-stats.xlsx" tools/` returns nothing,
and the only remaining reference in the repo is the read path in
`packages/content` plus documentation links.

**A note beyond FR-018**: `tools/validate-matchups.ps1` reads and does not write.
It stays, and it is the model for anything else `tools/` acquires — read the
workbook, assert, exit non-zero.

---

## Q2 — The workbook's readable shape

**Decision: key every read on the header string, resolved once at load, and fail
loudly on a missing header. Never index a column by position.**

Confirmed shape, read directly from `resources/characters/hero-stats.xlsx`:

| Sheet | Rows | What it is |
|---|---|---|
| `Hero Stats` | 27 + header | one row per hero; the authored `Primary` / `Secondary` plus stats |
| `Powers` | 27 + header | one row per hero; six power **names** plus three passive names |
| `Power List` | 127 + header | one row per distinct power — tier, multiplier, cooldown |
| `Rules` | — | prose notes; **not read by the build** |

`Hero Stats` headers, in file order:

```
# · Hero · Slug · Family · Primary · Secondary · Bane (derived) · Fault (derived) ·
Role · Reach (proposed) · Might · Perception · Agility · Toughness · …
```

**Two columns are traps and both must be ignored on read.** `Bane (derived)` and
`Fault (derived)` exist in the workbook as a convenience for the human editing it.
Reading them would violate FR-001 and FR-008 directly — the package must compute
both from `Primary` and `Secondary` and then **assert that the workbook agrees**,
treating a disagreement as a validation failure naming the hero. That turns two
dangerous columns into a free consistency check.

> **`Reach (proposed)` is named as a proposal and the schema should not preserve
> that.** `01-stats.md` records reach as still-open in the stat spread (all 12
> reach-1 heroes are Strikers, so reach carries no information Role does not).
> The reader maps it to `reach` and validates it as 1 or 2; the "(proposed)"
> lives in the workbook header only.

**Rationale**: column positions are an artifact of the deleted generator. A single
inserted column shifts every stat by one and produces a roster that validates
cleanly and plays wrong — the worst class of failure, because nothing throws.
Header-keyed reads turn that into a startup error naming the missing header.

**Alternatives rejected**: positional indices (fast to write, silently wrong on
edit); a hand-maintained column-map constant (a second place to forget).

**Non-obvious detail**: the `Powers` sheet's first power column is headed
`Power 0 — auto` with a **non-ASCII em dash**, and `Power List` rows include
passives, which have a **blank cooldown cell** rather than a zero. Both bit the
Phase 0 sweep script. The reader must match power-column headers by prefix
(`startswith("Power ")`) and must reject a blank cooldown on an *active* power
while accepting it on a passive — a blank is "this power has no cooldown concept",
which is not the same as cooldown 0, exactly as `03-powers.md` says of a blank
multiplier.

---

## Q3 — `contentVersion`'s derivation (FR-016, FR-020)

**Decision: `contentVersion` is a hash of the authored source bytes —
`sha256(hero-stats.xlsx)` truncated to 12 hex characters — computed at build time
and frozen into the emitted module.**

```
contentVersion = "c" + sha256(bytes of resources/characters/hero-stats.xlsx)[0:12]
```

**Rationale**: FR-020 requires the version to derive from the *authored* source
rather than the emitted output. Hashing the output would leave a real edit
invisible whenever regeneration happens to be byte-identical — which is common,
because most edits touch prose or a single cell that the emitter normalises away.
Hashing the input cannot miss an edit, and that is the only property the stamp
must have: **it exists so a battle record can say which roster it was fought
under**, and Constitution XVI makes it unbackfillable.

**A hash rather than a semantic version, deliberately.** A semver would need
someone to decide whether a stat change is a minor or a patch, every time, and to
get it right under no enforcement. Nobody will. A content hash is derived data —
Constitution XV applies to the version stamp as much as to the matrix it stamps.

**Alternatives rejected**:

| Option | Why not |
|---|---|
| Hash the emitted JSON | Misses edits that normalise away. Fails FR-020 as written. |
| Hand-maintained semver in `package.json` | Requires a human to remember, under no enforcement, forever. |
| Git commit SHA of the workbook's last change | Correct in principle and it moves with the content — but it is unavailable in a working tree with uncommitted changes, so local play would stamp battles with a stale version. |
| Workbook `lastModified` timestamp | Changes on open-and-save with no edit; does not change on a `git checkout` of a different version. Wrong in both directions. |

**The `c` prefix is load-bearing.** `engineVersion` and `contentVersion` are two
separate stamps that Constitution XVI says must never be merged, and they will sit
adjacent in every battle row. A bare hex string next to another bare hex string
invites exactly the mistake the constitution names. Prefixing content with `c`
makes a swapped pair visible on sight.

**Verification**: change one cell in the workbook, rebuild, confirm the stamp
moves. Rebuild without changing anything, confirm it does not.

---

## Cross-cutting decisions this pass settled

**The 60-of-72 count (FR-005) is confirmed by enumeration, not asserted.** Nine
types give 72 ordered pairs with `secondary ≠ primary`; the three distinctness
rules reject 12. The build asserts the count, so a future change to `counter` that
silently alters the legal space fails at build rather than in play.

**Effectiveness takes a hero, never a type pair.** Recorded in the plan and
restated here because it is the single most likely thing to be "simplified" into a
9×9 lookup later. A 9×9 table cannot express Fault or the ×0.80 secondary case,
both of which read the defender's *second* authored type.

## What is NOT settled here, and is not this feature's to settle

- **The hero-numbers pass.** Every value in the workbook is a Role-shaped template.
  This feature validates the *shape* — budget, cap, integer cooldowns — and takes
  no view on whether Might 45 is correct.
- **Reactive powers are unpopulated** (`03-powers.md`). The schema must accept a
  `reactive` flag now so the roster does not need a migration when they are
  authored with the numbers pass.
