/**
 * The Codex's reach axis, measured in a real browser.
 *
 * ### Why this cannot be a unit test
 *
 * The axis diagram makes a claim that is **entirely about position**: six rows
 * on one shared line, ascending left to right from the attackers' rearmost seat
 * to the defenders', with the contact seam physically between rows 3 and 4.
 * jsdom does no layout, so it can confirm the six seats exist and in what DOM
 * order — and has no opinion at all about where any of them is drawn.
 *
 * That gap is not hypothetical here. The diagram renders its two halves through
 * `display: contents` wrappers and a flex row; a stylesheet-ordering accident of
 * exactly the kind that shipped every squad card as a bare illustration would
 * reorder or collapse this silently, and every assertion in `codex.test.tsx`
 * would still pass.
 *
 * ### The assertions are derived, never written down
 *
 * `AXIS` is imported, so no number below is transcribed. A test that spelled out
 * `[1,2,3,4,5,6]` would agree with a screen that had inverted the far side —
 * which is the specific way this diagram can be wrong while looking right.
 */

import { expect, test } from '@playwright/test';
import { AXIS, frontRowOf } from '@lmntlz/sim/rules';
import { signedIn } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await signedIn(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^codex/i }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Reach and the axis' })).toBeVisible();
});

test('the six rows are drawn left to right in axis order', async ({ page }) => {
  const seats = page.locator('[data-axis-row]');
  await expect(seats).toHaveCount(AXIS.length);

  const placed = await seats.evaluateAll((els) =>
    els
      .map((el) => ({
        row: Number(el.getAttribute('data-axis-row')),
        x: el.getBoundingClientRect().left,
        width: el.getBoundingClientRect().width,
      }))
      .sort((a, b) => a.x - b.x),
  );

  expect(placed.map((p) => p.row)).toEqual(AXIS.map((a) => a.row));

  // Every seat is actually drawn. A collapsed column still reports its row.
  for (const seat of placed) expect(seat.width, `row ${seat.row} has no width`).toBeGreaterThan(20);
});

/**
 * The seam is the only mark that says which way is toward the enemy, so being
 * between the right pair is the whole of its job. At an edge it is decoration.
 */
test('the contact seam sits between the two front rows', async ({ page }) => {
  const box = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    if (!b) throw new Error(`${selector} is not laid out`);
    return b;
  };

  const ours = await box(`[data-axis-row="${frontRowOf('attacker')}"]`);
  const theirs = await box(`[data-axis-row="${frontRowOf('defender')}"]`);
  const seam = await box('[data-seam]');

  expect(seam.x).toBeGreaterThan(ours.x + ours.width - 1);
  expect(seam.x + seam.width).toBeLessThan(theirs.x + 1);
});

/**
 * The two halves are one board, not two panels — if they render at different
 * scales the picture says the sides are asymmetric, which is the opposite of
 * what "the axis is absolute, not per-side" means.
 */
test('both halves are drawn at the same scale', async ({ page }) => {
  const widthOf = async (row: number) => (await page.locator(`[data-axis-row="${row}"]`).boundingBox())?.width ?? 0;

  const widths = await Promise.all(AXIS.map((a) => widthOf(a.row)));
  const min = Math.min(...widths);
  const max = Math.max(...widths);

  expect(max - min, `seat widths vary: ${widths.join(', ')}`).toBeLessThan(2);
});

/** Nothing in the panel may overflow its column at the target viewport. */
test('the diagram fits its panel', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const seats = [...document.querySelectorAll<HTMLElement>('[data-axis-row]')];
    const panel = seats[0]?.closest('section, div[class*="lz-surface"]') as HTMLElement | null;
    if (!panel) return ['no panel'];

    const bounds = panel.getBoundingClientRect();
    return seats
      .filter((s) => {
        const r = s.getBoundingClientRect();
        return r.left < bounds.left - 1 || r.right > bounds.right + 1;
      })
      .map((s) => `row ${s.getAttribute('data-axis-row')}`);
  });

  expect(overflow).toEqual([]);
});
