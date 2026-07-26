# DALL·E Hero Portrait Prompt — Consistency Kit

A prompt system for generating all 27 LMNTLZ hero portraits in **one cohesive art style**. DALL·E 3 has no seed control and no true negative prompt, so consistency is enforced structurally: an identical **Master Style Block** on every generation, a fixed set of parameters, and only a small **Hero Block** that ever changes. Follow the workflow — the guardrails only work if the Master Block is pasted *verbatim* every time.

---

## Workflow (do this in order)

1. **Set the fixed parameters** (below) once and never change them: same size, same framing, same lighting.
2. **Generate the Style Anchor first.** Produce hero #13 *Seraphel* (or any hero you like) and iterate until the look is exactly right. This becomes your reference for the whole roster.
3. **Work inside one ChatGPT conversation.** DALL·E 3 in ChatGPT can carry style context across turns. After the anchor, begin every following prompt with the *Continuity Line* so it matches the established series.
4. **Keep the Master Style Block identical every time.** Only swap the Hero Block. Do not rephrase, trim, or reorder the Master Block — wording drift causes style drift.
5. **Regenerate, don't edit.** If one hero drifts, re-run the same prompt rather than asking for tweaks (edits compound inconsistency).

---

## Fixed parameters (identical for all 27)

- **Aspect ratio / size:** `1024×1792` (portrait 2:3) — for hero cards. Never mix ratios across the set.
- **Crop:** waist-up three-quarter portrait, every hero the same distance from camera.
- **Camera:** eye-level, ~50mm look, no wide-angle distortion, no dramatic foreshortening.
- **Count:** exactly one character, centered, facing viewer at a slight 3/4 turn.
- **Finish:** flat matte illustration — never photoreal, never 3D render, never plastic.

---

## MASTER STYLE BLOCK — paste verbatim on every generation

> Stylized semi-anime character portrait for a premium collectible fantasy battler game, in a single unified illustration style across the whole roster. Rendering: bold clean confident linework, cel-style shading with soft painterly gradients over it, rich but controlled color, crisp silhouette readability. Proportions: heroic semi-anime, roughly 7.5 heads tall, expressive but grounded — the same stylization level for every character. Framing: waist-up three-quarter portrait, single figure centered, facing the viewer at a slight three-quarter turn, consistent headroom with the top of the head near the upper third and the crop at the waist. Camera at eye level, ~50mm, no lens distortion. Lighting is identical for every portrait: a soft key light from the upper left, gentle ambient fill, and a thin rim light along the right edge of the figure in the character's accent color. Background is simple and uncluttered — a smooth studio vignette that is a single flat gradient in the character's element color, darker at the edges, with only a faint atmospheric hint of that element behind the figure; no scenery, no environment, no props floating in space, no other characters. Color grading is consistent: saturated element hues against the dark arcane palette, matte finish. Composition is clean and symmetrical. Absolutely no text, letters, numbers, logos, watermarks, signatures, UI, borders, or frames anywhere in the image.

*(The paragraph above is the guardrail. Every clause pins something that would otherwise vary: pose, crop, camera, lighting direction, rim-light logic, background treatment, palette, finish, and the no-text/no-frame rules.)*

---

## CONTINUITY LINE — prepend on every hero AFTER the anchor

> In the exact same art style, rendering, line weight, proportions, lighting setup, framing, crop, and matte finish as the established LMNTLZ portrait series — same look, only the character changes:

---

## HERO BLOCK — the only part that changes

Fill these slots from the character brief in `../characters/`. Keep it tight; over-describing invites the model to change the style.

> **Character:** {NAME}, {one-line concept}.
> **Build & silhouette:** {build/silhouette}.
> **Face & demeanor:** {face}.
> **Wardrobe:** {wardrobe/materials}.
> **Held / signature:** {weapon or signature motif, kept subtle and in-frame}.
> **Element cue (subtle, behind or around the figure only):** {element expression, restrained}.
> **Element color (drives rim light + background gradient):** {TYPE} — core `{hex}`, accent `{hex}`.

### Per-type background + rim-light color (use exactly)

| Type | Core (background gradient) | Accent (rim light) |
|------|-----------------------------|--------------------|
| Earth | `#4E7C3A` | `#C9922E` |
| Air | `#8FCFE0` | `#DCE6EA` |
| Fire | `#E8552B` | `#FFB347` |
| Water | `#2A7FB8` | `#4FC3D6` |
| Light | `#F2C744` | `#FFF6D6` |
| Dark | `#7A3FA0` | `#C64BB0` |
| Slash | `#C0313A` | `#F06A72` |
| Pierce | `#3B5BD1` | `#7B93F0` |
| Crush | `#B5732E` | `#E0A15A` |

---

## Explicit exclusions (phrase affirmatively — DALL·E ignores "don't")

DALL·E 3 handles prohibitions poorly, so the Master Block states these as positives ("background is a single flat gradient," "single figure"). If a recurring artifact appears, add a short positive redirect rather than a "no X": e.g. if extra weapons appear, add *"holding a single weapon only, both hands visible and empty otherwise."* Keep such redirects identical across heroes once added.

Things the set must never contain: text/letters/numbers, logos or watermarks, borders or card frames, UI elements, multiple characters, background scenery or environments, a second light source, photoreal or 3D-render finish, mismatched crop or aspect ratio.

---

## WORKED EXAMPLE — Bramwen (Earth)

Paste as one block (Continuity Line + Master Style Block + Hero Block). For the anchor image only, omit the Continuity Line.

> In the exact same art style, rendering, line weight, proportions, lighting setup, framing, crop, and matte finish as the established LMNTLZ portrait series — same look, only the character changes:
>
> Stylized semi-anime character portrait for a premium collectible fantasy battler game, in a single unified illustration style across the whole roster. Rendering: bold clean confident linework, cel-style shading with soft painterly gradients over it, rich but controlled color, crisp silhouette readability. Proportions: heroic semi-anime, roughly 7.5 heads tall, expressive but grounded — the same stylization level for every character. Framing: waist-up three-quarter portrait, single figure centered, facing the viewer at a slight three-quarter turn, consistent headroom with the top of the head near the upper third and the crop at the waist. Camera at eye level, ~50mm, no lens distortion. Lighting is identical for every portrait: a soft key light from the upper left, gentle ambient fill, and a thin rim light along the right edge of the figure in the character's accent color. Background is simple and uncluttered — a smooth studio vignette that is a single flat gradient in the character's element color, darker at the edges, with only a faint atmospheric hint of that element behind the figure; no scenery, no environment, no props floating in space, no other characters. Color grading is consistent: saturated element hues against the dark arcane palette, matte finish. Composition is clean and symmetrical. Absolutely no text, letters, numbers, logos, watermarks, signatures, UI, borders, or frames anywhere in the image.
>
> **Character:** Bramwen, a stone-warden whose fury is geological — it arrives late and never recedes.
> **Build & silhouette:** broad and monolithic, heavier at the base than the top, like a standing menhir given shoulders; an older woman with an immovable stance.
> **Face & demeanor:** weathered and deeply lined like cracked bedrock, heavy brow, a half-lidded calm that has not yet decided to be angry; faint moss in the creases.
> **Wardrobe:** layered slate-plate and packed-earth robes with faint amber resin glowing along the seams, a mantle of lichen and root over the shoulders.
> **Held / signature:** one heavy fist lowered, faint stone slabs at her back — no separate weapon.
> **Element cue (subtle):** thin amber light in the cracks of her stone skin; a couple of small slow-orbiting stones near her shoulder.
> **Element color (drives rim light + background gradient):** Earth — core `#4E7C3A`, accent `#C9922E`.

---

## Consistency checklist (verify each finished image)

- Same crop and headroom as the anchor?
- Same lighting direction (key upper-left, rim right)?
- Background is a single element-color gradient, no scenery?
- One figure only, no text, no frame?
- Stylization level and line weight match the anchor?
- Element color matches the palette hex for that type?

Reject and regenerate any image that misses two or more. The per-hero descriptive fields live in `../characters/<hero>.md`; assemble each Hero Block from that file's Build / Face / Wardrobe / Weapon / Element-expression sections.
