/**
 * **Every price on the store comes from `GET /v1/catalog`** (018 T021, T025,
 * T026 · FR-001).
 *
 * ### TL;DR
 *
 * The store shows seven durations and their prices. This checks it is showing
 * the ones the server sent rather than a copy typed into the page, and that
 * the claims it makes about the pass are the ones the rules actually say.
 *
 * ### Why the scan is on the source and not only on the render
 *
 * A render assertion proves the *fixture's* numbers are on screen. It cannot
 * tell that apart from a screen that hardcoded the same seven prices — which is
 * exactly what `LMNTLZ Store.dc.html` does in its own script, and exactly what
 * a faithful port would have carried over. So one case reads the source and
 * requires the prices to be absent from it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { StoreScreen } from '../../src/features/store/StoreScreen.js';
import { CATALOG, ENTITLEMENTS, SHARDS, SKUS, stubStore } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const openStore = async () => {
  stubStore({ '/catalog': CATALOG(), '/me/entitlements': ENTITLEMENTS(), '/me/shards': SHARDS });
  render(<StoreScreen onUnauthenticated={() => {}} />);
  return screen.findByRole('region', { name: 'Seven durations' });
};

describe('all seven durations render from the catalog', () => {
  it('draws one control per SKU', async () => {
    await openStore();
    const durations = screen.getByRole('region', { name: 'Seven durations' });
    expect(durations.querySelectorAll('[data-sku]')).toHaveLength(SKUS.length);
  });

  it.each(SKUS.map((s) => [s.id, s.days, s.price] as const))(
    '%s shows %i days at the served price',
    async (id, days, price) => {
      await openStore();
      const tile = document.querySelector(`[data-sku="${id}"]`)!;

      expect(tile.textContent).toContain(`${days} days`);
      /* Cents in, dollars out — never a rounded figure and never the raw cents. */
      expect(tile.textContent).toContain(`$${(price / 100).toFixed(2)}`);
    },
  );

  it('marks the cheapest per day, computed rather than flagged', async () => {
    await openStore();
    const best = [...SKUS].sort((a, b) => a.price / a.days - b.price / b.days)[0]!;
    const tile = document.querySelector(`[data-sku="${best.id}"]`)!;

    expect(tile.textContent).toMatch(/best per day/i);
  });
});

describe('no price is written into the client', () => {
  /**
   * The half a render assertion cannot make. The store export prints its own
   * price table in its script and it is correct today; a port that carried it
   * over would pass every case above and be wrong the first time a price moved.
   */
  it.each(SKUS.map((s) => [s.id, s.price] as const))(
    "%s's price does not appear in StoreScreen.tsx",
    (id, price) => {
      const source = readFileSync(
        join(import.meta.dirname, '..', '..', 'src', 'features', 'store', 'StoreScreen.tsx'),
        'utf8',
      );

      expect(source, `${id}'s price is hardcoded in the store screen`).not.toContain(
        String(price),
      );
    },
  );

  it('and the scan can see a planted one', () => {
    /* Without this, a path typo makes every case above pass on an empty string. */
    expect('const price = 16000;').toContain('16000');
  });
});

describe("the pass's own claims come from the served rules", () => {
  it('states the two separate ten-a-day allowances', async () => {
    await openStore();
    const held = screen.getByRole('region', { name: 'What you hold' });

    /**
     * `06-progression.md`: *double shards from your first ten attack victories
     * and first ten defense holds each day* — **two** allowances, so attacking
     * does not consume the defending one. The store saying "ten a day" would be
     * a different and wrong product.
     */
    expect(held.textContent).toMatch(/first ten attack victories/i);
    expect(held.textContent).toMatch(/first ten defense holds/i);
  });

  it('renders the reset from the served instant, never the string 00:00 UTC', async () => {
    await openStore();
    const held = screen.getByRole('region', { name: 'What you hold' });

    /**
     * T026. `config.ts` serves an **absolute instant** precisely so a
     * per-player boundary would not change the API shape — and so no screen
     * would have to be found and edited if it ever did.
     */
    expect(held.textContent).not.toContain('00:00 UTC');
    expect(held.textContent).toContain(
      new Date(SHARDS.today.nextBoundaryAt).toLocaleString(),
    );
  });

  it('says nothing auto-renews', async () => {
    await openStore();
    expect(document.body.textContent).toMatch(/nothing renews automatically/i);
  });

  it('states the ceiling, because "speed never ceiling" needs a number', async () => {
    await openStore();
    const held = screen.getByRole('region', { name: 'What you hold' });

    expect(held.textContent).toContain(
      CATALOG().maxPurchasableAdvantagePerYear.toLocaleString(),
    );
  });
});
