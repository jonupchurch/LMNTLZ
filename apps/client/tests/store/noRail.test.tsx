/**
 * **No payment rail means no control at all** (018 T022 · FR-009).
 *
 * ### TL;DR
 *
 * There is no payment provider connected yet. In that state the store says so
 * and offers nothing to click — rather than showing a Pay button that fails.
 *
 * ### Why this is the most important test in the store suite right now
 *
 * It is the **current production state**. `PaymentRail` is defined, `setRail()`
 * is called by tests only, and `POST /v1/checkout` raises `NoRailError` and
 * answers `503` in production. So a store shipped with a working-looking Pay
 * button would, today, take every player through a click that ends in a server
 * error.
 *
 * And the failure would be misread. A 503 on a pay button does not read as
 * *"we have no payment provider"* — it reads as **"your card was refused"**,
 * which is a support ticket, a lost sale, and a player who now distrusts the
 * store. Absent beats disabled for the same reason it does in the rail: a
 * disabled Pay button invites the player to work out why, and this interface
 * cannot answer that.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreScreen } from '../../src/features/store/StoreScreen.js';
import { CATALOG, ENTITLEMENTS, SHARDS, SKUS, requested, stubStore } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const openStore = async (available: boolean) => {
  stubStore({
    '/catalog': CATALOG({ available }),
    '/me/entitlements': ENTITLEMENTS(),
    '/me/shards': SHARDS,
  });
  render(<StoreScreen onUnauthenticated={() => {}} />);
  return screen.findByRole('region', { name: 'Seven durations' });
};

describe('with no rail installed', () => {
  it('offers no pay control anywhere', async () => {
    const user = userEvent.setup();
    await openStore(false);

    /* Choose a duration first — the control must stay absent even then. */
    await user.click(document.querySelector(`[data-sku="${SKUS[0]!.id}"]`) as HTMLElement);

    expect(
      screen.queryByRole('button', { name: /^pay/i }),
      'a Pay button exists with no provider behind it — it would 503',
    ).toBeNull();
  });

  it('says purchasing is unavailable, and that it is not the player', async () => {
    await openStore(false);
    const checkout = screen.getByRole('region', { name: 'Checkout' });

    expect(checkout.textContent).toMatch(/unavailable/i);
    /**
     * The sentence that stops the misread. Without it the player's reasonable
     * conclusion is that something is wrong with their account.
     */
    expect(checkout.textContent).toMatch(/not a problem with your account or your card/i);
  });

  it('still shows the durations, because the prices are real', async () => {
    await openStore(false);
    const durations = screen.getByRole('region', { name: 'Seven durations' });

    /* The catalog is honest and browsable; only buying is unavailable. */
    expect(durations.querySelectorAll('[data-sku]')).toHaveLength(SKUS.length);
  });

  it('never reaches /checkout', async () => {
    const user = userEvent.setup();
    await openStore(false);

    await user.click(document.querySelector(`[data-sku="${SKUS[0]!.id}"]`) as HTMLElement);

    expect(requested().some((r) => r.includes('/checkout'))).toBe(false);
  });
});

describe('with a rail installed', () => {
  /**
   * **The companion that must pass.** Without it, a store that never rendered a
   * Pay button under any condition would satisfy every assertion above — a
   * different bug wearing the same green tick.
   */
  it('does offer a pay control', async () => {
    const user = userEvent.setup();
    await openStore(true);

    await user.click(document.querySelector(`[data-sku="${SKUS[0]!.id}"]`) as HTMLElement);

    expect(screen.getByRole('button', { name: /^pay/i })).toBeTruthy();
  });

  it('and a 503 from the server says nothing was charged', async () => {
    const user = userEvent.setup();

    /* `available: true` but the rail has gone since the catalog was read —
       which is a real race, not a contrived one. */
    stubStore(
      { '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS },
      {
        '/checkout': {
          status: 503,
          body: { error: { code: 'unavailable', message: 'Payments are not available.' } },
        },
      },
    );
    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });

    await user.click(document.querySelector(`[data-sku="${SKUS[0]!.id}"]`) as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/unavailable/i);
    /* The reassurance is the point: a failed checkout must never leave a
       player wondering whether they were charged. */
    expect(alert.textContent).toMatch(/nothing was charged/i);
  });
});
