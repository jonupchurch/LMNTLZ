# LMNTLZ — the shared data model

**Cross-cutting Phase 1 output, written once for all sixteen features.**

Principle VII requires the whole set planned before any of it is implemented,
because six models cross feature boundaries. This file is where they are settled —
once, here, rather than negotiated separately in eight plans.

> **Read this before any per-feature `plan.md`.** Where a feature plan and this
> file disagree, this file is wrong and should be corrected, not worked around.

---

## The six shared models

| Model | Owned by | Read by |
|---|---|---|
| **Account** | 05 | everything |
| **Hero** | 01 | everything |
| **Squad** | 06 | 04, 07, 08, 12, 14 |
| **Battle record** | 07 / 08 | 08, 09, 10, 12 |
| **Shard ledger** | 10 | 11, 13, 14 |
| **Rating & league** | 09 / 10 | 07, 08, 12, 13 |

---

## 1 · Account — owned by feature 05

```
Account
  id            immutable, internal          ← every reference points here
  username      unique, mutable, indexed     ← what players see and search
  status        active | suspended
  createdAt

ProviderLink
  accountId
  provider      google | steam
  providerId    unique across all links      ← at most one account per identity
```

> **`id` is not `username`, and this is the single most expensive decision to
> retrofit in the whole schema.** A mutable string as the real key means every
> foreign key — battles, replays, runes, guild membership, chat messages — carries
> a value that changes on rename. **Moderation makes renames non-hypothetical**, so
> this is required rather than merely wise. Constitution XVI.

**Nothing above authentication may read `provider`.** Leagues, rating, guilds,
streaks and runes all hang off `accountId`.

---

## 2 · Hero — owned by feature 01

```
Hero
  id            stable, survives a display-name change
  name
  primary       one of nine types            ← AUTHORED
  secondary     one of nine types            ← AUTHORED
  role          striker | tank | ranged | buffer
  reach         1 | 2
  stats         { might, speed, toughness, perception, agility, luck,
                  armor, magicResist, penetration }
  powers        six, each { tier, multiplier, cooldown:int, types[] }

  ── derived, never stored as authored data ──
  strengths     = { primary, secondary }
  bane          = counter(primary)
  fault         = counter(secondary)
```

**`counter` is a bijection over all nine types that never crosses families:**
`Earth↔Air · Fire↔Water · Light↔Dark · Crush→Slash→Pierce→Crush`.

**Exactly 60 of 72 primary/secondary pairings are legal.** Magic primaries have 7
legal secondaries (counter is an involution there, so two rules collapse into one
exclusion); melee primaries have 6, all magic. *Melee heroes always take a magic
secondary* is a **consequence**, never a separate check.

**`contentVersion`** is a property of the whole roster, not of a hero.

---

## 3 · Squad — owned by feature 06

```
Squad
  accountId
  kind          defense | offense
  zone          visible | hidden              ← defense only
  slotIndex     0..2                          ← offense only, up to three
  placement     6 heroes across rows { front:2, middle:3, back:1 }
  valid         boolean                       ← offense only
  holdStreak    int                           ← defense only, resets on edit

SquadMemberConfig                             ← defense only, feature 04
  squadId, heroId
  targetPrimary, targetFallback
  allyRule                                    ← only if the hero owns a friendly power
  powerRanking  a permutation of the six
```

**The 1–6 row axis is shared, not per-squad**: attacker holds 1–3, defender 4–6.
Row 1 is the attacker's back and row 3 its front, so **distance = occupied rows
crossed, counting the target's row and not your own**, with empty rows free.

**Invariants**

- A hero on **either** defense zone is unavailable to every offense squad.
- Offense squads **may and must** overlap — 3 × 6 > 15.
- Moving a hero to defense **evicts** it from every offense squad and sets
  `valid = false` on each.
- Editing a defense squad **resets `holdStreak`**.

---

## 4 · Battle record — owned by 07, persisted by 08

> **This is the one that cannot be backfilled.** LMNTLZ runs no analytics vendor,
> so this row *is* the analytics product.

```
Battle
  id
  attackerId, defenderId
  defenderIsBot          bool     ← without it every aggregate is polluted
                                    by our own authored loadouts
  zone                   visible | hidden
  startedAt, endedAt
  outcome                attackerWin | defenderHold | discarded
  endReason              elimination | turnCap
  turnCount              int      ← battle-length commitment
  attackerSquad          hero ids ← pick rates, counter validation
  defenderSquad          hero ids
  attackerRatingBefore/After
  defenderRatingBefore/After
  attackerLeague, defenderLeague  ← league thresholds vs real population
  shardsAwarded
  engineVersion, contentVersion, buildSha    ← two stamps, never merged
  seed                   server-only, never transmitted

BattleAction            append-only, the ONLY in-progress state
  battleId, sequence, heroId, powerId, targetId, submittedAt
  unique (battleId, sequence)   ← what makes a retry idempotent

Replay
  battleId
  packets                stored event log — recorded, never re-simulated
  expiresAt              startedAt + 7 days
  retentionHold          set while an attached report is open
```

**Every testable commitment in the design is a query over this table** — zone
balance, hold rates, battle length, league thresholds, hero pick rates.

**`defenderSquad` is stored and never exported.** Constitution XVII: the CSV
carries no composition on either side, and no embed may ever show a Hidden
defense. Storing is not exposing.

---

## 5 · Shard ledger — owned by feature 10

```
ShardLedger              append-only; balance is derived, never stored
  accountId, delta, reason, battleId?, createdAt

Rune
  accountId, heroId
  slot          primary | secondary | common
  stage         1..4
  allocations   stat → points        ← may stack; the 75 cap is the only rule
  utilityEffect                      ← stage 4 only

Entitlement                          ← feature 11
  accountId                          ← the ACCOUNT, never a storefront
  kind          boostPass
  expiresAt                          ← purchases extend, never replace
```

**Balance is derived from the ledger**, the same one-source-of-truth shape as the
battle action log.

**Cap behaviour is asymmetric and all three cases are distinct:** at 6,500 battle
income **stops**, granted shards **still land** and may exceed it, purchases are
**refused**.

**`gearScore = 2.5 × effective stat points`, recomputed on placement.** Placement
timing is what makes *hoarding is not a sandbag* true rather than merely asserted.

---

## 6 · Rating & league — owned by 09 and 10

```
PlayerRating
  accountId
  rating          starts at 1000 for everyone
  ratedBattles    drives the K band: ≤30 → 40, ≤200 → 20, else 10
  attackStreak    universal across all three offense squads

League            derived from gearScore, fixed thresholds
  bronze    1500–2500     silver  2500–4000    gold  4000–6200
  platinum  6200–8700     diamond 8700–10125
```

**Gear is not an input to rating**, and rating never removes a candidate from a
pool. Only gear filters.

**Three streaks exist and must not be conflated:** one `attackStreak` on the
player, and one `holdStreak` per defense squad. **Only `attackStreak` feeds
ambush** — `+2%` per win, capped at **90%**.

---

## Social models

```
Guild            id, name (permanent), emblem {icon, ink, ground},
                 pitch, motd, foundedAt
GuildMembership  guildId, accountId, role: master | officer | member
GuildApplication accountId, guildId, status, expiresAt   ← ≤5 concurrent, 7d
GuildInvite      guildId, accountId, expiresAt
Succession       guildId, requesterId, requestedAt, emailedAt, resolvesAt

ChatMessage      own tables, own retention   ← so a later split is mechanical
                 scope, authorId, body, embed?, createdAt
Embed            { type, id, snapshot }      ← a reference, never an upload
AdCredit         guildId, date, granted:2, used  ← hard cap 4/day, no carry
Report           targetType, targetId, reporterId, status
                 → places a retentionHold on any battle it depends on
```

---

## Cross-cutting invariants

Every plan's Constitution Check is checked against these.

1. **`Account.id` is the only thing foreign keys reference.**
2. **Two version stamps on every battle**, never merged.
3. **Two append-only logs** — `BattleAction` and `ShardLedger` — from which state
   is derived rather than stored.
4. **`seed` never leaves the server**, in any payload.
5. **Bane, fault and effectiveness are computed**, never columns.
6. **Hidden squads are stored in full and exposed nowhere** except inside their own
   battle and that battle's replay.
7. **The four unbackfillable battle fields ship with the first record**:
   `turnCount`, both squads, `defenderIsBot`, league and rating at the time.

---

## Build order

`packages/content` → `packages/sim` (rules, then resolver) → `apps/api` →
`apps/client`. Headless and tested first: the sim is the game, and it is the last
place a number moves freely under the no-nerf rule.
