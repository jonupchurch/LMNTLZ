# Quickstart: Defense AI

**Feature**: `004-defense-ai` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/sim test ai          # 324 cases, fast, in CI
pnpm tsx tools/characterize-orderings.ts   # 19,440 pairs, OFFLINE, not CI
```

**The sweep is a prerequisite for the defaults, not a validation of them.** Run it
before picking any default, and run it again after the hero-numbers pass — a
one-point shift in the tier-4/5 ladder wipes the safe set entirely.

## The sweep — what it must print

Reproduce these or something changed. Every figure below was verified against
`resources/mechanics/07-defense-ai.md` during Phase 0:

```
greedy 5·4·3·2·1·0 tier shares   5.4  18.8  23.6  23.6  16.7  11.9
19,440 pairs, powers still live  16.7 / 16.7 / 19.2 / 24.4 / 20.2 / 3.0 %
universally safe orderings       12          median per hero: 13
ALL 12 end in tier 0             true        ← the structural rule
11 of 12 end 1·0                 true        ← a regularity, NOT a rule
```

> **The tripwire in the plan is miscalibrated and this quickstart supersedes it.**
> The plan says *"every one of them ends `1·0`; if a re-derivation produces one
> that does not, the ladder changed."* One of them — `4·3·2·1·5·0`, the **Tank
> default** — ends `5·0`, and the ladder has not changed. **Check "all end in tier
> 0" and "the count is 12" instead.** A safe ordering that does not end in tier 0
> means the cooldown model itself changed, which is a real alarm.

**Report both horizons.** 60 turns for continuity with the recorded analysis, and
**9** — a hero takes ~8.5 turns in a real 6v6. At 9 turns *no* ordering keeps all
six powers live, because tier 0 is structurally last. Excluding the auto-attack,
**32 of 720** keep tiers 1–5 live on all 27.

## The CI tests — 324 cases

### `safeOrderings.test.ts`

12 orderings × 27 heroes. Every power fires at least once at 60 turns. Then the
assertion that actually describes a game:

```
for each role default, applied ONLY to that role's heroes, at 9 turns:
    every tier 1-5 fires at least once
    tier 0 may be zero — it is the fallback, and a short battle rarely needs it
```

Verified during Phase 0: **every hero fires its ultimate at least once under every
default**, at battle length. If that stops being true, a default is deleting a
power in the game rather than in the asymptote.

### `firingProfile.test.ts` — SC-003

Prediction must match simulated behaviour. Two halves:

1. **The rank-1 closed form as the oracle.** For every hero and every ordering,
   the simulated top-rank count equals `floor((T − gate)/(cooldown + 1)) + 1`.
   19,440 assertions, exact, and it catches an off-by-one in the cooldown tick —
   the thing most likely to be wrong.
2. **No closed form below rank 1.** Assert the naive `1/(cooldown+1)` *disagrees*
   with simulation for ranks 4–6, so nobody later "optimises" the simulation away.
   Bramwen under greedy: tier 1 is **0.183**, not 0.500; tier 0 is **0.033**, not
   1.000.

### `taunt.test.ts`

Compulsion beats priority, always. A taunting Tank pulls a defender off its
preferred target exactly as it pulls a player. Then the invariant: a compulsion
naming a hero **outside** the candidate set does not apply.

### `reachWindow.test.ts` — FR-020

```
reach-2 front seat, no rune      → 2 reachable enemy rows; `middle` == `furthest`
reach-2 front seat, +1 reach     → 3 reachable enemy rows; `middle` selects row 5
```

The second case fails on the natural implementation. It is the whole reason FR-020
exists.

Same family, same test file: **Silka's chain cap is `enemies in reach`, not 2.**
Full formation gives 2; enemy front row wiped gives 3. A hard-coded 2 reproduces
the arbitrary number this rule replaced.

## The manual pass

1. Build a defense squad with the **worst** ranking you can find —
   `1·2·3·4·5·0`. Confirm the builder reports **both ultimates dead**. That is
   FR-018 doing its job, and it is the difference between a lever and a trap.
2. Set a champion to `middle` with no reach rune. Confirm it behaves as
   `furthest` — **not** as `nearest`. Degrading toward the front line would invert
   the instruction rather than approximate it.
3. Run the same battle twice from the same seed. Every engine choice identical,
   including the tiebreak-5 draws. If they differ, something in `ai/` reached for
   a local random source instead of the resolver's.
4. Confirm an attacker can see **nothing** of the defender's configuration — not
   in the scout view, not in the battle response, not in either zone.
