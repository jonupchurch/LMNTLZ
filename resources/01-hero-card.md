# Claude Design Prompt — 01 · Hero Card System

> **How to use:** Run after `design-system.md`. Paste its tokens and component set first, then this prompt. The hero card is the atomic unit of LMNTLZ — it appears in the roster, the squad builder, and (compact) in battle — so nail it here and reuse it everywhere.

---

## PROMPT

Design the **hero card component** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, bold outlines, vivid element color, dark arcane UI). A hero card is a collectible unit that must communicate a lot at a glance without feeling cluttered.

Every hero has exactly ONE of nine damage **types** (6 magic: Earth, Air, Fire, Water, Light, Dark; 3 melee: Slash, Pierce, Crush). The card's frame accent, name banner, and glow take that type's color.

Show the card in **three states/sizes**, side by side:

**A. Full card (detail view).** Contains:
- **Portrait art** in a framed window — expressive semi-anime hero, dramatic lighting keyed to the type color.
- **Name banner** with the hero name and a small subtitle/epithet.
- **Type badge** (icon + label) in the type's color, prominent, top corner.
- **Element relationship strip** — the heart of LMNTLZ. Show four small badges in a clear row:
  - **2 Strengths** (the hero's own kindred elements — resistant to these). Mark with an upward/shield cue and the two type colors.
  - **1 Major weakness** ("very weak to") — bold danger treatment (red ring, downward cue).
  - **1 Minor weakness** ("somewhat weak to") — softer warning treatment.
  Make strengths vs. weaknesses instantly distinguishable by shape and color, not just position.
- **Power slots** — up to **5 powers**, shown as a row of slots. Each slot: a power icon, a name on hover/expand, and a **cooldown ring/timer** indicator baked into the slot (some powers recharge fast, some slow). Empty slots for heroes with fewer than 5 powers should read as intentionally empty, not broken.
- **Core stats** (HP, and a couple of combat stats) as clean numeric pills.
- A **rarity/level accent** on the frame.

**B. Grid card (roster tile).** A compact version for browsing the 27-hero roster: portrait, name, type badge, the 4 relationship badges shrunk into a tidy corner cluster, and a level chip. Must stay legible at roughly 160px wide in a scrolling grid.

**C. Battle chip (in-combat).** The smallest form used on the battlefield: portrait bust, type badge, an HP bar, and the 5 power slots as a compact action bar with live cooldown rings. This is what a player clicks to act on offense. Twelve of these share the battle screen at once, so it must stay readable at the minimum 1280×720 window.

Also show one **type-effectiveness tooltip/flyout** that appears when hovering a relationship badge (e.g. "Fire — Major weakness · takes +50% damage from Fire").

Present all three on a dark arcane background with one worked example hero so the layout feels real (invent a plausible hero — e.g. a Dark-type sorceress or a Crush-type warbreaker).

---

## DESIGN CANON REFERENCE

- 9 types, one per hero; 6 magic + 3 melee.
- Relationship profile per hero: **2 strengths (own elements) · 1 major weakness · 1 minor weakness**.
- Up to **5 powers per hero**, each with its **own cooldown rate**.
- Card must work at 3 scales: detail, grid tile, battle chip.
