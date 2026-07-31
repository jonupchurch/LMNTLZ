/**
 * The shell at three viewports, and by keyboard alone (017 T069, T070 ·
 * SC-006, SC-007).
 *
 * These belong in a browser and nowhere else. jsdom applies no stylesheet, so
 * it cannot answer "does this overflow at 1280" or "is the focus ring
 * visible" — a unit test asserting either would pass no matter what, which is
 * worse than not asking.
 */

import { expect, test } from '@playwright/test';
import { signedIn } from './fixtures.js';

/** 1280 is the floor, 1600 the design target, 2400 past the 2100 cap. */
const VIEWPORTS = [
  { name: '1280 floor', width: 1280, height: 720 },
  { name: '1600 target', width: 1600, height: 900 },
  { name: '2400 ultrawide', width: 2400, height: 1200 },
] as const;

for (const vp of VIEWPORTS) {
  test(`no horizontal page scroll at ${vp.name}`, async ({ page }) => {
    await signedIn(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    /**
     * **The page never scrolls sideways.** Below 1280 the body has a
     * `min-width` and scrolling is the honest failure; at and above it, a
     * horizontal bar means something overflowed its column.
     */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${vp.name} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  });
}

test('the rail stays pinned and the content caps above ~2100', async ({ page }) => {
  await signedIn(page);
  await page.setViewportSize({ width: 2400, height: 1200 });
  await page.goto('/');

  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail).toBeVisible();

  const railBox = (await rail.boundingBox())!;
  /* Pinned left, fixed width — it does not drift with the content. */
  expect(railBox.x).toBeLessThanOrEqual(1);
  expect(Math.round(railBox.width)).toBe(220);

  /* The content column caps rather than growing with the window. */
  const contentWidth = await page.evaluate(() => {
    const grid = document.querySelector('main > div');
    return grid ? Math.round(grid.getBoundingClientRect().width) : -1;
  });
  expect(contentWidth).toBeGreaterThan(0);
  expect(contentWidth, 'content did not cap at 1400').toBeLessThanOrEqual(1400);
});

test('never collapses to one column at the floor', async ({ page }) => {
  await signedIn(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  /* The rail is beside the content, not stacked above it — a squad is six
     heroes in a fixed formation and a one-column reflow is a different
     interface, not a smaller one. */
  const rail = page.getByRole('navigation', { name: 'Main' });
  const main = page.getByRole('main');
  const railBox = (await rail.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(mainBox.x, 'the rail and content stacked instead of sitting side by side').toBeGreaterThan(
    railBox.x + railBox.width - 1,
  );
});

test('the rail is fully operable from the keyboard, with a visible ring', async ({ page }) => {
  await signedIn(page);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  /* Tab until focus lands inside the rail. */
  let inRail = false;
  for (let i = 0; i < 25 && !inRail; i += 1) {
    await page.keyboard.press('Tab');
    inRail = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el?.closest('nav[aria-label="Main"]');
    });
  }
  expect(inRail, 'no rail entry is reachable by Tab').toBe(true);

  /**
   * The ring is drawn, and it is Air rather than gold — gold is the same hex
   * as `--color-light`, so it vanished on Light surfaces. Read from the real
   * computed style, which is the only place this can be checked honestly.
   *
   * **Polled, not sampled once, and the reason is worth keeping.** Tailwind's
   * `transition-colors` includes `outline-color`, and the rail entries carry
   * it. Reading the computed style the instant focus lands catches the ring
   * *mid-transition*, still at its starting value — which on the active entry
   * is `currentColor`, and the active entry is gold. The first version of this
   * test failed with "expected air, received gold" and the CSS was correct all
   * along; it was the assertion that was racing a 90ms animation.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() => getComputedStyle(document.activeElement!).outlineColor.replace(/\s/g, '')),
      { message: 'the focus ring never settles on Air (#8FCFE0)' },
    )
    .toBe('rgb(143,207,224)');

  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { outlineWidth: s.outlineWidth, shadow: s.boxShadow };
  });
  expect(parseFloat(ring.outlineWidth), 'the focused control has no outline').toBeGreaterThan(0);
  expect(ring.shadow, 'the void separation ring is missing').toContain('rgb');

  /* And it activates with the keyboard, not only the mouse. */
  await page.keyboard.press('Enter');
  await expect(page.locator('nav[aria-label="Main"] [aria-current="page"]')).toHaveCount(1);
});
