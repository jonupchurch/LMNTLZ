# Phase 1 — Quickstart: proving Rune Utility Effects works

**Feature**: `021-rune-utility-effects` · **Date**: 2026-08-01

How to prove this feature works, in the order the evidence gets harder to fake.
Each scenario states what it proves and what would make it **vacuous**, because a
green test that cannot fail is worse than no test.

---

## Prerequisites

```bash
pnpm install
pnpm --filter @lmntlz/content build     # sim and api resolve content from dist
pnpm --filter @lmntlz/sim build         # api resolves sim from dist
```

> **Rebuild before typechecking downstream.** `packages/sim` and `apps/api` both
> resolve content from `dist`; a stale `dist` produces type errors that describe a
> package version nobody has.

**The gate is `tsc` plus the build, not the test run.** Vitest transforms with oxc
and **does not typecheck** — a green suite says nothing about whether the client
compiles. Run each as its own command and read each result:

```bash
pnpm -r typecheck
pnpm --filter @lmntlz/client build
```

---

## Scenario 1 — the catalog is complete and honest *(US1)*

```bash
pnpm vitest run --project @lmntlz/sim rules/runeEffects
```

**Proves**: 33 entries; 6 common and 3 per element; one offense / one defense /
one tempo per element pool; no name collides with an authored power or passive;
every id unique; **no numeric literal in an effect body** — every magnitude comes
from `RUNE_MAGNITUDES`.

**Would be vacuous if**: the completeness test hand-listed the effect names. It
must derive them from the registry (`Object.keys`) and from `packages/content`'s
own type list, so adding a tenth element or a seventh common effect fails the test
rather than passing it silently. *This is the exact hole 020's anti-vacuity guard
fell into — it listed its nine hook names by hand and read fourteen new passives as
inert.*

## Scenario 2 — no reader bypasses the widened lookup *(US1, the keystone)*

```bash
pnpm vitest run --project @lmntlz/sim rules/hookReach
```

**Proves**: every hook-registry lookup in `passives.ts` goes through `hooksOf`.
The test reads the module source and fails on any other call to `hooksFor`.

**Why it matters**: 21 of 22 readers already go through `hooksOf`; widening it is
what makes rune effects work everywhere at once. The single bypass at
`passives.ts:1498` decides `ignoresFade`/`immuneToTaunt` for the *acting* hero — so
without the fix, `Nowhere to Stand` is read for every hero except the one taking
the turn, which is to say never.

**Mutation check**: restore the bypass. The test must go red, and
`Nowhere to Stand`'s own test must go red too. If only one fails, the other is
measuring something else.

## Scenario 3 — a player buys an effect and it fires *(US1, end to end)*

```bash
pnpm --filter @lmntlz/api vitest run progression/runes battle/runeEffects
```

**Proves**: the 3→4 advance stores the chosen id; the rebuild path stores one too;
an out-of-pool id is refused **by name**; 200 shards are debited exactly once; the
loadout reaches `HeroState.runeEffects`; and the effect fires in a resolved battle.

**Would be vacuous if**: the fixture inserted the rune row by hand. It must go
through the real write path — a hand-insert tests a database nobody has, and this
repo has already been caught three times in one fixture by exactly that.

**Mutation check**: revert `utilityEffect: null` at `runes.ts:377`. The store
assertion must fail. *That null is the production behaviour today, so this mutant
is the bug itself.*

## Scenario 4 — the pools are not silently short *(US2)*

```bash
pnpm vitest run --project @lmntlz/sim rules/runeEffects -t pool
```

**Proves**: every pool offers its designed count. Specifically that **Water holds
three, not zero** — US1 alone implements none of Water's three effects, and seven
of the ten pools hold exactly one. A pool that quietly shrinks to a single effect
is the *"fixed single effect per pool"* outcome the design named as the one to
avoid, because it strands half the elemental shard sink.

## Scenario 5 — determinism and the past *(US3)*

```bash
pnpm vitest run --project @lmntlz/sim determinism drawOrder seedCustody
pnpm --filter @lmntlz/api vitest run replays
```

**Proves**: a fixed seed resolves identically across repeated evaluation with all
four probabilistic effects live; every added draw is accounted for; and a battle
recorded at `e0.5.0` replays to the outcome it was fought with.

**Would be vacuous if**: the determinism fixtures field no runes — which today they
do not. **At least one fixture must carry all four dice-rolling effects**, or the
suite is proving determinism of a board where nothing rolls.

**Mutation check**: move one draw from before the hit contest to after it. Draw
order must go red while the per-effect behaviour tests stay green — that is what
tells you the draw-order suite is measuring order rather than outcome.

## Scenario 6 — the reach roll is shown before the choice *(US3)*

```bash
pnpm --filter @lmntlz/api vitest run battle/turnPacket
```

**Proves**: when a bearer's turn-start roll succeeds, the packet carries
`reachGranted` **and** the legal-target list already reflects it.

**Would be vacuous if**: it asserted only that the flag is present. It must assert
the **target list itself is larger** — the design's whole point is that the roll is
a decision input, not variance applied after a decision. A flag with an unchanged
target list is the failure, and it would pass a presence check.

## Scenario 7 — the player can see it *(US4)*

```bash
pnpm --filter @lmntlz/client vitest run forge battle
pnpm --filter @lmntlz/client exec playwright test e2e/forge.spec.ts e2e/battle.spec.ts
```

**Proves**: the stage-4 builder describes each offered effect before any shards are
committed; an active effect shows on the battle board; the battle log names the
effect when it fires.

**Then look at it.** Take a screenshot of the Forge at stage 4 and of a battle
board with an active rune effect.

> ⚠️ **The screenshot is the instrument.** 1,034 unit tests and three purpose-built
> e2e tests all passed while status pips sat on top of the text of all twelve rail
> cards. The hole was `.first()` on a selector matching two elements, which
> silently picked the card that was fine. **Assert the count before indexing**, and
> remember `fullPage` does not scroll.

---

## The full gate, before any commit

Run these as **separate calls** and read each result. A passing tail has hidden a
failed build here before.

```bash
pnpm -r typecheck
pnpm vitest run --project @lmntlz/sim --project content
pnpm --filter @lmntlz/api vitest run
pnpm --filter @lmntlz/client build
```

**Known pre-existing**: 6 matchmaking failures, proven at HEAD with a clean tree.
If the count is not 6, something in this feature caused the difference — prove it by
stashing and re-running, never by reasoning about the diff.

**Before declaring done**: a push is not a deploy. Ask Vercel for the deployment
list, wait for READY on both projects, then prove the deployed code by fetching the
production bundle and grepping it for the new effect ids — not by trusting the SHA.
