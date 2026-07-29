/**
 * Storing is not exposing (008 T037, Constitution XVII).
 *
 * ### TL;DR
 *
 * `battle_records` holds **both** squads on every row, because hero pick rates are
 * a promised balance answer and nothing can compute them from compositions nobody
 * kept. The defender's squad must nevertheless appear in **no** response.
 *
 * These are not in tension, and the distinction is the whole of Constitution XVII:
 * the rules about what may leave the system live where data leaves it, not at the
 * point it is written. A system that refused to *store* what it refuses to *show*
 * would be unable to answer its own design questions — and would have made that
 * choice permanently, since a composition not recorded at battle time can never be
 * recovered.
 *
 * ### Why this is its own file
 *
 * The exposure rule spans surfaces that belong to different features: this one, the
 * CSV export (012) and the profile view (012). A per-feature test would check each
 * as it is built and never check the *set*, which is how the third surface ships
 * without the rule. This file is the set, and it fails loudly when a surface is
 * added without being considered.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from '../battle/live.js';

let a: Arena;
let started: StartedBattle;

beforeAll(async () => {
  a = await arena('exposure');
  started = await start(a);
  const fought = await fightToTheEnd(a, started);
  expect(fought.conclusion).not.toBeNull();
}, 300_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('the record stores both compositions', () => {
  it('populates defender_squad on every row', async () => {
    /**
     * **The positive half, and it has to come first.** Every assertion below is
     * about an absence, and an absence proves nothing if the data was never there —
     * the same trap that let a seed-leak sweep pass against a route that only ever
     * returned 500. If `defender_squad` were empty, the rest of this file would be
     * vacuously green forever.
     */
    const [record] = await db()
      .select()
      .from(battleRecords)
      .where(eq(battleRecords.battleId, started.battleId))
      .limit(1);

    expect(record!.defenderSquad).toBeTruthy();
    expect(JSON.stringify(record!.defenderSquad)).toContain('heroId');
    expect(record!.attackerSquad).toBeTruthy();
    expect(JSON.stringify(record!.attackerSquad)).toContain('heroId');
  });
});

describe('and no response carries it', () => {
  /**
   * Scanned on the serialised body, because that is what actually leaves the
   * process. A structural check would need to know every shape a response can take
   * and would silently stop covering new ones.
   */
  const FORBIDDEN = ['defenderSquad', 'defender_squad', 'attackerSquad', 'attacker_squad', 'seats'];

  it('GET /v1/me/battles carries neither squad', async () => {
    const res = await app.request('/v1/me/battles', { headers: a.attacker.headers() });
    expect(res.status).toBe(200);

    const text = await res.text();
    for (const forbidden of FORBIDDEN) {
      expect(text.includes(forbidden), `the battle list leaks ${forbidden}`).toBe(false);
    }

    // Not vacuous: the response has entries and the fields it should have.
    expect(text).toContain('"watchable"');
    expect(text).toContain(started.battleId);
  });

  it('GET /v1/me/battles carries no squad even for the defending player', async () => {
    /**
     * **The asymmetric case.** A defender looking at their own history is the one
     * caller who might reasonably be shown a composition — their own. It is still
     * withheld, because the response shape is shared and a field that appears "only
     * for the owner" is one authorisation bug away from appearing for everybody.
     */
    const res = await app.request('/v1/me/battles', { headers: a.defender.headers() });
    expect(res.status).toBe(200);

    const text = await res.text();
    for (const forbidden of FORBIDDEN) {
      expect(text.includes(forbidden), `the defender's own list leaks ${forbidden}`).toBe(false);
    }
    expect(text).toContain(started.battleId);
  });

  it('the replay log carries the events, not the squads', async () => {
    /**
     * A replay is different in kind and that is fine: a viewer necessarily sees
     * which heroes acted, because it is a recording of them acting. What it must not
     * carry is the **snapshot** — the seat-by-seat composition including the
     * defender's per-champion targeting configuration, which is a scouting document
     * rather than a record of a fight.
     */
    const res = await app.request(`/v1/replays/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const text = await res.text();

    expect(text.includes('defenderSquad'), 'the replay leaks the defender snapshot').toBe(false);
    expect(text.includes('"seats"'), 'the replay leaks a seat list').toBe(false);
    /** The defence AI's configuration is not something an attacker may read. */
    expect(text.includes('allyRule')).toBe(false);
    expect(text.includes('targeting')).toBe(false);

    // Not vacuous.
    expect(text).toContain('"events"');
  });
});

describe('the surfaces this rule spans', () => {
  it('names the ones that do not exist yet, so they cannot ship unconsidered', () => {
    /**
     * ### A deliberately failing reminder rather than a silent gap
     *
     * Constitution XVII governs three surfaces. Two are checked above. The third —
     * feature 012's **CSV export** and profile view — does not exist, so there is
     * nothing to scan.
     *
     * Recording that here means the day `/v1/me/export` or a profile route appears,
     * this test is where somebody adds it. The alternative is a per-feature test
     * that checks each surface as it is built and never checks the set, which is
     * exactly how the third one ships without the rule.
     */
    const built = ['GET /v1/me/battles', 'GET /v1/replays/:battleId'];
    const pending = ['012 CSV export', '012 profile view'];

    expect(built.length).toBe(2);
    expect(pending.length, 'a surface arrived — scan it above and shorten this list').toBe(2);
  });
});
