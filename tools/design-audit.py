"""Measure each built screen against the export it was drawn from (feature 019).

### Why this exists

`tools/gap-audit.py` answers *"is it reachable?"* and has been the most useful
tool in the repo, because it turns an argument into a number. This is the same
instrument aimed at the other complaint: **it looks nothing like the design.**

017 ported the exports' colours, type families and layout regions and stopped
there, and the result reads as generic — the exports are chamfered, layered and
lit, and the client is square, flat and unlit. That was not visible in any gate,
because every test asserted behaviour and no test could see a silhouette.

So this extracts the **visual vocabulary** of each export and of the screen built
from it, and prints the delta. It is deliberately blunt: it counts vocabulary,
not pixels. A screen that uses no `clip-path` against an export that uses twenty
is not "slightly off", and that is the class of difference this catches.

### What it cannot see, stated so nobody trusts it too far

- **Spacing and density.** The exports use inline `padding`/`gap` in pixels; the
  client uses Tailwind's scale. Comparing them needs a resolver this does not
  have, so a screen can pass here and still be visibly looser or tighter.
- **Whether a shape is used in the right PLACE.** One `clip-path` on the wrong
  element satisfies the count. The count is a floor, never a pass mark.
- **Anything about the real hero art**, which is a separate job with its own
  asset pipeline.

Run: `py tools/design-audit.py [--screen roster]`
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

# Windows consoles default to cp1252 and this file prints arrows and box rules.
# Without this the tool dies three quarters of the way through its own report.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
EXPORTS = ROOT / "resources" / "designsystem"
CLIENT = ROOT / "apps" / "client" / "src"

# ---------------------------------------------------------------------------
# The map. An export with no screen is not a gap here — it is unbuilt work.
# ---------------------------------------------------------------------------

SCREENS: dict[str, tuple[str, list[str]]] = {
    # ⚠️ This row said `landing` until 019, and it was measuring the wrong two
    # things against each other. `LMNTLZ Onboarding Flows.dc.html` sounds like
    # the front door and is not: its three views are a guild INVITATION, a guild
    # APPLICATION and a five-step PROFILE SETUP wizard, every one of them behind
    # sign-in. Pointing it at `features/landing` + `features/auth` produced five
    # confident ABSENT lines — gradient x10, portrait x3, inset-shadow, dashed,
    # keyframes — for treatments the marketing page's design never asked for,
    # because the marketing page has no design.
    #
    # The lesson generalises past this row: **a name that reads right is not a
    # mapping that is right.** Open the export before trusting the row.
    "onboarding": ("LMNTLZ Onboarding Flows.dc.html", ["features/guilds", "features/profile"]),
    "roster":    ("LMNTLZ Roster.dc.html",           ["features/roster"]),
    # This row was measured against the Design System's component gallery as a
    # stand-in, because the squad builder had no export — the design was a
    # wireframe Jon held outside the repo. **It has one now**, so the row points
    # at the real thing and the gallery's 19 `clip-path`s stop being counted as
    # a debt this screen owes. The wireframe draws rounded rectangles.
    "squads":    ("LMNTLZ Squad Builder.dc.html",    ["features/squads"]),
    "battle":    ("LMNTLZ Battle.dc.html",           ["features/battle"]),
    "turnqueue": ("LMNTLZ Turn Sequence.dc.html",    ["features/battle"]),
    "attack":    ("LMNTLZ Matchmaking and Results.dc.html", ["features/attack"]),
    "profile":   ("LMNTLZ Profile.dc.html",          ["features/profile"]),
    "replays":   ("LMNTLZ Battle Record.dc.html",    ["features/replays"]),
    "guilds":    ("LMNTLZ Guild Roster.dc.html",     ["features/guilds"]),
    "guildadmin": ("LMNTLZ Guild Admin.dc.html",     ["features/guilds"]),
    "guildnew":  ("LMNTLZ Guild Creation.dc.html",   ["features/guilds"]),
    "codex":     ("LMNTLZ Codex.dc.html",            ["features/codex"]),
    "forge":     ("LMNTLZ Rune Forge.dc.html",       ["features/forge"]),
    "store":     ("LMNTLZ Store.dc.html",            ["features/store"]),
    "herocard":  ("LMNTLZ Hero Card.dc.html",        ["components/hero", "components/type"]),
    "system":    ("LMNTLZ Design System.dc.html",    ["components"]),
}

# The other direction: **built screens with no export at all.**
#
# Recorded because an unmeasured screen is invisible to this tool, and invisible
# reads as fine. These are not gaps in the port — there is nothing to port to —
# but they are the surfaces where "does it match the design?" has no answer, so
# they need a human eye instead of a number.
NO_EXPORT = {
    "features/landing": "the marketing front door — no design was ever authored for it",
    "features/auth": "the sign-in panel, drawn to the same vocabulary as the landing page",
    "features/gallery": "the internal component gallery, measured by `system` instead",
}

# Exports with no built screen — named so the absence is deliberate, not missed.
UNBUILT = {
    "LMNTLZ Chat.dc.html": "014",
    "LMNTLZ News.dc.html": "016",
    "LMNTLZ Broadcast Messages.dc.html": "016",
    "LMNTLZ Brand Book.dc.html": "reference, not a screen",
    "LMNTLZ Architecture.dc.html": "reference, not a screen",
    "LMNTLZ Architecture Chart.dc.html": "reference, not a screen",
}


def strip_comments(source: str) -> str:
    """Comments explain the design; they are not the design. Checked, per the
    scan rule that has bitten this repo ten times."""
    out = re.sub(r"/\*[\s\S]*?\*/", "", source)
    out = re.sub(r"//.*$", "", out, flags=re.M)
    if not re.search(r"\b(import|export|const|function)\b", out):
        raise SystemExit(f"comment strip emptied a file — every count below would be zero")
    return out


# ---------------------------------------------------------------------------
# The vocabulary, counted on both sides
# ---------------------------------------------------------------------------

def export_vocabulary(html: str) -> Counter:
    v: Counter = Counter()
    v["clip-path"] = len(re.findall(r"clip-path\s*:", html))
    v["box-shadow"] = len(re.findall(r"box-shadow\s*:", html))
    v["inset-shadow"] = len(re.findall(r"box-shadow\s*:\s*inset", html))
    v["glow"] = len(re.findall(r"box-shadow\s*:\s*0 0 \d+px", html))
    v["gradient"] = len(re.findall(r"(linear|radial)-gradient\(", html))
    v["dashed"] = len(re.findall(r"border[^;:]*:\s*[^;]*dashed", html))
    v["backdrop-filter"] = len(re.findall(r"backdrop-filter\s*:", html))
    v["keyframes"] = len(re.findall(r"@keyframes", html))
    v["transition"] = len(re.findall(r"transition\s*:", html))
    v["uppercase"] = len(re.findall(r"text-transform\s*:\s*uppercase", html))
    v["tracking"] = len(re.findall(r"letter-spacing\s*:", html))
    v["tabular"] = len(re.findall(r"font-variant-numeric|tabular-nums", html))
    v["portrait"] = len(re.findall(r"background-image\s*:\s*url\(|<img\b", html))
    return v


BASE_CSS = CLIENT / "styles" / "base.css"


def project_classes() -> dict[str, set[str]]:
    """`.lz-plate` -> {"clip-path"}, `.lz-surface` -> {"box-shadow", ...}.

    ### The tool was wrong before this existed, and it mattered immediately

    The first version scanned `.tsx` for `shadow-[` and `clip-path` literally.
    Then 019 US1 moved those treatments into named classes in `base.css` —
    which is the *correct* thing to do, and is what the audit is supposed to
    encourage — and the audit went on reporting them as absent because it was
    matching a spelling rather than a meaning.

    **A scan that only recognises one way of writing something punishes the fix
    it exists to demand.** So the client's own stylesheet is parsed, and a class
    that declares `clip-path` counts as `clip-path` wherever it is used.
    """
    if not BASE_CSS.exists():
        return {}

    css = re.sub(r"/\*[\s\S]*?\*/", "", BASE_CSS.read_text(encoding="utf-8"))
    classes: dict[str, set[str]] = {}
    for match in re.finditer(r"\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}", css):
        name, body = match.group(1), match.group(2)
        props: set[str] = set()
        if "clip-path" in body:
            props.add("clip-path")
        if "box-shadow" in body:
            props.add("box-shadow")
            if "inset" in body:
                props.add("inset-shadow")
            if re.search(r"0 0 \d+px", body):
                props.add("glow")
        if re.search(r"border[^;]*dashed", body):
            props.add("dashed")
        if "gradient" in body:
            props.add("gradient")
        if "backdrop-filter" in body:
            props.add("backdrop-filter")
        if props:
            classes[name] = props
    return classes


def project_components() -> dict[str, set[str]]:
    """`HeroPortrait` -> {"portrait", "gradient"}, `Meter` -> {"gradient"}, ...

    ### The same defect as `project_classes`, one level up

    `project_classes` taught the audit that a treatment can be spent through a
    named CSS class. It can equally be spent through a **component**: 019 US2
    gave the squad screen 33 hero portraits, and the audit went on reporting
    `portrait  ABSENT` because the `<img>` is inside `HeroPortrait` and the
    screen only writes `<HeroPortrait ...>`.

    That is the eleventh-and-twelfth instance of one mistake in this repo, and
    the tell is always the same: **a metric that barely moves after work aimed
    straight at it is measuring the wrong thing.** So the component layer is
    scanned for what each file spends, and a screen that names a component is
    credited with it.

    Deliberately shallow — one hop, and only for components exported from
    `components/`. A transitive graph would be more correct and would make the
    number harder to explain, and this is a floor rather than a pass mark.
    """
    contributed: dict[str, set[str]] = {}
    classes = project_classes()
    # **Tokens too, or this layer under-reports exactly what the token layer was
    # added to catch.** `Meter` spends its inset hairline as
    # `shadow-(--shadow-hairline)`; without resolving that here, every screen
    # that renders a `<Meter>` inherits an incomplete answer, and the two fixes
    # only work together.
    tokens = project_tokens()

    for path in sorted((CLIENT / "components").rglob("*.tsx")):
        name = path.stem
        if name.endswith(".generated"):
            continue
        spent = set(client_vocabulary([path], classes, None, tokens).elements())
        keep = spent & {
            "clip-path",
            "box-shadow",
            "inset-shadow",
            "glow",
            "gradient",
            "dashed",
            "backdrop-filter",
            "keyframes",
            "portrait",
        }
        if keep:
            contributed[name] = keep
    return contributed


def project_tokens() -> dict[str, set[str]]:
    """`--shadow-hairline` -> {"box-shadow", "inset-shadow"}, and so on.

    ### The same mistake a THIRD time, one level deeper again

    `project_classes` taught this tool that a treatment can be spent through a
    named CSS class; `project_components` taught it that a component spends one
    too. Both were found the same way — a number that refused to move after work
    aimed straight at it.

    This is the third: a treatment spent through a **custom property**. 019 gave
    `Meter`'s well the export's inset hairline as
    `shadow-(--shadow-hairline)`, and the audit went on reporting
    `inset-shadow ABSENT` because the word `inset` appears only in `base.css`,
    on the token's definition, and never at the call site.

    Left unfixed it is worse than a wrong number: it pushes whoever is chasing
    the metric to write `shadow-[inset_0_0_0_1px_...]` by hand — an untokenised
    literal — purely to satisfy the scan. **A measurement that rewards
    duplicating a token is measuring the wrong thing.**
    """
    if not BASE_CSS.exists():
        return {}

    css = re.sub(r"/\*[\s\S]*?\*/", "", BASE_CSS.read_text(encoding="utf-8"))
    tokens: dict[str, set[str]] = {}
    for match in re.finditer(r"(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);", css):
        name, value = match.group(1), match.group(2)
        props: set[str] = set()
        if re.search(r"\d+px|\binset\b", value) and ("shadow" in name or "inset" in value):
            props.add("box-shadow")
            if "inset" in value:
                props.add("inset-shadow")
            if re.search(r"0 0 \d+px", value):
                props.add("glow")
        if "gradient" in value:
            props.add("gradient")
        if "polygon" in value or "clip-path" in name:
            props.add("clip-path")
        if props:
            tokens[name] = props
    return tokens


def client_vocabulary(
    sources: list[Path],
    classes: dict[str, set[str]],
    components: dict[str, set[str]] | None = None,
    tokens: dict[str, set[str]] | None = None,
) -> Counter:
    v: Counter = Counter()
    for path in sources:
        code = strip_comments(path.read_text(encoding="utf-8"))

        # Written inline: Tailwind arbitrary values, and v4's `shadow-(--token)`
        # shorthand, which the first version of this tool did not know about.
        v["clip-path"] += len(re.findall(r"clip-path|\[clip-path", code))
        v["box-shadow"] += len(
            re.findall(r"\bshadow-\[|\bshadow-\(|\bshadow-(?:sm|md|lg|xl|2xl)\b", code)
        )
        v["inset-shadow"] += len(re.findall(r"inset_0|shadow-inner|inset-shadow", code))
        v["glow"] += len(re.findall(r"shadow-\[0_0_|shadow-\(--shadow-glow", code))
        # `bg-gradient-to-b` is Tailwind **v3**. This repo is on v4, where the
        # class was renamed `bg-linear-to-b` (plus `bg-radial`/`bg-conic`, and
        # the arbitrary-angle `bg-linear-[140deg]`). Without the v4 names the
        # scan could not see a single one of the client's gradients — `Button`,
        # `Meter`, `HeroPortrait`, `ScoutedWall`, `BattleBoard` and
        # `SquadBuilder` all spend one and all read as ABSENT. Fifth instance of
        # the same defect: the scan was the wrong shape for what it measures.
        v["gradient"] += len(
            re.findall(
                r"bg-gradient|bg-(?:linear|radial|conic)|bg-\[(?:linear|radial)"
                r"|(?:linear|radial)-gradient",
                code,
            )
        )
        v["dashed"] += len(re.findall(r"border-dashed", code))
        v["backdrop-filter"] += len(re.findall(r"backdrop-(?:blur|filter|saturate)", code))
        v["keyframes"] += len(re.findall(r"@keyframes|animate-\[|animate-(?:pulse|spin|ping)", code))
        v["transition"] += len(re.findall(r"\btransition\b", code))
        v["uppercase"] += len(re.findall(r"\buppercase\b", code))
        v["tracking"] += len(re.findall(r"tracking-", code))
        v["tabular"] += len(re.findall(r"tabular-nums", code))
        v["portrait"] += len(re.findall(r"<img\b|backgroundImage", code))

        # Spent through a custom property: `shadow-(--shadow-hairline)`.
        for token, props in (tokens or {}).items():
            uses = len(re.findall(rf"\({re.escape(token)}\)|var\(\s*{re.escape(token)}\s*\)", code))
            for prop in props:
                v[prop] += uses

        # Spent through a named class in `base.css`.
        for name, props in classes.items():
            uses = len(re.findall(rf"\b{re.escape(name)}\b", code))
            for prop in props:
                v[prop] += uses

        # Spent through a shared component. `<HeroPortrait` only — a bare
        # mention in an import list is not a use, and counting it would credit
        # a screen for something it renders nowhere.
        for name, props in (components or {}).items():
            uses = len(re.findall(rf"<{re.escape(name)}[\s/>]", code))
            for prop in props:
                v[prop] += uses
    return v


def sources_for(dirs: list[str]) -> list[Path]:
    found: list[Path] = []
    for d in dirs:
        base = CLIENT / d
        if base.exists():
            found.extend(sorted(p for p in base.rglob("*.tsx")))
    return found


# ---------------------------------------------------------------------------

def main() -> int:
    only = None
    if "--screen" in sys.argv:
        only = sys.argv[sys.argv.index("--screen") + 1]

    print("Design audit — each built screen against the export it was drawn from")
    print("Counts are VOCABULARY, not pixels. A zero against a non-zero is the finding.\n")

    classes = project_classes()
    if not classes:
        print("!! no project classes parsed from base.css — every class-based")
        print("   treatment below will read as absent. Check the stylesheet path.")
    else:
        print(f"Resolved {len(classes)} treatment classes from base.css: "
              f"{', '.join(sorted(classes))}\n")

    tokens = project_tokens()
    if not tokens:
        print("!! no design tokens resolved from base.css — a screen spending a")
        print("   treatment through `shadow-(--shadow-hairline)` will read as absent.")
    else:
        print(f"Resolved {len(tokens)} treatment tokens from base.css.\n")

    components = project_components()
    if not components:
        print("!! no shared components resolved — a screen that spends a treatment")
        print("   through <HeroPortrait> or <Meter> will read as absent. Check the path.")
    else:
        print(f"Resolved {len(components)} treatment-bearing components: "
              f"{', '.join(sorted(components))}\n")

    rows: list[tuple[str, str, Counter, Counter, list[str]]] = []
    for name, (export_name, dirs) in SCREENS.items():
        if only and name != only:
            continue
        export_path = EXPORTS / export_name
        if not export_path.exists():
            print(f"!! missing export: {export_name}")
            continue
        want = export_vocabulary(export_path.read_text(encoding="utf-8"))
        srcs = sources_for(dirs)
        if not srcs:
            print(f"!! no sources for {name}: {dirs}")
            continue
        have = client_vocabulary(srcs, classes, components, tokens)
        missing = [k for k in want if want[k] > 0 and have[k] == 0]
        rows.append((name, export_name, want, have, missing))

    keys = ["clip-path", "box-shadow", "glow", "gradient", "dashed",
            "backdrop-filter", "keyframes", "portrait"]

    head = f"{'screen':<12}" + "".join(f"{k[:9]:>12}" for k in keys)
    print(head)
    print("-" * len(head))
    for name, _export, want, have, _missing in rows:
        cells = "".join(f"{str(want[k]) + '/' + str(have[k]):>12}" for k in keys)
        print(f"{name:<12}{cells}")

    print("\n(export / client)\n")

    total_absent = 0
    for name, export_name, want, have, missing in rows:
        if not missing:
            continue
        total_absent += len(missing)
        print(f"{name}  ← {export_name}")
        for k in missing:
            print(f"    ABSENT  {k:<16} export uses it {want[k]}x, the screen never does")

    print(f"\n{total_absent} absent treatments across {len(rows)} screens.")

    print("\nExports with no built screen (deliberate):")
    for k, why in sorted(UNBUILT.items()):
        print(f"    {k[:44]:<46} {why}")

    # The count above cannot include these, and saying so is the point: a screen
    # this tool does not measure contributes zero to the total either way.
    print("\nBuilt screens with NO export (not counted above — judge by eye):")
    for k, why in sorted(NO_EXPORT.items()):
        print(f"    {k[:44]:<46} {why}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
