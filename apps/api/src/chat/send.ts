/**
 * Sending a message (014 T014, T016, T017 — FR-006, FR-010, FR-012).
 *
 * ### The six steps, in this order, and the order is the feature
 *
 * ```
 * 1. authorize scope        may this account write here at all?
 * 2. blocklist / rate / length   SYNCHRONOUS. May reject. Costs nothing.
 * 3. charge                 only now, and only if step 2 passed
 * 4. persist
 * 5. publish                the message is live
 * 6. enqueue classification ASYNCHRONOUS. Never rejects. Never edits.
 * ```
 *
 * **Two generated architecture diagrams drew 2 and 6 the other way round**, which
 * is why this ordering has a test rather than a comment (`ordering.test.ts`).
 * Getting it backwards makes chat either unsafe or unusable:
 *
 * - Classifier **before** send: every message waits on an inference call. A
 *   classifier outage becomes a chat outage, and a 200ms model turns a
 *   conversation into a series of letters. It also means a false positive silently
 *   eats somebody's sentence, which is the failure players never forgive.
 * - Blocklist **after** publish: the slur has already been delivered. There is no
 *   version of "we took it down quickly" that undoes a room having seen it.
 *
 * ### Blocklist before charge, specifically
 *
 * A refused message must cost nothing. Refunding is a second mechanism and a
 * second thing to get wrong (FR-010, T013).
 *
 * ### The classifier cannot hold, block or edit — by construction
 *
 * Step 6 takes the id of an already-published message. There is no code path from
 * the classifier back into this function, and nothing here awaits its verdict.
 * That is what makes FR-012 true structurally rather than by everyone remembering
 * — and it is why `ordering.test.ts` can stop the classifier entirely and still
 * expect a `200`.
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chatMessages } from '../db/schema/chat.js';
import { checkBlocklist, isEmpty, isTooLong, MAX_BODY_LENGTH } from './blocklist.js';
import { broker, type DeliveredMessage } from './transport.js';

/** T017. Per account, per scope. Values want real traffic; the shape does not. */
export const RATE_LIMIT_WINDOW_MS = 30_000;
export const RATE_LIMIT_MESSAGES = 10;

export type SendRefusal =
  | 'not-authorized'
  | 'blocked-term'
  | 'too-long'
  | 'empty'
  | 'rate-limited'
  | 'insufficient-shards';

export type SendResult =
  | { readonly ok: true; readonly messageId: string; readonly delivered: number }
  | { readonly ok: false; readonly reason: SendRefusal };

/** Whether this account may write in this scope. Injected by the route layer. */
export type ScopeAuthorizer = (accountId: string, scope: string) => Promise<boolean>;

/**
 * The classification queue (T016).
 *
 * **Fire-and-forget, and its failure is swallowed on purpose.** Feature 015 owns
 * the consumer; until it exists this is a no-op, which is exactly the state
 * `ordering.test.ts` asserts send is unaffected by. A queue that could throw back
 * into `send` would put the classifier on the send path through the back door.
 */
export type Classifier = (messageId: string, body: string) => void;

let classifier: Classifier | null = null;

export function setClassifier(next: Classifier | null): () => void {
  const previous = classifier;
  classifier = next;
  return () => {
    classifier = previous;
  };
}

export interface SendRequest {
  readonly accountId: string;
  readonly scope: string;
  readonly body: string;
  /** Resolved server-side already; `null` for an ordinary message. */
  readonly embed: string | null;
  /** Shards to charge, already priced. `0` for an ordinary message. */
  readonly charge?: number;
}

/**
 * How many messages this account has put in this scope inside the window.
 *
 * Counted from the stored rows rather than an in-memory counter, because the API
 * is serverless — a counter in module scope is per-instance, and per-instance
 * means the limit multiplies by however many instances happen to be warm.
 */
async function recentCount(accountId: string, scope: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const rows = await db()
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.authorId, accountId),
        eq(chatMessages.scope, scope),
        gte(chatMessages.createdAt, since),
      ),
    );
  return rows.length;
}

export async function send(
  request: SendRequest,
  authorize: ScopeAuthorizer,
  charge: (accountId: string, amount: number) => Promise<boolean>,
  now: Date = new Date(),
): Promise<SendResult> {
  const { accountId, scope, body, embed } = request;
  const amount = request.charge ?? 0;

  // ---- 1. authorize -------------------------------------------------------
  if (!(await authorize(accountId, scope))) return { ok: false, reason: 'not-authorized' };

  // ---- 2. synchronous gates, before any money moves -----------------------
  if (isEmpty(body) && embed === null) return { ok: false, reason: 'empty' };
  if (isTooLong(body)) return { ok: false, reason: 'too-long' };

  /**
   * **Before the charge, and this line is the one T013 is about.** A player with
   * five shards who posts a slur must end the request with five shards.
   */
  if (checkBlocklist(body).blocked) return { ok: false, reason: 'blocked-term' };

  if ((await recentCount(accountId, scope, now)) >= RATE_LIMIT_MESSAGES) {
    return { ok: false, reason: 'rate-limited' };
  }

  // ---- 3. charge ----------------------------------------------------------
  if (amount > 0 && !(await charge(accountId, amount))) {
    return { ok: false, reason: 'insufficient-shards' };
  }

  // ---- 4. persist ---------------------------------------------------------
  const [row] = await db()
    .insert(chatMessages)
    .values({ scope, authorId: accountId, body, embed, createdAt: now })
    .returning({ id: chatMessages.id });

  const message: DeliveredMessage = {
    id: row!.id,
    scope,
    authorId: accountId,
    body,
    embed,
    createdAt: now.toISOString(),
  };

  // ---- 5. publish ---------------------------------------------------------
  const delivered = await broker().publish(scope, message);

  /**
   * ---- 6. classification, **after delivery and unable to affect it** -------
   *
   * Not awaited, and its throw is swallowed. The message is already in front of
   * the room; an exception here must not turn a delivered message into a 500 the
   * sender reads as "it did not send".
   */
  try {
    classifier?.(message.id, body);
  } catch {
    // Deliberately empty: see above. Feature 015 owns retry and the queue.
  }

  return { ok: true, messageId: message.id, delivered };
}

export { MAX_BODY_LENGTH };
