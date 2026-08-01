/**
 * The battlefield, the rails and the read (019).
 *
 * ### What these assert that `battleScreen.test.tsx` does not
 *
 * That file is about the *contract* — one request per choice, the offered set
 * equal to the rules' own answer, the board coming from the response. These are
 * about what the screen actually shows, which was the gap: twelve champions
 * were twelve bordered boxes, the axis every targeting rule is written along
 * was drawn top-to-bottom, and the two questions a player asks constantly —
 * *how is my squad* and *what will this do* — had no answer anywhere.
 *
 * ### Every expected value is computed from the rules, never written down
 *
 * Effectiveness comes from `damagePreview`, reach from `legalTargets`,
 * distance from `distance`. A literal `super-effective` here would keep passing
 * after the roster's authored types moved and would then be asserting something
 * nothing produces.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getHero } from '@lmntlz/content';
import { availablePowers, damagePreview, distance, legalTargets } from '@lmntlz/sim/rules';
import { BattleScreen } from '../../src/features/battle/BattleScreen.js';
import { TIER_LABEL, TIER_OF } from '../../src/features/battle/read.js';
import { setSessionToken } from '../../src/lib/api.js';
import { board, started } from './fixtures.js';

beforeEach(() => {
  setSessionToken('test-session');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionToken(null);
});

const nameOf = (heroId: string) => getHero(heroId).name;

/** The power the screen defaults to — first usable, matching `BattleScreen`. */
const defaultPower = (state = board()) => {
  const up = state.turnOfInstance!;
  return availablePowers(state, up).filter(
    (p) => legalTargets(state, up, p.id).candidates.length > 0,
  )[0]!;
};

describe('the axis is on screen, left to right', () => {
  it('draws all six rows as columns in order, occupied or not', () => {
    render(<BattleScreen started={started()} />);

    const field = screen.getByRole('region', { name: 'Battle board' });
    const columns = [...field.querySelectorAll('[data-row]')];

    /**
     * **1 → 6, the direction the engine numbers them.** `board.ts` warns that
     * getting this backwards inverts every reach test while still looking
     * plausible, so the order is asserted rather than the count.
     */
    expect(columns.map((c) => c.getAttribute('data-row'))).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(columns.map((c) => c.getAttribute('data-side'))).toEqual([
      'attacker',
      'attacker',
      'attacker',
      'defender',
      'defender',
      'defender',
    ]);
  });

  it('keeps an emptied row as a column, because distance counts across it', () => {
    /**
     * Reach is a count of *occupied* rows crossed, so a cleared row is what
     * opens the back seat's range later in a battle. A column that vanished
     * with its last champion would hide the mechanic at the moment it starts
     * to matter.
     */
    const base = board();
    const emptied = {
      ...base,
      heroes: base.heroes.filter((h) => h.row !== 5),
    };

    render(<BattleScreen started={started({ packet: { events: [], state: emptied, conclusion: null } })} />);

    const column = screen.getByRole('region', { name: 'Battle board' }).querySelector('[data-row="5"]');
    expect(column, 'row 5 lost its column when it emptied').not.toBeNull();
    expect(column!.textContent).toContain('nothing to cross');
  });

  it('puts the contact seam between the two front rows and nowhere else', () => {
    render(<BattleScreen started={started()} />);

    const field = screen.getByRole('region', { name: 'Battle board' });
    const marks = [...field.querySelectorAll('[data-row],[data-seam]')].map((el) =>
      el.hasAttribute('data-seam') ? 'seam' : el.getAttribute('data-row'),
    );

    expect(marks).toEqual(['1', '2', '3', 'seam', '4', '5', '6']);
  });
});

describe('the rails read, the board aims', () => {
  it('gives each champion exactly one control, on the board', () => {
    /**
     * **The export makes its rail cards clickable too, and following it gave
     * every hero two buttons with the same accessible name** — twelve heroes,
     * twenty-four controls, and no way for a screen reader or a test to tell
     * the pair apart. `getByRole` throwing on the duplicate is how it surfaced.
     */
    const state = board();
    render(<BattleScreen started={started()} />);

    for (const hero of state.heroes) {
      const found = screen.getAllByRole('button', {
        name: new RegExp(`^${nameOf(hero.heroId)},`),
      });
      expect(found, `${hero.instanceId} has ${found.length} controls`).toHaveLength(1);

      /* And it is the board's, not the rail's. */
      expect(found[0]!.closest('[data-row]'), `${hero.instanceId}'s control is not on the board`)
        .not.toBeNull();
    }
  });

  it('names both sides for who drives them', () => {
    render(<BattleScreen started={started()} />);

    // The design's central asymmetry, stated rather than implied.
    expect(
      within(screen.getByRole('region', { name: 'The striking six' })).getByText(
        /you command these/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Engine defense' })).getByText(
        /the engine runs these/i,
      ),
    ).toBeInTheDocument();
  });

  it('counts the standing, not the seated', () => {
    const base = board();
    const felled = {
      ...base,
      heroes: base.heroes.map((h) => (h.instanceId === 'd-front-0' ? { ...h, hp: 0 } : h)),
    };

    render(<BattleScreen started={started({ packet: { events: [], state: felled, conclusion: null } })} />);

    const rail = screen.getByRole('region', { name: 'Engine defense' });
    expect(within(rail).getByText(/5 of 6 standing/i)).toBeInTheDocument();
    expect(within(rail).getByText(/returned to the shard/i)).toBeInTheDocument();
  });
});

describe('out of reach is drawn, not omitted', () => {
  it('marks every unreachable enemy with how far away it is', () => {
    const state = board();
    const up = state.turnOfInstance!;
    const power = defaultPower(state);
    const legal = new Set(legalTargets(state, up, power.id).candidates);
    const actor = state.heroes.find((h) => h.instanceId === up)!;

    render(<BattleScreen started={started()} />);

    const enemies = state.heroes.filter((h) => h.side === 'defender');
    const beyond = enemies.filter((h) => !legal.has(h.instanceId));
    expect(beyond.length, 'every enemy is reachable, so this asserts nothing').toBeGreaterThan(0);

    for (const hero of beyond) {
      const card = document.querySelector(`[data-row] [data-combatant="${hero.instanceId}"]`)!;
      expect(card.getAttribute('aria-label'), hero.instanceId).toContain('out of reach');

      // The distance, from the rules rather than from a literal.
      const rows = distance(state, actor.row, hero.row);
      expect(card.textContent, hero.instanceId).toContain(
        `${rows} ${rows === 1 ? 'row' : 'rows'} away`,
      );
    }
  });

  /**
   * **The card is hoverable and not clickable, and both halves matter.**
   *
   * It stopped being `disabled` so that hovering it would explain itself; the
   * cost of that is that nothing but a guard stops the click. A click that sent
   * an intent here would be refused by the server with `illegal_target` — a
   * round trip, an error banner, and a player told off for clicking something
   * the screen offered.
   */
  it('sends nothing when an unreachable enemy is clicked', async () => {
    const state = board();
    const up = state.turnOfInstance!;
    const legal = new Set(legalTargets(state, up, defaultPower(state).id).candidates);
    const beyond = state.heroes.find((h) => h.side === 'defender' && !legal.has(h.instanceId))!;

    render(<BattleScreen started={started()} />);
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(beyond.heroId)},`) }),
    );

    const acts = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes('/act'));
    expect(acts, 'an illegal intent was sent').toHaveLength(0);
  });

  it('never hatches one of your own, because an ally is not a missed target', () => {
    const state = board();
    render(<BattleScreen started={started()} />);

    for (const hero of state.heroes.filter((h) => h.side === 'attacker')) {
      const card = document.querySelector(`[data-row] [data-combatant="${hero.instanceId}"]`)!;
      expect(card.getAttribute('aria-label'), hero.instanceId).not.toContain('out of reach');
    }
  });
});

describe('the target read', () => {
  it('says nothing until something is hovered', () => {
    render(<BattleScreen started={started()} />);
    expect(
      within(screen.getByRole('region', { name: 'Target read' })).getByText(/hover a defender/i),
    ).toBeInTheDocument();
  });

  it('reports the tier the shared rules report, for the power actually chosen', async () => {
    const state = board();
    const up = state.turnOfInstance!;
    const power = defaultPower(state);
    const target = legalTargets(state, up, power.id).candidates[0]!;
    const victim = state.heroes.find((h) => h.instanceId === target)!;

    render(<BattleScreen started={started()} />);
    await userEvent.hover(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(victim.heroId)},`) }),
    );

    const panel = within(screen.getByRole('region', { name: 'Target read' }));

    /**
     * **Off `damagePreview`, which already resolved the dual-type rule.** A
     * label computed beside it from `power.types[0]` would disagree with it on
     * exactly the powers that take the better of their two types.
     */
    const preview = damagePreview(state, up, power.id, target);
    const tier = TIER_OF.get(preview.typeMultiplier)!;

    expect(panel.getByText(TIER_LABEL[tier])).toBeInTheDocument();
    expect(
      panel.getByText(new RegExp(`${Math.round(preview.hitProbability * 100)}%`)),
    ).toBeInTheDocument();

    /* And the defender's doors, which are free information either way. */
    const hero = getHero(victim.heroId);
    expect(panel.getByText(hero.bane)).toBeInTheDocument();
    expect(panel.getByText(hero.fault)).toBeInTheDocument();
  });

  it('prices nothing it cannot reach, and says the distance instead', async () => {
    const state = board();
    const up = state.turnOfInstance!;
    const power = defaultPower(state);
    const legal = new Set(legalTargets(state, up, power.id).candidates);
    const beyond = state.heroes.find((h) => h.side === 'defender' && !legal.has(h.instanceId))!;

    render(<BattleScreen started={started()} />);
    await userEvent.hover(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(beyond.heroId)},`) }),
    );

    const panel = within(screen.getByRole('region', { name: 'Target read' }));
    expect(panel.getByText(/out of reach/i)).toBeInTheDocument();

    /* A damage number beside "out of reach" would be a promise the engine
       refuses, so there must not be one. */
    expect(panel.queryByText(/to land/i)).toBeNull();
  });
});
