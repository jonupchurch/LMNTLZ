# Claude Design Prompt — Status Effect Icons

Produces the in-battle status icon set: every distinct state a champion can be
in, at pip scale. Companion to `damage-types/` (nine type glyphs) and
`designsystem/hero-icons/` (27 hero emblems).

**Run after `design-system.md`** — it reuses the tokens, the nine type colors and
the JetBrains Mono numeric treatment established there.

**Source of truth for the mechanics below:** `mechanics/05-status.md` (the effect
catalog, magnitude scale and stacking rules), `mechanics/06-progression.md` (the
33-effect rune utility catalog), `mechanics/04-turns.md` (when durations tick)
and `mechanics/01-stats.md` (the ten stats).

**16 new glyphs, plus pip-scale variants of the 10 existing stat glyphs.** The
count is low because three multipliers do most of the work: stat icons carry a
polarity rather than being drawn twice, one damage-over-time glyph is tinted by
the nine type colors, and several mechanics collapse onto icons that already
exist — `Slow` *is* a −10 `Speed` debuff, and mitigation shred *is* `Armor` or
`Magic Resist` going down. Neither needs its own drawing.

---

## PROMPT

Design the **status effect icon set** for LMNTLZ, a competitive fantasy squad
battler. These appear as small pips on a champion's battle chip during combat,
where up to twelve champions are on screen at once. Reuse the tokens, type
colors and typefaces from the LMNTLZ Design System.

### The constraint that shapes everything

A 6v6 battle runs ~155 champion-turns with **36 rune effects live** on top of 36
powers and 36 passives. A single champion can plausibly carry four or five
statuses at once on a chip that is a fraction of the screen. So:

- **Read at 16px.** Silhouette first, detail second. If it needs two glances it
  has failed.
- **Show at most 4 pips per chip**, then a `+N` overflow chip that expands on
  hover. Priority order: crowd control → damage-over-time → everything else.
- **Polarity must be legible without reading the glyph** — a player has to know
  "that champion is buffed / that champion is in trouble" from color and
  direction alone, before identifying which effect it is.

### Three duration treatments, not one

This matters more than usual because rune effects introduced a persistence class
that the power system does not have.

| Treatment | Shown as | Applies to |
|---|---|---|
| **Timed** | numeral, **1–4** turns remaining, JetBrains Mono | every power-applied effect |
| **Rest of battle** | a permanence marker instead of a numeral — no number, ever | rune trigger effects |
| **Charge** | shown while unspent, vanishes when consumed | rune wards |

Durations tick on the **bearer's own turn**, so the numeral counts that
champion's turns, not rounds and not anybody else's turns.

### Two overlay modifiers, not standalone icons

- **Stack count** — a numeral badge. Damage-over-time stacks to 3 per target;
  two rune effects stack to 3. Distinguish it from the duration numeral clearly;
  they will sometimes appear on the same pip.
- **Cannot be cleansed** — a small lock or seal overlay. Four sources produce
  it, so it must compose over any pip rather than being drawn into one.

---

## Group 1 — Stat modifiers · 10 glyphs, 2 polarities each

Buffs and debuffs to any of the ten stats. **These glyphs already exist on the
hero card** — what is needed is a pip-scale variant plus a polarity treatment,
not a new drawing. Verify against `designsystem/LMNTLZ Hero Card.dc.html` first.

| Stat | What it does |
|---|---|
| **Might** | How hard the champion hits |
| **Perception** | How accurately it lands a blow |
| **Agility** | How well it avoids being hit |
| **Penetration** | How well it pierces mitigation |
| **Armor** | Absorbs martial damage |
| **Magic Resist** | Absorbs arcane damage |
| **Toughness** | The size of the health pool |
| **Speed** | How quickly and how often it acts |
| **Resolve** | Resists crowd control |
| **Luck** | Shifts the random rolls |

Magnitudes run **±10 / ±15 / ±20 / ±25** by tier. The pip shows the stat and the
direction; the exact number belongs in the expanded tooltip, not the pip.

> **Two mechanics fold into this group and get no icon of their own.** `Slow` is
> defined as −10 `Speed` — draw it as a Speed debuff. **Mitigation shred** removes
> a percentage of `Armor` or `Magic Resist` — draw it as those stats going down.
> Inventing separate glyphs would teach players a distinction the rules do not
> make.

## Group 2 — Damage over time · 1 glyph, 9 type tints

One glyph, tinted by whichever of the nine damage types applied it, using the
existing type color tokens. A burn, a bleed and a drowning are the same
mechanic — snapshotted at application, ticking in the bearer's Upkeep before it
acts, stacking to 3 per target.

Needs to compose with: the **stack numeral** (up to 3), the **duration
numeral**, and the **cannot-be-cleansed lock**.

## Group 3 — Crowd control · 2 glyphs

The most important pips in the set. One turn of stun is the strongest single
effect in the game, and these must be the first thing a player sees.

| Icon | Effect |
|---|---|
| **Stun** | The champion loses its action entirely |
| **Silence** | Powers blocked — the tier-0 auto-attack still works |

The distinction has to be visible at a glance: **stunned means nothing happens,
silenced means something small still happens.**

## Group 4 — Absorb and targeting · 3 glyphs

| Icon | Effect |
|---|---|
| **Shield** | An absorb layer depleted before the health pool. The only thing that can fully negate a landed hit |
| **Taunt** | Compels attackers to target this champion |
| **Fade** | Filters this champion out of enemy targeting |

**Taunt and Fade cancel on the same champion and are each other's counter** —
they are permanent role passives for the Tank and Buffer roles. Design them as an
opposed pair; they will frequently be seen adjacent.

## Group 5 — Rune states · 9 glyphs

These come from the 33-effect utility catalog. **They need icons more urgently
than the power effects do**, because scouting shows an opponent only which rune
slots are filled and their elements — never what the effects are. An attacker
meets these blind, so the icon is the *only* announcement that something
unexpected just happened.

| Icon | State | Sources |
|---|---|---|
| **Warded** | An unspent charge that will negate the next qualifying effect | `Not This Time`, `It Passes Through`, `Turned Aside` |
| **Rooted** | Cannot be moved from its row | `Weight Tells` |
| **Unbreakable** | Cannot be critically hit | `All One Piece` |
| **Extended reach** | +1 reach for this turn only — rolled at turn start and **shown before the player chooses** | `Further Than It Looks` |
| **Reprisal** | Attackers take damage for striking this champion | `Too Close`, `Both Ways` |
| **Withered** | Incoming healing reduced | `Runs Dry` |
| **Renewed** | Incoming healing increased | `Draws It Up` |
| **Exposed** | Cannot dodge — the contested accuracy roll is skipped | `Held in the Light` |
| **Unseen** | Untargetable until this champion's next turn | `No One Saw` |

Three notes for the design:

- **Extended reach is the highest-stakes pip in the set.** It is rolled at the
  start of the turn and shown *before* the player picks a power, so it is a
  prompt to act rather than a report. It should read differently from the
  others — brighter, more urgent, arguably not a pip at all but a treatment on
  the champion's own reach indicator.
- **Withered and Renewed are an opposed pair** and should be drawn as such.
- **Unseen and Exposed are direct counters** — one hides a champion from
  targeting, the other strips a champion's ability to avoid being hit. Drawing
  them as opposites makes a real mechanical relationship visible.

## What deliberately gets no icon

Rune effects that are permanently true from the first moment of a battle and
never change belong on the champion's detail panel, not in the pip row. Putting
them in the pip row would burn the overflow budget on information that never
updates:

`On the Same Breath` · `The Draft` · `It Lingers` · `Straight Past` ·
`Before It Knew` · `Take It Back` · `Nowhere to Stand` · `Again, There`
*(shows as a stack numeral on the target instead)*

---

## Deliverables

Match the conventions already set by `damage-types/`:

- `status-<name>.svg` — the bare glyph on a transparent artboard, with the same
  3.5px `#14121F` keyline (`paint-order: stroke`) so it survives over portrait
  art, element-colored frames and light panels.
- `pip-<name>.svg` — the glyph in its battle-chip container, sized to read at
  16px, with the polarity treatment applied.
- **64×64 viewBox, no fonts**, each root group carrying `id="status-<name>"` /
  `id="pip-<name>"` for spriting.
- An overview sheet showing every pip at 16px, 24px and 48px, plus a worked
  example of a single champion chip carrying four pips and a `+2` overflow.
- The two overlay modifiers demonstrated composing over three different pips.
