/**
 * A battle in a real browser (007 T051).
 *
 * ### What only this level can check
 *
 * The component suite renders `BattleScreen` directly, so it cannot tell whether
 * the screen is **reachable**. That is the gap feature 006 hit — components
 * complete, unit-tested, and unreachable from the running app — and it is
 * invisible in a component test by construction.
 *
 * The route under test is **resume**, not attack. There is no attack button
 * anywhere yet: choosing an opponent needs the candidate set, which is feature
 * 009. `GET /v1/battles/open` needs no opponent and no id, and the
 * one-at-a-time rule makes its answer one battle or none — so a player who
 * reloads lands back in their fight, which is a requirement in its own right.
 *
 * ### The connection kill is the reason this file exists
 *
 * A retry that double-advances a battle produces a **plausible** result. The
 * response looks right, the board looks right, and the only evidence is a second
 * row in the action log. `idempotency.test.ts` counts those rows against a real
 * database; what it cannot do is drop a socket in a real browser and watch what
 * the client does next. That is here.
 */

import { expect, test, type Page } from '@playwright/test';
import { signedIn } from './fixtures.js';

const HERO_IDS = Array.from({ length: 27 }, (_, i) => `h${String(i + 1).padStart(2, '0')}`);

const SEATS = [
  ['front', 0],
  ['front', 1],
  ['middle', 0],
  ['middle', 1],
  ['middle', 2],
  ['back', 0],
] as const;

const ROW_OF = {
  attacker: { front: 3, middle: 2, back: 1 },
  defender: { front: 4, middle: 5, back: 6 },
} as const;

interface Hero {
  heroId: string;
  instanceId: string;
  side: 'attacker' | 'defender';
  row: number;
  hp: number;
  maxHp: number;
  accumulator: number;
  cooldowns: Record<string, number>;
  statuses: unknown[];
  statMods: Record<string, number>;
  reachMod: number;
}

function squad(side: 'attacker' | 'defender', ids: readonly string[]): Hero[] {
  return SEATS.map(([row, index], i) => ({
    heroId: ids[i]!,
    instanceId: `${side === 'attacker' ? 'a' : 'd'}-${row}-${index}`,
    side,
    row: ROW_OF[side][row],
    hp: 1250,
    maxHp: 1250,
    // The front-line attacker is up, so the screen has a choice to present.
    accumulator: side === 'attacker' && i === 0 ? 99 : 0,
    cooldowns: {},
    statuses: [],
    statMods: {},
    reachMod: 0,
  }));
}

const state = (turnOfInstance: string | null, defenderHp = 1250) => ({
  heroes: [
    ...squad('attacker', HERO_IDS.slice(0, 6)),
    ...squad('defender', HERO_IDS.slice(6, 12)).map((h) =>
      h.instanceId === 'd-front-0' ? { ...h, hp: defenderHp } : h,
    ),
  ],
  heroTurn: 1,
  turnOfInstance,
  engineVersion: 'e2e',
  contentVersion: 'e2e',
});

const BATTLE_ID = 'e2e-battle';

/** Put the player back into a battle in progress, as a reload would. */
async function inBattle(page: Page): Promise<void> {
  await signedIn(page);

  await page.route('**/v1/battles/open', (route) =>
    route.fulfill({ json: { battleId: BATTLE_ID, startedAt: '2026-07-29T00:00:00.000Z', expiresAt: '2026-07-30T00:00:00.000Z' } }),
  );

  await page.route(`**/v1/battles/${BATTLE_ID}`, (route) =>
    route.fulfill({
      json: {
        battleId: BATTLE_ID,
        zone: 'visible',
        sequence: 4,
        state: state('a-front-0'),
        conclusion: null,
        startedAt: '2026-07-29T00:00:00.000Z',
        concludedAt: null,
      },
    }),
  );
}

test.describe('a battle is reachable at all', () => {
  test('a player mid-battle lands on the battle, not the squad builder', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Battle board' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Turn order' })).toBeVisible();

    /**
     * **The builder is not merely hidden, it is not rendered.** With one battle
     * open a player cannot start another, so a builder whose only outcome is
     * `409 battle_already_open` would be the one screen they cannot use.
     */
    await expect(page.getByRole('region', { name: /squad formation/ })).toHaveCount(0);
  });

  test('a player with no battle still reaches their squads', async ({ page }) => {
    await signedIn(page);
    await page.route('**/v1/roster', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/');

    // `signedIn` answers `204`, so the shell must fall through to the builder.
    await expect(page.getByRole('region', { name: 'Battle board' })).toHaveCount(0);
  });
});

test.describe('taking a turn', () => {
  test('sends the intent and renders the board the server returned', async ({ page }) => {
    await inBattle(page);

    const sent: unknown[] = [];
    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        json: {
          sequence: 4,
          // 1 HP is a number no local arithmetic here produces.
          packet: { events: [], state: state('a-front-1', 1), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();

    const target = page.getByRole('button', { name: /, targetable$/ }).first();
    await target.click();

    await expect(page.getByRole('button', { name: /1 of 1250/ })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ sequence: 4, actorInstanceId: 'a-front-0' });
  });

  test('the wind-up is on screen before the response arrives', async ({ page }) => {
    /**
     * **The visible half of US3.** The request and the wind-up leave together,
     * so a response held back must still find the screen in motion — and it
     * must be at a *named* phase rather than a frozen frame.
     */
    await inBattle(page);

    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      await held;
      await route.fulfill({
        json: {
          sequence: 4,
          packet: { events: [], state: state('a-front-1', 900), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();

    const resolving = page.getByRole('region', { name: 'Resolving' });
    await expect(resolving).toBeVisible();
    // Past the wind-up with nothing back: a held pose, not a stalled motion.
    await expect(resolving).toHaveAttribute('data-phase', 'holding');

    release!();
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();
  });
});

test.describe('a dropped connection does not double-advance', () => {
  test('a retry after a killed request sends the SAME sequence', async ({ page }) => {
    /**
     * **The assertion is the sequence, not the board.** A double-advance leaves
     * a perfectly coherent battle on screen; the only evidence is a second row
     * under `(battle_id, sequence)`. What the *client* must never do is number
     * its retry differently — a retry that advanced to 5 would be a new action
     * the server has no reason to reject.
     */
    await inBattle(page);

    const sequences: number[] = [];
    let first = true;

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      sequences.push((JSON.parse(route.request().postData() ?? '{}') as { sequence: number }).sequence);

      if (first) {
        first = false;
        // The socket dies with the request in flight — the server may well have
        // committed it, and the client cannot tell.
        await route.abort('connectionreset');
        return;
      }

      await route.fulfill({
        json: {
          sequence: 4,
          packet: { events: [], state: state('a-front-1', 700), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();

    const target = page.getByRole('button', { name: /, targetable$/ }).first();
    await target.click();

    // The failure surfaces, and the screen returns to a state that can retry.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();

    await page.getByRole('button', { name: /, targetable$/ }).first().click();
    await expect(page.getByRole('button', { name: /700 of 1250/ })).toBeVisible();

    expect(sequences).toEqual([4, 4]);
  });

  test('a 409 resynchronises without showing the player an error', async ({ page }) => {
    /**
     * The server's history and the client's disagree — the killed request *did*
     * commit. The contract's answer is to re-read, and re-reading is a complete
     * repair because state is re-derived from the log on every call.
     */
    await inBattle(page);

    let resynced = false;
    await page.route(`**/v1/battles/${BATTLE_ID}`, (route) => {
      const body = {
        battleId: BATTLE_ID,
        zone: 'visible',
        sequence: resynced ? 5 : 4,
        state: state(resynced ? 'a-middle-0' : 'a-front-0'),
        conclusion: null,
        startedAt: '2026-07-29T00:00:00.000Z',
        concludedAt: null,
      };
      return route.fulfill({ json: body });
    });

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, (route) => {
      resynced = true;
      return route.fulfill({
        status: 409,
        json: {
          error: { code: 'sequence_gap', message: 'behind' },
          currentSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();

    // A different champion is up, and no error was shown for something the
    // client fixed on its own.
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('the result', () => {
  test('shows the outcome and stops asking for moves', async ({ page }) => {
    await inBattle(page);

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, (route) =>
      route.fulfill({
        json: {
          sequence: 4,
          packet: {
            events: [],
            state: state(null),
            conclusion: { winner: 'attacker', reason: 'wipe' },
          },
          nextSequence: 5,
        },
      }),
    );

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();

    await expect(page.getByRole('region', { name: 'Result' })).toBeVisible();
    await expect(page.getByText(/victory/i)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your move' })).toHaveCount(0);
  });
});
