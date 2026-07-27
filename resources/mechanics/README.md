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
| 06 | *`06-progression.md`* | What a player earns, the currency, the rating ladder | Not started — **the blocker**, see below |
| 07 | *`07-defense-ai.md`* | How the engine plays a defense squad | Not started — **unblocked**, the action space is now complete |
| 08 | `08-guilds.md` | Guilds of up to 24, split into three Wings of 8 | **Drafted** — membership settled, rewards blocked on 06 |
| 09 | *`09-equipment.md`* | Runic equipment — stat bonuses, buff stacking | Not started — **planned fast-follower**, see below |

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
- **Event specifics.** Which metrics an event tallies, reward tiers, and the
  shape of a season. The *structure* of guild events is settled in
  `08-guilds.md`; the content of them is for much later.

## Dependencies between them

The combat chain — 01 → 04 → 03 → 05 — is **resolved and closed.** Stats gated
powers, turns gated powers, and powers gated status magnitudes while status gated
the powers' riders in return. All four are now written and mutually consistent.

What is left has a much simpler shape:

- **`06-progression.md` is the single blocker in the project.** `08-guilds.md`
  cannot specify a reward until there is a currency to pay it in, and
  `09-equipment.md` cannot say what a rune costs. It is also the only document
  that has to answer a question the rest of the design has deliberately made
  hard: **all 27 heroes are unlocked from the start and identical for every
  player**, so progression cannot be roster power. What a player earns instead —
  and whether it converts into strength at all — is the open question, not a
  detail of it.
- **`07-defense-ai.md` gates nothing, and is now unblocked.** It needed a
  complete action space and it has one: the five phases, the four-stage targeting
  pipeline, reactions on the attacker's turn, and the cooldown ladder. Worth
  weighing that the engine plays **every** defense squad for every player and
  the player never plays defense at all — so the AI's quality *is* the defensive
  half of the game, not a fallback for when a human is absent.
- **`02-squads.md` has six open rules**, none blocking. The two with real
  strategic weight are *which zone deserves the stronger heroes* (which depends
  on the rating stakes attached to each, so it leans on 06) and *whether
  anything besides reach depends on row* (which belongs to 07).
- **`09-equipment.md` is deliberately last**, and everything above has been
  written to accommodate it — see the bounded-formula rule.
- **The hero-numbers pass is orthogonal to all of it.** Every formula is
  specified; the values feeding them are a template. See *Parked* below.

## Settled elsewhere, assumed here

- The 9 damage types, their `counter` map, and the weakness-derivation rule —
  `../LORE-and-flavor.md`.
- 27 heroes, 3 per type; squads of exactly 6 in a fixed 2/3/1 formation; the
  player commands offense while the engine runs every defense.
- Combat is **turn-based**, and cooldowns are counted in whole turns.
