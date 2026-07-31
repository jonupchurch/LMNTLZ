/**
 * Watching a battle back, and a patch that cannot reach it
 * (018 T039 · US3's independent test · SC-006, SC-007).
 *
 * ### TL;DR
 *
 * Open the battle record, watch a fight, and check that the fight looks exactly
 * the same after the game's engine has moved on underneath it.
 *
 * ### How a balance change is simulated, and why this is the honest version
 *
 * SC-007 asks that a replay recorded before a balance change plays identically
 * after it. Server-side, `apps/api/tests/replays/playback.test.ts` proves it the
 * only way that means anything — it changes the engine and content versions on
 * the record and reads the blob again.
 *
 * The client's half of that claim is different and worth stating separately:
 * **playback is a pure function of the stored log**. So this spec plays the
 * whole battle, captures every turn line, then serves *the same log* with the
 * engine and content versions moved forward — the shape of what a patch does —
 * and asserts the turn text is byte-identical while the provenance line is not.
 *
 * If the viewer ever recomputed anything from the running build, those two
 * would move together. They must not.
 */

import { expect, test } from '@playwright/test';
import { signedIn } from './fixtures.js';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const BATTLES = {
  battles: [
    {
      battleId: 'btl-watchable',
      concludedAt: hoursAgo(5),
      role: 'attacker',
      opponent: { id: 'acc-2', username: 'Coll_Redoubt', isBot: false },
      zone: 'visible',
      outcome: 'win',
      turnCount: 102,
      watchable: true,
    },
    {
      /**
       * **Nine days old and unwatchable** — the ordinary end of every replay's
       * life. Its row must still carry the result: the *replay* expired, the
       * battle did not (FR-012).
       */
      battleId: 'btl-expired',
      concludedAt: hoursAgo(24 * 9),
      role: 'defender',
      opponent: { id: 'acc-3', username: 'AshLantern', isBot: false },
      zone: 'hidden',
      outcome: 'loss',
      turnCount: 77,
      watchable: false,
    },
  ],
  total: 2,
};

const turn = (over: Record<string, unknown> = {}) => ({
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
  },
  ...over,
});

const logAt = (engineVersion: string, contentVersion: string) => ({
  battleId: 'btl-watchable',
  engineVersion,
  contentVersion,
  events: [
    turn(),
    turn({
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
    turn({
      actorInstanceId: 'a-middle-2',
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
  ],
  conclusion: { winner: 'attacker', reason: 'wipe' },
});

/** Every turn line, in order — the thing a patch must not be able to move. */
const turnText = async (page: import('@playwright/test').Page): Promise<string[]> =>
  page.getByRole('list', { name: 'Turns' }).getByRole('listitem').allInnerTexts();

test('a battle plays back, and the record survives its replay', async ({ page }) => {
  await signedIn(page);

  await page.route('**/v1/me/battles', (r) => r.fulfill({ json: BATTLES }));
  await page.route('**/v1/replays/btl-watchable', (r) =>
    r.fulfill({ json: logAt('1.4.0', '2026-07-12') }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /battle record/i }).click();

  const table = page.getByRole('table', { name: 'Your battles' });
  await expect(table).toBeVisible();

  /* The expired row keeps its outcome and says why it cannot be watched — it
     must never read as a battle that went missing. */
  const expired = page.locator('[data-battle="btl-expired"]');
  await expect(expired).toContainText(/loss/i);
  await expect(expired).toContainText('77');
  await expect(expired).toContainText(/no longer watchable/i);
  await expect(expired.getByRole('button', { name: /watch/i })).toHaveCount(0);

  await page.locator('[data-battle="btl-watchable"]').getByRole('button', { name: /watch/i }).click();

  const playback = page.getByRole('region', { name: 'Playback' });
  await expect(playback).toBeVisible();
  await expect(page.getByText(/engine 1\.4\.0/i)).toBeVisible();

  /* Nothing has happened yet — a replay opens at the start, not at the end. */
  await expect(playback).toContainText('Turn 0 of 3');
  await expect(page.getByRole('region', { name: 'Result' })).toHaveCount(0);

  const forward = page.getByRole('button', { name: /forward one turn/i });
  await forward.click();
  await expect(playback).toContainText('Turn 1 of 3');
  await expect(playback).toContainText('214 damage');

  await forward.click();
  await forward.click();
  await expect(playback).toContainText('Turn 3 of 3');

  /* Only now, and it reads from the side the viewer fought on. */
  await expect(page.getByRole('region', { name: 'Result' })).toContainText(/victory/i);

  /** FR-016 — out without a reload, back to the list it came from. */
  await page.getByRole('button', { name: /back to your battles/i }).click();
  await expect(page.getByRole('table', { name: 'Your battles' })).toBeVisible();
});

test('the same log plays identically after the engine has moved on (SC-007)', async ({ page }) => {
  await signedIn(page);
  await page.route('**/v1/me/battles', (r) => r.fulfill({ json: BATTLES }));

  /** Before the patch. */
  await page.route('**/v1/replays/btl-watchable', (r) =>
    r.fulfill({ json: logAt('1.4.0', '2026-07-12') }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /battle record/i }).click();
  await page.locator('[data-battle="btl-watchable"]').getByRole('button', { name: /watch/i }).click();
  await expect(page.getByRole('region', { name: 'Playback' })).toBeVisible();

  const before = await turnText(page);
  expect(before).toHaveLength(3);
  /* Non-vacuous: three empty strings would satisfy the length and the
     comparison below, and would prove that nothing renders rather than that
     nothing changed. */
  expect(before.join(' ')).toContain('214');
  expect(before.join(' ')).toContain('crit');
  await expect(page.getByText(/engine 1\.4\.0 · content 2026-07-12/i)).toBeVisible();

  /**
   * **The patch.** The engine and the content both move; the stored log does
   * not, because a stored log is what a patch cannot reach (Constitution XVI).
   */
  await page.unroute('**/v1/replays/btl-watchable');
  await page.route('**/v1/replays/btl-watchable', (r) =>
    r.fulfill({ json: logAt('2.0.0', '2026-12-01') }),
  );

  await page.getByRole('button', { name: /back to your battles/i }).click();
  await page.locator('[data-battle="btl-watchable"]').getByRole('button', { name: /watch/i }).click();
  await expect(page.getByRole('region', { name: 'Playback' })).toBeVisible();

  /* The provenance moved — proof the reload actually happened and that this
     assertion is not comparing a cached render with itself. */
  await expect(page.getByText(/engine 2\.0\.0 · content 2026-12-01/i)).toBeVisible();

  /* And not one turn did. */
  expect(await turnText(page)).toEqual(before);
});

test('a replay that is not yours reads as not found, never as forbidden', async ({ page }) => {
  await signedIn(page);
  await page.route('**/v1/me/battles', (r) => r.fulfill({ json: BATTLES }));

  /**
   * The server answers `404` for a battle that exists and is not yours,
   * deliberately indistinguishable from one that does not exist
   * (Constitution XVII). The client must not undo that in its wording.
   */
  await page.route('**/v1/replays/btl-watchable', (r) =>
    r.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'no such replay' } } }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /battle record/i }).click();
  await page.locator('[data-battle="btl-watchable"]').getByRole('button', { name: /watch/i }).click();

  const note = page.locator('[data-gone]');
  await expect(note).toContainText(/not found|no such/i);
  await expect(note).not.toContainText(/permission|forbidden|not allowed|access denied/i);
  await expect(page.getByRole('button', { name: /back to your battles/i })).toBeVisible();
});
