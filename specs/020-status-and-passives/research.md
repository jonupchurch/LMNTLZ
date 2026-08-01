# Phase 0 — Research

Five decisions, each with what was rejected. Everything here was established by reading
the code, not by recalling it; file and line references are the evidence.

---

## §1 — Where the status catalog lives, and its shape

**Decision.** A new `packages/sim/rules/status.ts` holds the **catalog** (six families,
each declaring its own stacking rule and clock behaviour) and the **pure transitions**
(`applyStatus`, `tickDurations`, `expire`). The **contest** — the roll that decides
whether a hostile rider sticks — lives in `packages/sim/resolver/`, beside the hit and
crit draws.

**Rationale.** Two constitutional constraints intersect and jointly force this split:

- XIII says a rule outcome may not be computed outside `packages/sim`'s rules half, so
  the magnitudes, durations and stacking rules cannot live in `apps/api` or the client.
- XII says RNG is confined to the resolver, and a rider contest draws.

The repo already divides exactly this way: `damage.ts` returns *a range and a
probability* and decides nothing, while `resolve.ts` turns that probability into an
outcome. `riderLandProbability` already exists in `rules/probability.ts`, computing a
correct number that nothing consumes — so the rules-side half of this decision is
already built and merely unused.

**Alternatives rejected.**

| Rejected | Why |
|---|---|
| Put the catalog in `apps/api/src/battle/` beside the turn loop | Violates XIII. It would also make the client unable to render an effect's name or icon without a second copy of the table. |
| Put contests in `rules/` and pass an RNG in | Makes `rules/` impure, which `determinism.test.ts` exists to prevent — it evaluates the same state a thousand times and demands byte-identical answers. |
| One `Status` class with methods per family | The package is uniformly `readonly` data plus free functions. A class would be the only one in the codebase, and `determinism` relies on state being plain values. |

### The trap that changes the shape: `statMods` is already taken

**`board.ts` writes rune allocations into `HeroState.statMods`** ([board.ts:204](../../apps/api/src/battle/board.ts#L204)),
and `effectiveStat` is its only reader. So `statMods` already means *permanent points a
player bought*.

If a `+10 Might` buff were written into the same record, expiring it would mean
subtracting 10 — from a bag that also contains rune points, with **no way to tell whose
10 it was**. A player with a `+10 Might` rune who received and lost a `+10 Might` buff
would end the battle with their rune's points gone. It would be silent, it would only
affect players who own runes, and no existing test would see it.

> **Decision: status stat changes are a *derived* layer, never a stored one.**
> `effectiveStat` becomes `cappedStat(base, hero.statMods[key] + statusPoints(hero, key))`
> where `statusPoints` sums `hero.statuses`. Expiry then removes the contribution *by
> construction* — dropping the status is the whole of the operation.

This is the same *"is it a rule or a reading"* call the matchmaking cap needed: the
permanent layer is stored, the temporary layer is read off the statuses that are already
there. Two writers to one field is the failure mode being avoided.

**One consequence to carry into the tasks**: `maxHp` is `Toughness × 8` read through
`effectiveStat`, so a `Toughness` buff raises maximum HP for free. `05-status.md`
additionally requires it to grant the same amount as *current* HP and to clamp current
HP down on expiry — that part is a real state change and belongs in the turn loop, not
in the derived reader.

---

## §2 — Where rider data is authored

**Decision.** A new **`tools/power-riders.json`**, a sibling of the existing
`tools/power-targeting.json`, read and drift-checked by `tools/build-content.ts`, feeding
a new `riders` field on `powerSchema`.

**Rationale.** `Power` has no rider field at all today
([schema.ts:105-134](../../packages/content/src/schema.ts#L105-L134)) — `id`, `name`,
`tier`, `multiplier`, `cooldown`, `gateTurn`, `types`, `targets`, `friendly`, `reactive`
and nothing else. A rider is therefore **unrepresentable**, which is a stronger statement
than unauthored, and it is why `resolve.ts` can honestly hardcode `ridersLanded: []`.

The workbook has no rider column either. But the repo has already solved this exact
problem once: `power-targeting.json` exists precisely because *"the workbook has no
column for any of the three"* and carries `targets`, `friendly`, `reactive` and
`noDamage` as authored JSON, validated against the workbook's power list so a renamed
power fails the build rather than silently losing its data. Riders are the same class of
data with the same failure mode.

**A separate file rather than a fifth key in the existing one.** `power-targeting.json`
is about *who a power aims at*; riders are about *what it does on arrival*. More
practically, the existing file's own comment says it should disappear into three
workbook columns — folding a much larger dataset into it would make that migration
harder, and the two have different destinies.

**What the file may and may not contain.** Family, stat (where the family needs one), and
whether the rider lands on the caster or the struck hero. **No magnitudes and no
durations** — those derive from the power's tier via the `05-status.md` table, so XV is
satisfied and a rebalance changes one table rather than 87 entries. A magnitude in this
file is a schema error.

**Alternatives rejected.**

| Rejected | Why |
|---|---|
| Add rider columns to `hero-stats.xlsx` | Jon has no Excel; edits require patching sheet XML inside the zip. The overlay's own comment already flags the workbook as the eventual home — that migration is a separate job, not a prerequisite. |
| A hand-written TypeScript table in `packages/content/src/` (as `passives.ts` does) | Works, but loses the build-time drift check against the workbook's power list. `passives.ts` gets away with it because passive *names* come from the workbook and are cross-checked by a test; rider data has no such anchor. |
| Parse riders out of the `Prompt` column automatically | **Actively rejected — a regex here gives a plausible wrong answer.** The explicit `Rider:` clause is a tier-1/tier-2 convention: 18 powers carry it, the 8 tier-0 autos say they have *none*, and every tier-3/4/5 power folds its effect into prose ("Coll also gains a temporary Magic Resist buff"). An extractor would silently produce zero riders for the entire top half of the roster. Authoring is a per-power read of 87 prompts. |

---

## §3 — The RNG draw order, and Constitution XVI

**Decision.** `engineVersion()` moves **`e0.2.0` → `e0.3.0`**. In-flight battles are
drained before the switch. No backfill is attempted, because none is possible or needed.

**Rationale.** The within-action draw order is explicitly part of the engine contract
and is documented at [resolve.ts:125-140](../../packages/sim/resolver/resolve.ts#L125-L140):

```
1. hit    — exactly one draw
2. crit   — one draw per packet, and only if the hit landed
3. riders — one contest each, and only if the payload connected
4. targeting tiebreak — only if the earlier tiebreaks left a choice
```

**Step 3 is already reserved for exactly this feature.** That is fortunate but not
sufficient: a battle recorded before 020 consumed *zero* draws at step 3, so re-deriving
it under the new engine would read a different index for step 4 and every subsequent
action. The comment already states the consequence — *"adding, removing or reordering a
draw changes every in-flight battle's future, which is what `engineVersion` identifies
and why deploys drain before switching."*

**Stored replays are unaffected, and this is worth being precise about.** A replay is a
stored JSON event log and is **never re-simulated** — that is the whole point of XVI and
why a balance patch cannot reach backwards. Replays carry the engine version they were
recorded under and play back as recorded. The risk is confined to *in-progress* battles,
which are re-derived from their action log on every request.

**No new persisted field.** Statuses are re-derived, never stored, so there is no column
that would need to have existed from the first record. The event log's `ridersLanded`
and `ridersResisted` fields **already exist** on `ResolvedPacket` and in the client's
types — they have simply always been empty. This is the rare XVI check that passes
because the foresight was already exercised.

**Two rules for implementation, both testable.**

1. *Lazy is not an order.* Each step is **skipped**, not drawn-and-discarded — which is
   why a miss consumes one index and a landed hit consumes two. A friendly power must
   therefore consume **zero** rider draws, per FR-005.
2. *Each rider is contested separately* (FR-004), so a power with two riders consumes two
   draws, in a deterministic order — the authored order in the overlay, never the
   iteration order of an object.

**Alternatives rejected.**

| Rejected | Why |
|---|---|
| Draw for every rider unconditionally, including friendly ones, to keep the count fixed | Simpler to reason about, but it contradicts the documented "skipped rather than drawn-and-discarded" rule and would change the draw count for *every* existing action, not only rider-carrying ones. |
| Keep `e0.2.0` and accept the divergence | Violates XVI outright. In-flight battles would resolve differently from how they started, invisibly. |
| Version per-rule rather than per-engine | The version is already a single engine-wide string that battle rows and replays carry. Splitting it is a schema change to a persisted field — precisely the thing XVI warns cannot be retrofitted. |

---

## §4 — Passive hook points

**Decision.** Reuse `TargetFilter` and `Compulsion` from `rules/targeting.ts` for the
targeting-shaped passives, and add a small set of named hooks for the rest. Feed them
into `legalTargets`, which **already accepts both parameters and is never given them**.

**Rationale.** [targeting.ts:94-126](../../packages/sim/rules/targeting.ts#L94-L126)
defines `legalTargets(state, actorInstanceId, powerId, filters = [], compulsion = null)`.
The resolver calls it as `legalTargets(state, actor.instanceId, power.id)` — three
arguments. **The taunt and fade machinery is fully built and has never had a caller**,
which is the same seam-with-no-caller shape this repo keeps producing.

Better still, the hard part is already solved. The module documents two invariants that
make an unresolvable board impossible, and notes that taunt/fade cancellation *"falls out
rather than being special-cased: a compulsion and a restriction naming the same hero
cancel, because the filter runs first and removes the hero, and then the compulsion finds
its target absent."* That is FR-021 and it needs no new code — only a test.

**The hook set**, kept minimal and driven by what the 13 authored passives actually need:

| Hook | Needed by |
|---|---|
| `onTargetSelection` (filters + compulsion) | `Hold the Line`, `Behind the Line`, `Nothing Stays Hidden`, `Immovable` |
| `onDamageDealt` | `Finish It`, `Measured Shot`, `Nothing Holds`, `Find the Seam`, `The Duelist's Habit`, `It All Comes Back` |
| `onCrit` | `The Cut Reopens`, `No Warning` |
| `onMissed` | `Never Where You Struck` |
| `onDeathNearby` | `The Veil Closes` |
| `onStatusApplied` | `It Catches`, `Banked Coals`, `Wears Through`, `The Deep Holds`, `Never Quite Out`, `Written in Pencil` |

`EFFECT_ORDER` in `phases.ts` already fixes the order within Additional Effects —
`riders → on-hit-triggers → reactions → attacker-self-effects → second-death-check` —
and bounds it with *"a reaction cannot trigger a reaction."* The hooks map onto those
steps rather than introducing a parallel ordering.

**Alternatives rejected.**

| Rejected | Why |
|---|---|
| A generic event bus with passives subscribing | Ordering becomes emergent, and `EFFECT_ORDER` exists precisely because *"every one of these can kill, and the order decides who is still standing to act."* |
| A `passive.apply(state)` interface per passive | Hides which hook a passive uses, so the engine must offer every passive every opportunity. Named hooks make the surface auditable. |
| Special-case taunt/fade cancellation | Already emergent from filter-then-compulsion ordering. Adding a special case would create a second implementation of a rule that works. |

---

## §5 — How the 19 unique passives get authored

**Decision.** One table, all 19 rows, delivered for line-by-line accept / reject / edit
**before any of them is implemented**. Each row states trigger, effect, magnitude, and
**the thing its magnitude is priced against**. Approved rows land in
`resources/mechanics/` in the same commit that implements them.

**Rationale.** Jon chose *"I draft, you approve"* and asked for **powerful but not
overpowered — enough to really make a hero unique and affect their gameplay.** Two
project rules make the gate mandatory rather than polite:

- **Constitution XIV**: a passive that lands too strong can only be corrected by raising
  the other twenty-six, because a nerf writes off player spend and stored replays mean a
  patch cannot reach backwards anyway. The cheap moment to be wrong is *before* it ships.
- **XX**: these are new authored rules, so the document moves with the code. A magnitude
  that exists only in TypeScript is not canon and the next reader will re-derive
  something else.

**The pricing anchors**, so "powerful but not overpowered" is measurable rather than a
feeling:

- The tier scale in `05-status.md` — ±10 through ±25, 1 to 4 turns.
- **One turn of stun is the strongest single effect in the game** and should never scale
  past that.
- `Seams Everywhere` at ×0.70 mitigation and `Room to Swing` at +5 Armor per enemy capped
  at +30 are two already-balanced uniques to calibrate against; the second exists *because*
  the first version overcapped.
- A hero has ~35 points of headroom over a typical stat against the 75 cap, and
  overcapping is silent waste.

**Eight of the 27 are already authored and stay exactly as they are.** One more,
`The Bone Beneath`, is half-settled — the balance review fixed that it grants **`Magic
Resist`, not `Armor`**, because every arcane hero sits at the roster-minimum Armor 15.
That constraint is recorded in the catalog and the draft starts from it rather than
rediscovering it.

**Alternatives rejected.**

| Rejected | Why |
|---|---|
| Implement all 19 and let Jon tune afterwards | Inverts the no-nerf rule. Tuning down after shipping is the expensive direction. |
| Ask Jon to author all 19 himself | He explicitly chose the draft-and-approve split. |
| Generate them from a template per Role or House | They are the *unique* layer — the one thing distinguishing two champions who share a Role and a House. A template would defeat the entire purpose. |

---

## Open questions

**None blocking.** One judgement call is deliberately deferred to implementation because
the answer is cheap to change and expensive to guess:

- **Whether `onStatusApplied` needs to fire for effects a hero applies to *itself*.**
  `Banked Coals` (+1 turn to Cindara's effects) and `Never Quite Out` (her burns cannot
  be cleansed) both read naturally either way. Decided when the first of the two is
  implemented, with a test either way; it changes no interface.
