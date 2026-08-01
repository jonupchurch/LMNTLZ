/**
 * Choosing an opponent and starting a fight, in a real browser (006 T065–T068).
 *
 * ### What only this level can prove
 *
 * `attack.test.tsx` asserts the requests: what is sent, what is not, and what the
 * screen does with each answer. It renders `AttackScreen` directly, so it cannot
 * see the thing that was actually broken for three features — that **no route in
 * the app reached the screen at all**. Every route it drives existed and was
 * tested; the app never called one.
 *
 * So this spec starts where a player starts: signed in, on the squad screen, with
 * nothing but the nav to click.
 */

import { expect, test } from '@playwright/test';
import { CANDIDATES, HEROES, mockApi, mockAttack, STANDING } from './fixtures.js';

test.describe('a player can reach an opponent from the squad screen', () => {
  test('navigates to Attack, scouts somebody, and starts the battle', async ({ page }) => {
    const starts: unknown[] = [];

    await mockApi(page);
    await mockAttack(page);
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/v1/battles')) {
        starts.push(request.postDataJSON());
      }
    });

    await page.goto('/');

    // Signed in, on the squads screen, with a way out of it.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.getByRole('button', { name: 'Matchmaking', exact: true }).click();

    await expect(page.getByLabel('Opponents')).toBeVisible();
    await page.getByLabel('Opponents').getByRole('button', { name: /Reyna/ }).click();

    // The scout panel is the screen the design is about: read the weaknesses.
    const panel = page.getByLabel('Scouting Reyna');
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel('Doors in this wall')).toBeVisible();
    await expect(panel.getByText(HEROES[0]!.name)).toBeVisible();

    await panel.getByRole('button', { name: /Attack Reyna/ }).click();

    await expect.poll(() => starts.length).toBe(1);
    const body = starts[0] as Record<string, unknown>;
    expect(body['opponentId']).toBe('acc_1');
    // The server decides the zone from the attack streak, so the client sends none.
    expect('zone' in body).toBe(false);

    /**
     * **And the battle screen is now on screen**, which is the whole point: before
     * this, `ResumeBattle` was the only route into it and only a player who was
     * *already* mid-battle could get there.
     */
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('shows the ambush odds and the bot flag, both served', async ({ page }) => {
    await mockApi(page);
    await mockAttack(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Matchmaking', exact: true }).click();

    // Neither is computed here: `perWin` and `cap` are text on the squad screen and
    // this is the current chance, straight from the server.
    await expect(page.getByText('14%')).toBeVisible();
    await expect(page.getByLabel('Opponents').getByText('bot')).toBeVisible();

    // Fixture sanity — the assertions above are about served values.
    expect(CANDIDATES.ambushChance).toBe(14);
    expect(STANDING.starter.active).toBe(false);
  });

  test('never renders the Hidden squad, only its streak', async ({ page }) => {
    /**
     * The payload has no seats for the Hidden zone at all, so there is nothing here
     * that could render one — and an empty array would still tell a scout the shape
     * of what is missing. Checked on the **serialised page text**, because that is
     * what actually reaches the player.
     */
    await mockApi(page);
    await mockAttack(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Matchmaking', exact: true }).click();
    await page.getByLabel('Opponents').getByRole('button', { name: /Reyna/ }).click();

    const panel = page.getByLabel('Scouting Reyna');
    const sealed = panel.getByLabel('Hidden six');

    // The streak is the one fact the payload carries, and it is disclosed.
    await expect(sealed.getByText('×9')).toBeVisible();

    /**
     * Six sealed placeholders are a **client-side constant** — every squad in
     * the game is six in 2 · 3 · 1 — so drawing them tells a scout nothing they
     * did not already know. What would be a leak is a champion inside one.
     */
    await expect(sealed.locator('[data-sealed-seat]')).toHaveCount(6);
    await expect(sealed.locator('[data-hero-portrait]')).toHaveCount(0);
    await expect(sealed.locator('[data-hero-marks]')).toHaveCount(0);
    for (const hero of HEROES) {
      await expect(sealed.getByText(hero.name, { exact: true })).toHaveCount(0);
    }

    // The six Visible champions are shown; the seventh champion is not.
    for (const hero of HEROES.slice(0, 6)) {
      await expect(panel.getByText(hero.name)).toBeVisible();
    }
    await expect(panel.getByText(HEROES[6]!.name)).toHaveCount(0);
  });

  /**
   * **The wall is six cards side by side, and only a layout engine can say so.**
   *
   * jsdom does no layout, so `attack.test.tsx` can prove every seat is in the
   * DOM in the right order and still be looking at six cards stacked on top of
   * each other, or six cards 12 pixels wide. The squad screen shipped exactly
   * that failure once — `HeroPortrait` used to hardcode `relative` and every
   * label was pushed below its card and clipped, with all the assertions green.
   */
  test('draws the wall as six cards in a row, with nothing clipped away', async ({ page }) => {
    await mockApi(page);
    await mockAttack(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Matchmaking', exact: true }).click();
    await page.getByLabel('Opponents').getByRole('button', { name: /Reyna/ }).click();

    const seats = page.getByLabel('Visible squad').locator('li');
    await expect(seats).toHaveCount(6);

    const boxes = [];
    for (let i = 0; i < 6; i += 1) {
      const box = await seats.nth(i).boundingBox();
      expect(box, `seat ${i} has no layout box at all`).not.toBeNull();
      expect(box!.width, `seat ${i} is too narrow to hold a portrait`).toBeGreaterThan(60);
      boxes.push(box!);
    }

    /* Side by side, not stacked: each seat starts to the right of the last and
       they all share a top edge. */
    for (let i = 1; i < 6; i += 1) {
      expect(boxes[i]!.x, `seat ${i} is not to the right of seat ${i - 1}`).toBeGreaterThan(
        boxes[i - 1]!.x,
      );
      expect(Math.abs(boxes[i]!.y - boxes[0]!.y), `seat ${i} wrapped onto another line`).toBeLessThan(2);
    }

    /**
     * The corner marks and the label strip both stay inside the card. The marks
     * are an emblem plus two Force badges — ~80px of content on a card this
     * narrow — so overflowing the card is the realistic failure, not a
     * hypothetical one.
     */
    const first = seats.nth(0);
    const marks = (await first.locator('[data-hero-marks]').boundingBox())!;
    expect(marks, 'the mark cluster has no box').not.toBeNull();
    expect(marks.x).toBeGreaterThanOrEqual(boxes[0]!.x - 1);
    expect(
      marks.x + marks.width <= boxes[0]!.x + boxes[0]!.width + 1,
      'the corner marks overflow the card',
    ).toBe(true);

    const name = (await first.getByText(HEROES[0]!.name).boundingBox())!;
    expect(name, 'the champion name renders with no box').not.toBeNull();
    expect(
      name.y + name.height <= boxes[0]!.y + boxes[0]!.height + 1,
      'the name is drawn below the card and clipped away',
    ).toBe(true);

    /**
     * **Nothing in the label strip is truncated.**
     *
     * The first build printed `OPEN · EARTH`, wider than a sixth of the panel,
     * and half the cards read `OPEN · EA…` — the one word here a player
     * actually needs. `truncate` renders an ellipsis and reports as perfectly
     * visible, so `scrollWidth` against `clientWidth` is the only evidence.
     *
     * **Measured after the real font loads.** In the fallback face the same
     * text is wider, so measuring early fails on a page that is fine a moment
     * later — which is how this check first accused a label that fit.
     *
     * **The champion's name is exempt and nothing else is.** The export
     * ellipses the name on this card too (`text-overflow:ellipsis` on exactly
     * that element), and a name is a label the portrait and emblem already
     * answer — `Auriel Dawnkeep` was never going to fit a sixth of the panel.
     * The reading is different: it is the whole point of the card, so it gets
     * the assertion.
     */
    await page.evaluate(() => document.fonts.ready);

    /**
     * **Clipped *or* wrapped**, because only one of the two is `scrollWidth`.
     * Text with `truncate` clips and reports a wider `scrollWidth`; text
     * without it silently wraps to a second line instead, which reports
     * nothing at all. A 13-character label walked straight through the first
     * version of this check for exactly that reason.
     */
    const bad = await seats.evaluateAll((lis) =>
      lis.flatMap((li, seat) =>
        [...li.querySelectorAll('[data-door-read] span')]
          .map((el) => {
            const line = parseFloat(getComputedStyle(el).lineHeight) || 0;
            if (el.scrollWidth > el.clientWidth + 1) {
              return `seat ${seat} clipped: "${el.textContent}"`;
            }
            if (line > 0 && el.getBoundingClientRect().height > line * 1.5) {
              return `seat ${seat} wrapped: "${el.textContent}"`;
            }
            return null;
          })
          .filter((problem): problem is string => problem !== null),
      ),
    );
    expect(bad, 'the Bane reading does not fit its card').toEqual([]);

    /* And the check is not passing because it selected nothing. */
    const reads = await seats.evaluateAll((lis) =>
      lis.flatMap((li) =>
        [...li.querySelectorAll('[data-door-read] span')].map((el) => el.textContent),
      ),
    );
    expect(reads.length, 'the fit check selected nothing').toBe(12);

    /**
     * **The same check over every label in the panel**, because this has now
     * bitten twice in two different columns — `OPEN · EA…` on the wall at 98px
     * and `MIDD…` in the sealed zone at 55px. Both read perfectly in the DOM.
     *
     * Anything allowed to ellipsis says so with `data-may-ellipsis` — currently
     * the champion's name and nothing else. Prose is excluded because it is
     * meant to wrap; what is checked is every uppercase micro-label, the class
     * of text that gets written once and never measured.
     */
    const labels = await page
      .getByLabel('Scouting Reyna')
      .evaluateAll((panels) =>
        panels.flatMap((panel) =>
          [...panel.querySelectorAll('span, p, div')]
            .filter((el) => {
              const style = getComputedStyle(el);
              return (
                style.textTransform === 'uppercase' &&
                el.children.length === 0 &&
                !el.hasAttribute('data-may-ellipsis') &&
                (el.textContent ?? '').trim().length > 0
              );
            })
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => `"${el.textContent}"`),
        ),
      );
    expect(labels, 'a micro-label is clipped somewhere in the panel').toEqual([]);

    // And the page itself does not scroll sideways to fit any of it.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the screen scrolls horizontally').toBeLessThanOrEqual(1);
  });

  /**
   * The dock is the last decision on the screen and it is drawn, not named —
   * three squad names chosen weeks ago are not something a player can pick from.
   */
  test('draws each attack squad as its six faces, and the fit against this wall', async ({
    page,
  }) => {
    await mockApi(page);
    await mockAttack(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Matchmaking', exact: true }).click();
    await page.getByLabel('Opponents').getByRole('button', { name: /Reyna/ }).click();

    const dock = page.getByRole('radiogroup', { name: 'Attack squad' });
    await expect(dock).toBeVisible();

    const vanguard = dock.getByRole('radio', { name: 'Vanguard' });
    await expect(vanguard.locator('[data-thumb]')).toHaveCount(6);
    await expect(vanguard.locator('[data-fit]')).toBeVisible();

    /* Picking a different squad re-reads the wall — the verdict belongs to the
       pairing, not to the squad. */
    const verdictOf = () => page.getByLabel('Scout readout').locator('[data-verdict]');
    await expect(verdictOf()).toBeVisible();

    await dock.getByRole('radio', { name: 'Second Wind' }).click();
    await expect(dock.getByRole('radio', { name: 'Second Wind' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(verdictOf()).toBeVisible();
  });
});
