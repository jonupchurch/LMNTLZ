/**
 * **How often we ask Google for its keys**, which is invisible from the outside
 * and wrong in both directions if nobody counts.
 *
 * - Fetch **per request** and every sign-in pays a round trip to Google, on the
 *   critical path, for a value that changes weekly.
 * - Fetch **once, forever** and the day Google rotates its keys every sign-in
 *   starts failing, with nothing in our logs saying why.
 * - Fetch **on every unknown `kid`** — the obvious middle ground — and a forged
 *   token bearing a *random* `kid` triggers a fetch. Send a few thousand and
 *   this server becomes a fetch amplifier pointed at Google. **The first symptom
 *   is Google rate-limiting our real sign-ins**, which looks like an outage with
 *   no cause.
 *
 * `cacheMaxAge` fixes the first two. **`cooldownDuration` is the one that is a
 * security control**, and the only way to see it working is to count.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createGoogleProvider, createGoogleJwks, JWKS_COOLDOWN_MS, JWKS_CACHE_MAX_AGE_MS } from '../../src/auth/google.js';
import { CLIENT_ID, fakeGoogle, stubJwksFetch, type FakeGoogle } from './fixtures.js';

const TEST_JWKS_URL = 'https://jwks.test.invalid/certs';

let google: FakeGoogle;

beforeAll(async () => {
  google = await fakeGoogle();
});

/** A fresh provider and a fresh counter, so each test starts from zero fetches. */
function freshProvider() {
  const stub = stubJwksFetch(google.jwks);
  const provider = createGoogleProvider({
    clientId: CLIENT_ID,
    jwks: createGoogleJwks(TEST_JWKS_URL),
  });
  return { provider, stub };
}

describe('the options are what make this correct, not the wrapper', () => {
  it('sets a bounded cache and a bounded refetch', () => {
    expect(JWKS_CACHE_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(JWKS_COOLDOWN_MS).toBe(30_000);
  });
});

describe('fetch counting', () => {
  it('fetches once for the first verification', async () => {
    const { provider, stub } = freshProvider();
    try {
      await provider.verify(await google.sign());
      expect(stub.calls).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('still has fetched once after 100 more verifications', async () => {
    const { provider, stub } = freshProvider();
    try {
      const token = await google.sign();
      for (let i = 0; i < 101; i++) await provider.verify(token);

      // If this is 101, every sign-in is paying a round trip to Google.
      expect(stub.calls).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('does NOT refetch on an unknown `kid` inside the cooldown window', async () => {
    // **Stricter than the task description assumed, and worth writing down.**
    // The cooldown suppresses the *first* unknown-kid refetch too, when it lands
    // within 30 s of the last fetch. It is not "one free refetch then a
    // cooldown" — it is a hard floor on the interval, full stop.
    //
    // The consequence is real and acceptable: for up to 30 s after a Google key
    // rotation, sign-ins with the new key fail. That is the price of not being
    // a fetch amplifier, and 30 s of failed sign-ins beats Google rate-limiting
    // us for an hour.
    const { provider, stub } = freshProvider();
    try {
      await provider.verify(await google.sign());
      expect(stub.calls).toBe(1);

      await provider.verify(await google.signWithUnknownKey()).catch(() => undefined);
      expect(stub.calls).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('refetches exactly once on an unknown `kid` after the cooldown lapses', async () => {
    const { provider, stub } = freshProvider();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await provider.verify(await google.sign());
      expect(stub.calls).toBe(1);

      // Past the cooldown. A key it has never seen is what a genuine Google
      // rotation looks like from here, so now it MUST provoke a refetch —
      // otherwise a rotation is a permanent outage rather than a 30 s one.
      vi.setSystemTime(Date.now() + JWKS_COOLDOWN_MS + 1_000);
      await provider.verify(await google.signWithUnknownKey()).catch(() => undefined);
      expect(stub.calls).toBe(2);

      // **The rate-limit guard.** Each of these is a forged token with a `kid`
      // the key set does not contain. Without the cooldown every one is a
      // fetch, and an attacker with a loop is a denial-of-service against
      // Google's endpoint, signed by us.
      for (let i = 0; i < 100; i++) {
        await provider.verify(await google.signWithUnknownKey()).catch(() => undefined);
      }

      expect(
        stub.calls,
        `${stub.calls} fetches for 102 verifications — the cooldown is not in force, ` +
          `and a loop of forged tokens is now a fetch amplifier pointed at Google.`,
      ).toBe(2);
    } finally {
      vi.useRealTimers();
      stub.restore();
    }
  });

  it('rejects the forged tokens it refuses to refetch for', async () => {
    // The cooldown must not become a way IN. Refusing to refetch is only safe
    // if the token is still rejected — a cache that answered "no matching key,
    // assume valid" would be the worst possible reading of this optimisation.
    const { provider, stub } = freshProvider();
    try {
      await provider.verify(await google.sign());
      for (let i = 0; i < 20; i++) {
        await expect(provider.verify(await google.signWithUnknownKey())).rejects.toThrow();
      }
    } finally {
      stub.restore();
    }
  });
});
