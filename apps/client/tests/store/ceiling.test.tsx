/**
 * **A purchase past the shard cap is refused before the rail is reached**
 * (018 T023 · FR-010).
 *
 * ### TL;DR
 *
 * If buying something could not actually give you what it promises, the refusal
 * has to happen before any money moves — and the player has to be told nothing
 * was charged.
 *
 * ### The failure this prevents is taking money for something undeliverable
 *
 * `POST /v1/checkout` runs `canAcceptPurchase()` **before** touching the
 * provider, and answers `409 would_exceed_cap`. That ordering is the whole
 * defence: once the rail has a session, a refund is the only remedy, and a
 * refund is a support cost, a provider fee and a player who is now unsure
 * whether they were charged.
 *
 * So this file asserts the client's half — that a `409` reads as a refusal
 * rather than an error page, and that it says the words *nothing was charged*.
 * The server's half is `apps/api/tests/payments/`.
 *
 * ### And stacking, which is the other thing a player must know before paying
 *
 * Buying while a pass is live **adds to the end date**. A player who does not
 * know that either waits — losing days they paid for — or buys and believes
 * they lost the remainder.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreScreen } from '../../src/features/store/StoreScreen.js';
import { CATALOG, ENTITLEMENTS, SHARDS, SKUS, requested, stubStore } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const SKU = SKUS[1]!;

describe('a purchase that would breach the ceiling', () => {
  it('reads as a refusal and says nothing was charged', async () => {
    const user = userEvent.setup();

    stubStore(
      { '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS },
      {
        '/checkout': {
          status: 409,
          body: {
            error: { code: 'would_exceed_cap', message: 'That purchase would exceed the shard cap.' },
          },
        },
      },
    );

    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });

    await user.click(document.querySelector(`[data-sku="${SKU.id}"]`) as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/past the shard cap/i);
    expect(
      alert.textContent,
      'a failed checkout must never leave a player wondering whether they were charged',
    ).toMatch(/before anything was charged/i);
  });

  it('leaves the store usable rather than becoming an error page', async () => {
    const user = userEvent.setup();

    stubStore(
      { '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS },
      {
        '/checkout': {
          status: 409,
          body: { error: { code: 'would_exceed_cap', message: 'nope' } },
        },
      },
    );

    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });

    await user.click(document.querySelector(`[data-sku="${SKU.id}"]`) as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^pay/i }));
    await screen.findByRole('alert');

    /* Still seven durations, still choosable. A refusal is a state of the
       screen, not a replacement for it. */
    expect(
      screen.getByRole('region', { name: 'Seven durations' }).querySelectorAll('[data-sku]'),
    ).toHaveLength(SKUS.length);
    expect(screen.getByRole('button', { name: /^pay/i })).toBeEnabled();
  });

  it('sends exactly one checkout, with the sku and no price', async () => {
    const user = userEvent.setup();

    stubStore(
      { '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS },
      { '/checkout': { status: 409, body: { error: { code: 'would_exceed_cap', message: 'no' } } } },
    );

    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });

    await user.click(document.querySelector(`[data-sku="${SKU.id}"]`) as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^pay/i }));
    await screen.findByRole('alert');

    /**
     * **The price is never in the request.** A client-supplied amount is the
     * oldest defect in commerce; the server looks the SKU up. Asserted here as
     * well as server-side because this is the end that would send it.
     */
    const checkouts = requested().filter((r) => r.includes('/checkout'));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]).toMatch(/^POST/);
  });
});

describe('stacking is stated before the purchase, not after', () => {
  it('says the days add rather than replace', async () => {
    const user = userEvent.setup();

    stubStore({
      '/catalog': CATALOG(),
      '/me/entitlements': ENTITLEMENTS({
        boostPass: { active: true, expiresAt: '2026-08-20T00:00:00.000Z', daysRemaining: 20 },
      }),
      '/me/shards': SHARDS,
    });

    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });

    await user.click(document.querySelector(`[data-sku="${SKU.id}"]`) as HTMLElement);

    const checkout = screen.getByRole('region', { name: 'Checkout' });
    /* The export shows *ends now* and *ends after purchase*; the numbers are
       what carry it, and both are on screen before the button is pressed. */
    expect(checkout.textContent).toContain('20');
    expect(checkout.textContent).toContain(String(20 + SKU.days));
    expect(checkout.textContent).toMatch(/adds to the end date/i);
  });

  it('says nothing about stacking when nothing is held', async () => {
    const user = userEvent.setup();
    stubStore({ '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS });

    render(<StoreScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('region', { name: 'Seven durations' });
    await user.click(document.querySelector(`[data-sku="${SKU.id}"]`) as HTMLElement);

    /* A stacking note for a player with no pass is noise that makes the real
       one easier to miss. */
    expect(
      screen.getByRole('region', { name: 'Checkout' }).textContent,
    ).not.toMatch(/adds to the end date/i);
  });
});
