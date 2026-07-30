/**
 * The profile, in a real browser (012 T035).
 *
 * ### What this adds over `tests/profile/wiring.test.tsx`
 *
 * The unit tests mount `ProfileScreen` directly and assert it makes the calls.
 * That proves the component works. **It does not prove a player can get to it**
 * — which is exactly the distinction that let feature 006 ship a complete,
 * fully-tested squad builder that was unreachable from the running app.
 *
 * So this spec starts where a player starts: signed in, on the default screen,
 * and clicks. If the nav entry is missing, or the screen is in the union but not
 * in the switch, every unit test still passes and this one fails.
 *
 * ### And the leak assertion, on the rendered page
 *
 * The heavy-Hidden fixture is the same shape as the server-side one: a player
 * whose battles alternate Visible/Hidden. The API is mocked here, so this cannot
 * catch a wrong *query* — `apps/api/tests/profiles/visibleRecord.test.ts` owns
 * that. What it catches is the **client** re-introducing the leak in copy: a
 * "showing 8 of 20", an ellipsis, or a gap the layout draws attention to.
 */

import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

const SELF = 'e2e';

/** Twenty Visible battles, every other day — the gaps are Hidden ones. */
const RECENT = Array.from({ length: 20 }, (_, i) => ({
  battleId: `btl_${i}`,
  concludedOn: new Date(Date.UTC(2026, 6, 30) - i * 2 * 86_400_000)
    .toISOString()
    .slice(0, 10),
  role: i % 2 === 0 ? 'attacker' : 'defender',
  opponent: `Rival ${i}`,
  opponentWasBot: false,
  outcome: i % 3 === 0 ? 'loss' : 'win',
  turnCount: 90 + i,
}));

const PROFILE = {
  playerId: SELF,
  username: 'Reyna',
  avatar: { kind: 'curated', value: 'fire' },
  accountAgeDays: 214,
  league: 'gold',
  rating: 1412,
  gearScore: 4180,
  holdStreaks: { visible: 14, hidden: 3 },
  guild: null,
  recentBattles: RECENT,
};

test.beforeEach(async ({ page }) => {
  await mockApi(page);

  await page.route('**/v1/players/*/profile', (route) => route.fulfill({ json: PROFILE }));
  await page.route('**/v1/me/shards', (route) =>
    route.fulfill({
      json: {
        balance: 4321,
        lifetimeEarned: 9000,
        rating: 1412,
        today: { victories: 2, nextMultiplier: 1.5, nextBoundaryAt: '2026-07-31T00:00:00.000Z' },
        cap: { shards: 6500, runes: 10 },
        config: {},
      },
    }),
  );
  await page.route('**/v1/me/avatar', (route) =>
    route.fulfill({
      json: {
        curated: ['earth', 'air', 'fire', 'water', 'light', 'dark'],
        current: { kind: 'curated', value: 'fire' },
        customPrice: { shards: 1350, cents: 500 },
        customAvailable: false,
      },
    }),
  );
});

test('a player can reach their own profile from the nav', async ({ page }) => {
  await page.goto('/');

  // Starts on Squads. The profile must be one click away or it does not exist.
  await page.getByRole('tab', { name: 'Profile' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Reyna' })).toBeVisible();

  /**
   * Scoped to the Shards section, because the balance deliberately appears
   * **twice** — once as the balance and once beside the 325-shard rename price,
   * so a player can see whether they can afford it without doing arithmetic.
   */
  const shards = page.getByRole('region', { name: 'Shards' });
  await expect(shards.getByText('4,321')).toBeVisible();
  await expect(shards.getByText(/10 full runes/)).toBeVisible();
});

test('the battle record shows twenty entries with no measurable gap', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Profile' }).click();

  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(20);

  /**
   * **Nothing on the page may report a count-of-a-count.** "Showing 20 of 41",
   * "20 most recent", an ellipsis — each hands back the inference the server's
   * query was shaped to prevent.
   */
  const body = (await page.locator('main').textContent()) ?? '';
  expect(body).not.toMatch(/of \d+|\d+ of|…|\.\.\./);
  expect(body).not.toMatch(/hidden battle|hidden squad/i);
});

test('own-account controls are present and the custom upload is closed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Profile' }).click();

  await expect(page.getByRole('button', { name: /export my data/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /change name/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /custom images/i })).toBeDisabled();
});

test('the export downloads a file', async ({ page }) => {
  await page.route('**/v1/me/export', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'battleId,concludedAt\r\nbtl_0,2026-07-30T00:00:00.000Z',
    }),
  );

  await page.goto('/');
  await page.getByRole('tab', { name: 'Profile' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export my data/i }).click();

  expect((await download).suggestedFilename()).toBe('lmntlz-battles.csv');
});
