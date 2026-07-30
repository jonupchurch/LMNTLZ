/**
 * The signature is checked over raw bytes, before anything parses (011 T010, T011).
 *
 * ### The silent-failure case is the reason this file is worth writing
 *
 * A parse-then-verify implementation passes every ordinary test: the body it
 * re-serialises is byte-identical to what was sent, because the test wrote it with
 * `JSON.stringify` and the implementation re-runs `JSON.stringify`. It fails in
 * production, intermittently, whenever the provider's serialiser disagrees with
 * V8's — **unusual key order, a unicode escape, a float that round-trips
 * differently** — and it fails as a rejected valid payment, which looks like the
 * provider's fault.
 *
 * So the last describe here posts a correctly-signed body whose bytes a
 * re-serialisation would not reproduce, and asserts it is accepted.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { closeDb } from '../../src/db/client.js';
import { setRail } from '../../src/payments/rail.js';
import { handleNotification } from '../../src/payments/webhook.js';
import { bytes, cleanup, fakeRail, grantsFor, makeAccount, notification, sign } from './fixtures.js';

let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  accountId = await makeAccount('sig');
});

beforeEach(() => {
  undos.push(setRail(fakeRail().rail));
});

afterEach(async () => {
  while (undos.length) undos.pop()!();
  await cleanup([accountId]);
  accountId = await makeAccount('sig');
});

afterAll(async () => {
  await cleanup([accountId]);
  await closeDb();
});

describe('a valid signature', () => {
  it('is accepted', async () => {
    const raw = bytes(notification({ accountId }));
    const outcome = await handleNotification(raw, sign(raw));

    expect(outcome.status).toBe(200);
  });
});

describe('everything else is refused', () => {
  it('refuses a tampered body', async () => {
    const original = notification({ accountId });
    const raw = bytes(original);
    const signature = sign(raw);

    const tampered = bytes({ ...original, amount: 1 });
    const outcome = await handleNotification(tampered, signature);

    expect(outcome.status).toBe(400);
    expect(outcome.status === 400 && outcome.reason).toBe('bad-signature');
  });

  it('refuses a signature lifted from another event', async () => {
    const other = bytes(notification({ accountId }));
    const otherSignature = sign(other);

    const raw = bytes(notification({ accountId }));
    const outcome = await handleNotification(raw, otherSignature);

    expect(outcome.status).toBe(400);
  });

  it('refuses a missing signature', async () => {
    const raw = bytes(notification({ accountId }));
    expect((await handleNotification(raw, '')).status).toBe(400);
  });

  it('refuses a signature of the wrong length without throwing', async () => {
    // timingSafeEqual THROWS on a length mismatch rather than returning false, so
    // a naive implementation turns a malformed signature into a 500.
    const raw = bytes(notification({ accountId }));
    const outcome = await handleNotification(raw, 'abcd');

    expect(outcome.status).toBe(400);
  });

  it('grants nothing for any refused notification', async () => {
    const raw = bytes(notification({ accountId }));
    await handleNotification(raw, 'deadbeef');
    await handleNotification(raw, '');

    expect(await grantsFor(accountId)).toHaveLength(0);
  });
});

describe('the silent-failure case', () => {
  it('accepts a correctly-signed body with unusual key order and a unicode escape', async () => {
    const event = notification({ accountId });

    // Hand-built bytes: keys in an order JSON.stringify would not produce from the
    // object, plus an escaped non-ASCII sequence. A parse-and-reserialise
    // implementation computes its digest over DIFFERENT bytes and rejects this.
    const handBuilt =
      `{"sku":${JSON.stringify(event.sku)},` +
      `"occurredAt":${JSON.stringify(event.occurredAt.toISOString())},` +
      `"kind":"purchase",` +
      `"note":"caf\\u00e9",` +
      `"amount":${event.amount},` +
      `"accountId":${JSON.stringify(event.accountId)},` +
      `"providerEventId":${JSON.stringify(event.providerEventId)}}`;

    const raw = bytes(handBuilt);
    const outcome = await handleNotification(raw, sign(raw));

    expect(outcome.status, 'a valid signature over unusual bytes was rejected').toBe(200);
    expect(await grantsFor(accountId)).toHaveLength(1);
  });

  it('has that case actually differ from a re-serialisation', () => {
    // The test above proves nothing if the hand-built bytes happen to match what
    // JSON.stringify produces. Assert the premise.
    const handBuilt = '{"sku":"pass-7d","kind":"purchase","note":"caf\\u00e9"}';
    const reserialised = JSON.stringify(JSON.parse(handBuilt));

    expect(reserialised, 'the fixture no longer distinguishes the two').not.toBe(handBuilt);
  });
});

describe('the ordering is structural, not incidental', () => {
  it('has JSON.parse appear after the signature check in webhook.ts', async () => {
    const src = await readFile(new URL('../../src/payments/webhook.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(code.length, 'the comment strip emptied the file').toBeGreaterThan(src.length * 0.1);

    const verify = code.indexOf('verifyNotification');
    const parse = code.indexOf('parseNotification');

    expect(verify, 'verifyNotification not found in webhook.ts').toBeGreaterThan(-1);
    expect(parse, 'parseNotification not found in webhook.ts').toBeGreaterThan(-1);
    expect(verify, 'the body is parsed before its signature is checked').toBeLessThan(parse);
  });

  it('takes bytes rather than a string', async () => {
    const src = await readFile(new URL('../../src/payments/webhook.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(code).toMatch(/raw:\s*Uint8Array/);
  });
});
