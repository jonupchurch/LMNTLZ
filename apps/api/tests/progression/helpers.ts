/**
 * One disposable account per progression file.
 *
 * **The suffix carries the pid and a random draw**, and both halves matter. Two
 * files running in parallel in the same process share the pid, and two runs on one
 * machine share nothing else — `globalSetup.ts` fails the whole suite over a single
 * leaked account, so a username collision here surfaces as a leak report pointing
 * at the wrong file.
 */

import { effectsInPool, poolOf } from '@lmntlz/sim/rules';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';

export const suffix = (tag: string): string =>
  `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

/**
 * Create a bare account and return its id.
 *
 * ### Backdated past the starter week, and that is the whole point of the option
 *
 * **Attack income is multiplied by `STARTER_INCOME_MULTIPLIER` (1.5) for a player still
 * in their first week**, and the starter league opens itself the moment any starter bot
 * exists. So a brand-new fixture is a starter player, and every payout assertion in this
 * directory — all of which compute their expectation from `payoutFor()` alone — is off by
 * exactly 1.5×.
 *
 * That went unnoticed because the league was *closed*: with no authored bots seeded,
 * `starterStatus()` returned `no-authored-pool` and the multiplier was 1. Seeding the bot
 * ramp turned it on and seven `boost.test.ts` assertions went red with `expected 90 to be
 * 60` — the tests were correct about the boost and wrong about the player.
 *
 * **The precondition is now stated rather than inherited from an empty database.** Pass
 * `ageDays: 0` for a fixture that is genuinely meant to be a beginner.
 */
export async function makeAccount(
  tag: string,
  options: { readonly ageDays?: number } = {},
): Promise<string> {
  const key = suffix(tag);
  const [row] = await db()
    .insert(accounts)
    .values({
      username: `P ${key}`,
      usernameKey: key,
      createdAt: new Date(Date.now() - (options.ageDays ?? GRADUATED_DAYS) * 86_400_000),
    })
    .returning();

  return row!.id;
}

/**
 * Eight days: one clear of `STARTER_DAYS`, so the account has graduated by time.
 *
 * The time exit is *derived* from `created_at` rather than written, so backdating is the
 * only way to produce a graduated account without also asserting an exit reason.
 */
const GRADUATED_DAYS = 8;

/** Delete accounts and everything that cascades from them — ledger, runes, ratings. */
export async function dropAccounts(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db().delete(accounts).where(inArray(accounts.id, [...ids]));
}

export const dropAccount = (id: string): Promise<void> =>
  db()
    .delete(accounts)
    .where(eq(accounts.id, id))
    .then(() => undefined);

/**
 * A utility effect the given slot legitimately offers on the given champion (021).
 *
 * **Stage 4 can no longer be reached without one**, which is the whole point of
 * the feature — a rune that completes with an empty 200-shard stage is the defect.
 * Every fixture that walks a rune to completion needs an effect, and picking it
 * from the engine's catalog rather than naming an id keeps the fixtures honest as
 * the catalog fills across US2 and US3.
 */
export function utilityFor(heroId: string, slot: 'primary' | 'secondary' | 'common'): string {
  const first = effectsInPool(poolOf(heroId, slot))[0];
  if (!first) throw new Error(`no implemented rune effect in the ${slot} pool for ${heroId}`);
  return first.id;
}

/** A different effect from the same pool, for asserting a replacement actually replaced. */
export function otherUtilityFor(
  heroId: string,
  slot: 'primary' | 'secondary' | 'common',
  notThis: string,
): string {
  const other = effectsInPool(poolOf(heroId, slot)).find((e) => e.id !== notThis);
  if (!other) throw new Error(`the ${slot} pool for ${heroId} holds only ${notThis}`);
  return other.id;
}
