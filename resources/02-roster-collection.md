# Claude Design Prompt — 02 · Roster / Collection Screen

> **How to use:** Run after `00-style-system` and `01-hero-card`. Reuse the style tokens and the grid-card form from the hero-card prompt.

---

## PROMPT

Design the **Roster / Collection screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the established hero **grid card**.

This is where a player browses every hero they own before building a battle squad. There are 9 damage types (6 magic: Earth, Air, Fire, Water, Light, Dark; 3 melee: Slash, Pierce, Crush), with several heroes per type, so the screen must make a large collection feel organized and browsable.

Include:

- **A responsive grid of hero grid-cards** (the compact card from the hero-card system), with graceful hover/press states and a subtle type-colored glow per card.
- **A filter rail / bar** that lets players filter by:
  - **Type** — show all 9 as color-coded, icon-led toggles, visually grouped as 6 magic + 3 melee.
  - **Owned vs. locked** (unowned heroes shown as silhouettes to tease collection).
  - Level / rarity, and a **weakness filter** (e.g. "show heroes weak to Fire") — a signature LMNTLZ counter-building tool.
- **Sort controls** (level, type, recently acquired, power).
- **A search field** for hero names.
- **A collection progress header** — "X / total heroes collected," maybe a small breakdown by type as 9 mini meters in type colors.
- **A selected-hero detail panel or drawer** that slides in when a card is tapped, showing the full hero card (portrait, powers with cooldowns, the 2 strengths / 1 major / 1 minor weakness strip) plus a primary "Add to Squad" action.

Prioritize scannability: a player should be able to spot "all my Dark heroes" or "who counters Water" in seconds. Show the grid populated with a believable mix of types so the color system does visible work. Design for both desktop web and a narrower mobile layout — indicate how the grid and filter rail reflow.

---

## DESIGN CANON REFERENCE

- 9 types (6 magic + 3 melee), multiple heroes each; a full collection is dozens of heroes.
- Each hero shows its type + relationship profile (2 strengths / 1 major weakness / 1 minor weakness).
- This screen feeds into the **Squad Builder** (players pick 6, arranged 2 front / 3 middle / 1 back). Include a persistent entry point to the current squad.
