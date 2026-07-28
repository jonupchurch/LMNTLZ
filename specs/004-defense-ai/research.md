# Phase 0 Research: Defense AI

**Feature**: `004-defense-ai` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

**All three questions were answered by running the sweep**, not by reasoning. The
19,440-pair characterisation was executed against the authored workbook; the
script is reproduced as `tools/characterize-orderings.ts` in the plan's structure.

**Headline: the recorded analysis reproduces exactly, and it contains one wrong
claim and one measurement artifact.** Both are recorded below with what replaces
them.

---

## Q1 — Re-derive the 12 universally safe orderings *(computed)*

### The re-derivation reproduces every published figure

Simulating all 720 orderings against all 27 heroes over 60 turns, counting a power
as live at **≥1% of turns**, exactly as `07-defense-ai.md` describes:

| | computed | recorded |
|---|---|---|
| greedy `5·4·3·2·1·0` tier shares | 5.4 · 18.8 · 23.6 · 23.6 · 16.7 · 11.9 | **identical to the decimal** ✓ |
| 1 power live | 16.7% | 16.7% ✓ |
| 2 powers live | 16.7% | 16.7% ✓ |
| 3 powers live | 19.2% | 19.2% ✓ |
| 4 powers live | 24.4% | 24.4% ✓ |
| 5 powers live | 20.2% | 20.2% ✓ |
| **6 — all live** | **3.0%** | **3.0%** ✓ |
| universally safe orderings | **12** | 12 ✓ |
| median safe orderings per hero | **13** | 13 ✓ |

**The cooldown ladder has not moved.** The model is confirmed.

### The 12, in full

```
3·4·2·5·1·0     4·3·2·5·1·0     4·5·2·3·1·0     5·2·3·4·1·0
3·4·5·2·1·0     4·3·5·2·1·0     4·5·3·2·1·0     5·2·4·3·1·0
3·5·4·2·1·0     4·3·2·1·5·0  ←  ends 5·0        5·4·2·3·1·0
                                                5·4·3·2·1·0
```

### **Finding 1 — the `1·0` rule is wrong, and its tripwire was miscalibrated**

`07-defense-ai.md` states: *"Exactly 12 of 720 orderings are healthy for all 27
heroes, and every one of them ends `1·0` — tier 1 second-to-last, tier 0 last.
That is a structural rule, not a style."*

**Eleven of twelve end `1·0`. The twelfth is `4·3·2·1·5·0`, which ends `5·0` — and
it is the published Tank default**, described three paragraphs later as *"the only
safe ordering that trades the ultimate for uptime."* The document contradicts
itself.

This matters more than a typo because the plan turned the claim into a tripwire:
*"Every one of them ends `1·0` — if a re-derivation produces one that does not, the
ladder changed and the defaults need revisiting."* A re-derivation **does** produce
one that does not, and the ladder **has not** changed. Followed literally, the
tripwire raises a false alarm and sends someone to re-tune a correct ladder.

**The real structural rule, and it is provable rather than measured:**

> **Tier 0 must be ranked last.** A power fires only when everything above it is on
> cooldown; the tier-0 auto-attack has cooldown 0 and no gate, so it is available
> every turn, so anything ranked below it never fires.

Verified: **all 12 safe orderings end in tier 0**, and this is *necessary but not
sufficient* — 120 of 720 orderings end in tier 0 and only 12 are safe. The `1·0`
pattern is a strong empirical regularity (11/12), not a rule.

→ **Correction owed to `resources/mechanics/07-defense-ai.md`**; logged in
`resources/README.md`. The plan's tripwire is restated below.

**The corrected tripwire**: re-derive after the hero-numbers pass and check that
**all 12 still end in tier 0** and that the **count is still 12**. A safe ordering
that does *not* end in tier 0 means the cooldown model itself changed.

### **Finding 2 — the safe set is fragile to the ladder, exactly as feared**

Shifting every hero's tier-4 and tier-5 cooldowns by one point:

| Ladder shift | universally safe orderings |
|---|---|
| **−1** | **0** |
| 0 (as authored) | 12 |
| +1 | 13 (gains `5·3·2·1·4·0`) |

**A one-point reduction wipes the safe set entirely.** So the plan's instruction to
re-derive after the hero-numbers pass is not a formality — it is the difference
between four defaults that keep every power live and four that do not. The sweep
must run again before the numbers are locked, and the defaults must be re-picked
from whatever it returns.

### **Finding 3 — 60 turns is a measurement artifact, and it is ~7× a real battle**

The safe set is a function of the horizon it is measured over:

| horizon | orderings keeping all six powers live on all 27 |
|---|---|
| 8 turns | **0** |
| 9 | **0** |
| 13 | **0** |
| 17 | 1 |
| 20 | 2 |
| 30 | 7 |
| **60** | **12** |

**A hero takes about 8.5 turns in a real 6v6** — 102 hero-turns across 12 heroes
(`06-progression.md`, `04-turns.md`). At that horizon **no ordering keeps all six
powers live**, because tier 0 is structurally last and a battle is too short for
the top five to be simultaneously on cooldown.

**This does not invalidate the defaults, and the reason is worth stating
precisely.** Scoping each published default to the heroes it is actually assigned
to and running 9 turns, the **only** power that ever fails to fire is **tier 0** —
which is the fallback, and whose job is to cover a gap that a short battle rarely
produces:

| Role default | heroes | powers that never fire in 9 turns |
|---|---|---|
| Striker `5·4·3·2·1·0` | 12 | tier 0 on 8 of 12; **nothing else** |
| Tank `4·3·2·1·5·0` | 7 | tier 0 on all 7; **nothing else** |
| Ranged `3·5·4·2·1·0` | 5 | tier 0 on all 5; **nothing else** |
| Buffer `4·5·2·3·1·0` | 3 | tier 0 on all 3; **nothing else** |

Every hero fires its **ultimate at least once**, under every default, at battle
length. The Tank default's *"trades the ultimate for uptime"* costs a tier-5
firing only on the fastest ladder (cooldown 6) — which belongs to the three
Buffers and one Striker, **none of whom receive the Tank ordering**.

> **The safety property should be restated as tiers 1–5, not tiers 0–5.** Excluding
> the auto-attack, **32 of 720 orderings keep tiers 1–5 live on all 27 heroes at
> 9 turns**, rising to 79 by 30 turns. That is the number that describes a real
> battle. The 12 remain the right *defaults* — they are the intersection of safe at
> both horizons — but the "3% of orderings keep a whole kit working" figure is a
> 60-turn statement and should not be quoted about a battle.

**Decision**: keep the 12 as the default pool. **Add the 9-turn check to the
sweep** and report both horizons, because the squad builder's warning (FR-018) is
a claim about the player's actual battles, not about a 60-turn asymptote.

---

## Q2 — How the firing profile is computed *(computed)*

**Decision: simulate. The closed form is not an alternative — it is wrong for five
of the six ranks.**

The plan offered a closed form from `1/(cooldown+1)` availability as the faster
option. Measured against simulation for Bramwen under greedy `5·4·3·2·1·0`:

| tier | cooldown | naive `1/(cd+1)` | simulated | |
|---|---|---|---|---|
| 5 (rank 1) | 7 | 0.125 | **0.117** | gate-adjusted closed form is exact — see below |
| 4 (rank 2) | 5 | 0.167 | 0.167 | coincides |
| 3 (rank 3) | 3 | 0.250 | 0.250 | coincides |
| 2 (rank 4) | 2 | 0.333 | **0.250** | wrong |
| 1 (rank 5) | 1 | 0.500 | **0.183** | badly wrong |
| 0 (rank 6) | 0 | 1.000 | **0.033** | uselessly wrong |

**A power's share is not its availability — it is its availability *in the gaps
everything above it leaves*.** The naive form describes an unconstrained power, and
only the top-ranked power is unconstrained.

**There is an exact closed form, and it covers exactly one rank:**

```
rank 1:   fires = floor((T − gate) / (cooldown + 1)) + 1        # exact, verified
                                                                # on all 27 heroes
                                                                # x 120 orderings
ranks 2-6: no closed form. Simulate.
```

**Decision, and the test that follows.** `firingProfile(hero, ranking)` simulates.
The rank-1 closed form is the **test**: for every hero and every ordering, the
simulated rank-1 count must equal `floor((T − gate)/(cooldown+1)) + 1`. That is a
19,440-case assertion that costs nothing and catches an off-by-one in the
cooldown-tick semantics, which is the thing most likely to be wrong.

**SC-003's agreement requirement is met by construction**: the profile simulates
using **the same cooldown-tick semantics as the engine**, imported from
`sim/rules`, not reimplemented. A second implementation is a second thing to
diverge.

**The horizon is a parameter, defaulting to a real battle.** From Finding 3, a
60-turn profile does not describe a game anyone plays. `firingProfile` takes
`turns` and the squad builder passes **9**. The characterisation sweep passes 60
for continuity with the recorded analysis and reports both.

**Cooldown semantics, stated once so both sides use it:** a power fired on turn `t`
with cooldown `c` is next available on turn `t + c + 1`. Cooldown 0 means available
every turn. Cooldowns tick in Resolution, unconditionally, including for a hero
that lost its turn (`04-turns.md`, feature 002 FR-024/FR-025).

---

## Q3 — Confirm the reach window is computed, never bounded

**Confirmed, and the trap is real.** `02-squads.md` states that at base reach a
champion sees **at most two enemy rows**, and derives the "two distance entries,
not three" menu from it. The Air rune `Further Than It Looks` grants **+1 reach for
a turn**, which puts a reach-2 front-seat champion in range of rows 4, 5 **and** 6.

**Decision: the reach window is derived from `distance()` on every evaluation.
There is no constant `2` anywhere in `ai/`, and no array sized to two rows.**

The menu therefore carries **three** distance entries — nearest · middle ·
furthest — and **`middle` degrades to `furthest`** when fewer than three rows are
reachable. Because priority is a *sort* and never a filter, the degradation needs
no special case: it falls out of the same mechanism as everything else.

> **Degrading to *furthest* rather than *nearest* is the point.** A defender
> choosing *middle* is asking to get **past the front line**. Dropping them onto
> the front row when the window narrows inverts the instruction rather than
> approximating it.

**The test that catches this** (`reachWindow.test.ts`): a reach-2 champion in the
front seat, with `+1` reach applied, must return **three** distinct reachable enemy
rows and `middle` must select from row 5. Without the rune it returns two and
`middle` must return the same champion as `furthest`.

**A second bound to avoid, from the same family.** Silka's `Quicker Than Told`
chains *"as many times as there are enemies in reach"* — a cap of 2 at full
formation that **grows to 3** once the enemy front row is wiped. Any implementation
that caps the chain at 2 reproduces the old arbitrary number that this rule
replaced.

---

## A stale figure found on the way

`07-defense-ai.md` argues against opening scripts with: *"a battle runs roughly
**13 turns per hero** (`01-stats.md`), so a three-power script configures **under a
quarter** of a hero's fight."*

**13 is `155 / 12` — the pre-`+20` median.** The current figure is `102 / 12` =
**8.5**, so a three-power script configures about **35%** of a hero's fight, not
under a quarter.

**The conclusion still stands** — a ranking governs every turn from one setting,
and the gate argument (tier 5 can never appear in an opening script) is untouched.
But the arithmetic no longer says what it says. This is the **fifth** instance of
the stale-155 cascade; the other four were corrected in `06-progression.md`.
→ logged in `resources/README.md`.

---

## What is NOT settled here, and cannot be

- **Which ordering suits which role.** `07-defense-ai.md` marks the role→ordering
  mapping as *a proposal; the safety is not*, and specifically flags the Buffer
  assignment as assuming its mid tiers carry the support. **This needs the powers'
  effects read, not their cooldowns simulated** — the sweep can prove a power
  fires, never that firing it was worth doing. It belongs with the hero-numbers
  pass.
- **The exact ally-targeting menu.** `07-defense-ai.md` leaves it open beyond
  "short enough to read on a squad-builder row" and "the default is lowest HP
  percentage". No signature here depends on the final list.
- **Whether the 12 survive the hero-numbers pass.** Finding 2 says probably not —
  a one-point ladder move wipes them. Re-run the sweep; do not assume.
