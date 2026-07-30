/**
 * Put the twenty authored starter bots into the database. **The missing caller.**
 *
 * `seedStarterBots()` has been complete, idempotent and thoroughly tested since
 * feature 009 — and **its only callers were tests, which delete the bots again on
 * the way out.** So the function worked perfectly and the production database had
 * zero bots in it, which meant:
 *
 * - `starterLeagueOpen()` answered `false`,
 * - every account reported `no-authored-pool` rather than a starter status,
 * - `guildDoorConfirm()` returned a `null` warning for **everybody**, so feature
 *   013's starter-league warning could not fire on any of its three doors,
 * - and a genuinely new player had nobody to attack.
 *
 * **This is the eighth instance of the same defect in this project**, in its most
 * disguised form yet: not an uncalled function, but a *one-shot operation* nobody
 * ever ran. A seam whose caller is "a human, once" still needs writing down, or the
 * human is a step in a process that only exists in somebody's head.
 *
 * ### Safe to run repeatedly
 *
 * Bots already present are skipped by username, deliberately — `composeSquad` is
 * deterministic and `battle_records` stores squad composition, so a bot whose squad
 * *changed* between seedings would leave older records describing a squad that no
 * longer exists (Constitution XVI). **Skipping is the only safe re-seed.**
 *
 * ```
 * pnpm --filter @lmntlz/api db:seed-bots
 * ```
 *
 * `removeStarterBots()` is the undo, and it only ever touches `is_bot` rows in the
 * starter band — it takes no account id, because a delete that can be pointed at an
 * arbitrary account is one somebody eventually points at a player.
 */

import { closeDb } from './client.js';
import { seedStarterBots } from '../matchmaking/seedBots.js';
import { starterLeagueOpen } from '../matchmaking/starterLeague.js';

const report = await seedStarterBots();

console.log(`[seed] created ${report.created.length}, skipped ${report.skipped.length}`);
for (const name of report.created) console.log(`  + ${name}`);
for (const name of report.skipped) console.log(`  = ${name} (already present)`);

/**
 * **Asked, not assumed.** Seeding is the switch — `starterLeagueOpen()` reports
 * whether a starter bot exists — so checking it afterwards is what turns *"the
 * script ran"* into *"the league is open"*. Those are different claims, and this
 * project has confused them before.
 */
console.log(`[seed] starter league open: ${await starterLeagueOpen()}`);

await closeDb();
