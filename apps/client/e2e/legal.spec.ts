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

import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures.js';

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

test.describe('the favicon is referenced, and by a path the Steam build can follow', () => {
  /**
   * **Worth a test because the file existing is not the same as the file being used.**
   * `favicon.svg` sat in `public/` unreferenced, so browsers went on asking for
   * `/favicon.ico` and getting nothing. Nobody would report that as a bug.
   *
   * And these five policy pages are **regenerated from the design prompts** in
   * `resources/` — `CLAUDE.md` says to record a discrepancy and let the screen be
   * regenerated rather than hand-editing it — so a `<link>` added by hand is precisely
   * the kind of line a regeneration drops. This is the guard.
   */
  for (const file of ['index.html', ...PAGES.map((p) => p.file)]) {
    test(`/${file} carries an icon link the browser resolves`, async ({ page }) => {
      await page.goto(`/${file}`);

      const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
      expect(href, `${file} has no <link rel="icon">`).toBeTruthy();

      /**
       * **The path shape is deliberately not asserted here, and that is a finding
       * rather than a gap.** Playwright drives `pnpm dev`, and **Vite's dev server
       * rewrites `./favicon.svg` to `/favicon.svg`** — the relative form that the Steam
       * build depends on exists only in `dist`. Asserting it here would be asserting
       * the dev server's behaviour and would fail on correct source, which is what the
       * first version of this test did.
       *
       * `tests/site/favicon.test.ts` owns that half, against the source HTML.
       */
      expect(href).toMatch(/favicon\.svg$/);

      // What e2e *can* prove that a source scan cannot: a real browser resolved it.
      const resolved = await page.locator('link[rel="icon"]').first().evaluate((el) => {
        return (el as HTMLLinkElement).href;
      });
      const response = await page.request.get(resolved);
      expect(response.status(), `${file}'s icon does not load`).toBe(200);
    });
  }

  test('the file it points at actually resolves', async ({ page }) => {
    // The other half: a correct link to a missing file renders a blank tab icon, which
    // looks identical to no link at all.
    const response = await page.goto('/favicon.svg');

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('svg');
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

/**
 * **The privacy page makes a claim about the browser, so a browser has to check it.**
 *
 * It said *"the game sets no cookies and stores nothing in your browser's local
 * storage"* from the day it was written, and by then it was already half wrong:
 * `lib/session.ts` keeps a thirty-day renewal token in `localStorage`, on purpose,
 * with a long note explaining the trade. Nobody was careless — the sentence was
 * true when it was published and the session wiring landed afterwards. A
 * published promise nothing tests is a promise that drifts, so it now has these.
 *
 * The claim is deliberately split in two, because only one half is absolute: **no
 * cookies, ever** — that one is worth failing a build over — and **exactly one
 * item in local storage**, which is a number that must not grow quietly.
 *
 * **What these do not cover.** `playwright.config.ts` runs `pnpm dev`, so
 * `import.meta.env.PROD` is false and `analyticsEnabled()` keeps `<Analytics/>`
 * unmounted here. These specs therefore prove what *our* code stores, not what
 * Vercel's script would. That half rests on Vercel's documented mechanism — a
 * request hash, server side, no client storage — and on the deployed site, which
 * is where to look if the sentence is ever challenged.
 */
test.describe('the storage promise on the privacy page', () => {
  const keys = (page: Page) =>
    page.evaluate(() => ({
      cookie: document.cookie,
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));

  test('a visitor who never signs in leaves no trace at all', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeVisible();

    expect(await keys(page)).toEqual({ cookie: '', local: [], session: [] });
  });

  test('a signed-in player stores exactly one item, and still no cookies', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    // Waiting on the sign-out control rather than a timeout: it renders only
    // once restore has finished, which is also when the rotated renewal token
    // has been written back.
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    expect(await keys(page)).toEqual({
      cookie: '',
      local: ['lmntlz.renewal'],
      session: [],
    });
  });
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
