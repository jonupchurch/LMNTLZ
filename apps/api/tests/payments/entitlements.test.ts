/**
 * Stacking, lapsing, and arriving backwards (011 T019–T021, T023).
 *
 * The out-of-order case is the one that justifies computing entitlement from the
 * set rather than maintaining a running expiry. It is **guaranteed rather than
 * unlikely**: providers retry independently, so a webhook that timed out is
 * redelivered behind newer traffic, and a refund can land before the purchase it
 * reverses.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/client.js';
import { setRail } from '../../src/payments/rail.js';
import { applyNotification } from '../../src/payments/webhook.js';
import { entitlementFor } from '../../src/payments/entitlements.js';
import { cleanup, fakeRail, grantsFor, makeAccount, notification } from './fixtures.js';

const DAY = 86_400_000;
let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  accountId = await makeAccount('ent');
});

beforeEach(() => {
  undos.push(setRail(fakeRail().rail));
});

afterEach(async () => {
  while (undos.length) undos.pop()!();
  await cleanup([accountId]);
  accountId = await makeAccount('ent');
});

afterAll(async () => {
  await cleanup([accountId]);
  await closeDb();
});

describe('a purchase extends and never replaces', () => {
  it('adds 7 days to a live 28-day pass', async () => {
    const at = new Date();

    await applyNotification(notification({ accountId, sku: 'pass-28d', occurredAt: at }));
    await applyNotification(
      notification({ accountId, sku: 'pass-7d', occurredAt: new Date(at.getTime() + DAY) }),
    );

    // 28 + 7, minus the day that passed. Replacing would leave 7 and silently
    // destroy 27 days the player had already paid for.
    const held = await entitlementFor(accountId, 'boost-pass', new Date(at.getTime() + DAY));
    expect(held.daysRemaining).toBe(34);
  });

  it('never shortens an existing pass', async () => {
    const at = new Date();
    await applyNotification(notification({ accountId, sku: 'pass-364d', occurredAt: at }));
    const before = await entitlementFor(accountId, 'boost-pass', at);

    await applyNotification(notification({ accountId, sku: 'pass-3d', occurredAt: at }));
    const after = await entitlementFor(accountId, 'boost-pass', at);

    expect(after.daysRemaining).toBeGreaterThan(before.daysRemaining);
  });

  it('starts from now rather than backdating when the previous pass has lapsed', async () => {
    const longAgo = new Date(Date.now() - 90 * DAY);
    await applyNotification(notification({ accountId, sku: 'pass-7d', occurredAt: longAgo }));

    const now = new Date();
    await applyNotification(notification({ accountId, sku: 'pass-7d', occurredAt: now }));

    // The lapsed pass's days are spent. The new one is worth its full 7.
    const held = await entitlementFor(accountId, 'boost-pass', now);
    expect(held.daysRemaining).toBe(7);
    expect(held.active).toBe(true);
  });
});

describe('a pass simply ends', () => {
  it('reports inactive after its days are spent, with nothing renewed', async () => {
    const longAgo = new Date(Date.now() - 90 * DAY);
    await applyNotification(notification({ accountId, sku: 'pass-7d', occurredAt: longAgo }));

    const held = await entitlementFor(accountId);

    expect(held.active).toBe(false);
    expect(held.daysRemaining).toBe(0);
  });

  it('charges nothing again — there is exactly one event and one grant', async () => {
    const longAgo = new Date(Date.now() - 90 * DAY);
    await applyNotification(notification({ accountId, sku: 'pass-7d', occurredAt: longAgo }));

    // Nothing auto-renews. No second event exists because nothing creates one.
    expect(await grantsFor(accountId)).toHaveLength(1);
  });

  it('holds nothing at all for an account that never bought', async () => {
    const held = await entitlementFor(accountId);

    expect(held.expiresAt).toBeNull();
    expect(held.active).toBe(false);
  });
});

describe('notifications arriving out of order', () => {
  it('gives the same answer backwards as forwards', async () => {
    const at = new Date();
    const purchase = notification({ accountId, sku: 'pass-28d', occurredAt: at });
    const refund = notification({
      accountId,
      kind: 'refund',
      sku: 'pass-28d',
      occurredAt: new Date(at.getTime() + 60_000),
      reverses: purchase.providerEventId,
    });

    // Backwards: the refund lands FIRST, naming a purchase we have never seen.
    await applyNotification(refund);
    await applyNotification(purchase);

    const held = await entitlementFor(accountId, 'boost-pass', at);
    const grants = await grantsFor(accountId);

    // A running total would subtract nothing from the refund, then apply the
    // purchase, leaving the player holding 28 days they were refunded for.
    expect(grants, 'both notifications were recorded').toHaveLength(1);
    expect(held.active, 'a refunded pass is still active').toBe(false);
  });

  it('drops neither notification', async () => {
    const at = new Date();
    const purchase = notification({ accountId, sku: 'pass-28d', occurredAt: at });
    const refund = notification({
      accountId,
      kind: 'refund',
      sku: 'pass-28d',
      occurredAt: new Date(at.getTime() + 60_000),
      reverses: purchase.providerEventId,
    });

    const first = await applyNotification(refund);
    const second = await applyNotification(purchase);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('leaves an unrelated purchase untouched by the refund', async () => {
    const at = new Date();
    const keep = notification({ accountId, sku: 'pass-7d', occurredAt: at });
    const refunded = notification({ accountId, sku: 'pass-28d', occurredAt: at });

    await applyNotification(keep);
    await applyNotification(refunded);
    await applyNotification(
      notification({
        accountId,
        kind: 'refund',
        sku: 'pass-28d',
        occurredAt: new Date(at.getTime() + 60_000),
        reverses: refunded.providerEventId,
      }),
    );

    // A refund removes THAT grant's days wherever they sat. Subtracting from the
    // end would take days off the still-valid 7-day pass.
    const held = await entitlementFor(accountId, 'boost-pass', at);
    expect(held.daysRemaining).toBe(7);
  });
});

describe('a chargeback revokes like a refund', () => {
  it('deactivates the pass', async () => {
    const at = new Date();
    const purchase = notification({ accountId, sku: 'pass-91d', occurredAt: at });
    await applyNotification(purchase);

    await applyNotification(
      notification({
        accountId,
        kind: 'chargeback',
        sku: 'pass-91d',
        occurredAt: new Date(at.getTime() + DAY),
        reverses: purchase.providerEventId,
      }),
    );

    expect((await entitlementFor(accountId, 'boost-pass', at)).active).toBe(false);
  });

  it('keeps the grant row rather than deleting it', async () => {
    const at = new Date();
    const purchase = notification({ accountId, sku: 'pass-91d', occurredAt: at });
    await applyNotification(purchase);
    await applyNotification(
      notification({
        accountId,
        kind: 'chargeback',
        sku: 'pass-91d',
        occurredAt: at,
        reverses: purchase.providerEventId,
      }),
    );

    // A deleted grant leaves no evidence the player ever held the pass, which is
    // exactly what a dispute needs to see.
    const grants = await grantsFor(accountId);
    expect(grants).toHaveLength(1);
    expect(grants[0]!.revokedAt).not.toBeNull();
  });
});
