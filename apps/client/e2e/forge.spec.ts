/**
 * A player places a rune, end to end (018 T019 · US1's independent test).
 *
 * ### TL;DR
 *
 * Buying a rune upgrade should take shards off your balance and put points on
 * the champion. This walks that in a real browser and checks both numbers move.
 *
 * ### Why this belongs in a browser and not in jsdom
 *
 * The unit suites already assert *what was requested*. What they cannot assert
 * is the loop closing: commit → refetch → the screen showing the new balance
 * and the new stat line. That is two renders and a network round trip, and it
 * is exactly where "patched local state instead of refetching" hides — a screen
 * that applies its own delta passes every unit test and shows a stale balance
 * the moment anything else changes.
 *
 * So the mock serves **different bodies before and after the commit**, and the
 * assertions are on what is painted.
 */

import { expect, test } from '@playwright/test';
import { getAllHeroes, STAT_CAP } from '@lmntlz/content';
import { signedIn } from './fixtures.js';

const HERO = getAllHeroes()[0]!;
const SLOTS = ['primary', 'secondary', 'common'] as const;

const STAGE_COSTS = [150, 150, 150, 200];
const STAGE_BOOSTS = [20, 10, 5, 0];

const runesPayload = (stage: number, allocations: Record<string, number>) => ({
  heroes: getAllHeroes().map((hero) => ({
    heroId: hero.id,
    slots: SLOTS.map((slot) => ({
      slot,
      element: slot === 'primary' ? hero.primary : slot === 'secondary' ? hero.secondary : null,
      stage: hero.id === HERO.id && slot === 'primary' ? stage : 0,
      allocations: hero.id === HERO.id && slot === 'primary' ? allocations : {},
      utility: null,
      spent:
        hero.id === HERO.id && slot === 'primary'
          ? STAGE_COSTS.slice(0, stage).reduce((a, b) => a + b, 0)
          : 0,
    })),
  })),
});

const shardsPayload = (balance: number) => ({
  balance,
  lifetimeEarned: 10_000,
  rating: 1200,
  today: { victories: 0, nextMultiplier: 1.5, nextBoundaryAt: '2026-08-01T00:00:00.000Z' },
  cap: { balanceCap: 6500, capInRunes: 10 },
  config: {
    stageCosts: STAGE_COSTS,
    stageBoosts: STAGE_BOOSTS,
    fullRuneCost: 650,
    attackVictory: 20,
    defenseHold: 12,
    hiddenMultiplier: 2,
    dailyTiers: [],
    holdsAreTiered: false,
    capInRunes: 10,
    balanceCap: 6500,
  },
});

const OPENING_BALANCE = 4260;

test('a player places a rune and both the balance and the stat move', async ({ page }) => {
  await signedIn(page);

  /**
   * **The commit flips the mock.** Before it, a bare rune and the opening
   * balance; after it, stage 1 with the boost placed and the balance down by
   * the stage cost. A screen that patched its own state instead of refetching
   * would still show the opening balance here.
   */
  let committed = false;

  await page.route('**/v1/me/runes', (route) =>
    route.fulfill({
      json: committed ? runesPayload(1, { might: STAGE_BOOSTS[0]! }) : runesPayload(0, {}),
    }),
  );

  await page.route('**/v1/me/shards', (route) =>
    route.fulfill({
      json: shardsPayload(committed ? OPENING_BALANCE - STAGE_COSTS[0]! : OPENING_BALANCE),
    }),
  );

  await page.route(`**/v1/heroes/${HERO.id}/runes/primary`, async (route) => {
    committed = true;
    await route.fulfill({ json: { ok: true, stage: 1 } });
  });

  await page.goto('/');

  /* The rail entry exists, and it is how the Forge is reached — not a URL. */
  await page.getByRole('button', { name: /rune forge/i }).click();

  const ladder = page.getByRole('region', { name: 'Stage ladder' });
  await expect(ladder).toContainText(`◈ ${OPENING_BALANCE}`);

  await page.getByRole('button', { name: new RegExp(HERO.name, 'i') }).first().click();

  const might = page.getByRole('button', { name: /^might/i });
  await expect(might).toContainText(`${HERO.stats.might}`);
  await expect(might).toContainText(`/ ${STAT_CAP}`);

  await might.click();
  await page.getByRole('button', { name: /commit stage 1/i }).click();

  /* The balance fell by exactly the stage cost. */
  await expect(ladder).toContainText(`◈ ${OPENING_BALANCE - STAGE_COSTS[0]!}`);

  /* And the champion's stat line carries the boost. */
  await expect(page.getByRole('button', { name: /^might/i })).toContainText(
    `+${STAGE_BOOSTS[0]}`,
  );

  /* The slot now reads stage 1 rather than empty. */
  await expect(page.getByRole('button', { name: /^primary slot/i })).toContainText('stage 1');
});

test('the Forge is leavable without a page reload', async ({ page }) => {
  await signedIn(page);
  await page.route('**/v1/me/runes', (route) => route.fulfill({ json: runesPayload(0, {}) }));
  await page.route('**/v1/me/shards', (route) =>
    route.fulfill({ json: shardsPayload(OPENING_BALANCE) }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /rune forge/i }).click();
  await expect(page.getByRole('region', { name: 'Stage ladder' })).toBeVisible();

  /**
   * FR-016. A screen only a reload can leave is the same defect as a screen
   * only a URL can reach, and the finished-battle screen shipped exactly that
   * before 017 added its exit.
   */
  await page.getByRole('button', { name: /^codex$/i }).click();
  await expect(page.getByRole('region', { name: 'Stage ladder' })).toHaveCount(0);
});
