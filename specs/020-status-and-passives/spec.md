# Feature Specification: Status Effects and Passives — the half of combat that never ran

**Feature Branch**: `020-status-and-passives`

**Created**: 2026-08-01

**Status**: Draft

**Input**: Jon, 2026-08-01: *"let's make sure all the passives are actually
implemented, and I want the unique passives to be powerful. Not overpowered, but
I want to really make a hero unique and have it affect their gameplay"* — then,
on being shown that passives sit behind the status layer, **"ok, do what you need
to."**

---

## TL;DR

**Right now a LMNTLZ battle is two squads hitting each other for numbers, and
nothing else.** Every burn, stun, shield, slow, armor-strip and buff the game
tells a player about is decoration — the text is on the screen, the effect never
happens. The same is true of all 40 champion passives: 21 of them show the player
a sentence describing something the engine has never once done.

This is not a pile of small gaps. It is **one missing layer** with everything else
stacked on top of it. The design for that layer is finished and numbered down to
the last magnitude; it was simply never built. This feature builds it, then turns
on the ~61 power riders and 40 passives that have been waiting on it — and ends
with the thing Jon actually asked for, which is that **picking Marisel instead of
Boldrek changes how the battle plays**, not just which colour the numbers are.

---

## Why this feature exists

Three layers are involved and **the missing part is the middle one in all three.**

| Layer | What exists | What is absent |
|---|---|---|
| Types | `StatusInstance`, `HeroState.statuses`, `isIncapacitated`, `EFFECT_ORDER` | nothing ever **creates**, **ticks** or **expires** one |
| Power data | 87 authored powers with tier, multiplier, cooldown, types, targets | the `Power` record has **no rider field at all** |
| Passives | 40 named, schema-enforced as a tuple, shown in the roster drawer | **zero** consumers in the engine or the API |

The consequences compound in a way that is easy to miss:

- `resolve.ts` returns `ridersLanded: []` **hardcoded at every exit**, under a
  comment explaining that no rider is authored on any power. It is honest, and it
  means the rider half of the resolution pipeline is a no-op.
- `riderLandProbability` computes a correct, spec-conformant number that is then
  **thrown away**. Its accuracy-clamp bug was found and fixed earlier the same
  day — on a function with no consumer.
- `board.ts` starts every hero `statuses: []` and no code path ever appends, so
  `isIncapacitated` is a correct reader of a field that is permanently empty.
- Because Tank's `Hold the Line` (taunt) and Buffer's `Behind the Line` (fade)
  are both statuses, **`Role` has no mechanical existence whatsoever.** The four
  roles are currently a label on a card.

### What is *not* missing

`resources/mechanics/05-status.md` is **complete** — every "Open" item struck
through and settled. It fixes, with numbers: the per-tier magnitude, duration,
DoT-tick and shield table; the potency ladder (20/28/36/44/52) contested against
`Resolve` on the `Luck` die; *different sources stack, the same source refreshes*;
per-family stack caps; shred as a **percentage** and the arithmetic proving why
flat points are backwards; DoT snapshotted at application; the clock (`Upkeep`
ticks damage, `Resolution` ticks duration); `Toughness` buffs as temporary HP; and
the visibility rule. **This feature authors almost no new rules.** It is an
implementation of a settled specification, plus one genuine authoring job (US3).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A power does what its text says (Priority: P1) 🎯 MVP

A player reads *"Root and Hold — briefly slows the target's next turn"*, fires it,
and the target is slower on its next turn. Today the damage lands and the slow
does not exist. This story makes the promise on the card true for every power that
makes one.

It has three parts and they are inseparable: the **status core** (what an effect
is, how it lands, stacks, ticks and expires), the **rider data** (which power
applies what — currently unrepresentable, because `Power` has no field for it),
and the **resolver wiring** (staging, contesting and enacting them in the existing
five-phase turn).

**Why this priority**: it is the layer everything else stands on — US2 and US3 are
almost entirely expressed *in* statuses, and neither can start before it. It is
also the biggest single correctness win available: it turns on effects across
**~61 of 87 active powers** at once, which no later story comes close to.

**Independent Test**: run a battle in which one squad fires only rider-carrying
powers and assert the bearer's state changes — a burn appears, ticks for its
snapshotted amount in the bearer's Upkeep across the right number of turns, and is
gone on schedule. Fully testable in `packages/sim` with no client and no database.

**Acceptance Scenarios**:

1. **Given** a tier-1 power whose rider is a slow, **When** it resolves and the
   rider contest succeeds, **Then** the target carries a `Speed` modification of
   −10 lasting 1 turn, and the turn-order projection reflects it immediately.
2. **Given** a burn applied by a hero with `Might` 40, **When** the applier is
   then killed, **Then** the burn continues ticking its snapshotted amount —
   application-time `Might` and type multiplier, never recalculated.
3. **Given** a hero bearing a burn, **When** its Upkeep runs, **Then** the tick is
   dealt before it acts, and if the tick reduces it to 0 HP its turn ends there
   and no other phase runs.
4. **Given** the same power applied twice by the same hero, **When** the second
   application lands, **Then** the duration refreshes and the magnitude does not
   add; **Given** the same effect from two *different* sources, **Then** both
   apply and their magnitudes add.
5. **Given** a hero at `Might` 45 receiving three separate +10 `Might` buffs,
   **When** its damage is computed, **Then** it uses `Might` 75, not 85 — the stat
   cap does the limiting and the overflow is silently discarded.
6. **Given** a friendly power carrying a buff aimed at an ally, **When** it
   resolves, **Then** no rider contest is rolled and no RNG draw is consumed.
7. **Given** an existing stored replay recorded before this feature, **When** it is
   re-derived, **Then** it produces byte-identical output to what it produced
   before — the engine version gates any change in draw consumption.

---

### User Story 2 — Role and House mean something (Priority: P2)

Every champion carries three passives: one from its **Role**, one from its
**House**, one **unique** to it. Thirteen of those — the 4 role and 9 house — are
already written with settled effects. This story gives them trigger points in the
engine and implements them.

The payoff is structural rather than cosmetic. `Hold the Line` is a permanent
taunt and `Behind the Line` a permanent fade; **the two cancel on the same hero**,
which is precisely what makes Tank and Buffer each other's counter. Implementing
them is what gives the four Roles their first mechanical existence.

**Why this priority**: it is the largest identity gain per unit of work — 13
effects covering all 27 champions, with the rules already written and no authoring
required. It depends on US1 for taunt, fade, burn escalation, bleed-on-crit, shred
persistence, control shortening and cumulative armor shave; **only `Finish It` and
`Measured Shot` could ship without it**, being pure damage math.

**Independent Test**: build a squad of one Tank and one Buffer against a single
attacker with a free choice of target, and assert the attacker is compelled to the
Tank and cannot see the Buffer — then put both passives on one hero and assert the
choice is unconstrained, proving they cancel.

**Acceptance Scenarios**:

1. **Given** a Tank in the attacker's reach, **When** the attacker selects a
   target, **Then** it is compelled to the Tank — and **Given** the Tank is out of
   reach, **Then** the attacker chooses freely, because the taunt is row-scoped.
2. **Given** a Buffer with `Behind the Line`, **When** it is the only reachable
   enemy, **Then** the fade is ignored rather than emptying the candidate set.
3. **Given** a burn applied by a Fire-House champion, **When** it ticks, **Then**
   each tick is 50% of the base tick larger than the last, where a non-Fire burn
   stays level.
4. **Given** a Crush-House champion attacking the same target repeatedly, **When**
   each attack lands, **Then** the target's `Armor` is shaved cumulatively.

---

### User Story 3 — Each champion plays differently (Priority: P3)

Twenty-seven unique passives, one per champion. **Eight already have authored
effects**; the other nineteen are named and unwritten, which is why the roster
drawer currently tells a player *"Effect not yet specified"* about `The Long
Patience`. This story writes the nineteen and implements all twenty-seven.

Jon's brief, verbatim: **powerful but not overpowered — enough to really make a
hero unique and affect their gameplay.** He chose to review a drafted table and
approve, reject or edit it line by line rather than specify them himself.

**Why this priority**: it is the only part of this feature that is genuinely
*authoring* rather than implementation, so it carries design risk the other
stories do not, and it is the one place a wrong number cannot be corrected later
without cost — the no-nerf rule (Constitution XIV) means an overpowered passive
must be answered by raising twenty-six others. It is therefore last, and gated on
an explicit approval step.

**Independent Test**: for each of the 27, a test that the passive changes an
observable battle outcome — the same board, the same seed, the passive suppressed
versus active, must diverge. A passive that cannot make the engine behave
differently has not been implemented, whatever its catalog entry says.

**Acceptance Scenarios**:

1. **Given** the 19 unwritten uniques, **When** the draft table is produced,
   **Then** each row states a trigger, an effect, a magnitude and the tier-scale
   or existing mechanic it is priced against — and no row is implemented before
   Jon accepts it.
2. **Given** an approved unique passive, **When** two otherwise identical battles
   are run from the same seed with it active and suppressed, **Then** the event
   logs differ.
3. **Given** `The Bone Beneath`, **When** it is authored, **Then** it grants
   `Magic Resist` and not `Armor` — already settled by the balance review and
   recorded in the catalog, and the reason it is half-written rather than blank.
4. **Given** every champion on the roster, **When** the catalog is validated,
   **Then** no passive carries a null effect and none reads *"not yet specified"*.

---

### User Story 4 — The player can see what is on the board (Priority: P4)

A battle where six heroes carry a dozen invisible effects is unreadable. This
story surfaces them under the rule settled on 2026-07-27:

> **Exact remaining duration is visible on every effect *you* caused, and on every
> effect sitting on *your own* champions. The only thing hidden is what the enemy
> put on itself** — those show as a pip with no numeral.

**Why this priority**: it is the only story with no engine dependency beyond US1's
state being populated, and combat remains correct without it — but it is what
makes the other three legible to a human. It is last because a status row with
nothing to draw is untestable.

**Independent Test**: render a battle view from a fixture board carrying one
effect of each visibility class and assert exactly which ones show a numeral.

**Acceptance Scenarios**:

1. **Given** a burn the player applied to an enemy, **When** the status row
   renders, **Then** it shows the exact turns remaining.
2. **Given** a stun on one of the player's own champions, **Then** the exact turns
   remaining are shown, regardless of who caused it.
3. **Given** an enemy's self-applied shield, **Then** a pip renders with no
   numeral, and the duration is not present in the payload the client receives.

---

### Edge Cases

- **A damage-over-time effect kills its bearer during Upkeep.** Already answered
  by `phasesFor` — the turn ends at Upkeep and no later phase runs — but nothing
  has ever exercised it, because no DoT has ever existed.
- **A `Toughness` buff expires.** Maximum HP falls and current HP must be clamped
  down to it. A hero whose current HP was entirely temporary must not survive at
  a negative pool, and must not be double-counted as a death.
- **A stat debuff drives a stat below zero.** `cappedStat` floors at 0; a
  `Speed` of 0 must still act, since the accumulator's base is `50 + Speed`.
- **A shield breaks part-way through a hit.** The remainder passes through in the
  same step — a shield never absorbs a whole strike for free.
- **Taunt and fade land on the same hero.** They cancel. This is the Tank/Buffer
  counter and it must hold for status-applied instances, not only passive ones.
- **A fade would empty the candidate set.** It is ignored rather than producing an
  unresolvable board — the existing targeting invariant.
- **The applier dies before its burn expires.** The effect is unchanged, which is
  exactly what snapshotting at application buys.
- **A cleanse meets an uncleansable effect.** Ember Saelith's burns and Umbriel's
  debuffs cannot be removed early but still expire normally.
- **Stack caps are reached.** A fourth DoT on one target, a second shield, a
  second stun — each family's rule differs and each must be exercised.
- **A rider is applied by a power that deals neither damage nor healing.** It
  skips the Defense phase, so its rider is contested *and* enacted in phase 4.
- **Draw accounting changes.** Rider contests consume RNG draws that battles
  recorded before this feature did not consume. Stored replays must still
  re-derive identically.

---

## Requirements *(mandatory)*

### Functional Requirements

**The status core**

- **FR-001**: The system MUST define a single catalog of status kinds covering the
  six families named in `05-status.md` — damage over time, stat modifier,
  mitigation shred, shield, targeting (taunt / fade), and control (stun / silence)
  — with each kind declaring its own stacking rule.
- **FR-002**: The system MUST derive an effect's magnitude and duration from the
  **tier of the power applying it** and never from per-power authored numbers,
  per the indexed scale in `05-status.md`.
- **FR-003**: The system MUST contest a hostile rider as
  `potency + rand(1..Luck×1.5)` against `Resolve + rand(1..Luck×1.5)`, ties to the
  defender, with potency derived from tier as 20/28/36/44/52 — and MUST NOT route
  this contest through the accuracy clamp, which applies to attacks only.
- **FR-004**: The system MUST contest **each rider separately**, so resisting one
  effect from a power does not resist another.
- **FR-005**: The system MUST NOT contest a rider carried by a friendly power, and
  MUST NOT consume an RNG draw for it.
- **FR-006**: The system MUST refresh duration without adding magnitude when the
  **same source** reapplies an effect, and MUST accumulate when the sources
  **differ**.
- **FR-007**: The system MUST enforce per-family stack limits: 3 damage-over-time
  instances per target; one shield at a time, the larger replacing the smaller;
  stun and silence never stacking.
- **FR-008**: The system MUST snapshot a damage-over-time effect at application —
  tick damage from the applier's `Might` at that moment and the type multiplier
  against that target — and MUST NOT recalculate it thereafter.
- **FR-009**: The system MUST tick damage-over-time effects in the **bearer's
  Upkeep**, before it acts.
- **FR-010**: The system MUST decrement every effect's remaining duration in the
  **bearer's Resolution** phase, unconditionally, including for a bearer that lost
  its turn to control.
- **FR-011**: The system MUST express mitigation shred as a **percentage** of the
  target's resistance stat — 20% / 30% / 40% by band — and never as flat points.
- **FR-012**: The system MUST apply a `Toughness` buff as an increase to maximum
  HP *and* an equal increase to current HP, and on expiry MUST lower maximum HP
  and clamp current HP down to it.
- **FR-013**: The system MUST deplete a shield before the health pool and MUST
  pass the remainder of a breaking hit through in the same step.
- **FR-014**: Every stat modification MUST be flat points, including `Speed`, and
  MUST read through the existing 0–75 clamp.

**Rider data**

- **FR-015**: The content record for a power MUST be able to express the riders it
  applies, including which family, which stat where applicable, and whether the
  rider targets the caster or the struck hero.
- **FR-016**: Rider data MUST be authored data, validated at build time against
  the power list, and MUST fail the build when it names a power that does not
  exist — matching the existing overlay's drift check.
- **FR-017**: Rider data MUST NOT carry magnitudes or durations; those derive from
  tier (FR-002).
- **FR-018**: Every one of the 87 active powers MUST be accounted for — either
  carrying authored riders or explicitly recorded as carrying none, so that "not
  yet authored" and "deliberately has none" are distinguishable.

**Passives**

- **FR-019**: The engine MUST expose trigger points sufficient for the authored
  passives — at minimum: on-hit, on-miss, on-crit, on-kill, on-damaged, on
  turn-start, and on target selection.
- **FR-020**: The system MUST implement all 40 passives such that each one changes
  an observable battle outcome.
- **FR-021**: Taunt and fade MUST cancel when both are present on the same hero,
  whether granted by passive or applied as a status.
- **FR-022**: A passive MUST NOT be able to produce an unresolvable board; a
  targeting filter that would empty the candidate set is ignored.
- **FR-023**: The 19 unique passives without authored effects MUST be drafted with
  trigger, effect, magnitude and the scale each is priced against, and MUST be
  approved before implementation.
- **FR-024**: The catalog MUST NOT report any passive as having an unspecified
  effect once this feature completes, and a validation test MUST enforce it.

**Presentation and boundaries**

- **FR-025**: The system MUST send exact remaining duration only for effects the
  viewing player caused and effects on the viewing player's own champions; an
  enemy's self-applied effect MUST be sent as presence only, with no duration.
- **FR-026**: The status catalog MUST have exactly one implementation, in the
  shared rules package; the client MUST NOT contain a second copy of any
  magnitude, duration, potency or stacking rule.
- **FR-027**: Resolution MUST remain server-authoritative and the RNG seed MUST
  NOT leave the server; rider contests are resolved where the other draws are.
- **FR-028**: Stored replays recorded before this feature MUST re-derive to
  identical output after it; any change to draw consumption MUST be gated on the
  recorded engine version.

### Key Entities

- **Status kind** — one of the six families, with its own stacking rule, its own
  clock behaviour (ticks in Upkeep, or merely counts down), and its own reader in
  the damage, stat or targeting path.
- **Status instance** — a kind, a remaining duration, a magnitude fixed at
  application, the instance that applied it, and the power it came from. The
  source identity is what makes *refresh versus stack* decidable.
- **Rider** — authored on a power: which family, against which stat, aimed at the
  caster or the target. Carries no numbers of its own.
- **Passive** — a named effect bound to a champion, a role or a house, expressed
  as a trigger plus a consequence, read by the engine at defined hook points.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Of the 87 active powers, **100% are accounted for** — each either
  carries authored riders or is explicitly recorded as carrying none. No power is
  silently unauthored.
- **SC-002**: All **40 passives** produce a divergent battle outcome when
  suppressed versus active on the same board and seed. None is inert.
- **SC-003**: **Zero** effects in the player-facing catalog read as unspecified.
- **SC-004**: A battle fought between two identical squads differing only in one
  champion's House produces measurably different outcomes over 100 seeded runs —
  House identity is mechanically real, not flavor.
- **SC-005**: Every stored replay recorded before this feature re-derives to
  byte-identical output after it. Zero regressions in the existing determinism,
  draw-order and seed-custody suites.
- **SC-006**: No magnitude, duration, potency or stacking value appears in more
  than one place in the codebase.
- **SC-007**: A player watching a battle can tell, without reading the rules, that
  a champion is burning, slowed, shielded or stunned, and how much longer it lasts
  where the visibility rule permits.
- **SC-008**: Median battle length stays within the band established by the
  accuracy work (~102 hero-turns); control and damage-over-time must not push
  battles materially longer or shorter.

## Assumptions

- **`05-status.md` is authoritative and complete.** Where it and a generated
  design screen disagree, it wins. Where it and a workbook prompt disagree on a
  magnitude, it wins — the prompts describe effects in adjectives and this
  document is what the adjectives mean.
- **Rider authoring is a per-power reading job, not an extraction.** The explicit
  `Rider:` clause is a tier-1/tier-2 convention only; tiers 3–5 fold their effects
  into prose, and the 8 tier-0 autos state they have none. A regex over the prompt
  column would produce a plausible and wrong answer, so each power is read.
- **The existing overlay is the right home for rider data.** `power-targeting.json`
  already carries authored power facts the workbook cannot express, with a
  build-time drift check. Riders are the same class of data. The overlay's own
  comment says it should eventually become columns in the workbook; that
  migration is out of scope here.
- **Reactive powers stay out of scope.** The overlay authors zero of them today,
  which leaves `Already Gone` and `Nothing to Discuss` — both of which reference
  reactions — implementable only in the degenerate case. This is recorded as a
  known limit rather than solved.
- **The 33 tier-4 rune utility effects are a separate feature** that depends on
  this one. Stage 4 currently charges 200 shards and writes nothing; that is real
  and it is not fixed here.
- **019's remaining visual treatments are not blocked by this** and are not
  addressed by it.
- Balance tuning of the authored magnitudes is expected to continue after this
  feature ships; the no-nerf rule (Constitution XIV) means US3's numbers get the
  most scrutiny before landing, not after.
