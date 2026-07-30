/**
 * A working payment rail with **real HMAC**, and no vendor account behind it.
 *
 * This is what the `PaymentRail` interface buys. Every behavioural claim in this
 * feature — exactly-once, signature-before-parse, additive extension,
 * out-of-order refunds, reconciliation — is a property of *our* code, and none of
 * them needs a provider to exercise. What the real provider adds is one
 * implementation of four methods, and its own signature scheme.
 *
 * **The signature is genuine SHA-256 HMAC over the raw bytes**, not a stub that
 * returns `true`. A stub would make `signature.test.ts` prove nothing, and the
 * case that matters most there — a correctly-signed body with unusual key order —
 * is only meaningful against a real digest.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { paymentEvents } from '../../src/db/schema/payments.js';
import { entitlementGrants } from '../../src/db/schema/entitlements.js';
import type { CheckoutRequest, CheckoutSession, PaymentRail, RailNotification } from '../../src/payments/rail.js';

export const SECRET = 'test-webhook-secret-not-a-real-one';

export const sign = (raw: Uint8Array, secret = SECRET): string =>
  createHmac('sha256', secret).update(raw).digest('hex');

export const bytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

/** Everything the fake rail was asked to do, so a test can assert it was NOT asked. */
export interface RailCalls {
  checkouts: CheckoutRequest[];
  verifications: number;
}

export function fakeRail(
  transactions: readonly RailNotification[] = [],
): { rail: PaymentRail; calls: RailCalls } {
  const calls: RailCalls = { checkouts: [], verifications: 0 };

  const rail: PaymentRail = {
    signatureHeader: 'x-signature',

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      calls.checkouts.push(request);
      return { url: `https://pay.example/${request.sku}`, reference: `ref-${request.sku}` };
    },

    async verifyNotification(raw: Uint8Array, signature: string): Promise<boolean> {
      calls.verifications += 1;
      const expected = Buffer.from(sign(raw), 'hex');
      let given: Buffer;
      try {
        given = Buffer.from(signature, 'hex');
      } catch {
        return false;
      }
      // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
      if (given.length !== expected.length) return false;
      return timingSafeEqual(given, expected);
    },

    parseNotification(raw: Uint8Array): RailNotification {
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
      return {
        providerEventId: String(parsed['providerEventId']),
        kind: parsed['kind'] as RailNotification['kind'],
        accountId: String(parsed['accountId']),
        sku: String(parsed['sku']),
        amount: Number(parsed['amount']),
        occurredAt: new Date(String(parsed['occurredAt'])),
        ...(parsed['reverses'] ? { reverses: String(parsed['reverses']) } : {}),
      };
    },

    async listTransactions(since: Date): Promise<readonly RailNotification[]> {
      return transactions.filter((t) => t.occurredAt >= since);
    },
  };

  return { rail, calls };
}

let seq = 0;

/** A notification with a unique provider id unless one is given. */
export function notification(over: Partial<RailNotification> & { accountId: string }): RailNotification {
  seq += 1;
  return {
    providerEventId: `evt-${process.pid}-${seq}`,
    kind: 'purchase',
    sku: 'pass-7d',
    amount: 1_000,
    occurredAt: new Date(),
    ...over,
  };
}

export const suffix = (tag: string): string =>
  `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

export async function makeAccount(tag: string): Promise<string> {
  const key = suffix(tag);
  const [row] = await db()
    .insert(accounts)
    .values({ username: `Pay ${key}`, usernameKey: key })
    .returning();
  return row!.id;
}

/**
 * Clean up in dependency order.
 *
 * `entitlement_grants.provider_event_id` is `ON DELETE restrict`, so payment
 * events cannot be removed while a grant points at them — which is the constraint
 * working, and it means the teardown order is not optional.
 */
export async function cleanup(accountIds: readonly string[]): Promise<void> {
  if (accountIds.length === 0) return;
  const ids = [...accountIds];

  await db().delete(entitlementGrants).where(inArray(entitlementGrants.accountId, ids));
  await db().delete(paymentEvents).where(inArray(paymentEvents.accountId, ids));
  await db().delete(accounts).where(inArray(accounts.id, ids));
}

export const grantsFor = (accountId: string) =>
  db().select().from(entitlementGrants).where(eq(entitlementGrants.accountId, accountId));
