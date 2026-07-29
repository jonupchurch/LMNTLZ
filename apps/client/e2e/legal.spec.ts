/**
 * The five policy pages, served and reachable.
 *
 * ### Why a browser is needed for this and a unit test is not enough
 *
 * `tests/site/legal.test.tsx` reads the files off disk and renders the footer,
 * which proves the pages *exist* and the footer *has the right hrefs*. Neither
 * of those is the thing that matters. **What matters is that a person landing on
 * the site can get to the refund policy**, and that is three separate claims a
 * unit test cannot make:
 *
 * - the static files are actually served at those paths by the real build;
 * - the stylesheet resolves, so the page is a page and not unstyled markup;
 * - the link works when clicked, not merely when inspected.
 *
 * This is the same gap feature 006 found — a component complete, tested, and
 * unreachable — applied to the pages a payment provider will be following by
 * hand. No API is involved, so these run with no database and no credentials.
 */

import { expect, test } from '@playwright/test';

const PAGES = [
  { file: 'pricing.html', label: 'Passes', heading: 'Passes & Pricing' },
  { file: 'terms.html', label: 'Terms', heading: 'Terms of Service' },
  { file: 'privacy.html', label: 'Privacy', heading: 'Privacy Policy' },
  { file: 'refunds.html', label: 'Refunds', heading: 'Refund Policy' },
  { file: 'contact.html', label: 'Contact', heading: 'Contact' },
] as const;

test.describe('every policy page is served', () => {
  for (const { file, heading } of PAGES) {
    test(`/${file} responds and renders its heading`, async ({ page }) => {
      const response = await page.goto(`/${file}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  test('the stylesheet resolves, so these are pages rather than raw markup', async ({ page }) => {
    // A 404 on `/legal.css` still renders readable HTML, which is exactly why
    // nobody would notice — the page "works", it is just naked. Asserting a
    // computed colour is the cheapest proof the sheet actually applied.
    await page.goto('/terms.html');
    const background = await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(20, 18, 33)'); // --bg #141221
  });
});

test.describe('the front door', () => {
  /**
   * **Found in production, not in a test.** The deployed homepage was the API's
   * raw 401 — *"This endpoint requires a session token."* — rendered as the
   * whole page, and it took loading the live site in a browser to see it. No
   * API is stubbed here either, so this spec reproduces exactly the condition
   * that shipped: a real bundle, a real fetch, no session.
   */
  /**
   * **This used to need a stubbed `401` and no longer needs anything.**
   *
   * The stub was real work, not a shortcut: Vite's dev server answers any
   * unknown path with `index.html` for SPA routing, so `/v1/roster` came back
   * as 200 HTML locally and the screen never left its loading state — the
   * production condition could not occur here on its own.
   *
   * Sign-in removed the condition entirely. The app restores from a stored
   * renewal token, a visitor has none, and **the front door is now reached
   * without a request at all**. So the assertion got stronger by getting
   * simpler: it no longer depends on the server saying the right thing.
   */
  test('an anonymous visitor gets a page, not a server error', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeVisible();

    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text, 'the server’s wording must never greet a visitor').not.toContain('session token');
    expect(text).not.toContain('endpoint');
  });

  test('the front door links to what is sold', async ({ page }) => {
    // Paddle's reviewer starts at the domain. A pricing page nothing links to
    // is a pricing page they do not find.
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: /see what is sold/i }).click();
    await expect(page).toHaveURL(/\/pricing\.html$/);
  });
});

test.describe('they are reachable from the game, not just by typing a URL', () => {
  for (const { file, label, heading } of PAGES) {
    test(`the footer link "${label}" reaches ${file}`, async ({ page }) => {
      await page.goto('/');
      // No API is stubbed here, so the screen sits in its loading state. The
      // footer is outside the screen precisely so it does not depend on that.
      await page.getByRole('contentinfo').getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`/${file}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }
});

test.describe('a reader can move between the policies', () => {
  test('every page links to all the others', async ({ page }) => {
    // A reviewer follows links; a page that is a dead end costs them a trip back
    // to the root, and the one they wanted is the one they did not find.
    for (const { file } of PAGES) {
      await page.goto(`/${file}`);
      for (const other of PAGES) {
        await expect(
          page.locator(`a[href="/${other.file}"]`).first(),
          `${file} should link to ${other.file}`,
        ).toBeVisible();
      }
    }
  });

  test('the masthead marks which page you are on', async ({ page }) => {
    await page.goto('/privacy.html');
    await expect(page.locator('a[aria-current="page"]')).toHaveAttribute('href', '/privacy.html');
  });
});
