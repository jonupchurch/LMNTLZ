# Feature Specification: Roster & Squads

**Feature Branch**: `006-roster-and-squads` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 06 of the LMNTLZ 1.0 set (`specs/README.md`). Viewing all 27 heroes and allocating them across two defense zones and up to three attack squads — the decision layer the whole economy turns on.

---

## What this feature is really about

Every player owns the same 27 heroes from the start, so **nobody can out-roster
anybody**. The entire competitive surface is *allocation*: which twelve heroes you
commit to defense and therefore cannot attack with, and how you build three attack
squads out of the fifteen that remain.

> **A squad is always 6 heroes in a fixed 2 front · 3 middle · 1 back formation.**

Two commitments pull in opposite directions over the same 27 heroes, and that
tension is the design:

- **Defense heroes cannot attack.** No exceptions. This is the rule the economy
  turns on.
- **Editing a defense resets its hold streak** — a public number an attacker can
  see. So reclaiming a hero for offense costs a defensive reputation.

**Three offense squads drawn from fifteen heroes must overlap**, because 3 × 6
exceeds 15. That is deliberate, and it makes a single defensive swap capable of
invalidating all three at once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player allocates twelve heroes to defense (Priority: P1)

A player chooses six heroes for their Visible squad and six for their Hidden
squad, places each in the 2/3/1 formation, and understands that those twelve can
no longer attack.

**Why this priority**: Defense is half the game, runs without the player present,
and gates everything they can do on offense.

**Independent Test**: Assign twelve heroes across both zones and confirm exactly
fifteen remain available for offense.

**Acceptance Scenarios**:

1. **Given** the roster, **When** a player opens it, **Then** all **27 heroes are available** — no unlock state, no ownership, no collection meter.
2. **Given** a defense zone, **When** it is filled, **Then** it holds exactly **6 heroes in 2 front, 3 middle and 1 back**.
3. **Given** a hero assigned to either defense zone, **When** offense squads are built, **Then** that hero is **unavailable**, with no exceptions.
4. **Given** both zones filled, **When** the remaining pool is counted, **Then** exactly **15 heroes** remain for offense.
5. **Given** the Hidden zone, **When** any other player views this player, **Then** its composition is **never shown and never selectable**.

---

### User Story 2 - A player understands what a defensive change costs (Priority: P1)

A player pulls a hero off defense to use in an attack squad. Before it happens,
they are told plainly that the defense's hold streak resets and which attack
squads break.

**Why this priority**: Equal-first. Both consequences are non-obvious, both are
irreversible, and one swap can invalidate **all three** attack squads at once.

**Independent Test**: Move a hero used in all three offense squads onto defense
and confirm all three are invalidated and the warning names all three.

**Acceptance Scenarios**:

1. **Given** a hero in one or more saved offense squads, **When** it is moved onto a defense zone, **Then** it is **removed from every** such squad and each is **invalidated**.
2. **Given** an invalidated offense squad, **When** an attack is attempted with it, **Then** it is refused until refilled to six.
3. **Given** a hero in all three offense squads, **When** it is moved to defense, **Then** the warning names **all three** — the warning is designed for this case, not the single-squad case.
4. **Given** a defense squad with a hold streak, **When** the squad is edited, **Then** the streak **resets to zero**.
5. **Given** a player about to edit a defense squad, **When** the change is proposed, **Then** the streak reset is stated **before** they commit.

---

### User Story 3 - Three streaks, never conflated (Priority: P2)

A player sees one attack streak and two hold streaks, and understands that only
the attack streak affects ambush odds.

**Why this priority**: Three separate numbers that look alike. Conflating them
would break both the ambush mechanic and the scouting signal.

**Independent Test**: Win with each of the three offense squads in turn and
confirm one streak counting 3, unaffected by squad switching.

**Acceptance Scenarios**:

1. **Given** a player, **When** their streaks are read, **Then** there are exactly three — **one attack streak and one hold streak per defense zone**.
2. **Given** consecutive attack wins **using different offense squads**, **When** the attack streak is read, **Then** it counts them all — switching squads never resets it.
3. **Given** the ambush chance, **When** computed, **Then** only the **attack** streak feeds it, at **+2% per win, capped at 90%**.
4. **Given** a player at 45 consecutive wins, **When** the ambush chance is shown, **Then** it reads **90%** and never higher.
5. **Given** an ambush chance, **When** displayed, **Then** it is **always visible** to the player.
6. **Given** an ambushed loss, **When** it resolves, **Then** it does **not** reset the attack streak.

---

### User Story 4 - Scouting reveals a reputation, not a shape (Priority: P2)

An attacker looks at a potential target and sees their Visible squad in full,
plus how many times the Hidden squad has held — without learning anything about
what the Hidden squad contains.

**Why this priority**: This is what makes the Hidden zone a threat rather than a
blank. It also halves the information leak that comes from every player owning the
same heroes.

**Independent Test**: Scout a player and confirm the Hidden hold streak is present
while its composition is entirely absent.

**Acceptance Scenarios**:

1. **Given** a scouted player, **When** their defense is viewed, **Then** the **Visible squad is shown in full** and is the only squad selectable for attack.
2. **Given** the same view, **When** the Hidden zone is considered, **Then** its **hold streak is shown** and its composition is not.
3. **Given** a Hidden squad that has held nine times, **When** scouted, **Then** the count is honest and reveals nothing about its members.

---

### User Story 5 - Squad configuration carries defense behaviour (Priority: P3)

A player configures how each defending champion will act — its targeting rules and
power ranking — as part of building the squad.

**Why this priority**: The behaviour rules are specified in feature 04; this
feature provides the surface they are set on.

**Independent Test**: Configure a defending champion and confirm the settings
persist with the squad and are used when it is attacked.

**Acceptance Scenarios**:

1. **Given** a defending champion, **When** its row is shown, **Then** it offers its targeting pair and power ranking.
2. **Given** a champion owning a friendly power, **When** its row is shown, **Then** a **third** control appears; otherwise it does not.
3. **Given** a chosen power ranking, **When** set, **Then** the builder shows **which powers will actually fire**.
4. **Given** a champion left unconfigured, **When** the squad is saved, **Then** it receives its **role defaults**.

---

### Edge Cases

- **A defense zone left partly filled.** A zone short of six cannot defend; the player must be told rather than silently defending with five.
- **A reach-1 champion placed in the back seat.** It can reach no enemy at all. Permitted — *harm is a gate, taste is a note* — but warned about, since it is the one placement that renders a champion inert.
- **The same hero in all three offense squads.** Permitted and expected; overlap is forced by the arithmetic.
- **An offense squad invalidated mid-session** by a defensive change made in another window.
- **Editing a defense squad without actually changing it** — reordering to the same arrangement. Whether this resets the streak needs a consistent answer; the spec requires reset on *change*, not on *opening the editor*.
- **A player with no valid offense squad at all**, having committed too many heroes to defense.
- **Streak values.** Every one is **live-tunable and never a client constant**.

## Requirements *(mandatory)*

**The roster**

- **FR-001**: All **27 heroes** MUST be available to every player from account creation. No ownership, unlock, recruitment or collection state MAY exist.
- **FR-002**: The roster view MUST show each hero's assignment status and the player's remaining allocation.

**Squad shape**

- **FR-003**: Every squad MUST contain exactly **6 heroes** placed as **2 front, 3 middle, 1 back**.
- **FR-004**: A player MUST maintain exactly **two** defense squads — a Visible zone and a Hidden zone.
- **FR-005**: A player MAY save up to **three** offense squads.
- **FR-006**: Offense squads MAY share heroes with one another.

**Allocation**

- **FR-007**: A hero assigned to either defense zone MUST be unavailable for offense, without exception.
- **FR-008**: Moving a hero onto defense MUST remove it from every offense squad containing it and MUST invalidate each of those squads.
- **FR-009**: An invalidated offense squad MUST be unusable for attack until refilled to six.
- **FR-010**: The warning shown before a defensive change MUST name **every** offense squad it will invalidate.
- **FR-011**: A defense zone with fewer than six heroes MUST be reported as unable to defend.

**Streaks**

- **FR-012**: A player MUST carry exactly three streaks — one attack streak and one hold streak per defense zone.
- **FR-013**: The attack streak MUST be universal across all offense squads; switching squads MUST NOT reset it.
- **FR-014**: Editing a defense squad MUST reset that squad's hold streak, and the reset MUST be stated before the player commits.
- **FR-015**: Ambush chance MUST derive from the attack streak alone at **+2% per consecutive win, capped at 90%**, and MUST always be displayed.
- **FR-016**: An ambushed loss MUST NOT reset the attack streak.
- **FR-017**: All streak and ambush values MUST be server-supplied and live-tunable, never client constants.

**Visibility**

- **FR-018**: The Hidden squad's composition MUST NOT be shown to any other player, and MUST NOT be selectable as an attack target.
- **FR-019**: A scouted player MUST expose their Visible squad in full and both hold streaks.
- **FR-020**: A Hidden squad's hold streak MUST be visible while its composition is not.

**Defense configuration**

- **FR-021**: Each defending champion's row MUST offer its targeting pair and power ranking, and an ally rule only when it owns a friendly power.
- **FR-022**: The builder MUST show which powers will actually fire under the chosen ranking.
- **FR-023**: An unconfigured champion MUST receive its role defaults.

### Key Entities

- **Roster** — the 27 heroes, identical for every player, with per-player assignment state.
- **Defense squad** — six heroes in formation, a zone (Visible or Hidden), a hold streak, and per-champion behaviour configuration.
- **Offense squad** — six heroes in formation, plus a validity state.
- **Attack streak** — one per player, spanning all offense squads. The only input to ambush chance.
- **Hold streak** — one per defense squad. Public. Reset on edit.

## Success Criteria *(mandatory)*

- **SC-001**: Every player has access to **all 27 heroes** from their first session — zero collection mechanics exist.
- **SC-002**: Committing twelve heroes to defense leaves exactly **fifteen** for offense, always.
- **SC-003**: A defensive change that breaks three offense squads warns about **all three** before it happens.
- **SC-004**: A hold streak **never** survives an edit to its squad.
- **SC-005**: An attack streak **never** resets on switching offense squads.
- **SC-006**: Ambush chance is **always visible** and **never exceeds 90%**.
- **SC-007**: A Hidden squad's composition appears in **zero** views available to another player.
- **SC-008**: Every streak and ambush value can be changed **without shipping a client build**.
- **SC-009**: A player can never attack with a squad of fewer than six.

## Assumptions

- **Zone allocation is the player's call and is a testable commitment.** Neither zone may dominate; `02-squads.md` records this, and it rests on Hidden holding better than Visible. **If the hold rates converge, Visible wins both currencies and the choice collapses** — feature 08's recorded metadata is what will detect that.
- **Hidden battles pay more**, which is what makes a streak an asset being built toward rather than a liability being carried.
- **Exposing one zone halves the information leak.** Because every player owns the same 27, a revealed defense also reveals what is *not* available to attack with — 6 revealed rather than 12, leaving 21 unaccounted for.
- **Ambush is the sole route into a Hidden battle.** A Hidden squad is never directly selectable.
- **Behaviour configuration is specified in feature 04**; this feature owns only the surface it is set on.
- **Equipment is out of scope** — a deliberate fast-follower.

## Dependencies

**Upstream**: 01 (`content`), 02 (`sim-rules`) for reach validation, 04
(`defense-ai`) for the configuration model, 05 (`auth`) for the account.

**Downstream**: 07 (`battle`), 09 (`matchmaking`), 12 (`profiles`), 14 (`chat`)
for squad embeds.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVII** | Storing is not exposing | **The whole Hidden zone.** FR-018 – FR-020: the streak is stored *and* exposed; the composition is stored and never exposed |
| **XII** | Server authority | FR-017 — streak and ambush values are server-supplied, never client constants |
| **XVIII** | Harm is a gate, taste is a note | A reach-1 back-seat placement is **warned about, not blocked** |
| **XVI** | Cannot be backfilled | Zone allocation is a testable commitment; feature 08 must record zone on every battle to test it |
