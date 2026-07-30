/**
 * The ledger is append-only and the balance is derived (010 T009).
 *
 * Two of the three claims here are **structural** — they are about what the source
 * does not contain, not about what a function returns — and that is deliberate.
 * A behavioural test cannot prove an `UPDATE` is absent; it can only fail to
 * observe one, which every passing test does whether or not the code is right.
 *
 * See [[scan-code-not-prose]]: a grep that forbids a pattern matches the comment
 * explaining the ban, so the source is stripped of comments first — and the strip
 * is itself checked, because a strip that ate the file makes every scan pass.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stripComments } from '../stripComments.js';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { append, balance, lifetimeEarned, victoriesToday } from '../../src/progression/ledger.js';
import { dropAccount, makeAccount } from './helpers.js';

let accountId: string;

beforeAll(async () => {
  accountId = await makeAccount('ledger');
});

afterAll(async () => {
  await dropAccount(accountId);
  await closeDb();
});

const SRC = new URL('../../src/', import.meta.url).pathname.replace(/^\//, '');

/** Every `.ts` under `src/`, comments stripped. */
async function sourceFiles(): Promise<Array<{ path: string; code: string }>> {
  const out: Array<{ path: string; code: string }> = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) {
        const raw = await readFile(full, 'utf8');
        const code = stripComments(raw, entry.name);

        out.push({ path: full, code });
      }
    }
  }

  await walk(SRC);
  return out;
}

describe('the ledger is append-only', () => {
  it('contains no UPDATE or DELETE against shard_ledger anywhere in src', async () => {
    const files = await sourceFiles();
    expect(files.length, 'found no source files to scan').toBeGreaterThan(20);

    const offenders = files.filter(
      ({ code }) =>
        /update\s*\(\s*shardLedger/i.test(code) ||
        /delete\s*\(\s*shardLedger/i.test(code) ||
        /UPDATE\s+shard_ledger/i.test(code) ||
        /DELETE\s+FROM\s+shard_ledger/i.test(code),
    );

    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('has the scan actually able to fail', async () => {
    // Mutating the scan's subject rather than the code: if this planted string
    // does not trip the same predicate, the test above proves nothing.
    const planted = 'await tx.update(shardLedger).set({ delta: 0 });';
    expect(/update\s*\(\s*shardLedger/i.test(planted)).toBe(true);
  });

  it('stores no balance column on accounts', async () => {
    // Comments stripped first, and this assertion is the reason: `accounts.ts`
    // names shards in prose (015's ban notes, 009's bot commentary), and the
    // unstripped version of this test fails on the documentation rather than on a
    // column. A column would appear as a `column('...')` call, so that is what is
    // scanned for.
    const files = await sourceFiles();
    const schema = files.find((f) => f.path.endsWith('accounts.ts'));
    expect(schema, 'accounts.ts not found').toBeDefined();

    expect(schema!.code).not.toMatch(/(integer|bigint|numeric)\s*\(\s*['"][^'"]*(balance|shard)/i);
  });
});

describe('balance is a sum over rows', () => {
  it('matches a hand-computed total', async () => {
    await append(accountId, 30, 'attack-victory');
    await append(accountId, 20, 'attack-victory');
    await append(accountId, 10, 'defense-hold');
    await append(accountId, -150, 'rune-stage');

    // 30 + 20 + 10 - 150
    expect(await balance(accountId)).toBe(-90);
  });

  it('answers zero for an account with no rows', async () => {
    const fresh = await makeAccount('ledger-empty');
    expect(await balance(fresh)).toBe(0);
    await dropAccount(fresh);
  });

  it('counts lifetime earned from income only, never from grants or spend', async () => {
    // The four rows above: 30 + 20 earned attacking, 10 defending. The -150 is
    // spend and must not reduce it, or spending would push a graduated player
    // back into the starter league.
    expect(await lifetimeEarned(accountId)).toBe(60);

    await append(accountId, 5_000, 'grant');
    expect(await lifetimeEarned(accountId), 'a grant is not earned income').toBe(60);
  });
});

describe('the daily victory count', () => {
  it('counts attack victories since the boundary and ignores holds', async () => {
    const fresh = await makeAccount('ledger-day');
    await append(fresh, 30, 'attack-victory');
    await append(fresh, 30, 'attack-victory');
    await append(fresh, 10, 'defense-hold');
    await append(fresh, -150, 'rune-stage');

    expect(await victoriesToday(fresh, new Date())).toBe(2);
    await dropAccount(fresh);
  });

  it('excludes rows written before today', async () => {
    const fresh = await makeAccount('ledger-yesterday');
    await db()
      .insert(shardLedger)
      .values({
        accountId: fresh,
        delta: 30,
        reason: 'attack-victory',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });

    expect(await victoriesToday(fresh, new Date()), 'a two-day-old victory').toBe(0);
    expect(await balance(fresh), 'but it still counts toward the balance').toBe(30);

    await db().delete(shardLedger).where(eq(shardLedger.accountId, fresh));
    await dropAccount(fresh);
  });
});
