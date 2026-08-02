# Feature Specification: Rune Utility Effects — the stage that charges the most and delivers nothing

**Feature Branch**: `021-rune-utility-effects`

**Created**: 2026-08-01

**Status**: Draft

**Input**: Continuation of the 020 close-out. The gap was carried as the sharpest
remaining item in the build state: *"rune stage 4 charges 200 shards and writes
`utilityEffect: null` on both code paths, so 31% of a full rune currently buys
nothing."*

---

## TL;DR

A **rune** is the permanent upgrade a LMNTLZ player grinds for. It is built in
four stages and costs **650 shards** — a little under two days of typical play for
one rune, on one champion, out of twenty-seven.

The first three stages give stat points. **The fourth gives a special ability, and
it is the most expensive of the four at 200 shards.** It deliberately grants no
stat points at all, because the ability *is* what the player is buying.

**That ability has never existed.** The player pays the 200, the rune is marked
complete, and the database column that should hold the ability is written as
empty — on both the buy path and the rebuild path. Nothing in the battle engine
would read it even if it were filled in. So **roughly a third of the price of
every completed rune buys literally nothing**, on the one stage a player has to
work through three others to reach.

The thirty-three abilities themselves are fully designed and written down —
names, conditions, numbers, and the reasoning for how many there should be. Nobody
built them. This feature builds them.

**One finding to carry, not to fix:** the design sized these abilities against a
battle lasting about **102 hero-turns**. Battles currently run about **28**. The
abilities that trigger on a condition partway through a fight — *"when you drop
below half health, gain…"* — therefore deliver roughly **a third** of the value
they were priced at, and some never fire at all. That is a tuning problem for the
separate hero-numbers pass, and it does not block any of the work here, but it
means nobody should treat these magnitudes as settled after this feature ships.

---

## Why this feature exists

The chain from *player spends 200 shards* to *something happens in a battle* is
broken at **every** link. Each row below was read in the source, not recalled:

| Link | State | Evidence |
|---|---|---|
| The price is real | ✅ charged | `STAGE_COSTS = [150, 150, 150, 200]` |
| Stage 4 grants no stats, by design | ✅ correct | `STAGE_BOOSTS = [20, 10, 5, 0]` |
| The column exists | ✅ exists | `runes.utility_effect`, nullable text |
| The **forge** path writes it | ❌ **writes `null`** | `progression/runes.ts:377` |
| The **rebuild** path writes it | ❌ never assigns | same function, no parameter for it |
| The readers gate on the stage | ✅ correct | `read.ts:143`, `runes.ts:441` — both `stage >= 4` |
| The loadout carries it to battle | ✅ declared and populated | `board.ts:82`, `read.ts:109` |
| The **engine** consumes it | ❌ **zero references** | `grep -rn utility packages/sim --include=*.ts` → no matches |
| `HeroState` has somewhere to put it | ❌ no field | `statMods` and `reachMod` only |
| The player can choose one | ❌ no picker | the Forge stops at stage 3 |

> **The readers are already right and the writer is the hole.** That is an
> unusually good starting position — `read.ts:143` even refuses a `utilityEffect`
> written at stage 3 by a hypothetical future bug, with a comment explaining why.
> The gating is defensive and correct around a value that has never once been
> non-null.

### What is *not* missing

`resources/mechanics/06-progression.md` § *The utility catalog* is **complete and
is the authority**:

- **33 effects** — 6 common (offered on the `common` slot, every hero) and 3 per
  element across all 9 damage types (offered on the `primary` and `secondary`
  slots), one offensive · one defensive · one tempo per element, so the choice is
  made on what the hero *does* rather than on which effect is strongest.
- **Pool size is argued, not guessed** — from `1 − (1−p)ⁿ`, with the table showing
  1→3 effects per pool recovering ~4,000 shards of otherwise-stranded elemental
  sink and 3→9 recovering only ~1,300 more for six times the authoring.
- **All 33 names were already collision-checked** against the 127 entries in the
  workbook's `Power List` sheet. No exact collisions, no two-word near misses.
- **Two deliberate counter-pairs** exist so the meta can move: Light's
  `Nowhere to Stand` answers Dark's `No One Saw`; Pierce's `Straight Past`
  answers `Before the First Blow`.
- **Every effect is conditional.** None is a flat always-on bonus — *that is what
  the 35 stat points are for* — and each takes one of exactly three shapes:
  **trigger → persistent**, **per-attack chance**, or **ward / charge**.
- **Probabilistic effects grant capability, never magnitude.** The doc's own
  reasoning: a 25% chance of more damage is worth exactly 25% of that damage and
  always loses to a flat stat, whereas a 25% chance to reach a target you
  otherwise cannot is not a fraction of anything.

Feature 020 also left behind most of the machinery. `PassiveHooks` in
`packages/sim/rules/passives.ts` is a named-hook surface with sixteen hook points,
a `PassiveEffect` result type, a frozen `PASSIVE_MAGNITUDES` object, and folding
that already clamps healing and honours the damage floor. **The rune catalog is
the same shape of thing as a passive** and should reuse that surface rather than
grow a parallel one.

---

## User Scenarios & Testing

### User Story 1 — A completed rune finally does something (Priority: P1)

A player has ground out 650 shards, taken one rune on one champion through three
stat stages, and reached stage 4. Today the Forge offers nothing there. After this
story the player is **offered the right pool for that slot**, picks an effect,
commits, and that effect is stored, shown on the rune, and **changes how that
champion fights** in the next battle.

**Why this priority**: it is the whole point of the feature and it closes a live
overcharge. Every other story widens the catalog; this one makes the purchase
honest. It also delivers 12 of the 33 effects with no new engine capability at
all, because 020's hook surface already supports them.

**Independent Test**: take a fresh account to stage 4 on one slot, commit an
effect, start a battle, and observe the effect firing in the resolved log — with
the stored rune row carrying a non-null `utility_effect` for the first time.

**Acceptance Scenarios**:

1. **Given** a rune at stage 3 on a hero's `primary` slot, **When** the player
   opens stage 4, **Then** exactly the three effects of that hero's *primary*
   element pool are offered — not the common pool, not the secondary pool.
2. **Given** a rune at stage 3 on the `common` slot, **When** the player opens
   stage 4, **Then** exactly the six common effects are offered, for every hero
   on the roster.
3. **Given** a player commits `Cornered` on a champion, **When** that champion
   drops below half health in a battle, **Then** it gains the authored `Might`
   bonus for the rest of that battle and the battle log says so.
4. **Given** a player commits an effect, **When** the commit succeeds, **Then**
   200 shards are debited exactly once, the rune reads stage 4, and the stored
   row's `utility_effect` names the chosen effect.
5. **Given** a rune already at stage 4, **When** the player attempts to change the
   effect, **Then** the system refuses — the only operations are *destroy and
   restart* or *melt the champion down*.
6. **Given** a **rebuild** of a complete rune, **When** it is committed as one
   transaction, **Then** it carries a chosen utility effect too, rather than
   landing at stage 4 with an empty one.
7. **Given** a battle snapshot recorded before this feature, **When** it is
   replayed, **Then** it resolves exactly as it did when it was fought — an absent
   loadout still means none, and no past battle is retroactively armed.

---

### User Story 2 — Every effect in the catalog works, not just the convenient ones (Priority: P2)

Seventeen of the thirty-three need **one new engine capability each** — a heal
multiplier, reflected damage, a cleanse, crit immunity, shield-piercing, and so
on. Until they exist, those seventeen would have to be omitted from the pools,
which would silently shrink several pools from three effects to one and destroy
the `1 − (1−p)ⁿ` argument the pool size rests on.

**Why this priority**: P2 rather than P1 because a player can buy and benefit from
an effect without them, but the catalog is **not the designed catalog** until they
land — and the shortfall is badly uneven. Counting what US1 alone leaves in each
pool:

| Pool | Effects available after US1 alone |
|---|---|
| Common | 3 of 6 |
| Earth | 2 of 3 |
| **Water** | **0 of 3 — the pool is empty** |
| Air · Fire · Light · Dark · Slash · Pierce · Crush | **1 of 3 each** |

So without this story a Water-element champion's two elemental slots offer
**nothing at all**, and seven of the ten pools collapse to a single take-it-or-
leave-it choice — which is precisely the *"fixed single effect per pool"* option
the design named as the one to avoid, because it strands half the elemental
shard sink.

**Independent Test**: for each of the seventeen, a battle in which the effect's
condition is met and the authored consequence is observable in the resolved state.

**Acceptance Scenarios**:

1. **Given** a champion with `Draws It Up`, **When** an ally heals it, **Then**
   the restored amount is increased by the authored fraction, and overheal is
   still reported rather than silently dropped.
2. **Given** a champion with `Too Close`, **When** it is struck, **Then** the
   attacker takes the authored fraction of that packet, and that reflected damage
   can itself be lethal and is ordered by the existing effect order.
3. **Given** a champion with `Not This Time`, **When** the first `Stun` or
   `Silence` is applied to it, **Then** that effect does not land, the charge is
   spent, and a second `Stun` later in the same battle lands normally.
4. **Given** a champion with `All One Piece`, **When** an attack against it rolls
   a critical, **Then** the blow lands as a normal hit.
5. **Given** a champion with `Straight Past`, **When** it attacks a shielded
   enemy, **Then** the shield absorbs none of that blow and is left intact.
6. **Given** a champion with `It Stays Open`, **When** a damage-over-time it
   applied would be cleansed, **Then** the cleanse does not remove it.

---

### User Story 3 — The four probabilistic effects, with every draw accounted for (Priority: P3)

Four effects roll dice: `Take It Back` (25% per attack), `Both Ways` (25% when
struck), `Knocked Loose` (15% per attack), and `Further Than It Looks` (25% at
turn start). They consume RNG draws that pre-021 battles did not, which moves the
draw order and therefore requires an engine-version gate.

**Why this priority**: P3 because it is the only story that touches the seed
boundary, and it is cleanly separable — the other twenty-nine effects are
deterministic given the board. `Further Than It Looks` also carries a UX
requirement the design states explicitly: **the roll happens at turn start and is
shown before the player chooses**, which makes it a decision rather than variance
applied to a decision already made.

**Independent Test**: a fixed seed produces an identical battle across a thousand
evaluations; the existing draw-order, seed-custody and determinism suites stay
green; and a battle recorded on the previous engine version still replays
byte-identically.

**Acceptance Scenarios**:

1. **Given** a fixed seed and a squad carrying all four probabilistic effects,
   **When** the same battle is resolved repeatedly, **Then** every resolution is
   identical.
2. **Given** a battle recorded on the pre-021 engine version, **When** it is
   replayed, **Then** it produces the outcome it was fought with — the added draws
   never reach it.
3. **Given** a champion with `Further Than It Looks`, **When** its turn begins,
   **Then** the reach roll has already resolved and the enlarged target list is
   what the player is offered — never a target list that changes after choosing.
4. **Given** `Knocked Loose` fires, **When** the stun is attempted, **Then** it is
   contested through the existing potency-versus-`Resolve` landing system rather
   than a second, parallel one.

---

### User Story 4 — The player can see what they bought (Priority: P4)

The effect is named and explained on the Forge's stage-4 card before and after
purchase, appears on the champion's rune summary, and is surfaced in battle — on
the board while it is active and in the battle log at the moment it fires.

**Why this priority**: last because the effects work without it, but a permanent,
non-refundable 200-shard purchase whose consequence a player cannot observe is the
same class of defect the feature exists to close. 020 shipped the status row and
the rider log lines, so this story extends existing surfaces rather than inventing
one.

**Independent Test**: buy an effect, fight a battle in which it fires, and read
its name in the log and its indicator on the board — verified in a real browser,
not only in unit tests.

**Acceptance Scenarios**:

1. **Given** the stage-4 builder, **When** the player highlights an effect,
   **Then** its condition and consequence are described in full **before** any
   shards are committed, computed by the shared rules half rather than by copied
   client text.
2. **Given** an effect that has fired and persists, **When** the player looks at
   that champion on the battle board, **Then** an indicator shows it is active.
3. **Given** an effect fires, **When** the player reads the battle log, **Then**
   a line names the effect and what it did.

---

### Edge Cases

- **A hero whose `primary` and `secondary` are the same element** — impossible by
  the derivation rules (`secondary ≠ primary`), so the two elemental slots always
  offer different pools. Asserted rather than assumed.
- **A melee-primary champion.** Melee heroes always take a magic secondary, so the
  Slash / Pierce / Crush pools are reachable from **only three slots each on the
  whole roster** — 3 champions × 1 primary slot. The martial pools are
  under-used and the design says so explicitly; that is not a defect.
- **Two effects on one champion that contradict** — e.g. `Nowhere to Stand` versus
  an enemy's `No One Saw`. The counter-pairs are deliberate, and the resolution
  order must be specified rather than emergent.
- **An effect whose condition can fire twice** — `Cornered` is *first* time below
  half. A champion healed back above and dropping again must not re-trigger.
- **An effect that would kill its own owner** — `Too Close` reflects damage at an
  attacker that may be at 1 HP. Reflected damage must be ordered by the existing
  effect order, because everything in that phase can kill.
- **Chained extra turns** — `On the Same Breath` grants another action on a
  killing blow. Two kills in a row must not produce an unbounded loop.
- **A stored rune naming an effect that no longer exists** — content is versioned;
  an unknown effect id must fail loudly at load rather than resolve to an inert
  battle.
- **Melting a champion down** at stage 4 returns 80% of what is placed, which
  includes the 200. That path already exists and must keep working.

---

## Requirements

### Functional Requirements

**The catalog**

- **FR-001**: The system MUST define all **33** utility effects — 6 common and 3
  for each of the 9 damage types — in exactly **one** place, in the shared rules
  engine, with no second table in the API and no copy in the client.
- **FR-002**: Every magnitude, fraction, threshold, duration and probability in
  the catalog MUST live in a **single frozen constants object**, so a later tuning
  pass is a one-file edit.
- **FR-003**: Which pool a slot offers MUST be **derived** from the hero's
  authored `primary` and `secondary`, by the same derivation the rest of the
  system already uses, and MUST NOT be stored on the rune row.
- **FR-004**: Effect names in the catalog MUST NOT collide with any authored power
  or passive name, and this MUST be enforced by a test rather than by review.
- **FR-005**: The catalog MUST be complete — a test MUST assert that every pool
  holds its designed number of effects (6 common, 3 per element) and that no
  effect is declared but unimplemented. A silently absent effect shrinks a pool
  and invalidates the pool-size argument.

**Buying one**

- **FR-006**: Advancing a rune from stage 3 to stage 4 MUST require the player to
  choose an effect, MUST charge 200 shards exactly once, and MUST store the chosen
  effect on the rune.
- **FR-007**: The system MUST refuse an effect that is not in the pool the slot
  offers, naming the refusal rather than failing generically.
- **FR-008**: Rebuilding a complete rune MUST remain **one transaction** and MUST
  carry a chosen utility effect, rather than producing a stage-4 rune with none.
- **FR-009**: A stage-4 rune's effect MUST be permanent. The system MUST NOT offer
  any operation that swaps one effect for another in place.
- **FR-010**: Selecting an effect in the builder MUST cost nothing and MUST be
  reversible until the stage is committed.

**In battle**

- **FR-011**: A champion's chosen effects MUST reach the battle through the
  existing snapshot, MUST be frozen into the battle at creation, and MUST NOT be
  re-read live mid-battle.
- **FR-012**: An absent rune loadout on a stored snapshot MUST continue to mean
  *none*, so battles recorded before this feature re-derive exactly as fought.
- **FR-013**: Every effect MUST fire only when its authored condition holds, and
  MUST NOT be a flat always-on bonus.
- **FR-014**: A trigger-then-persistent effect MUST fire at most once per battle
  and its consequence MUST last the rest of that battle.
- **FR-015**: A ward effect MUST hold exactly one charge per battle, and once
  spent MUST NOT absorb a second instance.
- **FR-016**: Effects that add RNG draws MUST be gated behind an incremented
  engine version, and the recorded draw order MUST account for every draw.
- **FR-017**: The reach roll MUST resolve **before** the player is offered a
  target list, and the offered list MUST NOT change after the player has chosen.
- **FR-018**: A stun attempted by an effect MUST route through the existing
  potency-versus-`Resolve` contest, not a parallel one.
- **FR-019**: Reflected and cleanse-driven consequences MUST be ordered by the
  existing effect order, because each of them can kill.
- **FR-020**: An extra action granted on a killing blow MUST be bounded — it MUST
  NOT be able to chain without limit.
- **FR-021**: An unknown effect id arriving from storage MUST fail loudly rather
  than resolving to an inert battle.

**Seeing it**

- **FR-022**: The stage-4 builder MUST describe each offered effect's condition
  and consequence before any shards are committed, sourced from the shared rules
  engine rather than copied client text.
- **FR-023**: An active persistent effect MUST be visible on the champion on the
  battle board.
- **FR-024**: When an effect fires, the battle log MUST name it and say what it
  did.
- **FR-025**: The existing effect-visibility rule MUST be honoured — a player sees
  exact detail on effects they caused and on their own champions, and an enemy's
  self-applied effect shows without its duration.

### Key Entities

- **Utility effect** — one named, conditional ability. Belongs to exactly one
  pool. Has a condition shape (trigger-then-persistent, per-attack chance, or
  ward), an authored magnitude, and a role label (offense / defense / tempo).
- **Pool** — the set of effects a slot may offer. Ten pools: one common and one
  per damage type. Derived from the hero and the slot, never stored.
- **Rune slot** — one of `primary`, `secondary`, `common` on one champion. Holds
  at most one rune, which holds at most one utility effect, at stage 4 only.
- **Rune loadout** — what a champion's three runes contribute to a battle: summed
  stat points plus up to three utility effects, frozen into the snapshot.

---

## Success Criteria

- **SC-001**: A player who completes a rune receives a working ability. Measured
  as: **0** completed runes in storage with an empty effect, down from **100%**
  today.
- **SC-002**: **All 33** designed effects are purchasable and each has a battle in
  which its authored condition is met and its consequence observed.
- **SC-003**: Every pool offers its designed number of choices — 6 for common, 3
  for each of the 9 elements — so the pool-size reasoning holds.
- **SC-004**: A battle recorded before this feature replays to the identical
  outcome, verified against stored replays rather than asserted.
- **SC-005**: A fixed seed produces an identical battle across repeated
  resolution, with the probabilistic effects live.
- **SC-006**: A player can state, from the Forge alone and before spending, what
  an effect will do — no effect's description is empty or generic.
- **SC-007**: Every number the catalog uses has exactly one definition — proven by
  a test, so a later tuning pass cannot leave a stale copy behind.

---

## Assumptions

Each of these is a reasonable default chosen where the design did not settle a
detail. **Four of them are flagged for confirmation** because they resolve a
genuine conflict rather than fill a gap — they are listed again in *Flags* below.

- **A-01**: An effect fires for its owner only, and effects do not stack with
  themselves — a champion cannot hold the same effect twice, since the three slots
  offer three different pools.
- **A-02**: *(flagged)* `Held in the Light` — *"enemies below half HP cannot dodge
  your attacks"* — is implemented as raising the hit-chance ceiling to certainty
  **for that attacker against that defender only**. The 65–95% clamp is
  load-bearing elsewhere and stays universal apart from this one narrow exception.
- **A-03**: *(flagged)* `Weight Tells` includes *"you cannot be moved from your
  row"*. **There is no displacement mechanic anywhere in LMNTLZ** — reach gates
  targeting and nothing relocates a champion. That clause is therefore inert. It
  is recorded as a documented no-op rather than a reason to invent forced
  movement, and the effect's other two clauses are unaffected.
- **A-04**: *(flagged)* `On the Same Breath` grants **one** extra action, and an
  extra action cannot itself grant another. Without a cap, a chain of killing
  blows is unbounded.
- **A-05**: *(flagged)* When a counter-pair meets — `Nowhere to Stand` versus
  `No One Saw` — the **negating** effect wins, since the design describes the
  Light effect as the *answer* to the Dark one. Stated so the order is a rule
  rather than an accident of evaluation.
- **A-06**: `The Draft` — *"your damage-over-time effects tick again when you
  act"* — means the effects **this champion applied**, wherever they are, which
  the existing effect record already identifies by its source.
- **A-07**: Effect descriptions shown in the Forge are derived from the same
  catalog the engine runs, so a magnitude change cannot leave the copy stale.
- **A-08**: The existing melt-down refund already returns 80% of what is placed
  and needs no change; stage 4's 200 is simply part of *what is placed*.

---

## Non-Goals

- **Retuning the 33 magnitudes.** They are authored and in the 10–20-stat-point
  band by estimate. See *Flags*.
- **The hero-numbers pass**, including the battle-length lever.
- **Reactive powers**, still authored nowhere.
- **`It All Comes Back`'s missing tier-5 spender** for banked Reckoning.
- **019's remaining visual-fidelity treatments.**
- **A displacement mechanic** (see A-03).
- **Redesigning the Forge screen.** The design doc notes the rune shop is *"a
  screen that does not exist yet"* with no generated design among the twenty-one
  exports. This feature adds the stage-4 step to the Forge as built; a full
  designed rune shop is separate work.

---

## Flags

### ⚠️ The catalog's economics assume a battle 3.6× longer than the one we have

This does **not** block the build and it must **not** be fixed here. It must be
recorded, because it decides how much to trust these numbers afterwards.

The catalog's pricing argument is explicit in the design:

| | Design assumption | Measured today |
|---|---|---|
| Hero-turns per 6v6 | **~102** | **~28** |
| Turns per champion (12 on the board) | **8.5** | **2.3** |
| Turns of consequence after a mid-fight trigger | ~4.3 | **~1.2** |

Source for the measured figure: `apps/api/tests/battle/goldenPath.test.ts:133`,
recorded over an eight-battle harness on the current engine.

The consequences are not uniform, and that is the real problem:

- **Trigger-then-persistent effects lose roughly 3.6× of their designed value.**
  The doc argues a once-firing proc must be worth **5.7 turns** of a champion's
  output to justify 200 shards over 150 for a stat. At 2.3 turns per champion
  there are not 5.7 turns to be worth.
- **Some never fire.** A *"first time below 50% HP"* trigger requires the champion
  to survive being brought below half. At 2.3 turns per champion, a burst kill
  skips the trigger entirely.
- **`It Spreads` cannot reach its ceiling.** It stacks on *killing blows* to
  exactly +45 — designed to land a `Might` 30 hero precisely on the 75 cap,
  described as *"meant to be legible."* One champion getting three kills in ~2.3
  turns is not a realistic board state.
- **Immediate and always-on effects are untouched.** `Before the First Blow`
  (a shield at battle start) and `All One Piece` (cannot be critically hit) are
  worth exactly what they were designed to be worth.

> **So the short battle does not scale the catalog down evenly — it transfers
> value from the conditional effects to the immediate ones, which changes which
> effect a rational player picks.** That is a balance distortion, not a rounding
> error.

**Why it still does not block this feature**: the *shapes* are unaffected, and
every piece of plumbing here — the catalog, the write path, the picker, the hooks,
the disclosure — is battle-length-independent. FR-002 exists precisely so the
later correction is a single-file edit. Under the balance-upward rule this is also
the cheap direction: these numbers have never shipped, so moving them later costs
nobody a refund.

### ⚠️ Four assumptions resolve a conflict rather than fill a gap

**A-02** (`Held in the Light` versus the 65–95% hit clamp), **A-03**
(`Weight Tells` names a mechanic the game does not have), **A-04**
(`On the Same Breath` could chain unbounded), and **A-05** (which side of a
counter-pair wins). Each has a stated default above so the work is not blocked;
each is worth a sentence of confirmation before the affected effect is finalised.

### ℹ️ The description said three probabilistic effects; there are four

`Both Ways` — *"when struck, 25% to apply a magnitude-2 bleed to the attacker"* —
is a per-attack chance and belongs in US3 with the other three. Counted from the
catalog table rather than from the summary of it.

---

## The 33, and what each one needs

Classification is by **engine capability required**, which is what sets the story
boundaries. Counts: **12 + 17 + 4 = 33**.

### Already supported by the existing hook surface → US1 (12)

| Effect | Pool | Rides on |
|---|---|---|
| `Cornered` | common | health-threshold trigger + persistent stat |
| `The Point Proven` | common | on-strike + type-effectiveness read |
| `The Line Shortens` | common | ally-death hook |
| `Made Heavy` | Earth off | on-strike + permanent effect |
| `Weight Tells` | Earth def | conditional stat bonus *(see A-03)* |
| `Harder to Follow` | Air def | on-struck + persistent stat |
| `It Spreads` | Fire off | the accumulating-effect kind |
| `Nowhere to Stand` | Light def | existing fade-piercing + stat bonus |
| `It Lingers` | Dark tempo | outgoing-effect reshaping |
| `Again, There` | Slash off | repeat-target mark + damage multiplier |
| `The Way In` | Pierce off | struck-target mark + penetration bonus |
| `The Floor Comes Up` | Crush def | health threshold + reach-limited effect |

### Needs one new engine capability → US2 (17)

Fourteen capabilities across seventeen effects. `Turned Aside` appears on two
rows — it needs the ward charge *and* the crit downgrade — but is one effect.

| Capability | Effects |
|---|---|
| Battle-start hook | `Before the First Blow` |
| Stateful ward (charge visible to the reshaping hook) | `Not This Time`, `Turned Aside` |
| Crit immunity | `All One Piece` |
| Crit downgrade | `Turned Aside` |
| Bounded extra action | `On the Same Breath` |
| Direct-damage effect kind | `Too Close` |
| Re-tick a damage-over-time | `The Draft` |
| Heal multiplier, incoming and outgoing | `Draws It Up`, `Runs Dry` |
| Cleanse effect kind | `It Passes Through`, `The Lamp Lifted` |
| Hit-certainty override | `Held in the Light` *(see A-02)* |
| Has-this-champion-acted-yet reading | `Before It Knew` |
| Condition-gated targeting | `No One Saw` |
| Cleanse-immunity flag | `It Stays Open`, `Stays Broken` |
| Shield-piercing | `Straight Past` |

### Rolls dice → US3 (4)

| Effect | Roll | Note |
|---|---|---|
| `Take It Back` | 25% per attack | strips one active buff |
| `Both Ways` | 25% when struck | bleed back at the attacker |
| `Knocked Loose` | 15% per attack | routes through the existing `Resolve` contest |
| `Further Than It Looks` | 25% at turn start | **must be shown before the player chooses** |

`Further Than It Looks` is called *"the strongest effect in the catalog"* in the
design and is placed in the Air pool deliberately: +1 reach converts *cannot
attack at all* into a real target list from the middle and back seats.

---

## Dependencies

- **020 (status effects and passives)** — shipped. This feature reuses its hook
  surface, its effect record, its frozen-magnitudes pattern, its effect ordering
  and its disclosure rule. Without 020 none of this could be built.
- **010 (progression)** — shipped. Owns the rune rows, the staged purchase, the
  ledger and the melt-down refund.
- **`resources/mechanics/06-progression.md` § The utility catalog** — the
  authority for all 33 effects. Canon; not to be re-derived here.
- **`resources/mechanics/05-status.md`** — the vocabulary the trigger and ward
  shapes are built from, including the one extension the catalog needs: a
  duration class beyond the 4-turn ceiling, applicable only to rune effects,
  which is what makes a rune feel unlike a power rider.
