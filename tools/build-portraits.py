"""
`pnpm portraits:build` - encode the 27 hero portraits and emit a typed manifest
(019 US3).

Sibling of `tools/build-icons.ts` and deliberately the same shape: read authored
sources, verify them, write a GENERATED file, and **fail loudly** rather than
emitting something half-right.

### Why this one is Python

`build-icons.ts` copies SVGs, which Node can do with `copyFileSync`. This one
*encodes* - 948x1659 PNGs down to two WebP widths - and Node has no image codec
in its standard library. The alternatives were a ~50 MB `sharp` native
dependency in a repo that otherwise ships no binaries, or Pillow, which
`tools/` already assumes a Python for (`gap-audit.py`, `design-audit.py`,
`verify-accuracy.py`). Pillow won.

The **outputs are committed**, so nothing on Vercel needs Pillow. This runs when
the art changes, which is approximately never.

### What makes a missing portrait a build error

`HERO_PORTRAITS` is typed `Record<HeroId, HeroPortraitSources>` and `HeroId` is
the literal union of the 27 ids generated with the roster, so a hero without a
portrait **does not compile** - the same guarantee `HERO_ICONS` gives, and for
the same reason. A blank card is exactly the kind of defect nobody notices until
a player mentions it.

### The two widths, and why not more

The portrait is used at two real sizes: a picker card (~176 CSS px wide) and the
formation's back seat (~203). At 1x that is one 240w image; at 2x it is one
480w. A third width would be shipped bytes nobody requests. `HeroPortrait`
builds a `srcset` from both and lets the browser choose.

Source aspect is 948:1659 (0.571) and **every** card on screen is wider than
that, so the crop happens in CSS with `object-cover` / `object-top` rather than
here. Cropping at build time would bake one card's framing into an asset four
cards share, and the one that gets decapitated is whichever card is added next.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a setup failure, not a code path
    print("portraits:build needs Pillow -- run `py -3 -m pip install pillow`", file=sys.stderr)
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parent.parent

SRC = ROOT / "resources" / "design" / "images"
DEST = ROOT / "apps" / "client" / "src" / "assets" / "portraits"
OUT = ROOT / "apps" / "client" / "src" / "components" / "hero" / "portraits.generated.ts"
ROSTER = ROOT / "packages" / "content" / "src" / "heroes.generated.ts"

#: Not a hero. Named exactly, never pattern-matched -- `build-icons.ts` records
#: why: a `^\d+-` skip would also swallow a genuinely misnamed portrait and turn
#: a loud failure into a silent one.
NOT_A_HERO = {"feature.png"}

WIDTHS = (240, 480)
QUALITY = 72

problems: list[str] = []


def note(message: str) -> None:
    problems.append(message)


def roster() -> list[tuple[str, str]]:
    """`[(id, slug)]`, parsed out of the generated file rather than imported.

    Same call as `build-icons.ts`: importing `@lmntlz/content` would make this
    tool depend on the package being built, and it has to run in a clean
    checkout.
    """
    text = ROSTER.read_text(encoding="utf-8")
    entries = re.findall(r'"id":"(h\d+)","name":"[^"]*","slug":"([^"]+)"', text)
    if not entries:
        note(f"parsed 0 heroes out of {ROSTER} -- the generated shape changed")
    return entries


def stem_of(slug: str) -> str:
    """`01-earth-bramwen` -> `earth-bramwen`. The ordinal is sort order, not identity."""
    return re.sub(r"^\d+-", "", slug)


def pascal(stem: str) -> str:
    """`earth-bramwen` -> `EarthBramwen`, a legal identifier suffix."""
    return "".join(part.capitalize() for part in re.split(r"[^a-zA-Z0-9]+", stem) if part)


def main() -> int:
    heroes = roster()
    available = {p.name for p in SRC.glob("*.png")} - NOT_A_HERO

    rows: list[tuple[str, str, str]] = []  # (heroId, identBase, fileStem)
    for hero_id, slug in heroes:
        source = f"{slug}.png"
        if source not in available:
            note(f"hero {hero_id} ({slug}) has no portrait -- expected {source}")
            continue
        available.discard(source)
        rows.append((hero_id, f"portrait{pascal(stem_of(slug))}", stem_of(slug)))

    # Anything left over is art no hero claims -- a rename that half-landed.
    for orphan in sorted(available):
        note(f"orphan portrait with no matching hero: {orphan}")

    if problems:
        print("portraits:build failed:\n" + "\n".join(f"  - {p}" for p in problems), file=sys.stderr)
        return 1

    # --- encode ------------------------------------------------------------
    #
    # The destination is cleared first. Without it a renamed portrait leaves its
    # old copy behind, the manifest stops referencing it, and the stale file
    # ships forever -- invisible, because nothing points at it.
    if DEST.exists():
        for stale in DEST.iterdir():
            stale.unlink()
    DEST.mkdir(parents=True, exist_ok=True)

    total = 0
    for hero_id, _ident, stem in rows:
        slug = next(s for i, s in heroes if i == hero_id)
        with Image.open(SRC / f"{slug}.png") as image:
            # `RGB`, not `RGBA`: the sources are opaque illustrations and an
            # alpha channel here is pure overhead on every one of the 27.
            rgb = image.convert("RGB")
            for width in WIDTHS:
                height = round(rgb.height * width / rgb.width)
                out = DEST / f"{stem}-{width}.webp"
                rgb.resize((width, height), Image.LANCZOS).save(
                    out, "WEBP", quality=QUALITY, method=6
                )
                total += out.stat().st_size

    # --- emit --------------------------------------------------------------

    banner = (
        "// GENERATED by tools/build-portraits.py from resources/design/images/.\n"
        "// DO NOT EDIT. Run `pnpm portraits:build` and commit the result.\n"
        "//\n"
        "// HERO_PORTRAITS is Record<HeroId, HeroPortraitSources> over the 27-id\n"
        "// literal union, so a hero without art is a COMPILE ERROR rather than a\n"
        "// blank card -- the same guarantee HERO_ICONS gives.\n"
    )

    imports = "\n".join(
        f"import {ident}{w} from '../../assets/portraits/{stem}-{w}.webp';"
        for _id, ident, stem in rows
        for w in WIDTHS
    )
    entries = "\n".join(
        f"  {hero_id}: {{ "
        + ", ".join(f"w{w}: {ident}{w}" for w in WIDTHS)
        + " },"
        for hero_id, ident, _stem in rows
    )

    OUT.write_text(
        f"""{banner}
import type {{ HeroId }} from '@lmntlz/content';

{imports}

/** One hero's art at the two widths the screens actually request. */
export interface HeroPortraitSources {{
{chr(10).join(f'  readonly w{w}: string;' for w in WIDTHS)}
}}

/** The intrinsic aspect ratio of every portrait, for `aspect-*` and CLS. */
export const PORTRAIT_ASPECT = Object.freeze({{ width: 948, height: 1659 }});

export const HERO_PORTRAITS: Record<HeroId, HeroPortraitSources> = {{
{entries}
}};
""",
        encoding="utf-8",
    )

    print(
        f"portraits:build wrote {len(rows)} portraits x {len(WIDTHS)} widths "
        f"({total / 1024 / 1024:.1f} MB total)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
