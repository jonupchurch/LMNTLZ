/**
 * A battle in a real browser (007 T051).
 *
 * ### What only this level can check
 *
 * The component suite renders `BattleScreen` directly, so it cannot tell whether
 * the screen is **reachable**. That is the gap feature 006 hit — components
 * complete, unit-tested, and unreachable from the running app — and it is
 * invisible in a component test by construction.
 *
 * The route under test is **resume**, not attack. There is no attack button
 * anywhere yet: choosing an opponent needs the candidate set, which is feature
 * 009. `GET /v1/battles/open` needs no opponent and no id, and the
 * one-at-a-time rule makes its answer one battle or none — so a player who
 * reloads lands back in their fight, which is a requirement in its own right.
 *
 * ### The connection kill is the reason this file exists
 *
 * A retry that double-advances a battle produces a **plausible** result. The
 * response looks right, the board looks right, and the only evidence is a second
 * row in the action log. `idempotency.test.ts` counts those rows against a real
 * database; what it cannot do is drop a socket in a real browser and watch what
 * the client does next. That is here.
 */

import { expect, test, type Page } from '@playwright/test';
import { signedIn } from './fixtures.js';

const HERO_IDS = Array.from({ length: 27 }, (_, i) => `h${String(i + 1).padStart(2, '0')}`);

const SEATS = [
  ['front', 0],
  ['front', 1],
  ['middle', 0],
  ['middle', 1],
  ['middle', 2],
  ['back', 0],
] as const;

const ROW_OF = {
  attacker: { front: 3, middle: 2, back: 1 },
  defender: { front: 4, middle: 5, back: 6 },
} as const;

interface Hero {
  heroId: string;
  instanceId: string;
  side: 'attacker' | 'defender';
  row: number;
  hp: number;
  maxHp: number;
  accumulator: number;
  cooldowns: Record<string, number>;
  statuses: unknown[];
  statMods: Record<string, number>;
  reachMod: number;
}

function squad(side: 'attacker' | 'defender', ids: readonly string[]): Hero[] {
  return SEATS.map(([row, index], i) => ({
    heroId: ids[i]!,
    instanceId: `${side === 'attacker' ? 'a' : 'd'}-${row}-${index}`,
    side,
    row: ROW_OF[side][row],
    hp: 1250,
    maxHp: 1250,
    // The front-line attacker is up, so the screen has a choice to present.
    accumulator: side === 'attacker' && i === 0 ? 99 : 0,
    cooldowns: {},
    statuses: [],
    statMods: {},
    reachMod: 0,
  }));
}

const state = (turnOfInstance: string | null, defenderHp = 1250) => ({
  heroes: [
    ...squad('attacker', HERO_IDS.slice(0, 6)),
    ...squad('defender', HERO_IDS.slice(6, 12)).map((h) =>
      h.instanceId === 'd-front-0' ? { ...h, hp: defenderHp } : h,
    ),
  ],
  heroTurn: 1,
  turnOfInstance,
  engineVersion: 'e2e',
  contentVersion: 'e2e',
});

const BATTLE_ID = 'e2e-battle';

/** Put the player back into a battle in progress, as a reload would. */
async function inBattle(page: Page): Promise<void> {
  await signedIn(page);

  await page.route('**/v1/battles/open', (route) =>
    route.fulfill({ json: { battleId: BATTLE_ID, startedAt: '2026-07-29T00:00:00.000Z', expiresAt: '2026-07-30T00:00:00.000Z' } }),
  );

  await page.route(`**/v1/battles/${BATTLE_ID}`, (route) =>
    route.fulfill({
      json: {
        battleId: BATTLE_ID,
        zone: 'visible',
        sequence: 4,
        state: state('a-front-0'),
        conclusion: null,
        startedAt: '2026-07-29T00:00:00.000Z',
        concludedAt: null,
      },
    }),
  );
}

test.describe('a battle is reachable at all', () => {
  test('a player mid-battle lands on the battle, not the squad builder', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Battle board' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Turn order' })).toBeVisible();

    /**
     * **The builder is not merely hidden, it is not rendered.** With one battle
     * open a player cannot start another, so a builder whose only outcome is
     * `409 battle_already_open` would be the one screen they cannot use.
     */
    await expect(page.getByRole('region', { name: /squad formation/ })).toHaveCount(0);
  });

  /**
   * **The axis runs left to right, and only a layout engine can say so.**
   *
   * `battlefield.test.tsx` proves the six columns are in the DOM in order 1→6
   * with the seam between 3 and 4. jsdom does no layout, so all of that is true
   * of six columns stacked on top of each other, or six columns 8 pixels wide.
   * The direction is the thing `board.ts` warns about: getting it backwards
   * inverts every reach test while still looking plausible.
   */
  test('draws the six rows side by side, 1 to 6, with the seam in the middle', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');

    const field = page.getByRole('region', { name: 'Battle board' });
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const marks = await field
      .locator('[data-row], [data-seam]')
      .evaluateAll((els) =>
        els.map((el) => ({
          key: el.hasAttribute('data-seam') ? 'seam' : el.getAttribute('data-row'),
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
          w: Math.round(el.getBoundingClientRect().width),
        })),
      );

    expect(marks.map((m) => m.key)).toEqual(['1', '2', '3', 'seam', '4', '5', '6']);

    for (let i = 1; i < marks.length; i += 1) {
      expect(marks[i]!.x, `${marks[i]!.key} is not right of ${marks[i - 1]!.key}`).toBeGreaterThan(
        marks[i - 1]!.x,
      );
      expect(Math.abs(marks[i]!.y - marks[0]!.y), `${marks[i]!.key} wrapped`).toBeLessThan(2);
    }

    /* Wide enough to hold a portrait, not a sliver. The seam is deliberately
       narrow and is excluded. */
    for (const mark of marks.filter((m) => m.key !== 'seam')) {
      expect(mark.w, `row ${mark.key} is ${mark.w}px wide`).toBeGreaterThan(80);
    }
  });

  /**
   * The rail cards are 64px and carry a name, a Force, a row, a reach and a
   * health bar. An overlay landed straight on top of all five — every fact
   * present in the DOM and none of them readable, which is invisible to jsdom
   * by construction.
   */
  test('never draws a rail card’s overlay on top of its own label', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const cards = await page
      .getByRole('region', { name: 'Engine defense' })
      .evaluate((rail) =>
        [...rail.querySelectorAll('[data-combatant]')]
          .filter((card) => card.querySelector('[data-state="down"], [data-state="unreachable"]'))
          .map((card) => ({
            id: card.getAttribute('data-combatant'),
            labelled:
              (card.querySelector('[data-may-ellipsis]') as HTMLElement | null)?.offsetParent !==
              undefined
                ? (card.querySelector('[data-may-ellipsis]') as HTMLElement | null)?.offsetParent !==
                  null
                : false,
          })),
      );

    /**
     * **The guard, and it is not decoration.** With every defender in reach and
     * standing there is no overlay anywhere, and the filter below returns `[]`
     * whether the bug is present or not — a green test asserting nothing.
     */
    expect(cards.length, 'no rail card carries an overlay; this asserts nothing').toBeGreaterThan(
      0,
    );
    expect(
      cards.filter((c) => c.labelled).map((c) => c.id),
      'a rail overlay is drawn over the card’s own label',
    ).toEqual([]);
  });

  /**
   * **The target read must not resize, ever.**
   *
   * Jon, with the screen open: *"there's a client side stutter when the mouse
   * goes in and out of the cards due to the flyout below appearing and
   * disappearing"* — and then *"same with the hero cards"*.
   *
   * Two causes, one symptom. The read cleared on `mouseleave`, so crossing the
   * 6px gap between two cards collapsed the panel and re-expanded it; and the
   * panel sized to its content, so a priced read, an out-of-reach read and the
   * placeholder were three different heights. Everything below it moved each
   * time.
   *
   * This is invisible to jsdom twice over — it does no layout, and it has no
   * cursor. Only a browser can hover six cards in a row and measure the box.
   */
  test('the target read never changes size as the cursor crosses the board', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const panel = page.getByRole('region', { name: 'Target read' });
    const heightNow = async () => Math.round((await panel.boundingBox())!.height);

    const heights = [await heightNow()];
    const cards = page.getByLabel('Battle board').locator('[data-combatant]');
    const count = await cards.count();
    expect(count).toBe(12);

    for (let i = 0; i < count; i += 1) {
      await cards.nth(i).hover();
      heights.push(await heightNow());
    }

    /**
     * And the read is **sticky** — moving off a card onto the panel between
     * them must not empty it, which is what produced the flicker.
     */
    await panel.hover();
    heights.push(await heightNow());

    expect(new Set(heights).size, `the panel resized: ${heights.join(', ')}`).toBe(1);
    await expect(panel.locator('[data-tier]')).toHaveCount(1);
  });

  /**
   * The power detail sits under the striking six and has the identical failure
   * mode — a panel fed by hover, with content of three different shapes. It was
   * built after the target read was fixed, so it inherited the rule; this is
   * what stops it drifting back.
   */
  test('the power detail never changes size as the cursor crosses the dock', async ({ page }) => {
    await inBattle(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const panel = page.getByRole('region', { name: 'Power detail' });
    const heightNow = async () => Math.round((await panel.boundingBox())!.height);

    const cards = page.getByRole('region', { name: 'Your move' }).locator('[data-power]');
    const count = await cards.count();
    expect(count, 'no powers were offered, so this asserts nothing').toBeGreaterThan(1);

    const heights: number[] = [];
    for (let i = 0; i < count; i += 1) {
      await cards.nth(i).hover();
      heights.push(await heightNow());
    }

    /* Sticky, like the target read: moving off the dock keeps the last power. */
    await panel.hover();
    heights.push(await heightNow());

    expect(new Set(heights).size, `the panel resized: ${heights.join(', ')}`).toBe(1);
    await expect(panel.locator('[data-power-detail]')).toHaveCount(1);
  });

  test('a player with no battle still reaches their squads', async ({ page }) => {
    await signedIn(page);
    await page.route('**/v1/roster', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/');

    // `signedIn` answers `204`, so the shell must fall through to the builder.
    await expect(page.getByRole('region', { name: 'Battle board' })).toHaveCount(0);
  });
});

test.describe('taking a turn', () => {
  test('sends the intent and renders the board the server returned', async ({ page }) => {
    await inBattle(page);

    const sent: unknown[] = [];
    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        json: {
          sequence: 4,
          // 1 HP is a number no local arithmetic here produces.
          packet: { events: [], state: state('a-front-1', 1), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();

    const target = page.getByRole('button', { name: /, targetable$/ }).first();
    await target.click();

    await expect(page.getByRole('button', { name: /1 of 1250/ })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ sequence: 4, actorInstanceId: 'a-front-0' });
  });

  test('the wind-up is on screen before the response arrives', async ({ page }) => {
    /**
     * **The visible half of US3.** The request and the wind-up leave together,
     * so a response held back must still find the screen in motion — and it
     * must be at a *named* phase rather than a frozen frame.
     */
    await inBattle(page);

    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      await held;
      await route.fulfill({
        json: {
          sequence: 4,
          packet: { events: [], state: state('a-front-1', 900), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();

    const resolving = page.getByRole('region', { name: 'Resolving' });
    await expect(resolving).toBeVisible();
    // Past the wind-up with nothing back: a held pose, not a stalled motion.
    await expect(resolving).toHaveAttribute('data-phase', 'holding');

    release!();
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();
  });
});

test.describe('a dropped connection does not double-advance', () => {
  test('a retry after a killed request sends the SAME sequence', async ({ page }) => {
    /**
     * **The assertion is the sequence, not the board.** A double-advance leaves
     * a perfectly coherent battle on screen; the only evidence is a second row
     * under `(battle_id, sequence)`. What the *client* must never do is number
     * its retry differently — a retry that advanced to 5 would be a new action
     * the server has no reason to reject.
     */
    await inBattle(page);

    const sequences: number[] = [];
    let first = true;

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, async (route) => {
      sequences.push((JSON.parse(route.request().postData() ?? '{}') as { sequence: number }).sequence);

      if (first) {
        first = false;
        // The socket dies with the request in flight — the server may well have
        // committed it, and the client cannot tell.
        await route.abort('connectionreset');
        return;
      }

      await route.fulfill({
        json: {
          sequence: 4,
          packet: { events: [], state: state('a-front-1', 700), conclusion: null },
          nextSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();

    const target = page.getByRole('button', { name: /, targetable$/ }).first();
    await target.click();

    // The failure surfaces, and the screen returns to a state that can retry.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();

    await page.getByRole('button', { name: /, targetable$/ }).first().click();
    await expect(page.getByRole('button', { name: /700 of 1250/ })).toBeVisible();

    expect(sequences).toEqual([4, 4]);
  });

  test('a 409 resynchronises without showing the player an error', async ({ page }) => {
    /**
     * The server's history and the client's disagree — the killed request *did*
     * commit. The contract's answer is to re-read, and re-reading is a complete
     * repair because state is re-derived from the log on every call.
     */
    await inBattle(page);

    let resynced = false;
    await page.route(`**/v1/battles/${BATTLE_ID}`, (route) => {
      const body = {
        battleId: BATTLE_ID,
        zone: 'visible',
        sequence: resynced ? 5 : 4,
        state: state(resynced ? 'a-middle-0' : 'a-front-0'),
        conclusion: null,
        startedAt: '2026-07-29T00:00:00.000Z',
        concludedAt: null,
      };
      return route.fulfill({ json: body });
    });

    await page.route(`**/v1/battles/${BATTLE_ID}/act`, (route) => {
      resynced = true;
      return route.fulfill({
        status: 409,
        json: {
          error: { code: 'sequence_gap', message: 'behind' },
          currentSequence: 5,
        },
      });
    });

    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();

    // A different champion is up, and no error was shown for something the
    // client fixed on its own.
    await expect(page.getByRole('region', { name: 'Your move' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('the result', () => {
  /** What the concluding response now carries — `specs/GAPS.md` §2c. */
  const SETTLEMENT = {
    winner: 'attacker',
    won: true,
    shards: 42,
    shardsEarned: 42,
    cappedAt: null,
    ratingDelta: 18,
    ratingBefore: 1180,
    ratingAfter: 1198,
    attackStreak: 7,
    holdStreak: 0,
    turnCount: 96,
    zone: 'visible',
  } as const;

  const concludeWith = (page: Page, settlement?: typeof SETTLEMENT) =>
    page.route(`**/v1/battles/${BATTLE_ID}/act`, (route) =>
      route.fulfill({
        json: {
          sequence: 4,
          packet: {
            events: [],
            state: state(null),
            conclusion: { winner: 'attacker', reason: 'wipe' },
          },
          nextSequence: 5,
          ...(settlement ? { settlement } : {}),
        },
      }),
    );

  const finish = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Battle board' }).waitFor();
    await page.getByRole('button', { name: /, targetable$/ }).first().click();
    await expect(page.getByRole('region', { name: 'Result' })).toBeVisible();
  };

  test('shows the outcome and stops asking for moves', async ({ page }) => {
    await inBattle(page);
    await concludeWith(page, SETTLEMENT);
    await finish(page);

    await expect(page.getByText(/victory/i).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your move' })).toHaveCount(0);
  });

  /**
   * **The result screen must not be terminal**, and it has been once: the shell
   * hides the tab bar while a battle is open and did not give it back when the
   * battle ended, so the only way off this screen was reloading the browser.
   * A screen that stops asking for moves and offers no exit is a dead end.
   */
  test('always offers a way off the screen', async ({ page }) => {
    await inBattle(page);
    await concludeWith(page, SETTLEMENT);
    await finish(page);

    const out = page.getByRole('region', { name: 'Result' }).getByRole('button');
    await expect(out, 'the result screen has no way out of it').not.toHaveCount(0);
  });

  /**
   * **The regression this locks down.** For four features a battle ended, paid
   * shards, moved the rating — and the screen said `Victory` and nothing else,
   * because `settleAndRecord` read one field of the settlement and discarded the
   * rest. Asserting the word alone is what let that ship: `Victory` was present
   * and correct the entire time.
   */
  test('says what the battle actually paid', async ({ page }) => {
    await inBattle(page);
    await concludeWith(page, SETTLEMENT);
    await finish(page);

    const result = page.getByRole('region', { name: 'Result' });
    await expect(result).toContainText('+18');
    await expect(result, 'the new rating is not shown').toContainText('1198');
    await expect(result, 'the shards are not shown').toContainText('42');
    await expect(result, 'the streak that drives ambush odds is not shown').toContainText('7');
  });

  test('shows the six who fought, and which of them fell', async ({ page }) => {
    await inBattle(page);
    await concludeWith(page, SETTLEMENT);
    await finish(page);

    // `state(null)` leaves the attacker's six on the board, so the recap has
    // something real to draw. Without this the grid could be empty and every
    // assertion above would still pass.
    await expect(page.locator('[data-recap]')).toHaveCount(6);
  });

  /**
   * A battle somebody else already settled — a reload, or a resumed fight that
   * had finished. **The amounts are unknowable, and zeroes would be a lie**: a
   * capped-out player genuinely earns 0, so `0 shards` cannot be distinguished
   * from "we don't know".
   */
  test('a battle with no settlement says so rather than showing zeroes', async ({ page }) => {
    await inBattle(page);
    await concludeWith(page);
    await finish(page);

    const result = page.getByRole('region', { name: 'Result' });
    await expect(result).toContainText(/already settled/i);
    await expect(result, 'invented a zero payout').not.toContainText('+0');
  });
});
