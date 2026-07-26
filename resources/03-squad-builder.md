# Claude Design Prompt — 03 · Squad Builder Screen

> **How to use:** Run after the style system, hero card, and roster prompts. This screen is where LMNTLZ's strategy lives — picking 5 attackers and setting a 5-hero defense.

---

## PROMPT

Design the **Squad Builder screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the established hero cards.

In LMNTLZ, players assemble squads of **exactly 5 heroes**. There are two distinct build modes the screen must support — make the distinction clear:

1. **Attack squad** — the 5 heroes the player will personally control on offense against another player's defense.
2. **Defense squad** — the 5 heroes left behind to be run automatically by the game engine when other players attack this player. (The player sets it up; the AI plays it.)

Include:

- **Five squad slots** laid out as a formation (a front/back arrangement is welcome, since melee vs. magic positioning matters). Empty slots invite tapping to fill.
- **A hero picker** — the collection grid (reuse grid-cards) alongside or beneath the slots, filterable by type and by weakness, so players can counter-build.
- **A live squad-synergy / coverage panel** — the strategic centerpiece. As heroes are added, surface:
  - **Type coverage:** which of the 9 damage types the squad can deal.
  - **Collective vulnerability:** an at-a-glance readout of what this squad is, as a whole, weak to (e.g. "3 of your 5 are weak to Fire — risky"). Use type-colored meters or a small 9-type heat readout.
  - **Cooldown / tempo hint:** a rough sense of the squad's burst vs. sustain based on the heroes' power cooldowns.
- **A mode toggle** between Attack and Defense builds, with any rules differences noted (e.g. defense emphasizes durability and coverage since the AI runs it).
- **Save / name loadout** controls (players may keep several squads).
- **A clear primary action:** "Find Battle" (from an attack squad) or "Set as Defense."

The emotional goal: building a squad should feel like solving a puzzle. Reward the player visually when their coverage is strong and warn them (without nagging) when they've stacked a shared weakness. Show a fully-built example squad of 5 mixed-type heroes so the coverage panel is doing real work. Provide desktop and mobile reflow guidance.

---

## DESIGN CANON REFERENCE

- Squads are **5 heroes**. Every player maintains an **attack** build and an auto-run **defense** build.
- Engine powers the defense; the player controls offense — so the defense builder is about setup, not live control.
- Each hero: 1 type, 2 strengths, 1 major + 1 minor weakness, up to 5 powers with individual cooldowns.
- Counter-building against a known/expected weakness spread is a core skill the UI should enable.
