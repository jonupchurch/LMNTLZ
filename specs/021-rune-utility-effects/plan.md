# Implementation Plan: Rune Utility Effects

**Branch**: `021-rune-utility-effects` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-rune-utility-effects/spec.md`

---

## TL;DR

The fourth stage of a rune costs 200 shards, grants no stats on purpose, and has
never delivered the ability it charges for. This plan builds the 33 abilities the
design already wrote down.

**The good news is structural.** Feature 020 built a hook surface for champion
passives, and a rune effect is the same kind of thing — something conditional that
watches a battle and changes it. Twenty-one of the twenty-two places that read a
passive go through **one function**, so widening that single function makes rune
effects work everywhere at once. There is exactly one place that skips it, and it
happens to be the one place a specific effect needs.

The work splits four ways: make the purchase real and turn on the twelve effects
that need nothing new (US1), add nine small capabilities to the engine for the
seventeen that do (US2), add the four that roll dice behind an engine-version gate
(US3), and show the player what they bought (US4).

---

## Summary

Close the chain from *player spends 200 shards* to *something happens in a battle*,
which is currently broken at every link. Add one catalog module to the shared rules
engine holding all 33 effects and one frozen magnitudes object; widen the existing
`hooksOf` lookup so every hook reader supports rune effects; add a per-instance
`runeEffects` field to `HeroState`; make both rune write paths carry a utility
choice with server-side pool validation; and surface the result in the Forge and in
battle.

Full reasoning for the five design decisions is in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, ESM, Node 20 · React 19 on the client

**Primary Dependencies**: `packages/sim` (rules + resolver), `packages/content`
(generated roster), Hono on the API, Drizzle + Neon Postgres, Vite + React +
Tailwind v4 on the client

**Storage**: `runes.utility_effect` — **already exists**, nullable text, every row
currently `null`. **No migration required.**

**Testing**: Vitest for units and integration, Playwright for the two client
journeys. Note the project layout: `@lmntlz/sim` and `content` resolve from the
root runner; `apps/api`'s nested projects (`battle`, `replays`, `progression`,
`matchmaking`) only resolve when run from `apps/api`.

**Target Platform**: desktop browser at 1.0, min 1280×720

**Project Type**: pnpm + Turborepo monorepo — shared engine, Hono API, React client

**Performance Goals**: no new per-turn allocation in the resolver hot path; the
rune-hook lookup is a registry read per hero per event, matching the existing
passive lookup cost

**Constraints**: gameplay is server-authoritative and the RNG seed never leaves the
server; in-progress battle state is re-derived from the action log, never stored;
replays are stored event logs and are never re-simulated

**Scale/Scope**: 33 effects across 10 pools · 27 champions × 3 slots = 81 rune
slots per account · 9 hook-surface changes · 2 write paths · 2 client surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constraint | The test | Verdict |
|---|---|---|---|
| XII | **Server authority & the seed boundary** *(NON-NEGOTIABLE)* | Can a modified client change an outcome, learn a future roll, or read a value it was not issued? Is RNG confined to the resolver? Is in-progress battle state re-derived rather than stored? | **PASS** — the four probabilistic effects roll in the resolver only. The reach roll is disclosed *after* it resolves, in the turn packet, exactly as 020 disclosed statuses; the client displays and never rolls. Pool validation is server-side from `slotAccepts`, so a forged effect id is refused rather than trusted. No new stored battle state. |
| XIII | **One rules engine** *(NON-NEGOTIABLE)* | Does anything compute a rule outcome outside `packages/sim`'s rules half? | **PASS** — the catalog is one module in `packages/sim/rules`. The Forge's effect descriptions are read from that catalog, not retyped; a test asserts no effect name or magnitude appears in `apps/api` or `apps/client`. |
| XIV | **Balance upward** | Does this lower a number a player has already spent on? | **PASS** — nothing is lowered. Every player who has bought stage 4 strictly gains. See *Open, deliberately* for the separate question of what those existing rows are owed. |
| XV | **Derived data is generated** | Does any file carry a hand-written bane, fault, or matrix cell? Are the three distinctness rules schema-validated? | **PASS** — pool membership derives from the hero's authored `primary`/`secondary` through the existing `slotAccepts`, and is never written to the rune row. A test asserts every hero's three slots resolve to three different pools, which follows from `secondary ≠ primary`. |
| XVI | **Cannot be backfilled** | Could each new persisted field be added later and still answer the question it exists for? | **PASS, and nothing new is persisted.** `utility_effect` already exists. Battle snapshots already carry `RuneLoadout.utility`. An absent loadout still means none, so pre-021 battles re-derive exactly as fought. The `engineVersion` bump is the gate that keeps that true. |
| XVII | **Storing is not exposing** | Does this change what is *recorded*, what is *exposed*, or both? Answered separately? | **PASS, and the two are answered separately.** *Recorded*: one text column that already existed. *Exposed*: 020's disclosure rule governs, unchanged — a player sees full detail on effects they caused and on their own champions; an enemy's self-applied effect shows without its duration. A rune effect is disclosed on exactly the same terms as any other effect. |
| XVIII | **Harm is a gate; taste is a note** | For every restriction: name the harm. | **PASS** — two restrictions, both with a named harm. Refusing an out-of-pool effect prevents a client granting itself any of the 33 regardless of its champion. Bounding `On the Same Breath` prevents an unbounded turn loop hanging the resolver. Everything else in the catalog is permitted. |
| XIX | **Vendors behind interfaces** | Does feature code name a vendor? Are entitlements account-level? | **N/A** — no vendor surface. Runes are earned with shards, which cannot be bought. |
| XX | **Written docs are canon** | Is every rule this plan relies on written in `docs/` or `resources/mechanics/`? | **PASS with one addition owed.** All 33 effects are canon in `06-progression.md` § *The utility catalog*. The one rule this plan relies on that is *named but not specified* is the duration class beyond the 4-turn ceiling for rune effects — `05-status.md` must gain it in the same commit as the code, per the 020 precedent that a magnitude existing only in TypeScript is not canon. |

> **XVI is the one that cannot be retrofitted.** Checked hardest and it is clean:
> this feature persists **no new field**. The column and the snapshot shape both
> predate it, and both were built with an absent value meaning *none*.

### Re-checked after Phase 1 design — no verdict moved

Three of them got *stronger* once the contracts were written, which is the point of
re-checking rather than restating:

- **XIII** was a discipline claim before Phase 1 and is now structural. `apps/client`
  may import `@lmntlz/sim/rules` (and is banned from `/resolver` and `/ai` by the
  root ESLint config, with `purity.test.ts` walking the graph behind it), so the
  Forge reads the *same catalog module the resolver runs*. There is no second copy
  to drift, rather than a rule against making one.
- **XII** gained a concrete refusal surface: the out-of-pool rejection is derived
  server-side from `slotAccepts`, so a client sending any of the 33 has the 29 not
  in its pool refused by name.
- **XVI** gained the confirmation that **no migration exists to get wrong** —
  `utility_effect` and `RuneLoadout.utility` both predate the feature.

**XX still carries its one owed addition**: `05-status.md` must gain the rune
duration class in the same commit as the code that uses it.

## Project Structure

### Documentation (this feature)

```text
specs/021-rune-utility-effects/
├── plan.md              # This file
├── spec.md              # The what and why
├── research.md          # Phase 0 — the five decisions
├── data-model.md        # Phase 1 — entities and their rules
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── runes-and-battle.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
packages/sim/
├── rules/
│   ├── runeEffects.ts        # NEW — 33 effects, RUNE_MAGNITUDES, pool tables
│   ├── passives.ts           # hooksOf widened; 9 hook-surface additions
│   ├── state.ts              # HeroState gains runeEffects + hasActed
│   ├── status.ts             # StatusInstance gains `stubborn`; cleanse honours it
│   ├── damage.ts             # healPreview reads healMultiplier; spendShield reads ignoresShields
│   ├── probability.ts        # hitFloor override
│   └── index.ts              # engineVersion e0.5.0 -> e0.6.0 (US3 only)
├── resolver/
│   └── resolve.ts            # 4 RNG draws, bounded extra action, DoT re-tick
└── tests/rules/
    ├── runeEffects.test.ts   # NEW — all 33, pool completeness, name collisions
    └── hookReach.test.ts     # NEW — no reader bypasses hooksOf

apps/api/src/
├── progression/
│   ├── runes.ts              # advanceStage + rebuildRune carry a utility choice
│   ├── read.ts               # (unchanged — already gates on stage >= 4)
│   └── routes.ts             # request validation for the new field
└── battle/
    ├── board.ts              # loadout -> HeroState.runeEffects; battle-start shield
    └── routes.ts             # reach roll travels in the turn packet

apps/client/src/features/
├── forge/                    # stage-4 picker + descriptions from the catalog
└── battle/                   # board indicator + battle-log lines
```

**Structure Decision**: no new package and no new app. The catalog is one module
inside the existing shared rules engine, which is what Constitution XIII requires
and what makes the Forge's preview honest — the screen computes its description
from the same table the resolver runs.

## Story sequencing and what each one delivers

| Story | Delivers | Effects | Gate |
|---|---|---|---|
| **US1** (P1) | the purchase is honest; 12 effects live | 12 | none beyond `hooksOf` and one `HeroState` field |
| **US2** (P2) | the designed catalog; **Water stops being empty** | +17 | 9 hook-surface changes |
| **US3** (P3) | the four dice-rollers | +4 | `engineVersion` bump · **deploy must drain** |
| **US4** (P4) | the player can see it | — | 020's disclosure rule applies unchanged |

Each is independently shippable. US1 alone leaves seven of ten pools holding a
single effect and Water holding none, which is why US2 is not optional in
practice — but it is separable, and shipping US1 first stops the overcharge
immediately.

## Complexity Tracking

No Constitution violations. Table intentionally empty.

## Open, deliberately

Recorded here so the tasks phase does not silently decide them.

1. **What is owed to existing stage-4 rune rows.** Every one paid 200 shards for
   nothing. Granting them an effect retroactively, refunding, or leaving them is a
   **product** decision. Not in scope; needs a ruling before launch, and the row
   count should be measured before anyone reasons about it — enumerate and show,
   never infer.
2. **A-02 through A-05** — the four assumptions that resolve a conflict rather
   than fill a gap. Defaults are stated in the spec and are enough to build on.
3. **The magnitudes.** Authored, in the 10–20-stat-point band by estimate, and
   sized against a battle 3.6× longer than the one the engine currently produces.
   FR-002 keeps the correction a one-file edit.
4. **`resources/mechanics/05-status.md` owes the rune duration class** — the one
   rule this plan relies on that is named in the design but not yet specified.
   Ships with US1's code, not after it.
