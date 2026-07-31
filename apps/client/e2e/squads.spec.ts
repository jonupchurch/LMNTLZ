/**
 * The squad builder, end to end (T051–T052).
 *
 * Two things a component suite cannot reach: that the pieces are **wired
 * together into something a player can click**, and that the whole screen is
 * **usable from the keyboard**. The first was a real gap — the components were
 * complete and unit-tested while unreachable from the running app, which is
 * invisible in a component test and obvious the moment anybody tries.
 */

import { expect, test } from '@playwright/test';
import { HEROES, IDS, mockApi, rosterPayload, signedIn, THREE_SQUAD_PREVIEW } from './fixtures.js';

const nameOf = (id: string) => HEROES.find((h) => h.id === id)!.name;

test.describe('the screen loads and shows the whole roster', () => {
  test('renders all 27 champions with no locked state', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    /* By `data-hero`, not by the old `reach N` copy: 019 US2 replaced the card
       body with art plus name / Force / R / Bane / commitment. */
    const cards = page.locator('[data-hero]');
    await expect(cards).toHaveCount(27);

    // Nothing to collect is the competitive premise.
    await expect(page.getByText(/locked|recruit|unlock/i)).toHaveCount(0);
  });

  /**
   * **The card's label is ON the card**, which is a claim about layout and
   * therefore the one thing only this suite can make.
   *
   * `HeroPortrait` owns its `position`, and both call sites used to try to
   * override it from `className`. Tailwind emits `.absolute` before
   * `.relative`, and a CSS tie breaks on stylesheet order rather than on the
   * order of names in a `class` attribute — so the override lost, the portrait
   * took the whole card in normal flow, and the name, reach, Force and Bane
   * were pushed underneath it and clipped by `overflow-hidden`.
   *
   * Every one of those labels was in the DOM, in the right order, with the
   * right text. jsdom does no layout, so **every unit test passed** and the
   * cards shipped as bare illustrations. Bounding boxes are the only thing
   * that can tell the difference.
   */
  test('shows the name and reach ON the card rather than under it', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const card = page.locator('[data-hero]').first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box, 'the first champion card has no layout box at all').not.toBeNull();

    for (const label of [nameOf(IDS[0]!), 'R1']) {
      const inside = card.getByText(new RegExp(label, 'i')).first();
      await expect(inside).toBeVisible();

      const at = await inside.boundingBox();
      expect(at, `"${label}" renders with no box`).not.toBeNull();
      /* Inside the card's own rectangle. A label pushed below a clipped parent
         still reports as "visible" to Playwright, so the comparison is what
         carries the signal — not the visibility check above it. */
      expect(
        at!.y + at!.height <= box!.y + box!.height + 1,
        `"${label}" is drawn below the card and clipped away`,
      ).toBe(true);
      expect(at!.y).toBeGreaterThanOrEqual(box!.y - 1);
    }
  });

  /**
   * **The corner marks are in the corner, and the title card is below the art.**
   *
   * These are the two placement claims 019 makes about this card, and a browser
   * is the only thing that can check either. Every arrangement of these elements
   * produces the same DOM in the same order — the marks overlay the art by
   * absolute positioning and the strip is in normal flow, and a single wrong
   * `position` collapses them into one column that still passes every unit test
   * and every `toBeVisible()`.
   */
  test('puts the marks in the upper-left corner and the title card under the art', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');

    const card = page.locator('[data-hero]').first();
    const box = (await card.boundingBox())!;

    const marks = (await card.locator('[data-hero-marks]').boundingBox())!;
    expect(marks, 'the mark cluster has no box').not.toBeNull();

    /* Upper-left quadrant of the card, with a pixel of slack for rounding. */
    expect(marks.y).toBeLessThan(box.y + box.height / 2);
    expect(marks.x).toBeLessThan(box.x + box.width / 2);
    expect(marks.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(marks.y).toBeGreaterThanOrEqual(box.y - 1);

    /**
     * The name sits **below** the marks rather than beside them — that is the
     * difference between a title card under the art and a single stacked
     * column, and it is invisible to everything but a layout engine.
     */
    const name = (await card.getByText(nameOf(IDS[0]!)).first().boundingBox())!;
    expect(name.y).toBeGreaterThan(marks.y + marks.height);
    expect(name.y + name.height).toBeLessThanOrEqual(box.y + box.height + 1);

    /**
     * **The commitment badge does not cover the marks.**
     *
     * It sat in the top-right corner, and `Striking I,II` on a 140px card is
     * wide enough to run all the way back across the emblem and both Force
     * badges — so a champion on two attack squads lost the three things that
     * identify her, to a tag about where she happens to be. It reads perfectly
     * in the DOM either way; two rectangles are the only evidence.
     */
    const badged = page.locator('[data-hero]:has([data-commitment])').first();
    const badge = (await badged.locator('[data-commitment]').boundingBox())!;
    const theirMarks = (await badged.locator('[data-hero-marks]').boundingBox())!;
    const overlaps =
      badge.x < theirMarks.x + theirMarks.width &&
      badge.x + badge.width > theirMarks.x &&
      badge.y < theirMarks.y + theirMarks.height &&
      badge.y + badge.height > theirMarks.y;
    expect(overlaps, 'the commitment badge is drawn over the corner marks').toBe(false);

    /* Three rune tracks, drawn, in the title card beside the reach. */
    const pips = card.locator('[data-rune-slot]');
    await expect(pips).toHaveCount(3);
    const pip = (await pips.first().boundingBox())!;
    expect(pip.height, 'a rune pip with no height is not a pip').toBeGreaterThan(0);
    expect(pip.y).toBeGreaterThan(name.y);
    expect(pip.y + pip.height).toBeLessThanOrEqual(box.y + box.height + 1);
  });

  test('states the pool and the ambush chance', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    /* `12 / 12` became plain `12`: twelve stopped being the number of champions
       on defense the moment one could hold a seat in both zones. Twelve seats,
       6–12 people, and this line counts people. */
    await expect(page.getByText(/12 on defense · 15 left for 3 squads of 6/)).toBeVisible();
    // Served, never computed here.
    await expect(page.getByText(/\+2% per win, up to 90%/)).toBeVisible();
  });

  test('switches between the two defense zones', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await expect(page.getByRole('tab', { name: /Zone I\b/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: /Zone II/ }).click();
    await expect(page.getByRole('tab', { name: /Zone II/ })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('moving a champion who is in all three attack squads', () => {
  test('warns before anything commits, and names all three', async ({ page }) => {
    // **The independent test for US2.** The confirm is the one thing this
    // feature blocks, and truncating the list is how a player discovers the
    // third squad mid-battle.
    await mockApi(page);
    await page.goto('/');

    await page.getByRole('button', { name: new RegExp(nameOf(IDS[12]!)) }).click();
    await page.getByRole('button', { name: /Front seat 1/ }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    // Count first, then every name — never "and 2 others".
    await expect(dialog.getByText(/3 of your attack squads/)).toBeVisible();
    for (const name of ['Vanguard', 'Second Wind', 'Long Reach']) {
      await expect(dialog.getByText(name)).toBeVisible();
    }
    await expect(dialog.getByText(/other/i)).toHaveCount(0);

    // The sentence that makes the constraint legible.
    await expect(dialog.getByText(/14 champions left for 3 squads of 6/)).toBeVisible();
    // And the streak cost, before the commit.
    await expect(dialog.getByText(/hold streak of 14 days resets/)).toBeVisible();
  });

  test('cancel leaves the squad untouched', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const originalFront = nameOf(IDS[0]!);
    await expect(page.getByRole('button', { name: new RegExp(`Front seat 1: ${originalFront}`) })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(nameOf(IDS[12]!)) }).click();
    await page.getByRole('button', { name: /Front seat 1/ }).click();
    await page.getByRole('button', { name: /^Cancel$/ }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // Unchanged — the confirm is a gate, not a notice.
    await expect(page.getByRole('button', { name: new RegExp(`Front seat 1: ${originalFront}`) })).toBeVisible();
  });

  test('confirming places the champion', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const moved = nameOf(IDS[12]!);
    await page.getByRole('button', { name: new RegExp(moved) }).click();
    await page.getByRole('button', { name: /Front seat 1/ }).click();
    await page.getByRole('button', { name: new RegExp(`Move ${moved}`) }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(`Front seat 1: ${moved}`) })).toBeVisible();
  });

  test('no confirm at all for a champion in no attack squad', async ({ page }) => {
    // An empty warning dialog is worse than none.
    await mockApi(page, {
      preview: { heroId: IDS[26], evicts: [], poolAfter: { heroes: 14, squads: 3, seatsNeeded: 18 }, streakAtRisk: 0 },
    });
    await page.goto('/');

    await page.getByRole('button', { name: new RegExp(nameOf(IDS[26]!)) }).click();
    await page.getByRole('button', { name: /Front seat 1/ }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(IDS[26]!)}`) })).toBeVisible();
  });
});

test.describe('an incomplete zone says so (FR-011)', () => {
  test('reports that it cannot defend rather than defending short', async ({ page }) => {
    /* Rebuilt rather than mutated: the wire shape is `readonly` all the way
       down, which is the point of typing the fixture at all. */
    const base = rosterPayload();
    const payload: typeof base = {
      ...base,
      assignments: {
        ...base.assignments,
        defense: {
          ...base.assignments.defense,
          visible: {
            ...base.assignments.defense.visible,
            seats: base.assignments.defense.visible.seats.slice(0, 5),
            canDefend: false,
            reason: 'Your visible zone has 5 of 6 champions and cannot defend.',
          },
        },
      },
    };

    await mockApi(page, { roster: payload });
    await page.goto('/');

    await expect(page.getByText(/5 of 6 champions and cannot defend/)).toBeVisible();
  });
});

test.describe('keyboard only (T052)', () => {
  test('every control is reachable by Tab and shows a focus ring', async ({ page }) => {
    // **Mouse and keyboard are the only inputs**, so the focus ring is not an
    // accommodation — it is the sole indicator of where a keyboard player is.
    await mockApi(page);
    await page.goto('/');

    // Headless Chromium starts with focus on the document, not the body; one
    // click on a non-interactive area gives the page focus without activating
    // anything.
    await page.locator('main').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Tab');
    const first = page.locator(':focus');
    await expect(first).toBeVisible();

    const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline, 'the focused control has no outline — outline: none crept in').not.toBe('none');
  });

  test('a squad can be built without a pointer', async ({ page }) => {
    await mockApi(page, {
      preview: { heroId: IDS[26], evicts: [], poolAfter: { heroes: 14, squads: 3, seatsNeeded: 18 }, streakAtRisk: 0 },
    });
    await page.goto('/');

    // Select a champion, then a seat, entirely with the keyboard.
    await page.getByRole('button', { name: new RegExp(nameOf(IDS[26]!)) }).focus();
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: /Middle seat 1/ }).focus();
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('button', { name: new RegExp(`Middle seat 1: ${nameOf(IDS[26]!)}`) }),
    ).toBeVisible();
  });

  test('the eviction confirm is reachable and dismissable by keyboard', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await page.getByRole('button', { name: new RegExp(nameOf(IDS[12]!)) }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Front seat 1/ }).focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /^Cancel$/ }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('the squad actually saves', () => {
  /**
   * ### The gap this closes was found by using the site, not by a test
   *
   * Every component on this screen was built, unit-tested and reachable — and
   * nothing called `PUT /v1/squads/defense/:zone`. A player could compose a legal
   * squad, reload, and find it gone. `save.test.tsx` asserts the request's shape;
   * this asserts that a real browser, driving the real DOM, produces it at all.
   */
  test('sends the composed squad and reports what the save cost', async ({ page }) => {
    const puts: { url: string; body: unknown }[] = [];

    await mockApi(page);
    await page.route('**/v1/squads/defense/visible', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      puts.push({ url: route.request().url(), body: route.request().postDataJSON() });
      await route.fulfill({
        json: {
          holdStreak: 0,
          streakReset: true,
          evictedSquadIds: [],
          warnings: [
            {
              code: 'reach-1-back-seat',
              heroId: IDS[5],
              message: `${nameOf(IDS[5]!)} has reach 1 in the back seat.`,
            },
          ],
        },
      });
    });
    await page.goto('/');

    await page.getByRole('button', { name: /Set as defense, Zone I/ }).click();

    // The request happened, once, at the zone on screen.
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]!.url).toMatch(/\/v1\/squads\/defense\/visible$/);
    expect((puts[0]!.body as { seats: unknown[] }).seats).toHaveLength(6);

    // And the player is told the cost, and the warning that does not block it.
    await expect(page.getByText(/hold streak reset to 0/)).toBeVisible();
    await expect(page.getByText(/has reach 1 in the back seat/)).toBeVisible();
  });

  test('a refused save keeps the squad on screen', async ({ page }) => {
    await mockApi(page);
    await page.route('**/v1/squads/defense/visible', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            /* Was `409 hero_on_other_zone`, which the route no longer emits —
               a champion may stand in both zones. This is a refusal it does. */
            status: 422,
            json: {
              error: {
                code: 'duplicate-hero',
                message: 'Ossic is in this squad twice. A champion holds one seat per squad.',
              },
            },
          })
        : route.continue(),
    );
    await page.goto('/');

    await page.getByRole('button', { name: /Set as defense, Zone I/ }).click();

    await expect(page.getByRole('alert')).toContainText(/in this squad twice/);
    // Not a blank page with a sentence on it: the work is still there.
    await expect(page.getByLabel('defense squad formation')).toBeVisible();
    await expect(page.locator('[data-hero]')).toHaveCount(27);
  });
});

test.describe('the three attack squads are reachable and savable', () => {
  /**
   * `SquadBuilder` has taken a `kind: 'offense'` prop since T019 and was **never
   * rendered with it** — so there was no way to reach an attack squad from the
   * running app, and therefore no way to attack. Exactly the gap this file's header
   * describes, one feature later.
   */
  test('five tabs, and an attack squad saves to its own slot', async ({ page }) => {
    const puts: string[] = [];

    await mockApi(page);
    page.on('request', (request) => {
      if (request.method() === 'PUT') puts.push(request.url());
    });
    await page.goto('/');

    /**
     * **Scoped to the squad tablist.** The shell has its own nav and 019 US2
     * added a `Squad kind` tablist above this one, so an unscoped count picks
     * up both and would change again the next time a screen is added.
     *
     * Three rather than five since US2: the five squads sit behind a mode, so
     * the numbered chips show one side at a time. `Squad kind` is asserted
     * separately in `offense.test.tsx`.
     */
    await page.getByRole('tab', { name: /The Striking Six/i }).click();
    /* `exact` is load-bearing: Playwright matches an accessible name by
       SUBSTRING by default, so plain `'Squad'` also picks up the `Squad kind`
       tablist and counts 2 + 3 = 5. Testing Library's `getByRole` matches the
       full string, which is why `offense.test.tsx` agreed and this did not. */
    await expect(
      page.getByRole('tablist', { name: 'Squad', exact: true }).getByRole('tab'),
    ).toHaveCount(3);

    await page.getByRole('tab', { name: /Attack 2/ }).click();
    await page.getByRole('button', { name: /Save Attack 2/ }).click();

    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toMatch(/\/v1\/squads\/offense\/1$/);
    await expect(page.getByText(/ready to attack/)).toBeVisible();
  });

  test('a defending champion is refused before the save, and named', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await page.getByRole('tab', { name: /The Striking Six/i }).click();
    await page.getByRole('tab', { name: /Attack 1/ }).click();

    // IDS[0] defends the Visible zone in the fixture.
    await page
      .getByLabel('Champion roster')
      .getByRole('button', { name: new RegExp(nameOf(IDS[0]!)) })
      .click();
    await page.getByRole('button', { name: /Front seat 1/ }).first().click();

    await expect(page.getByRole('alert')).toContainText(/defending your Zone I and cannot attack/);
  });
});

test.describe('the preview is never skipped silently', () => {
  test('a failed eviction check changes nothing and says so', async ({ page }) => {
    // Routes its own mocks rather than using `mockApi`, so the session has to
    // be seeded explicitly — otherwise this lands on the landing page and fails
    // about the roster instead of about the preview.
    await signedIn(page);
    await page.route('**/v1/roster', (route) => route.fulfill({ json: rosterPayload() }));
    await page.route('**/v1/squads/defense/*/preview-move', (route) => route.abort());
    await page.goto('/');

    await page.getByRole('button', { name: new RegExp(nameOf(IDS[12]!)) }).click();
    await page.getByRole('button', { name: /Front seat 1/ }).click();

    // Placing anyway would commit a move whose cost was never shown.
    await expect(page.getByRole('alert')).toContainText(/Nothing was changed/);
    expect(THREE_SQUAD_PREVIEW.evicts).toHaveLength(3); // fixture sanity
  });
});
