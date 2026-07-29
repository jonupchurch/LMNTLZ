/**
 * **The suite must leave the database as it found it.**
 *
 * ### Why this exists rather than more `afterAll` blocks
 *
 * Every suite here that creates an account already deletes it. All ten of them.
 * And on 2026-07-29 a single run still left **ten accounts behind** in the live
 * database — nine minutes before the first real player signed in, into the same
 * table their row landed in.
 *
 * That is what a bookkeeping convention is worth. The pattern is `created.push(
 * id)` at each call site and a loop in `afterAll`, and it leaks whenever a test
 * creates an account without pushing its id, throws before it gets there, or
 * creates a *second* account as a side effect — a username collision, a link
 * that resolves to somebody new. None of those is a mistake anybody sees in
 * review, because the test passes.
 *
 * So the convention is kept and **the run is audited**: ids before, ids after,
 * and anything new is named and the run fails. A leak now announces itself, in
 * the run that caused it, with the row that was left.
 *
 * ### It is the `battles` table this is really protecting
 *
 * Accounts are recoverable — a stray one is noise. **`battles` is not.**
 * Constitution XVI makes those rows permanent and un-backfillable, and feature
 * 008's aggregates *are* the analytics product, computed from that table alone.
 * A test battle written there is a number that silently misreports the game
 * forever, and there is no migration that can tell it apart afterwards.
 *
 * ### The one thing it cannot distinguish
 *
 * Tests run against the same Neon database the deployed site uses, so a real
 * player signing up **during** a run would be reported here as a leak. That is
 * the right way round — a false alarm costs a second look, and the alternative
 * misses the case this was written for. The structural fix is a Neon branch for
 * tests; until there is one, this is the guard.
 */

import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env.local'));
} catch {
  // Absent is fine; `probe` reports it and the audit stands down.
}

interface Snapshot {
  readonly accounts: ReadonlySet<string>;
  readonly battles: ReadonlySet<string>;
  readonly actions: number;
}

/**
 * Imported lazily and by path.
 *
 * `globalSetup` runs in Vitest's own process, before any test file is loaded.
 * Importing the client at module scope would open a pool for a run that may not
 * touch the database at all — and would fail the whole suite on a machine with
 * no `.env.local`, including one only running the pure packages.
 */
async function probe(): Promise<Snapshot | null> {
  if (!process.env['DATABASE_URL']) return null;

  const { db } = await import('../src/db/client.js');
  const { accounts } = await import('../src/db/schema/accounts.js');
  const { battles, battleActions } = await import('../src/db/schema/battles.js');

  const [accountRows, battleRows, actionRows] = await Promise.all([
    db().select({ id: accounts.id }).from(accounts),
    db().select({ id: battles.id }).from(battles),
    db().select({ n: sql<number>`count(*)::int` }).from(battleActions),
  ]);

  return {
    accounts: new Set(accountRows.map((r) => r.id)),
    battles: new Set(battleRows.map((r) => r.id)),
    actions: actionRows[0]?.n ?? 0,
  };
}

let before: Snapshot | null = null;

export async function setup(): Promise<void> {
  before = await probe();
}

export async function teardown(): Promise<void> {
  if (!before) return;

  const after = await probe();
  if (!after) return;

  const newAccounts = [...after.accounts].filter((id) => !before!.accounts.has(id));
  const newBattles = [...after.battles].filter((id) => !before!.battles.has(id));
  const newActions = after.actions - before.actions;

  const { closeDb } = await import('../src/db/client.js');
  await closeDb();

  if (newAccounts.length === 0 && newBattles.length === 0 && newActions <= 0) return;

  const lines = [
    'The test run left rows behind in the database.',
    '',
    ...(newBattles.length
      ? [
          `  ${newBattles.length} battle row(s) — Constitution XVI makes these PERMANENT,`,
          '  and feature 008 computes every balance number from this table:',
          ...newBattles.map((id) => `    ${id}`),
          '',
        ]
      : []),
    ...(newActions > 0 ? [`  ${newActions} battle_actions row(s)`, ''] : []),
    ...(newAccounts.length
      ? [`  ${newAccounts.length} account(s):`, ...newAccounts.map((id) => `    ${id}`), '']
      : []),
    'Each suite that creates a row must delete it. If a real player signed up',
    'while this ran, that is a false alarm — tests and production share one',
    'database until there is a Neon branch for tests.',
  ];

  throw new Error(lines.join('\n'));
}
