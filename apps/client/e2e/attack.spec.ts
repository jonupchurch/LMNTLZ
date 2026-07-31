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
    await expect(panel.getByText(/What answers this squad/)).toBeVisible();
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
    await expect(panel.getByText(/9 hidden/)).toBeVisible();

    // The six Visible champions are shown; the seventh champion is not.
    for (const hero of HEROES.slice(0, 6)) {
      await expect(panel.getByText(hero.name)).toBeVisible();
    }
    await expect(panel.getByText(HEROES[6]!.name)).toHaveCount(0);
  });
});
