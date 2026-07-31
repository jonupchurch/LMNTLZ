/**
 * Shared store fixtures.
 *
 * The SKU list is the real catalog's shape and its real seven durations — a
 * fixture with three invented products would prove the page renders *a* list.
 * Prices are in **cents**, as the API serves them.
 */

import { vi } from 'vitest';

export const SKUS = [
  { id: 'pass-3d', price: 500, days: 3, grants: 'boost-pass' },
  { id: 'pass-7d', price: 1_000, days: 7, grants: 'boost-pass' },
  { id: 'pass-12d', price: 1_500, days: 12, grants: 'boost-pass' },
  { id: 'pass-28d', price: 2_000, days: 28, grants: 'boost-pass' },
  { id: 'pass-91d', price: 5_000, days: 91, grants: 'boost-pass' },
  { id: 'pass-182d', price: 9_000, days: 182, grants: 'boost-pass' },
  { id: 'pass-364d', price: 16_000, days: 364, grants: 'boost-pass' },
] as const;

export const DESCRIPTOR = 'LMNTLZ-TEST-DESC';

export const CATALOG = (over: Record<string, unknown> = {}) => ({
  skus: SKUS,
  currency: 'USD',
  maxPurchasableAdvantagePerYear: 42_000,
  bestShardsPerDollar: 3.2,
  autoRenews: false,
  available: true,
  statementDescriptor: DESCRIPTOR,
  ...over,
});

export const ENTITLEMENTS = (over: Record<string, unknown> = {}) => ({
  boostPass: { active: false, expiresAt: null, daysRemaining: 0, ...(over['boostPass'] ?? {}) },
  ceiling: { maxPurchasableAdvantagePerYear: 42_000 },
  autoRenews: false,
});

export const SHARDS = {
  today: { nextBoundaryAt: '2026-08-02T00:00:00.000Z' },
};

let calls: string[] = [];
export const requested = (): readonly string[] => calls;

/**
 * Stub `fetch` from a path → body map, with optional status overrides.
 * An unmapped path **rejects**, so a screen quietly calling something the
 * fixture does not know about is noticed rather than silently empty.
 */
export function stubStore(
  bodies: Record<string, unknown>,
  overrides: Record<string, { status: number; body: unknown }> = {},
): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);

      for (const [path, override] of Object.entries(overrides)) {
        if (url.includes(path)) {
          return Promise.resolve(
            new Response(JSON.stringify(override.body), {
              status: override.status,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
      }
      for (const [path, body] of Object.entries(bodies)) {
        if (url.includes(path)) {
          return Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
      }
      return Promise.reject(new Error(`the store requested an unmapped path: ${url}`));
    }),
  );
}
