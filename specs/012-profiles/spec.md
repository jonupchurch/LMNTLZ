# Feature Specification: Public Profiles & Data Export

**Feature Branch**: `012-profiles` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 12 of the LMNTLZ 1.0 set (`specs/README.md`). What one player can see about another, what a player can take away about themselves, and the identity they present.

---

## The organising rule

> **The profile is fixed.** A player chooses their name and avatar and nothing
> else about what is shown. Only **time zone and languages** may be hidden.

A configurable profile sounds friendlier and is worse here: every hidden field
becomes a signal, an opponent learns something from the *absence*, and the design
would spend its scouting mechanic on a privacy toggle nobody asked for.

**The single subtlest rule in this feature is that the battle record shown is the
last 20 *Visible* battles — selected that way, never filtered from a longer list.**
Filtering leaks the Hidden count three ways: a short list, a visible time gap, and
a total that does not reconcile. **An absence that can be measured is not an
absence.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player scouts an opponent honestly (Priority: P1)

Before attacking, a player looks at a potential opponent and learns what the game
intends them to learn — and nothing about the Hidden squad.

**Why this priority**: Scouting is how counter-building works, and this is the
surface it happens on.

**Independent Test**: View a profile whose recent battles include Hidden ones and
confirm the list is exactly 20 Visible battles with no measurable gap.

**Acceptance Scenarios**:

1. **Given** a public profile, **When** viewed, **Then** it shows the player's name, avatar, league, rating and guild.
2. **Given** a profile's battle record, **When** shown, **Then** it is the **last 20 Visible battles**, selected as such.
3. **Given** a player with many Hidden battles, **When** their profile is viewed, **Then** nothing in the list reveals **how many** Hidden battles occurred — no gap, no shortfall, no unreconciled count.
4. **Given** a profile, **When** viewed, **Then** the **Hidden squad's composition never appears**, in any form.
5. **Given** the fixed fields, **When** a player looks for privacy settings, **Then** only **time zone and languages** can be hidden.

---

### User Story 2 - A player takes their own data with them (Priority: P2)

A player exports everything the game knows about them, in a form they can open.

**Why this priority**: A reasonable expectation, cheap to honour when designed in,
and awkward to retrofit around a schema that assumed nobody would ask.

**Independent Test**: Export as a player and confirm completeness; export as a
guild officer and confirm the narrower scope.

**Acceptance Scenarios**:

1. **Given** a player, **When** they export their data, **Then** they receive **everything of their own**, including their Hidden battles.
2. **Given** any exported battle row, **When** examined, **Then** it carries **no squad composition — on either side**.
3. **Given** a guild officer, **When** they export, **Then** they receive **event data only**, not members' general activity.
4. **Given** an export, **When** produced, **Then** it is a plain tabular format a player can open without special software.

---

### User Story 3 - A player presents an identity they chose (Priority: P2)

A player picks an avatar and, if they wish, changes their name — with clear costs
and no way to present something harmful.

**Why this priority**: Identity is the only self-expression in a game where every
player owns the same 27 heroes.

**Independent Test**: Change a name and an avatar, confirming both prices and the
pre-moderation path.

**Acceptance Scenarios**:

1. **Given** a voluntary rename, **When** requested, **Then** it costs **325 shards**.
2. **Given** a forced rename, **When** applied by moderation, **Then** it is **free**.
3. **Given** a custom avatar, **When** purchased, **Then** it costs **$5 or 1,350 shards**, charged **per change** rather than once to unlock.
4. **Given** an uploaded avatar, **When** submitted, **Then** it is **not visible to anybody until a human approves it**.
5. **Given** an avatar decision, **When** made, **Then** the player is notified — approved, or rejected with a free resubmission.

---

### Edge Cases

- **A player with fewer than 20 Visible battles.** The list is short because they are new, not because anything was removed — and the two cases must not be distinguishable in a way that leaks.
- **A player whose recent activity is entirely Hidden.** Their visible list is older. This is the case filtering would expose through a time gap, and selection avoids.
- **An avatar approved then later judged unacceptable.** Removable, with a forced rename's free-resubmission treatment.
- **An export requested repeatedly.** Rate-limited, since it is a bulk read.
- **A guild officer exporting event data that includes a member who left.** Event participation is historical; departure does not erase what was contributed.
- **A dual-priced avatar** must be worse shards-per-dollar than the best boost pass, or it becomes the shard shop the design refuses to build.

## Requirements *(mandatory)*

**The public profile**

- **FR-001**: The public profile MUST show a fixed set of fields — name, avatar, league, rating, guild — with no per-field visibility controls.
- **FR-002**: **Time zone and languages** MUST be the only hideable fields.
- **FR-003**: The battle record MUST be the **last 20 Visible battles, selected as such** — never filtered from a longer list.
- **FR-004**: Nothing on a profile MAY reveal how many Hidden battles a player has fought.
- **FR-005**: A Hidden squad's composition MUST NOT appear on any profile.

**Export**

- **FR-006**: A player MUST be able to export **all of their own data**, including Hidden battles.
- **FR-007**: **No exported battle row MAY contain squad composition, for either side.**
- **FR-008**: A guild officer's export MUST be limited to **event data**.
- **FR-009**: Exports MUST be in a plain tabular format.
- **FR-010**: Export MUST be rate-limited.

**Identity**

- **FR-011**: A voluntary rename MUST cost **325 shards**; a forced rename MUST be free.
- **FR-012**: A custom avatar MUST cost **$5 or 1,350 shards**, charged **per change**.
- **FR-013**: A custom avatar MUST be **pre-moderated** — invisible to everyone until a human approves it.
- **FR-014**: The player MUST be notified of an avatar decision, with a **free resubmission** on rejection.
- **FR-015**: Any dual-priced item MUST offer worse shards-per-dollar than the best boost pass.

### Key Entities

- **Public profile** — the fixed view one player has of another.
- **Visible battle record** — the last 20 battles fought in the Visible zone.
- **Data export** — a tabular extract, scoped by who requested it.
- **Avatar** — a chosen image. Curated or, when custom, pre-moderated.

## Success Criteria *(mandatory)*

- **SC-001**: A Hidden squad's composition appears in **zero** profile views.
- **SC-002**: **No** observer can determine a player's Hidden battle count from their profile.
- **SC-003**: A player's own export contains **everything** about them.
- **SC-004**: **Zero** exported rows contain squad composition, either side.
- **SC-005**: A guild officer's export contains **no** non-event member activity.
- **SC-006**: **No** custom avatar is ever visible before human approval.
- **SC-007**: A forced rename costs the player **nothing**.
- **SC-008**: Every dual-priced item is worse value per dollar than the best pass.

## Assumptions

- **A fixed profile is a design choice, not a limitation.** Configurable visibility would make every hidden field a signal — and in a game where everyone owns the same 27 heroes, absence is information.
- **The 20-Visible rule must be a selection, not a filter.** This was identified as a leak with three separate tells and is the reason FR-003 is phrased as it is.
- **Aggregation is a privacy change even when every row is individually public**, which is why a guild officer's export is narrowed to event data. That narrowing also **decouples the export from profile visibility** — the two no longer constrain each other.
- **Dropping squad composition from both sides of an export beats adjudicating one side.** A conditional in that column eventually has a bug, and the bug leaks a Hidden squad.
- **Chat is text-only, which avoids the expensive half of moderation.** Custom avatars reintroduce image moderation deliberately, and the fee is what keeps the volume small enough for a human to handle — roughly a 20-second glance against a $5 charge.
- **Curated avatars need no review**; only custom uploads do.
- **A rename's cost is about volume, not funding.** Shards cost nothing to mint, so they cannot pay a moderator; what they do is make a rename a considered act.

## Dependencies

**Upstream**: 05 (`auth`) for identity and rename, 08 (`replays`) for the battle
record, 09 (`matchmaking`) for league and rating, 10 (`progression`) for shard
prices, 13 (`guilds`) for guild membership.

**Downstream**: 14 (`chat`) embeds profile data in looking-for-guild postings;
15 (`moderation`) issues forced renames and reviews avatars.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVII** | Storing is not exposing | **The whole feature.** FR-003 – FR-008. Everything here is *recorded*; this feature decides what leaves |
| **XVIII** | Harm is a gate, taste is a note | FR-013 — pre-moderation is a **harm** gate: a bad image seen by every opponent cannot be undone by a later removal |
| **XVI** | Cannot be backfilled | The export depends on records feature 08 must already carry |
| **XIX** | Vendors behind interfaces | FR-015 — the dual-price rule is a ratio, so it survives repricing |
