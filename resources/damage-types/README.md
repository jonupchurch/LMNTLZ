# LMNTLZ damage-type icons

Two variants per type, nine types:

- `type-<name>.svg` — the bare glyph on a transparent artboard, with a 3.5px `#14121F` keyline (`paint-order: stroke`) so it stays legible over element-coloured card frames, portraits, and light panels.
- `badge-<name>.svg` — the same glyph inside a dark disc ringed in the type colour. Use this for damage callouts on a hero: it holds its shape against portrait art and reads down to ~20px.

Colours are the nine tokens only (core + accent step). 64×64 viewBox, no fonts, each root group carries `id="type-<name>"` / `id="badge-<name>"` for spriting.

**Showing damage on a hero:** badge + signed numeral in JetBrains Mono. Super-effective (Bane) swaps the badge ring to `--lz-danger #C0313A` and the numeral to gold; resisted drops the whole cluster to 60–70% opacity in Air cyan; normal hits use the type colour as-is. `00-overview.svg` shows all three.
