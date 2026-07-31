/**
 * The store against a test rail (018 T031 · US2's independent test).
 *
 * ### TL;DR
 *
 * Buy a pass, see it appear; buy again while it is live, see the days add
 * rather than reset.
 *
 * ### Why the second purchase is the point
 *
 * Stacking is the rule most likely to be got wrong and the one a player is
 * least able to verify. `entitlementFor()` folds grants *"additive from the
 * later of now and the running end"*, which is what makes extension work
 * without letting a lapsed pass backdate — and a client that re-read the
 * entitlement after a purchase would show whatever the server folded. A client
 * that *computed* the new end would be right until a refund landed out of
 * order.
 *
 * So the mock serves a folded entitlement, and the assertion is that both
 * numbers on screen came from the payload.
 */

import { expect, test } from '@playwright/test';
import { signedIn } from './fixtures.js';

const SKUS = [
  { id: 'pass-3d', price: 500, days: 3, grants: 'boost-pass' },
  { id: 'pass-7d', price: 1_000, days: 7, grants: 'boost-pass' },
  { id: 'pass-28d', price: 2_000, days: 28, grants: 'boost-pass' },
];

const DESCRIPTOR = 'LMNTLZ';

const catalog = (available: boolean) => ({
  skus: SKUS,
  currency: 'USD',
  maxPurchasableAdvantagePerYear: 42_000,
  bestShardsPerDollar: 3.2,
  autoRenews: false,
  available,
  statementDescriptor: DESCRIPTOR,
});

const entitlements = (days: number) => ({
  boostPass: {
    active: days > 0,
    expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    daysRemaining: days,
  },
  ceiling: { maxPurchasableAdvantagePerYear: 42_000 },
  autoRenews: false,
});

const SHARDS = {
  balance: 100,
  today: { nextBoundaryAt: '2026-08-02T00:00:00.000Z' },
};

test('a purchase appears, and buying again adds days rather than replacing them', async ({
  page,
}) => {
  await signedIn(page);

  /** The server's fold, mocked: 0 → 7 → 7 + 7. */
  let held = 0;

  await page.route('**/v1/catalog', (r) => r.fulfill({ json: catalog(true) }));
  await page.route('**/v1/me/shards', (r) => r.fulfill({ json: SHARDS }));
  await page.route('**/v1/me/entitlements', (r) => r.fulfill({ json: entitlements(held) }));

  /**
   * The rail returns no URL, so the screen stays put and reports it. That keeps
   * the spec in one page — navigating to a provider is the provider's test, not
   * ours — while still exercising the whole request path.
   */
  await page.route('**/v1/checkout', async (route) => {
    held += 7;
    await route.fulfill({ json: {} });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /the store/i }).click();

  const durations = page.getByRole('region', { name: 'Seven durations' });
  await expect(durations).toBeVisible();

  /* No pass yet, and the screen says what one would do. */
  const holdings = page.getByRole('region', { name: 'What you hold' });
  await expect(holdings).toContainText('No pass');

  await page.locator('[data-sku="pass-7d"]').click();

  /* The descriptor is beside the pay control, not in a footer. */
  const checkout = page.getByRole('region', { name: 'Checkout' });
  await expect(checkout).toContainText(DESCRIPTOR);
  await expect(checkout).toContainText('Nothing renews automatically');

  await page.getByRole('button', { name: /^pay/i }).click();

  /* The purchase went through; reload the screen the way a return from the
     provider would. */
  await page.reload();
  await page.getByRole('button', { name: /the store/i }).click();
  await expect(page.getByRole('region', { name: 'What you hold' })).toContainText('7 days left');

  /* Buy again while it is live — the stacking note states both numbers. */
  await page.locator('[data-sku="pass-7d"]').click();
  await expect(page.getByRole('region', { name: 'Checkout' })).toContainText('7 → 14 days');
});

test('with no rail there is nothing to click', async ({ page }) => {
  await signedIn(page);

  await page.route('**/v1/catalog', (r) => r.fulfill({ json: catalog(false) }));
  await page.route('**/v1/me/shards', (r) => r.fulfill({ json: SHARDS }));
  await page.route('**/v1/me/entitlements', (r) => r.fulfill({ json: entitlements(0) }));

  await page.goto('/');
  await page.getByRole('button', { name: /the store/i }).click();

  await page.locator('[data-sku="pass-7d"]').click();

  /**
   * **The current production state.** `setRail()` is called by tests only, so
   * `POST /v1/checkout` raises `NoRailError` today. A Pay button here would take
   * every player through a click that ends in a 503 they would read as *your
   * card was refused*.
   */
  await expect(page.getByRole('button', { name: /^pay/i })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Checkout' })).toContainText(/unavailable/i);
});
