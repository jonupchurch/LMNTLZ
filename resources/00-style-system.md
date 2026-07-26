# Claude Design Prompt — 00 · Brand & Style System

> **How to use:** Paste the prompt below into Claude Design. Generate this **first** — it defines the tokens, palette, and element language that every other LMNTLZ prompt in this folder refers back to. When you run later prompts, tell Claude Design to "reuse the LMNTLZ style system" and paste the token summary at the bottom of this file.

---

## PROMPT

Design the foundational visual style system for a competitive fantasy battler game called **LMNTLZ** (pronounced "elementals"). The art direction is **stylized / semi-anime**: bold clean outlines, vivid saturated element colors, expressive character energy, crisp readable UI at small sizes. Think premium collectible battler — polished, confident, a little arcane — not gritty realism and not childish.

Deliver a single style-guide page that presents:

1. **Logo / wordmark direction** for "LMNTLZ." The name is stylized with no vowels; lean into that as a design feature. Show 2–3 wordmark concepts: one glyph-forward (letters built from elemental motifs), one clean geometric, one etched/rune-like. Include a compact "monogram" mark (an L-shape or elemental sigil) for use as an app icon and in-UI badge.

2. **The nine-type color system.** LMNTLZ has 9 damage types split into 6 magic and 3 melee. Each needs a distinct, instantly recognizable hue that works as a badge, a card frame accent, and a glow. Present each as a swatch trio (core / light accent / deep shadow) with hex values. Use these as the anchor palette:
   - **Earth** — mossy jade `#4E7C3A`, accent `#C9922E`
   - **Air** — pale cyan `#8FCFE0`, accent `#DCE6EA`
   - **Fire** — molten orange-red `#E8552B`, accent `#FFB347`
   - **Water** — deep azure `#2A7FB8`, accent `#4FC3D6`
   - **Light** — radiant gold `#F2C744`, accent `#FFF6D6`
   - **Dark** — arcane violet `#7A3FA0`, accent `#C64BB0`
   - **Slash** — crimson steel `#C0313A`, accent `#F06A72`
   - **Pierce** — cobalt `#3B5BD1`, accent `#7B93F0`
   - **Crush** — forged bronze `#B5732E`, accent `#E0A15A`
   Group the 6 magic types as a **ring** and the 3 melee types as a **triangle** in the layout, so the two families read as visually distinct systems.

3. **Type iconography.** A single-line/filled icon per type that reads at 24px: Earth (crystal/leaf), Air (spiral/feather), Fire (flame), Water (droplet/wave), Light (radiant burst), Dark (crescent/void), Slash (angled blade streak), Pierce (spearpoint/arrow), Crush (hammer/impact). Keep them in one consistent icon family.

4. **Surface & neutral palette.** A dark arcane UI base (deep desaturated indigo/charcoal, e.g. `#141221` → `#241F38`) with a lighter card surface and a warm parchment/ivory for text-heavy panels. Define text colors for high/medium/low emphasis on dark, plus a "strong" gold and a "danger" red for state cues.

5. **Typography.** A characterful display face for hero names, type labels, and the wordmark; a highly legible UI/body face for stats, tooltips, and numbers. Show a type scale (display, H1, H2, body, caption, numeric/stat).

6. **Core UI tokens as a component sampler:** primary/secondary/ghost buttons, a type badge (icon + label chip in the type's color), a small "power slot" chip with a cooldown ring, a stat pill, a rarity frame accent, and elevation/glow treatment. Show light-on-dark as the default theme.

Lay it out as a clean design-system reference page (swatches, tokens, samplers) — this is the source of truth, not a marketing page.

---

## TOKEN SUMMARY (paste into later prompts)

- **Style:** stylized / semi-anime, bold outlines, vivid element color, dark arcane UI base.
- **9 types + colors:** Earth `#4E7C3A` · Air `#8FCFE0` · Fire `#E8552B` · Water `#2A7FB8` · Light `#F2C744` · Dark `#7A3FA0` · Slash `#C0313A` · Pierce `#3B5BD1` · Crush `#B5732E`.
- **Families:** 6 magic (ring), 3 melee (triangle).
- **UI base:** deep indigo/charcoal `#141221`–`#241F38`; card surface lighter; gold = "strong", red = "danger".
- **Per hero, show 4 relationship slots:** 2 strengths, 1 major weakness, 1 minor weakness (see design canon in `LORE-and-flavor` / README).
