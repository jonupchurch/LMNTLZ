/**
 * The seed never leaves the server (007 T017, SC-003, Constitution XII).
 *
 * ### Why this searches for the bytes and not for the word
 *
 * Checking that no response contains a field called `seed` is the test everybody
 * writes, and it catches only the mistake nobody makes. The leak that matters is
 * a *derived* value — a draw index, a raw roll, a debug field carrying the RNG
 * cursor — from which the rest of the battle can be predicted. So this asserts
 * the field names **and** then goes looking for the actual 64-bit value out of
 * the database row, in every representation somebody might have serialised it
 * in: hex, decimal, and the eight bytes as an array.
 *
 * The stakes are specific. An attacker who knows the seed and the draw index
 * knows every hit, crit and rider for the rest of the fight before committing to
 * a move — which is not an advantage, it is the whole game.
 *
 * ### It sweeps a whole battle, not one response
 *
 * A leak in the conclusion path, or in the packet that happens to carry a death,
 * would survive a test that only inspected the first response. This captures
 * **every** body from `POST /v1/battles` through the final `act`, plus the
 * resynchronisation route, and searches all of them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battles } from '../../src/db/schema/battles.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from './live.js';

let a: Arena;
let started: StartedBattle;
let bodies: readonly string[];
let seedHex: string;
let acts: number;
let resyncStatus: number;

beforeAll(async () => {
  a = await arena('seed');
  started = await start(a);

  const rows = await db()
    .select({ seed: battles.seed })
    .from(battles)
    .where(eq(battles.id, started.battleId))
    .limit(1);
  seedHex = rows[0]!.seed;

  const fought = await fightToTheEnd(a, started);
  expect(fought.conclusion, 'the battle never ended, so the sweep is incomplete').not.toBeNull();
  acts = fought.acts;

  const resync = await app.request(`/v1/battles/${started.battleId}`, {
    headers: a.attacker.headers(),
  });
  resyncStatus = resync.status;
  bodies = [...fought.bodies, await resync.text()];

  const first = fought.perAct.slice(0, 10);
  const last = fought.perAct.slice(-10);
  const mean = (xs: readonly number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);

  /**
   * **The number that decides whether no-stored-state stays correct** (T048).
   *
   * Every request replays the log from the beginning, so cost is quadratic in
   * the action count by construction. Reported rather than asserted: the
   * absolute figures depend on which database this ran against, but the *ratio*
   * between the first ten requests and the last ten is a property of the design.
   */
  console.info(
    `[replay-cost] ${acts} acts, ${fought.ms}ms total — ` +
      `first 10 ${mean(first)}ms, last 10 ${mean(last)}ms ` +
      `(${(mean(last) / Math.max(1, mean(first))).toFixed(1)}x)`,
  );
}, 600_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

/** The seed as a bigint, and every string a careless serialiser might produce. */
function representations(hex: string): { readonly label: string; readonly needle: string }[] {
  const value = BigInt(`0x${hex}`);
  const bytes = Array.from({ length: 8 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));

  return [
    { label: 'hex, as stored', needle: hex },
    { label: 'hex, upper case', needle: hex.toUpperCase() },
    { label: 'hex, 0x-prefixed', needle: `0x${hex}` },
    { label: 'decimal', needle: value.toString() },
    { label: 'bigint literal', needle: `${value}n` },
    { label: 'byte array', needle: JSON.stringify(bytes) },
    { label: 'base64', needle: Buffer.from(bytes).toString('base64') },
  ];
}

describe('the sweep is worth something', () => {
  /**
   * **Every response has to have SUCCEEDED**, and this is not a formality — it
   * is the assertion the whole file rests on.
   *
   * The `Seed` type throws on serialisation, so the natural leak (`{...battle}`
   * spread into `c.json`) produces a `500` with an error body. That body
   * contains no seed, so **a sweep that only searched for the bytes would pass
   * on a route that had been broken open.** Verified by mutation: spreading the
   * live battle into `GET /v1/battles/:id` left every search below green.
   *
   * The protection is real and it works — it just fails *closed*, and a test
   * that cannot tell "safe" from "crashed" is not testing it.
   */
  it('got a successful response from every route it swept', () => {
    expect(resyncStatus, 'the resynchronisation route did not return a board').toBe(200);
    // `fightToTheEnd` asserts 200 on each act as it goes; this is the one it cannot.
  });

  it('swept bodies that actually contain a board', () => {
    for (const [i, body] of bodies.entries()) {
      expect(body, `response ${i} carried no state`).toContain('"heroes"');
    }
  });
});

describe('the seed', () => {
  it('is a real value that a leak could carry', () => {
    // Otherwise every assertion below passes against an empty string.
    expect(seedHex).toMatch(/^[0-9a-f]{16}$/);
    expect(BigInt(`0x${seedHex}`)).toBeGreaterThan(0n);
  });

  it('appears in no response body, in any representation', () => {
    for (const { label, needle } of representations(seedHex)) {
      for (const [i, body] of bodies.entries()) {
        expect(body.includes(needle), `response ${i} carries the seed as ${label}`).toBe(false);
      }
    }
  });
});

describe('the draw ledger', () => {
  /**
   * **Draw indices are as dangerous as the seed and easier to leak.** They are
   * ordinary numbers on an ordinary object, with none of `Seed`'s protection —
   * `drawsConsumed` in particular reads like harmless telemetry, and it tells an
   * attacker exactly how many rolls a turn spent, which is how you learn whether
   * a rider was checked at all.
   */
  const forbidden = ['drawIndexBefore', 'drawsConsumed', 'drawIndex', 'seed'];

  it('never names a draw field in any response', () => {
    for (const field of forbidden) {
      for (const [i, body] of bodies.entries()) {
        expect(body.includes(field), `response ${i} names \`${field}\``).toBe(false);
      }
    }
  });

  it('swept a whole battle rather than one response', () => {
    /**
     * The assertions above are only worth what the sweep covered.
     *
     * **The real guard is that the battle reached a conclusion**, asserted in
     * `beforeAll` — a sweep that stopped early would fail there first. This is
     * the secondary check that it was a *battle* and not a single exchange.
     *
     * The bound was `> 10` and became unreachable when the pacing pass took the
     * median battle from 299 hero-turns to 49: this fixture's matchup now ends
     * in about ten acts, so the old bound was asserting that battles are slow.
     * Five still distinguishes a swept battle from one response, which is the
     * only thing this test was ever for.
     */
    expect(acts).toBeGreaterThan(5);
    /**
     * Two more than the acts: `fightToTheEnd` seeds `bodies` with the *start*
     * response before its loop, and this file appends the resync afterwards. So
     * the count is not merely large, it is the exact size of the battle that was
     * fought — a sweep that silently dropped a response would fail here.
     */
    expect(bodies).toHaveLength(acts + 2);
  });
});
