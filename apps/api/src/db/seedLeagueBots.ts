/**
 * Put the twenty-four authored league bots into the database.
 *
 * ```
 * pnpm --filter @lmntlz/api db:seed-league-bots -- --dry-run   # show, write nothing
 * pnpm --filter @lmntlz/api db:seed-league-bots                # write
 * ```
 *
 * ### Why this exists
 *
 * Every one of the twenty starter bots is **Bronze** — `runes × 125` tops out at
 * 2,375 and Silver's floor is 2,500. So Silver, Gold, Platinum and Diamond had no
 * authored opponents at all, `candidates()` fell below `MIN_POOL` and **widened**,
 * and a player past Bronze met the same handful of real accounts over and over.
 * Reported from play.
 *
 * ### ⚠️ It writes to the database players are using, so it shows first
 *
 * `--dry-run` prints exactly what would be created — name, band, gear score, league
 * and rating — and writes nothing. This project has a standing rule paid for the
 * hard way: **enumerate, show, then act.** A seeder that only reports afterwards
 * gives you the list *after* it is too late for the list to change your mind.
 *
 * The dry run also prints the **current** population per league beside the
 * projected one, so the two numbers can disagree in front of you rather than in a
 * summary. A run that says "created 24" is not the same claim as "every league now
 * clears MIN_POOL", and only the second one is what was actually wanted.
 *
 * Safe to run repeatedly: a bot already present is skipped by username, never
 * updated. Constitution XVI makes `battle_records` permanent and they store squad
 * composition, so a recomposed bot would leave recorded battles describing a squad
 * that no longer exists.
 */

import { eq } from 'drizzle-orm';
import { closeDb, db } from './client.js';
import { accounts } from './schema/accounts.js';
import { playerRatings } from './schema/ratings.js';
import { LEAGUE_BOTS } from '../matchmaking/leagueBots.js';
import { leagueBotRating, seedLeagueBots } from '../matchmaking/seedBots.js';
import { leagueOf, LEAGUE_NAMES } from '../matchmaking/league.js';
import { MIN_POOL } from '../matchmaking/config.js';

const dryRun = process.argv.includes('--dry-run');

/** Defenders per league as the database has them *right now*. */
async function currentPopulation(): Promise<Map<string, { bots: number; humans: number }>> {
  /* Every account with a standing, bots and humans alike — the pool `candidates()`
     draws from. No predicate: the whole point is to count what is actually there. */
  const rows = await db()
    .select({
      gearScore: playerRatings.gearScore,
      isBot: accounts.isBot,
    })
    .from(playerRatings)
    .innerJoin(accounts, eq(accounts.id, playerRatings.accountId));

  const pop = new Map<string, { bots: number; humans: number }>();
  for (const name of LEAGUE_NAMES) pop.set(name, { bots: 0, humans: 0 });

  for (const row of rows) {
    const league = leagueOf(Number(row.gearScore));
    const cell = pop.get(league)!;
    if (row.isBot) cell.bots += 1;
    else cell.humans += 1;
  }
  return pop;
}

const before = await currentPopulation();

console.log(dryRun ? '=== DRY RUN — nothing will be written ===\n' : '=== SEEDING ===\n');

console.log('WOULD CREATE (skipped if the username already exists):');
console.log('  pos  name                    band       gear   league     rating');
for (const [i, bot] of LEAGUE_BOTS.entries()) {
  console.log(
    `  ${String(bot.position).padStart(3)}  ${bot.name.padEnd(23)} ${bot.band.padEnd(9)} ` +
      `${String(bot.gearScore).padStart(5)}  ${leagueOf(bot.gearScore).padEnd(9)}  ` +
      `${String(leagueBotRating(i, LEAGUE_BOTS.length)).padStart(4)}`,
  );
}

/**
 * **The two numbers that should agree, printed side by side.** `projected` adds the
 * authored bots to what is already there; if a league still fails `MIN_POOL` after
 * this runs, that is visible here rather than discovered by a player being widened
 * into a fight three bands above them.
 */
const projected = new Map(
  LEAGUE_NAMES.map((name) => [name, before.get(name)!.bots + before.get(name)!.humans]),
);
for (const bot of LEAGUE_BOTS) {
  const l = leagueOf(bot.gearScore);
  projected.set(l, (projected.get(l) ?? 0) + 1);
}

console.log('\nPOPULATION PER LEAGUE');
console.log('  league     bots  humans   now   after   MIN_POOL');
for (const name of LEAGUE_NAMES) {
  const cell = before.get(name)!;
  const now = cell.bots + cell.humans;
  const after = projected.get(name)!;
  const flag = after < MIN_POOL ? `  ⚠ STILL BELOW ${MIN_POOL}` : '';
  console.log(
    `  ${name.padEnd(9)}  ${String(cell.bots).padStart(4)}  ${String(cell.humans).padStart(6)}  ` +
      `${String(now).padStart(4)}  ${String(after).padStart(6)}   ${String(MIN_POOL).padStart(3)}${flag}`,
  );
}

if (dryRun) {
  console.log('\n[dry-run] nothing written. Re-run without --dry-run to seed.');
  await closeDb();
  process.exit(0);
}

const report = await seedLeagueBots();
console.log(`\n[seed] created ${report.created.length}, skipped ${report.skipped.length}`);
for (const name of report.created) console.log(`  + ${name}`);
for (const name of report.skipped) console.log(`  = ${name} (already present)`);

/**
 * **Asked, not assumed.** "The script ran" and "every league now has opponents" are
 * different claims, and this project has confused them before. So the population is
 * re-read from the database rather than computed from what the seeder said it did.
 */
const after = await currentPopulation();
console.log('\nVERIFIED FROM THE DATABASE');
console.log('  league     bots  humans   total   MIN_POOL');
let short = 0;
for (const name of LEAGUE_NAMES) {
  const cell = after.get(name)!;
  const total = cell.bots + cell.humans;
  if (total < MIN_POOL) short += 1;
  console.log(
    `  ${name.padEnd(9)}  ${String(cell.bots).padStart(4)}  ${String(cell.humans).padStart(6)}  ` +
      `${String(total).padStart(6)}   ${String(MIN_POOL).padStart(3)}${total < MIN_POOL ? '  ⚠ BELOW' : ''}`,
  );
}
console.log(short === 0 ? '\n[seed] every league clears MIN_POOL.' : `\n[seed] ⚠ ${short} league(s) still short.`);

await closeDb();
