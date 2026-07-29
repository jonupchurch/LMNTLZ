/**
 * The replay blob store, behind an interface (008 T004, Constitution XIX).
 *
 * ### TL;DR
 *
 * Replays are ~5 KB JSON event logs kept for 7 days in a **private** Vercel Blob
 * store. This module is the only thing in the codebase that knows that. Three
 * operations — write one, read one, delete some — and deliberately **no fourth**.
 *
 * ### `list()` is absent by construction, not by convention
 *
 * The feature's standing rule is that `list()` never appears: not in the cleanup
 * job, not in monitoring, not in an admin view. **Postgres knows what exists**,
 * and the bucket is write-and-delete only.
 *
 * The usual way to enforce that is a grep in CI, and `cleanup.test.ts` (T025) has
 * one. But a grep polices a call that is *possible*; **this interface has no
 * `list` member at all**, so the call does not typecheck. The grep is the backstop
 * for someone importing `list` from `@vercel/blob` directly, which is now a
 * conspicuous thing to do rather than the path of least resistance.
 *
 * Two reasons, and the design one came first:
 *
 * - **Correctness.** The bucket cannot answer *"which replays belong to concluded
 *   battles older than seven days with no open retention hold"*. Only the
 *   database can, so a listing would be a second, worse source of truth.
 * - **Cost, which happens to agree.** `del()` is free; `list()` is a billed
 *   advanced operation. Paging 100k blobs at 1,000 per page is 100 billed
 *   operations per run, against zero for one indexed query.
 *
 * ### Why the interface exists at all
 *
 * Constitution XIX puts vendors behind interfaces, and there is a concrete change
 * already anticipated: **if the provider gains lifecycle expiry, `cleanup.ts`
 * stops being the mechanism and becomes the verification.** That is a change
 * behind this boundary rather than a rewrite of the job.
 *
 * It also makes the whole feature testable without a network. `memoryStorage()`
 * is not a mock of a blob store — it is a real implementation of this contract,
 * which is why a test using it exercises the same code paths production does.
 */

import { del, put } from '@vercel/blob';

/**
 * A stored replay log.
 *
 * Text rather than bytes: the payload is JSON, every consumer wants JSON, and a
 * `Uint8Array` in the middle would mean two encode/decode pairs that could
 * disagree about UTF-8 for no benefit.
 */
export interface ReplayStorage {
  /**
   * Write one replay and return the URL to record on the battle row.
   *
   * **May fail, and the caller must treat that as survivable.** A failed put
   * leaves `replay_blob_url` NULL and costs exactly one replay; it must never
   * fail a battle. See `record.ts` for why this is outside the transaction.
   */
  put(key: string, body: string): Promise<{ readonly url: string }>;

  /**
   * Read one replay, or `null` if it is not there.
   *
   * **`null` rather than a throw for the expected absence.** A deleted or expired
   * replay is the normal end of a replay's life, not an error condition — it
   * happens to every replay eventually. Reserving exceptions for real failures
   * keeps the `410 expired` path from being written in a catch block.
   */
  get(url: string): Promise<string | null>;

  /**
   * Delete one or more replays.
   *
   * **Idempotent, and that is the vendor's guarantee rather than ours**: the SDK
   * documents that `del` succeeds whether or not the URL exists and does not
   * throw on a missing one. That is what lets `cleanupExpired` be safely
   * re-runnable and resumable without tracking which blobs it already visited —
   * a killed batch simply re-deletes some blobs that are already gone.
   *
   * Takes an array because the SDK does, so a batch is one round trip.
   */
  del(urls: readonly string[]): Promise<void>;
}

/** `battles/<uuid>.json` — one flat namespace, keyed by the battle. */
export const replayKey = (battleId: string): string => `battles/${battleId}.json`;

/**
 * The real store.
 *
 * ### `access: 'private'` is passed on every write, even though the store is private
 *
 * The store is created `--access private` and that is the setting that matters.
 * Passing it here as well is deliberate belt-and-braces: the SDK takes `access`
 * per blob, so the store's mode is not the only thing standing between a replay
 * and a public URL. **A public URL cannot be revoked** — it would be a permanent
 * bearer capability for a battle's full event log, and there is no repair for one
 * that leaked except deleting the blob.
 *
 * ### Reads go through this Function, which is the point of a private store
 *
 * A private blob is fetched with an `Authorization` header the client never sees,
 * so every read is authorised by us against the requester. That is what makes a
 * held replay — retained past its window as evidence for a moderation report —
 * readable by moderators and by nobody else. A public URL cannot express that
 * distinction at all.
 */
export function vercelBlobStorage(): ReplayStorage {
  return {
    async put(key, body) {
      const blob = await put(key, body, {
        access: 'private',
        contentType: 'application/json',
        /**
         * **No random suffix**, so the key is a pure function of the battle id.
         * A suffix would make the URL the only way to find a blob, and losing the
         * row would orphan it permanently — with `list()` forbidden, an orphan is
         * unreachable and pays rent forever.
         */
        addRandomSuffix: false,
        /**
         * A replay is written once, at conclusion. Overwrite is allowed only
         * because T016 retries a failed put on a later request, and a retry that
         * refused to overwrite would fail forever after a partial write.
         */
        allowOverwrite: true,
      });

      return { url: blob.url };
    },

    async get(url) {
      /**
       * **`fetch` with the read-write token rather than an SDK helper.** A
       * private blob is an authenticated GET against
       * `https://<store>.private.blob.vercel-storage.com/<path>`, and the token
       * is the same one `put` and `del` use.
       *
       * `VERCEL_OIDC_TOKEN` is the better credential when running on Vercel —
       * it rotates automatically — so it is preferred when present and the
       * static token is the fallback for local and test runs.
       */
      const token = process.env.VERCEL_OIDC_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error('no blob credential: set BLOB_READ_WRITE_TOKEN');

      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

      // 404 is the ordinary end of a replay's life, not a failure.
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`blob read failed: ${response.status} ${response.statusText}`);
      }

      return response.text();
    },

    async del(urls) {
      if (urls.length === 0) return;
      await del([...urls]);
    },
  };
}

// ---------------------------------------------------------------------------
// The swap point
// ---------------------------------------------------------------------------

/**
 * **A module-level `let`, and the same justification `battle/maintenance.ts`
 * carries.** It holds the store's *identity*, which is configuration, not state —
 * nothing about a battle or a replay lives here. `battle/`'s scan for module-level
 * mutable bindings does not reach this directory, so this is discipline rather
 * than a rule; the reasoning is written down so it stays discipline.
 *
 * Lazily constructed so that importing this module never requires a blob
 * credential. A test that installs `memoryStorage()` before anything touches a
 * replay therefore needs no token at all, which is what keeps the suite runnable
 * on a machine that has never seen the store.
 */
let active: ReplayStorage | null = null;

export function replayStorage(): ReplayStorage {
  active ??= vercelBlobStorage();
  return active;
}

/**
 * Point the module at a different store and get a restore function back.
 *
 * Returning the undo rather than exposing a setter is the shape `overrideProvider`
 * and `setMaintenanceSource` already use here: a test cannot forget what the
 * previous value was, because it never had to know.
 */
export function setReplayStorage(next: ReplayStorage | null): () => void {
  const previous = active;
  active = next;
  return () => {
    active = previous;
  };
}

/**
 * An in-memory store for tests.
 *
 * **A real implementation of the contract, not a mock**, so a test that uses it
 * runs the same `record.ts` and `cleanup.ts` code paths production does. The only
 * thing it does not exercise is the network, which is the one part no test should
 * be asserting about anyway.
 *
 * Returns a fake but *well-formed* URL, because `replay_blob_url` is read back
 * and passed to `del` — a placeholder string would let a bug that mangles the URL
 * pass unnoticed.
 */
export function memoryStorage(): ReplayStorage & {
  readonly blobs: Map<string, string>;
  /** Force the next `put` to fail, for the atomicity tests (T036). */
  failNextPut(): void;
} {
  const blobs = new Map<string, string>();
  let failNext = false;

  return {
    blobs,

    failNextPut() {
      failNext = true;
    },

    put(key, body) {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('blob put failed (deliberate, memoryStorage)'));
      }

      const url = `https://test-store.private.blob.vercel-storage.com/${key}`;
      blobs.set(url, body);
      return Promise.resolve({ url });
    },

    get(url) {
      return Promise.resolve(blobs.get(url) ?? null);
    },

    del(urls) {
      // Mirrors the vendor's documented behaviour: deleting what is not there
      // is a success, which is what makes cleanup safe to re-run.
      for (const url of urls) blobs.delete(url);
      return Promise.resolve();
    },
  };
}
