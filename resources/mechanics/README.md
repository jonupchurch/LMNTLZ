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
| 01 | `01-stats.md` | The ten hero stats and the damage resolution pipeline | **Drafted** — core settled, four tuning questions open |
| 02 | `02-squads.md` | The Wing of 8 and the Standing Six, row rules and reach | **Drafted** — shapes settled; 8-vs-6 balance is blocking |
| 03 | *`03-powers.md`* | Up to 5 powers per hero, cooldowns, targeting, costs | Not started |
| 04 | *`04-turns.md`* | Turn order, action economy, how Speed spends | Not started |
| 05 | *`05-status.md`* | Crowd control and buff/debuff effects; what Resolve resists | Not started |
| 06 | *`06-progression.md`* | Levels, rarity, shards, currency, the rating ladder | Not started |
| 07 | *`07-defense-ai.md`* | How the engine plays a defense squad | Not started |
| 08 | `08-guilds.md` | Guilds of up to 24, split into three event teams of up to 8 | **Drafted** — membership settled, competition format open |

## Dependencies between them

Some of these can't be finished out of order:

- **Powers gate almost everything.** Status effects can't be specified until
  powers define what crowd control is, which means `Resolve` can't be tuned
  until then either. Cooldown pacing in `04-turns.md` has the same problem.
- **Stats gate powers.** Every power will reference stats to compute its
  effect, so `01-stats.md` needs to be stable first — which is why it's the
  one that exists.
- **Squads and powers gate each other.** Whether a power can reach the back
  row is a power property, but *what the rows mean* is a squad property.
  `02-squads.md` names the row-reach question; `03-powers.md` is where each
  power answers it. Neither finishes alone.
- **Defense AI gates nothing but needs everything.** It can only be written
  once there's a full action space to choose from.
- **Guilds gate nothing and block on progression.** The membership and team
  arithmetic is settled and needs nothing else, but rewards can't be specified
  until `06-progression.md` defines a currency to pay them in. Safe to design
  in parallel with powers and turns.

## Settled elsewhere, assumed here

- The 9 damage types, their `counter` map, and the weakness-derivation rule —
  `../LORE-and-flavor.md`.
- 27 heroes, 3 per type; an attacking **Wing** of 8 in 3/4/1 against a defending
  **Standing Six** of 6 in 2/3/1; the player commands offense while the engine
  runs every defense.
- Combat is **turn-based**, and cooldowns are counted in whole turns.
