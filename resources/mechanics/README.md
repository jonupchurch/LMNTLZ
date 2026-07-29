# LMNTLZ · mechanics

The systems layer. Where `../LORE-and-flavor.md` holds the world and
`../characters/` holds who's in it, this folder holds **how the game actually
resolves** — stats, damage, turns, powers, progression.

Rule for everything in here: a mechanic is only "documented" once you can hand
it to someone and they can compute an outcome from it. Prose that describes a
feeling is lore; numbers, orderings, and formulas are mechanics.

## Documents

| # | File | Covers | State |
|---|------|--------|-------|
| 01 | `01-stats.md` | The ten hero stats and the damage resolution pipeline | **Settled** — every formula specified; the roster's *values* are the stat pass's problem |
| 02 | `02-squads.md` | Squad size, the 2/3/1 formation, row rules and reach | **Drafted** — shape settled, six rules open |
| 03 | `03-powers.md` | 6 active powers + 3 passives per hero; multipliers, cooldowns, healing | **Drafted** — 127 powers authored and costed, magnitudes now supplied by 05 |
| 04 | `04-turns.md` | The five-phase turn; the turn queue and action economy | **Settled** — phases, targeting, reactions and turn order all decided |
| 05 | `05-status.md` | Crowd control and buff/debuff effects; what Resolve resists | **Drafted** — magnitudes, potency, stacking and the effect catalog all specified |
| 06 | `06-progression.md` | Rune Shards, custom runes, the rating ladder | **Drafted** — currency, power model, rates and the daily curve settled; the ladder is open |
| 07 | `07-defense-ai.md` | How the engine plays a defense squad | **Drafted** — targeting priority, power preference and scouting all settled |
| 08 | `08-guilds.md` | Guilds of up to 24, split into three Wings of 8 | **Drafted** — membership settled, rewards blocked on 06 |
| 09 | `09-matchmaking.md` | Who you are offered as an opponent — the gear score and leagues | **Drafted** — gear axis settled; the rating axis is open in 06 |
| 10 | *`10-equipment.md`* | Runic equipment — stat bonuses, buff stacking | Not started — **planned fast-follower**, see below |
| 11 | `11-social.md` | Identity, the defender's feedback loop, chat and moderation | **Drafted** — four chat scopes, transport and moderation settled; vendor and retention numbers open |

**Combat is done.** 01, 03, 04 and 05 together specify a battle end to end: who
acts when, what a hit does, how two types combine, and what every adjective in a
power's text means. Nothing in the combat layer is waiting on a decision. What
remains there is **numbers**, not mechanisms.

## The bounded-formula rule

**Runic equipment is a deliberate fast-follower.** Gear that grants stat bonuses
and allows heavier stacking of powers and buffs, so a hero can be genuinely
customised and optimised — *more planning over paying*. It is explicitly not
being built now, but it is coming, and that imposes one rule on everything
written before it:

> **Every formula must have diminishing returns in the stat it consumes.**
> If a value scales linearly and gear can raise it, gear will eventually break
> it.

This is not hypothetical. Mitigation was originally specified as a flat
percentage equal to the stat — under which `Armor` 90 gives **10× effective
HP** and `Armor` 100 gives literal immunity. `01-stats.md` now uses a bounded
curve that is indistinguishable from the flat scheme across the range the roster
occupies today and simply cannot run away later. Apply the same test to any new
formula: **ask what it does at three times the current stat values.**

**A hard cap of 75 per stat does half this work on its own** — it is what keeps
maximum mitigation at exactly 50% and holds full-gear time-to-kill within 1% of
today's. Be honest about which of the two is carrying a given formula: the flat
scheme would have been *survivable* under a 75 cap, topping out at 4× effective
HP rather than infinity. The curve is still the better shape, because
accelerating returns reward stacking one stat and the curve does not. But the
cap, not the curve, is what makes the endgame safe.

The same reasoning is why **`Luck` no longer contributes to damage.** It was the
one stat gear would obviously stack, because it multiplied three factors at once
while every other stat was linear — so a runic point spent on it was worth 2.4×
a point of `Might`. No partial weight fixed that; only removing the damage term
did. `Luck` now has two jobs, the die and the crit rate, and the arithmetic is
in `01-stats.md`.

## The no-nerf rule

**Settled 2026-07-27.**

> **Balance early. To correct an outlier, raise the other twenty-six rather than
> lower the one. A nerf is a last resort, reached only when levelling up would
> itself break the balance — and when one happens, grant shards to everybody.**

Three parts, in order of preference: **buff the field · nerf only if buffing
cannot work · compensate in shards either way.**

### Why it is affordable here, and it genuinely is

Three settled decisions already point this way, so the rule is closer to naming
an existing commitment than to adding a constraint:

- **Runes are permanent and destroyed on replacement.** A nerf writes off 650
  shards of a player's investment with no refund path — in a game where the
  currency *is* the progression, that is confiscation with extra steps.
- **Replays are stored, never re-simulated** (`../../docs/tech-stack.md`), so a
  patch already cannot reach backwards. Half of this rule was decided the day
  that was.
- **All 27 heroes are unlocked and identical.** The usual reason to nerf — a
  paywalled or luck-gated unit dominating — cannot arise, because nobody can own
  something you don't.

### Levelling up has a budget of +10, and it is measured

**Buffing the field is power creep by another name** — which is exactly what the
bounded-formula rule above and the 75-point cap were written to survive. The caps
are what make it safe at all, and this rule makes them load-bearing in a way they
were not before.

But the cap also **bounds how long the preferred lever stays available**, and the
bound is small. `06-progression.md` guarantees that *a single +20 boost can never
overflow*, sized against the tightest headroom on the roster:

| Stat | Roster max | Headroom to 75 | **Buff budget** |
|---|---|---|---|
| **`Might`** | 45 | 30 | **+10** |
| **`Speed`** | 45 | 30 | **+10** |
| `Perception` · `Toughness` · `Armor` · `Penetration` · `Magic Resist` · `Resolve` · `Luck` | 40 | 35 | +15 |
| `Agility` | 35 | 40 | +20 |

> **Raise the roster's `Might` or `Speed` by more than 10 and a major boost
> overflows for the first time.** At +2 a correction that is five rounds; at +5,
> two.

**And it is regressive against the deepest investments**, which is the part worth
watching. Boosts may stack on one stat by design, so a `Might` 45 Striker
carrying a stage-2 rune sits at **45 + 20 + 10 = exactly 75 today**. Any
across-the-board buff clips that build entirely while helping an un-runed hero in
full — so buff-only quietly taxes the players a no-nerf rule exists to protect.

**Prefer the additive levers before either.** **Curated bot defenders** apply meta
pressure with no number touched at all (`09-matchmaking.md`), and new content —
`10-equipment.md` is the planned one — adds ceiling rather than moving the floor.

### When a nerf is the answer anyway

**Grant shards to everybody.** A nerf hurts *because* runes are permanent and
destroyed on replacement, so devaluing one writes off up to 650 shards with no
path back. A grant restores exactly the thing that was taken.

| Grant | Cost against a typical player's day |
|---|---|
| 200 — the utility stage | **0.5 days** |
| **650 — one full rune** | **1.7 days** |

**Cheap, and paid to everyone rather than to the affected**, which sidesteps
identifying who held what and reads as goodwill rather than as an admission.
Note it is *not* free: shards are the sink the whole economy turns on, and a
habit of blanket grants devalues earning them.

### The one carve-out

**Fixing a bug is not a nerf.** If a power does something it was never specified
to do, correcting it restores the design rather than changing it. The same goes
for a data-entry error. State the difference out loud when it comes up, because
the distinction is what keeps the rule credible rather than lawyerly.

### Where it will be tested first

**The 33 utility effects.** They are the newest numbers, the least verified, the
only ones that are *purchased* — 200 shards for the fourth rune stage — and
their magnitudes are still open (`06-progression.md`). If one lands at 3× its
band, the first answer is to raise the other 32.

**They are also where levelling up runs out first.** Effects are not stat points,
so no cap bounds them — but the band they are written to (10–20 stat points) is
what sets a utility slot's price and its matchmaking weight of 15
(`09-matchmaking.md`). Raising 32 effects to chase one outlier moves that band,
which moves the gear score, which moves the leagues. **That is the case the "last
resort" clause was written for**: a single nerf plus a blanket shard grant is
cheaper and more contained than re-pricing the catalog.

**This is the strongest argument yet for the build order already decided.**
`packages/sim` is not verification after the fact; under a no-nerf rule it is the
last moment a number can move freely. See the hero-numbers pass below.

## Parked, on purpose

Not blocked — **deferred by decision**, so don't treat these as outstanding
questions or keep raising them:

- **Hero numbers.** The ten stats' tuning values *and* the per-hero reach
  assignment are one pass, to be done together later. `02-squads.md` keeps a
  starting proposal for reach; it is not a decision.

  Three separate decisions now point at that pass, and they all say the same
  thing — **the formulas are fine and the inputs are a template**:

  | Symptom | Where it was found |
  |---|---|
  | `Speed` sits on a Role-determined 10-point grid, so a buff either changes nothing or promotes a hero a whole rung | `01-stats.md` |
  | `Magic Resist` is a flat **30 for all 27 heroes** — and it is the stat the pricing decision says should be the one that *varies* | `01-stats.md` |
  | Only **7 distinct `(Armor, MR, Penetration)` profiles** exist across the roster, five of them sharing `Armor` 15 | `01-stats.md` |
  | **A fought battle runs ~260–280 hero turns against a design target of ~102**, and asks the player ~85 times against a predicted 20–40 | feature 007's engine, 2026-07-29 |

  **The last row is the first measurement taken from a running engine rather
  than from a spreadsheet, and it is the one that prices the pass.** Playing
  full 6v6 battles through `apps/api/src/battle/`:

  | Measured | Value | Design figure |
  |---|---|---|
  | miss rate | **15.5%** | 9.4% — close; the `+20` edge is working |
  | damage per acting turn | **61** | — |
  | mean hero HP pool | **1375** (`Toughness × 50`) | — |
  | **damage as a share of one hero's HP** | **4.5%** | needs ≈ **11%** |
  | hero turns to a conclusion | **~260–280** | ~102 |
  | turns that are a **pass** | **30%** | not modelled |

  Two things fall out of it. **Damage needs roughly 2.5× its current share of a
  health pool** for battles to run the length the accuracy work was tuned
  against — the lever is `Might × multiplier` against `Toughness × 50`, and
  raising damage is the direction the no-nerf rule prefers anyway. And **~30% of
  all hero turns are passes**, because at full formation a reach-1 champion in
  rows 1–2 can reach nothing; the ~102-turn estimate did not model that, so part
  of the gap is the estimate rather than the numbers.

  Neither is an engine defect — every formula behaves as specified, and the
  request count follows the battle length rather than a wrong packet boundary.
  Feature 007's tests assert the *rule* (a packet stops only at a genuine
  choice) and report these figures rather than pinning them, so the numbers pass
  can move them without a test rewrite.
- **Event specifics.** Which metrics an event tallies, reward tiers, and the
  shape of a season. The *structure* of guild events is settled in
  `08-guilds.md`; the content of them is for much later.

## Dependencies between them

The combat chain — 01 → 04 → 03 → 05 — is **resolved and closed.** Stats gated
powers, turns gated powers, and powers gated status magnitudes while status gated
the powers' riders in return. All four are now written and mutually consistent.

What is left has a much simpler shape:

- **`06-progression.md` answered the hard one and now blocks less.** The
  currency is **Rune Shards**, spent to build custom runes that are placed
  permanently on a chosen hero and destroyed if replaced. That gives a **bounded
  power ceiling with an unbounded sink** — demand is driven by the meta moving
  rather than by a player falling behind — which is what lets progression exist
  at all under a fixed, identical roster. `08-guilds.md` is still blocked on the
  *payout rate*, but no longer on the question of what a reward even is.
- **`07-defense-ai.md` is drafted.** A defender *configures* the AI rather than
  watching it, through **two ordered lists per hero** — a targeting priority
  resolving at stage 4 of the targeting pipeline, and a ranking of the hero's six
  powers. Both are **hidden from attackers** but derivable from stored replays.
  Ranking rather than firing the biggest available power is what keeps defenses
  distinguishable: greedy yields **4 rotations across all 27 heroes** with 17
  sharing one, while a ranking yields **240 per hero**.
- **`02-squads.md` has six open rules**, none blocking. The two with real
  strategic weight are *which zone deserves the stronger heroes* (which depends
  on the rating stakes attached to each, so it leans on 06) and *whether
  anything besides reach depends on row* (which belongs to 07).
- **`10-equipment.md` is deliberately last**, and everything above has been
  written to accommodate it — see the bounded-formula rule.
- **The hero-numbers pass is orthogonal to all of it.** Every formula is
  specified; the values feeding them are a template. See *Parked* below.

## Settled elsewhere, assumed here

- The 9 damage types, their `counter` map, and the weakness-derivation rule —
  `../LORE-and-flavor.md`.
- 27 heroes, 3 per type; squads of exactly 6 in a fixed 2/3/1 formation; the
  player commands offense while the engine runs every defense.
- Combat is **turn-based**, and cooldowns are counted in whole turns.
