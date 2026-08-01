/**
 * The roster grid, measured in a real browser.
 *
 * ### The defect these exist for
 *
 * Before 019 this screen rendered the five-rung effectiveness ladder on every
 * tile — **135 rows of `×1.50 / ×1.25 / ×1.00 / ×0.80 / ×0.50` on one page**,
 * the same five constants twenty-seven times — and the space that cost
 * truncated **13 of the 27 champion names**. Every unit test passed. They had to:
 * jsdom does no layout, so "the name does not fit in its box" is not a fact it
 * can hold an opinion about.
 *
 * A name is the field a player scans by. It is the one thing on a browsing grid
 * that must never be what gets cut, so it gets an assertion that can only be
 * made here.
 */

import { expect, test } from '@playwright/test';
import { getAllHeroes } from '@lmntlz/content';
import { signedIn } from './fixtures.js';

const HEROES = getAllHeroes();

test.beforeEach(async ({ page }) => {
  await signedIn(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^roster/i }).click();
  // Measured before the webfont lands, every width below is of the fallback,
  // which is wider — the check would report clipping that does not exist.
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'The Roster' })).toBeVisible();
});

test('all 27 champions are shown, and none of their names is cut off', async ({ page }) => {
  const cards = page.locator('[data-hero]');
  await expect(cards).toHaveCount(HEROES.length);

  const clipped = await page.evaluate(() => {
    const out: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>('[data-hero]')) {
      /*
       * **`[data-hero-name]`, never `.font-display`.** The first draft selected
       * on the class and passed a mutation that squeezed the name to 96px —
       * because `TypeBadge` carries `font-display` too and sits earlier in the
       * card, so every measurement was of the two-letter Force badge, which of
       * course fits. A selector one element too greedy is a test that cannot
       * fail.
       */
      const name = card.querySelector<HTMLElement>('[data-hero-name]');
      if (!name) {
        out.push(`${card.dataset['hero']}: no name element at all`);
        continue;
      }
      if (name.scrollWidth > name.clientWidth + 1) {
        out.push(`${name.textContent?.trim()} (${name.scrollWidth} > ${name.clientWidth})`);
      }
    }
    return out;
  });

  expect(clipped, `champion names truncated: ${clipped.join(' | ')}`).toEqual([]);
});

test('every tile is portrait-led, and every portrait actually loads', async ({ page }) => {
  /*
   * `naturalWidth === 0` is a broken image; `complete && naturalWidth > 0` is a
   * loaded one. Asserting the `<img>` merely *exists* would pass on 27 broken
   * files — and `loading="lazy"` means they only decode once scrolled to, so
   * the page has to be walked before any of this is true.
   */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });

  const broken = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-hero]')]
      .map((card) => {
        const img = card.querySelector('img');
        if (!img) return `${card.dataset['hero']}: no portrait`;
        return img.complete && img.naturalWidth > 0 ? null : `${card.dataset['hero']}: not loaded`;
      })
      .filter(Boolean),
  );

  expect(broken, `portraits missing or broken: ${broken.join(' | ')}`).toEqual([]);
});

test('every tile carries all four doors', async ({ page }) => {
  // The counter-building read. Four marks × 27 champions; anything less means a
  // champion whose Bane cannot be seen without opening her.
  const marks = page.locator('[data-hero] [data-door-cluster] [data-door]');
  await expect(marks).toHaveCount(HEROES.length * 4);
});

test('the drawer opens on the champion clicked, and leads with her portrait', async ({ page }) => {
  const nyxara = HEROES.find((h) => h.name === 'Nyxara')!;
  await page.locator(`[data-hero="${nyxara.id}"]`).first().click();

  const drawer = page.getByRole('complementary', { name: /nyxara/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('img').first()).toBeVisible();

  /*
   * The derivation line is the most teachable thing on the screen — it shows the
   * *rule* rather than 27 memorised answers. Asserting it names the right Forces
   * proves it is generated from this champion and not a transcribed example.
   */
  await expect(drawer).toContainText(`counter(${nyxara.primary})`);
  await expect(drawer).toContainText(nyxara.bane);
});
