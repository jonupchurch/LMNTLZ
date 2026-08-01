/**
 * The front door, measured in a real browser.
 *
 * ### Every defect below was invisible to 858 green unit tests
 *
 * `tests/site/landing.test.tsx` already asserts what the page *says* — the
 * roster size, the ambush cap, the spend ceiling, and that nothing is listed as
 * missing once its feature directory exists. All of that is text, and jsdom
 * reads text perfectly well.
 *
 * What jsdom cannot do is **lay anything out**. It has no box model, so it
 * cannot see that this page had three different left margins in one screenful:
 * the prose centred at `max-w-3xl`, the pillars and the portrait band at
 * `max-w-5xl`, each `mx-auto` inside a `max-w-[1600px]` page. Every block was
 * correct on its own line and the page was visibly crooked. The same blindness
 * hid a nine-badge row wrapping 8 + 1 directly under a sentence promising "six
 * arcane… and three martial".
 *
 * So these are the assertions that need a browser, and only those. Anything
 * checkable without one belongs in the unit file, which is cheaper and faster.
 */

import { expect, test } from '@playwright/test';

/** 1600×900 is the design target; 1280×720 is the stated minimum window. */
const TARGET = { width: 1600, height: 900 } as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(TARGET);
  await page.goto('/');
  // **Before the webfont lands, every measurement below is of the fallback**,
  // which is wider — a clipping check run early reports failures that do not
  // exist, and a width check run early passes on a page that will grow.
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeVisible();
});

test('the page has one left edge, not three', async ({ page }) => {
  /*
   * **The BOXES, not the text inside them.** Measuring headings fails at 24px on
   * every panelled section, because `.lz-surface p-6` correctly insets its own
   * contents — a first draft of this test read that as a misalignment and would
   * have had me "fixing" padding that was right. The invariant is about the
   * blocks the page is assembled from.
   *
   * Relative to the first block rather than a pinned 320px: the claim is that
   * they agree with each other, which survives the column ever being retuned.
   * A hard number would fail on a widening that left the page perfectly straight.
   */
  const edges = await page.evaluate(() => {
    const blocks = [
      ...document.querySelectorAll<HTMLElement>('main > *'),
      // The sign-in panel is a sibling of `main`, not a child — which is exactly
      // why it drifted: nothing in `LandingScreen` governs it, so its column is
      // declared a second time in `App.tsx` and can silently disagree.
      ...document.querySelectorAll<HTMLElement>('main ~ div > div'),
    ];
    return blocks.map((el) => ({
      tag: el.tagName,
      text: (el.textContent ?? '').trim().slice(0, 32),
      x: Math.round(el.getBoundingClientRect().left),
    }));
  });

  // Without this the test passes on a page that rendered nothing at all.
  expect(edges.length, 'found no top-level blocks to measure').toBeGreaterThanOrEqual(5);

  const first = edges[0]?.x ?? 0;
  for (const block of edges) {
    // 1px for sub-pixel rounding and no more. The real misalignment was 128px.
    expect(
      Math.abs(block.x - first),
      `<${block.tag}> "${block.text}" starts ${block.x - first}px off the page's left edge`,
    ).toBeLessThanOrEqual(1);
  }
});

test('the nine Forces read as six and three, never 8 + 1', async ({ page }) => {
  const rows = await page.evaluate(() => {
    /* `data-force` rather than the shape classes — `TypeBadge` puts the shape on
       `lz-shield`/`lz-plate`, and keying a test on a class name is keying it on
       something Tailwind is free to rewrite. The attribute is the contract. */
    const badges = [...document.querySelectorAll('[data-force]')];
    const tops = badges.map((el) => Math.round(el.getBoundingClientRect().top));
    const counts = new Map<number, number>();
    for (const top of tops) counts.set(top, (counts.get(top) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  });

  // The guard that stops this passing on an empty selection — a badge that
  // stopped carrying any of those classes would otherwise make `rows` `[]`,
  // and `[]` satisfies "no row of one" for the wrong reason entirely.
  expect(rows.reduce((a, b) => a + b, 0), 'no Force badges were found at all').toBe(9);
  expect(rows, 'the Forces did not fall as six arcane then three martial').toEqual([6, 3]);
});

test('nothing on the page is clipped or wrapped out of its box', async ({ page }) => {
  const broken = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('h1, h2, h3, span, a')) {
      const text = el.textContent?.trim() ?? '';
      if (!text || el.children.length > 0) continue;
      // `scrollWidth` sees a clip and is blind to a WRAP — an element that grew
      // a second line reports no overflow at all. Height against line-height is
      // the half that catches it.
      const clipped = el.scrollWidth > el.clientWidth + 1;
      const style = getComputedStyle(el);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const wrapped = style.whiteSpace === 'nowrap' && el.clientHeight > line * 1.5;
      if (clipped || wrapped) out.push(`${el.tagName}: ${text.slice(0, 40)}`);
    }
    return out;
  });

  expect(broken, `clipped or wrapped: ${broken.join(' | ')}`).toEqual([]);
});

test('a build with no Google client ID complains exactly once', async ({ page }) => {
  /*
   * These runs have no `.env.local`, so `VITE_GOOGLE_CLIENT_ID` is empty and the
   * failure path is the one that renders. It used to render **twice** — the
   * rejection from `loadGoogleIdentity` and a static block that fired on the same
   * condition — so a visitor read the same complaint back to back and a screen
   * reader announced it twice.
   */
  const alerts = page.getByRole('alert');
  await expect(alerts).toHaveCount(1);
  await expect(alerts.first()).toContainText('Google client ID');
});
