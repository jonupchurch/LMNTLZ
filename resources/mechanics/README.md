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
| 01 | `01-stats.md` | The ten hero stats and the damage resolution pipeline | **Drafted** — core settled, three tuning questions open |
| 02 | `02-squads.md` | Squad size, the 2/3/1 formation, row rules and reach | **Drafted** — shape settled, rules open |
| 03 | `03-powers.md` | 6 active powers + 3 passives per hero; multipliers, cooldowns, healing | **Drafted** — 127 powers authored and costed; rider magnitudes blocked on 05 |
| 04 | `04-turns.md` | The five-phase turn; turn order and action economy | **Drafted** — turn, phase order, Speed and reactions all settled |
| 05 | *`05-status.md`* | Crowd control and buff/debuff effects; what Resolve resists | Not started — **taunt** and **fade** are named, and their targeting behaviour is settled in `04-turns.md` |
| 06 | *`06-progression.md`* | Levels, rarity, shards, currency, the rating ladder | Not started |
| 07 | *`07-defense-ai.md`* | How the engine plays a defense squad | Not started |
| 08 | `08-guilds.md` | Guilds of up to 24, split into three event teams of up to 8 | **Drafted** — membership settled, competition format open |
| 09 | *`09-equipment.md`* | Runic equipment — stat bonuses, buff stacking | Not started — **planned fast-follower**, see below |

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

The same reasoning is why `Luck` doing four jobs is flagged there rather than
left alone — a stat with four roles is the one gear would obviously stack.

## Parked, on purpose

Not blocked — **deferred by decision**, so don't treat these as outstanding
questions or keep raising them:

- **Hero numbers.** The ten stats' tuning values *and* the per-hero reach
  assignment are one pass, to be done together later. `02-squads.md` keeps a
  starting proposal for reach; it is not a decision.
- **Event specifics.** Which metrics an event tallies, reward tiers, and the
  shape of a season. The *structure* of guild events is settled in
  `08-guilds.md`; the content of them is for much later.

## Dependencies between them

Some of these can't be finished out of order:

- **Powers now gate only `05-status.md`, and are gated by it in return.**
  `03-powers.md` names every rider — slows, burns, mitigation shreds, silence,
  taunt, fade — but none of them has a magnitude or a duration, because
  `05-status.md` has not said what those effects *are*. Powers can't be finished
  without it and it can't start without them. **`05-status.md` is the next thing
  to write**, and `Resolve` can't be tuned until it exists.
- **Turns no longer gate powers.** `04-turns.md` now answers everything a power
  needs in order to be written down: which phase each part of it resolves in,
  that cooldowns count the owner's own turns and tick in Resolution, and that
  riders stage then contest. **`03-powers.md` is unblocked and is the next
  thing to write.**
- **Stats gate powers.** Every power will reference stats to compute its
  effect, so `01-stats.md` needs to be stable first — which is why it's the
  one that exists.
- **Squads and powers gate each other.** Whether a power can reach the back
  row is a power property, but *what the rows mean* is a squad property.
  `02-squads.md` names the row-reach question; `03-powers.md` is where each
  power answers it. Neither finishes alone.
- **Defense AI gates nothing but needs everything.** It can only be written
  once there's a full action space to choose from — and that space just grew:
  reactions mean an engine-run squad now makes choices on the *attacker's* turn
  as well as its own.
- **Guilds gate nothing and block on progression.** The membership and team
  arithmetic is settled and needs nothing else, but rewards can't be specified
  until `06-progression.md` defines a currency to pay them in. Safe to design
  in parallel with powers and turns.

## Settled elsewhere, assumed here

- The 9 damage types, their `counter` map, and the weakness-derivation rule —
  `../LORE-and-flavor.md`.
- 27 heroes, 3 per type; squads of exactly 6 in a fixed 2/3/1 formation; the
  player commands offense while the engine runs every defense.
- Combat is **turn-based**, and cooldowns are counted in whole turns.
