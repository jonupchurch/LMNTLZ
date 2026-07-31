/**
 * **The fonts render, and they render with no network** (017 T013 · FR-001).
 *
 * ### Why this needs a browser and `tests/site/fonts.test.ts` is not enough
 *
 * The unit test reads source and proves the **wiring** — every family declared in
 * `base.css` has a face imported in `main.tsx`. That is the link that was missing
 * for six features and it is worth guarding. What it cannot do is prove the font
 * actually *renders*: jsdom neither fetches nor parses font files, so
 * `getComputedStyle` there reports the declared stack rather than the resolved
 * face, and an assertion against it would pass no matter what shipped.
 *
 * So the real claim is made here, against a real engine, by reading the
 * **`FontFaceSet`** — which faces the document actually registered, and whether
 * their files actually fetched.
 *
 * ### `document.fonts.check()` is the wrong instrument, and this suite proved it
 *
 * The first draft used `check('600 16px "Chakra Petch"')`. It reported **`false`
 * for a face we ship** (registered, not yet loaded, because nothing on the page had
 * used that weight) and **`true` for `"Comic Sans Nope"`, which does not exist**.
 * That is `check()` working as specified — it answers *"can this text be painted"*,
 * and the answer is yes for any family, because the fallback stack can always paint
 * it. As a test of whether **our** font shipped it is not merely weak, it is
 * inverted.
 *
 * It was caught by the anti-vacuity case below rather than by inspection, which is
 * the argument for writing one every time.
 *
 * So: **registration** is read from the set, and **loading** is forced with
 * `document.fonts.load()` and then confirmed by the face's own `status`.
 *
 * ### The blocked-network run is the Steam case, and it is the point
 *
 * `docs/tech-stack.md` puts the same static bundle inside Electron on Steam, loaded
 * **from disk**, where there may be no network at all. A webfont linked from Google
 * would fail there and reflow the whole interface — silently, in the build with the
 * least observability and the most expensive release process.
 *
 * Constitution XIX wants the third party gone regardless. **Blocking the two Google
 * hosts and asserting the fonts still render is how that promise gets kept rather
 * than merely stated**, and it fails loudly the day someone adds a convenient
 * `<link>`.
 */

import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

/** The nine faces the exports use. */
const FACES = [
  { family: 'Chakra Petch', weights: [500, 600, 700] },
  { family: 'Barlow', weights: [400, 500, 600, 700] },
  { family: 'JetBrains Mono', weights: [400, 500, 700] },
] as const;

const GOOGLE = ['**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**'];

/** `family|weight|status` for every face the document registered. */
async function registeredFaces(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((face) => `${face.family}|${face.weight}|${face.status}`);
  });
}

/** Force the file to fetch, then report the face's own status. */
async function loadFace(
  page: import('@playwright/test').Page,
  family: string,
  weight: number,
): Promise<string> {
  return page.evaluate(
    async ([f, w]) => {
      const loaded = await document.fonts.load(`${w as number} 16px "${f as string}"`);
      return loaded.length === 0 ? 'not-registered' : loaded[0]!.status;
    },
    [family, weight] as const,
  );
}

test.describe('the type stack', () => {
  test('registers every one of the nine faces', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const registered = await registeredFaces(page);
    expect(registered.length, 'document.fonts is empty — no @font-face shipped').toBeGreaterThan(0);

    for (const { family, weights } of FACES) {
      for (const weight of weights) {
        expect(
          registered.some((face) => face.startsWith(`${family}|${weight}|`)),
          `${family} ${weight} is not registered — its @font-face never shipped. Have: ${registered.join(', ')}`,
        ).toBe(true);
      }
    }
  });

  test('every face actually fetches its file', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    for (const { family, weights } of FACES) {
      for (const weight of weights) {
        expect(await loadFace(page, family, weight), `${family} ${weight} failed to load`).toBe(
          'loaded',
        );
      }
    }
  });

  /**
   * **The Steam case.** If this passes with the network blocked, the bundle is
   * genuinely self-contained; if it fails, a third party crept back in.
   */
  test('loads with Google Fonts blocked entirely', async ({ page }) => {
    const blocked: string[] = [];
    for (const pattern of GOOGLE) {
      await page.route(pattern, (route) => {
        blocked.push(route.request().url());
        return route.abort();
      });
    }

    await mockApi(page);
    await page.goto('/');

    // Nothing should even have been attempted.
    expect(blocked, `the client requested Google Fonts: ${blocked.join(', ')}`).toHaveLength(0);

    for (const { family, weights } of FACES) {
      expect(
        await loadFace(page, family, weights[0]),
        `${family} did not load offline — it is not self-hosted`,
      ).toBe('loaded');
    }
  });

  /**
   * **Anti-vacuity, and it earned its place.** This case is what exposed
   * `document.fonts.check()` as inverted for this purpose — it answered `true` for
   * a family that does not exist. `load()` on an unregistered family resolves to an
   * empty list, which is a real distinction rather than an agreeable one.
   */
  test('a font we do not ship is absent, so the assertions discriminate', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const registered = await registeredFaces(page);
    expect(registered.some((face) => face.startsWith('Comic Sans Nope|'))).toBe(false);
    expect(
      await loadFace(page, 'Comic Sans Nope', 400),
      'an unshipped family reported as loaded — these assertions prove nothing',
    ).toBe('not-registered');
  });

  /**
   * **The wiring, end to end** (T014): token → stylesheet → element → loaded face.
   *
   * The four tests above prove the *files* ship. This one proves they are the
   * files the interface actually asks for — which is the half that was missing.
   * `base.css` could declare `--font-sans` and nothing could use it, and every
   * assertion above would still pass.
   *
   * A browser reports the declared **stack** from `getComputedStyle`, not the face
   * it resolved to, so the claim is made in two halves: the element's stack begins
   * with the intended family, **and** that family is loaded. Together those are
   * the only thing that can be true when the text is really drawn in Barlow.
   */
  test('the interface asks for the fonts it ships', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const bodyStack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyStack, `body renders in ${bodyStack}, not the declared sans`).toMatch(/^["']?Barlow/);
    expect(bodyStack, 'the fallback is still there, as it should be').toMatch(/system-ui|sans-serif/);

    expect(await loadFace(page, 'Barlow', 400)).toBe('loaded');
  });

  /**
   * `vite.config.ts` sets `base: './'` because the Steam build loads from disk,
   * where a root-absolute path resolves against the filesystem root and 404s. The
   * font URLs are subject to that exactly as the favicon is.
   */
  test('serves the font files from our own origin, relatively', async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });

    await mockApi(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    expect(fontRequests.length, 'no font file was requested at all').toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(url, `${url} is not served from our own origin`).toContain('localhost');
      expect(url).toMatch(/\.woff2?(\?|$)/);
    }
  });
});
