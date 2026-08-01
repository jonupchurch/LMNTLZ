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

test.describe('the power flyout', () => {
  const BRAMWEN = HEROES.find((h) => h.name === 'Bramwen')!;

  test.beforeEach(async ({ page }) => {
    await page.locator(`[data-hero="${BRAMWEN.id}"]`).first().click();
    await expect(page.getByRole('complementary', { name: /bramwen/i })).toBeVisible();
  });

  test('appears on hover and describes the power under the cursor', async ({ page }) => {
    const flyout = page.locator('[data-power-flyout]');
    await expect(flyout, 'the flyout is showing before anything is hovered').toBeHidden();

    // The tier-4: gated, dual-typed and on a long cooldown, so its sentence
    // exercises every clause the generator can produce.
    const gated = BRAMWEN.powers.find((p) => p.gateTurn > 1)!;
    await page.locator(`[data-power-row="${gated.id}"]`).hover();

    await expect(flyout).toBeVisible();
    await expect(flyout).toContainText(gated.name);
    await expect(flyout).toContainText(`Might × ${gated.multiplier}`);
    await expect(flyout).toContainText(`not before turn ${gated.gateTurn}`);
  });

  test('names whichever row is under the cursor', async ({ page }) => {
    const rows = page.locator('[data-power-row]');
    const flyout = page.locator('[data-power-flyout]');

    for (const power of BRAMWEN.powers) {
      await page.locator(`[data-power-row="${power.id}"]`).hover();
      await expect(flyout).toBeVisible();
      await expect(flyout, `hovering ${power.name} showed something else`).toContainText(power.name);
    }

    // Sanity: all six rows were real, so the loop above was not vacuous.
    await expect(rows).toHaveCount(BRAMWEN.powers.length);
  });

  test('holds the read while the cursor is in the GAP between two rows', async ({ page }) => {
    /*
     * ### This is the stutter guard, and the obvious version of it cannot fail
     *
     * The first draft hovered each row in turn and asserted the flyout named it.
     * That passed with the dismiss moved onto the row — the defect it exists to
     * catch — because **`hover()` teleports the cursor**. It never traverses the
     * space between two rows, so the leave/enter pair that causes the flicker
     * never happens, and the only state ever sampled is the settled one.
     *
     * The cursor has to actually be *in the gap*: inside the list, over no row.
     * With the dismiss on the row that is a blank flyout; with it on the list it
     * is the last read, held. `page.mouse.move` is what puts it there — a
     * locator-based API cannot address a 4px space that contains no element.
     */
    const first = BRAMWEN.powers[0]!;
    const second = BRAMWEN.powers[1]!;

    await page.locator(`[data-power-row="${first.id}"]`).hover();
    await expect(page.locator('[data-power-flyout]')).toContainText(first.name);

    const a = (await page.locator(`[data-power-row="${first.id}"]`).boundingBox())!;
    const b = (await page.locator(`[data-power-row="${second.id}"]`).boundingBox())!;
    const gapY = (a.y + a.height + b.y) / 2;
    const x = a.x + a.width / 2;

    // Prove the point really is in the gap before trusting what it shows. If
    // the rows ever butt together this test would otherwise silently become a
    // second copy of the one above.
    const onRow = await page.evaluate(
      ([px, py]) => !!document.elementFromPoint(px!, py!)?.closest('[data-power-row]'),
      [x, gapY],
    );
    expect(onRow, 'the sampled point is on a row, not between two').toBe(false);

    await page.mouse.move(x, gapY);
    await expect(
      page.locator('[data-power-flyout]'),
      'the flyout emptied while crossing between two rows',
    ).toContainText(first.name);
  });

  test('leaving the list dismisses it, so it never covers the grid for good', async ({ page }) => {
    /*
     * The other half of the rule. Holding the last read forever is right for a
     * panel in a fixed column — the battle screen does exactly that — and wrong
     * for an overlay lying on top of 27 champion cards.
     */
    await page.locator(`[data-power-row="${BRAMWEN.powers[0]!.id}"]`).hover();
    await expect(page.locator('[data-power-flyout]')).toBeVisible();

    await page.getByRole('heading', { name: 'The Roster' }).hover();
    await expect(page.locator('[data-power-flyout]')).toBeHidden();
  });

  test('a keyboard reaches it too', async ({ page }) => {
    // A flyout openable only by pointer is one a keyboard player cannot read,
    // and it holds the only account of what each power does.
    const first = BRAMWEN.powers[0]!;
    await page.getByRole('button', { name: first.name }).focus();
    await expect(page.locator('[data-power-flyout]')).toContainText(first.name);
  });
});
