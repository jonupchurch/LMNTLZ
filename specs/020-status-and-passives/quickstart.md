# Phase 1 — Quickstart: proving 020 works

How to check this feature is real rather than merely present. The organising idea:
**every claim here has to be falsifiable by something other than "the code is there"**,
because "present but inert" is exactly the state 020 exists to end.

---

## Prerequisites

```bash
pnpm install          # already done in this repo
```

No database is needed for US1 or US2 — the status layer is pure and lives in
`packages/sim`. `apps/api` tests need Neon and are the slow, expensive ones; run them
last. (One full `apps/api` run is ~257s of continuous traffic against the shared
database.)

---

## The gates, in the order they get cheaper to fail

```bash
# 1. content — every one of the 87 powers accounted for
pnpm --filter @lmntlz/content test

# 2. the engine — the whole of US1 and US2 provable here, no I/O
pnpm --filter @lmntlz/sim test

# 3. typecheck, all packages
pnpm -r exec tsc --noEmit

# 4. the client
pnpm --filter @lmntlz/client test

# 5. the API — slow, needs Neon, run last
pnpm --filter @lmntlz/api test

# 6. the browser — the only thing that can see layout (US4)
pnpm --filter @lmntlz/client exec playwright test
```

**Run each as its own command and read each result.** A passing tail has hidden a failed
build in this repo before.

---

## Scenario 1 — a rider actually lands (US1)

The minimum claim: a power whose text promises an effect produces that effect.

1. Build a two-hero board where the attacker owns a tier-1 power carrying a slow.
2. Resolve one action with a seed chosen so the rider contest succeeds.
3. Assert the defender now carries a `debuff` on `speed` with magnitude **10** and
   **1** turn remaining, and that `turnQueue` reflects it immediately.

**The check that makes it non-vacuous**: run the same board with a seed where the
contest *fails* and assert the status list is empty. A test that only ever sees success
cannot tell "landed" from "always lands".

## Scenario 2 — the clock (US1)

1. Apply a burn from a hero with `Might` 40 at tier 2 — a tick of `40 × 0.35 = 14`, for
   2 turns.
2. Run the bearer's Upkeep: **14 damage, dealt before it acts**.
3. Kill the applier. Run the next Upkeep: **still 14**. The effect is snapshotted at
   application and never recalculates.
4. Run Resolution twice. The burn is gone.

**The edge worth exercising**: a burn that reduces the bearer to 0 during Upkeep ends
the turn there — `phasesFor` already returns `['upkeep']` for that case and nothing has
ever exercised it.

## Scenario 3 — stacking (US1)

| Given | Expect |
|---|---|
| the same power applied twice by the same hero | duration refreshes, magnitude does **not** add |
| the same kind from two *different* heroes | both present, magnitudes add |
| a fourth damage-over-time effect on one target | refused — cap is 3 |
| a smaller shield over a larger one | the larger survives |
| a second stun | duration refreshes; never two stuns |
| three +10 `Might` buffs on a hero at `Might` 45 | damage computed at **75**, not 85 |

That last row is the one to check first — it is the rule that makes overcapping waste,
and it is already implemented by `cappedStat`.

## Scenario 4 — runes are not eaten (US1) 🔴

**The regression this feature could most easily introduce, and it would be silent.**

1. Give a hero a `+10 Might` rune, so `statMods.might = 10`.
2. Apply a `+10 Might` buff and let it expire.
3. Assert `effectiveStat(hero, base, 'might')` is back to `base + 10`, **not** `base`.

If status points were written into `statMods`, expiry would subtract 10 from a bag that
also holds the rune's 10, and the player would silently lose what they paid for. Only
players who own runes would ever see it.

## Scenario 5 — the exits from Role (US2)

1. A Tank and a Buffer against one attacker with a free choice.
2. Assert the attacker is **compelled** to the Tank and cannot see the Buffer.
3. Move the Tank out of reach — assert the attacker now chooses freely.
4. Put **both** passives on one hero — assert the choice is unconstrained, because
   taunt and fade cancel.
5. Make the faded Buffer the only reachable enemy — assert the fade is **ignored**
   rather than emptying the candidate set.

Steps 4 and 5 need no new code: both are emergent from `legalTargets`'s existing
filter-then-compulsion ordering. They need a test, not an implementation.

## Scenario 6 — every passive does something (US2, US3)

The general form of SC-002, and the only honest test of "implemented":

> Same board, same seed, the passive **suppressed** versus **active**. The event logs
> must differ.

A passive that cannot make the engine behave differently has not been implemented,
whatever its catalog entry says. Run it for all 40.

## Scenario 7 — the past is unchanged (US1) 🔴

**Constitution XVI, and the reason `engineVersion` moves to `e0.3.0`.**

1. Take a replay recorded before this feature.
2. Play it back. Assert the turn text is **byte-identical** to what it produced before.
3. Assert the provenance line shows the *old* engine version.

Replays are stored event logs and are never re-simulated, so this must hold trivially —
but "must hold trivially" is exactly the claim worth checking, because it is the one
everybody assumes. The suites that gate it: `determinism`, `drawOrder`, `seedCustody`,
`reDerive`.

Separately, and this is the part that is **not** trivial: **in-flight battles must be
drained before the switch.** A battle mid-flight consumed zero draws at step 3 and would
re-derive differently under the new engine.

## Scenario 8 — you see your own numbers (US4)

| On screen | Expect |
|---|---|
| a burn **you** applied to an enemy | exact turns remaining |
| a stun on **your own** champion, whoever caused it | exact turns remaining |
| an enemy's **self-applied** shield | a pip, **no numeral** |

The third row is the one with teeth, and it is a *payload* assertion before it is a
visual one: the duration must be **absent from what the client receives**, not merely
unrendered. Hiding it client-side would leak through the API to anyone reading the
network tab, and it would contradict scouting, which already shows only which rune slots
are filled and never what they do.

---

## Definition of done, per story

| Story | Done when |
|---|---|
| **US1** | Scenarios 1–4 and 7 pass; `ridersLanded` is populated from real contests; all 87 powers accounted for in the rider file; the four determinism suites green |
| **US2** | Scenarios 5 and 6 pass for the 13 authored passives |
| **US3** | All 19 drafted rows approved by Jon; scenario 6 passes for all 27; `resources/mechanics/` carries the authored text in the same commit |
| **US4** | Scenario 8 passes, including the payload assertion; verified in a real browser, because jsdom does no layout |

---

## What "done" explicitly does not include

- The 33 tier-4 rune utility effects. Stage 4 still charges 200 shards and writes
  nothing; that is real, it is a separate feature, and it depends on this one.
- Reactive powers. The overlay authors zero today, which leaves `Already Gone` and
  `Nothing to Discuss` implementable only in the degenerate case.
- 019's remaining visual treatments.
