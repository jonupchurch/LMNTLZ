# Claude Design Prompt — 02 · Roster Screen

> **How to use:** Run after `design-system.md` and `01-hero-card`. Reuse the design-system tokens and the grid-card form from the hero-card prompt.

---

## PROMPT

Design the **Roster screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the established hero **grid card**.

This is where a player reviews the roster and sees how it is currently allocated, before building a squad. There are 9 damage types (6 magic: Earth, Air, Fire, Water, Light, Dark; 3 melee: Slash, Pierce, Crush) with 3 champions each — **27 heroes, all unlocked from the start, identical for every player.** There is no collection to complete and no locked heroes; the screen's job is to make 27 heroes and their current assignments scannable at a glance.

Include:

- **A responsive grid of hero grid-cards** (the compact card from the hero-card system), with graceful hover/press states and a subtle type-colored glow per card.
- **A filter rail / bar** that lets players filter by:
  - **Type** — show all 9 as color-coded, icon-led toggles, visually grouped as 6 magic + 3 melee.
  - **Assignment status** — the most important filter here. Every hero is in exactly one of three states: **committed to a defense zone** (and which one), **in one or more offense squads**, or **unassigned**. Defense-committed heroes must read as locked away, since they cannot be used to attack.
  - Level, and a **weakness filter** (e.g. "show heroes weak to Fire") — a signature LMNTLZ counter-building tool.
- **Sort controls** (level, type, assignment status, power).
- **A search field** for hero names.
- **An allocation header, not a collection meter.** Every player has all 27 heroes from the start, so there is nothing to collect and no progress to show. What matters is the split: **12 committed to the two defense zones · N in offense squads · M unassigned.** Make the "15 available for offense" figure prominent — that is the pool every attack is drawn from.
- **A selected-hero detail panel or drawer** that slides in when a card is clicked, showing the full hero card (portrait, powers with cooldowns, the 2 strengths / 1 major / 1 minor weakness strip) plus a primary "Add to Squad" action.

Prioritize scannability: a player should be able to spot "all my Dark heroes" or "who counters Water" in seconds. Show the grid populated with a believable mix of types so the color system does visible work. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts. The window is freely resizable, so indicate how the grid reflows between the minimum and ultrawide, with the filter rail staying persistent throughout.

---

## DESIGN CANON REFERENCE

- 9 types (6 magic + 3 melee), 3 champions each — **27 heroes, all unlocked from the start**, one copy each, identical for every player. Nothing to collect or unlock.
- **12 heroes are committed to two defense zones and cannot attack**, leaving 15 available for offense. Assignment state is the screen's primary organising axis.
- Each hero shows its type + relationship profile (2 strengths / 1 major weakness / 1 minor weakness).
- This screen feeds into the **Squad Builder**, which builds two different shapes: an attack **Wing** of 8 (3 front / 4 middle / 1 back) and a defense **Standing Six** of 6 (2 front / 3 middle / 1 back). Include a persistent entry point to the current squad.
