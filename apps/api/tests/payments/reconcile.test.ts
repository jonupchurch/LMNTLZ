/**
 * Both directions of the daily diff (011 T041).
 *
 * The asymmetry is the thing under test, and it only means something if both
 * directions are exercised: **a deleted grant is restored with an alert; an
 * unpaid grant is alerted and left alone.** A test that only proves the restore
 * would pass just as happily against an implementation that revokes on the other
 * side — which is the version that takes a pass away from a paying customer
 * because the provider's export was late.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { paymentEvents } from '../../src/db/schema/payments.js';
import { setRail } from '../../src/payments/rail.js';
import { applyNotification } from '../../src/payments/webhook.js';
import { entitlementFor } from '../../src/payments/entitlements.js';
import { RECONCILE_WINDOW_MS, reconcile } from '../../src/payments/reconcile.js';
import { cleanup, fakeRail, grantsFor, makeAccount, notification } from './fixtures.js';

let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  accountId = await makeAccount('recon');
});

afterEach(async () => {
  while (undos.length) undos.pop()!();
  await cleanup([accountId]);
  accountId = await makeAccount('recon');
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanup([accountId]);
  await closeDb();
});

describe('they have it, we do not', () => {
  it('grants automatically', async () => {
    // The webhook never arrived. The customer paid and holds nothing, and there is
    // no error anywhere on our side to notice.
    const missed = notification({ accountId, sku: 'pass-28d' });
    undos.push(setRail(fakeRail([missed]).rail));

    const report = await reconcile();

    expect(report.restored).toContain(missed.providerEventId);
    expect(await grantsFor(accountId), 'the missed purchase was not granted').toHaveLength(1);
  });

  it('gives the player the pass they paid for', async () => {
    const missed = notification({ accountId, sku: 'pass-91d' });
    undos.push(setRail(fakeRail([missed]).rail));

    await reconcile();

    const held = await entitlementFor(accountId, 'boost-pass', missed.occurredAt);
    expect(held.active).toBe(true);
    expect(held.daysRemaining).toBe(91);
  });

  it('alerts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    undos.push(setRail(fakeRail([notification({ accountId })]).rail));

    await reconcile();

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/reconcile/i);
  });

  it('does not double-grant when the webhook arrives late', async () => {
    // The reconcile and a late webhook race. Both go through applyNotification,
    // which claims on the provider's id, so the second is a no-op.
    const late = notification({ accountId, sku: 'pass-7d' });
    undos.push(setRail(fakeRail([late]).rail));

    await reconcile();
    await applyNotification(late);

    expect(await grantsFor(accountId)).toHaveLength(1);
  });

  it('restores nothing when both sides already agree', async () => {
    const seen = notification({ accountId });
    undos.push(setRail(fakeRail([seen]).rail));

    await applyNotification(seen);
    const report = await reconcile();

    expect(report.restored).toEqual([]);
    expect(await grantsFor(accountId)).toHaveLength(1);
  });
});

describe('we have it, they do not', () => {
  it('alerts WITHOUT revoking', async () => {
    // The provider reports nothing in the window; we hold a grant. This is at
    // least as likely to be a late or paginated export as a bad grant.
    const ours = notification({ accountId, sku: 'pass-28d' });
    undos.push(setRail(fakeRail([]).rail));

    await applyNotification(ours);
    const before = await entitlementFor(accountId, 'boost-pass', ours.occurredAt);

    const report = await reconcile();

    expect(report.unmatched).toContain(ours.providerEventId);

    const after = await entitlementFor(accountId, 'boost-pass', ours.occurredAt);
    expect(after.active, 'a pass was revoked on a provider reporting gap').toBe(true);
    expect(after.daysRemaining).toBe(before.daysRemaining);
  });

  it('leaves the grant row untouched', async () => {
    undos.push(setRail(fakeRail([]).rail));
    await applyNotification(notification({ accountId, sku: 'pass-28d' }));

    await reconcile();

    const grants = await grantsFor(accountId);
    expect(grants).toHaveLength(1);
    expect(grants[0]!.revokedAt, 'reconcile revoked a grant automatically').toBeNull();
  });
});

describe('the window', () => {
  it('is 48 hours, wider than the daily cadence', () => {
    // A failed run or a skipped deploy must not leave a permanent hole.
    expect(RECONCILE_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
    expect(RECONCILE_WINDOW_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('ignores an event older than the window', async () => {
    const old = notification({
      accountId,
      occurredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    undos.push(setRail(fakeRail([old]).rail));

    const report = await reconcile();

    expect(report.checked, 'an out-of-window event was fetched').toBe(0);
    expect(report.restored).toEqual([]);
  });

  it('reports the window it actually used', async () => {
    undos.push(setRail(fakeRail([]).rail));
    const now = new Date();

    const report = await reconcile(now);

    expect(report.window.to).toEqual(now);
    expect(now.getTime() - report.window.from.getTime()).toBe(RECONCILE_WINDOW_MS);
  });
});

describe('the restored grant is a real one', () => {
  it('carries the provider event id, like any other', async () => {
    const missed = notification({ accountId, sku: 'pass-12d' });
    undos.push(setRail(fakeRail([missed]).rail));

    await reconcile();

    const grants = await grantsFor(accountId);
    expect(grants[0]!.providerEventId).toBe(missed.providerEventId);

    const [event] = await db()
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, missed.providerEventId));

    expect(event, 'reconcile granted without recording the event').toBeDefined();
  });
});
