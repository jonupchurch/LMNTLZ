# Feature Specification: Visual Fidelity — the screens look like the designs

**Feature Branch**: `019-visual-fidelity`

**Created**: 2026-07-31

**Status**: Draft

**Input**: Jon, 2026-07-31: *"it's getting closer, but still not looking like the
designs"*, then **"I want to prioritize making things look exactly the way they
should. All completed screens need to be redone to match the designs before
anything else is attempted."**

---

## TL;DR

The game works and does not look like the pictures it was drawn from. 017 copied
the colours, the fonts and where things sit, and stopped — so every panel is a
flat square box, where the designs are chamfered, layered, lit, and use *shape*
to tell you what kind of champion you are looking at. This feature redoes every
finished screen against its design, adds the hero artwork that already exists but
has never been put on screen, and makes the difference measurable so it cannot
quietly come back.

---

## Why this feature exists, and why 017 did not already do it

017 was *The Design Port* and it closed at 72/73 with every gate green. It moved
eleven surfaces onto the design tokens, the three type families, the shared
components and the twelve-column grid. All of that is real and none of it is
being undone.

**What it could not see is a silhouette.** Every test in this repo asserts
behaviour, and no behavioural test can tell a chamfered plate from a rounded
rectangle. So the port satisfied every check it had while leaving the design's
entire shape and depth vocabulary on the floor.

`py tools/design-audit.py` measures it — **76 absent treatments across 16
screens**:

| | exports | client |
|---|---|---|
| `clip-path` — the shape language | **45** | **0** |
| `box-shadow` — elevation, inset hairlines, glows | **111** | **1** |
| gradients — scrims, fills, meters | 100+ | 0 |
| dashed borders — empty and placeholder states | 60+ | 2 |
| hero portraits | 13 of 21 exports | 0 |

### The shapes are not decoration

In `LMNTLZ Hero Card.dc.html` a **magic** Force is drawn as a shield —
`polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)`, 46×52, a 2px lit border — and a
**martial** one as a chamfered plate, `polygon(0 0,100% 0,100% 78%,78% 100%,0
100%)`, often `2px dashed`, with the bane/fault relationship carried in the
border colour. **The 6-magic / 3-melee split the whole game rests on is legible
in the silhouette before a word is read.** `TypeBadge` today renders
`rounded-sm` and a fill colour.

That is Jon's earlier correction — *a client that used the nine colours and
nothing else* — still exactly true one level down. It was fixed at the palette
and left standing at the shape.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The furniture carries the design (Priority: P1) 🎯 MVP

Every screen is built from one shared component layer. Teaching that layer the
design's shape, depth and state vocabulary improves all sixteen screens at once,
and does it in one place rather than sixteen.

**Why this priority**: it is the largest visible change per unit of work, it
cannot be skipped by any later story, and doing it second would mean porting
sixteen screens twice. It is also the story that makes the type system readable
by shape, which is a gameplay-comprehension win and not only a cosmetic one.

**Independent Test**: open the component gallery at `#gallery` beside
`LMNTLZ Design System.dc.html` and `LMNTLZ Hero Card.dc.html` at 1600×900. Every
component's silhouette, elevation and lit state matches, with no screen touched.

**Acceptance Scenarios**:

1. **Given** a magic Force, **When** its badge renders, **Then** it is drawn as a
   shield; **and given** a martial Force, **Then** it is drawn as a chamfered
   plate — so family is distinguishable with colour removed.
2. **Given** a hero card for a champion whose bane is Light, **When** it renders,
   **Then** the relationship is carried by border treatment as the export draws
   it, not by a text label alone.
3. **Given** any raised surface, **When** it renders, **Then** it carries the
   export's elevation shadow and inset hairline rather than a flat 1px border.
4. **Given** an active or selected control, **When** it renders, **Then** it
   carries the export's glow, and an inactive one does not.
5. **Given** an empty seat, slot or list, **When** it renders, **Then** it uses
   the export's dashed placeholder treatment.

---

### User Story 2 - Every finished screen matches its design (Priority: P1)

Each of the sixteen built surfaces is redone against the export it was drawn
from, in the audit's own order.

**Why this priority**: this is the actual request. US1 makes it cheap; it does
not make it done, because each screen has composition, density and per-screen
treatments the shared layer cannot supply.

**Independent Test**: `py tools/design-audit.py` reports **zero absent
treatments**, and each screen is read beside its export at 1600×900 — same
regions, same hierarchy, same density, same states.

**Acceptance Scenarios**:

1. **Given** any built screen, **When** the audit runs, **Then** no treatment its
   export uses is absent from it.
2. **Given** every screen has been redone, **When** the Playwright suite runs,
   **Then** all 73 journeys pass unchanged — a re-skin that breaks a journey is a
   regression, not a port.
3. **Given** a screen whose export shows data the game does not have, **When** it
   is ported, **Then** the region is composed from real data or omitted, never
   filled with the export's invented values.

---

### User Story 3 - Champions have faces (Priority: P2)

The 27 hero illustrations exist and have never been on a screen. Thirteen of the
21 exports are composed around them.

**Why this priority**: it is the single most visible remaining difference after
US1 and US2, and it is deliberately third because it is the only story that needs
new tooling — the sources are 948×1659 PNGs totalling **68 MB**, which cannot
ship as they are.

**Independent Test**: the Roster, Codex and Hero Card render real portraits, and
the page weight stays within budget on a cold load.

**Acceptance Scenarios**:

1. **Given** the roster grid, **When** it loads, **Then** every champion shows
   its portrait at thumbnail size within the page's image budget.
2. **Given** a champion is studied, **When** the detail view opens, **Then** the
   full portrait renders with the export's gradient scrim, and the name and stats
   over it remain legible.
3. **Given** a portrait is missing or fails to load, **When** the card renders,
   **Then** it falls back to the champion's emblem rather than a broken image or
   an empty box.

---

### User Story 4 - The interface moves the way the design says (Priority: P3)

The exports specify transitions and eleven `@keyframes`. The client has none.

**Why this priority**: last because it is the least of the difference and the
most likely to be over-applied. It is in scope because "exactly the way they
should" includes it.

**Independent Test**: the specified motions play, and every one of them respects
`prefers-reduced-motion`.

**Acceptance Scenarios**:

1. **Given** a state change the export animates, **When** it occurs, **Then** the
   specified motion plays at the specified duration.
2. **Given** a viewer who has asked for reduced motion, **When** any animated
   element renders, **Then** the motion is suppressed and the end state is shown.

---

### Edge Cases

- **A shape that clips content.** `clip-path` removes pixels; a chamfered corner
  over text truncates it. Every clipped surface needs padding that keeps content
  inside the remaining area at the longest real string, not the fixture's.
- **A shape that eats a focus ring.** `clip-path` clips `outline` and
  `box-shadow` alike, so a chamfered control can silently lose the mandatory
  focus indicator. This is an accessibility regression that looks like nothing.
- **A glow that fails contrast.** A lit surface changes the effective background
  behind its text.
- **A portrait that has not loaded.** The layout must not reflow when it arrives.
- **A champion added later.** A missing portrait must fail the build the way a
  missing emblem already does, rather than rendering an empty frame.
- **An export that draws a screen we do not have** — Chat (014), News and
  Broadcast (016). Out of scope, named so the absence is deliberate.
- **An export whose data is wrong.** `LMNTLZ Guild Creation.dc.html` prices
  founding at ◈2,500; it costs 650. The look is authoritative and the numbers are
  not.

---

## Requirements *(mandatory)*

### Functional Requirements

**The shared layer (US1)**

- **FR-001**: The component layer MUST carry the exports' shape language, and a
  Force's **family MUST be distinguishable by silhouette alone**, without colour.
- **FR-002**: The component layer MUST carry the exports' depth vocabulary —
  elevation shadows, inset hairlines, and glows on live elements.
- **FR-003**: Empty and placeholder states MUST use the exports' dashed
  treatment rather than a solid border or nothing.
- **FR-004**: Every clipped surface MUST keep its content and its focus
  indicator fully visible.
- **FR-005**: The component gallery MUST render every new treatment, so the
  vocabulary is inspectable in one place without visiting sixteen screens.

**The screens (US2)**

- **FR-006**: Every built screen MUST use every treatment its export uses.
- **FR-007**: No pre-existing journey may break. Every Playwright test MUST pass
  unchanged.
- **FR-008**: No number, price, cap or threshold may enter the client from an
  export during this feature. Where a screen shows a value, it MUST come from
  served data, generated content or a rules constant.
- **FR-009**: No colour literal and no stock Tailwind palette class may be
  introduced. The nine Forces and the neutral ramp remain the only colours.
- **FR-010**: A region an export draws for data the game does not have MUST be
  omitted, never filled with the export's invented content.

**The art (US3)**

- **FR-011**: All 27 champion portraits MUST be usable in the client, at sizes
  appropriate to where they render.
- **FR-012**: Delivered image weight MUST stay within a stated per-screen budget;
  the 68 MB of sources MUST NOT ship as they are.
- **FR-013**: A missing or failed portrait MUST fall back to the champion's
  emblem without shifting the layout.
- **FR-014**: A champion without a portrait MUST fail the build, matching the
  guarantee emblems already have.

**Motion (US4)**

- **FR-015**: Motion the exports specify MUST play at the specified duration.
- **FR-016**: All motion MUST be suppressed under `prefers-reduced-motion`, with
  the end state shown.

**Across all four**

- **FR-017**: Text contrast MUST meet the standard 017 established, on every new
  treatment including over gradients and portraits.
- **FR-018**: No page may scroll horizontally at 1280 wide.
- **FR-019**: The audit MUST remain reproducible and MUST be extended rather than
  weakened if it proves too coarse.

### Key Entities

- **Treatment**: one visual property an export uses and a screen may or may not —
  a shape, a shadow, a gradient, a dashed border, a motion.
- **Export**: a generated design file. **Authoritative for look, never for data.**
- **Portrait**: a champion's full illustration, distinct from its **emblem**, the
  128×128 icon that already ships.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `py tools/design-audit.py` reports **0 absent treatments**, from 76.
- **SC-002**: A viewer shown a screen and its export side by side at 1600×900
  identifies no structural difference in regions, silhouette, elevation or
  density.
- **SC-003**: With colour removed, a player can tell a magic Force from a martial
  one by shape alone, on every surface that shows a type.
- **SC-004**: Every champion shows its own artwork on the roster, the codex and
  its hero card.
- **SC-005**: A cold load of the heaviest screen stays within the stated image
  budget, and the interface remains usable before any portrait has arrived.
- **SC-006**: All 73 Playwright journeys pass unchanged, and the full unit suite
  stays green.
- **SC-007**: Zero export-sourced numbers enter the client, verified by the
  existing transcription scan extended to the screens this feature touches.
- **SC-008**: Every interactive element keeps a visible focus indicator, on every
  new shape.
- **SC-009**: With reduced motion requested, no animation plays and no
  information is lost.

---

## Assumptions

- **"Exactly" means the design's vocabulary reproduced faithfully, not
  pixel-identical to a static mockup.** The exports are mockups over invented
  data; several contradict the rules on purpose. Look is authoritative, data is
  not — the standing rule in `CLAUDE.md`.
- **017's work is kept, not redone.** Tokens, type, the rail and the grid stay;
  this adds the layer 017 did not reach.
- **Desktop only.** Minimum 1280×720, target 1600×900, unchanged.
- **Unbuilt screens are out of scope** — Chat (014), News and Broadcast (016).
  They inherit the component layer whenever they are built.
- **The portraits are final art.** This feature converts and places them; it does
  not commission or edit artwork.
- **No server change is expected.** If a screen turns out to need a field the API
  does not serve — as the guild founding cost did in 017 — that is a small
  addition, not a redesign.
- **The two cover images and `feature.png` are marketing assets**, not screen
  art, and are out of scope.

## Dependencies

- **017 must stay landed.** Every story here builds on its component layer.
- **`tools/design-audit.py`** is the acceptance instrument and already exists.
- **`resources/design/images/`** holds the 27 portraits.
- **This feature blocks 014, 013's officer wiring and the hero-numbers pass**, by
  Jon's direction on 2026-07-31.

## Out of Scope

- New screens, new destinations, new gameplay.
- Rebalancing, re-pricing or any rules change.
- Mobile, touch or responsive reflow below 1280.
- Commissioning new artwork.
- The Steam build's store assets.
