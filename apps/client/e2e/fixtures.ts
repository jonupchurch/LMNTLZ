/**
 * The API, intercepted.
 *
 * Built from the real `@lmntlz/content` roster rather than from invented
 * champions, so the ids, names and reaches are the ones the app will actually
 * receive — a fixture with `{ id: 'hero1' }` proves the page renders *a* list.
 */

import type { Page } from '@playwright/test';
import { getAllHeroes } from '@lmntlz/content';

export const HEROES = getAllHeroes();
export const IDS = HEROES.map((h) => h.id);

const seats = (ids: readonly string[]) => [
  { row: 'front', index: 0, heroId: ids[0] },
  { row: 'front', index: 1, heroId: ids[1] },
  { row: 'middle', index: 0, heroId: ids[2] },
  { row: 'middle', index: 1, heroId: ids[3] },
  { row: 'middle', index: 2, heroId: ids[4] },
  { row: 'back', index: 0, heroId: ids[5] },
];

/** Both zones full, three overlapping attack squads — the ordinary end state. */
export function rosterPayload(over: { visibleSeats?: unknown[] } = {}) {
  const free = IDS.slice(12);
  const shared = free[0]!;

  return {
    heroes: HEROES,
    assignments: {
      defense: {
        visible: {
          seats: over.visibleSeats ?? seats(IDS.slice(0, 6)),
          holdStreak: 14,
          editedAt: null,
          canDefend: true,
        },
        hidden: { seats: seats(IDS.slice(6, 12)), holdStreak: 3, editedAt: null, canDefend: true },
      },
      offense: [
        { slot: 0, name: 'Vanguard', seats: seats([shared, ...free.slice(1, 6)]), complete: true, valid: true },
        { slot: 1, name: 'Second Wind', seats: seats([shared, ...free.slice(6, 11)]), complete: true, valid: true },
        { slot: 2, name: 'Long Reach', seats: seats([shared, ...free.slice(11, 15), free[1]!]), complete: true, valid: true },
      ],
    },
    streaks: { attack: 7, hold: { visible: 14, hidden: 3 } },
    ambush: { chance: 14, perWin: 2, cap: 90, capAt: 45 },
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
  options: { roster?: ReturnType<typeof rosterPayload>; preview?: unknown } = {},
): Promise<void> {
  await signedIn(page);

  await page.route('**/v1/roster', (route) =>
    route.fulfill({ json: options.roster ?? rosterPayload() }),
  );
  await page.route('**/v1/squads/defense/*/preview-move', (route) =>
    route.fulfill({ json: options.preview ?? THREE_SQUAD_PREVIEW }),
  );
}
