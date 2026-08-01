/**
 * Two real players, two real squads, one real battle — over HTTP.
 *
 * `goldenPath.test.ts` drives the engine functions directly, which is the right
 * level for "does the packet boundary hold". **This is the level where the
 * properties US1 actually promises live**: nothing is stored mid-battle, the
 * defender's snapshot is frozen, and the seed never appears in a response. None
 * of those is a statement about the engine; every one is a statement about the
 * route in front of it.
 *
 * The accounts and squads are created through the API rather than inserted,
 * because a fixture that wrote rows directly would be testing this file's idea
 * of a squad instead of feature 006's.
 */

import { expect } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { legalTargets } from '@lmntlz/sim/rules';
import { usablePowers } from '../../src/battle/choicePoint.js';
import app from '../../src/index.js';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battles } from '../../src/db/schema/battles.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { memoryStorage, setReplayStorage } from '../../src/replays/storage.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

export const ROSTER = getAllHeroes().map((h) => h.id);

/**
 * A provider that trusts a `sub:` prefix.
 *
 * The same stand-in every other route suite uses. Identity is feature 005's
 * problem and it has its own tests; a battle test that also verified JWTs would
 * fail for two unrelated reasons and be read as flaky.
 */
const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

export interface SeatSpec {
  readonly row: 'front' | 'middle' | 'back';
  readonly index: number;
  readonly heroId: string;
  readonly config?: { targeting: [string, string]; ranking: number[]; allyRule: string | null };
}

export const defenseConfig = (over: Partial<NonNullable<SeatSpec['config']>> = {}) => ({
  targeting: ['lowest-current-hp', 'nearest'] as [string, string],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
  ...over,
});

/** Six heroes in the fixed 2 front · 3 middle · 1 back formation. */
export function formation(heroIds: readonly string[], withConfig: boolean): SeatSpec[] {
  const seats: Omit<SeatSpec, 'heroId' | 'config'>[] = [
    { row: 'front', index: 0 },
    { row: 'front', index: 1 },
    { row: 'middle', index: 0 },
    { row: 'middle', index: 1 },
    { row: 'middle', index: 2 },
    { row: 'back', index: 0 },
  ];

  return seats.map((seat, i) => ({
    ...seat,
    heroId: heroIds[i]!,
    ...(withConfig ? { config: defenseConfig() } : {}),
  }));
}

export interface Player {
  readonly accountId: string;
  readonly session: string;
  readonly headers: () => Record<string, string>;
}

export interface Arena {
  readonly attacker: Player;
  readonly defender: Player;
  /** Everything created, for the teardown the run-level audit checks. */
  readonly createdAccounts: readonly string[];
  readonly createdBattles: string[];
  /**
   * The in-memory replay store this arena installed.
   *
   * Exposed so feature 008's tests can read what was written without reaching
   * for the live store. `blobs` is keyed by URL, which is also what
   * `battle_records.replay_blob_url` holds — so a test can join the two and
   * catch a bug that mangles the URL between them.
   */
  readonly storage: ReturnType<typeof memoryStorage>;
  close(): Promise<void>;
}

async function signUp(subject: string): Promise<Player> {
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:${subject}` }),
  });

  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  expect(res.status, JSON.stringify(body)).toBe(200);

  return {
    accountId: body.account.id,
    session: body.session.token,
    headers: () => ({
      'content-type': 'application/json',
      authorization: `Bearer ${body.session.token}`,
    }),
  };
}

/**
 * An attacker with an offense squad and a defender with both zones filled.
 *
 * **Both defense zones, not just Visible.** The zone is decided server-side by
 * an ambush roll, and a fixture that only filled Visible would fail once every
 * fifty runs on a streak nobody set — the exact shape of a test that gets
 * marked flaky and retried instead of read.
 */
export async function arena(tag: string): Promise<Arena> {
  const restore = overrideProvider('google', provider);

  /**
   * **No battle test writes to the real blob store** (008).
   *
   * Concluding a battle now writes a replay, so without this every run of the
   * battle suite would upload real blobs to the production store — paid for,
   * counted, and cleaned up by a job that is looking for battles older than
   * seven days rather than for test litter.
   *
   * `memoryStorage()` is a real implementation of `ReplayStorage`, not a mock, so
   * `record.ts` runs the same code path it does in production. The vendor half is
   * covered separately and for real by `tests/replays/store.test.ts`, which is
   * the only file that talks to the live store.
   */
  const storage = memoryStorage();
  const restoreStorage = setReplayStorage(storage);
  const run = `${tag}-${process.pid}${Math.floor(Math.random() * 1e6)}`;

  const attacker = await signUp(`atk-${run}`);
  const defender = await signUp(`def-${run}`);

  const attackHeroes = ROSTER.slice(0, 6);
  const defenseHeroes = ROSTER.slice(6, 12);
  const hiddenHeroes = ROSTER.slice(12, 18);

  const put = async (player: Player, path: string, seats: SeatSpec[]) => {
    const res = await app.request(path, {
      method: 'PUT',
      headers: player.headers(),
      body: JSON.stringify({ seats }),
    });
    expect(res.status, `${path}: ${await res.clone().text()}`).toBe(200);
  };

  await put(defender, '/v1/squads/defense/visible', formation(defenseHeroes, true));
  await put(defender, '/v1/squads/defense/hidden', formation(hiddenHeroes, true));
  await put(attacker, '/v1/squads/offense/0', formation(attackHeroes, false));

  /**
   * **The attacker defends too, because you cannot attack until you can.**
   *
   * A defense zone stores at any size so a player can reorganise, and the price
   * is that `createBattle` refuses an attacker whose own zones are short. This
   * fixture used to give the attacker an offense squad and nothing else — a
   * player who takes Hidden-sized rewards while offering nothing back and can
   * never be ambushed, which is not a state the game has.
   *
   * **After the offense save, and on champions it does not hold.** Seating a
   * champion on defense evicts her from every attack squad, so doing this first
   * — or with `attackHeroes` — would invalidate the squad this arena exists to
   * fight with, and every battle test would fail on `attack-squad-invalid`.
   */
  await put(attacker, '/v1/squads/defense/visible', formation(defenseHeroes, true));
  await put(attacker, '/v1/squads/defense/hidden', formation(hiddenHeroes, true));

  const createdBattles: string[] = [];

  return {
    attacker,
    defender,
    createdAccounts: [attacker.accountId, defender.accountId],
    createdBattles,
    storage,
    async close() {
      restore();
      restoreStorage();
      /**
       * **Battles are deleted explicitly, not left to the account cascade.**
       * `battles.attacker_id` is `set null` on purpose — a real player's history
       * outlives their account — so deleting the accounts would leave the rows
       * behind, unowned and permanent, in the table Constitution XVI makes
       * un-cleanable.
       *
       * **`battle_records` first, and it needs its own delete for a stronger
       * reason than `battles` does.** Feature 008 gave the record *no foreign key
       * to `battles`* — a record outlives the battle row it came from, so pruning
       * the action log can never take history with it. The cost of that is here:
       * nothing cascades, so a test that concludes a battle and only cleans up
       * `battles` leaves a permanent row in the analytics table. Every aggregate
       * feature 008 computes would then be measuring the test suite.
       */
      for (const id of createdBattles) {
        await db().delete(battleRecords).where(eq(battleRecords.battleId, id));
        await db().delete(battles).where(eq(battles.id, id));
      }
      for (const id of [attacker.accountId, defender.accountId]) {
        await db().delete(accounts).where(eq(accounts.id, id));
      }
    },
  };
}

export interface StartedBattle {
  readonly battleId: string;
  readonly zone: string;
  readonly sequence: number;
  readonly packet: { events: unknown[]; state: BattleShape; conclusion: unknown };
}

/** Just enough of `BattleState` for a test to steer. The engine owns the rest. */
export interface BattleShape {
  readonly turnOfInstance: string | null;
  readonly heroTurn: number;
  readonly heroes: readonly {
    readonly instanceId: string;
    readonly heroId: string;
    readonly hp: number;
    readonly row: number;
  }[];
}

/** What a settled battle reports back — `specs/GAPS.md` §2c. */
export interface SettlementShape {
  readonly winner: 'attacker' | 'defender';
  readonly won: boolean;
  readonly shards: number;
  readonly shardsEarned: number;
  readonly cappedAt: number | null;
  readonly ratingDelta: number;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly attackStreak: number;
  readonly holdStreak: number;
  readonly turnCount: number;
  readonly zone: string;
}

export interface Acted {
  readonly status: number;
  readonly body: {
    readonly sequence: number;
    readonly packet: { events: unknown[]; state: BattleShape; conclusion: unknown };
    readonly nextSequence: number;
    /** Present only on the response that concluded the battle. */
    readonly settlement?: SettlementShape;
  };
  readonly text: string;
}

/**
 * Take one turn with the first legal move, exactly as the client would compute
 * it — from `@lmntlz/sim/rules`, against the state the server just returned.
 *
 * **Deliberately not a good player.** What is under test is whether the route
 * accepts a move derived the way the client derives it; a clever chooser would
 * shorten the battle in a way that flatters every count taken from it.
 */
export async function act(
  a: Arena,
  battleId: string,
  sequence: number,
  state: BattleShape,
): Promise<Acted> {
  const up = state.turnOfInstance;
  if (up === null) throw new Error('asked to act with nobody up');

  const usable = usablePowers(state as never, up);
  const power = usable[0];
  if (!power) throw new Error(`${up} was presented as a choice with nothing usable`);

  const targeting = legalTargets(state as never, up, power.id);
  const target = targeting.compelled ?? targeting.candidates[0]!;

  const res = await app.request(`/v1/battles/${battleId}/act`, {
    method: 'POST',
    headers: a.attacker.headers(),
    body: JSON.stringify({ sequence, actorInstanceId: up, powerId: power.id, targetInstanceId: target }),
  });

  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Acted['body'], text };
}

/** Every response body a whole battle produced, in order. For the seed sweep. */
export interface Fought {
  readonly acts: number;
  readonly bodies: readonly string[];
  readonly conclusion: unknown;
  readonly ms: number;
  /**
   * Per-request wall time, in order.
   *
   * **The shape of this array is the whole no-stored-state question.** Each
   * request replays the log from the beginning, so the cost per request grows
   * with the log — a mean hides that completely, and the mean is what anybody
   * would otherwise report.
   */
  readonly perAct: readonly number[];
  /** What the concluding response reported it paid. `undefined` if none did. */
  readonly settlement?: SettlementShape | undefined;
}

export async function fightToTheEnd(a: Arena, started: StartedBattle, cap = 250): Promise<Fought> {
  const bodies: string[] = [JSON.stringify(started)];
  const perAct: number[] = [];
  const began = Date.now();

  let state = started.packet.state;
  let conclusion = started.packet.conclusion;
  let sequence = started.sequence;
  let acts = 0;
  let settlement: SettlementShape | undefined;

  while (!conclusion && acts < cap) {
    const at = Date.now();
    const result = await act(a, started.battleId, sequence, state);
    perAct.push(Date.now() - at);

    expect(result.status, result.text).toBe(200);

    bodies.push(result.text);
    state = result.body.packet.state;
    conclusion = result.body.packet.conclusion;
    sequence = result.body.nextSequence;
    /* Only the response that concludes carries one, so this holds the last —
       which is that response, by construction of the loop. */
    settlement = result.body.settlement ?? settlement;
    acts += 1;
  }

  return { acts, bodies, conclusion, ms: Date.now() - began, perAct, settlement };
}

/**
 * Remove the attacker's open battle, if any, so a fresh one can be started.
 *
 * ### Why every multi-battle suite needs this now
 *
 * **One battle open at a time** is a real rule and a real exploit fix — several
 * open battles lets a player start against many opponents and abandon the ones
 * going badly, which turns the attack streak into a measure of which fights
 * somebody chose to finish. So `POST /v1/battles` answers `409` while one is
 * open, and a test that wants a second battle has to say so.
 *
 * **Deleting rather than concluding**, deliberately. Concluding would settle it,
 * moving both streaks — so a suite asserting on streak movement would be reading
 * numbers its own setup had nudged. A delete leaves nothing behind, which is what
 * a test's own bookkeeping should do.
 */
export async function clearOpenBattle(a: Arena): Promise<void> {
  await db()
    .delete(battles)
    .where(and(eq(battles.attackerId, a.attacker.accountId), isNull(battles.concludedAt)));
}

export async function start(a: Arena, opponentId?: string): Promise<StartedBattle> {
  /**
   * **Cleared first, so a suite's battles do not block each other.** Every
   * caller here wants "a battle to work with", never "a battle *in addition to*
   * the one I left open" — and the one test that genuinely asserts the `409` is
   * `ending.test.ts`, which posts to the route directly rather than through this.
   */
  await clearOpenBattle(a);
  return startWithoutClearing(a, opponentId);
}

async function startWithoutClearing(a: Arena, opponentId?: string): Promise<StartedBattle> {
  const res = await app.request('/v1/battles', {
    method: 'POST',
    headers: a.attacker.headers(),
    body: JSON.stringify({ opponentId: opponentId ?? a.defender.accountId, attackSquadSlot: 0 }),
  });

  const body = (await res.json()) as StartedBattle;
  expect(res.status, JSON.stringify(body)).toBe(201);

  a.createdBattles.push(body.battleId);
  return body;
}
