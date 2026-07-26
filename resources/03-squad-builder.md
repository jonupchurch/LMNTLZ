# Claude Design Prompt — 03 · Squad Builder Screen

> **How to use:** Run after the style system, hero card, and roster prompts. This screen is where LMNTLZ's strategy lives — picking 6 attackers and setting a 6-hero defense.

---

## PROMPT

Design the **Squad Builder screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the established hero cards.

In LMNTLZ, players assemble squads of **exactly 6 heroes**, arranged in a fixed three-row formation: **2 front row · 3 middle row · 1 back row**. There are two distinct build modes the screen must support — make the distinction clear:

1. **Attack squads** — up to **3 saved squads** the player personally controls on offense. These *may share heroes with each other*; the same champion can appear in all three.
2. **Defense zones** — the player must defend **two** zones, each held by its own 6-hero squad, both run automatically by the game engine when other players attack. (The player sets them up; the AI plays them.)

**The roster constraint is the heart of this screen.** Every player has all **27 heroes** from the start — no collection, no unlocking, identical for everyone. But **12 are committed to the two defense zones, and a hero on defense cannot attack.** That leaves 15 for offense, drawn on by all three attack squads.

Two consequences the UI must handle head-on:

- **Three disjoint attack squads are impossible.** 3 × 6 = 18 slots against 15 available heroes, so overlap is forced. Show which heroes are shared across squads rather than hiding it.
- **Assigning a hero to defense evicts it from every attack squad it appears in, invalidating each.** Because squads overlap, a single swap can break all three at once. Warn *before* the change lands, naming exactly which squads will be left short — this is the most destructive action on the screen and must never be a surprise.

Include:

- **Six squad slots** laid out in the fixed **2 / 3 / 1** formation — two slots in the front row, three in the middle, one in the back. The rows must read as meaningfully different positions, not just a decorative arrangement; the single back-row slot in particular should feel like the protected seat it is. Empty slots invite clicking to fill.
- **A reach readout on placement.** Every hero has a **reach of 1 or 2**, and reach counts *rows*, including the hero's own — so what a hero can touch changes completely depending on the slot it's dropped into. A reach-1 hero in the back row can reach neither the enemy nor its own front line. Show what a hero would actually be able to target from the slot it's hovering over, so that consequence is learnable at build time rather than discovered mid-battle. Warn, don't scold — a player is allowed to make that choice.
- **A hero picker** — the roster grid (reuse grid-cards) alongside or beneath the slots, filterable by type and by weakness, so players can counter-build.
- **A live squad-synergy / coverage panel** — the strategic centerpiece. As heroes are added, surface:
  - **Type coverage:** which of the 9 damage types the squad can deal.
  - **Collective vulnerability:** an at-a-glance readout of what this squad is, as a whole, weak to (e.g. "3 of your 5 are weak to Fire — risky"). Use type-colored meters or a small 9-type heat readout.
  - **Cooldown / tempo hint:** a rough sense of the squad's burst vs. sustain based on the heroes' power cooldowns.
- **A mode switcher** across all five squads — 3 attack squads and 2 defense zones — with the rules differences clear (defense emphasizes durability and coverage since the AI runs it, and defense assignments lock heroes out of offense entirely).
- **An invalidated-squad state.** A squad short a member because a hero was pulled to defense must read as broken and un-battleable, with an obvious path to refill it.
- **Save / name loadout** controls for the 3 attack squads.
- **A clear primary action:** "Find Battle" (from an attack squad) or "Set as Defense."

The emotional goal: building a squad should feel like solving a puzzle. Reward the player visually when their coverage is strong and warn them (without nagging) when they've stacked a shared weakness. Show a fully-built example squad of 6 mixed-type heroes in the 2/3/1 formation so the coverage panel is doing real work. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts. Drag-and-drop between slots is available and worth designing for, since placement is the core interaction here.

---

## DESIGN CANON REFERENCE

- Squads are **6 heroes** in a fixed **2 front / 3 middle / 1 back** formation. Every player maintains up to **3 attack squads** and **2 auto-run defense zones**.
- All **27 heroes are unlocked from the start** and identical for every player. **12 are locked to defense** and cannot attack, leaving 15 for offense. Full rules in `mechanics/02-squads.md`.
- Engine powers the defense; the player controls offense — so the defense builder is about setup, not live control.
- Each hero: 1 type, 2 strengths, 1 major + 1 minor weakness, up to 5 powers with individual cooldowns.
- Counter-building against a known/expected weakness spread is a core skill the UI should enable.
