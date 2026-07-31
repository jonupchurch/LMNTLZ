/**
 * A defense zone stores at any size, and you cannot attack until both of yours
 * can defend (019).
 *
 * ### The problem this pair solves
 *
 * Moving one champion from the Visible zone to the Hidden one used to be
 * impossible to *start*: the source zone would be five, five is not a squad, and
 * the save was refused — so the shuffle had to be completed in a single sitting
 * with a replacement already chosen, or abandoned. A player reorganising across
 * two zones and three attack squads is the ordinary state of this screen, and
 * the screen would not let them do it.
 *
 * ### Why the two halves belong in one file
 *
 * They are one decision. Relaxing the save without gating the attack would let a
 * player keep an empty Hidden zone — taking Hidden-sized rewards while offering
 * nothing back, and permanently un-ambushable, which is the only mechanism that
 * puts anybody into a Hidden battle at all. Gating the attack without relaxing
 * the save would fix nothing. A test file per half would let either be reverted
 * with the other still green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battles } from '../../src/db/schema/battles.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];
/**
 * Battle ids to delete.
 *
 * **Constitution XVI makes a battle row permanent** and 008 computes every
 * balance number from that table, so `globalSetup` fails the whole run over one
 * row left behind. One test here starts a real battle — deliberately, because a
 * gate that refused everybody would pass both refusal tests — so it has to
 * clean up after itself.
 */
const battlesMade: string[] = [];
let restore: (() => void) | undefined;

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

interface Player {
  readonly id: string;
  readonly token: string;
}

async function signUp(tag: string): Promise<Player> {
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:${tag}-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  return { id: body.account.id, token: body.session.token };
}

const CONFIG = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
};

/** Up to six ids into 2 front / 3 middle / 1 back, in that order. */
const seatsFor = (ids: readonly string[], withConfig: boolean) =>
  [
    { row: 'front', index: 0 },
    { row: 'front', index: 1 },
    { row: 'middle', index: 0 },
    { row: 'middle', index: 1 },
    { row: 'middle', index: 2 },
    { row: 'back', index: 0 },
  ]
    .slice(0, ids.length)
    .map((seat, i) => ({ ...seat, heroId: ids[i]!, ...(withConfig ? { config: CONFIG } : {}) }));

const putDefense = (player: Player, zone: string, ids: readonly string[]) =>
  app.request(`/v1/squads/defense/${zone}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
    body: JSON.stringify({ seats: seatsFor(ids, true) }),
  });

const putOffense = (player: Player, slot: number, ids: readonly string[]) =>
  app.request(`/v1/squads/offense/${slot}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
    body: JSON.stringify({ name: 'Vanguard', seats: seatsFor(ids, false) }),
  });

const rosterOf = async (player: Player) => {
  const res = await app.request('/v1/roster', {
    headers: { authorization: `Bearer ${player.token}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    assignments: {
      defense: Record<string, { seats: unknown[]; canDefend: boolean; reason?: string }>;
    };
  };
};

beforeAll(() => {
  restore = overrideProvider('google', provider);
});

afterAll(async () => {
  restore?.();
  /* Battles before accounts: the row references both players, so deleting the
     accounts first is the ordering that either cascades silently or fails. */
  for (const id of battlesMade) await db().delete(battles).where(eq(battles.id, id));
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

describe('a defense zone can be stored half-built', () => {
  it('accepts three champions, and says the zone cannot defend', async () => {
    const player = await signUp('short');
    const res = await putDefense(player, 'visible', ROSTER.slice(0, 3));
    expect(res.status, await res.clone().text()).toBe(200);

    const zone = (await rosterOf(player)).assignments.defense['visible']!;
    expect(zone.seats).toHaveLength(3);
    /* The count moved here rather than disappearing. FR-011 already modelled
       this state; nothing could reach it before. */
    expect(zone.canDefend).toBe(false);
    expect(zone.reason).toMatch(/3 of 6/);
  });

  /**
   * **The move that could not be started.** Take a champion out of a full
   * Visible zone and put her in Hidden — two saves, and the first one used to be
   * the refusal.
   */
  it('lets a champion move between zones in two steps', async () => {
    const player = await signUp('shuffle');
    const six = ROSTER.slice(0, 6);

    expect((await putDefense(player, 'visible', six)).status).toBe(200);

    /* Step one: she leaves. The zone is five and that is now a savable state. */
    const short = await putDefense(player, 'visible', six.slice(0, 5));
    expect(short.status, await short.clone().text()).toBe(200);

    /* Step two: she arrives. Refused before this change, because the zone she
       came from could not be saved without her. */
    const moved = await putDefense(player, 'hidden', [six[5]!]);
    expect(moved.status, await moved.clone().text()).toBe(200);

    const after = (await rosterOf(player)).assignments.defense;
    expect(after['visible']!.seats).toHaveLength(5);
    expect(after['hidden']!.seats).toHaveLength(1);
  });

  it('accepts an empty zone, which is how one is cleared', async () => {
    const player = await signUp('empty');
    expect((await putDefense(player, 'visible', ROSTER.slice(0, 6))).status).toBe(200);

    const cleared = await putDefense(player, 'visible', []);
    expect(cleared.status, await cleared.clone().text()).toBe(200);
    expect((await rosterOf(player)).assignments.defense['visible']!.seats).toHaveLength(0);
  });

  /**
   * **Only the count was relaxed.** Each of these is a seat that cannot exist at
   * any size, and each is sent at a size the old code never even reached these
   * checks at — it returned `wrong-size` first.
   */
  it.each([
    [
      'the same champion twice',
      [
        { row: 'front', index: 0, heroId: ROSTER[0], config: CONFIG },
        { row: 'middle', index: 0, heroId: ROSTER[0], config: CONFIG },
      ],
    ],
    [
      'two champions in one seat',
      [
        { row: 'front', index: 0, heroId: ROSTER[0], config: CONFIG },
        { row: 'front', index: 0, heroId: ROSTER[1], config: CONFIG },
      ],
    ],
    ['a seat past the end of its row', [{ row: 'back', index: 1, heroId: ROSTER[0], config: CONFIG }]],
    ['a champion who does not exist', [{ row: 'front', index: 0, heroId: 'h99', config: CONFIG }]],
  ])('still refuses %s', async (_name, seats) => {
    const player = await signUp('bad');
    const res = await app.request('/v1/squads/defense/visible', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
      body: JSON.stringify({ seats }),
    });
    expect(res.status).toBe(422);
  });
});

describe('you cannot attack until both your zones can defend', () => {
  /** An opponent who can be attacked, so the refusal is never about them. */
  async function opponent(tag: string): Promise<Player> {
    const them = await signUp(tag);
    expect((await putDefense(them, 'visible', ROSTER.slice(0, 6))).status).toBe(200);
    expect((await putDefense(them, 'hidden', ROSTER.slice(6, 12))).status).toBe(200);
    return them;
  }

  const attack = (player: Player, opponentId: string) =>
    app.request('/v1/battles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
      body: JSON.stringify({ opponentId, attackSquadSlot: 0 }),
    });

  it('refuses an attacker with one zone short, and names the zone', async () => {
    const them = await opponent('gate-def');
    const me = await signUp('gate-atk');

    expect((await putOffense(me, 0, ROSTER.slice(0, 6))).status).toBe(200);
    expect((await putDefense(me, 'visible', ROSTER.slice(6, 12))).status).toBe(200);
    /* Hidden left short on purpose — one zone is enough to refuse. */
    expect((await putDefense(me, 'hidden', ROSTER.slice(12, 15))).status).toBe(200);

    const res = await attack(me, them.id);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('defense_incomplete');
    expect(body.error.message).toMatch(/hidden/);
    expect(body.error.message).toMatch(new RegExp(`3 of ${SQUAD_SIZE}`));
  });

  it('refuses an attacker with no defense at all', async () => {
    const them = await opponent('gate-def2');
    const me = await signUp('gate-atk2');
    expect((await putOffense(me, 0, ROSTER.slice(0, 6))).status).toBe(200);

    const res = await attack(me, them.id);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'defense_incomplete',
    );
  });

  /**
   * **The other side of the gate**, and the reason it is asserted: a rule that
   * refused everybody would satisfy both tests above and break the game.
   */
  it('allows an attacker whose two zones are both full', async () => {
    const them = await opponent('gate-def3');
    const me = await signUp('gate-atk3');

    expect((await putOffense(me, 0, ROSTER.slice(0, 6))).status).toBe(200);
    expect((await putDefense(me, 'visible', ROSTER.slice(6, 12))).status).toBe(200);
    expect((await putDefense(me, 'hidden', ROSTER.slice(12, 18))).status).toBe(200);

    const res = await attack(me, them.id);
    expect(res.status, await res.clone().text()).toBe(201);

    /**
     * **Recorded so `afterAll` can delete it.** Battles are permanent under
     * Constitution XVI and 008 computes every balance number from that table,
     * so `globalSetup` fails the whole run over one row left behind — which is
     * how this was caught rather than shipped as litter in a shared database.
     */
    battlesMade.push(((await res.json()) as { battleId: string }).battleId);
  });
});
