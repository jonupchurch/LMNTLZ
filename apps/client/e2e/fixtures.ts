/**
 * The API, intercepted.
 *
 * Built from the real `@lmntlz/content` roster rather than from invented
 * champions, so the ids, names and reaches are the ones the app will actually
 * receive — a fixture with `{ id: 'hero1' }` proves the page renders *a* list.
 */

import type { Page } from '@playwright/test';
import { getAllHeroes } from '@lmntlz/content';
import { HP_PER_TOUGHNESS } from '@lmntlz/sim/rules';
import type { HeroState, Seat } from '@lmntlz/sim/rules';
import type {
  ConfiguredSeat,
  RosterResponse,
  SeatConfigWire,
} from '../src/features/squads/types.js';

export const HEROES = getAllHeroes();
export const IDS = HEROES.map((h) => h.id);

/**
 * A renderable opening board, so a mocked `POST /v1/battles` produces a screen
 * rather than an exception. The rows are the shared 1–6 axis: attacker 1–3,
 * defender 4–6, front nearest the enemy.
 */
const ROW_OF = {
  attacker: { front: 3, middle: 2, back: 1 },
  defender: { front: 4, middle: 5, back: 6 },
} as const;

const BOARD_SEATS = [
  { row: 'front', index: 0 },
  { row: 'front', index: 1 },
  { row: 'middle', index: 0 },
  { row: 'middle', index: 1 },
  { row: 'middle', index: 2 },
  { row: 'back', index: 0 },
] as const;

function boardSide(side: 'attacker' | 'defender', heroIds: readonly string[]): HeroState[] {
  return BOARD_SEATS.map((seat, i) => {
    const heroId = heroIds[i]!;
    const hp = HEROES.find((h) => h.id === heroId)!.stats.toughness * HP_PER_TOUGHNESS;
    return {
      heroId,
      instanceId: `${side === 'attacker' ? 'a' : 'd'}-${seat.row}-${seat.index}`,
      side,
      row: ROW_OF[side][seat.row],
      hp,
      maxHp: hp,
      accumulator: side === 'attacker' && i === 0 ? 99 : 0,
      cooldowns: {},
      statuses: [],
      statMods: {},
      reachMod: 0,
    };
  });
}

export function board() {
  return {
    heroes: [...boardSide('attacker', IDS.slice(0, 6)), ...boardSide('defender', IDS.slice(6, 12))],
    heroTurn: 1,
    turnOfInstance: 'a-front-0',
    engineVersion: 'e0.1.0-splitmix64',
    contentVersion: 'test',
  };
}

/**
 * A served defense configuration.
 *
 * **Real rule names, because the route validates them now.** A fixture carrying
 * `'whatever'` would render perfectly and be rejected by the only request that
 * matters.
 */
const CONFIG: SeatConfigWire = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: 'lowest-hp-percentage',
};

/** Offense seats carry no config — the player commands offense. */
const seats = (ids: readonly string[]): Seat[] => [
  { row: 'front', index: 0, heroId: ids[0]! },
  { row: 'front', index: 1, heroId: ids[1]! },
  { row: 'middle', index: 0, heroId: ids[2]! },
  { row: 'middle', index: 1, heroId: ids[3]! },
  { row: 'middle', index: 2, heroId: ids[4]! },
  { row: 'back', index: 0, heroId: ids[5]! },
];

/** Defense seats do, and the editor is unusable without them. */
const defenseSeats = (ids: readonly string[]): ConfiguredSeat[] =>
  seats(ids).map((seat) => ({ ...seat, config: CONFIG }));

/**
 * Both zones full, three overlapping attack squads — the ordinary end state.
 *
 * **Typed as the wire shape, and `e2e/` is in the typecheck now so that means
 * something.** It was an untyped literal, and this directory was in no
 * `tsconfig` at all — so a field added to `RosterResponse` and forgotten here
 * would reach the browser as `undefined` with every Playwright assertion still
 * green, because none of them look at the field nobody remembered to add.
 */
export function rosterPayload(over: { visibleSeats?: ConfiguredSeat[] } = {}): RosterResponse {
  const free = IDS.slice(12);
  const shared = free[0]!;

  return {
    heroes: HEROES,
    /**
     * Rune stages for all 27, varied so both an invested champion and an
     * untouched one are on screen at once. A uniform fixture would be satisfied
     * by a pip that never lights *and* by one that always does.
     */
    runes: HEROES.map((hero, i) => ({
      heroId: hero.id,
      stages: [i % 5, (i * 2) % 5, i % 3 === 0 ? 4 : 0],
    })),
    assignments: {
      defense: {
        visible: {
          seats: over.visibleSeats ?? defenseSeats(IDS.slice(0, 6)),
          holdStreak: 14,
          editedAt: null,
          canDefend: true,
        },
        hidden: {
          seats: defenseSeats(IDS.slice(6, 12)),
          holdStreak: 3,
          editedAt: null,
          canDefend: true,
        },
      },
      offense: [
        { slot: 0, name: 'Vanguard', seats: seats([shared, ...free.slice(1, 6)]), complete: true, valid: true },
        { slot: 1, name: 'Second Wind', seats: seats([shared, ...free.slice(6, 11)]), complete: true, valid: true },
        { slot: 2, name: 'Long Reach', seats: seats([shared, ...free.slice(11, 15), free[1]!]), complete: true, valid: true },
      ],
    },
    streaks: { attack: 7, hold: { visible: 14, hidden: 3 } },
    ambush: { chance: 14, perWin: 2, cap: 90, capAt: 45 },
    /**
     * **Served, so the client compiles no menu of its own.** Trimmed to the four
     * the specs actually pick from — the real list is fifteen, and a fixture that
     * mirrored it would drift the moment one is added without proving anything the
     * API's own test does not already prove.
     */
    rules: {
      target: ['lowest-current-hp', 'nearest', 'highest-might', 'furthest'],
      ally: ['lowest-hp-percentage', 'lowest-current-hp'],
      needsAllyRule: HEROES.filter((h) => h.powers.some((p) => p.friendly)).map((h) => h.id),
    },
    available: { forDefense: IDS, forOffense: free },
  };
}

/** The three-squad eviction — the case the confirm exists for. */
export const THREE_SQUAD_PREVIEW = {
  heroId: IDS[12],
  evicts: [
    { slot: 0, name: 'Vanguard', wasComplete: true, wouldBe: 5 },
    { slot: 1, name: 'Second Wind', wasComplete: true, wouldBe: 5 },
    { slot: 2, name: 'Long Reach', wasComplete: true, wouldBe: 5 },
  ],
  poolAfter: { heroes: 14, squads: 3, seatsNeeded: 18 },
  streakAtRisk: 14,
};

/**
 * Serve the squad screen's requests **and put a signed-in player behind them**.
 *
 * The session half is not decoration. The app restores from a stored renewal
 * token before it renders anything, so without one every spec below would land
 * on the marketing page and fail with `0 champions found` — an error message
 * about the roster, for a cause that has nothing to do with it.
 *
 * `addInitScript` runs before the page's own scripts, which is what makes the
 * token visible to the synchronous check `App` performs on its first render.
 */
/**
 * Put a signed-in player on the page.
 *
 * **Every spec that expects the squad screen needs this**, including the ones
 * that route their own mocks. The app restores from a stored renewal token
 * before it renders anything, so without one a spec lands on the marketing page
 * and fails with a message about the roster — a symptom with no connection to
 * its cause.
 *
 * `addInitScript` runs before the page's own scripts, which is what makes the
 * token visible to the synchronous check `App` performs on its first render.
 */
export async function signedIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('lmntlz.renewal', 'e2e-renewal');
  });

  /**
   * **"No battle in progress" is answered explicitly, on every spec.**
   *
   * The shell asks this before it renders anything for a signed-in player,
   * because a battle in progress outranks the squad builder. Left unmocked the
   * request escapes to a real API, and the spec that was about a squad seat
   * fails on a network error — or worse, passes slowly. `battle.spec.ts`
   * overrides this route with its own answer.
   */
  await page.route('**/v1/battles/open', (route) => route.fulfill({ status: 204, body: '' }));

  await page.route('**/v1/auth/renew', (route) =>
    route.fulfill({
      json: {
        session: { token: 'e2e-session', expiresAt: new Date(Date.now() + 9e5).toISOString() },
        renewal: { token: 'e2e-renewal-2' },
        account: { id: 'e2e', username: 'Reyna', createdAt: '2026-01-01T00:00:00.000Z' },
      },
    }),
  );
}

export async function mockApi(
  page: Page,
  options: {
    roster?: ReturnType<typeof rosterPayload>;
    preview?: unknown;
    save?: unknown;
  } = {},
): Promise<void> {
  await signedIn(page);

  await page.route('**/v1/roster', (route) =>
    route.fulfill({ json: options.roster ?? rosterPayload() }),
  );
  await page.route('**/v1/squads/defense/*/preview-move', (route) =>
    route.fulfill({ json: options.preview ?? THREE_SQUAD_PREVIEW }),
  );

  /**
   * The save, mocked here rather than per spec for the same reason as the two
   * above: an unmocked `PUT` escapes to a real API, and a spec about a seat then
   * fails on a network error somewhere else entirely.
   *
   * **Disjoint from the `preview-move` pattern**, so registration order does not
   * matter — a single `*` does not cross a `/`, which is what keeps this from
   * swallowing `…/visible/preview-move`. The method is still checked, because a
   * `GET` to this path is a different request.
   */
  await page.route('**/v1/squads/defense/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          json: options.save ?? {
            holdStreak: 0,
            streakReset: true,
            evictedSquadIds: [],
            warnings: [],
          },
        })
      : route.continue(),
  );

  /** The offense save. No warnings and no streak — both belong to defense. */
  await page.route('**/v1/squads/offense/*', (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    const slot = Number(route.request().url().split('/').pop());
    return route.fulfill({
      json: { slot, name: 'Vanguard', complete: true, valid: true },
    });
  });
}

/** Two candidates, one of them a bot, in a league that did not have to widen. */
export const CANDIDATES = {
  league: 'bronze',
  positionInLeague: 0.4,
  gearScore: 1500,
  widened: false,
  candidates: [
    {
      playerId: 'acc_1',
      username: 'Reyna',
      isBot: false,
      rating: 1180,
      visibleHoldStreak: 4,
      hiddenHoldStreak: 9,
    },
    {
      playerId: 'acc_2',
      username: 'The_Ninth_Door',
      isBot: true,
      rating: 1000,
      visibleHoldStreak: 0,
      hiddenHoldStreak: 0,
    },
  ],
  ambushChance: 14,
  consecutiveWins: 7,
};

export const STANDING = {
  league: 'bronze',
  gearScore: 1500,
  positionInLeague: 0.4,
  rating: 1000,
  ratedBattles: 3,
  band: 'provisional',
  ambushChance: 14,
  consecutiveWins: 7,
  starter: { active: false, reason: 'time' },
};

/**
 * A scout payload for the first candidate, built from the real roster.
 *
 * **`hidden` carries a streak and nothing else**, exactly as the server sends it —
 * a fixture with an empty `seats` array here would let a client render "0
 * champions" and pass, which is the leak the absent field prevents.
 */
export function scoutPayload() {
  return {
    playerId: 'acc_1',
    username: 'Reyna',
    league: 'bronze',
    visible: {
      holdStreak: 4,
      canDefend: true,
      seats: HEROES.slice(0, 6).map((hero, i) => ({
        row: i < 2 ? 'front' : i < 5 ? 'middle' : 'back',
        index: i < 2 ? i : i < 5 ? i - 2 : 0,
        hero: {
          id: hero.id,
          name: hero.name,
          primary: hero.primary,
          secondary: hero.secondary,
          bane: hero.bane,
          fault: hero.fault,
          role: hero.role,
          reach: hero.reach,
        },
        runes: [
          { element: hero.primary, stages: 0 },
          { element: hero.secondary, stages: 0 },
          { element: 'common', stages: 0 },
        ],
      })),
    },
    hidden: { holdStreak: 9 },
  };
}

/** Everything the attack screen asks for, on top of `mockApi`. */
export async function mockAttack(
  page: Page,
  options: { candidates?: unknown; standing?: unknown; start?: unknown } = {},
): Promise<void> {
  await page.route('**/v1/matchmaking/candidates', (route) =>
    route.fulfill({ json: options.candidates ?? CANDIDATES }),
  );
  await page.route('**/v1/me/standing', (route) =>
    route.fulfill({ json: options.standing ?? STANDING }),
  );
  await page.route('**/v1/players/*/scout', (route) => route.fulfill({ json: scoutPayload() }));
  await page.route('**/v1/battles', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          json:
            options.start ?? {
              battleId: 'b_e2e',
              zone: 'visible',
              ambushed: false,
              sequence: 0,
              /**
               * **A board the battle screen can actually render.** A stub of
               * `{ squads: [] }` satisfied the assertions about the *request* and
               * then threw inside `BattleScreen` — a real error, reported by Vite
               * as an unhandled rejection rather than as a failing test, which is
               * the worst place for one to appear.
               */
              packet: { events: [], state: board(), conclusion: null },
            },
        })
      : route.continue(),
  );
}
