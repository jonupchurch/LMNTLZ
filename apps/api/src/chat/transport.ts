/**
 * The realtime transport (014 T005), **behind an interface** (Constitution XIX).
 *
 * ### The broker only fans out, and that is correctness rather than hardening
 *
 * Clients subscribe; they never publish. Every message passes through our own
 * service first — and the reason is not defence in depth, it is **money**. Some
 * postings cost shards. A client holding a credential that could publish to a
 * channel directly would put a message in front of every subscriber without ever
 * touching the route that charges for it, and no amount of after-the-fact
 * reconciliation gets that shard back.
 *
 * ### So this interface has no method that mints a publish credential
 *
 * Not "a method that requires an admin flag", not "a method that throws unless
 * the caller is trusted" — **no method, at any privilege level** (FR-008). A
 * capability that cannot be named cannot be handed out by a tired afternoon's
 * refactor. `publishCredential.test.ts` greps the source for one and fails if it
 * ever appears; the interface is what makes that grep meaningful rather than
 * hopeful.
 *
 * `publish` below is *ours* — it runs on the server, inside `send`, after the
 * charge. `subscribeToken` returns a credential that names channels and can only
 * read them.
 */

/** What a client is given: the channels it may read, and nothing it may write. */
export interface SubscribeGrant {
  readonly token: string;
  /** Exactly the channels this account may read. Not a pattern, a list. */
  readonly channels: readonly string[];
  readonly expiresAt: Date;
}

export interface DeliveredMessage {
  readonly id: string;
  readonly scope: string;
  readonly authorId: string;
  readonly body: string;
  readonly embed: string | null;
  readonly createdAt: string;
}

export interface RealtimeBroker {
  /**
   * Fan a message out to a channel. **Server-side only, always.**
   *
   * Returns the number of subscribers it reached, because that — **delivered,
   * not published** — is what the broker bills for and what T055 instruments.
   * The two diverge by three orders of magnitude on Global.
   */
  publish(channel: string, message: DeliveredMessage): Promise<number>;

  /**
   * A **subscribe-only** credential for these exact channels.
   *
   * There is deliberately no sibling that returns a publishing one.
   */
  subscribeToken(accountId: string, channels: readonly string[], ttlMs: number): Promise<SubscribeGrant>;

  /**
   * Push `token-stale` down an account's control channel.
   *
   * Carries **no content at all** (T008) — so it has no moderation surface, and
   * no cost worth counting. The client's only correct response is to re-mint.
   */
  notifyStale(accountId: string): Promise<void>;
}

/**
 * The in-memory broker, and **it is not only a test double**.
 *
 * Ably is not a dependency of this repo yet and there is no account, so this is
 * what the entire feature is developed and tested against. That is the interface
 * earning its keep on day one rather than at some future vendor swap: everything
 * except *delivery to a real client* is exercised without a vendor at all.
 *
 * It records what it was asked to do so tests can assert on fan-out without a
 * network, and its `subscribeToken` returns an opaque string that grants nothing
 * anywhere — which is the right shape, because the token's contents are the
 * vendor's business and the caller must never read them.
 */
export class InMemoryBroker implements RealtimeBroker {
  readonly published: { channel: string; message: DeliveredMessage }[] = [];
  readonly staleNotices: string[] = [];

  /** channel -> subscriber account ids, so `publish` can report a real count. */
  private readonly subscribers = new Map<string, Set<string>>();

  subscribe(channel: string, accountId: string): void {
    const set = this.subscribers.get(channel) ?? new Set<string>();
    set.add(accountId);
    this.subscribers.set(channel, set);
  }

  publish(channel: string, message: DeliveredMessage): Promise<number> {
    this.published.push({ channel, message });
    return Promise.resolve(this.subscribers.get(channel)?.size ?? 0);
  }

  subscribeToken(
    accountId: string,
    channels: readonly string[],
    ttlMs: number,
  ): Promise<SubscribeGrant> {
    return Promise.resolve({
      // Opaque by construction: nothing may parse this but the broker.
      token: `subscribe-only:${accountId}:${channels.length}`,
      channels: [...channels],
      expiresAt: new Date(Date.now() + ttlMs),
    });
  }

  notifyStale(accountId: string): Promise<void> {
    this.staleNotices.push(accountId);
    return Promise.resolve();
  }
}

/**
 * The process-wide broker.
 *
 * A module-level instance rather than a parameter threaded through every call
 * site, matching how the rest of this app reaches its vendors. `setBroker` exists
 * for tests and for the day an Ably adapter replaces the default.
 */
let current: RealtimeBroker = new InMemoryBroker();

export const broker = (): RealtimeBroker => current;

export function setBroker(next: RealtimeBroker): void {
  current = next;
}
