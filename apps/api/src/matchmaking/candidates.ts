/**
 * Who a player is offered (009 T014 · FR-011).
 *
 * > **Gear restricts. Rating orders. Nothing else touches the pool.**
 *
 * ### The signature is the enforcement, and that is the whole design
 *
 * `candidates(accountId)` takes **one argument**. There is no `excludeIds`, no
 * `minRating`, no `maxAttempts`, no caller-supplied limit, no cursor — nothing a
 * caller could pass to remove somebody. That property is intact and is the one that
 * matters: a rule restricting **who** you may attack restricts the playing itself,
 * and the daily income curve already bounds what volume pays — 1.5× on the first
 * five victories, base to twenty, half beyond. The economy handles farming, so
 * matchmaking does not have to.
 *
 * ### ⚠️ `OFFER_LIMIT` reverses "every eligible defender, every time" (2026-08-01)
 *
 * This header, and `contracts/matchmaking-api.md`, promised *"every eligible
 * defender in the league is present, every time: no slate, no rotation."* Jon
 * capped the offered list at five. The doc has been moved with the code, because a
 * constant that quietly contradicts a written contract is how the two stop
 * agreeing.
 *
 * **What changed is a reading, not a rule.** The cap is a server-side constant, not
 * a parameter — no caller can narrow the pool, no cursor pages through it, and
 * eligibility is untouched. Every defender the old contract admitted is still
 * *eligible*; five of them are *shown*. Bronze holds twenty-two, and an opponent
 * list is a decision rather than an inventory.
 *
 * **`takeSpread`, not `slice`** — see its own note. Truncating a rating-sorted,
 * bleed-mixed list from the front would hand the player five defenders from the
 * league *above* and none from their own band, silently undoing `bleed.ts`.
 *
 * ### Two seams, both honest, both named
 *
 * **Gear score is null for everybody**, because 010 owns rune placement. The query
 * coalesces to the 1,500 starter grant, which is what `gearScore()` answers, so the
 * whole population is Bronze today. Every band boundary in the SQL is real; only the
 * scores feeding it are placeholders.
 *
 * **The standing row is often absent**, for the same reason — `recordPlacement()`
 * deliberately writes nothing pre-010. So this is a LEFT JOIN with defaults rather
 * than an INNER JOIN: an INNER JOIN would return an **empty pool for the entire
 * game**, which is exactly the shape of failure this project keeps meeting — no
 * error, no log, just nothing.
 *
 * **`last_activity_at` now has both its writers.** `PUT /squads/defense/:zone` and
 * battle settlement both call `touchActivity()`, which are the two things the design
 * defines activity as. The `isNull` fallback to `accounts.created_at` stays, because
 * every account created before those calls existed has no stamp and never will.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, or, isNull, sql } from 'drizzle-orm';
import { SQUAD_ROWS, SQUAD_SIZE } from '@lmntlz/sim/rules';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { playerRatings, STARTING_RATING } from '../db/schema/ratings.js';
import { ratingDeltas } from '../progression/rating.js';
import { squads, squadSeats } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { ambushChance } from '../squads/ambush.js';
import { INACTIVITY_DAYS, MIN_POOL, OFFER_LIMIT, STARTER_DAYS } from './config.js';
import { bleed, leagueAbove, leagueBelow } from './bleed.js';
import { starterLeagueOpen, starterStatus } from './starterLeague.js';
import { STARTER_GRANT_SCORE, bandOf, leagueOf, positionInLeague, type League } from './league.js';

export interface Candidate {
  readonly playerId: string;
  readonly username: string;
  readonly isBot: boolean;
  readonly rating: number;
  readonly visibleHoldStreak: number;
  readonly hiddenHoldStreak: number;
  /**
   * The six champions on their **Visible** squad, in seat order (019).
   *
   * `LMNTLZ Matchmaking and Results.dc.html` draws every offering with a
   * twelve-bar type spread — six champions × two Forces — so a player can tell
   * *"a wall I have answers for"* from *"a wall I do not"* before spending a
   * click on it. Without it the rail is a name and a number, and choosing an
   * opponent is choosing at random.
   *
   * ### Ids, not Forces — the Forces are derived
   *
   * The client already resolves `primary`/`secondary` from `@lmntlz/content`,
   * which is in its bundle; sending nine-colour spreads would be **a second copy
   * of derived data** and Constitution XV forbids exactly that. It is also
   * smaller: six ids against twelve type strings.
   *
   * ### Why this is not a disclosure (XVII)
   *
   * **The Visible squad is the scoutable one** — that is its whole definition,
   * and the only squad anybody can choose to attack. `GET /players/:id/scout`
   * already returns these six champions to any authenticated caller, with no
   * cost, no cooldown and no record of who looked. So this shows the same thing
   * one step earlier, not a thing that was hidden.
   *
   * The **Hidden** squad is not here and must never be: no ids, no count, no
   * key. See `ScoutView` — the absence of the field *is* the rule.
   */
  readonly visibleHeroIds: readonly string[];
  /**
   * What beating this defender is worth, and what losing to them costs — the
   * export's `WIN +18 / LOSE −12` (019).
   *
   * ### Computed by `ratingDeltas`, the same function settlement uses
   *
   * A client-side preview would be **a second implementation of the ladder**,
   * and the two would disagree the first time a K band moved. Worse, they would
   * disagree *quietly*: the player would be shown +18, be paid +14, and have no
   * way to tell which was wrong. Both numbers come from the one function.
   *
   * ### It is a forecast, not a promise, and that is inherent
   *
   * Both ratings can move between drawing this rail and resolving the battle —
   * either player may fight somebody else first. The export labels this as the
   * swing on offer rather than a guarantee, which is the honest framing.
   *
   * Always quoted for the **Visible** zone, because that is the battle being
   * chosen. An ambush pays double on a win, and the screen says so separately
   * rather than folding a 14%-likely bonus into a headline number.
   */
  readonly winDelta: number;
  readonly lossDelta: number;
}

export interface CandidateList {
  readonly league: League;
  readonly positionInLeague: number;
  readonly gearScore: number;
  /** True only when a thin league had to reach outside its band. See `config.ts`. */
  readonly widened: boolean;
  readonly candidates: readonly Candidate[];
  /**
   * How many defenders were **eligible**, before `OFFER_LIMIT` drew from them.
   *
   * What makes `widened` readable: `widened: false` with a pool of 5 is a league one
   * account away from breaking its guarantee, and the flag alone cannot say so.
   */
  readonly poolSize: number;
  /** Percent, 0–90. **Always displayed** — the player is owed the reason. */
  readonly ambushChance: number;
  readonly consecutiveWins: number;
}

/** One eligible defender, as the pool queries return them. */
type PoolRow = Awaited<ReturnType<typeof defenders>>[number];

/** The caller's own half of every rating swing, resolved once. */
interface OwnStanding {
  readonly gearScore: number;
  readonly attackStreak: number;
  readonly rating: number;
  readonly ratedBattles: number;
}

export interface EligiblePool {
  readonly own: OwnStanding;
  readonly league: League;
  readonly gearScore: number;
  readonly widened: boolean;
  /** Rating-ordered and **uncapped** — every defender this player may face. */
  readonly pool: readonly PoolRow[];
}

/** `coalesce(gear_score, 1500)` — the seam, in SQL. */
const effectiveGearScore = sql<number>`coalesce(${playerRatings.gearScore}, ${STARTER_GRANT_SCORE})`;

/**
 * Mark an account active, so it stays in the defender pool.
 *
 * **Activity is an attack battle or a defense-squad edit** — a bare login is not
 * enough, or an absent account keeps collecting hold income by opening the game and
 * doing nothing.
 *
 * Upserts, because the standing row may not exist yet: pre-010 nothing creates one.
 *
 * > **Both callers are wired**: `PUT /v1/squads/defense/:zone` and `settle()`, which
 * > stamps **both sides** — a defender who is being attacked is demonstrably in
 * > somebody's pool whether or not they logged in.
 */
export async function touchActivity(accountId: string): Promise<void> {
  const now = new Date();
  await db()
    .insert(playerRatings)
    .values({ accountId, lastActivityAt: now })
    .onConflictDoUpdate({
      target: playerRatings.accountId,
      set: { lastActivityAt: now, updatedAt: now },
    });
}

/**
 * Everything the player is **eligible** to face, rating-ordered and uncapped.
 *
 * **Assembly then ORDER, never a filtered query.** Rating appears exactly once, in
 * the `ORDER BY`. If it ever appears in a `WHERE`, this function has stopped being
 * what its contract says it is.
 *
 * ### Why this is a function of its own
 *
 * `OFFER_LIMIT` (Jon, 2026-08-01) draws five onto the screen, and folding that cap into
 * the assembly made **eligibility unobservable**: every test asking *"does a returning
 * player re-enter the pool?"* silently began reading a five-item sample instead, and
 * four of them failed. A cap is a **presentation** decision and belongs on the far side
 * of a seam from the rule it presents.
 *
 * Not reachable over the wire — `candidates()` is what the route serves — so no caller
 * can ask for the uncapped list.
 */
export async function eligiblePool(accountId: string): Promise<EligiblePool> {
  const [own] = await db()
    .select({
      gearScore: effectiveGearScore,
      attackStreak: sql<number>`coalesce(${playerStreaks.attackStreak}, 0)`,
      /* The caller's own half of every swing preview below. */
      rating: sql<number>`coalesce(${playerRatings.rating}, ${STARTING_RATING})`,
      ratedBattles: sql<number>`coalesce(${playerRatings.ratedBattles}, 0)`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    .leftJoin(playerStreaks, eq(playerStreaks.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!own) throw new Error(`no such account: ${accountId}`);

  const gearScore = Number(own.gearScore);
  const league = leagueOf(gearScore);
  const band = bandOf(league);

  /**
   * **Counted as a subquery rather than joined and grouped.** A join to
   * `squad_seats` would multiply every defender by their seat count and need a
   * `GROUP BY` over every selected column — and the first person to add a column
   * would get a wrong answer rather than an error.
   */
  const seatedSix = sql`(
    select count(*) from ${squadSeats}
    where ${squadSeats.squadId} = ${squads.id}
  ) = ${SQUAD_SIZE}`;

  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 86_400_000);
  const starterCutoff = new Date(Date.now() - STARTER_DAYS * 86_400_000);

  /**
   * **A starter player is offered authored bots and nothing else** (FR-019).
   *
   * The gear band is deliberately *not* applied to this pool. `09-matchmaking.md`:
   * a fresh account is 1,500 against a full kit's 10,125 — 6.75× — and *"leagues
   * bound that to 1.67× only if Bronze is populated. An authored pool bounds it by
   * construction, with no dependence on who happens to be playing."* The ramp is the
   * bound, and the ramp crosses the Bronze floor on purpose (see `BOT_BANDS`), so a
   * band filter would cut the bottom half of it off.
   */
  const starter = await starterStatus(accountId);

  /**
   * **Asked separately from the caller's own status, because the two answer different
   * questions.** `starter.active` is *"is this player protected"*; this is *"does the
   * league exist at all"* — and a player thirty days old reports `time` either way, so
   * their status cannot tell us. Without this gate the dormant-defense clause below
   * would remove every account under a week old from every pool **while none of them
   * were actually protected**, which is a pool that silently thins for no reason.
   */
  const leagueOpen = await starterLeagueOpen();

  /**
   * **Everything true of a defender regardless of which band is searched — and putting
   * the two starter protections here is a bug fix, not tidying.**
   *
   * They used to sit alongside the gear range inside a single `pool` predicate. That was
   * safe while there was exactly one pool query. The moment bleed and widening added two
   * more, both new queries built their own gear range and **silently dropped both
   * protections**: a veteran near a band edge was offered starter players as bleed
   * neighbours, and the beginner ramp became farmable again. Two tests caught it. The
   * lesson generalises — a protection written *next to* a varying clause travels with the
   * variation instead of with the rule.
   *
   * ### The three parts
   *
   * **Activity, in the query rather than a nightly job.** A job leaves a returning player
   * invisible until it next runs. The `isNull` arm is the seam above: with no standing
   * row, fall back to when the account was created. **A bot is never inactive, and that
   * arm is load-bearing** — a bot has no activity row and never will, so it would fall
   * through to `created_at` and every authored bot would drop out of every pool thirty
   * days after seeding, with no error anywhere.
   *
   * **The nursery is not farmable**, which is what lets opting out be permanent. A
   * starter bot's gear sits at or below the Bronze floor, so without this it lands in
   * every Bronze player's pool — and `09-matchmaking.md` rejects exactly that: *"a player
   * who returns after leaving would be farming a pool built for beginners."* Band rather
   * than `is_bot`, because Bronze **is** padded with bots by design and those are meant to
   * be offered; it is the authored ramp that is reserved.
   *
   * **A starter player's defense is dormant** (FR-020) — removed from everybody else's
   * pool rather than merely told nothing will happen. Written as the negation of "still in
   * the starter league": an exit is recorded, *or* the week has elapsed, *or* it is a bot.
   *
   * Both starter clauses are omitted **for** a starter player, whose pool is the ramp
   * itself — the nursery clause would exclude the very opponents they are owed.
   */
  const eligible = and(
    ne(accounts.id, accountId),
    seatedSix,
    or(
      eq(accounts.isBot, true),
      gte(playerRatings.lastActivityAt, cutoff),
      and(isNull(playerRatings.lastActivityAt), gte(accounts.createdAt, cutoff)),
    ),
    starter.active ? undefined : or(isNull(accounts.botBand), ne(accounts.botBand, 'starter')),
    !starter.active && leagueOpen
      ? or(
          isNotNull(accounts.starterExitedAt),
          lt(accounts.createdAt, starterCutoff),
          eq(accounts.isBot, true),
        )
      : undefined,
  );

  /** Gear restricts, and this is the only place it does. */
  const pool = starter.active
    ? and(eq(accounts.isBot, true), eq(accounts.botBand, 'starter'))
    : and(gte(effectiveGearScore, band.floor), lt(effectiveGearScore, band.ceiling));

  const rows = await defenders(eligible, pool, 'desc');

  /**
   * ### Bleed, and then widening — in that order, because they are not the same thing
   *
   * **Bleed is by design and proportional; widening is an emergency that breaks a
   * published promise.** `bleed()` says what share of this player's offers should come
   * from the league above and below given where they sit in their band — zero through
   * the middle 80%, rising to half at each edge — which is what makes crossing a
   * threshold cost 0.2% rather than 12.6 points of win rate.
   *
   * Widening is different: it reaches a whole band out because there is nobody to fight,
   * and `contracts/matchmaking-api.md` is explicit that *"the 1.67× gear guarantee does
   * not hold on a widened match."* So it goes second and it is disclosed.
   *
   * **A starter player gets neither.** Their pool is the authored ramp, which is the
   * bound by construction — reaching outside it would hand a beginner the very full-kit
   * veteran the ramp exists to keep away, and the ramp is never thin because it is
   * authored rather than populated.
   */
  const neighbours = starter.active ? [] : await bleedNeighbours(eligible, gearScore, rows.length);

  let all = [...rows, ...neighbours];
  let widened = false;

  if (!starter.active && all.length < MIN_POOL) {
    /**
     * **Padding with bots happens before this and is not a step here** (T052). Bots are
     * *seeded into bands* rather than injected per request, so by the time this runs any
     * bot in the player's league is already in `rows` — which is the point: a bot inside
     * the band keeps matching in-band, while widening does not. This branch is what
     * happens when even that was not enough.
     *
     * **Per request and never persisted.** Nothing records that a player was widened;
     * the next request asks again, and a league that has since filled stops widening on
     * its own.
     */
    all = await defenders(eligible, widenedBand(league), 'desc');
    widened = all.length > rows.length;

    /**
     * **The widen rate, instrumented from the first widened request ever served (T054).**
     *
     * `09-matchmaking.md` makes this the metric that says whether the bot allocation was
     * big enough: *"Bronze is where the widen breaks a guarantee"*, and **a Bronze widen
     * rate above a few percent means the bot allocation was too small.** Adding the
     * instrument when somebody notices a problem leaves nothing to compare against — the
     * same reason `act.ts` logs its replay cost from the first battle.
     *
     * ### A log line, and no table, and no vendor
     *
     * `docs/tech-stack.md` settles that **no vendor measures the game** — the battle
     * metadata row is the analytics product. But a widen cannot be derived from
     * `battle_records`: it happens when a player *looks at* an opponent list, and most
     * listings never become a battle. So it needs its own instrument, and the cheapest
     * honest one is a structured line.
     *
     * **Only widened requests are logged, which is deliberate and it does cost
     * something.** Logging every call would give an exact denominator and would also mean
     * a line per opponent-list view forever. The denominator is instead the platform's own
     * request count for this route, which makes the rate approximate — stated here so
     * nobody reads a precision into it that is not there. It is a launch-tuning signal
     * checked occasionally, not a dashboard, and if it ever needs to be exact the fix is a
     * counter rather than more log volume.
     *
     * `league` is on the line because the allocation is per-band and the answer is
     * per-band; a total would average Bronze's problem away against Platinum's health.
     */
    if (widened) {
      console.warn(
        `[matchmaking] widened league=${league} own=${rows.length} widened_to=${all.length} min=${MIN_POOL}`,
      );
    }
  }

  /**
   * **Sorted here rather than trusted from the queries**, because two or three ordered
   * result sets concatenated are not one ordered result set — and rating order is the
   * one thing the contract promises about sequence.
   */
  const sorted = [...all].sort(
    (a, b) => Number(b.rating) - Number(a.rating) || a.playerId.localeCompare(b.playerId),
  );

  return {
    own: {
      gearScore,
      attackStreak: Number(own.attackStreak),
      rating: Number(own.rating),
      ratedBattles: Number(own.ratedBattles),
    },
    league,
    gearScore,
    widened,
    pool: sorted,
  };
}

/**
 * The pool as the player is **offered** it.
 *
 * `OFFER_LIMIT` of `eligiblePool()`, sampled across the rating order rather than taken
 * from the front, each decorated with its Visible six and both rating swings.
 */
export async function candidates(accountId: string): Promise<CandidateList> {
  const { own, league, gearScore, widened, pool } = await eligiblePool(accountId);

  const ordered = drawOffers(pool, OFFER_LIMIT);

  /**
   * Every offering's Visible six, in **one** query rather than one per candidate.
   *
   * A pool can be twenty players; twenty round trips to draw a rail is the shape
   * of a screen that gets slower the healthier the league is. The seats are
   * ordered by `(row, index)` so the six come back in the order the wall stands
   * in, which is what `ScoutedWall` and the spread both read.
   */
  const spreads = await visibleSixOf(ordered.map((r) => r.playerId));

  /**
   * The swing on offer against one defender, both ways.
   *
   * **`ratingDeltas` twice, once per outcome** — the function takes the result
   * as an input rather than returning a pair, and reimplementing the sign here
   * would be the second ladder this comment exists to prevent. `.attacker` is
   * the caller's half; `.defender` is the other player's and is not disclosed.
   */
  const swing = (theirRating: number, theirRatedBattles: number) => {
    const shared = {
      attacker: Number(own.rating),
      defender: theirRating,
      attackerRatedBattles: Number(own.ratedBattles),
      defenderRatedBattles: theirRatedBattles,
      /* The battle being chosen is always a Visible one. An ambush is the
         server's roll afterwards, and it doubles a *win* — quoting it here would
         advertise a bonus that is 14%-likely at best. */
      zone: 'visible' as const,
    };
    return {
      winDelta: ratingDeltas({ ...shared, attackerWon: true }).attacker,
      lossDelta: ratingDeltas({ ...shared, attackerWon: false }).attacker,
    };
  };

  return {
    league,
    positionInLeague: positionInLeague(gearScore),
    gearScore,
    widened,
    poolSize: pool.length,
    candidates: ordered.map((r) => ({
      playerId: r.playerId,
      username: r.username,
      isBot: r.isBot,
      rating: Number(r.rating),
      visibleHoldStreak: r.visibleHoldStreak,
      hiddenHoldStreak: Number(r.hiddenHoldStreak),
      /* A candidate without a full Visible squad is not a candidate at all —
         the query inner-joins on it — so this is six in practice. Defaulted
         rather than asserted: an empty spread draws nothing, where a throw here
         would take down the whole rail. */
      visibleHeroIds: spreads.get(r.playerId) ?? [],
      ...swing(Number(r.rating), Number(r.ratedBattles)),
    })),
    ambushChance: ambushChance(Number(own.attackStreak)),
    consecutiveWins: Number(own.attackStreak),
  };
}

/** One row shape for every pool query, so the three cannot drift apart. */
/**
 * Every named account's **Visible** six, keyed by account, in seat order.
 *
 * ### One query, and the `zone` filter is the disclosure rule
 *
 * `kind = 'defense' AND zone = 'visible'` is not a convenience — it is what
 * keeps the Hidden squad out of this result set entirely. A serialiser that
 * filtered afterwards would be one edit away from leaking six champions nobody
 * is allowed to see; a query that never loads them cannot (Constitution XVII,
 * and the same argument `scoutSerializer` makes about rune allocations).
 *
 * ### ⚠️ `ORDER BY row` sorts the enum ALPHABETICALLY
 *
 * `row` is `text`, so SQL orders it `back, front, middle` — not the formation's
 * `front, middle, back`. The first version of this did exactly that and the
 * comment above it claimed seat order, which is the worst kind of wrong: a
 * spread that looks plausible and puts the back-line champion first.
 *
 * So the sort is done here against `SQUAD_ROWS`, which is the one place the
 * order is defined (`packages/sim/rules/formation.ts`). Postgres still gets an
 * `ORDER BY` on `index` — without one it promises nothing at all, and a spread
 * whose bars shuffle between requests reads as the opponent having edited their
 * squad.
 */
async function visibleSixOf(accountIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  /* `inArray` with an empty list is a SQL syntax error in some drivers and an
     always-false predicate in others. Neither is worth finding out at runtime. */
  if (accountIds.length === 0) return out;

  const rows = await db()
    .select({ accountId: squads.accountId, heroId: squadSeats.heroId, row: squadSeats.row, index: squadSeats.index })
    .from(squadSeats)
    .innerJoin(squads, eq(squads.id, squadSeats.squadId))
    .where(
      and(
        inArray(squads.accountId, [...accountIds]),
        eq(squads.kind, 'defense'),
        eq(squads.zone, 'visible'),
      ),
    )
    .orderBy(asc(squadSeats.index));

  const byAccount = new Map<string, { heroId: string; row: string; index: number }[]>();
  for (const row of rows) {
    const list = byAccount.get(row.accountId);
    if (list) list.push(row);
    else byAccount.set(row.accountId, [row]);
  }

  const rank = (r: string): number => {
    const at = (SQUAD_ROWS as readonly string[]).indexOf(r);
    /* An unknown row sorts last rather than to 0 — `indexOf` returning -1 would
       silently promote it to the front of the wall. */
    return at === -1 ? SQUAD_ROWS.length : at;
  };

  for (const [accountId, seats] of byAccount) {
    seats.sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index);
    out.set(
      accountId,
      seats.map((s) => s.heroId),
    );
  }
  return out;
}

async function defenders(
  eligible: ReturnType<typeof and>,
  pool: ReturnType<typeof and>,
  direction: 'asc' | 'desc',
  limit?: number,
) {
  const rating = sql<number>`coalesce(${playerRatings.rating}, ${STARTING_RATING})`;

  const query = db()
    .select({
      playerId: accounts.id,
      username: accounts.username,
      isBot: accounts.isBot,
      gear: effectiveGearScore,
      rating,
      /* Needed so the swing preview feeds `ratingDeltas` exactly the inputs the
         settlement will. It only affects the *defender's* half of the pair, but
         passing a stand-in would make this preview silently wrong the day the
         formula starts reading it for the attacker's. */
      ratedBattles: sql<number>`coalesce(${playerRatings.ratedBattles}, 0)`,
      visibleHoldStreak: squads.holdStreak,
      hiddenHoldStreak: sql<number>`coalesce((
        select h.hold_streak from ${squads} h
        where h.account_id = ${accounts.id} and h.kind = 'defense' and h.zone = 'hidden'
        limit 1
      ), 0)`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    /**
     * The Visible squad is the join, not a filter afterwards: **it is the only
     * squad anybody can choose to attack**, so a player without a complete one is
     * not a candidate at all. Hidden is reachable only by ambush, which 007 rolls
     * after the choice is made.
     */
    .innerJoin(
      squads,
      and(eq(squads.accountId, accounts.id), eq(squads.kind, 'defense'), eq(squads.zone, 'visible')),
    )
    .where(and(eligible, pool))
    // Rating appears here and nowhere else. Gear orders the *bleed* selection, below.
    .orderBy(direction === 'asc' ? asc(effectiveGearScore) : desc(rating), accounts.id);

  return limit === undefined ? query : query.limit(limit);
}

/**
 * Draw `limit` at random from a rating-ordered list, **still in rating order**.
 *
 * ### Why not `slice(0, limit)`
 *
 * The list is deliberately mixed: `bleedNeighbours` adds defenders from the league
 * above and below in a proportion that depends on where the player sits in their
 * band, and that mix is what makes crossing a threshold cost 0.2% instead of 12.6
 * points of win rate. It is then sorted by **rating, descending**.
 *
 * So the top five of a bled list are the five highest-rated — which after a bleed
 * from above means the offers are *all* from the league above and none from the
 * player's own band. Truncating from the front would silently undo `bleed.ts`
 * entirely, and it would look like it was working. A uniform draw cannot: it samples
 * the pool in the pool's own proportions, which *is* the bleed mix.
 *
 * ### ⚠️ This was deterministic until 2026-08-01, and the reversal is Jon's
 *
 * > *"randomly chosen from the pool. It should not surface the same opponents over
 * > and over."*
 *
 * The previous version sampled at even indices and this comment argued the opposite
 * case: *"a randomly sampled list would let a player reroll the opponent screen until
 * it offered somebody soft, which converts a choice into a slot machine."* That cost
 * is real and is now accepted — **refreshing the screen redraws**, and a player who
 * refreshes for a weak opponent will find one.
 *
 * Two things bound the damage. `ratingDeltas` already pays less for beating somebody
 * rated below you, so shopping downward mostly buys time rather than standing. And the
 * pool is the *only* thing that limits the draw, which is why a hundred bots landed in
 * the same change: five drawn at random from six is not rotation, it is the same six
 * shuffled.
 *
 * **The order of the result is still rating, descending.** Only membership is random —
 * the contract's ordering promise is about how the five are read, not how they were
 * chosen, and a randomly *ordered* list would make the rail jump around between draws.
 *
 * `random` is injected so the property tests can be exact rather than statistical; the
 * server passes nothing and gets `Math.random`. This is matchmaking, not resolution —
 * no seed is involved and none is disclosed (Constitution XII).
 */
export function drawOffers<T>(
  ordered: readonly T[],
  limit: number,
  random: () => number = Math.random,
): T[] {
  if (limit <= 0) return [];
  if (ordered.length <= limit) return [...ordered];

  /**
   * **Partial Fisher–Yates over the indices, not `sort(() => random() - 0.5)`.**
   * A comparator that returns random values is not a shuffle — it is biased, and how
   * biased depends on the engine's sort implementation, so it would produce a
   * different distribution on a different Node version.
   */
  const index = Array.from({ length: ordered.length }, (_, i) => i);
  for (let i = 0; i < limit; i += 1) {
    const j = i + Math.floor(random() * (index.length - i));
    [index[i], index[j]] = [index[j]!, index[i]!];
  }

  /* Back into rating order: membership is the random part, sequence is not. */
  return index
    .slice(0, limit)
    .sort((a, b) => a - b)
    .map((i) => ordered[i]!);
}

/**
 * The defenders drawn from next door, in the proportion `bleed()` asks for.
 *
 * **Nearest across the line, not strongest.** A player at the top of Silver who starts
 * seeing Gold names should see the *weakest* Gold players — the ones they have nearly
 * caught — because those are the opponents the bleed is modelling. Taking the top of Gold
 * would make crossing a threshold a cliff in the other direction, which is the exact
 * sawtooth `bleed.ts` exists to remove.
 *
 * The counts come from treating the mix as shares of the finished list: if `own` accounts
 * for a fraction `m` of the offers and there are `C` of them, the whole list is `C / m`.
 */
async function bleedNeighbours(
  eligible: ReturnType<typeof and>,
  gearScore: number,
  ownCount: number,
) {
  const mix = bleed(gearScore);
  if (mix.own >= 1 || ownCount === 0) return [];

  const total = ownCount / mix.own;
  const league = leagueOf(gearScore);

  const picked: Awaited<ReturnType<typeof defenders>> = [];

  const above = leagueAbove(league);
  const upN = Math.round(total * mix.up);
  if (above && upN > 0) {
    const band = bandOf(above);
    // Ascending gear: the weakest of the league above, i.e. those just over the line.
    picked.push(
      ...(await defenders(
        eligible,
        and(gte(effectiveGearScore, band.floor), lt(effectiveGearScore, band.ceiling)),
        'asc',
        upN,
      )),
    );
  }

  const below = leagueBelow(league);
  const downN = Math.round(total * mix.down);
  if (below && downN > 0) {
    const band = bandOf(below);
    /**
     * **Descending gear here, and the asymmetry is deliberate.** Downward the nearest
     * neighbours are the *strongest* of the band below, so the direction flips. Using
     * `asc` for both would offer a Silver player the very bottom of Bronze — a 1.67×
     * mismatch in their own favour, dressed up as a bleed.
     */
    picked.push(
      ...(await defenders(
        eligible,
        and(gte(effectiveGearScore, band.floor), lt(effectiveGearScore, band.ceiling)),
        'desc',
        downN,
      )),
    );
  }

  return picked;
}

/**
 * One band either side, which is what `WIDENED_GEAR_BOUND` is derived from.
 *
 * **Not two, and not unbounded.** 2.67× is *"the same derivation one band wider"*; a
 * second band out would be a third promise nobody has stated, and an unbounded widen
 * would serve a Bronze player a Diamond defender rather than admit the league is empty.
 */
function widenedBand(league: League) {
  const below = leagueBelow(league);
  const above = leagueAbove(league);

  const floor = bandOf(below ?? league).floor;
  const ceiling = bandOf(above ?? league).ceiling;

  return and(gte(effectiveGearScore, floor), lt(effectiveGearScore, ceiling));
}
