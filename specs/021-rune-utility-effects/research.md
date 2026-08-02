# Phase 0 — Research: Rune Utility Effects

**Feature**: `021-rune-utility-effects` · **Date**: 2026-08-01

Five decisions the plan had to settle, plus one finding that changes the shape of
the whole feature. Every claim below was read in the source, and the line numbers
are current as of `17197d5`.

---

## Finding 0 — 21 of 22 hook readers go through one function

This is the keystone, and it was found by scanning `passives.ts` for every
registry lookup rather than by reasoning about the design.

```
packages/sim/rules/passives.ts
  1313  export function hooksFor(heroId: string): readonly PassiveHooks[]
  1322  const hooksOf = (hero: HeroState) => hooksFor(hero.heroId)
        ... 21 readers call hooksOf(...)
  1498  const actorHooks = hooksFor(heroStateOf(state, actorInstanceId).heroId)   ← the one bypass
```

**Decision**: widen `hooksOf` to return passive hooks **plus** the hooks of
whatever rune effects that hero instance carries. Twenty-one readers —
`damageMultiplier`, `penetrationBonus`, `mitigationMultiplier`,
`incomingMultiplier`, `critMultiplier`, `statBonus`, `cooldownExtension`,
`lethalGuard`, `shapeOutgoing`, `shapeIncoming`, `onStrike`, `onCrit`, `onMissed`,
`onStruck`, `onAllyStruck`, `onApplied`, `onUpkeep`, `onAct`, `onDeathNearby`,
`onAnyDeath` and the targeting scan — then support rune effects with **no further
change**.

**The bypass at line 1498 is not cosmetic.** It is the lookup that decides
`ignoresFade` and `immuneToTaunt` for the *acting* hero. Left alone, a rune effect
granting fade-piercing would be read for every hero on the board except the one
actually taking the turn — which is to say, never. That is precisely
`Nowhere to Stand`, one of the two deliberate counter-pair effects.

> **A test must assert the invariant rather than the list.** The guard reads the
> `passives.ts` source and fails if any registry lookup other than `hooksOf`'s own
> definition calls `hooksFor` directly. Listing today's readers by hand is how the
> anti-vacuity guard in 020 went stale the moment US3 added eleven hooks.

**Alternatives considered**

- *A parallel `runeHooksFor` called beside `hooksFor` at each of 22 sites.* Rejected:
  22 edit sites, each of which can be forgotten, and no invariant to test.
- *An event bus.* Rejected for the reason `PassiveHooks` documents at line 414 —
  a bus makes ordering emergent, and `EFFECT_ORDER` exists because every effect in
  that phase can kill.

---

## Decision 1 — The catalog lives in `packages/sim/rules/runeEffects.ts` and reuses `PassiveHooks` by name

**Decision**: one new module, `packages/sim/rules/runeEffects.ts`, exporting a
frozen `RUNE_MAGNITUDES` object, a `RUNE_EFFECTS` registry keyed by effect id, and
the pool membership tables. It reuses the **existing `PassiveHooks` interface
verbatim** — no rename to `EffectHooks`.

**Rationale**: the rename is churn with a real cost and no benefit. `PassiveHooks`
is referenced across `passives.ts`, `resolve.ts`, `rules/index.ts` and four test
files; renaming touches all of them, makes the 020 history harder to read, and
buys only a more accurate noun. The type describes *what a thing can hook*, and
that is identical for both. The distinction that actually matters is not the type
but the **lookup key**, which Decision 2 handles.

The one thing that must not be shared is the *registry*: `REGISTRY` in
`passives.ts` is keyed by passive name and looked up from `hero.passives`.
`RUNE_EFFECTS` is keyed by effect id and looked up from the snapshot. Two
registries, one hook type.

**Alternatives considered**

- *Rename to `EffectHooks`.* Rejected as above. Revisit if a third kind of effect
  source ever appears; two is not a pattern.
- *Put the catalog in `packages/content` beside the powers.* Rejected on
  Constitution XIII and on a hard constraint: `packages/content` **cannot import
  `packages/sim`**, so a magnitude living there could never be kept honest against
  the engine. This is the mistake already recorded for passive *text* — the
  content package carries the words with none of the numbers.
- *Put it in `apps/api`.* Rejected on XIII outright: the Forge must compute the
  same description the engine runs, and the Forge is a client.

---

## Decision 2 — Effects reach the engine as a new `readonly runeEffects: readonly string[]` on `HeroState`

**Decision**: add one field to `HeroState`, defaulted to the empty array by
`board.ts`, populated from the snapshot's existing `RuneLoadout.utility`.

**Rationale**: rune effects are **per-instance, not per-hero-identity**, and this
is the decisive point. `hooksFor` keys off `heroId`, which is correct for passives
because every copy of a champion has the same three. Runes are per *account*, so
an attacker and a defender fielding the same champion carry different runes — and
a champion may hold a seat in both defensive zones. Keying rune effects off
`heroId` would give one player's runes to their opponent's identical champion.

`HeroState` is also where the precedent already sits: `statMods` and `reachMod`
are both per-instance rune-and-status carriers, and `reachMod`'s own comment says
*"e.g. +1 from a reach rune"* — the field was named for this feature before it
existed.

**Why not a side table on `BattleState`**: every one of the 21 readers has a
`HeroState` in hand and would have to be given the board as well to look up a side
table. Three of them (`shapeOutgoing`, `shapeIncoming`, `statBonus` via
`StatContext`) currently take no board at all.

**`Before the First Blow` resolves eagerly in `board.ts`.** The battle-start shield
is placed at board construction, next to where Toughness runes are already
resolved before `maxHp` — a comment there records why that ordering is
load-bearing. This means **no `onBattleStart` hook is needed at all**, removing one
of the fourteen capabilities in the spec's US2 table. A shield sized as a fraction
of max HP must be placed after `maxHp` is computed and before the first turn, and
`board.ts` is the only place that is both.

---

## Decision 3 — The 14 capabilities collapse to 9 hook-surface changes

Grouped by the change each requires, smallest first. **Five capabilities need no
new surface at all.**

| # | Change to the hook surface | Serves |
|---|---|---|
| — | *none — resolves in `board.ts` at construction* | `Before the First Blow` |
| — | *none — `targetingFor` already scans every hero* | `Nowhere to Stand` (after the line-1498 fix) |
| 1 | `shapeIncoming` / `shapeOutgoing` callbacks gain a `StatContext` second argument | `Not This Time`, `Turned Aside`, `It Stays Open`, `Stays Broken` |
| 2 | `targeting` accepts a predicate form `(ctx: StatContext) => TargetingFlags` alongside today's static object | `No One Saw` |
| 3 | New `PassiveEffect` kind `'damage'` | `Too Close` |
| 4 | New `PassiveEffect` kind `'cleanse'` | `It Passes Through`, `The Lamp Lifted` |
| 5 | New hook `healMultiplier?: (ctx) => number`, read in `healPreview` | `Draws It Up`, `Runs Dry` |
| 6 | New hook `critImmune?: boolean` / `critDowngrade?: (ctx) => boolean` | `All One Piece`, `Turned Aside` |
| 7 | New hook `ignoresShields?: boolean`, read in `spendShield` | `Straight Past` |
| 8 | New hook `hitFloor?: (ctx: StrikeContext) => number \| null` | `Held in the Light` |
| 9 | `HeroState` gains `readonly hasActed: boolean`; `onAct` sets it | `Before It Knew` |
| 10 | Bounded extra action in the turn loop | `On the Same Breath` |
| 11 | Re-tick hook on the upkeep pass | `The Draft` |

**The wards are one change, not two.** `Not This Time` (refuse the first Stun or
Silence) and `Turned Aside` (downgrade the first crit) both need *"has this charge
been spent"*, and both express it the way `lethalGuard` already does — by returning
the effects that pay for it, so *once per battle* needs no field on `HeroState`.
Giving the two shaping callbacks a `StatContext` is the whole change; the exported
`shapeIncoming(bearer, instance)` and `shapeOutgoing(applier, instance)` wrappers
**already hold the hero** (`passives.ts:1513`, `:1525`) and simply do not pass it
down.

**Cleanse immunity is a flag on the effect, not a hook.** `It Stays Open` and
`Stays Broken` both mean *"an effect I applied resists cleansing"*, which is a
property of the placed effect. It rides on change 1 via `shapeOutgoing`, setting a
new `readonly stubborn?: boolean` on the effect record that `cleanse` honours.

**`healPreview` reads no hooks today** (`damage.ts:369–390` — it computes from
`packetOf` and room only), so change 5 is a clean insertion rather than a
refactor. Both directions are needed: `Draws It Up` multiplies healing *received*,
`Runs Dry` halves the target's *next* heal, so the multiplier is looked up on the
target and can come from an effect the attacker placed.

---

## Decision 4 — `e0.5.0` → `e0.6.0`, and the reach roll is an intent-flow change

**Decision**: bump to `e0.6.0` in `rules/index.ts:308` in the same commit as US3,
never earlier. The four probabilistic effects are the only draws added.

**The draw budget, stated so the draw-order suite can assert it**:

| Effect | When it draws | Draws |
|---|---|---|
| `Further Than It Looks` | bearer's turn start, before targets are offered | 1 per turn of a bearer |
| `Take It Back` | attacker's strike, after the hit contest resolves | 1 per landed attack by a bearer |
| `Both Ways` | defender's on-struck, after the hit lands | 1 per landed attack **on** a bearer |
| `Knocked Loose` | attacker's strike, after the hit contest resolves | 1 per landed attack by a bearer, plus a contest draw when it fires |

**A hero carrying none of the four draws nothing**, which is what keeps every
existing determinism fixture green without a rewrite — the fixtures field no runes.

**The reach roll is not a resolver change.** The design requires it be rolled at
turn start and **shown before the player chooses**, so it must resolve when the
turn packet is built and travel in that packet, alongside the projected turn
queue. This is the same shape as 020's disclosure work: the server decides, the
client displays, and the client never rolls. A roll made at resolution time would
change the target list *after* the player had chosen from a smaller one — the exact
failure the design names.

**Constitution XVI**: stored replays carry their own `engineVersion` and are
replayed, never re-simulated. A battle recorded at `e0.5.0` never enters the
`e0.6.0` code path. The deploy must **drain** — the note is already in
`docs/tech-stack.md` from 020 T025 and needs no new writing, only obeying.

**Alternatives considered**

- *Draw for all four unconditionally so the draw count is constant.* Rejected: it
  would move the draw order for every existing battle, breaking exactly the
  fixtures the version gate exists to protect, and for no benefit.
- *Roll the reach at resolution.* Rejected by the design, explicitly.

---

## Decision 5 — Both write paths take a utility choice; the pool is validated server-side from `slotAccepts`

**Decision**: `advanceStage` gains a required utility argument **when and only
when** the advance is 3→4; `rebuildRune` gains one unconditionally, since a
rebuild always lands at stage 4.

**Rationale**: `rebuildRune(accountId, heroId, slot, allocations, confirmed)`
currently hardcodes `utilityEffect: null` at `runes.ts:377`, and the design
requires rebuilding to the same stage be **one transaction, not four** — so the
rebuild cannot lean on a later `advanceStage` call to fill the effect in. Both
paths must carry it.

**Validation is server-side and derived**, never trusted from the client and never
stored: `slotAccepts(heroId, slot)` already returns the element a slot accepts
(`'primary'` → `hero.primary`, `'secondary'` → `hero.secondary`, `common` → `null`),
which is exactly the pool key. The refusal names the mismatch rather than failing
generically, matching the house style of the existing `cap-exceeded` and
`slot-mismatch` refusals.

**No migration is required.** `runes.utility_effect` already exists as nullable
text and every existing row holds `null` — which is honest, because no player has
ever received an effect. Rows written before this feature stay `null` and read as
*"a complete rune whose effect predates the catalog"*; the read path's `stage >= 4`
gate already returns `null` safely for them.

> **Flagged for the tasks phase**: existing stage-4 rows are real purchases that
> paid 200 shards for nothing. Whether they are granted an effect retroactively,
> refunded, or left alone is a **product** decision, not a build one. It is not in
> this feature's scope and is recorded in `plan.md` under *Open, deliberately*.

---

## Carried forward, not resolved

Both flags from the spec survive this phase unchanged, by instruction.

1. **The catalog's economics assume ~102 hero-turns; battles run ~28.** Every
   decision above is battle-length-independent, and Decision 1's single frozen
   `RUNE_MAGNITUDES` object is what makes the later correction a one-file edit.
2. **A-02 through A-05 resolve conflicts rather than fill gaps** —
   `Held in the Light` versus the 65–95% clamp, `Weight Tells` naming a
   displacement mechanic the game does not have, `On the Same Breath`'s chain cap,
   and counter-pair precedence. Each has a working default; each is worth a
   sentence of confirmation before that effect is finalised.
