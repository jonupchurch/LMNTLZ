/**
 * Shared Forge fixtures.
 *
 * **The payloads are built from the same sources the server builds them from** —
 * `getAllHeroes()` for the roster, and the stage tables quoted once here rather
 * than in each test. A fixture that invents its own roster shape tests a server
 * nobody has, and its failures point at correct code.
 *
 * Not a `.test.ts`, so the `forge` project's `include` glob does not collect it:
 * a helper that reported "0 tests" would be one more thing that looks like a
 * pass.
 */

import { vi } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';

/** The real stage tables, as `GET /v1/me/shards` serves them. */
export const STAGE_COSTS = [150, 150, 150, 200] as const;
export const STAGE_BOOSTS = [20, 10, 5, 0] as const;
export const FULL_RUNE_COST = 650;
/** What melting a champion's runes returns, as `config.refundRate` serves it. */
export const REFUND_RATE = 0.8;

export const SHARDS = {
  balance: 4260,
  config: {
    stageCosts: STAGE_COSTS,
    stageBoosts: STAGE_BOOSTS,
    fullRuneCost: FULL_RUNE_COST,
    refundRate: REFUND_RATE,
  },
};

/**
 * A refund quote, as `GET /v1/heroes/:heroId/runes` serves it.
 *
 * **`refund` is a parameter with no default computed from `invested`.** A
 * fixture that derived it would make every assertion below pass against a client
 * that derived it too — which is precisely the bug the served quote exists to
 * prevent. Tests hand in a number and check that number is what appears.
 */
export const QUOTE = (
  heroId: string,
  slots: readonly { slot: string; stage: number; value: number; utility?: string | null }[],
  refund: number,
  rate: number = REFUND_RATE,
) => ({
  heroId,
  slots: slots.map((s) => ({
    slot: s.slot,
    stage: s.stage,
    value: s.value,
    allocations: {},
    utility: s.utility ?? null,
  })),
  invested: slots.reduce((sum, s) => sum + s.value, 0),
  refund,
  rate,
});

/** Deliberately below one stage, for the refusal tests. */
export const BROKE = {
  ...SHARDS,
  balance: 10,
};

const SLOTS = ['primary', 'secondary', 'common'] as const;

/** All 27 heroes with nothing placed — what a new account sees. */
export const BARE_RUNES = () => ({
  heroes: getAllHeroes().map((hero) => ({
    heroId: hero.id,
    slots: SLOTS.map((slot) => ({
      slot,
      element: slot === 'primary' ? hero.primary : slot === 'secondary' ? hero.secondary : null,
      stage: 0,
      allocations: {},
      utility: null,
      spent: 0,
    })),
  })),
});

/**
 * One hero's primary slot at a given stage, everything else bare.
 *
 * `allocations` is passed in rather than derived so a test can construct the
 * *specific* state it is about — a stat already at the cap, for instance.
 */
export const RUNES_WITH = (
  heroId: string,
  stage: number,
  allocations: Record<string, number>,
  utility: string | null = null,
) => {
  const base = BARE_RUNES();
  return {
    heroes: base.heroes.map((h) =>
      h.heroId !== heroId
        ? h
        : {
            ...h,
            slots: h.slots.map((s) =>
              s.slot !== 'primary'
                ? s
                : {
                    ...s,
                    stage,
                    allocations,
                    utility,
                    spent: STAGE_COSTS.slice(0, stage).reduce((a, b) => a + b, 0),
                  },
            ),
          },
    ),
  };
};

let calls: string[] = [];
let sent: Record<string, unknown>[] = [];

/** Every path the screen requested, in order. */
export const requested = (): readonly string[] => calls;

/**
 * Every JSON body the screen **sent**, in order (021).
 *
 * `requested()` proves a call happened; this proves what was in it. Stage 4's
 * whole failure mode was a request that looked completely normal and carried no
 * effect, so asserting the path alone would pass against the defect.
 */
export const sentBodies = (): readonly Record<string, unknown>[] => sent;

/**
 * Stub `fetch` with a path → body map. An unmapped path is a **failure**, not an
 * empty response: a screen quietly calling something the fixture does not know
 * about is the thing these suites exist to notice.
 */
export function stubForge(
  bodies: Record<string, unknown>,
  overrides: Record<string, { status: number; body: unknown }> = {},
): void {
  calls = [];
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);

      if (typeof init?.body === 'string') {
        try {
          sent.push(JSON.parse(init.body) as Record<string, unknown>);
        } catch {
          /* A non-JSON body is not something this screen sends; ignore it here
             rather than failing a fixture on a shape no assertion reads. */
        }
      }

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

      return Promise.reject(new Error(`the Forge requested an unmapped path: ${url}`));
    }),
  );
}
