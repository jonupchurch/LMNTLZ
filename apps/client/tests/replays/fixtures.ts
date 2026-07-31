/**
 * Shared replay fixtures.
 *
 * The event shape is the real one — `apps/api/src/battle/idempotency.ts`'s
 * `TurnEvent`, seat-form instance ids and all — because the two claims US3
 * makes are both about *reading what the server wrote*: playback is verbatim,
 * and watchability is the server's word. A fixture with invented ids would
 * prove neither.
 */

import { vi } from 'vitest';
import type { BattleListEntry, TurnEvent } from '../../src/features/replays/types.js';

export const NOW = new Date('2026-07-31T12:00:00.000Z');

/** Hours before `NOW`, as an ISO string. */
export const hoursAgo = (h: number): string =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

export const entry = (over: Partial<BattleListEntry> = {}): BattleListEntry => ({
  battleId: 'btl-1',
  concludedAt: hoursAgo(3),
  role: 'attacker',
  opponent: { id: 'acc-2', username: 'Reyna_Current', isBot: false },
  zone: 'visible',
  outcome: 'win',
  turnCount: 96,
  watchable: true,
  ...over,
});

export const event = (over: Partial<TurnEvent> = {}): TurnEvent => ({
  actorInstanceId: 'a-front-0',
  powerId: 'sunder',
  targetInstanceId: 'd-front-1',
  source: 'player',
  outcome: {
    hit: true,
    crit: false,
    damage: 214,
    healing: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
    ...(over.outcome ?? {}),
  },
  ...over,
});

/**
 * A short battle with every kind of turn in it: a hit, a miss, a crit, a heal,
 * a rider, a pass and a death. Seven events, which is also what makes the
 * cursor assertions readable.
 */
export const LOG = {
  battleId: 'btl-1',
  engineVersion: '1.4.0',
  contentVersion: '2026-07-12',
  events: [
    event({ actorInstanceId: 'a-front-0', targetInstanceId: 'd-front-1' }),
    event({
      actorInstanceId: 'd-front-1',
      source: 'engine',
      targetInstanceId: 'a-front-0',
      outcome: {
        hit: false,
        crit: false,
        damage: 0,
        healing: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
      },
    }),
    event({
      actorInstanceId: 'a-middle-2',
      targetInstanceId: 'd-front-1',
      outcome: {
        hit: true,
        crit: true,
        damage: 480,
        healing: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: ['d-front-1'],
      },
    }),
    event({
      actorInstanceId: 'a-back-0',
      powerId: 'mend',
      targetInstanceId: 'a-front-0',
      outcome: {
        hit: true,
        crit: false,
        damage: 0,
        healing: 130,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
      },
    }),
    event({
      actorInstanceId: 'd-middle-0',
      source: 'engine',
      targetInstanceId: 'a-front-0',
      outcome: {
        hit: true,
        crit: false,
        damage: 90,
        healing: 0,
        ridersLanded: ['burn'],
        ridersResisted: ['slow'],
        deaths: [],
      },
    }),
    /** A pass — nothing it owned had a legal target. */
    event({
      actorInstanceId: 'a-back-0',
      powerId: null,
      targetInstanceId: null,
      outcome: {
        hit: false,
        crit: false,
        damage: 0,
        healing: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
      },
    }),
    event({
      actorInstanceId: 'a-front-1',
      targetInstanceId: 'd-middle-0',
      outcome: {
        hit: true,
        crit: false,
        damage: 300,
        healing: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: ['d-middle-0'],
      },
    }),
  ] as readonly TurnEvent[],
  conclusion: { winner: 'attacker', reason: 'wipe' },
};

let calls: string[] = [];
export const requested = (): readonly string[] => calls;

/**
 * Stub `fetch` from a path → body map, with optional status overrides.
 * An unmapped path **rejects**, so a screen quietly requesting something the
 * fixture does not know about is noticed rather than silently empty.
 */
export function stubReplays(
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
      return Promise.reject(new Error(`the replay screens requested an unmapped path: ${url}`));
    }),
  );
}
