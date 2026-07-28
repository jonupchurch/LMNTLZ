# Feature Specification: Simulation — Rules

**Feature Branch**: `002-sim-rules` *(no branch — LMNTLZ works straight to `main`, per Constitution IX and Governance)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 02 of the LMNTLZ 1.0 set (`specs/README.md`). The pure half of the simulation — every question about a battle that has exactly one right answer given the state. No randomness. Runs identically on the client and the server.

---

## The line this feature draws

> **Rules compute probabilities and ranges. The resolver draws from them.**

That single sentence is the feature. It is why a client can show a legal target
set, a projected turn queue and a damage preview **without ever holding the RNG
seed** — and it is why a modified client still cannot learn an outcome, because an
outcome was never computed here.

**Constitution XII and XIII both land on this boundary.** XII forbids the seed
crossing to the client; XIII forbids a second implementation of any rule. This
package is what makes both true structurally rather than by discipline: the client
gets the *real* rules engine, and it is the same object the server runs.

| This feature answers | Feature 03 answers |
|---|---|
| Can this hero target that one? | Did the attack land? |
| What multiplier applies? | Was it a critical hit? |
| Who acts next, and in what order? | Did the status take hold? |
| **What is the probability of hitting?** | **What did the die say?** |
| What does a packet become after mitigation? | What did the defence AI choose? |
| Is the battle over, and who won? | |

## User Scenarios & Testing *(mandatory)*

The direct consumers are the client (previewing) and the server (resolving).
Players experience this feature as a UI that tells them the truth before they
commit to a move.

### User Story 1 - The client tells the truth without asking the server (Priority: P1)

A player hovers a power. The interface immediately shows which enemies and allies
are legally targetable, what the type multiplier would be against each, and where
this hero sits in the coming turn order — with **no network request**, and with
answers the server will agree with exactly.

**Why this priority**: It is the entire payoff of the rules/resolver seam. Without
it the client must ask the server for every hover, and the architecture's best
property is spent for nothing.

**Independent Test**: Run the same battle state through the rules on a client and
on a server and compare every answer — legal targets, multipliers, turn order,
mitigation results. They match on every input, with no network call made.

**Acceptance Scenarios**:

1. **Given** a battle state, **When** the client asks for a hero's legal targets, **Then** it receives the same set the server would produce, without contacting the server.
2. **Given** the same battle state evaluated twice, **When** any rules question is asked, **Then** the answer is identical both times — the rules hold no hidden state.
3. **Given** a client and a server on the same content and engine versions, **When** both evaluate the same state, **Then** every rules answer agrees exactly.

---

### User Story 2 - No outcome can be learned from the rules (Priority: P1)

A player runs a modified client and inspects everything the rules can produce.
They can see that an attack has an 82% chance to land. They cannot discover
whether *this* attack will land, whether it will crit, or what the defence will do
next turn.

**Why this priority**: Equal-first. This is Constitution XII expressed as a
testable property rather than an intention — and it is the property that survives
a hostile client, which is the only kind that matters.

**Independent Test**: Search the rules half for any source of randomness. There
must be none — no random number generator, no clock, no entropy of any kind. Every
function is a pure function of the state it is given.

**Acceptance Scenarios**:

1. **Given** the rules half, **When** examined for sources of randomness, **Then** none exists.
2. **Given** an attack being considered, **When** the rules are asked about it, **Then** they return a **hit probability**, never a hit or a miss.
3. **Given** a power that can crit, **When** the rules are asked, **Then** they return a **crit chance**, never a crit.
4. **Given** identical state, **When** the rules run a thousand times, **Then** all thousand results are identical.

---

### User Story 3 - Reach opens up as the battle wears on (Priority: P2)

A back-line hero cannot reach the enemy at the start of a battle. As rows empty,
the same hero — unchanged, unbuffed — finds targets it could not touch before.

**Why this priority**: The rule that gives a losing position its own momentum. It
is also the single most misunderstood rule in the design, so it needs acceptance
scenarios rather than prose.

**Independent Test**: Place a hero of reach 2 in row 1 against a full enemy squad.
It has no legal enemy target. Empty rows 2 and 3; it now reaches row 4.

**Acceptance Scenarios**:

1. **Given** a hero in row 1 with reach 2 and all rows occupied, **When** legal targets are computed, **Then** no enemy is targetable — reaching row 4 costs 3, counting rows 2, 3 and 4.
2. **Given** the same hero **When** rows 2 and 3 are empty of living heroes, **Then** row 4 is at distance 1 and becomes targetable.
3. **Given** any hero, **When** distance is computed, **Then** the **target's row counts and the hero's own row does not**, and rows with no living hero count as zero.
4. **Given** a healing power, **When** its legal targets are computed, **Then** the same reach rule applies as for an attack — **one rule for allies and enemies alike**.
5. **Given** a row containing only fallen heroes, **When** distance is computed, **Then** that row is free — a fallen hero does not hold its row.

---

### User Story 4 - Targeting always resolves to a legal choice (Priority: P2)

Compulsions and restrictions combine without ever producing a state where a hero
has no legal move or is forced onto an illegal target.

**Why this priority**: A targeting pipeline that can deadlock is a battle that can
deadlock. The two invariants exist precisely to make that unreachable.

**Independent Test**: Apply every combination of restriction and compulsion to a
hero and confirm a legal action always exists.

**Acceptance Scenarios**:

1. **Given** targeting, **When** it resolves, **Then** it proceeds in four stages — **reach → filters → compulsion → choice**.
2. **Given** a filter that would empty the candidate set, **When** applied, **Then** it is **ignored** rather than emptying it.
3. **Given** a compulsion naming a hero outside the candidate set, **When** applied, **Then** it **does not apply**.
4. **Given** a hero under both a compulsion and a restriction naming it, **When** resolved, **Then** the two **cancel**.
5. **Given** a hero with no legal target in reach, **When** its turn comes, **Then** it **passes** rather than stalling the battle.

---

### User Story 5 - The battle ends, always (Priority: P2)

Every battle reaches a conclusion with a winner, including battles between squads
that cannot finish each other.

**Why this priority**: An unbounded battle is not only a design problem — battle
state is re-derived from the action log on every request, so an unbounded battle
degrades quadratically over its own course.

**Independent Test**: Construct a pairing that cannot resolve by damage and
confirm it terminates at the cap with a determinate winner.

**Acceptance Scenarios**:

1. **Given** all six of one side have left the board, **When** the state is evaluated, **Then** the other side has won.
2. **Given** a battle reaching **300 hero-turns**, **When** the cap fires, **Then** the winner is the side with the **higher share of its pooled maximum HP remaining**.
3. **Given** a tie on pooled HP share, **When** resolved, **Then** the side with **more champions standing** wins; if still tied, **the defender holds**.
4. **Given** a squad that deals no damage, **When** the cap fires, **Then** it **loses** — its opponent sits near full HP share.
5. **Given** a hero reduced to 0 HP, **When** the state is evaluated, **Then** it leaves the board **immediately**, stops occupying its row, and cannot be targeted, healed or revived.

---

### Edge Cases

- **A hero dies during its own upkeep**, before acting. This is the only early termination of a turn; the turn ends there.
- **A hero loses its turn to crowd control.** Phases 2–4 are skipped but phase 5 is **always** reached, so cooldowns still tick.
- **A power that deals neither damage nor healing.** The defence phase is skipped entirely; the effect is contested and enacted together in the following phase.
- **A power striking several targets**, one of which is already dead. Per-target phases still run and attacker-side effects still fire, but the dead target receives no follow-on effects.
- **A reaction firing during another hero's turn.** Permitted once, respecting reach, never while dead — and a reaction can **never trigger another reaction**.
- **A power with two types.** Resolves as the **better** of the two. A mixed martial/arcane power answers the defender's **lower** mitigation stat — the deliberate consequence being that no tier-4 or tier-5 power is ever resisted.
- **Mitigation exceeding the packet.** The floor holds: damage is never less than **25% of the raw packet**.
- **A very fast hero and a very slow one.** The accumulator is drained in a loop, not tested once, so a hero fast enough to act twice before a slow one does so.
- **Hit probability computed outside its bounds.** Clamped to **65%–95%** — this is what survives runes, since an unclamped Agility and Luck build reaches a 98.2% miss rate.

## Requirements *(mandatory)*

### Functional Requirements

**Purity — the seam**

- **FR-001**: The rules half MUST contain no source of randomness, no clock, and no ambient state. Every answer MUST be a pure function of the state supplied.
- **FR-002**: The rules half MUST run unmodified on both client and server, as **one implementation imported by both**, never as two copies.
- **FR-003**: The rules MUST NOT determine whether an attack hits, whether it crits, whether a status takes hold, or what the defence chooses. Those belong to feature 03.
- **FR-004**: The rules MUST expose the **probability** of hitting and the **chance** of a critical hit, so a consumer can present them without being able to resolve them.

**Targeting and reach**

- **FR-005**: Distance from one row to another MUST be the count of **occupied** rows crossed, **including the target's row and excluding the actor's own**.
- **FR-006**: A row containing no living hero MUST count as zero distance.
- **FR-007**: A hero MAY target a row when that distance is less than or equal to its reach, which is 1 or 2.
- **FR-008**: The reach rule MUST apply identically to allies and enemies — a heal is range-limited exactly as an attack is.
- **FR-009**: Targeting MUST resolve in four ordered stages: **reach → filters → compulsion → choice**.
- **FR-010**: A filter that would empty the candidate set MUST be ignored; a compulsion naming a hero outside the candidate set MUST NOT apply.
- **FR-011**: A hero with no legal target MUST pass its turn rather than blocking resolution.

**Turn order**

- **FR-012**: Each living hero MUST gain `50 + Speed` per tick and act on reaching 100.
- **FR-013**: The accumulator MUST be drained in a loop rather than tested once, so a sufficiently fast hero can act more than once before a slow one acts.
- **FR-014**: Ticks MUST remain internal. Consumers MUST be able to obtain a **projected turn queue** instead.
- **FR-015**: Stat modifications MUST be flat point values, including `Speed`.

**The deterministic damage pipeline**

- **FR-016**: A hero's maximum HP MUST be `Toughness × 50`.
- **FR-017**: A packet MUST be `Might × power multiplier`. `Luck` MUST NOT enter it.
- **FR-018**: Mitigation MUST be computed from `E = (Armor or Magic Resist) − Penetration` against the constant `K = 75`, selecting the stat the power's type calls for.
- **FR-019**: Final damage MUST be `max(packet × 0.25, mitigated × type multiplier)` — a floor of 25% of the raw packet that no mitigation can breach.
- **FR-020**: Hit probability MUST derive from `Perception + 20` for the attacker against `Agility` for the defender, with each side's `Luck`-scaled range, resolved as **one draw rather than two**, and **clamped to 65%–95%**.
- **FR-021**: Critical chance MUST be `Luck × 0.5` percent, and a critical MUST double the packet.
- **FR-022**: Type effectiveness MUST come from feature 01 and MUST NOT be recomputed here. A dual-typed power takes the **better** of its two types; a mixed martial/arcane power answers the defender's **lower** mitigation stat.

**The turn and its phases**

- **FR-023**: A turn MUST proceed through five phases in fixed order: **Upkeep · Attack · Defense · Additional effects · Resolution**.
- **FR-024**: Cooldowns MUST be integer turn counts and MUST tick in Resolution, unconditionally.
- **FR-025**: A hero losing its turn to crowd control MUST skip phases 2–4 and MUST still reach phase 5.
- **FR-026**: The Defense phase MUST be skipped for a power that deals neither damage nor healing.
- **FR-027**: Additional effects MUST resolve in fixed order: riders → on-hit triggers → reactions → attacker self-effects → a second death check.
- **FR-028**: A reaction MUST NOT trigger another reaction.

**Ending**

- **FR-029**: A hero at 0 HP MUST leave the board immediately, cease occupying its row, and be untargetable, unhealable and unrevivable.
- **FR-030**: A side MUST win when all six opposing heroes have left the board.
- **FR-031**: A battle MUST end at **300 hero-turns**, resolved by **pooled HP share remaining**, then champions standing, then in the defender's favour.

### Key Entities

- **Battle state** — everything the rules need: both squads, their positions on the 1–6 axis, current HP, active effects, cooldowns, accumulators, and the hero-turn count. Supplied to the rules; never held by them.
- **Row** — one of six positions on a shared axis. Attacker holds 1–3, defender 4–6; each squad is **2 front · 3 middle · 1 back**. A row is *occupied* when at least one living hero stands in it.
- **Turn queue projection** — the order heroes will act in if nothing changes.
- **Damage preview** — what a power would do to a target: packet, mitigation, type multiplier, the floor, and the hit and crit probabilities. Everything except the outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Zero** sources of randomness exist in the rules half.
- **SC-002**: A client and a server on matching versions produce **identical answers on every input**, with no network call required for any of them.
- **SC-003**: The same state evaluated any number of times yields the same answer **every time**.
- **SC-004**: A player running a modified client can obtain **no outcome** — only probabilities.
- **SC-005**: All **729** hero-versus-hero pairings can be exercised **without mocks**, because nothing here needs stubbing.
- **SC-006**: A hero's legal target set changes **only** when rows empty, positions change, or its reach changes — never otherwise.
- **SC-007**: Over a long run, a hero at `Speed` 45 acts **1.46×** as often as one at `Speed` 15, and the geared ceiling is **1.92×**.
- **SC-008**: Hit probability never falls below **65%** or rises above **95%**, for any stat combination reachable in the game including fully runed.
- **SC-009**: Damage is never below **25%** of the raw packet, for any mitigation value.
- **SC-010**: **Every** battle terminates — no constructed pairing runs past 300 hero-turns.

## Assumptions

- **Feature 01 is settled first.** The rules consume hero data and type effectiveness; they do not define either.
- **The values are provisional, the formulas are not.** The hero-numbers pass has not run. Every formula here is decided (`CLAUDE.md`); the numbers they operate on will move, which is why SC-007 is expressed as a ratio.
- **The `+20` attacker edge and the 65–95% clamp are both load-bearing and neither is a tuning knob.** The symmetric contest was a coin flip — a median 45.2% miss across all 729 pairs — and the clamp is what survives runes. Reducing `Luck`'s die multiplier is explicitly the wrong lever: it compresses rather than shifts, and at ×0.5 it creates 158 pairs that can never hit each other at all.
- **`Magic Resist` is worth roughly 2× `Armor` and is deliberately left unpriced.**
- **Reactive powers are specified but unpopulated.** "Reactive" is a power property, and no hero currently has one — which leaves two unique passives dead. Authoring them belongs with the hero-numbers pass, not here.
- **The 300-turn cap is provisional in its constant, settled in its mechanism.** It is ~3× the simulated ~102-hero-turn median and should be re-derived from measured **p99** once feature 08 is recording turn counts.
- **Whether the interface displays hit probability is a design decision, not this feature's.** The rules make it *available*; nothing here requires it be shown.

## Dependencies

**Upstream**: feature 01 (`content`) — hero data, types, effectiveness.

**Downstream**: 03 (`sim-resolver`) builds directly on this; 04 (`defense-ai`), 06
(`roster-and-squads`), 07 (`battle`) and every client preview consume it.

## Constitution Notes

| # | Constraint | Bearing on this feature |
|---|---|---|
| **XII** | Server authority, the seed boundary | **The whole feature.** FR-001, FR-003, FR-004, SC-001, SC-004 |
| **XIII** | One rules engine, one language | FR-002 — one implementation imported by both sides, never two copies |
| **XIV** | Balance upward | The formulas are the last place a number moves freely; SC-007 and SC-008 are ratios and bounds, not constants |
| **XVI** | Cannot be backfilled | Engine version is stamped on every battle; this package is what it identifies |

> **This is where testing earns most in the entire codebase.** The rules half is
> pure, shared and RNG-free by construction, so it is **exhaustively testable
> without mocks** — and under the no-nerf rule it is the last moment a number can
> move freely. Property tests across the 729 pairings are worth more here than
> anywhere else.
