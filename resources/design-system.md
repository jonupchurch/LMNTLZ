# Claude Design Prompt — UI Design System

> **How to use:** Paste the `## PROMPT` block into Claude Design. This is the in-app UI kit — foundations (tokens) and components — that all the screen prompts (`01`–`05`) draw from. It pairs with `brand-identity.md` (the outward brand) and supersedes the UI-token half of `00-style-system.md`. Generate the brand identity first so the wordmark and accent color are settled, then build this.

---

## PROMPT

Design a complete **UI design system** for **LMNTLZ**, a competitive fantasy battler game, presented as a single reference page (foundations + a component library sampler). The system must match the game's world: **stylized / semi-anime**, dark and arcane, vivid element color, crisp and readable at small sizes — premium mobile/web game UI, not a generic SaaS kit. **Dark theme is the default;** include a light variant for text-heavy panels.

**FOUNDATIONS (tokens)**

- **Color tokens.** Surfaces on a deep arcane base: `bg` `#141221`, `surface` `#1C1930`, `surface-raised` `#241F38`, plus a light parchment surface for docs. Text on dark at high/medium/low emphasis. Semantic tokens: `strong`/CTA = gold `#F2C744`, `danger` = red `#C0313A`, `success`, `warning`, `info`. **The nine element accents as named tokens** (used for type badges, card frames, meters, glows): Earth `#4E7C3A` · Air `#8FCFE0` · Fire `#E8552B` · Water `#2A7FB8` · Light `#F2C744` · Dark `#7A3FA0` · Slash `#C0313A` · Pierce `#3B5BD1` · Crush `#B5732E`, each with a light-accent and deep-shadow step. Show the tokens as documented swatches, not just a palette.
- **Typography.** A display face (headers, hero names) + a legible UI/body face + a distinct **numeric/stat** treatment for HP, cooldowns, damage. Provide a type scale: display, H1, H2, H3, body, caption, and a mono-ish stat numeral.
- **Spacing & layout.** A base-4 or base-8 spacing scale, container widths, and a responsive grid (desktop + mobile).
- **Radius, elevation, motion.** A radius scale, an elevation/shadow system tuned for a dark UI (glow-based rather than heavy drop-shadow), and motion tokens (durations/easings) for taps, cooldown fills, and reveals.

**COMPONENT LIBRARY** — show each with its full state set (default, hover, active/pressed, focus-visible, disabled, loading) on the dark theme:

- **Buttons:** primary (gold CTA), secondary, ghost/tertiary, destructive, and an icon button. Include sizes.
- **Type badge:** the signature component — element icon + label chip in that type's color; show all nine.
- **Strength/weakness indicators:** small badges for the 2 strengths / 1 major weakness (Bane) / 1 minor weakness (Fault) relationship strip, visually distinct by shape and color.
- **Hero card:** reference the established card (detail / grid tile / battle chip) — pull it in as a system component, don't redesign it.
- **Power slot + cooldown ring:** a power icon with a radial cooldown timer, in ready / recharging / disabled states.
- **Stat pill, meter/coverage bar** (type-colored, e.g. squad vulnerability), **progress bar**, and a **9-type mini heat readout**.
- **Inputs & forms:** text field, search field, dropdown/select, toggle, slider, segmented control / tabs.
- **Navigation:** top app bar (with wordmark + currency), bottom nav (mobile) / side nav (desktop), and a squad/loadout switcher.
- **Containers & overlays:** cards, list rows, modal dialog, bottom sheet, tooltip/flyout (e.g. the type-effectiveness tooltip), toast/snackbar, and an empty state.
- **Feedback:** loading skeletons and a combat-style number/flash treatment reference.

**QUALITY BARS**

- **Accessibility:** WCAG-AA text contrast on the dark base, visible focus rings, and minimum 44px touch targets — call these out.
- **Consistency:** every element accent derives from the nine tokens; no off-palette colors. Glows and rims use the accent step, not arbitrary hues.
- Show a small **"applied" vignette** (e.g. a mini squad-builder row) so the components read as a working system, not loose parts.

Lay it out as a clean, self-contained design-system reference page — the single source of truth engineering and design build the app from.

---

## Reference

- Palette, art direction, and the nine types: `00-style-system.md`, `brand-identity.md`, and `characters/`.
- Screens that consume this system: `01-hero-card.md` … `05-matchmaking-results.md`.
- Systemic rules behind the strength/weakness components: `characters/MATCHUPS.md`.
