# Feature Specification: Matchmaking, Leagues & Bots

**Feature Branch**: `009-matchmaking` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 09 of the LMNTLZ 1.0 set (`specs/README.md`). Who a player is offered as an opponent — leagues on gear, rating for order, curated bots, and the starter league.

---

## Two axes, and only one of them filters

| Axis | Measures | Mechanism | Does |
|---|---|---|---|
| **Gear** | how much rune investment a player carries | **Leagues** | **restricts** who is in the pool |
| **Skill** | whether they win with it | **Rating** | **orders** the pool, never restricts it |

They are separate deliberately. **Gear is knowable before a battle and changes
slowly; skill is only knowable from outcomes.** Collapsing them into one number
would treat a well-played weak account and a badly-played strong one as identical
— exactly the confusion the design avoids.

> **The pool is every defender.** Rating decides what a player sees *first*; it
> can never remove anybody. Only gear filters. The **starter league is the single
> carve-out**, and it is a carve-out rather than an exception to the principle.

**Nobody ever faces more than 1.67× their own gear**, and that bound is what makes
the whole thing defensible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player is offered a fair fight (Priority: P1)

A player opens matchmaking and sees opponents whose investment is comparable to
their own, ordered so the most interesting ones surface first.

**Why this priority**: It is the loop that feeds every other loop.

**Independent Test**: For any player at any score, confirm every offered opponent
falls inside the permitted gear bound.

**Acceptance Scenarios**:

1. **Given** a player's placed runes, **When** their gear score is computed, **Then** it is `2.5 × effective stat points` summed over every rune currently **placed**.
2. **Given** a gear score, **When** the league is determined, **Then** it falls in one of five bands on **fixed thresholds**, not population quintiles.
3. **Given** any offered opponent, **When** compared, **Then** the gear ratio never exceeds **1.67×**.
4. **Given** a set of candidate defenders, **When** they are ordered, **Then** rating orders them and **removes none**.
5. **Given** a player, **When** they view their standing, **Then** they see their league and score.

---

### User Story 2 - Gearing up never takes a league away (Priority: P1)

A player's league changes only when *they* place runes — never because other
people did.

**Why this priority**: Equal-first, and the reason thresholds are fixed. Demotion
for a *skill* rating is normal; for a *gear* rating it is maddening, because
nothing about that player changed.

**Independent Test**: Hold one player constant, advance the whole population, and
confirm their league and their matching mix are unchanged.

**Acceptance Scenarios**:

1. **Given** a player who places no runes, **When** the rest of the population gears up, **Then** their league is unchanged.
2. **Given** a player who places a rune, **When** their score is recomputed, **Then** it happens **on placement**, immediately.
3. **Given** score thresholds, **When** examined, **Then** they are fixed values, so score only rises and a league is never taken away.
4. **Given** a player's position within their league, **When** computed, **Then** it is measured against the **league's own score range**, never against the population.

---

### User Story 3 - League boundaries are a ramp, not a wall (Priority: P2)

A player near the top of their league starts meeting opponents from the league
above before they get there, so promotion is a gradient rather than a step change.

**Why this priority**: Without it, promotion is a cliff — a player crosses a
threshold and every opponent suddenly changes.

**Independent Test**: Sweep a player's score across a league and confirm the
opponent mix changes continuously.

**Acceptance Scenarios**:

1. **Given** a player between 10% and 90% of their league's range, **When** matched, **Then** every opponent comes from their own league.
2. **Given** a player at their league's ceiling, **When** matched, **Then** **50%** of opponents come from the league above.
3. **Given** a player at their league's floor, **When** matched, **Then** **50%** come from the league below.
4. **Given** the two end leagues, **When** matched, **Then** they bleed one way only — nothing exists above Diamond or below Bronze.
5. **Given** a sweep across a whole league, **When** the mix is plotted, **Then** it is **continuous** at both edges.

---

### User Story 4 - A thin league still gives a real fight (Priority: P2)

A player in a sparsely populated league is still offered opponents rather than an
empty screen — and the gear bound still holds.

**Why this priority**: Bots exist mainly for this. It is also where a guarantee
quietly breaks if bots are placed carelessly.

**Independent Test**: Reduce a league's live population to near zero and confirm
matching still works within the bound.

**Acceptance Scenarios**:

1. **Given** a thin league, **When** matching runs, **Then** curated bot defenders fill the pool.
2. **Given** bot placement, **When** examined, **Then** roughly **30%** sit in the starter league, with **20/20/20/10** across Bronze, Silver, Gold and Platinum.
3. **Given** Diamond, **When** its bots are examined, **Then** they are **hand-seeded only** — bots that were written, never bots that were needed.
4. **Given** bots within a league, **When** their ratings are examined, **Then** they are **spread across a band**, not pegged to the midpoint.
5. **Given** any battle against a bot, **When** it is recorded, **Then** the record marks the defender as a bot.

---

### User Story 5 - A new player's first week is survivable (Priority: P1)

A brand-new player spends their first week against authored opponents only, on
equal footing with every other newcomer, earning at an accelerated rate.

**Why this priority**: Every account starts here, and it is the single largest
lever on whether a new player reaches their second week.

**Independent Test**: Create an account and confirm bot-only opponents, dormant
defense, boosted income, and all four exits.

**Acceptance Scenarios**:

1. **Given** a new account, **When** it is matched, **Then** **every opponent is a bot** — no live players.
2. **Given** a starter-league player, **When** their defense is considered, **Then** it is **dormant** — nobody attacks them.
3. **Given** a starter-league player, **When** they win an attack, **Then** attack income is **×1.5**.
4. **Given** a starter-league player, **When** any of the four exits occurs — **7 days**, **3,250 shards**, **opting out**, or **joining or founding a guild** — **Then** they leave the starter league.
5. **Given** a player about to join or found a guild while in the starter league, **When** the action is offered, **Then** they are **warned first** that they lose beginner status **and** the ×1.5 bonus.
6. **Given** a player leaving the starter league, **When** they enter Bronze, **Then** they face at most **1.67×** their own gear, with bots padding Bronze so the bound holds when it is thin.

---

### Edge Cases

- **A player who hoards shards to stay in a lower league.** **Not a sandbag** — a sandbag exists only where score and power move by different amounts, and banked shards are not power until they are placed. This is why score is recomputed **on placement**.
- **Gear bounds gear, not skill.** A highly skilled player at low gear will beat their league. That is the rating axis doing its job, and it is not a matchmaking defect.
- **A starter player fighting ~140 battles in their week.** The starter pool must be deep enough that an authored ramp reads as a ramp rather than the same six opponents repeating.
- **An inactive account.** Leaves the pool, which thins Bronze most — where it hurts most, and where bots therefore matter most.
- **A defender who edits their squad after being offered.** The battle runs against the snapshot taken when it started.
- **Ambush.** Needs no rule here — the attack streak decides it, and the resulting battle is ordinary.
- **Diamond being the largest league.** Roughly a quarter of a mature population sits at the gear cap and those players are **genuinely identical**, so a crowd there is the correct outcome rather than a flaw.

## Requirements *(mandatory)*

**Gear and leagues**

- **FR-001**: Gear score MUST be `2.5 × effective stat points` over every rune currently **placed**, and MUST be recomputed **on placement**.
- **FR-002**: Banked shards MUST NOT contribute to gear score.
- **FR-003**: Leagues MUST use **fixed score thresholds**, never population quantiles.
- **FR-004**: A player's league MUST change only as a result of their own rune placement.
- **FR-005**: No player MAY be offered an opponent exceeding **1.67×** their own gear score.
- **FR-006**: A player MUST be able to see their own league and score.

**Bleed**

- **FR-007**: Position within a league MUST be computed against the league's own score range, not against the population.
- **FR-008**: Above 90% position, the chance of drawing from the league above MUST ramp to **50%** at the ceiling; below 10%, the chance of drawing from below MUST ramp to **50%** at the floor.
- **FR-009**: Between 10% and 90% the pool MUST be the player's own league only.
- **FR-010**: End leagues MUST bleed in one direction only.

**Pool and rating**

- **FR-011**: The pool MUST be every eligible defender. Rating MUST order it and MUST NOT remove anyone.
- **FR-012**: Inactive accounts MUST leave the pool.
- **FR-013**: Every battle MUST record whether the defender was a bot.

**Bots**

- **FR-014**: Curated bot defenders MUST fill thin leagues so the gear bound holds.
- **FR-015**: Bot distribution MUST be approximately **30%** starter league and **20/20/20/10** across Bronze, Silver, Gold and Platinum.
- **FR-016**: Diamond MUST receive **hand-seeded bots only**.
- **FR-017**: Bot ratings MUST be spread across a band rather than pegged to midpoints.
- **FR-018**: Bot squads MUST use the same defense configuration model as players.

**Starter league**

- **FR-019**: A new account MUST enter the starter league and MUST be offered **bot opponents only**.
- **FR-020**: A starter-league player's defense MUST be dormant.
- **FR-021**: Starter-league attack income MUST be **×1.5**.
- **FR-022**: A player MUST leave on any of: **7 days**, **3,250 shards earned**, **opting out**, or **joining or founding a guild**.
- **FR-023**: A player MUST be warned before an action that ends their starter status, naming **both** the loss of beginner status and the loss of the ×1.5 bonus.
- **FR-024**: No player in a guild MAY be in the starter league.

### Key Entities

- **Gear score** — a player's placed-rune investment. Recomputed on placement.
- **League** — a fixed score band. Determines the candidate pool.
- **Position** — where a player sits within their league's range, driving bleed.
- **Rating** — the skill axis. Orders candidates, filters nobody.
- **Bot defender** — an authored opponent with a fixed rating and a curated squad, distributed to keep leagues viable.
- **Starter-league membership** — a temporary state with its own pool, dormant defense, boosted income, and four exits.

## Success Criteria *(mandatory)*

- **SC-001**: **No player is ever offered an opponent above 1.67× their gear** — zero exceptions, including in a thin league.
- **SC-002**: A player who places no runes **never** changes league, regardless of what the population does.
- **SC-003**: The opponent mix is **continuous** across a league sweep — no step change at any threshold.
- **SC-004**: Rating removes **zero** candidates from any pool.
- **SC-005**: A starter player completes their week against **100% bot opponents** and is never attacked.
- **SC-006**: Every one of the **four** starter-league exits works, and each is warned about where it is a side effect of another action.
- **SC-007**: A player leaving the starter league enters Bronze inside the **1.67×** bound even when Bronze is thin.
- **SC-008**: Every battle record identifies whether the defender was a bot, so bots can be excluded from any aggregate.
- **SC-009**: Hoarding shards produces **no** matchmaking advantage.

## Assumptions

- **Bot counts are a launch-tuning number.** The distribution is settled; the absolute total wants a real population. One floor: a starter player fights roughly **140 battles** in their week, so the starter pool must be deep enough that an authored ramp reads as a ramp.
- **Only 11% of the starter league's ×1.5 is a real head start**; the rest corrects for dormant defense, which would otherwise leave a newcomer earning less than a normal player.
- **League population shares are simulated**, over 20,000 accounts with exponential tenure and 20% pass holders. Diamond at ~31% is expected and correct.
- **Curated bots are a balance lever the rest of the design lacks** — an additive one that moves the meta without touching a number, which matters under the no-nerf rule.
- **Bots are scaffolding, not furniture**: they exist to keep leagues viable and are expected to matter less as the population grows.
- **A fixed bot rating makes them calibration anchors**, which is why their ratings are authored rather than earned.
- **Ambush needs no matchmaking rule.** The attack streak decides it; the battle is otherwise ordinary.
- **Rating itself is specified in `06-progression.md`** and consumed here.

## Dependencies

**Upstream**: 06 (`roster-and-squads`) for defenses and the attack streak,
10 (`progression`) for rating and rune placement, 04 (`defense-ai`) for bot
behaviour.

**Downstream**: 07 (`battle`) receives the opponent; 08 (`replays`) records league
and rating at the time; 13 (`guilds`) triggers a starter-league exit.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVI** | Cannot be backfilled | FR-013 — the bot flag, and league/rating at battle time |
| **XIV** | Balance upward | Curated bots are the additive lever; FR-014 – FR-017 are how the meta moves without a nerf |
| **XII** | Server authority | Pool selection and bleed are server-side; a client cannot choose its own opponents |
| **XVIII** | Harm is a gate, taste is a note | FR-023 — a starter player is **warned**, never blocked, from joining a guild |
