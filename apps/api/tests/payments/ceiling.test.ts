/**
 * The $160 ceiling, and why it is computed (011 T033–T035, T038).
 *
 * The claim *"the honest ceiling on purchasable advantage is $160 a year"* is
 * arithmetic over the catalog, not a fact about it. A constant restating the
 * answer passes the first test and then **stops being true silently** the moment
 * somebody adds a SKU — the pricing page keeps saying $160 while the real ceiling
 * has moved.
 *
 * So the second test here adds a hypothetical product and asserts the answer
 * changes. That is the test that makes the first one worth having.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stripComments } from '../stripComments.js';
import {
  CATALOG,
  bestShardsPerDollar,
  maxPurchasableAdvantage,
  nonPassProducts,
  type Sku,
} from '../../src/payments/catalog.js';

describe('the ceiling', () => {
  it('is $160 a year', () => {
    expect(maxPurchasableAdvantage()).toBe(16_000);
  });

  it('is the 364-day pass rather than thirteen 28-day passes', () => {
    // 13 x $20 = $260 for the same 364 days. Nobody rational buys that, which is
    // exactly why the ceiling is the cheapest cover and not the most expensive.
    const yearly = CATALOG.find((s) => s.id === 'pass-364d')!;
    expect(maxPurchasableAdvantage()).toBe(yearly.price);
    expect(13 * 2_000).toBeGreaterThan(maxPurchasableAdvantage());
  });

  it('CHANGES when a hypothetical product is added', () => {
    // The property that makes computing it worth the code. A constant passes the
    // test above and fails this one.
    const withLonger: readonly Sku[] = [
      ...CATALOG,
      { id: 'pass-500d', price: 20_000, days: 500, grants: 'boost-pass' },
    ];

    const moved = maxPurchasableAdvantage(500, withLonger);
    const unmoved = maxPurchasableAdvantage(500, CATALOG);

    expect(moved, 'adding a cheaper long pass did not move the ceiling').toBeLessThan(unmoved);
  });

  it('finds the cheapest cover rather than the first fit', () => {
    // 91 days is one pass-91d at $50, not thirteen pass-7d at $130.
    expect(maxPurchasableAdvantage(91)).toBe(5_000);
    expect(maxPurchasableAdvantage(28)).toBe(2_000);
  });

  it('is zero for an empty catalog rather than Infinity', () => {
    expect(maxPurchasableAdvantage(364, [])).toBe(0);
  });
});

describe('the catalog rules', () => {
  it('sells exactly one gameplay-affecting product', () => {
    expect(nonPassProducts()).toEqual([]);
    expect(new Set(CATALOG.map((s) => s.grants))).toEqual(new Set(['boost-pass']));
  });

  it('prices everything as a multiple of $5', () => {
    for (const sku of CATALOG) {
      expect(sku.price % 500, `${sku.id} at ${sku.price} cents`).toBe(0);
    }
  });

  it('converts no money into shards', () => {
    // Zero is the honest answer and the important one. The pass doubles income the
    // player still has to EARN; it never hands them a balance.
    expect(bestShardsPerDollar()).toBe(0);
  });

  it('gets cheaper per day as duration rises, so the long pass is a discount', () => {
    const rates = CATALOG.map((s) => s.price / s.days);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!, `${CATALOG[i]!.id} costs more per day than ${CATALOG[i - 1]!.id}`).toBeLessThan(
        rates[i - 1]!,
      );
    }
  });
});

describe('there is no shard product, not even as a stub', () => {
  it('has no shard SKU in the catalog', () => {
    const suspicious = CATALOG.filter((s) => /shard|currency|coin|gem/i.test(s.id));
    expect(suspicious).toEqual([]);
  });

  it('names no shard product anywhere in payments source', async () => {
    // This file is the audit surface for "money never becomes shards". A
    // commented-out or flagged shard SKU makes that check answer "almost".
    const dir = new URL('../../src/payments/', import.meta.url).pathname.replace(/^\//, '');
    const offenders: string[] = [];

    for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const full = join(entry.parentPath ?? dir, entry.name);
      const raw = await readFile(full, 'utf8');
      const code = stripComments(raw, entry.name);

      // A product, not a mention: `grants: 'shards'` or an id containing shard.
      if (/id:\s*['"][^'"]*shard/i.test(code) || /grants:\s*['"][^'"]*shard/i.test(code)) {
        offenders.push(entry.name);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has that scan able to fail', () => {
    const planted = `{ id: 'shards-1000', price: 500, days: 0, grants: 'shards' }`;
    expect(/id:\s*['"][^'"]*shard/i.test(planted)).toBe(true);
  });
});
