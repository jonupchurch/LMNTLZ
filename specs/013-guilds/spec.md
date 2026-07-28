# Feature Specification: Guilds

**Feature Branch**: `013-guilds` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 13 of the LMNTLZ 1.0 set (`specs/README.md`). Founding, joining, leaving and running a guild of up to 24 players. Events, Wings and guild funds are deferred with their design.

---

## Scope, and what is deliberately absent

A guild is **up to 24 players**. At 1.0 it is a social and organisational
structure: a roster, three roles, an emblem, a recruiting pitch, and a message of
the day.

> **Wings, events and guild funds are deferred.** A **Wing** exists only for an
> event, so deferring events defers Wings — they are not separable. Guilds ship
> without anything to compete in yet.

**Guilds still matter at 1.0 for a reason that has nothing to do with events:**
joining or founding one is **two of the four exits from the starter league**, so
guilds are load-bearing on the new-player path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player founds a guild (Priority: P1)

A player pays, names their guild, designs an emblem, writes a recruiting pitch,
and starts inviting.

**Why this priority**: Nothing else in the feature exists until a guild does.

**Independent Test**: Found a guild and confirm the charge, the permanence of the
name, and that the founder holds the master role.

**Acceptance Scenarios**:

1. **Given** a player with sufficient shards, **When** they found a guild, **Then** it costs **650 shards** — one full rune — and they become its **Guild Master**.
2. **Given** founding, **When** it completes, **Then** the fee is **non-refundable on disband**.
3. **Given** a guild name, **When** chosen, **Then** it is **permanent** — changeable only by a moderation-forced rename.
4. **Given** the emblem designer, **When** used, **Then** it offers **36 icons** (one blank), **12 inks** and **12 grounds**.
5. **Given** a low-contrast emblem combination, **When** chosen, **Then** the player is **warned and allowed to proceed** — a solid block of colour is a permitted choice.
6. **Given** a player in the starter league, **When** they found a guild, **Then** they are **warned first** and then leave the starter league.

---

### User Story 2 - A player joins a guild (Priority: P1)

A player applies to several guilds, or accepts an invitation, and ends up in
exactly one — with the rules stated where the decision is actually made.

**Why this priority**: Equal-first. This is how a new player finds people, and it
is where the starter-league warning must appear or be lost.

**Independent Test**: Apply to several guilds, have one accept, and confirm the
others are withdrawn automatically.

**Acceptance Scenarios**:

1. **Given** applications, **When** sent, **Then** they are **free** and capped at **5 concurrent**, shown as a budget rather than discovered as an error.
2. **Given** several open applications, **When** one is accepted, **Then** the player joins and **all others are withdrawn**.
3. **Given** the application screen, **When** shown, **Then** it states the **first-acceptance-wins** contract at the point of applying.
4. **Given** an invitation, **When** accepted, **Then** the player joins **immediately** — they are the one being asked, so their yes is the decision.
5. **Given** an invitation, **When** several are held, **Then** accepting one **withdraws the rest**, stated plainly.
6. **Given** a dismissed application, **When** shown, **Then** it reads as dismissed rather than vanishing, with a **24-hour cooldown** before reapplying to that guild.
7. **Given** a starter-league player, **When** they receive an invitation **or** submit an application, **Then** they are warned that they lose **beginner status and the ×1.5 bonus**.
8. **Given** a guild at 24 members, **When** anyone tries to join, **Then** it is refused.

---

### User Story 3 - A guild runs itself (Priority: P2)

A master delegates to officers, who can recruit and manage the roster without
being able to dissolve what they did not build.

**Why this priority**: A guild whose every action needs one person is a guild that
stops when that person does.

**Independent Test**: Exercise each permission at each role and confirm the
boundaries.

**Acceptance Scenarios**:

1. **Given** roles, **When** examined, **Then** there are exactly three — **one Guild Master**, **at most 3 Officers**, and Members.
2. **Given** an officer, **When** they act, **Then** they may invite, review applications and remove members, but may not disband the guild or change its stored identity beyond what the permission table allows.
3. **Given** `/motd`, **When** used by a master or officer, **Then** it sets a **pin** rather than sending a message, announces in guild chat only, and produces a **login notice** for members who have not seen it.
4. **Given** a recruiting pitch, **When** edited, **Then** it is a **stored guild property** validated for length, not text typed per posting.

---

### User Story 4 - An absent master does not freeze a guild (Priority: P2)

A guild whose master stopped playing can continue, without letting anyone seize a
guild from someone on holiday.

**Why this priority**: The failure mode is a dead guild nobody can fix, and the
opposite failure — a hostile takeover — is worse.

**Independent Test**: Run the full succession timeline and confirm both outcomes —
master returns, and master does not.

**Acceptance Scenarios**:

1. **Given** a master inactive for **14 days**, **When** an officer requests succession, **Then** the request is accepted for processing.
2. **Given** an accepted request, **When** it is processed, **Then** **we email the master** and give them **7 days**.
3. **Given** the master **logging in** within those 7 days, **When** they do, **Then** the request lapses — **presence is the reply**, so the email needs no clickable action.
4. **Given** 7 days passing with no return, **When** succession completes, **Then** the requesting officer becomes master, **pays 650 shards**, and the **former master is refunded 650**.
5. **Given** a requester who cannot afford 650, **When** they request, **Then** they cannot.
6. **Given** a completed succession, **When** the former master returns, **Then** they are a **Member** of the guild, not removed from it.

---

### Edge Cases

- **A brand-new guild with one member.** Considered **active for 14 days regardless of headcount**, so a newborn guild is not starved by an activity gate. This is a definition change, not an exception.
- **A player leaving and rejoining repeatedly.** Governed by the same caps and cooldowns as any other join.
- **The last member leaving.** A guild with no members is dissolved; the founding fee is not returned.
- **A guild name judged unacceptable.** The one case where a permanent name changes, handled as a free forced rename.
- **A master who wants to hand over voluntarily.** Distinct from succession — no timers, no fee movement.
- **A guild disbanding with a paid-up master.** The 650 is **not** refunded; succession refunds where disbanding does not, and the rule is *a guild costs 650 to hold*, not *you get your money back*.
- **An officer removed while holding applications under review.** Applications survive the reviewer.

## Requirements *(mandatory)*

**Founding and identity**

- **FR-001**: Founding a guild MUST cost **650 shards**, non-refundable on disband.
- **FR-002**: A guild name MUST be permanent, changeable only by a moderation-forced rename, which MUST be free.
- **FR-003**: The emblem MUST offer **36 icons** including one blank, **12 inks** and **12 grounds**, with palettes chosen so illegibility is unreachable by accident.
- **FR-004**: A low-contrast emblem MUST produce a **warning, never a block**.
- **FR-005**: A guild MUST hold at most **24** members.
- **FR-006**: There MUST be **no guild tag** — no short abbreviation displayed beside a player's name.
- **FR-007**: The recruiting pitch MUST be a stored guild property validated for length.

**Membership**

- **FR-008**: Applications MUST be free and capped at **5 concurrent**, shown as a budget.
- **FR-009**: Applications MUST expire after **7 days**.
- **FR-010**: The **first acceptance wins**; all other open applications MUST be withdrawn automatically.
- **FR-011**: The first-acceptance contract MUST be stated **where a player applies**.
- **FR-012**: Accepting an invitation MUST join immediately, with no second confirmation.
- **FR-013**: Accepting one invitation MUST withdraw the others, stated plainly.
- **FR-014**: A dismissed application MUST be shown as dismissed, with a **24-hour cooldown** before reapplying to that guild.
- **FR-015**: A starter-league player MUST be warned **on both doors** — receiving an invitation and submitting an application — naming the loss of **beginner status** and the **×1.5 bonus**.
- **FR-016**: No player in a guild MAY remain in the starter league.

**Roles**

- **FR-017**: There MUST be exactly three roles — one **Guild Master**, at most **3 Officers**, and Members.
- **FR-018**: Permissions MUST follow a stated table; officers MUST NOT be able to disband the guild.
- **FR-019**: `/motd` MUST set a **pin**, usable by master and officers, announcing in guild chat only, plus a **login notice** derived from a last-seen comparison.

**Succession**

- **FR-020**: Succession MUST be **requested, not claimed**, and only after the master has been inactive **14 days**.
- **FR-021**: On request, the master MUST be emailed and given **7 days**.
- **FR-022**: The master **logging in** MUST lapse the request. The email MUST contain no link that grants anything.
- **FR-023**: On completion the requester MUST pay **650 shards** and the former master MUST be refunded **650**.
- **FR-024**: A requester unable to afford 650 MUST NOT be able to request.
- **FR-025**: A displaced master MUST remain a **Member**.

**Activity**

- **FR-026**: A guild MUST be **considered active for 14 days from founding regardless of headcount**.
- **FR-027**: Guild activity MUST be defined by member activity within a stated window, and MUST NOT depend on *when* a member plays.

### Key Entities

- **Guild** — name (permanent), emblem, recruiting pitch, message of the day, roster, activity state.
- **Membership** — a player's place in a guild and their role.
- **Application** — a free, expiring request to join. Concurrent, first-acceptance-wins.
- **Invitation** — an offer to join, expiring, accepted immediately.
- **Succession request** — an officer's petition against an inactive master, with a timer and a fee transfer.

## Success Criteria *(mandatory)*

- **SC-001**: A player accepted by one guild has **zero** remaining open applications.
- **SC-002**: A starter-league player is warned on **both** doors — 100% of the time — naming **both** losses.
- **SC-003**: **No** guild exceeds 24 members.
- **SC-004**: An emblem choice is **never blocked** for contrast.
- **SC-005**: A master who logs in within the window **never** loses their guild.
- **SC-006**: A completed succession is **economically neutral** — 650 moves from one player to another and nothing is created or destroyed.
- **SC-007**: A newly founded guild is **never** dissolved for inactivity inside its first 14 days.
- **SC-008**: A guild's activity state does **not** change based on what hours its members play.

## Assumptions

- **Events, Wings and guild funds are deferred with their design.** Guilds ship as a social structure; nothing here depends on an event existing.
- **Guild funds do not exist at 1.0**, so a newly founded guild cannot advertise using them. Feature 14's free daily posting credits are what makes recruiting possible without them.
- **The succession fee is not revenue.** It prices a manual support ticket, makes the displaced master whole, and is economically neutral overall. *Losing a guild you abandoned is not the same as being robbed.*
- **Succession refunds where disbanding does not**, and the difference is intentional: the rule is *a guild costs 650 to hold*, not *you get your money back*.
- **A permanent name is not a trap**, because founding a new guild is always available for 650 — you simply start over with no history.
- **No guild tag**, because three characters cannot be read in context and compression is exactly what defeats a blocklist.
- **The activity window is social only.** When a player plays has no bearing on what they contribute.

## Dependencies

**Upstream**: 05 (`auth`), 10 (`progression`) for the 650 charge, 09
(`matchmaking`) for the starter-league exit, 14 (`chat`) for guild chat and
`/motd`, transactional email for succession notices.

**Downstream**: 12 (`profiles`) shows guild membership; 14 (`chat`) scopes guild
chat and Guild Ads; 15 (`moderation`) issues forced renames.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVIII** | Harm is a gate, taste is a note | FR-004 — contrast **warns and never blocks**; a solid colour block is a permitted choice |
| **XIX** | Vendors behind interfaces | FR-021 — the succession email goes through the sender interface, and FR-022 keeps it link-free and phishing-resistant by construction |
| **XVII** | Storing is not exposing | Guild membership is public; application history is not |
| **XII** | Server authority | Role permissions are enforced server-side, never by hiding a control |
