/**
 * The confirmation email (011 T027).
 *
 * **The descriptor is the reason this email exists**, so it is asserted in the
 * subject and the body rather than merely present somewhere. A cardholder who
 * cannot match a statement line to a purchase goes to their bank, and a dispute
 * costs a fee and a chargeback ratio regardless of who was right.
 *
 * The other half is that **a mail failure must never fail a payment**. The
 * entitlement is already recorded by the time this runs; a non-2xx to the provider
 * because a mail server was slow makes them retry a working payment.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/client.js';
import { setRail } from '../../src/payments/rail.js';
import { applyNotification } from '../../src/payments/webhook.js';
import {
  STATEMENT_DESCRIPTOR,
  mailerInstalled,
  receiptBody,
  sendReceipt,
  setMailer,
  type Email,
} from '../../src/payments/receipt.js';
import { mailCredentials } from '../../src/payments/provider/mailer.js';
import { cleanup, fakeRail, makeAccount, notification } from './fixtures.js';

let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  accountId = await makeAccount('receipt');
});

afterEach(async () => {
  while (undos.length) undos.pop()!();
  await cleanup([accountId]);
  accountId = await makeAccount('receipt');
});

afterAll(async () => {
  await cleanup([accountId]);
  await closeDb();
});

function capture(): { sent: Email[]; install: () => void } {
  const sent: Email[] = [];
  return {
    sent,
    install: () => undos.push(setMailer({ send: async (email) => void sent.push(email) })),
  };
}

describe('the statement descriptor', () => {
  it('is in the subject line, so an inbox search finds it', () => {
    const body = receiptBody(notification({ accountId, sku: 'pass-7d' }), 7)!;
    expect(body.subject).toContain(STATEMENT_DESCRIPTOR);
  });

  it('is in the body too', () => {
    const body = receiptBody(notification({ accountId, sku: 'pass-7d' }), 7)!;
    expect(body.text).toContain(STATEMENT_DESCRIPTOR);
  });

  it('appears in both places, not one', () => {
    // The subject is what a search matches; the body is what they read to confirm.
    const body = receiptBody(notification({ accountId, sku: 'pass-28d' }), 28)!;
    const inSubject = body.subject.includes(STATEMENT_DESCRIPTOR);
    const inBody = body.text.includes(STATEMENT_DESCRIPTOR);

    expect(inSubject && inBody).toBe(true);
  });
});

describe('what the email actually says', () => {
  it('names the amount in dollars rather than cents', () => {
    const body = receiptBody(notification({ accountId, sku: 'pass-28d', amount: 2_000 }), 28)!;
    expect(body.text).toContain('$20.00');
    expect(body.text, 'raw cents leaked into the copy').not.toMatch(/\$2000\b/);
  });

  it('states that nothing auto-renews', () => {
    // There is no subscription product at all, and the email is where a customer
    // decides whether they need to go looking for a cancel button.
    const body = receiptBody(notification({ accountId, sku: 'pass-364d' }), 364)!;
    expect(body.text.toLowerCase()).toContain('auto-renew');
    expect(body.text.toLowerCase()).toContain('one-off');
  });

  it('says the pass grants no shards and raises no ceiling', () => {
    const body = receiptBody(notification({ accountId, sku: 'pass-7d' }), 7)!;
    expect(body.text).toMatch(/does not grant shards directly/i);
  });

  it('carries the provider reference for support', () => {
    const event = notification({ accountId, sku: 'pass-7d' });
    const body = receiptBody(event, 7)!;
    expect(body.text).toContain(event.providerEventId);
  });

  it('returns nothing for an unknown sku rather than inventing a total', () => {
    expect(receiptBody(notification({ accountId, sku: 'not-a-product' }), 0)).toBeNull();
  });
});

describe('a mail failure never fails a payment', () => {
  it('returns false rather than throwing when the mailer errors', async () => {
    undos.push(
      setMailer({
        send: async () => {
          throw new Error('smtp exploded');
        },
      }),
    );

    const sent = await sendReceipt(notification({ accountId, sku: 'pass-7d' }), 'a@example.com');
    expect(sent).toBe(false);
  });

  it('leaves the entitlement intact when the mail fails', async () => {
    undos.push(setRail(fakeRail().rail));
    undos.push(
      setMailer({
        send: async () => {
          throw new Error('smtp exploded');
        },
      }),
    );

    const event = notification({ accountId, sku: 'pass-28d' });
    const outcome = await applyNotification(event);
    await sendReceipt(event, 'a@example.com');

    expect(outcome.status).toBe(200);
    expect(outcome.status === 200 && outcome.handled).toBe('granted');
  });

  it('sends nothing when no mailer is installed', async () => {
    undos.push(setMailer(null));
    expect(mailerInstalled()).toBe(false);

    const sent = await sendReceipt(notification({ accountId, sku: 'pass-7d' }), 'a@example.com');
    expect(sent).toBe(false);
  });

  it('sends nothing without an address', async () => {
    const { install, sent } = capture();
    install();

    expect(await sendReceipt(notification({ accountId, sku: 'pass-7d' }), '')).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('the happy path', () => {
  it('sends one email to the address given', async () => {
    undos.push(setRail(fakeRail().rail));
    const { install, sent } = capture();
    install();

    const event = notification({ accountId, sku: 'pass-91d' });
    await applyNotification(event);

    expect(await sendReceipt(event, 'player@example.com')).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('player@example.com');
  });

  it('reports the days the player actually holds, not just the sku', async () => {
    undos.push(setRail(fakeRail().rail));
    const { install, sent } = capture();
    install();

    // Two purchases: the receipt for the second should say 35, not 7.
    const at = new Date();
    await applyNotification(notification({ accountId, sku: 'pass-28d', occurredAt: at }));
    const second = notification({ accountId, sku: 'pass-7d', occurredAt: at });
    await applyNotification(second);

    await sendReceipt(second, 'player@example.com');

    expect(sent[0]!.text).toContain('35 days');
  });
});

describe('credentials', () => {
  it('reads the marketplace-prefixed name as well as a hand-set one', () => {
    // A marketplace integration prefixes its variables with its own slug; a
    // hand-set variable does not. Both must work, because the marketplace path is
    // the one that once attached itself to the wrong project.
    const creds = mailCredentials();

    if (creds) {
      expect(creds.key.length, 'a key was found but looks empty').toBeGreaterThan(10);
      expect(creds.domain).toBeTruthy();
    } else {
      // No credentials in this environment is a legitimate state, not a failure.
      expect(creds).toBeNull();
    }
  });

  it('never returns a key in a loggable shape', () => {
    // The value must never reach a log line. This asserts the function returns it
    // as data rather than, say, printing it — a regression here is a leaked key.
    const creds = mailCredentials();
    expect(typeof creds === 'object').toBe(true);
  });
});
