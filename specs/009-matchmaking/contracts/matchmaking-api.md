# API Contract: Matchmaking

**Feature**: `009-matchmaking` | Versioned JSON REST under `/v1`, plus internal functions.

**Two axes, deliberately separate**: **league** is computed from **gear score** and
bounds power; **rating** measures only whether you win with what you have, and
orders league-mates. Gear is never in the rating.

---

## `GET /v1/matchmaking/candidates`

```jsonc
{
  "league": "bronze",
  "positionInLeague": 0.94,
  "gearScore": 2410,
  "widened": true,                    // shown to the player — see below
  "poolSize": 22,                     // how many were ELIGIBLE, before the cap of 5
  "candidates": [
    { "playerId": "acc_...", "username": "reyna", "isBot": false,
      "rating": 1180, "league": "silver",
      "visibleHoldStreak": 14, "hiddenHoldStreak": 3 }
  ],
  "ambushChance": 0.34,               // ALWAYS displayed
  "consecutiveWins": 17,
  "starter": { "active": false }
}
```

**`candidates` is ordered, never filtered.** There is no parameter that would let
rating exclude anybody — the signature is the enforcement. **No slate, no rotation,
no cooldown on re-attacking someone you have already fought.**

**⚠️ Amended 2026-08-01: at most `OFFER_LIMIT` (5) are returned.** This previously
read *"every eligible defender in the league is present, every time"*, and that half
is reversed — Bronze holds twenty-two defenders and an opponent list is a decision
rather than an inventory.

The properties that carried the weight are unchanged, and the distinction is the
point:

| | before | now |
|---|---|---|
| eligibility | every defender in band | **unchanged** |
| caller can narrow it | no | **no** — the cap is a server constant, not a parameter |
| same pool ⇒ same five | — | **yes**, deterministic; no reroll |
| rotation / cooldown | none | **none** |

The five are sampled at **even indices** of the rating-ordered list, never the top
five. The list is a deliberate mix of the player's own band plus proportional bleed
from neighbours, and bleed candidates from above sort highest — so taking the head
would return five defenders from the league above and none from the player's own,
undoing the bleed while appearing to work.

This is **not** the *slate of five* that `09-matchmaking.md` considered and dropped.
That proposal refilled on use and blocked reappearance until twenty others had been
fought; this changes only how many of an unchanged pool are drawn on screen.

### League edges bleed, and both ends

```
pos = (gearScore − leagueFloor) / (leagueCeiling − leagueFloor)
```

| Position | Mix |
|---|---|
| at the floor | **50% from the league below** |
| 0% – 10% | ramping |
| **10% – 90%** | **pure league** |
| 90% – 100% | ramping |
| at the ceiling | **50% from the league above** |

**Bronze bleeds up only; Diamond bleeds down only.** Bleeding at both edges is what
makes the difficulty curve continuous — the upward ramp alone left a sawtooth at
every boundary.

**`widened: true` is shown.** When a thin league reaches into the adjacent one, the
player is told, because the 1.67× gear guarantee does not hold on a widened match.

### Thin leagues

**Pad with bots first; widen only if that is not enough.** A bot placed inside the
band keeps matching in-band; widening reaches outside it and breaks the guarantee —
up to **2.67×** for a player at a league floor. Widening is per request and never
persists.

> **Instrument the widen rate from day one.** It is the metric that says whether the
> Bronze bot allocation was enough, and Bronze is where inactive accounts thin
> hardest.

### Inactivity

```sql
AND last_activity_at >= now() - interval '30 days'
```

**In the query, not in a nightly job** — a job would leave a returning player
invisible until it next ran. **Activity is an attack battle or a defense-squad
edit.** A bare login is not enough, or an absent account keeps collecting hold
income by opening the game and doing nothing.

**Do not add a rule zeroing an idle account's hold income.** Leaving the pool is its
own enforcement: nobody can attack a defense nobody is offered. A second mechanism
is a second thing to keep in step.

## `GET /v1/me/standing`

```jsonc
{
  "league": "bronze", "gearScore": 2410,
  "positionInLeague": 0.94,
  "rating": 1180, "ratedBattles": 47, "band": "settling",
  "ambushChance": 0.34, "consecutiveWins": 17,
  "starter": { "active": true, "endsAt": "...", "shardsToward": 1840, "shardsTarget": 3250 }
}
```

A player sees their own league and score. **An opponent's league is not named** —
matchmaking only offers same-league defenders, so knowing your own already tells you
every opponent's band. It **is** named on a widened match.

## `POST /v1/me/starter/exit`

```jsonc
{ "confirmed": true, "acknowledged": ["bot-opponents-end", "income-multiplier-ends"] }
```

`409` if `acknowledged` does not contain **both**. Exit 3 of four, and **permanent**.

---

## The four starter-league exits

| # | Exit | Fires | Owned by |
|---|---|---|---|
| 1 | **Time** | 7 days from account creation | this feature |
| 2 | **Shards** | 3,250 earned — five full runes | feature 010 signals |
| 3 | **Voluntary** | the route above; **permanent** | this feature |
| 4 | **Guild** | accepting an invitation **or founding a guild** | **feature 013** |

**Exit 4 is one rule with two doors**: *no member of a guild is ever in the starter
league.* Leaving the guild later does not send them back.

### The warning contract — the part that has been lost three times

```ts
/** Feature 013 CANNOT construct either confirm without this payload, because it
 *  is a required field of the confirm's type. A shared constant STRING is not
 *  enough — three screen regenerations have proved a string can be dropped. */
interface StarterExitWarning {
  readonly endsBotOpponents: true;      // beginner STATUS
  readonly endsIncomeMultiplier: true;  // the beginner BONUS — a DIFFERENT thing
  readonly permanent: true;
}

function starterExitWarning(accountId: string): StarterExitWarning | null;  // null if not in starter
```

**Both losses must be named.** A player told only *"you'll leave the starter
league"* has not been told their income drops.

**The warning goes on the APPLICATION and on the INVITATION — not on the
acceptance.** A player who applies and is admitted a day later would otherwise be
graduated by someone else's click, at a moment they were not present for. The
application is where the decision is actually made.

**Do not oversell the 1.5×.** It replaces dormant hold income — nothing attacks a
starter player's defense, and holds are ~26% of a typical day. Only ~11% is help.

---

## Internal contracts

```ts
/** Recomputed on every rune PLACEMENT, never accumulated. Reads runes currently on
 *  heroes, not lifetime spend — ten rebuilds of one slot is 6,500 shards for 125 of
 *  power, and a cumulative score would rate that player eight leagues above their
 *  strength. */
function gearScore(accountId: string): number;

function leagueOf(gearScore: number): 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
function positionInLeague(gearScore: number): number;   // 0..1, against the league's OWN range

/** Ordered by rating. NOBODY REMOVED. No parameter exists that could filter. */
function candidates(accountId: string): CandidateList;

function recordPlacement(accountId: string): void;      // triggers the gear recompute
function starterStatus(accountId: string): { active: true; endsAt: Date } | { active: false; reason: ExitReason };

/** +2% per consecutive attack win, capped at 90%. ALWAYS displayed. Reset on a loss. */
function ambushChance(accountId: string): number;

/** The zone is the SERVER'S decision. A client cannot request `hidden` — the field
 *  does not exist in the request body. */
function rollZone(seed: Seed, accountId: string): 'visible' | 'hidden';
```

## The bot pool

| Where | Share | At the derived floor |
|---|---|---|
| **Starter** | **30%** | **20** |
| Bronze | 20% | 13 |
| Silver | 20% | 13 |
| Gold | 20% | 13 |
| Platinum | 10% | 7 |
| **Diamond** | **0%** | hand-seeded, counted separately |

**The starter requirement sets the total.** 140 battles in a week against 20 bots is
one new opponent every ~7 battles — a ramp. Against 6 it is the same six opponents
on repeat, which the design names as the failure.

**The starter 20 are structured, not interchangeable**: bots 1–5 carry one glaring
Bane and no rune fill; 13–20 have no free answer and set the graduation standard.
This is how the starter week teaches counter-building without a tutorial mode.

**Bots carry a spread of ratings, not a midpoint per league** — one anchor
calibrates a single point, a spread calibrates the band. A new player should be able
to lose to a strong bot and beat a weak one **inside the same league**.

**Bots carry Hidden squads, exactly as players do.** `09-matchmaking.md` defines a
bot as a gear score, a Visible squad, a Hidden squad and a defense-AI configuration
— *a player's defense record minus the account* — and FR-018 requires the same
configuration model as players, which is 12 heroes across two zones. So a bot is
ambushable on the same terms as anyone, and `POST /matchmaking/attack` needs no bot
branch in its ambush roll.

> **The authoring instruction that makes this pay off: a bot's Hidden squad is the
> harder of its two.** The ambush counter is the recorded answer to opponent
> farming, and it only bites if being ambushed costs the farmer something. Equal
> squads would redirect the farm rather than tax it.
