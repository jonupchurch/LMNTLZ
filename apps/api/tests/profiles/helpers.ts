/**
 * Fixtures for the profile suite.
 *
 * **Records are inserted directly rather than fought**, for the same reason
 * `replays/list.test.ts` does it: the cases this feature turns on are shapes of
 * *history* — forty alternating battles, a player whose last twenty were all
 * Hidden — and fighting them would take minutes per test to produce a row this
 * writes in a millisecond. `replays/write.test.ts` already covers the fought
 * path, so nothing here is the only test of how a record comes to exist.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const suffix = (tag: string): string =>
  `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

export async function makeAccount(tag: string): Promise<{ id: string; username: string }> {
  const key = suffix(tag);
  const username = `P ${key}`;
  const [row] = await db().insert(accounts).values({ username, usernameKey: key }).returning();

  return { id: row!.id, username };
}

export async function dropAccounts(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db().delete(accounts).where(inArray(accounts.id, [...ids]));
}

/** Battle ids written by a test, so `afterAll` can take them back out. */
export class Ledger {
  readonly battleIds: string[] = [];

  async drop(): Promise<void> {
    if (this.battleIds.length === 0) return;
    await db().delete(battleRecords).where(inArray(battleRecords.battleId, this.battleIds));
    this.battleIds.length = 0;
  }
}

export interface RecordOptions {
  readonly attackerId?: string | null;
  readonly defenderId?: string | null;
  readonly defenderIsBot?: boolean;
  readonly zone: 'visible' | 'hidden';
  readonly concludedAt: Date;
  readonly winner?: 'attacker' | 'defender';
  readonly turnCount?: number;
  readonly attackerLeague?: string | null;
  readonly defenderLeague?: string | null;
  readonly attackerRating?: number | null;
  readonly defenderRating?: number | null;
}

/**
 * One battle record.
 *
 * **The squads are real hero ids rather than placeholders**, because the export
 * scan greps the CSV for hero names — a fixture using `h1` would let a leak of
 * the real column pass unnoticed.
 */
export async function record(ledger: Ledger, over: RecordOptions): Promise<string> {
  const battleId = crypto.randomUUID();
  ledger.battleIds.push(battleId);

  await db()
    .insert(battleRecords)
    .values({
      battleId,
      startedAt: new Date(over.concludedAt.getTime() - 60_000),
      concludedAt: over.concludedAt,
      attackerId: over.attackerId ?? null,
      defenderId: over.defenderId ?? null,
      defenderIsBot: over.defenderIsBot ?? false,
      zone: over.zone,
      winner: over.winner ?? 'attacker',
      reason: 'wipe',
      turnCount: over.turnCount ?? 88,
      attackerSquad: {
        seats: [
          { row: 'front', index: 0, heroId: 'h01' },
          { row: 'middle', index: 0, heroId: 'h14' },
        ],
      },
      defenderSquad: {
        seats: [
          { row: 'front', index: 0, heroId: 'h07' },
          { row: 'back', index: 0, heroId: 'h22' },
        ],
      },
      attackerLeague: over.attackerLeague ?? 'gold',
      defenderLeague: over.defenderLeague ?? 'gold',
      attackerRating: over.attackerRating ?? 1500,
      defenderRating: over.defenderRating ?? 1500,
      engineVersion: 'test-engine',
      contentVersion: 'test-content',
      buildSha: null,
      replayBlobUrl: null,
      replayDeletedAt: null,
    });

  return battleId;
}

/**
 * Many records in one round trip.
 *
 * The export scan needs 200 battles, and 200 sequential inserts is 200 Neon
 * round trips — about a minute of the suite spent proving nothing. One
 * multi-row insert is the same fixture in one trip.
 */
export async function recordMany(
  ledger: Ledger,
  specs: readonly RecordOptions[],
): Promise<readonly string[]> {
  if (specs.length === 0) return [];

  const values = specs.map((over) => {
    const battleId = crypto.randomUUID();
    ledger.battleIds.push(battleId);

    return {
      battleId,
      startedAt: new Date(over.concludedAt.getTime() - 60_000),
      concludedAt: over.concludedAt,
      attackerId: over.attackerId ?? null,
      defenderId: over.defenderId ?? null,
      defenderIsBot: over.defenderIsBot ?? false,
      zone: over.zone,
      winner: over.winner ?? ('attacker' as const),
      reason: 'wipe',
      turnCount: over.turnCount ?? 88,
      attackerSquad: {
        seats: [
          { row: 'front', index: 0, heroId: 'h01' },
          { row: 'middle', index: 0, heroId: 'h14' },
        ],
      },
      defenderSquad: {
        seats: [
          { row: 'front', index: 0, heroId: 'h07' },
          { row: 'back', index: 0, heroId: 'h22' },
        ],
      },
      attackerLeague: over.attackerLeague ?? 'gold',
      defenderLeague: over.defenderLeague ?? 'silver',
      attackerRating: over.attackerRating ?? 1500,
      defenderRating: over.defenderRating ?? 1480,
      engineVersion: 'test-engine',
      contentVersion: 'test-content',
      buildSha: null,
      replayBlobUrl: null,
      replayDeletedAt: null,
    };
  });

  await db().insert(battleRecords).values(values);

  return values.map((v) => v.battleId);
}

export const dropAccount = (id: string): Promise<void> =>
  db()
    .delete(accounts)
    .where(eq(accounts.id, id))
    .then(() => undefined);
