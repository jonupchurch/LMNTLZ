# Feature Specification: Content Package

**Feature Branch**: `001-content-package` *(no branch — LMNTLZ works straight to `main`, per Constitution IX and Governance)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 01 of the LMNTLZ 1.0 set (`specs/README.md`). The 27-hero roster as validated, versioned data that every other feature consumes. Two authored fields per hero — `primary` and `secondary` — from which the entire relationship profile is derived and never hand-authored.

---

## Why this is feature 01

**It depends on nothing and everything depends on it.** The roster, the type
relationships and the effectiveness rules are the vocabulary every other feature
speaks. Specifying it first is not sequencing preference — a squad cannot be
validated, a battle cannot be resolved and a matchup cannot be previewed until
"what is a hero" has one answer.

**Constitution XV governs this feature directly**: *derived data is generated,
never authored.* Feature 01 is where that rule is either enforced structurally or
lost for good.

## User Scenarios & Testing *(mandatory)*

The actors here are the **designer** authoring the roster and the **consuming
features** (the simulation, squad building, the codex) that read it. Players never
touch this package directly — they experience it as matchups that behave the way
the game says they do.

### User Story 1 - An illegal hero cannot be created (Priority: P1)

A designer authors a hero by choosing its name, its **primary** type and its
**secondary** type, plus its stats, powers and reach. They never write down what
the hero is weak to. The system derives the hero's **bane** and **fault** from the
two types it was given, and **refuses outright** any type pairing that would make
the four slots collide.

**Why this priority**: This is the feature. Every other story depends on the
roster being well-formed, and a hand-authored weakness that drifts from its own
derivation is the exact defect Constitution XV exists to prevent — it cannot be
caught later by testing, because both values look plausible in isolation.

**Independent Test**: Attempt to author a hero at every one of the 72 possible
primary/secondary combinations. Exactly **60 are accepted and 12 are rejected**,
each rejection naming which of the three distinctness rules it broke.

**Acceptance Scenarios**:

1. **Given** a hero authored with primary `Earth` and secondary `Fire`, **When** the roster is validated, **Then** its bane is `Air` and its fault is `Water`, neither of which appeared in any source file.
2. **Given** a hero authored with primary `Earth` and secondary `Earth`, **When** the roster is validated, **Then** it is rejected because `secondary` equals `primary`.
3. **Given** a hero authored with primary `Earth` and secondary `Air`, **When** the roster is validated, **Then** it is rejected — `Air` is `counter(Earth)`, so the hero would be strong against its own bane.
4. **Given** a hero authored with primary `Slash` and secondary `Pierce`, **When** the roster is validated, **Then** it is rejected — `counter(Pierce)` is `Slash`, so the hero's fault would equal its own primary.
5. **Given** a hero authored with primary `Slash` and any melee secondary, **When** the roster is validated, **Then** it is rejected in all cases, leaving exactly the six magic types available.
6. **Given** any hero's `primary` is changed, **When** the roster is re-validated, **Then** its bane, its fault and every effectiveness result involving it update with **no other file edited**.

---

### User Story 2 - The simulation reads effectiveness rather than computing it (Priority: P1)

A consuming feature asks how effective an attacking type is against a given hero
and receives one of five multipliers. It never reimplements the counter
relationship, and there is no second place where that relationship is written
down.

**Why this priority**: Equal-first with Story 1, because Constitution XIII forbids
a second implementation of a rule. If effectiveness can be computed anywhere other
than from this package's data, two answers exist and they will eventually differ.

**Independent Test**: For all 27 heroes against all 9 attacking types (243
combinations), the returned multiplier matches the one derived from that hero's
authored pair — and no source file in the repository contains a literal
effectiveness table.

**Acceptance Scenarios**:

1. **Given** a defender whose primary is `Earth`, **When** attacked with `Air`, **Then** the multiplier is **×1.50** — `Air` is its bane.
2. **Given** a defender whose secondary is `Fire`, **When** attacked with `Water`, **Then** the multiplier is **×1.25** — `Water` is its fault.
3. **Given** a defender whose primary is `Earth`, **When** attacked with `Earth`, **Then** the multiplier is **×0.50**.
4. **Given** a defender whose secondary is `Fire`, **When** attacked with `Fire`, **Then** the multiplier is **×0.80**.
5. **Given** an attacking type matching none of the defender's four slots, **When** resolved, **Then** the multiplier is **×1.00**.
6. **Given** the counter relationship, **When** examined across all nine types, **Then** it is a bijection and **no pairing crosses the magic/melee boundary**.

---

### User Story 3 - A battle can be traced to the numbers that produced it (Priority: P2)

Every consumer can ask the package which version of the content it is holding, and
that answer is recorded on anything the content influenced.

**Why this priority**: Lower than P1 because the game runs without it — but
Constitution XVI makes it unbackfillable, so it ships with the first battle ever
recorded or never at all. It is P2 in urgency and P1 in deadline.

**Independent Test**: Change any hero's stats, and the reported content version
changes. A battle recorded before the change still names the earlier version.

**Acceptance Scenarios**:

1. **Given** a loaded roster, **When** a consumer asks for the content version, **Then** it receives an identifier distinct from the engine version.
2. **Given** the content changes, **When** the version is requested again, **Then** it differs from the previous value.

---

### User Story 4 - A designer tunes numbers without touching structure (Priority: P3)

Stats, power magnitudes and reach can be adjusted repeatedly without changing the
shape of the data or requiring any consuming feature to change.

**Why this priority**: The hero-numbers pass has not happened — current values are
a Role-shaped template (`CLAUDE.md`). This feature must ship the **schema and the
derivation** now and absorb the real values later without a second migration.

**Independent Test**: Replace every stat value in the roster; all consumers
continue to work unchanged and validation still passes.

**Acceptance Scenarios**:

1. **Given** the roster's structure is settled, **When** stat values change, **Then** no consuming feature requires modification.
2. **Given** a stat total exceeding its permitted budget, **When** validated, **Then** it is rejected with the hero and the offending stat named.

---

### Edge Cases

- **A stat exceeds the 75 cap.** Rejected at validation. Levelling has a measured budget of +10 on `Might` and `Speed` before a +20 rune overflows the cap, so the authored value must leave room.
- **A power's cooldown is authored as a fraction or a duration.** Rejected — cooldowns are **integer turn counts, never milliseconds** (`CLAUDE.md`).
- **A dual-typed power.** Takes the better of its two types; a mixed martial/arcane power answers the defender's *lower* mitigation stat. The deliberate consequence is that **no tier-4 or tier-5 power is ever resisted**.
- **Reach outside {1, 2}.** Rejected. Reach is measured in rows on one shared 1–6 axis and only those two values exist.
- **A hero references a power that does not exist**, or two heroes share a power name that should be unique. Rejected, naming both.
- **The roster does not contain exactly 27 heroes, or not exactly three per type.** Rejected — the roster shape is fixed, and every player has all 27.
- **Content fails validation at startup.** The game must refuse to start rather than discovering the problem mid-battle.

## Requirements *(mandatory)*

### Functional Requirements

**Authoring and derivation**

- **FR-001**: The package MUST accept exactly two authored type fields per hero — `primary` and `secondary` — and MUST NOT accept an authored bane, fault, or strength list.
- **FR-002**: The package MUST derive `bane = counter(primary)` and `fault = counter(secondary)` for every hero.
- **FR-003**: `counter` MUST be a bijection over all nine types that never crosses the magic/melee families: Earth↔Air, Fire↔Water, Light↔Dark, and Crush→Slash→Pierce→Crush.
- **FR-004**: Validation MUST reject any hero violating `secondary ≠ primary`, `counter(primary) ≠ secondary`, or `counter(secondary) ≠ primary`, naming the specific rule broken.
- **FR-005**: Exactly **60 of the 72** possible primary/secondary pairings MUST be accepted; the remaining 12 MUST be rejected.
- **FR-006**: Every melee-primary hero MUST carry a magic secondary. This is a *consequence* of FR-004 and MUST NOT be implemented as a separate rule.

**Effectiveness**

- **FR-007**: The package MUST expose the effectiveness of any attacking type against any hero, derived from that hero's authored pair, as one of five values: **×1.50** bane · **×1.25** fault · **×1.00** neutral · **×0.80** secondary · **×0.50** primary.
- **FR-008**: No effectiveness value MAY be hand-authored anywhere in the repository, including as a lookup table.
- **FR-009**: A dual-typed power MUST resolve as the better of its two types.

**Roster shape**

- **FR-010**: The roster MUST contain exactly 27 heroes — three per damage type across nine types.
- **FR-011**: Each hero MUST carry a stable identifier that survives a rename of its display name.
- **FR-012**: Each hero MUST carry base stats, a reach of 1 or 2, and its powers.
- **FR-013**: Power cooldowns MUST be integer turn counts. Any non-integer or time-based value MUST be rejected.
- **FR-014**: Stat values MUST be rejected when they exceed the 75 cap or violate the authored stat budget.

**Validation and versioning**

- **FR-015**: Validation MUST run before the game can start and MUST prevent startup on failure, rather than surfacing an invalid roster during play.
- **FR-016**: The package MUST expose a **content version** distinct from the engine version, changing whenever any hero data changes.
- **FR-017**: Every validation failure MUST name the hero and the field responsible.

### Key Entities

- **Damage Type** — one of nine. Belongs to the **magic** family (Earth, Air, Fire, Water, Light, Dark) or the **melee** family (Slash, Pierce, Crush). Families never mix under `counter`.
- **Counter relationship** — the bijection mapping each type to the one type that is super-effective against it. The single source of every weakness in the game.
- **Hero** — a champion. **Authored**: identifier, display name, primary type, secondary type, base stats, reach, powers. **Derived**: strengths, bane, fault. All 27 are unlocked for every player from the start, so the roster carries no ownership or unlock state.
- **Power** — a hero ability with a multiplier, an integer turn cooldown, and one or two types.
- **Content version** — the stamp identifying which roster produced a given outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Zero** hand-authored weakness values exist anywhere in the repository — every bane and fault in the game traces to the counter bijection.
- **SC-002**: Of the 72 possible type pairings, **exactly 60 validate and 12 are refused**, each refusal naming the rule it broke.
- **SC-003**: **All 27 heroes** validate against the derivation rule, and every melee-primary hero carries a magic secondary — 0 exceptions.
- **SC-004**: Changing one hero's primary type updates its weaknesses and every effectiveness result involving it, with **no second file edited**.
- **SC-005**: All **243** hero-versus-attacking-type effectiveness results resolve to one of exactly five multipliers, with no sixth value reachable.
- **SC-006**: An invalid roster **prevents the game from starting**; it is never discovered during a battle.
- **SC-007**: Every recorded battle can name the exact content version that produced it, distinct from the engine version.
- **SC-008**: A full replacement of every stat value requires **no change to any consuming feature**.

## Assumptions

- **Hero numbers are provisional and the schema is not.** The hero-numbers pass has not run; current stats are a Role-shaped template (`CLAUDE.md`). This feature delivers the structure, the derivation and the validation. Values land later without a second migration — which is what SC-008 protects.
- **Reach values are provisional.** `tools/build-hero-stats.py` marks reach *"proposed — not settled"*, and `resources/mechanics/02-squads.md` leaves it open. The schema requires reach because targeting cannot be validated without it; the specific per-hero values are expected to move.
- **Power magnitudes are provisional**, including the 33 unnumbered utility effects. Same treatment as stats.
- **`resources/characters/MATCHUPS.md` is the current roster of record** for names and type pairs — 27 heroes, already conforming to the derivation rule.
- **`tools/validate-matchups.ps1` is prior art, not the deliverable.** It already implements the derivation check against the markdown table. This feature moves that guarantee into the schema the game actually loads, so validation cannot be skipped by not running a script.
- **Nothing here is player-facing.** This package has no UI. Players experience it only as matchups behaving as documented.
- **Ownership and unlock state are out of scope** — all 27 heroes are unlocked from the start for every player, so no such fields exist.
- **Runic equipment is out of scope**, a deliberate fast-follower (`resources/mechanics/README.md`).

## Dependencies

**Upstream**: none. This is the root of the dependency graph.

**Downstream**: every other feature in `specs/README.md`. Features 02 (`sim-rules`)
and 03 (`sim-resolver`) cannot begin until this one's schema is settled.

## Constitution Notes

| # | Constraint | Bearing on this feature |
|---|---|---|
| **XV** | Derived data is generated, never authored | **The whole feature.** FR-001, FR-002, FR-008, SC-001 |
| **XIII** | One rules engine | Effectiveness is computed from this package alone; no second table |
| **XVI** | Cannot be backfilled | `contentVersion` (FR-016) ships with the first battle recorded |
| **XX** | Written docs are canon | Reach values proposed by a generated screen are **proposals**, not settled data |

## Outstanding Clarification

- **The authoring surface.** `resources/characters/hero-stats.xlsx` is currently *generated by* `tools/build-hero-stats.py` rather than read from — so no path exists today from a designer's edit to loadable content. See Question 1 below; this decides whether the package reads a spreadsheet through a build step or whether the spreadsheet is retired.
