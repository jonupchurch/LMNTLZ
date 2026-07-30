/**
 * One disposable account per progression file.
 *
 * **The suffix carries the pid and a random draw**, and both halves matter. Two
 * files running in parallel in the same process share the pid, and two runs on one
 * machine share nothing else — `globalSetup.ts` fails the whole suite over a single
 * leaked account, so a username collision here surfaces as a leak report pointing
 * at the wrong file.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';

export const suffix = (tag: string): string =>
  `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

/** Create a bare account and return its id. */
export async function makeAccount(tag: string): Promise<string> {
  const key = suffix(tag);
  const [row] = await db()
    .insert(accounts)
    .values({ username: `P ${key}`, usernameKey: key })
    .returning();

  return row!.id;
}

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
