/**
 * Putting the authored bots into the database (009 T045–T048 · FR-015, FR-019).
 *
 * `starterBots.ts` composes twenty bots as *content*. Nothing in the game reads content
 * — `candidates()` reads `accounts`, `squads` and `squad_seats` — so until these rows
 * exist the starter league is closed and a new player has nobody to attack.
 * **This module is what switches the starter league on**, and it does so by doing its
 * own job rather than by flipping a flag: `starterLeagueOpen()` asks whether a starter
 * bot exists, so seeding is the switch.
 *
 * ### It saves through the players' own write path, deliberately
 *
 * `saveDefenseSquad()` is what `PUT /v1/squads/defense/:zone` calls. Using it here means
 * a bot's squad is validated, seated, streak-compared and config-filled by exactly the
 * code a player's squad goes through — which is what T047's *"the same configuration
 * model as players"* asks for, satisfied **structurally rather than by convention**.
 *
 * The alternative was inserting rows directly, and it would have been a second writer
 * for `squads` + `squad_seats` + `squad_member_config`. That is three tables whose
 * invariants would then live in two places, and the divergence would not break anything
 * — it would produce bots that are subtly not player-shaped, which is the failure mode
 * this project keeps finding.
 *
 * ### Idempotent, because a seed that cannot be re-run safely is a trap
 *
 * Re-seeding is not an error and does not duplicate: a bot already present is skipped by
 * username. That matters more than convenience. Constitution XVI makes recorded battles
 * permanent, and `battle_records` stores squad composition — so a bot whose squad
 * *changed* between seedings would leave older records describing a squad that no longer
 * exists, with no way to correct them. `composeSquad` is deterministic for the same
 * reason. **Skipping is the only safe re-seed.**
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { playerRatings } from '../db/schema/ratings.js';
import { squads } from '../db/schema/squads.js';
import { usernameKey, validateUsername } from '../auth/username.js';
import { configFor } from '../squads/allocation.js';
import { saveDefenseSquad, type SeatInput } from '../squads/repository.js';
import { botRating, RATING_SPREAD } from './bots.js';
import { STARTER_BOTS, type BotSeat, type StarterBot } from './starterBots.js';
import { LEAGUE_BOTS } from './leagueBots.js';
import { BOT_BANDS, type BotBand } from '../db/schema/accounts.js';

export interface SeedReport {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Seats plus the role-default configuration a player's unconfigured squad receives.
 *
 * **`configFor` is feature 004's measured table, not a placeholder.** An unconfigured
 * defender plays *sensibly* — a Striker takes `lowest-current-hp` then `nearest`, a Tank
 * `highest-might` — so a bot given the defaults is a bot playing the same way an
 * ordinary player's squad does before they touch anything.
 *
 * **Per-bot configuration is deliberately not authored**, and this is a scope decision
 * worth stating: T045 and T046 describe the ramp entirely in terms of *composition* and
 * *gear*, never targeting. Authoring 240 targeting choices to make the top bots play
 * better would be inventing 240 numbers with no measurement behind them, in a project
 * whose hero values are still a Role-shaped template. It is the obvious next tuning
 * lever once the hero-numbers pass has run.
 */
const withDefaults = (seats: readonly BotSeat[]): SeatInput[] =>
  seats.map((seat) => {
    const config = configFor(seat.heroId, undefined);
    return {
      row: seat.row,
      index: seat.index,
      heroId: seat.heroId,
      config: {
        targetPrimary: config.targeting[0],
        targetFallback: config.targeting[1],
        allyRule: config.allyRule ?? null,
        powerRanking: [...config.ranking],
      },
    };
  });

/**
 * Create one bot: an account, a fixed standing, and both defense squads.
 *
 * **No identity row, and that is most of the safety.** Nothing can sign into a bot, and
 * every query that joins `identities` is human-only for free — which is structural
 * protection rather than a filter somebody has to remember.
 */
async function createBot(
  bot: StarterBot,
  index: number,
  total: number,
  /**
   * **Which band the row is stamped with, and it is not cosmetic.**
   *
   * `starterLeagueOpen()` asks whether a bot exists *in the starter band*, and
   * `removeStarterBots()` deletes only that band. Both are correct precisely
   * because the band is written honestly — a Diamond bot stamped `starter` would
   * open the starter league on an opponent no new player can survive, and would be
   * deleted by a helper whose whole safety argument is that it is band-scoped.
   */
  band: BotBand,
  /** Overrides the ramp-position rating. See `leagueBotRating`. */
  rating?: number,
): Promise<void> {
  /**
   * **Checked here rather than trusted.** These names are authored, so they are exactly
   * the kind of thing that is correct when written and wrong after an edit — and the
   * failure would be a bot nobody can be matched against, or worse, a name a player
   * could later claim.
   */
  const rejection = validateUsername(bot.username);
  if (rejection) {
    throw new Error(`bot ${bot.position} (${bot.name}): username "${bot.username}" is ${rejection}`);
  }

  const [created] = await db()
    .insert(accounts)
    .values({
      username: bot.username,
      usernameKey: usernameKey(bot.username),
      isBot: true,
      botBand: band,
    })
    .returning({ id: accounts.id });

  const accountId = created!.id;

  /**
   * **The standing row is written, not left to the LEFT JOIN's defaults.** `candidates()`
   * coalesces a missing rating to 1,000 and a missing gear score to the starter grant —
   * which for a bot would silently discard both the ramp's gear *and* its fixed rating,
   * collapsing all twenty rungs onto one point. The seam that protects real players
   * pre-010 would quietly erase the thing this whole phase authored.
   *
   * `lastActivityAt` stays null on purpose: `candidates()` has an explicit `is_bot` arm
   * precisely so a bot never needs one, and writing a timestamp here would make that arm
   * look unnecessary to the next reader.
   */
  await db().insert(playerRatings).values({
    accountId,
    rating: rating ?? botRating(index, total),
    gearScore: bot.gearScore,
  });

  await saveDefenseSquad(accountId, 'visible', withDefaults(bot.visible));
  await saveDefenseSquad(accountId, 'hidden', withDefaults(bot.hidden));

  /**
   * The flavour name, on the squad rather than the account. `saveDefenseSquad` does not
   * take one — a player names their own squads through a different route — so it is set
   * after, on both zones.
   */
  await db()
    .update(squads)
    .set({ name: bot.name })
    .where(and(eq(squads.accountId, accountId), eq(squads.kind, 'defense')));
}

/**
 * Seed every starter bot that is not already present.
 *
 * Returns what it did rather than logging, so a caller — a script, a test, or feature
 * 016's admin surface later — decides how to report it.
 */
export async function seedStarterBots(): Promise<SeedReport> {
  const keys = STARTER_BOTS.map((b) => usernameKey(b.username));

  /**
   * **One query for all twenty, not twenty existence checks.** Not for speed — for
   * atomicity of the *decision*: twenty separate reads could interleave with another
   * seeder and each conclude "absent" for a bot the other is creating.
   */
  const existing = await db()
    .select({ key: accounts.usernameKey })
    .from(accounts)
    .where(inArray(accounts.usernameKey, keys));

  const present = new Set(existing.map((r) => r.key));

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [index, bot] of STARTER_BOTS.entries()) {
    if (present.has(usernameKey(bot.username))) {
      skipped.push(bot.username);
      continue;
    }
    await createBot(bot, index, STARTER_BOTS.length, 'starter');
    created.push(bot.username);
  }

  return { created, skipped };
}

/**
 * A league bot's rating — **the starter ramp's curve, continued upward.**
 *
 * `botRating` spreads a band across `STARTING_RATING ± RATING_SPREAD`, i.e. 700 to
 * 1,300, and the twenty starter bots already occupy all of it. Reusing it unshifted
 * would rate the hardest Diamond opponent in the game exactly as the hardest Bronze
 * one, and rating is the ladder standing a player is actually chasing.
 *
 * Offsetting by `2 × RATING_SPREAD` puts the weakest Silver bot at 1,300 — the same
 * rating as the strongest starter bot — and climbs to 1,900 at the top. So the two
 * ramps meet exactly rather than overlapping or leaving a gap, which is the same
 * property `position` has: one continuous curve written in two files.
 */
export function leagueBotRating(index: number, count: number): number {
  return botRating(index, count) + 2 * RATING_SPREAD;
}

/**
 * Seed the twenty-four authored opponents **above** the starter league.
 *
 * Separate from `seedStarterBots` rather than merged into it, because the two answer
 * different questions and one of them is load-bearing: `starterLeagueOpen()` asks
 * whether the *starter* band is populated, and a combined seeder would make "the
 * starter league is open" and "the higher leagues have opponents" the same fact.
 * They are not — the starter bots shipped months before these did.
 *
 * Same idempotency contract, for the same Constitution XVI reason: a bot already
 * present is **skipped, never updated**, because `battle_records` stores squad
 * composition permanently and a recomposed bot would leave recorded battles
 * describing a squad that no longer exists.
 */
export async function seedLeagueBots(): Promise<SeedReport> {
  const keys = LEAGUE_BOTS.map((b) => usernameKey(b.username));

  const existing = await db()
    .select({ key: accounts.usernameKey })
    .from(accounts)
    .where(inArray(accounts.usernameKey, keys));

  const present = new Set(existing.map((r) => r.key));

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [index, bot] of LEAGUE_BOTS.entries()) {
    if (present.has(usernameKey(bot.username))) {
      skipped.push(bot.username);
      continue;
    }
    await createBot(
      bot,
      index,
      LEAGUE_BOTS.length,
      bot.band,
      leagueBotRating(index, LEAGUE_BOTS.length),
    );
    created.push(bot.username);
  }

  return { created, skipped };
}

/**
 * Remove every league bot — the undo for `seedLeagueBots`.
 *
 * **Scoped to the four bands above the starter league**, and it takes no account id,
 * for the same reason `removeStarterBots` does not: a delete that can be pointed at
 * an arbitrary account is one somebody eventually points at a player. It cannot
 * touch a starter bot and it cannot touch a human.
 */
export async function removeLeagueBots(): Promise<number> {
  const bands = BOT_BANDS.filter((b): b is BotBand => b !== 'starter' && b !== 'bronze');

  const deleted = await db()
    .delete(accounts)
    .where(and(eq(accounts.isBot, true), inArray(accounts.botBand, bands)))
    .returning({ id: accounts.id });

  return deleted.length;
}

/**
 * Remove exactly the bots named — **by username, never by a predicate.**
 *
 * ### ⚠️ This exists because a test was deleting production content
 *
 * `removeStarterBots()` deletes every `is_bot` row in the starter band, and
 * `starter.test.ts` called it in `afterAll` to tidy up after seeding the ramp. On a
 * database shared with production — which this is — those are **the same twenty
 * rows the live game serves**. The suite could not tell its own bots from the
 * game's, because `seedStarterBots()` is deterministic and produces identical rows
 * either way. So every full API run silently emptied the starter league, and the
 * symptom reached a player as *"I've been fighting the same 2 over and over"*: with
 * no bots anywhere, matchmaking widened onto the only two human accounts.
 *
 * This project has a standing rule, paid for by deleting one of Jon's real battle
 * records: **enumerate, show, then act by id.** A predicate delete cannot know what
 * it did not create. `seedLeagueBots`/`seedStarterBots` both return `created`, which
 * is precisely the list of things this run is entitled to remove.
 */
export async function removeBotsByUsername(usernames: readonly string[]): Promise<number> {
  if (usernames.length === 0) return 0;

  const deleted = await db()
    .delete(accounts)
    .where(
      and(
        eq(accounts.isBot, true),
        inArray(
          accounts.usernameKey,
          usernames.map((u) => usernameKey(u)),
        ),
      ),
    )
    .returning({ id: accounts.id });

  return deleted.length;
}

/**
 * Remove every starter bot and everything hanging off it.
 *
 * ⚠️ **Not for a test on a shared database** — see `removeBotsByUsername`. This
 * deletes production's starter league along with anything a suite created, because
 * the two are indistinguishable rows.
 *
 * **Here so the tests can clean up after themselves**, which
 * `tests/globalSetup.ts` enforces by failing the run on a leaked account — tests and
 * production share one database (Jon's decision, recorded), so a suite that seeds bots
 * and leaves them would put twenty rows into the live game.
 *
 * `squads`, `squad_seats`, `squad_member_config` and `player_ratings` all cascade from
 * `accounts`, so this is one statement. **It deletes only `is_bot` rows in the starter
 * band**, and never takes an account id — a delete that can be pointed at an arbitrary
 * account is a delete somebody will eventually point at a player.
 */
export async function removeStarterBots(): Promise<number> {
  const deleted = await db()
    .delete(accounts)
    .where(and(eq(accounts.isBot, true), eq(accounts.botBand, 'starter')))
    .returning({ id: accounts.id });

  return deleted.length;
}
