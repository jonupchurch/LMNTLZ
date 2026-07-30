/**
 * Exactly-once, where retries are the normal case (011 T008, T009).
 *
 * A provider retries on any non-2xx, on a timeout, and sometimes simply twice. So
 * "process once" is not a happy path with an edge case attached — **the duplicate
 * is the ordinary traffic**, and granting twice is a revenue defect and a support
 * case at the same time.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/client.js';
import { setRail } from '../../src/payments/rail.js';
import { handleNotification } from '../../src/payments/webhook.js';
import { entitlementFor } from '../../src/payments/entitlements.js';
import { bytes, cleanup, fakeRail, grantsFor, makeAccount, notification, sign } from './fixtures.js';

let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  accountId = await makeAccount('idem');
});

beforeEach(() => {
  undos.push(setRail(fakeRail().rail));
});

afterEach(async () => {
  while (undos.length) undos.pop()!();
  await cleanup([accountId]);
  accountId = await makeAccount('idem');
});

afterAll(async () => {
  await cleanup([accountId]);
  await closeDb();
});

const post = (payload: unknown) => {
  const raw = bytes(payload);
  return handleNotification(raw, sign(raw));
};

describe('the same event twice', () => {
  it('answers 200 both times', async () => {
    const event = notification({ accountId });

    const first = await post(event);
    const second = await post(event);

    // 409 on the duplicate would make the provider retry forever over an event
    // that was handled correctly the first time. The duplicate is the protocol.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('grants exactly one entitlement', async () => {
    const event = notification({ accountId });

    await post(event);
    await post(event);
    await post(event);

    expect(await grantsFor(accountId)).toHaveLength(1);
  });

  it('reports the second as a replay rather than as a grant', async () => {
    const event = notification({ accountId });

    const first = await post(event);
    const second = await post(event);

    expect(first.status === 200 && first.handled).toBe('granted');
    expect(second.status === 200 && second.handled).toBe('replay');
  });
});

describe('the case a derived key would break', () => {
  it('grants twice for the same account, sku and amount 45 seconds apart', async () => {
    // THE test for this table's primary key. A key derived from
    // (account, sku, amount) looks equivalent and silently de-duplicates a real
    // second purchase — they paid twice and hold one pass, with no error anywhere.
    const at = new Date();
    const later = new Date(at.getTime() + 45_000);

    await post(notification({ accountId, sku: 'pass-7d', amount: 1_000, occurredAt: at }));
    await post(notification({ accountId, sku: 'pass-7d', amount: 1_000, occurredAt: later }));

    const grants = await grantsFor(accountId);
    expect(grants, 'a legitimate second purchase was de-duplicated away').toHaveLength(2);
  });

  it('adds both purchases to the entitlement', async () => {
    const at = new Date();
    await post(notification({ accountId, sku: 'pass-7d', occurredAt: at }));
    await post(notification({ accountId, sku: 'pass-7d', occurredAt: new Date(at.getTime() + 45_000) }));

    const held = await entitlementFor(accountId, 'boost-pass', at);
    expect(held.daysRemaining, 'two 7-day passes should be 14 days').toBe(14);
  });
});

describe('concurrent retries', () => {
  it('grants once when the same event is posted simultaneously', async () => {
    // Two concurrent retries is exactly what a provider does when the first
    // attempt times out — and it is the window a SELECT-then-INSERT races through.
    const event = notification({ accountId });

    const outcomes = await Promise.all([post(event), post(event), post(event), post(event)]);

    expect(outcomes.every((o) => o.status === 200)).toBe(true);
    expect(await grantsFor(accountId)).toHaveLength(1);

    const granted = outcomes.filter((o) => o.status === 200 && o.handled === 'granted');
    expect(granted, 'exactly one caller should have won the claim').toHaveLength(1);
  });
});
