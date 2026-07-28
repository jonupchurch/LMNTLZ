# Feature Specification: Defense AI

**Feature Branch**: `004-defense-ai` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 04 of the LMNTLZ 1.0 set (`specs/README.md`). The engine plays *every* defense squad in the game — the defensive half of a game whose offense is player-driven.

---

## What this feature actually is

> **A defender configures the AI rather than watching it. The squad is the plan;
> the engine is the executor.**

The whole configurable surface is **two ordered lists per champion** — a *pair* of
targeting rules and a *ranking* of its six powers — plus a third control on the
minority of champions that own a friendly power. Nothing else.

That small surface produces roughly **1.9 × 10¹⁴** behavioural combinations at
squad level, which is what stops every defense in the game feeling like the same
opponent.

**The load-bearing hazard is that a ranking can silently switch powers off.** A
power fires only when everything above it is on cooldown, and the tier-0
auto-attack has cooldown 0 and no gate — so anything ranked below tier 0 **never
fires at all.** Across all 720 orderings on all 27 heroes, **only 3% keep a whole
kit working.** Handled well this is the deepest lever in the game; handled badly
it is a trap that quietly halves a player's defense and never tells them why.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A defense behaves the way its builder intended (Priority: P1)

A player sets each champion's targeting rules and power ranking. When someone
attacks that squad, the engine plays it exactly as configured — and two squads
built from the same six heroes fight completely differently.

**Why this priority**: This is the feature. Defense is half the game and the
player never watches it, so the configuration *is* their participation.

**Independent Test**: Configure two squads with identical heroes and different
rules; confirm their behaviour diverges under the same attack.

**Acceptance Scenarios**:

1. **Given** a champion with a primary and fallback targeting rule, **When** its turn comes, **Then** it applies the primary, then the fallback for anything still tied, then an engine tiebreak.
2. **Given** a champion's power ranking, **When** its turn comes, **Then** it fires the **highest-ranked power that is off cooldown and past its tier gate**.
3. **Given** tier gates, **When** a battle begins, **Then** tier 4 is unavailable until turn 3 and tier 5 until turn 5.
4. **Given** two squads of the same six heroes with different configurations, **When** each is attacked identically, **Then** they behave differently.
5. **Given** the Visible zone and the Hidden zone, **When** each is played, **Then** the engine plays them **identically** — the distinction is visibility and reward, never behaviour.

---

### User Story 2 - The builder shows which powers will actually fire (Priority: P1)

A player reorders a champion's powers and immediately sees that two of them will
now never fire. They reorder again and see the whole kit come back.

**Why this priority**: Equal-first, and the single most important thing this
feature must get right. **Only 3% of orderings keep all six powers live.** Without
this feedback a player disables half their kit casually and never learns why their
defense underperforms — the difference between a lever and a trap.

**Independent Test**: For any hero and any ordering, the builder's prediction of
which powers fire matches what the engine actually does over a long battle.

**Acceptance Scenarios**:

1. **Given** any power ranking, **When** it is set, **Then** the builder shows which of the six powers will actually fire.
2. **Given** a ranking placing tier 0 anywhere but last, **When** shown, **Then** every power below tier 0 is indicated as never firing.
3. **Given** a ranking of cheap powers first, **When** shown, **Then** the starved expensive powers are indicated — availability scales with `1/(cooldown+1)`, so tier 1 on top can drive both ultimates to zero.
4. **Given** the builder's prediction, **When** compared against a long simulated battle, **Then** they agree.

---

### User Story 3 - An unconfigured defense is competent, not incoherent (Priority: P1)

A brand-new player who has never opened the defense controls still fields a squad
that fights sensibly.

**Why this priority**: Every new account starts here, and the starter league is
built around new players surviving their first week. A default that fell to random
would make the on-ramp meaningless.

**Independent Test**: Save a squad without touching any control; confirm every
champion has role-derived defaults and that no default switches off a power.

**Acceptance Scenarios**:

1. **Given** a squad saved with no explicit configuration, **When** it fights, **Then** each champion uses its **role's** default targeting pair and power ranking.
2. **Given** any role default ranking, **When** examined, **Then** it comes from the **12 orderings that are safe for all 27 heroes** — every one of which ends `1·0`.
3. **Given** any explicit player selection, **When** saved, **Then** it overrides the default.
4. **Given** the engine resolving a tie after both targeting rules, **When** it chooses, **Then** randomness is a **last-resort tiebreak**, never a default strategy.

---

### User Story 4 - Priority never breaks targeting (Priority: P2)

A defender's preferred target is unavailable, or a taunt drags them elsewhere. The
champion still acts, and always legally.

**Why this priority**: Priority sits inside a targeting pipeline that must never
deadlock. Making it a *sort* rather than a *filter* is what removes every special
case.

**Independent Test**: Apply priority against every combination of reach, fade and
taunt; confirm a legal action always results and taunt always wins.

**Acceptance Scenarios**:

1. **Given** the four targeting stages, **When** priority applies, **Then** it is **stage 4 and nothing else** — a sort over the survivors of reach, filters and compulsion.
2. **Given** a taunt naming a target, **When** priority disagrees, **Then** **the taunt wins** — compulsion resolves before choice.
3. **Given** a priority that ranks the only available target last, **When** the turn resolves, **Then** the champion **still takes it** — priority sorts, it never filters.
4. **Given** a champion owning a friendly power, **When** it selects an ally, **Then** only stages 1 and 4 apply, and **reach limits a heal exactly as it limits an attack**.
5. **Given** a champion with no legal target in reach, **When** its turn comes, **Then** it passes — the only condition under which the AI declines to act.

---

### User Story 5 - Distance priorities work at any reach (Priority: P3)

A defender asks a champion to strike past the front line, and it does — including
when a rune has widened its reach beyond what the formation normally allows.

**Why this priority**: Lower frequency, but it contains a concrete implementation
trap that is cheap to avoid now and expensive later.

**Independent Test**: Grant +1 reach and confirm a third enemy row becomes
reachable and selectable.

**Acceptance Scenarios**:

1. **Given** a champion at base reach, **When** its reachable rows are computed, **Then** at most two enemy rows are visible — but **this must never be assumed as a bound**.
2. **Given** a champion granted **+1 reach for a turn**, **When** its window is computed, **Then** three enemy rows are reachable and a genuine middle exists.
3. **Given** a *middle* priority with fewer than three rows reachable, **When** resolved, **Then** it degrades to **furthest**, not nearest — a defender asking for *middle* is asking to get past the front line.

---

### Edge Cases

- **A reach-1 champion in the back seat.** It reaches only its own middle row, so it has no enemy to strike and passes unless it owns a friendly power. Documented behaviour, not a bug — the squad builder already warns about that seat.
- **A ranking where tier 0 is not last.** Everything below it is dead. Must be surfaced, not silently accepted.
- **A player deliberately switching a power off** by ranking it below tier 0. Permitted — *harm is a gate, taste is a note* — but never accidental.
- **A champion with no friendly power.** Shows two controls rather than three, so the interface stays honest about which champions face the decision.
- **The role→ranking mapping.** A **proposal**; the *safety* of each ordering is measured and settled. Which ordering suits which role should be re-checked once tier-2 and tier-3 powers are authored.
- **Reactive powers.** Not configurable. "Reactive" is a property of the power, so nothing here exposes it.

## Requirements *(mandatory)*

**The configurable surface**

- **FR-001**: Each defending champion MUST carry an ordered **pair** of targeting rules — a primary and a fallback.
- **FR-002**: Each defending champion MUST carry an ordered **ranking of all six** of its powers.
- **FR-003**: A champion owning at least one friendly power MUST carry **one additional** ally-targeting rule — a single choice, not a pair.
- **FR-004**: A champion owning no friendly power MUST NOT display an ally control.
- **FR-005**: The configurable surface MUST be limited to the above. Reactive behaviour MUST NOT be configurable.

**Behaviour**

- **FR-006**: The engine MUST fire the highest-ranked power that is off cooldown and past its tier gate — tier 4 from turn 3, tier 5 from turn 5.
- **FR-007**: Because the tier-0 auto-attack has cooldown 0 and no gate, a legal power choice MUST always exist; no fallback ranking rule is required.
- **FR-008**: Targeting priority MUST operate as **stage 4 only** — a sort over the survivors of reach, filters and compulsion.
- **FR-009**: Priority MUST NOT act as a filter and MUST NOT be able to produce "no legal target" where one exists.
- **FR-010**: A compulsion MUST override priority.
- **FR-011**: Ally targeting MUST apply stages 1 and 4 only, with reach applied identically to attacks.
- **FR-012**: A champion MUST pass if and only if no power it owns has a legal target in reach — never as a tactical choice.
- **FR-013**: The engine MUST play the Visible and Hidden zones identically.

**Defaults**

- **FR-014**: A squad saved without explicit configuration MUST receive **role-derived defaults**, never random behaviour.
- **FR-015**: Every default ranking MUST be drawn from the orderings that keep all six powers live on all 27 heroes.
- **FR-016**: Any explicit selection MUST override the default.
- **FR-017**: Randomness MUST be used only as a final tiebreak.

**The deletion hazard**

- **FR-018**: The squad builder MUST show which powers will actually fire under the chosen ranking.
- **FR-019**: A ranking that renders a power unreachable MUST be permitted but MUST be surfaced — deliberate, never accidental.

**Reach**

- **FR-020**: The reachable-row window MUST be **computed**, never bounded by a constant. An implementation assuming at most two reachable enemy rows is incorrect, because a reach-granting rune produces three.
- **FR-021**: A *middle* distance priority MUST degrade to *furthest* when fewer than three rows are reachable.
- **FR-022**: The distance menu MUST offer nearest, middle and furthest reachable.

### Key Entities

- **Targeting rule** — one selectable criterion for choosing among legal targets. Held as an ordered pair per champion.
- **Power ranking** — a total ordering of a champion's six powers.
- **Ally rule** — a single targeting criterion for friendly powers.
- **Role default** — the targeting pair and ranking a champion receives when unconfigured, derived from its role.
- **Firing profile** — which of a champion's powers will actually fire under a given ranking, and how often.

## Success Criteria *(mandatory)*

- **SC-001**: A squad's behaviour is **fully determined** by its configuration plus the resolver's seed — no unexplained variation.
- **SC-002**: Two squads of the same six heroes with different configurations behave **measurably differently**.
- **SC-003**: The builder's firing profile matches the engine's actual behaviour on **every** hero and ordering.
- **SC-004**: **No role default switches off any power on any of the 27 heroes** — zero exceptions.
- **SC-005**: An unconfigured squad plays competently — never randomly.
- **SC-006**: A taunt overrides priority **100%** of the time.
- **SC-007**: Priority **never** produces "no legal target" where one exists.
- **SC-008**: A champion granted +1 reach can target a **third** enemy row.
- **SC-009**: A defence squad's behaviour is **replayable** — the same seed and configuration reproduce the same choices exactly.

## Assumptions

- **The role→ranking mapping is a proposal; the safety of each ordering is measured.** Which ordering suits which role should be re-checked once tier-2 and tier-3 powers are authored — the Buffer assignment in particular assumes its mid tiers carry sustain.
- **Publishing the defaults makes some defences predictable, and that is accepted** as a skill floor rather than a repeat of the greedy problem.
- **Greedy's tier distribution is healthy and was deliberately achieved.** The cooldown ladder was retuned once to reach it. Greedy was rejected for producing **one opening across 17 of 27 heroes**, not for what it fires.
- **The AI's randomness comes from feature 03**, so its choices are replayable.
- **Reactive powers remain unpopulated**; the decision not to configure them stands regardless.
- **Two zones, one behaviour.** Everything here applies to Visible and Hidden without qualification.

## Dependencies

**Upstream**: 01 (`content`), 02 (`sim-rules`), 03 (`sim-resolver`).

**Downstream**: 06 (`roster-and-squads`) hosts the configuration interface;
07 (`battle`) drives it; 09 (`matchmaking`) seeds bots that use it.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority | The AI runs server-side; a client never learns its next choice |
| **XIII** | One rules engine | Targeting priority is stage 4 of the *existing* pipeline, not a second one |
| **XVIII** | Harm is a gate, taste is a note | FR-019 — a self-defeating ranking is **surfaced, not blocked** |
| **XX** | Written docs are canon | The role→ranking mapping is explicitly a proposal |
