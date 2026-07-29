/**
 * The live blob store — the **only** file in the suite that talks to it
 * (008 T001, and T018's last line).
 *
 * ### Why one file does this and no other
 *
 * Every other suite installs `memoryStorage()`, so nothing uploads test litter to
 * a paid store that a cleanup job would never find (it looks for battles older
 * than seven days, not for stray keys). But if *nothing* touched the real store,
 * `vercelBlobStorage()` would be the one module in the feature with no coverage at
 * all — and it is the module where a vendor API change breaks production silently.
 *
 * So: this file, small, against the real thing.
 *
 * ### The assertion that cannot be made any other way
 *
 * **An unauthenticated GET of a replay URL must fail.** A public store would serve
 * it, and a public URL is a permanent bearer capability for a battle's full event
 * log — unrevokable, because a URL cannot be withdrawn. It also makes retention
 * holds meaningless: a replay kept past its window as evidence for a moderation
 * report is supposed to be readable by moderators and nobody else, and a public
 * URL cannot express that distinction at all.
 *
 * The access mode is fixed when the store is created. If this test ever fails, the
 * fix is not a config change — it is migrating every blob to a new store.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  replayKey,
  vercelBlobStorage,
  type FetchResponse,
} from '../../src/replays/storage.js';

const store = vercelBlobStorage();

/** A key under its own prefix, so anything left behind is obviously test litter. */
const battleId = `t001-verify-${process.pid}-${Date.now()}`;
const key = replayKey(battleId);
const body = JSON.stringify({ battleId, events: [], conclusion: { winner: 'attacker' } });

let url: string;

beforeAll(async () => {
  /**
   * **Fails loudly without a credential rather than skipping.** The same stance
   * `vitest.config.ts` takes about the database: a suite that silently skipped its
   * own vendor checks would report green on a machine where nothing had been
   * verified. CI does not run this project — it has no secrets and the API suite
   * needs Neon — so the loud failure lands on a developer who can fix it.
   */
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not set. The private blob store cannot be verified; ' +
        'add it to .env.local at the repo root.',
    );
  }

  ({ url } = await store.put(key, body));
}, 120_000);

afterAll(async () => {
  if (url) await store.del([url]);
});

describe('the store is private', () => {
  it('serves the URL from a `.private.` host', () => {
    /**
     * A weak signal on its own — it is the shape of the hostname, not a proof of
     * access control. Kept because it localises a failure: a public host here
     * means the store was created with the wrong access mode, whereas a public
     * host with a blocked read would mean something stranger.
     */
    expect(new URL(url).host).toMatch(/\.private\.blob\.vercel-storage\.com$/);
  });

  it('refuses an unauthenticated read of a replay URL', async () => {
    /**
     * Cast for the same reason `storage.ts` does it: `tests/**` is inside this
     * app's `tsconfig.json`, so a raw `Response` member access here fails the
     * Vercel build exactly as it did there.
     */
    const anonymous = (await fetch(url)) as unknown as FetchResponse;

    expect(
      anonymous.status,
      'the store is PUBLIC — every replay URL is a permanent, unrevokable bearer capability',
    ).not.toBe(200);
    expect(anonymous.status).toBeGreaterThanOrEqual(400);
  });

  it('serves an authorised read, so private does not mean unusable', async () => {
    /**
     * The other half, and it has to be here: a store that blocked *everything*
     * would pass the test above while making replays unwatchable. Both directions
     * or neither.
     */
    const authorised = await store.get(url);
    expect(authorised).toBe(body);
  });
});

describe('the operations cleanup depends on', () => {
  it('deletes idempotently — twice, with no error', async () => {
    /**
     * **`cleanupExpired` is documented as safe to re-run and resumable, and this
     * is what makes that true rather than aspirational.** A batch killed halfway
     * re-deletes blobs that are already gone on the next run; if that threw, every
     * interrupted run would poison the one after it.
     *
     * Asserted against the vendor rather than assumed from its docs, because it is
     * the vendor's behaviour the design leans on.
     */
    const throwaway = await store.put(replayKey(`${battleId}-twice`), body);

    await expect(store.del([throwaway.url])).resolves.toBeUndefined();
    await expect(store.del([throwaway.url])).resolves.toBeUndefined();
  });

  it('reads a deleted blob as null rather than throwing', async () => {
    /**
     * Expiry is the normal end of every replay's life, not an error condition. A
     * `null` here is what lets the `410 expired` path be written as a branch
     * instead of a catch block.
     */
    const throwaway = await store.put(replayKey(`${battleId}-gone`), body);
    await store.del([throwaway.url]);

    /**
     * **Deletion is not instant** — the SDK documents up to a minute for CDN cache
     * eviction. So this asserts the *shape* of the answer on a key that never
     * existed, which is the same code path without the race.
     */
    const missing = await store.get(
      `https://${new URL(url).host}/${replayKey('does-not-exist-ever')}`,
    );
    expect(missing).toBeNull();
  });
});
