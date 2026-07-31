# Feature Specification: The Design Port

**Feature Branch**: `017-design-port` *(no branch — straight to `main`)*

**Created**: 2026-07-30

**Status**: Draft

**Input**: Added after the 2026-07-28 scope lock. `resources/designsystem/` holds twenty finished screen exports the client has never consumed.

---

## TL;DR

The game has been built to work, not to look like itself. Twenty finished screen
designs have been sitting in `resources/designsystem/` since July and the client
uses almost none of them: it borrowed the nine colours and nothing else. This
feature makes the built product look like the designed product — **and it has to
happen before the last three features build their screens, or those screens get
built twice.**

---

## Why this is a feature and not a chore

Three things are true at once and only the third is an opinion.

**The designs were misread, including by the agent that built the client.**
`CLAUDE.md` and Constitution XX say a generated screen is *"look and feel only"*
and *"never a source of rules"*. That is a statement about **canon** — a number on
a screen never overrides a decision made in conversation. It was taken as a
statement about **status**, as though the exports were reference material one
consults if convenient. They are not. They are the designs.

**The gap is measurable and it is not small.**

| | Designed | In the client |
|---|---|---|
| Colour tokens | 9 forces × 3 stops + neutrals | ✅ **landed** (`base.css`) |
| Type families | Chakra Petch · Barlow · JetBrains Mono | ⚠️ **declared, never loaded** |
| Shared components | 13 sections, buttons in 7 states | ❌ **one** (`SiteFooter.tsx`) |
| Icons | 99 SVGs (28 hero, 71 status) | ❌ **zero referenced** |
| Screens | 20 exports | ❌ **0 ported**; ~5,000 lines of hand-rolled markup |

**And the debt compounds.** Every feature that ships another screen of private
Tailwind is another screen this feature has to unpick. 014's chat UI, 015's
moderation queue and 016's dispatches are all unbuilt. Landing the component layer
first makes them the *first consumers*; landing it after makes them three more
ports.

> ### The fonts are a live defect, not a design preference
>
> `apps/client/src/styles/base.css` declares `--font-display: 'Chakra Petch'`,
> `--font-sans: 'Barlow'` and `--font-mono: 'JetBrains Mono'`. There is no
> `@font-face`, no stylesheet link, and no `.woff2` in the repository. **Every
> screen ever shipped has rendered in `system-ui`.** The fallback chain is clean,
> so nothing errored, nothing logged, and no test failed — the same silence as
> every wiring defect in this project. `index.html` even carries the deferral in a
> comment: fonts get *"added with the first screen that needs them."* Every screen
> needed them. None triggered it.

## What the exports actually are

Not wireframes. Each is a complete screen: exact hex, exact spacing, hover states,
real content, and a `1280×760` shell that matches the settled desktop floor.

They are Claude Design output, so they carry that runtime's own conventions —
inline `style=` attributes with hex literals, a non-standard `style-hover=`
attribute, an `<x-dc>` wrapper and a `support.js` include. **Porting is therefore
mechanical**: map each hex to the CSS variable that already exists, turn
`style-hover` into a real hover state, drop the wrapper. It is transcription with
judgement, not design.

## The inventory

Twenty exports. Two are internal documents, two are the system itself, five design
screens for features with no client surface, and eleven target something that
exists today.

| Export | Feature | In the client today |
|---|---|---|
| **Design System** (163 KB) | — | the component layer, unbuilt |
| **Brand Book** | — | colours landed; type did not |
| Onboarding Flows | 005 | `LandingScreen`, `SignInPanel` |
| Roster | 006 | `RosterView` |
| Hero Card | 006 | *(no shared component)* |
| Battle | 007 | `BattleScreen` |
| Turn Sequence | 007 | `TurnQueue` |
| Matchmaking and Results | 009 | `AttackScreen`, `ScoutPanel` |
| Profile | 012 | `ProfileScreen`, `PublicProfile` |
| Battle Record | 012 | `BattleRecord` |
| Guild Roster | 013 | `GuildRoster` |
| Guild Admin | 013 | `GuildScreen` |
| Guild Creation | 013 | `EmblemDesigner`, `ApplicationForm` |
| **Codex** | 001 content | **nothing — built here (US5)** |
| Rune Forge | 010 | **nothing — 010 has no client surface at all** |
| Chat | 014 | **nothing** (in progress) |
| News · Broadcast Messages | 016 | **nothing** |
| Architecture · Architecture Chart | — | internal documents, not screens |

## The finding that makes this more than a re-skin

The Design System export specifies the app shell as a **fixed 220px left rail**,
and the rail it draws is not the navigation that exists:

```
designed   SQUADS · ROSTER 27 · MATCHMAKING · THE COURT · CODEX · DISPATCHES
           GUILD ▸ Roster · Chat · Administration
built      Squads · Attack · Profile · Guild          (top tabs)
```

Four differences, and each is a decision rather than a transcription:

1. **`ROSTER` is its own destination.** Today it is a panel inside `SquadsScreen`.
2. **`THE COURT` is a section, not a screen** — it holds profile, battle record,
   guild and chat. Established from the active-state colour; see below.
3. **`CODEX` has no feature.** It is a read-only view over content that already
   ships, and it joins this feature as US5.
4. **`DISPATCHES` is 016's news**, unbuilt — the only rail entry with no home.
5. **`Profile` is not a top-level entry** — it lives under `THE COURT`, and the
   username in the header is its shortcut.

**Porting the rail verbatim would ship navigation that goes nowhere**, which is
the project's most-repeated defect wearing its opposite face: not a seam with no
caller, but a caller with no seam.

> ### Resolved 2026-07-30 — the rail is adopted; dead entries are not
>
> **The designed rail replaces the top tabs, and lists only destinations that
> exist.** `ROSTER` splits out of `SQUADS` as drawn, the header carries the shard
> balance and the username, and profile hangs off the username rather than
> occupying a rail slot. Nothing in the navigation refuses a click.
>
> The standing instruction is *"things should look and feel like the mockups,
> whatever needs to happen for that"* — so the resolution is not to shrink the
> rail permanently but to **fill it wherever a mockup exists to fill it from**.
>
> **After the 2026-07-30 correction below, the rail is almost complete.** `CODEX`
> has a finished export and its data already ships, so it joins as US5.
> **`THE COURT` turns out to be a section over screens that already exist**, not a
> missing destination. Only `DISPATCHES` is genuinely absent, and 016 owns it —
> so the shipped rail is the designed rail minus one entry.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The game is written in its own hand (Priority: P1)

A player opens LMNTLZ and reads it in Chakra Petch and Barlow rather than in
whatever sans-serif their operating system defaults to.

**Why this priority**: It is the smallest slice in the feature and it improves
**every screen already built** without touching one of them. It is also a defect
fix: three tokens are declared and resolve to nothing.

**Independent Test**: Load any screen and inspect the computed `font-family` on a
heading, on body copy and on a stat readout. All three resolve to the intended
family, with the network disabled.

**Acceptance Scenarios**:

1. **Given** a fresh browser profile with no cache, **When** the client loads,
   **Then** headings render in Chakra Petch, body in Barlow, numeric readouts in
   JetBrains Mono.
2. **Given** a build running from the local filesystem with no network at all,
   **When** the client loads, **Then** the fonts still render — they are served
   from the bundle, never fetched from a third party.
3. **Given** a font file fails to load, **When** the client renders, **Then** the
   declared fallback chain applies and no layout shift larger than a line-height
   occurs.

---

### User Story 2 — There is one set of furniture, and every screen uses it (Priority: P1)

A player sees the same button, the same badge and the same meter behaving the same
way wherever they appear, because there is one of each.

**Why this priority**: It is the layer everything else in this feature and in
014/015/016 consumes. Building it after those features means porting their screens
twice.

**Independent Test**: A gallery surface renders every component in every state
specified by the Design System export. Reviewable side by side against the export
without running the game.

**Acceptance Scenarios**:

1. **Given** the gallery, **When** it renders, **Then** each of the seven button
   states is present and visually distinct.
2. **Given** any of the nine forces, **When** its type badge renders, **Then** its
   colour comes from the token for that force and never from a literal.
3. **Given** a hero, **When** the hero card renders at each of its three scales,
   **Then** all three carry the same data and differ only in density.
4. **Given** a keyboard user, **When** they tab through the gallery, **Then**
   every interactive component shows a visible focus ring.
5. **Given** a power on cooldown, **When** its slot renders, **Then** the ring
   shows a fill fraction over **turns remaining** and never animates against a
   clock.

---

### User Story 3 — The screens that exist look like their designs (Priority: P2)

A player moves between Squads, Roster, Matchmaking, Battle, Profile and Guild and
each one matches the screen that was designed for it.

**Why this priority**: The visible payoff, and the largest slice. It depends on
US1 and US2 and delivers nothing without them.

**Independent Test**: Each ported screen placed beside its export at 1600×900 — the
same regions, the same hierarchy, the same type ramp — and the feature's existing
end-to-end pass still green.

**Acceptance Scenarios**:

1. **Given** any ported screen, **When** its source is searched for colour
   literals, **Then** none are found outside the token definitions.
2. **Given** any ported screen, **When** it is rendered at the 1280 floor,
   **Then** it does not reflow into a single column and does not scroll
   horizontally.
3. **Given** every feature's existing Playwright pass, **When** it runs against
   the ported screens, **Then** it still passes — a re-skin that breaks a user
   journey is a regression, not a port.

---

### User Story 4 — Heroes and effects have faces (Priority: P2)

A player recognises a hero by its icon and reads a status effect from its badge
rather than from a word.

**Why this priority**: 99 authored assets are sitting unused, and the type/status
vocabulary is the game's core literacy. Independent of US3 — icons land in the
components from US2.

**Independent Test**: Assert every one of the 27 heroes resolves to a hero icon,
and every status effect the engine can emit resolves to a status icon. A missing
icon must be a build failure, not a silent blank.

**Acceptance Scenarios**:

1. **Given** all 27 heroes, **When** each is rendered, **Then** each shows its own
   icon and no two share one.
2. **Given** a status effect the engine can emit, **When** it is displayed,
   **Then** it has an icon; **and** if one is missing the build fails.

---

### User Story 5 — The Codex (Priority: P3)

A player clicks **CODEX** and reads the Laws of Aethrym and all twenty-seven
champions — the nine forces, the counter ring, and each hero's Bane and Fault.

**Why this priority**: Last, because it depends on the whole component layer — but
**in scope**, because it is the one missing rail entry that is a *port* rather than
a feature. `LMNTLZ Codex.dc.html` is a finished 72 KB screen, and everything it
displays already ships in `packages/content`, which the client already loads. It
needs a screen, not a backend.

**Independent Test**: Reachable from the rail, rendering all 27 heroes and all
nine forces from real content, matching its export.

**Acceptance Scenarios**:

1. **Given** the Codex, **When** a player opens any of the 27 heroes, **Then** its
   Bane and Fault are shown **as derived** — never as authored data
   (Constitution XV).
2. **Given** the Codex, **When** the counter ring is displayed, **Then** it comes
   from the generated bijection and cannot disagree with the engine.
3. **Given** the effectiveness table in the Codex, **When** it renders, **Then**
   every multiplier comes from the generated matrix — **not** from the numbers
   printed in the export (see the discrepancy below).
4. **Given** the rail, **When** it renders, **Then** every entry leads to a screen
   that exists.

> #### `THE COURT` is not a missing screen — corrected 2026-07-30
>
> **It is a rail *section*, and every screen under it already exists.** Each export
> marks exactly one rail entry active with a gold icon (`#F2C744`) against grey
> (`#3A3357`), and reading that state across the library settles it:
>
> | Export | Active entry |
> |---|---|
> | Roster | `ROSTER` |
> | Codex | `CODEX` |
> | News | `DISPATCHES` |
> | **Profile · Battle Record · Guild Roster · Guild Admin** | **`THE COURT`** |
>
> So the Court holds **profile, battle record, guild and chat** — the Chat export is
> titled *"THE COURT · CHAT"*, and Guild Creation's founding button reads *"FOUND
> THE COURT"*. It is the game's word for the social half, and a guild is a court.
> *Court-Champion* is a rank inside that vocabulary, not a place.
>
> **There is nothing to design and nothing to build.** The rail gains a `THE COURT`
> group whose children are three screens 017 already ports plus chat when 014 lands.
> This replaces the earlier reading that the Court was an undesigned destination.
>
> **`DISPATCHES` is 016's news**, needing authoring, publishing and an operator
> surface. That is a feature, and it is the only rail entry still without a home.

> #### ⚠️ The design library has the effectiveness ladder wrong, in four places
>
> Specifying this feature surfaced a real defect, and it is **systematic rather
> than a typo**. Every export that shows the ladder shows the same wrong one:
>
> | | The exports | Canon |
> |---|---|---|
> | Bane | ×1.5 | ×1.50 ✅ |
> | Fault | **×1.2** | **×1.25** |
> | Neutral | ×1.0 | ×1.00 ✅ |
> | Secondary | **absent** | **×0.80** |
> | Primary | ×0.5 | ×0.50 ✅ |
>
> `FAULT ×1.2` appears in **`Codex`, `Design System`, `Hero Card` and `Turn
> Sequence`**, and `Turn Sequence` states the collapse outright — *"either of the
> target's own Forces ×0.5"*, where canon distinguishes secondary from primary.
> **×0.80 occurs nowhere in the twenty exports.**
>
> Two consequences, and the second is the important one:
>
> 1. The **relationship strip and hero card must render five tiers**, not the four
>    they are drawn with. This is the single place the port deliberately departs
>    from the design, and it departs because canon wins (Constitution XX).
> 2. **FR-019 makes the class of defect unrepeatable.** Every multiplier a player
>    reads is taken from the generated matrix at render time, so a screen has no
>    number of its own and cannot drift from the engine again.
>
> Recorded in `resources/README.md` on 2026-07-30. The exports are **not**
> corrected — they are left to be regenerated.

---

### Edge Cases

- **A screen is ported and its feature later changes.** The component layer is the
  seam: a feature changing its data must not require re-porting its visuals.
- **The window is below the 1280 floor.** The floor is a scroll, not a reflow —
  already settled in `base.css` and must survive the port.
- **The viewer is above 2100px.** The export caps content at 1400 and centres it,
  with the rail pinned left.
- **A hero is added or renamed.** Icons are keyed by hero id; an unmatched id fails
  the build rather than rendering an empty box.
- **A colour appears in an export that has no token.** It is either a token that
  was missed or a one-off; it must be resolved as a token, never inlined.
- **An export contradicts a rule** — a wrong cap, an uncapped percentage, a stat
  that does not exist. The rule wins, the screen is wrong, and the discrepancy is
  recorded rather than fixed (Constitution XX).

## Requirements *(mandatory)*

### Functional Requirements

**Type and tokens**

- **FR-001**: The three declared type families MUST be served from the
  application's own bundle, so that a build running from disk with no network
  renders them.
- **FR-002**: Only the weights actually used MUST be shipped; every shipped weight
  MUST be referenced by at least one component.
- **FR-003**: Any colour, spacing, radius or motion value the exports specify MUST
  exist as a named token. Feature code MUST NOT contain colour literals.

**The component layer**

- **FR-004**: The system MUST provide reusable components covering every section
  of the Design System export: buttons in seven states, the nine-force type badge,
  the Bane/Fault relationship strip, the hero card at three scales, the power slot
  with cooldown ring and reach, meters, pills and the nine-type heat readout,
  inputs and forms, the app shell, and connection/system states.
- **FR-005**: Every component MUST be exercised in a gallery surface showing each
  of its states.
- **FR-006**: Every interactive component MUST show a visible focus ring on
  keyboard focus, and MUST NOT suppress it.
- **FR-007**: Components MUST derive force colours from the force, never accept a
  colour as input — colour must not become a second source of truth for a
  relationship (Constitution XV).
- **FR-008**: The cooldown ring MUST express a fraction of **turns remaining**.
  Nothing in the visual layer may imply elapsed real time (Constitution XIII).

**Icons**

- **FR-009**: All 27 hero icons MUST be wired, keyed by hero id.
- **FR-010**: Every status effect the engine can emit MUST resolve to an icon, and
  a missing one MUST fail the build rather than render blank.

**The screens**

- **FR-011**: Each of the eleven built surfaces listed in the inventory MUST be
  rebuilt against its export using the component layer.
- **FR-012**: Every existing end-to-end pass MUST still succeed after its screen is
  ported.
- **FR-013**: The 1280 floor MUST hold: no reflow to a single column, no horizontal
  page scroll.

**The shell and the Codex**

- **FR-014**: The app shell MUST present the designed left rail — fixed width,
  pinned left — replacing the current top tabs, with `ROSTER` as its own
  destination and the player's identity and shard balance in the header.
- **FR-015**: Navigation MUST NOT offer a destination that does not exist.
- **FR-016**: The Codex MUST present the Laws and all 27 champions, deriving every
  relationship and every multiplier from generated content.

**The guard**

- **FR-017**: No rule, number, cap, formula or threshold may enter the codebase
  from a `.dc.html`. Any value an export appears to settle is a **proposal to
  confirm**, and a confirmed one is written to `resources/mechanics/` first.
- **FR-018**: Where an export contradicts the rules, the discrepancy MUST be
  recorded in `resources/README.md`, and the export MUST NOT be rewritten to match.
  **One is already known and it spans four exports** — the effectiveness ladder.
  Where an export and canon disagree, the port follows **canon**.
- **FR-019**: Any multiplier, cap or threshold shown to a player MUST be read from
  the generated source at render time, never transcribed into the view. A number a
  player reads cannot be capable of disagreeing with the engine.

### Key Entities

- **Design token**: a named colour, type, spacing, radius or motion value. The
  single source for a visual constant.
- **Component**: one reusable piece of interface with a defined set of states.
- **Icon**: an SVG keyed by hero id or status effect id.
- **Screen port**: one built surface rebuilt against its export.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three declared type families render, including with no network.
- **SC-002**: Zero colour literals remain in feature code — the whole client reads
  from tokens.
- **SC-003**: Every one of the thirteen Design System sections has a component,
  and every component appears in the gallery in every state.
- **SC-004**: All 27 heroes and every emittable status effect resolve to an icon;
  a missing one fails the build.
- **SC-005**: All eleven built surfaces are ported, and every pre-existing
  end-to-end pass is still green.
- **SC-006**: Every interactive element is reachable by keyboard with a visible
  focus ring.
- **SC-007**: No page scrolls horizontally at 1280 and content stays centred and
  capped above 2100.
- **SC-008**: No number, cap or threshold entered the rules from an export during
  this feature — verifiable by the guard, and by the fact that
  `resources/mechanics/` is unchanged.
- **SC-009**: Every navigation destination offered leads to a screen that exists,
  and the rail is the designed rail.
- **SC-010**: Every multiplier a player can read matches the generated matrix
  exactly — **including the five-tier ladder the exports draw as four** — and
  changing the generated source changes the screen with no edit to the screen.

## Assumptions

- **The exports are the designs; the rules are canon.** These do not conflict —
  one governs appearance, the other governs behaviour.
- **Desktop only.** Mouse and keyboard, 1280×720 floor, 1600×900 target. Settled
  in `docs/tech-stack.md`; the port does not revisit it.
- **No Electron at 1.0.** The shell export describes a custom title bar and drag
  region that Electron owns and the browser build hides. The port builds the shell
  with that frame **absent**, leaving the slot rather than the implementation —
  consistent with building the Steam seams without running them.
- **Fonts are self-hosted, not fetched from a third party.** Already the stated
  intent in `index.html`, and required by the Steam build running from disk.
- **This feature adds no product scope.** It is a presentation layer over features
  already specified. `specs/README.md` locked scope on 2026-07-28 and Principle VII
  requires the initial set to be specified before any is implemented; 017 is added
  after that lock deliberately and is recorded here as such.
- **Four unbuilt designs stay unbuilt.** Rune Forge, Chat, News and Broadcast
  Messages are designs whose features own their construction; 017 gives them the
  layer to build on. **The Codex is the exception and is built here** (US5) — it
  has a finished export and needs no backend.
- **The Rune Forge is worth naming separately.** Feature 010 shipped a complete
  progression backend with **no client surface at all**, so runes — the game's
  entire permanent-progression system, and the thing 011 sells passes for — are
  currently unreachable by a player. It has a finished design. That is a real gap,
  it is **not** work for 017, and it wants its own decision.
- **`Architecture.dc.html` and `Architecture Chart.dc.html` are internal
  documents**, not screens, and are out of scope.

## Dependencies

- **Blocks the remaining client work in 014, 015 and 016.** Those three features
  build screens; they should build them on this layer.
- **Depends on nothing.** Every feature it re-skins is already built and deployed.
- **Constitution XX governs it directly**, and XV and XIII constrain it: derived
  data is generated, colour is not a second source of truth for a relationship,
  and cooldowns are turns rather than time.

## Resolved Questions

> **Q1 — How faithfully does the navigation port?** *(answered 2026-07-30)*
> **The designed rail is adopted, listing only destinations that exist.** `ROSTER`
> splits out of `SQUADS`; profile hangs off the username. `CODEX` joins the feature
> because it has an export and needs no backend; `THE COURT` has no export and
> `DISPATCHES` needs 016, so neither can be ported.

## Carried out of this feature

Named here so they are not lost, and **not folded in**:

| Item | Why it is not 017 | Owner |
|---|---|---|
| **The Rune Forge screen** | a new surface over 010's backend, not a re-skin | **[018 US1](../018-client-halves/spec.md)** |
| **Store · replay viewer** | same — new surfaces, not ports | **018 US2 · US3** |
| **DISPATCHES** | news needs authoring and an operator surface | 016 |
| **The effectiveness-ladder discrepancy** | recorded, never fixed in the exports (Constitution XX) | `resources/README.md` |
| ~~THE COURT~~ | **resolved — it is a section over existing screens, not a missing one** | 017 itself |
