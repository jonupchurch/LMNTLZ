# Claude Design Prompt — Hero Vector Icon Set (SVG)

> **How to use:** Run after `../00-style-system.md`. Paste that file's token summary first, then the prompt below. This generates a **single cohesive SVG sheet** of all 27 hero emblems as flat vectors matching the character designs — one distilled, on-model icon per hero. Consistency is enforced by a shared badge frame, fixed grid, fixed stroke rules, and the per-hero motif table at the bottom. You can also ask for any single hero as its own SVG using the same spec.

---

## PROMPT

Design a **cohesive set of 27 hero emblem icons** for LMNTLZ (a fantasy battler), delivered as **one clean SVG artboard**, in the LMNTLZ style system (stylized, bold, vivid element color, dark arcane UI). Each emblem is a flat-vector distillation of one hero — their signature weapon/motif and a hint of silhouette — not a full portrait. Think collectible faction crests: instantly readable at small sizes, unmistakably one family.

**Layout & grid**
- One artboard, 27 emblems arranged in a grid **grouped by damage type**: 6 magic rows (Earth, Air, Fire, Water, Light, Dark) then 3 melee rows (Slash, Pierce, Crush), 3 heroes per row. Label each row with the type name.
- Every emblem sits in an **identical badge frame** — same shape (a rounded-shield / hex-medallion, pick one and use it for all 27), same size, same internal padding, same tile spacing.

**Per-emblem construction (identical rules for all 27)**
- A **badge frame** filled with the hero's **type color** (core fill), a subtle inner darkening at the edges, and a 1-step lighter accent rim.
- The hero's **signature motif** (from the table below) rendered as a **flat vector glyph** centered in the badge — bold geometric shapes, minimal detail, strong silhouette.
- A small **element sigil** (the type's icon from the style system: Earth crystal, Air spiral, Fire flame, Water droplet, Light burst, Dark crescent, Slash blade-streak, Pierce spearpoint, Crush impact) tucked into a **consistent corner** of every badge.
- **Restraint:** 2–3 fills max per emblem plus the accent, flat color (no photographic gradients; if any gradient, one consistent subtle top-light gradient rule applied identically everywhere).

**Vector discipline (this is what keeps them a set)**
- Uniform **stroke weight** on all outlines; uniform **corner radius** language; consistent glyph scale so no emblem's motif is noticeably bigger or busier than another.
- Each emblem centered in a consistent tile viewBox (e.g. 128×128) with equal margins.
- Limited, shared palette — only the nine type colors (below) plus one shared dark and one shared light for shading. No off-palette hues.

**SVG output requirements**
- Valid, clean, hand-editable SVG. Transparent artboard background.
- Wrap each emblem in a `<g>` with an `id` matching the hero slug (e.g. `id="earth-bramwen"`), so individual icons can be lifted out.
- Where shapes repeat (badge frame, element sigils), define them once as `<symbol>`/`<defs>` and `<use>` them, so the set is truly consistent and lightweight.
- No raster images, no embedded fonts (convert any label text to paths or keep labels as a separate toggendable layer).

Present the full sheet so the whole roster reads as one cohesive icon family at a glance.

---

## Per-hero motif reference (keep each emblem on-model)

Type colors — Earth `#4E7C3A` · Air `#8FCFE0` · Fire `#E8552B` · Water `#2A7FB8` · Light `#F2C744` · Dark `#7A3FA0` · Slash `#C0313A` · Pierce `#3B5BD1` · Crush `#B5732E`.

| Slug | Hero | Type | Signature motif for the glyph |
|------|------|------|-------------------------------|
| earth-bramwen | Bramwen | Earth | A cracked standing-stone / menhir with amber fault-lines |
| earth-ossic | Ossic | Earth | A bone crook over a rising bone-pillar |
| earth-terragosa | Terragosa | Earth | An antler-branch crown with a single blossom |
| air-zephyrine | Zephyrine | Air | A crescent wind-blade with a trailing ribbon |
| air-cirrolan | Cirrolan | Air | A cloud swirl cradling a feather |
| air-vael | Vael | Air | A downward dive-chevron split by a lightning fork |
| fire-ember-saelith | Ember Saelith | Fire | A cupped pair of hands holding a flame bloom |
| fire-pyrrhic | Pyrrhic | Fire | A cracked figure/brand glowing molten at the seams |
| fire-cindara | Cindara | Fire | A ring of coals with rising heat-lines |
| water-marisel | Marisel | Water | A floating water orb with a faint face-reflection |
| water-tidewarden-coll | Tidewarden Coll | Water | A cresting-wave tower shield |
| water-nix | Nix | Water | A single expanding ripple crossed by a thin blade |
| light-seraphel | Seraphel | Light | A haloed upright greatsword balanced like scales |
| light-lucen | Lucen | Light | A prism casting three revealing beams |
| light-auriel-dawnkeep | Auriel Dawnkeep | Light | A lantern set within a shield, radiating a dawn arc |
| dark-nyxara | Nyxara | Dark | A drifting veil with a single moth |
| dark-umbriel | Umbriel | Dark | A fraying void-rift with magenta cracks |
| dark-corvane | Corvane | Dark | A shepherd's crook, a soul-lantern, and a raven |
| slash-kaellis | Kaellis | Slash | A single upright sword over one clean crimson cut-arc |
| slash-reyna | Reyna Two-Rivers | Slash | Two crossed curved blades forming a double-arc |
| slash-grieve | Grieve | Slash | A war-scythe sweeping one wide horizontal arc |
| pierce-vantric | Vantric | Pierce | A long spear along a single straight thrust-line to a point |
| pierce-silka | Silka Pinquick | Pierce | A fan-cluster of needle-points from one origin |
| pierce-aiguille | Lord Aiguille | Pierce | An extra-long rapier reaching to a far pinpoint |
| crush-boldrek | Boldrek | Crush | A boulder-maul amid tumbling rubble |
| crush-hettamar | Hettamar Ironfall | Crush | A maul falling straight into a crater shock-ring |
| crush-mauless | Mauless | Crush | A ram-shield breaking through shatter-shards |

---

## Do / Avoid

- **Do:** make all 27 read as one set first, individual heroes second — shared frame, shared stroke language, shared palette. Prioritize silhouette clarity at 32–48px.
- **Avoid:** portrait faces or fine facial detail (these are emblems, not portraits), off-palette colors, gradients or effects that vary between emblems, and any single motif rendered busier or larger than the rest.

## Design canon reference

- 9 types (6 magic + 3 melee), 3 heroes each = 27 emblems. Type colors and element sigils come from `../00-style-system.md`.
- Motifs are distilled from the full character briefs in `../characters/` — see each hero's *Weapon & props* and *Element expression* sections for more detail if a glyph needs refining.
