# Feature Specification: Progression — Shards, Runes & Rating

**Feature Branch**: `010-progression` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 10 of the LMNTLZ 1.0 set (`specs/README.md`). What a player earns, what they spend it on, and how the ladder measures them — in a game where all 27 heroes are unlocked from the start, so progression cannot be roster power.

---

## The problem this feature solves

All 27 heroes are unlocked from day one and are identical for every player. **So
progression cannot be acquisition.** What a player accumulates is *rune
investment* — permanent, destroyed on replacement, and deliberately slow — and
what they demonstrate is *rating*, which measures whether they win with what they
have.

Three properties hold the whole economy together:

- **Rewards only. Nothing ever costs shards to attempt.** A loss pays nothing but
  never takes anything away; the sting of losing lives in the ladder, not the
  economy.
- **A hold pays half what an attack victory does.** At parity nearly half a
  player's income would arrive for doing nothing — passive income large enough
  that logging off competes with playing.
- **Rating converges rather than accumulating.** A strong player with two hours
  outranks a weaker one with twenty.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player earns and invests (Priority: P1)

A player wins battles, accumulates shards, and commits them to runes that
permanently improve a hero.

**Why this priority**: It is the entire progression loop.

**Independent Test**: Earn shards through each route and spend them through a full
rune, confirming payouts and costs.

**Acceptance Scenarios**:

1. **Given** an attack victory through a chosen door, **When** it resolves, **Then** it pays **20** shards; an **ambush** victory pays **40**.
2. **Given** a defensive hold, **When** it resolves, **Then** Visible pays **10** and Hidden pays **20**.
3. **Given** any loss, **When** it resolves, **Then** it pays **0** and **takes nothing away**.
4. **Given** a rune, **When** built, **Then** its four stages cost **150 · 150 · 150 · 200** for **650** total, granting **+20**, **+10**, **+5**, then a utility effect.
5. **Given** a hero, **When** its runes are considered, **Then** it has **three slots** — one typed to its primary, one to its secondary, one common.
6. **Given** planning, **When** a player arranges runes without committing, **Then** it is **free**; only committing costs.

---

### User Story 2 - Committing is permanent, and the player knows before they act (Priority: P1)

A player replacing a rune is told plainly that the existing one is destroyed, and
that changing what a rune *does* means rebuilding it from stage one.

**Why this priority**: Equal-first. Destruction on replacement is the load-bearing
rule of the whole economy, and it is the reason a nerf writes off real spend.

**Independent Test**: Attempt a replacement and confirm the warning, the
destruction, and that a rebuild is one transaction rather than four.

**Acceptance Scenarios**:

1. **Given** an occupied slot, **When** a rune is replaced, **Then** the existing rune is **destroyed** and its shards are not returned.
2. **Given** a replacement, **When** it is proposed, **Then** the player is told before committing.
3. **Given** a complete rune, **When** the player wants a different utility effect, **Then** it must be **destroyed and rebuilt from stage one** — no piecemeal change.
4. **Given** a rebuild, **When** executed, **Then** it is **one transaction**, not four.
5. **Given** the three boosts in one rune, **When** allocated, **Then** they **may stack on a single stat**, and the **75 cap is the only constraint**.

---

### User Story 3 - The ladder measures skill, not hours (Priority: P1)

A strong player who plays two hours a week places above a weaker player who plays
twenty.

**Why this priority**: The design's central thesis is that nobody can out-roster
anyone. A ladder that paid for volume would be the one part of the economy that
rewards grinding.

**Independent Test**: Simulate a strong low-volume player and a weak high-volume
one; confirm the ranking.

**Acceptance Scenarios**:

1. **Given** rating, **When** a player reaches their true level, **Then** it **stops moving** regardless of how much more they play.
2. **Given** the weekly ladder, **When** it pays out, **Then** it pays on **standing at the close of the week**, not on volume accumulated during it.
3. **Given** a player beating a much weaker opponent, **When** rating updates, **Then** it moves **almost nothing** — so farming one weak defender is not a strategy.
4. **Given** a new account, **When** it is created, **Then** it starts at **1000**, the same for everyone.
5. **Given** a player's first 30 rated battles, **When** rating updates, **Then** it moves fastest; movement slows at 31–200 and again past 200.
6. **Given** a Hidden victory, **When** rating updates, **Then** it is worth **double**; a loss costs the same in either zone.
7. **Given** gear, **When** rating is computed, **Then** gear is **not in it** — the two axes stay separate.

---

### User Story 4 - Income tapers within a day (Priority: P2)

A player's first victories of the day pay full; later ones pay less, so a long
session is worth playing but does not dominate.

**Why this priority**: This is what keeps a heavy player from out-earning a
typical one by their hours rather than their skill.

**Independent Test**: Play past the tier boundaries and confirm the payout curve.

**Acceptance Scenarios**:

1. **Given** a day's victories, **When** they are paid, **Then** the first tier pays full and later tiers pay progressively less.
2. **Given** the daily boundary, **When** it passes, **Then** the tier resets.
3. **Given** an ambush victory, **When** paid, **Then** the **2×** applies on top of the tier.

---

### User Story 5 - A balance never grows without limit (Priority: P2)

A player who saves without spending stops accumulating at ten runes' worth — but
never loses a prize they won.

**Why this priority**: An unbounded stockpile is the one quantity in the economy
with no ceiling at all. This is insurance placed before something later needs it
finite.

**Independent Test**: Reach the cap and confirm the three asymmetric behaviours.

**Acceptance Scenarios**:

1. **Given** a balance at **6,500** shards — ten full runes — **When** a battle is won, **Then** **battle income stops**.
2. **Given** the same balance, **When** a prize is granted, **Then** it **still lands** and may carry the balance above the cap.
3. **Given** the same balance, **When** a purchase would exceed the cap, **Then** the purchase is **refused**.
4. **Given** the cap, **When** shown to a player, **Then** it is expressed as **ten full runes**, not as a bare number.

---

### Edge Cases

- **A player hoarding to stay in a lower league.** Not a sandbag; gear score is recomputed on rune *placement*, so banked shards are not power.
- **A rune boost that would exceed the 75 cap.** Refused — and levelling has a measured budget of **+10** on `Might` and `Speed` before a +20 rune overflows it.
- **A player who wants half a rune back.** No refunds; commitment is the mechanic.
- **The 57 exact fills.** Stacking all three boosts on one stat lands precisely on 75 for 50 hero-stat pairs, and 20+10 does for 7 more. This is the most satisfying thing a rune can do and must not be forbidden by a distinct-stat rule.
- **A utility slot bought early.** Deliberately a bad buy early and a good buy late — the stage gate justifying itself economically.
- **Shards granted as compensation for a nerf.** Granted shards always land, which is what makes a compensating grant possible at all.
- **Convergence band values.** A starting point, not a decision; a simulated population settles them. The *shape* — one number, convergent, three decaying bands — is decided.

## Requirements *(mandatory)*

**Shards**

- **FR-001**: Attack victory MUST pay **20** shards through a chosen door and **40** through an ambush; a defensive hold MUST pay **10** Visible and **20** Hidden; a loss MUST pay **0**.
- **FR-002**: Nothing MAY ever deduct shards as a cost of attempting a battle.
- **FR-003**: Attack income MUST be tiered by the day's victory count, with later victories paying less, resetting daily.
- **FR-004**: The ambush multiplier MUST apply on top of the daily tier.

**Runes**

- **FR-005**: Each hero MUST have **three rune slots** — primary-typed, secondary-typed, and common.
- **FR-006**: A rune MUST have four stages costing **150 · 150 · 150 · 200**, granting **+20**, **+10**, **+5**, then a utility effect.
- **FR-007**: The three boosts MAY stack on one stat; the **75 cap MUST be the only constraint**.
- **FR-008**: Planning MUST be free; only committing MUST cost.
- **FR-009**: Replacing a rune MUST destroy the existing one with no refund, and the player MUST be told before committing.
- **FR-010**: Changing a completed rune's utility effect MUST require destroying and rebuilding from stage one, executed as **one transaction**.
- **FR-011**: The utility slot MUST be gated behind completion of the rune's boost stages.
- **FR-012**: A boost that would exceed the 75 cap MUST be refused.

**Balance cap**

- **FR-013**: A player's unspent balance MUST cap at **6,500** shards.
- **FR-014**: At the cap, **battle income MUST stop**.
- **FR-015**: At the cap, **granted shards MUST still land**, and MAY carry the balance above it.
- **FR-016**: At the cap, a purchase that would exceed it MUST be **refused**.
- **FR-017**: The cap MUST be presented as **ten full runes**.

**Rating**

- **FR-018**: Rating MUST be a **single visible number** that converges toward a player's level and stops.
- **FR-019**: Rating MUST NOT accumulate with volume.
- **FR-020**: Every account MUST start at **1000**.
- **FR-021**: Rating movement MUST decay across three bands — fastest for the first 30 rated battles, moderate through 200, slowest beyond.
- **FR-022**: A Hidden victory MUST be worth **double** rating; a loss MUST cost the same in either zone.
- **FR-023**: Gear MUST NOT be an input to rating.
- **FR-024**: Weekly ladder payouts MUST pay on **standing at the close**, never on volume.
- **FR-025**: Rating MUST order the matchmaking pool and MUST NOT restrict it.

### Key Entities

- **Shard balance** — a player's unspent currency. Capped, with three asymmetric behaviours at the cap.
- **Rune** — a permanent investment in one hero slot. Four stages, destroyed on replacement.
- **Rune slot** — one of three per hero, typed to primary, secondary, or common.
- **Utility effect** — the fourth stage, drawn from a pool determined by the slot's element.
- **Rating** — one convergent number per player, measuring skill only.
- **Daily victory tier** — the bracket determining an attack victory's payout.

## Success Criteria *(mandatory)*

- **SC-001**: A loss **never** reduces a player's shard balance.
- **SC-002**: Passive income — holds — is roughly **30%** of a typical player's shards, never approaching parity with attacking.
- **SC-003**: A strong player at two hours a week **outranks** a weaker player at twenty.
- **SC-004**: Beating a much weaker opponent moves rating **almost not at all**, so neither farming a weak defender nor grinding bots is a rating strategy.
- **SC-005**: A new account converges to near its true level within about **30 rated battles** — roughly a day and a half of typical play.
- **SC-006**: A player at the cap **never loses a prize** they won.
- **SC-007**: Rune investment is **never refunded**, and the player is warned every time.
- **SC-008**: Stacking all three boosts on one stat is possible, preserving the **57 exact fills** on the roster.
- **SC-009**: Gear appears in **zero** rating calculations.
- **SC-010**: Every economy value is **server-supplied and tunable without a client release**.

## Assumptions

- **Rune costs are settled; hero stat values are not.** The hero-numbers pass has not run.
- **Convergence bands are a starting point.** A simulated population settles the speed; the shape is decided.
- **The daily curve's exact tier boundaries are tuning**, though the shape — earlier victories pay more — is decided.
- **A hold paying half a win is load-bearing.** At parity, passive income reaches **47%** of a typical player's shards; at half it is **30%**.
- **Destruction on replacement is why a nerf writes off spend**, which is the origin of the balance-upward rule. **Granting shards to everybody** is the compensating mechanism, and FR-015 is what makes it possible at the cap.
- **The balance cap is insurance, not an exploit fix.** Hoarding was examined and dismissed. The cap exists because an unbounded stockpile is the one quantity with no ceiling, and equipment is the obvious future candidate to need one.
- **The 33 utility-effect magnitudes are unnumbered**, pending the numbers pass.
- **Purchasing is feature 11.** This feature owns what shards do, not how money becomes them — and **shards cannot be bought**.

## Dependencies

**Upstream**: 01 (`content`), 05 (`auth`), 07 (`battle`) for outcomes,
09 (`matchmaking`) for zone and league context.

**Downstream**: 09 consumes gear score and rating; 11 (`payments`) grants passes
that affect income; 13 (`guilds`) charges founding; 14 (`chat`) charges postings.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XIV** | Balance upward | **The origin of the rule.** FR-009's destruction on replacement is why a nerf writes off spend; FR-015 is what lets a compensating grant land |
| **XII** | Server authority | FR-025, SC-010 — every economy value is server-side and tunable |
| **XVI** | Cannot be backfilled | Rating and league at battle time are recorded by feature 08 |
| **XVIII** | Harm is a gate, taste is a note | FR-007 — stacking boosts on one stat is **allowed**; only the 75 cap constrains |
