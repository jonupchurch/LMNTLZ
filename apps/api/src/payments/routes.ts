/**
 * `/v1/catalog`, `/v1/checkout`, `/v1/me/entitlements`, `/v1/receipts/:token` and
 * `/v1/webhooks/payments` (011 T001, T022, T024, T025, T028).
 *
 * ### Three different auth postures, each for a stated reason
 *
 * | Route | Guard | Why |
 * |---|---|---|
 * | `catalog` | **none** | prices are public; the store must render before sign-in |
 * | `checkout`, `me/entitlements` | session | per-player, and money |
 * | `webhooks/payments` | **signature, not session** | the caller is the provider, and it has no session |
 * | `receipts/:token` | **signed token, not session** | see below |
 *
 * **A receipt is reachable without signing in, deliberately.** Someone disputing a
 * charge is frequently *not* the person who can sign in — a parent, a partner, a
 * cardholder whose child bought the pass. Requiring a session to see what a charge
 * was for guarantees the dispute goes to the bank instead of to us, which is worse
 * for everybody including the player. The token is signed and single-purpose.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import {
  CATALOG,
  bestShardsPerDollar,
  maxPurchasableAdvantage,
  skuById,
  type CatalogResponse,
} from './catalog.js';
import { getRail, railInstalled, NoRailError } from './rail.js';
import { entitlementFor } from './entitlements.js';
import { handleNotification } from './webhook.js';
import { canAcceptPurchase } from '../progression/cap.js';

export const paymentRoutes = new Hono<AuthedEnv>();

paymentRoutes.use('/checkout', requireSession);
paymentRoutes.use('/me/entitlements', requireSession);

/**
 * The whole storefront, and the ceiling it implies.
 *
 * **`maxPurchasableAdvantagePerYear` is served rather than documented**, so the
 * claim on the pricing page is generated from the same catalog that would break it.
 */
paymentRoutes.get('/catalog', (c) => {
  const body: CatalogResponse = {
    skus: CATALOG,
    currency: 'USD',
    maxPurchasableAdvantagePerYear: maxPurchasableAdvantage(),
    bestShardsPerDollar: bestShardsPerDollar(),
    autoRenews: false,
    available: railInstalled(),
  };
  return c.json(body, 200);
});

/**
 * Start a purchase.
 *
 * **The price comes from our catalog, never from the request.** A client-supplied
 * amount is the oldest defect in commerce, and the shape that prevents it is
 * looking the SKU up rather than validating a number.
 */
paymentRoutes.post('/checkout', async (c) => {
  const { accountId } = requireContext(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const skuId = (body as { sku?: unknown }).sku;
  if (typeof skuId !== 'string') {
    return c.json(apiError('unprocessable', 'A sku is required.'), 422);
  }

  const sku = skuById(skuId);
  if (!sku) {
    return c.json(apiError('not_found', `No such product: ${skuId}.`), 404);
  }

  /**
   * **Feature 010's cap, checked before the rail is touched** (T025).
   *
   * A pass grants no shards, so today this can only refuse on a balance already at
   * the cap — but the check belongs here rather than at the first SKU that does,
   * because the failure it prevents is *taking money for something undeliverable*
   * and that is not a bug anybody wants to discover with a real card.
   */
  const verdict = await canAcceptPurchase(accountId, 0);
  if (!verdict.ok) {
    return c.json(
      apiError('would_exceed_cap', 'That purchase would exceed the shard cap.'),
      409,
    );
  }

  try {
    const session = await getRail().createCheckout({
      accountId,
      sku: sku.id,
      amount: sku.price,
      currency: 'USD',
    });
    return c.json(session, 200);
  } catch (err) {
    if (err instanceof NoRailError) {
      return c.json(apiError('unavailable', 'Payments are not available right now.'), 503);
    }
    throw err;
  }
});

/** What the player holds, and what they have spent against the yearly ceiling. */
paymentRoutes.get('/me/entitlements', async (c) => {
  const { accountId } = requireContext(c);
  const held = await entitlementFor(accountId);

  return c.json(
    {
      boostPass: {
        active: held.active,
        expiresAt: held.expiresAt?.toISOString() ?? null,
        daysRemaining: held.daysRemaining,
      },
      ceiling: {
        maxPurchasableAdvantagePerYear: maxPurchasableAdvantage(),
      },
      autoRenews: false,
    },
    200,
  );
});

/**
 * The provider's callback.
 *
 * **`arrayBuffer()`, not `json()`.** The signature covers the bytes; reading the
 * body as JSON here would defeat the check two functions downstream no matter how
 * carefully `webhook.ts` is written.
 */
paymentRoutes.post('/webhooks/payments', async (c) => {
  let signature: string;
  try {
    /** **The rail names its own header.** This route must not know the vendor's. */
    signature = c.req.header(getRail().signatureHeader) ?? '';
  } catch (err) {
    if (err instanceof NoRailError) {
      return c.json(apiError('unavailable', 'Payments are not configured.'), 503);
    }
    throw err;
  }

  const raw = new Uint8Array(await c.req.arrayBuffer());

  try {
    const outcome = await handleNotification(raw, signature);
    if (outcome.status === 400) {
      return c.json(apiError('bad_signature', 'The notification could not be verified.'), 400);
    }
    return c.json({ handled: outcome.handled }, 200);
  } catch (err) {
    if (err instanceof NoRailError) {
      return c.json(apiError('unavailable', 'Payments are not configured.'), 503);
    }
    throw err;
  }
});
