# Phase 1 — Data Model

Three entities, one of which already exists and needs widening. Nothing here is
persisted: statuses are re-derived from the action log on every request, so these are
in-memory shapes, not tables.

---

## `StatusInstance` — widened

Exists today in `packages/sim/rules/state.ts` with four fields, none of which is enough
to represent an effect:

```ts
// today
export interface StatusInstance {
  readonly kind: string;              // untyped
  readonly turnsRemaining: number;
  readonly potency: number;           // the contest value, already spent by the time it lands
  readonly sourceInstanceId: string;
}
```

It cannot express *how much* a buff is worth, *which stat* it touches, or a
damage-over-time effect's snapshotted tick. The widened shape:

| Field | Type | Notes |
|---|---|---|
| `kind` | `StatusKind` | **Typed**, from the catalog. A string today, which is how a typo becomes a silently inert effect. |
| `turnsRemaining` | `number` | Ticks in the bearer's Resolution. Already ticked by `applyResolution`. |
| `magnitude` | `number` | **Fixed at application.** Points for a stat change, a fraction for a shred, absorbed HP for a shield, per-tick damage for a DoT. |
| `stat` | `keyof HeroStats \| null` | Only for the stat-modifier and shred families. `null` elsewhere. |
| `sourceInstanceId` | `string` | Who applied it. |
| `sourcePowerId` | `string` | **Which power.** Required for *"different sources stack, the same source refreshes"* — source alone is not enough, since one hero can carry two effects of one kind from two of its own powers. |
| `escalation` | `number` | 0 for a flat DoT; 0.5 for a Fire-House burn, which grows 50% of base per tick. Keeps `It Catches` out of the tick function as a special case. |
| `cleansable` | `boolean` | `false` for Ember Saelith's burns and Umbriel's debuffs. They still expire; they cannot be removed early. |

### Identity, and why `sourcePowerId` is not optional

The stacking rule is *different sources stack, the same source refreshes*. The identity
of "the same source" is therefore **(`sourceInstanceId`, `sourcePowerId`, `kind`)**.

Dropping `sourcePowerId` would make two different powers on one hero refresh each other,
which quietly converts a designed combo into a no-op — and would look like a balance
problem rather than a bug.

### What is deliberately absent

**No `appliedAtTurn`.** Duration is a countdown that already ticks; storing an absolute
turn as well would be two representations of one fact, and they would disagree the first
time a duration was extended by `Banked Coals`.

**No `id`.** Instances are identified structurally by the triple above. A synthetic id
would need a generator, and a generator in `rules/` is either impure or another thing to
thread through `replay`.

---

## `StatusKind` and the catalog

Six families from `05-status.md`, each declaring its own stacking rule and clock
behaviour. The catalog is the single source (Constitution XIII).

| Family | Kinds | Stacks to | Clock |
|---|---|---|---|
| Damage over time | `burn`, `bleed`, `poison` | **3 per target** | ticks damage in **Upkeep**, counts down in Resolution |
| Stat modifier | `buff`, `debuff` | unbounded — **the 75 cap is the ceiling** | counts down only |
| Mitigation shred | `shred` | additive, applied multiplicatively in a fixed order | counts down only |
| Shield | `shield` | **one at a time — larger replaces smaller** | counts down only |
| Targeting | `taunt`, `fade` | never stack; **cancel on the same hero** | counts down only |
| Control | `stun`, `silence` | **never stack; duration refreshes only** | counts down only |

**Stat buffs need no ceiling of their own** — a hero at `Might` 45 taking three +10 buffs
reaches 75, not 85, because `cappedStat` clamps. This is why runic gear can be generous
about stacking without anything running away, and it is already implemented.

### Derived, never stored

Per [research.md](./research.md) §1, `statMods` already carries **rune points** and must
not be shared. The status contribution is read off `hero.statuses`:

```
effectiveStat(hero, base, key)
  = cappedStat(base[key], hero.statMods[key] + statusPoints(hero, key))
```

Expiry is then correct by construction: dropping the status is the entire operation, and
nothing has to remember to subtract anything.

The same applies to shred, which reduces a *percentage* of the mitigation stat and is
therefore read at the point `damage.ts` computes `E`, not written into a stat.

---

## `Rider` — new, authored

What a power does on arrival. Lives in `tools/power-riders.json`, validated into
`powerSchema.riders`.

| Field | Type | Notes |
|---|---|---|
| `kind` | `StatusKind` | Which family. |
| `stat` | `keyof HeroStats \| null` | Required for `buff` / `debuff` / `shred`. |
| `at` | `'target' \| 'self'` | **Load-bearing.** Most buffs in this roster ride an *attack* and land on the caster — the power still aims at an enemy. The existing overlay learned this the hard way and its comment says so: marking such a power `friendly` would make the engine aim a damaging strike at an ally. |
| `band` | `'small' \| 'moderate' \| 'large' \| null` | **Shred only.** The three shred bands are 20/30/40% and are the one magnitude not derivable from tier. |

### What a `Rider` must never carry

**No magnitude and no duration.** Both derive from the applying power's tier via the
`05-status.md` table (Constitution XV). A magnitude in this file is a schema error, not
a style preference — and keeping it out means a rebalance edits one table rather than 87
entries.

**Ordering is significant**: riders are contested one draw each, in the order authored.
An object's iteration order is a replay hazard, so this is an **array**.

### Accounting for all 87

FR-018 requires that *"not yet authored"* and *"deliberately has none"* be
distinguishable. So the file records both: a power with no riders appears with an empty
array rather than being absent. A build-time check asserts every active power in the
workbook appears exactly once — the same drift check `power-targeting.json` already
uses, which fails the build when a power is renamed.

---

## `PassiveHook` — new

A passive is a named trigger plus a consequence. Six hooks, driven by what the 13
authored passives actually need (see [research.md](./research.md) §4).

| Hook | Signature shape | Used by |
|---|---|---|
| `onTargetSelection` | contributes a `TargetFilter` and/or a `Compulsion` | taunt, fade, `Nothing Stays Hidden`, `Immovable` |
| `onDamageDealt` | `(packet, attacker, defender, state) → packet` | `Finish It`, `Measured Shot`, `Nothing Holds`, `Find the Seam` |
| `onCrit` | `(state, attacker, defender) → StatusInstance[]` | `The Cut Reopens`, `No Warning` |
| `onMissed` | `(state, defender) → StatusInstance[]` | `Never Where You Struck` |
| `onDeathNearby` | `(state, witness, fallen) → StatusInstance[]` | `The Veil Closes` |
| `onStatusApplied` | `(instance, applier, bearer) → StatusInstance` | `It Catches`, `Banked Coals`, `Wears Through`, `The Deep Holds` |

**`onTargetSelection` needs no new plumbing.** `legalTargets` already accepts `filters`
and `compulsion` and has never been passed either; the resolver calls it with three
arguments. Taunt/fade cancellation is already emergent from filter-then-compulsion
ordering and needs a test rather than code.

Hooks are **pure** — they return values rather than mutating — so `rules/` stays
evaluable a thousand times over with byte-identical answers, which is what
`determinism.test.ts` demands.

---

## Relationships

```
Power ──has many──> Rider          (authored; magnitude/duration derived from Power.tier)
  │
  └──on resolution──> StatusInstance ──sits on──> HeroState.statuses
                            │
                            ├──read by──> effectiveStat   (stat modifiers, derived layer)
                            ├──read by──> damage.ts       (shred, shields)
                            ├──read by──> phases.ts       (control → isIncapacitated)
                            └──read by──> targeting.ts    (taunt → Compulsion, fade → TargetFilter)

Hero ──has exactly 3──> Passive ──implements──> PassiveHook
```

**Every arrow out of `StatusInstance` is a read.** Nothing but the applier and the
Resolution tick writes one, which is what keeps a single effect from having two
representations.
