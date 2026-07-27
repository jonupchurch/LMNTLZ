"""Add/refresh the 'Powers' sheet in resources/characters/hero-stats.xlsx.

Naming tiers, per design:
  0,1,2  shared by every hero of the same PRIMARY type (rank 0 = the auto-attack)
  3      shared by every hero of the same SECONDARY type
  4,5    unique to the hero

Only the six arcane types ever appear as a secondary — melee heroes always take
an arcane secondary, so there are six tier-3 powers, not nine.

Run:  python tools/add-powers-sheet.py
Rewrites only the Powers sheet; Hero Stats is left untouched.
"""

from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

# --- tier 1: by primary type. Voice follows each House in LORE-and-flavor.md ---
BY_PRIMARY = {
    "Earth":  ["Sundered Ground", "Root and Hold", "The Mountain Answers"],
    "Air":    ["Cutting Gale", "Thin the Air", "The Sky Unmoored"],
    "Fire":   ["Ember Lash", "Feed the Bloom", "Everything Burns Twice"],
    "Water":  ["Undertow", "Wear the Stone", "The Tide Remembers"],
    "Light":  ["Verdict Light", "Nothing Hidden", "The First Word Spoken"],
    "Dark":   ["Veilcut", "Draw the Veil", "The Last Silence"],
    "Slash":  ["Open Line", "Riposte", "One Clean Stroke"],
    "Pierce": ["Seamfinder", "Thread the Guard", "The Single Truth"],
    "Crush":  ["Deadweight", "Make an Opening", "The Sky Falls"],
}

# --- tier 2: by secondary type. Reads as the second Force lending itself ---
BY_SECONDARY = {
    "Earth": "The Deep Lends Weight",
    "Air":   "The Sky Lends Swiftness",
    "Fire":  "The Bloom Lends Heat",
    "Water": "The Tide Lends Patience",
    "Light": "The Word Lends Sight",
    "Dark":  "The Silence Lends Cover",
}

# --- tier 3: unique, drawn from each hero's concept and epithet ---
UNIQUE = {
    "Bramwen":           ("Years in the Making", "Wrath of the Slow Stone"),
    "Ossic":             ("Kneel and Raise", "The God-Bone Wakes"),
    "Terragosa":         ("Orchard Over Ruin", "The Green Crown Descends"),
    "Zephyrine":         ("A Distance Never Closed", "The Thin Blade Falls"),
    "Cirrolan":          ("Rumour and Storm", "Whisper from the High Reach"),
    "Vael":              ("Jump First", "Nothing to Catch You"),
    "Ember Saelith":     ("The Room Warms", "First Spark, Last Laugh"),
    "Pyrrhic":           ("Less Left to Lose", "Glad Ruin"),
    "Cindara":           ("The Coal, Not the Flame", "The Long Burn"),
    "Marisel":           ("Your Own Past, Rising", "Drown in What You Did"),
    "Tidewarden Coll":   ("Give Ground, Take Coast", "The Bulwark Holds"),
    "Nix":               ("Perfectly Calm", "The Still Pool Closes"),
    "Seraphel":          ("The Gaze Accuses", "Sentence Passed"),
    "Lucen":             ("Three Beams, No Shadow", "The Unhidden Hour"),
    "Auriel Dawnkeep":   ("The Lantern Holds", "Last Light on the Wall"),
    "Nyxara":            ("A Kindness, Ending", "Mercy at the End"),
    "Umbriel":           ("Unwrite the Line", "The Undoing"),
    "Corvane":           ("I Know Your Hour", "Shepherd of Endings"),
    "Kaellis":           ("Never Twice", "Immaculate"),
    "Reyna Two-Rivers":  ("Two Rivers Meeting", "The Current Takes All"),
    "Grieve":            ("Clear the Room", "The Wide Reaping"),
    "Vantric":           ("The One Gap", "The Spear Finds It"),
    "Silka Pinquick":    ("Already Behind You", "Quicker Than Told"),
    "Lord Aiguille":     ("Before You Decide", "The Long Point"),
    "Boldrek":           ("All At Once", "Avalanche"),
    "Hettamar Ironfall": ("End of Argument", "Ironfall"),
    "Mauless":           ("Guards Break First", "The Undenied"),
}

INK = "FFF4EFE4"
HEAD_FILL = PatternFill("solid", fgColor="FF241F38")
PRIMARY_FILL = PatternFill("solid", fgColor="FFEFF4EC")    # tiers share a tint
SECONDARY_FILL = PatternFill("solid", fgColor="FFF2F0F7")
UNIQUE_FILL = PatternFill("solid", fgColor="FFFFFDF5")
AUTO_FILL = PatternFill("solid", fgColor="FFE6EEE2")

HEAD = ["#", "Hero", "Primary", "Secondary",
        "Power 0 — auto", "Power 1", "Power 2", "Power 3", "Power 4", "Power 5"]


def main() -> None:
    path = Path(__file__).resolve().parent.parent / "resources" / "characters" / "hero-stats.xlsx"
    wb = load_workbook(path)
    src = wb["Hero Stats"]
    head = [c.value for c in src[1]]
    col = {h: head.index(h) + 1 for h in head if h}

    heroes = []
    for r in range(2, src.max_row + 1):
        name = src.cell(r, col["Hero"]).value
        if not name:
            continue
        heroes.append((
            src.cell(r, col["#"]).value,
            name,
            src.cell(r, col["Primary"]).value,
            src.cell(r, col["Secondary"]).value,
        ))

    if "Powers" in wb.sheetnames:
        del wb["Powers"]
    ws = wb.create_sheet("Powers", wb.sheetnames.index("Hero Stats") + 1)

    ws.append(HEAD)
    for c in range(1, len(HEAD) + 1):
        cell = ws.cell(1, c)
        cell.font = Font(bold=True, color=INK)
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30

    for i, (n, name, pri, sec) in enumerate(heroes):
        r = i + 2
        p012 = BY_PRIMARY[pri]
        p3 = BY_SECONDARY[sec]
        p45 = UNIQUE[name]
        for c, v in enumerate([n, name, pri, sec, *p012, p3, *p45], start=1):
            ws.cell(r, c, v)
        for c, fill in ((5, AUTO_FILL), (6, PRIMARY_FILL), (7, PRIMARY_FILL),
                        (8, SECONDARY_FILL), (9, UNIQUE_FILL), (10, UNIQUE_FILL)):
            ws.cell(r, c).fill = fill
        ws.cell(r, 5).font = Font(italic=True)

    last = len(heroes) + 1
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:J{last}"
    for c, w in {"A": 5, "B": 20, "C": 11, "D": 12, "E": 22,
                 "F": 22, "G": 26, "H": 26, "I": 26, "J": 28}.items():
        ws.column_dimensions[c].width = w

    legend = [
        ("L1", "HOW POWERS ARE SHARED", True),
        ("L2", "Power 0 — auto-skill. The default attack, usable every turn with", False),
        ("L3", "no cooldown, so a hero is never idle. Shared by primary type.", False),
        ("L4", "Powers 1-2 — shared by every hero of the same PRIMARY type.", False),
        ("L5", "9 types x 3 = 27 names. Three champions of a House share them.", False),
        ("L6", "Power 3 — shared by every hero of the same SECONDARY type.", False),
        ("L7", "Only 6 names: melee always takes an arcane secondary, so no", False),
        ("L8", "melee type ever appears here.", False),
        ("L9", "Powers 4-5 — unique to the hero. 54 names, the identity layer.", False),
        ("L11", "Names only. Effects, costs and cooldowns are not designed yet —", False),
        ("L12", "see mechanics/03-powers.md when it exists.", False),
    ]
    for ref, text, bold in legend:
        ws[ref] = text
        if bold:
            ws[ref].font = Font(bold=True, color=INK)
            ws[ref].fill = HEAD_FILL
        else:
            ws[ref].font = Font(size=9)
    ws.column_dimensions["L"].width = 66

    wb.save(path)

    distinct = {v for vs in BY_PRIMARY.values() for v in vs} | set(BY_SECONDARY.values()) \
        | {v for vs in UNIQUE.values() for v in vs}
    print(f"Powers sheet written: {len(heroes)} heroes x 6 powers")
    print(f"distinct power names: {len(distinct)} "
          f"({len(BY_PRIMARY) * 3} primary + {len(BY_SECONDARY)} secondary + {len(UNIQUE) * 2} unique)")


if __name__ == "__main__":
    main()
