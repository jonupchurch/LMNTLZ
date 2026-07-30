# `matchmaking` — who you are offered, and why

**Plain version:** this folder decides which other players' squads you can attack. It
sorts everyone by how much gear they have into five leagues, only offers you people in
your own league, blends the edges so crossing a league line isn't a cliff, and gives
brand-new accounts a week of hand-built practice opponents instead of real players. When a
league is too empty to work, it fills in with bots first and only reaches outside the
league as a last resort — and tells you when it did.

---

## The two axes, and the carve-out

> **Gear restricts. Rating orders. Nothing else touches the pool.**

That division is the whole design and it is worth stating twice, because both halves are
easy to erode:

- **Gear** decides *who is eligible*. Five leagues, fixed published thresholds, and the
  only place a `WHERE` clause looks at gear.
- **Rating** decides *what order you see them in*. It appears exactly once, in an
  `ORDER BY`. **The day rating appears in a `WHERE`, `candidates()` has stopped being what
  its contract says it is.**

`candidates(accountId)` takes **one argument**. No `excludeIds`, no `minRating`, no
`limit`, no cursor — nothing a caller can pass to remove somebody. Every eligible defender
is present every time: no slate, no rotation, no cooldown on re-attacking. That is not
laziness about pagination. A rule restricting *who* you may attack restricts the playing
itself, and the daily income curve already bounds what volume pays.

**The carve-out is the starter league.** A new account's pool is not a gear band at all —
it is twenty authored bots, and the gear filter is deliberately *not* applied to it. A
fresh account is 1,500 against a full kit's 10,125, and leagues only bound that to 1.67× if
Bronze happens to be populated. **An authored ramp bounds it by construction**, with no
dependence on who is playing. The ramp crosses the Bronze floor on purpose, so a band
filter would cut its bottom half off.

## The files

| File | What it owns |
|---|---|
| `league.ts` | The five bands, `leagueOf`, `positionInLeague`. Fixed thresholds, not quintiles |
| `gearScore.ts` | `2.5 × placed stat points`. **A seam** until 010 owns runes |
| `bleed.ts` | The mix drawn from the leagues either side, by position in band |
| `candidates.ts` | The pool: eligibility, bleed composition, widening, `touchActivity` |
| `starterLeague.ts` | The first week — status, the four exits, the warning |
| `bots.ts` | How many bots, where, and what they are rated |
| `starterBots.ts` | The authored twenty. Ramp spec in, seats out |
| `seedBots.ts` | Putting them in the database. **Idempotent by skip** |
| `standing.ts` | What a player is told about their own placement |
| `config.ts` | Every constant, served rather than compiled into the client |

## Numbers that are derived, not chosen

Re-deriving these has cost real time more than once, so: **none of the following is a
tuning dial.**

- **`GEAR_BOUND` 1.67** is Bronze's own width, `2500 / 1500`. Bronze is the worst case
  because it is the narrowest band on the lowest floor; every other league is kinder
  (Silver 1.60 · Gold 1.55 · Platinum 1.40 · Diamond 1.16). The guarantee gets *better* as
  players climb.
- **`WIDENED_GEAR_BOUND` 2.67** is the same derivation one band wider.
- **`BLEED_EDGE_MIX` 0.5** is *solved*, not picked. Setting the top-of-band win rate equal
  to the bottom-of-next-band rate gives `(a − b) = 2m(a − b)`, so `m = ½` for **any** pair
  of win rates. Continuity does not depend on having guessed the skill gradient right.
- **`RATING_SPREAD` 300** comes from the Elo curve: `400 · log10(1/0.15 − 1) ≈ 301`, aiming
  the ends of a band's bot spread at a 15% / 85% expected score for an unrated player.
- **`MIN_POOL` 5** is where the income curve's first tier (1.5× on five victories) stops
  being completable without attacking somebody twice.
- **The bot table** — 20 / 13 / 13 / 13 / 7 — is the published shares applied to a total
  derived from the twenty authored starter bots. See below.

## The bot total is a launch-tuning number with a derived floor

`09-matchmaking.md` settles the **distribution** — 30% starter, 20/20/20/10 across Bronze
through Platinum, Diamond hand-seeded only — and then leaves the absolute count under a
heading called *Open*: *"the absolute count is a launch-tuning number that wants a real
population."*

So the total is derived from the one bot count that **is** a design decision: the twenty
authored starter bots, whose shape is a teaching decision rather than a tuning one.
`20 / 0.30 = 66.7`, and the rest of the table follows. If the ramp ever grows to thirty,
the whole table re-derives and nothing else needs editing.

**Two things are honestly outstanding:**

1. **The ~46 league padding bots (T047) are not authored.** A bot's strength is
   `2.5 × stat points` over hero values that are still a Role-shaped template, and the
   hero-numbers pass has not run — authoring them now means authoring them twice.
   **Consequence: Bronze through Platinum have no padding**, so a thin band widens instead
   of filling, which is exactly the case `widenRate` measures.
2. **Twenty starter bots is knowingly too few.** The design doc's own floor is *"roughly
   140 battles in their week"*, so twenty is seven encounters each. The plumbing is proven
   at this depth; the depth is not.

## Two things that would fail silently, and one that did

- **`candidates()` LEFT JOINs `player_ratings`.** An INNER JOIN returns an **empty pool for
  the entire game** — no error, no log — because pre-010 no account has a standing row.
- **`touchActivity()` still has no caller.** It belongs in battle settlement and
  defense-squad saves. Until it is wired, eligibility falls back to `accounts.created_at`,
  so the pool would quietly thin as accounts age past thirty days.
- **The starter protections used to live beside the gear range**, and when bleed and
  widening added two more queries both silently dropped them — a veteran near a band edge
  was offered starter players, and the beginner ramp became farmable. They are in the
  shared eligibility clause now. **A protection written next to a varying clause travels
  with the variation instead of with the rule.**

## Seeding the bots

`seedStarterBots()` creates the accounts and writes both squads through
`saveDefenseSquad()` — the same function `PUT /v1/squads/defense/:zone` calls — so bots are
player-shaped structurally rather than by convention. It has **no caller in the running
app**: it is invoked from tests today and belongs behind feature 016's admin surface.

**Seeding is what opens the starter league.** `starterLeagueOpen()` asks whether a starter
bot exists, so there is no flag to flip and nothing to remember. It is also why seeding
changes the meaning of *"a new account"* for the whole database — with the league open, a
brand-new account is a *protected* starter player whose defense is dormant. Test fixtures
that need to be ordinary league players must be backdated past the starter week.

**Idempotent by skip, and that is a correctness requirement.** `battle_records` stores
squad composition and Constitution XVI makes those records permanent, so a re-seed that
recreated a bot with a *different* squad would leave older records describing a squad that
no longer exists, uncorrectably. `composeSquad` is deterministic for the same reason.

## What this feature writes that can never be corrected

`battle_records` carries `defender_is_bot`, both leagues and both ratings so that a balance
question can be asked years later. **For two features all five were constants** — `null`
for the leagues and ratings because 009 had not shipped, and `defenderIsBot: false` because
no bot existed. Both were true when written; neither can be repaired for the battles
already recorded.

They are captured in `battle/create.ts` at **creation** time, not settlement, because a
battle can stay open for hours and a rune placed mid-battle can move a player across a
threshold — the record's purpose is to explain the matchup that was *offered*.
`tests/matchmaking/record.test.ts` guards all five, and `RecordSource` requires the four
fields so a forgotten `RETURNING` cannot compile.
