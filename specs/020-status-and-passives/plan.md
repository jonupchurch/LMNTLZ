# Implementation Plan: Status Effects and Passives

**Branch**: `020-status-and-passives` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-status-and-passives/spec.md`

---

## TL;DR

The engine was **built to have a status system and then never given one.** Almost
every seam this feature needs already exists and is wired to nothing: the targeting
pipeline accepts taunt and fade filters that the resolver never passes, the turn loop
already ticks status durations down and drops expired ones, and the resolver's
documented draw order already reserves step 3 for riders.

So this is far less new machinery than the spec's size suggests. The plan is: **build
the missing middle — a catalog and an applier — and connect the seams that are already
there.** Two genuinely new pieces are needed: an Upkeep step (nothing ticks
damage-over-time today, because the turn loop has no Upkeep at all) and a rider field on
`Power` (riders are currently *unrepresentable*, not merely unauthored).

One trap found during research, and it would have been expensive: `statMods` looks like
the obvious home for a stat buff and **is already occupied by rune points**. Writing
status buffs into it would mean an expiring buff subtracts from a player's permanent
runes. Status stat changes are therefore a *derived* second layer, never stored.

---

## Summary

Turn on the settled-but-unimplemented status layer, then the ~61 power riders and 40
passives that stand on it. `resources/mechanics/05-status.md` is the authority and is
complete; this feature authors almost no new rules, with one exception — US3's nineteen
unwritten unique passives, which are gated behind Jon's explicit approval.

**Technical approach**: a new `packages/sim/rules/status.ts` owning the catalog and the
pure transitions; `effectiveStat` extended to sum a derived status layer on top of the
existing rune layer; the resolver's step 3 populated; a new Upkeep step in
`apps/api/src/battle/turnLoop.ts`; rider data authored into a new overlay file beside
the existing one; and passive hooks expressed as the same `TargetFilter`/`Compulsion`
types the targeting pipeline already accepts.

---

## Technical Context

**Language/Version**: TypeScript 5.x, ESM, `exactOptionalPropertyTypes: true`

**Primary Dependencies**: `@lmntlz/content` (authored roster), `@lmntlz/sim` (rules +
resolver), Hono on the API side, React 19 on the client. No new runtime dependency.

**Storage**: none added. In-progress battle state is **re-derived from the append-only
action log on every request** and never stored (Constitution XII), so a status is a
computed value, not a row. Replays remain stored JSON event logs.

**Testing**: Vitest across `packages/sim`, `packages/content`, `apps/api`,
`apps/client`; Playwright for the client. The suites that gate this feature specifically
are `tests/resolver/drawOrder`, `seedCustody`, `determinism` and `reDerive`.

**Target Platform**: desktop browser at 1.0, Electron on Steam as a fast-follow. Engine
code is server-only; `packages/sim/rules` is shared and pure.

**Project Type**: monorepo — pnpm + Turborepo, one shared rules package consumed by both
an API and a client.

**Performance Goals**: a battle is re-derived from its log on **every** request, so the
turn loop is the hot path. Status evaluation must stay O(statuses per hero) with no
allocation per stat read; a hero carries at most ~6 statuses under the stack caps.

**Constraints**:

- **The RNG seed never leaves the server** and every draw is accounted for by index.
- **`packages/sim/rules` stays pure** — no RNG, no I/O, no clock. Rider *contests* are
  resolution and therefore live in `packages/sim/resolver`.
- **Stored replays must re-derive identically** after this ships.

**Scale/Scope**: 87 active powers, 40 passives, 27 champions, 6 status families. Four
user stories; US1 is roughly half the work and unblocks the rest.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constraint | The test | Verdict |
|---|---|---|---|
| XII | **Server authority & the seed boundary** *(NON-NEGOTIABLE)* | Can a modified client change an outcome, learn a future roll, or read a value it was not issued? Is RNG confined to the resolver? Is in-progress battle state re-derived rather than stored? | **PASS** — rider contests are draws, so they live in `packages/sim/resolver` beside the hit and crit draws, server-side. The catalog in `rules/` is pure and deterministic. No status is persisted; the whole layer is re-derived from the log. US4 sends *rendered* durations, and the visibility rule means an enemy self-effect's duration is **never on the wire at all** rather than hidden client-side. |
| XIII | **One rules engine** *(NON-NEGOTIABLE)* | Does anything compute a rule outcome outside `packages/sim`'s rules half? | **PASS** — magnitudes, durations, potency, stacking and expiry all live in `rules/status.ts` and nowhere else. The client imports the catalog for *labels and icons* and computes no magnitude. Explicitly rejected: a client-side copy of the duration table to avoid a round trip. |
| XIV | **Balance upward** | Does this lower a number a player has already spent on? If so, where is the compensating grant? | **PASS, with a caveat carried into US3.** Nothing here lowers a spent-on number — runes are untouched, and turning riders *on* is strictly additive. The caveat is forward-looking: an over-tuned unique passive can only be corrected by raising twenty-six others, which is why US3 is gated on approval **before** implementation rather than after. |
| XV | **Derived data is generated** | Does any file carry a hand-written bane, fault, or matrix cell? Are the three distinctness rules schema-validated? | **PASS** — untouched. And extended in spirit: **rider magnitude and duration derive from the power's tier**, never authored per power, so the overlay carries only *which family, which stat, at whom*. A magnitude appearing in the overlay is a schema error, not a style choice. |
| XVI | **Cannot be backfilled** | Could each new persisted field be added later and still answer the question it exists for? If no, it ships with the first record. | **PASS — and this is the one that needed real work.** Rider contests consume RNG draws that pre-020 battles did not, so an in-flight battle re-derived by the new engine would diverge. `engineVersion()` moves `e0.2.0` → `e0.3.0`, and every stored replay already carries the version it was recorded under. See [research.md](./research.md) §3 for the drain-and-switch procedure and why no backfill is possible or needed. **No new persisted field is introduced**, so there is nothing else to get wrong here. |
| XVII | **Storing is not exposing** | Does this change what is *recorded*, what is *exposed*, or both? Answered separately? | **PASS, answered separately.** *Recorded*: nothing new — statuses are re-derived, not stored; the event log already carries `ridersLanded`/`ridersResisted` and will finally populate them. *Exposed*: US4 only, under the rule settled 2026-07-27 — exact durations for effects you caused and effects on your own champions; an enemy self-effect is presence-only, with the duration **omitted from the payload** rather than hidden in the client. |
| XVIII | **Harm is a gate; taste is a note** | For every restriction: name the harm. If you cannot, it is a warning, not a block. | **N/A** — no user-facing restriction, no moderation surface, no user-generated content. |
| XIX | **Vendors behind interfaces** | Does feature code name a vendor? Are entitlements account-level rather than per-storefront? | **N/A** — no vendor is touched. No payment, storage, realtime or auth surface. |
| XX | **Written docs are canon** | Is every rule this plan relies on written in `docs/` or `resources/mechanics/` — not only in a `.dc.html`? | **PASS** — every rule comes from `05-status.md` (magnitudes, potency, stacking, the clock, shred-as-percentage, snapshotting, visibility), `03-powers.md` (the passive taxonomy) and `04-turns.md` (the five phases, the targeting pipeline). **One gap is created deliberately and must be closed inside this feature**: US3's nineteen new unique passives are new authored rules, so they land in `resources/mechanics/` in the same commit that implements them, per the rule that a new or reversed decision moves the doc. |

> **XVI is the one that cannot be retrofitted.** Checked hardest, and it is the only
> constraint that forced a change to the plan: the engine version bump and the
> drain-before-switch step are in the task list rather than assumed.

---

## Project Structure

### Documentation (this feature)

```text
specs/020-status-and-passives/
├── plan.md              # This file
├── research.md          # Phase 0 — the five decisions, with what was rejected
├── data-model.md        # Phase 1 — StatusInstance, Rider, PassiveHook
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── status.d.ts      # the rules package's new public surface
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, not created here
```

### Source Code (repository root)

```text
packages/sim/
├── rules/
│   ├── status.ts            # NEW — the catalog, apply/refresh/stack, expiry, readers
│   ├── passives.ts          # NEW — hook definitions and the 40 implementations
│   ├── state.ts             # CHANGED — StatusInstance gains magnitude/stat/snapshot;
│   │                        #           effectiveStat sums the derived status layer
│   ├── targeting.ts         # UNCHANGED — already accepts TargetFilter / Compulsion
│   ├── phases.ts            # UNCHANGED — isIncapacitated already reads statuses
│   ├── damage.ts            # CHANGED — mitigation reads the shred layer
│   └── index.ts             # CHANGED — export the new surface
├── resolver/
│   └── resolve.ts           # CHANGED — step 3 populated; taunt/fade fed to legalTargets
└── tests/
    ├── rules/status.test.ts     # NEW
    ├── rules/passives.test.ts   # NEW
    └── resolver/riders.test.ts  # NEW

packages/content/
├── src/schema.ts            # CHANGED — powerSchema gains `riders`
├── src/passives.ts          # CHANGED — the 19 unique effects, once approved
└── tests/riders.test.ts     # NEW — every active power accounted for

tools/
├── power-riders.json        # NEW — authored rider data, drift-checked at build
└── build-content.ts         # CHANGED — read and validate it

apps/api/src/battle/
├── turnLoop.ts              # CHANGED — a new Upkeep step; durations already tick
└── packet.ts                # CHANGED — carry statuses under the visibility rule

apps/client/src/features/battle/
└── StatusRow.tsx            # NEW — pips and durations (US4)

resources/mechanics/
└── 03-powers.md             # CHANGED — the 19 authored unique passives (US3)
```

**Structure Decision**: no new package and no new app. The work lands in the three
places that already own these concerns — `packages/sim` for rules and resolution,
`packages/content` plus `tools/` for authored data, `apps/api` for the turn loop. The
one new client file is a leaf component.

---

## What already exists, and what is genuinely missing

Established by reading the code rather than by memory. This table is the reason the
plan is smaller than the spec:

| Piece | State | Where |
|---|---|---|
| `StatusInstance` type, `HeroState.statuses` | **exists** | `rules/state.ts` |
| Duration tick + expiry each Resolution | **exists, ticking an empty array** | `turnLoop.ts` `applyResolution` |
| Crowd control skipping phases 2–4 | **exists** | `phases.ts` `isIncapacitated` |
| Taunt / fade machinery + their cancellation | **exists, never fed** | `targeting.ts` `Compulsion`, `TargetFilter` |
| Draw-order slot for rider contests | **documented and reserved** | `resolve.ts` step 3 |
| `riderLandProbability` | **exists, no consumer** | `rules/probability.ts` |
| A catalog of kinds with per-family stacking | **missing** | — |
| Anything that *creates* a status | **missing** | — |
| Readers for shred, shield, DoT | **missing** | — |
| An Upkeep step to tick DoT | **missing — there is no Upkeep at all** | `turnLoop.ts` |
| A rider field on `Power` | **missing — riders are unrepresentable** | `content/src/schema.ts` |
| Any consumer of `hero.passives` | **missing** | — |

---

## The five decisions this plan settles

Full reasoning, including what was rejected and why, is in
[research.md](./research.md). In brief:

1. **The catalog lives in `packages/sim/rules/status.ts`** as pure data plus pure
   transitions. Contests live in `resolver/` because they draw. This split is forced by
   XII and XIII together and matches how `damage.ts` and `resolve.ts` already divide.

2. **Rider data is authored in a new `tools/power-riders.json`**, a sibling of the
   existing `power-targeting.json` overlay, with the same build-time drift check. It
   carries *family, stat, and at-whom* only — **never a magnitude or duration**, which
   derive from tier (XV).

3. **`engineVersion()` moves to `e0.3.0`** and battles drain before the switch. Rider
   contests add draws, so an in-flight battle would otherwise re-derive differently.
   Stored replays are unaffected — they are event logs and are never re-simulated.

4. **Passive hooks reuse the existing types.** Taunt is a `Compulsion`, fade is a
   `TargetFilter`, and both are already accepted by `legalTargets` and simply never
   passed. Their cancellation is not special-cased — it falls out of
   filter-then-compulsion ordering, which the module already documents.

5. **US3 is drafted as one table and approved line by line before any of it is
   implemented**, each row priced against the tier scale or an existing mechanic.

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Seven **PASS**, two **N/A**, nothing to justify.

One item is recorded as a *deliberate cost* rather than a violation:

| Decision | Why | Cost accepted |
|---|---|---|
| `statMods` keeps meaning "permanent points"; status stat changes are a **derived** second layer rather than entries in the same record | `board.ts` already writes rune allocations into `statMods`. One shared bag makes a buff and a rune indistinguishable, so expiring a 2-turn `+10 Might` would subtract from what a player *bought* — silently, and only for players who own runes | One extra summation per stat read, bounded by the stack caps (≤6 statuses per hero). Cheaper than reconciling two writers, and it makes expiry correct by construction |
