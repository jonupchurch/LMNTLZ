/**
 * 🔴 **Stage 4 offers a choice, and sends it** (021 T026).
 *
 * ### TL;DR
 *
 * The last stage of a rune costs 200 shards — the most expensive of the four —
 * and grants no stat points, because what it buys is a special ability. Until now
 * the screen said *"there is nothing to allocate"* and offered nothing to choose,
 * so the money bought a database column set to `null`.
 *
 * ### What these tests are careful about
 *
 * The pool a slot offers is **derived**, from the champion's two authored fields,
 * by the same function the server validates against. So the fixtures derive it too
 * rather than naming effect ids: a hardcoded id would pass while the screen offered
 * the wrong pool entirely, which is precisely the failure that matters here — an
 * effect the Forge offers and the commit refuses.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { effectsForSlot, poolOf } from '@lmntlz/sim/rules';
import { ForgeScreen } from '../../src/features/forge/ForgeScreen.js';
import { RUNES_WITH, SHARDS, requested, stubForge, sentBodies } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const forge = () => render(<ForgeScreen onUnauthenticated={() => {}} />);

/**
 * A champion whose **primary** slot has effects to offer.
 *
 * `RUNES_WITH` places its rune in the primary slot, and the catalog is still
 * filling — Water holds none until US2. Picking the champion from the catalog
 * rather than naming one keeps this test true as the pools fill.
 */
const HERO = getAllHeroes().find((h) => effectsForSlot(h.id, 'primary').length > 0)!;
const OFFERED = effectsForSlot(HERO.id, 'primary');

/** Open the Forge on a champion whose primary rune sits at stage 3. */
async function atStageFour(user: ReturnType<typeof userEvent.setup>) {
  stubForge({
    '/me/runes': RUNES_WITH(HERO.id, 3, { might: 20, luck: 15 }),
    '/me/shards': SHARDS,
  });

  forge();
  await screen.findByRole('radio', { name: /all 27/i });
  await user.click(screen.getByRole('button', { name: new RegExp(HERO.name, 'i') }));
}

describe('the stage-4 picker', () => {
  it('the fixture actually reaches a pool with something in it', () => {
    /* Without this the assertions below could pass against an empty list. */
    expect(OFFERED.length, 'no champion has a stocked primary pool').toBeGreaterThan(0);
    expect(poolOf(HERO.id, 'primary')).toBe(HERO.primary);
  });

  it('🔴 offers exactly the effects of this slot’s derived pool', async () => {
    const user = userEvent.setup();
    await atStageFour(user);

    for (const effect of OFFERED) {
      expect(
        screen.getByRole('button', { name: new RegExp(effect.name, 'i') }),
        `${effect.name} is in the ${HERO.primary} pool and was not offered`,
      ).toBeTruthy();
    }

    /* And nothing from another pool leaked in. */
    const buttons = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-utility'));
    expect(buttons).toHaveLength(OFFERED.length);
  });

  it('describes each effect before a shard is committed', async () => {
    const user = userEvent.setup();
    await atStageFour(user);

    for (const effect of OFFERED) {
      const button = screen.getByRole('button', { name: new RegExp(effect.name, 'i') });
      expect(
        button.textContent,
        `${effect.name} is offered with no description of what it does`,
      ).toContain(effect.description);
    }
  });

  it('🔴 choosing sends nothing — planning stays free', async () => {
    const user = userEvent.setup();
    await atStageFour(user);
    const before = requested().length;

    await user.click(screen.getByRole('button', { name: new RegExp(OFFERED[0]!.name, 'i') }));

    expect(requested()).toHaveLength(before);
  });

  it('is reversible until it is committed', async () => {
    const user = userEvent.setup();
    await atStageFour(user);

    const first = screen.getByRole('button', { name: new RegExp(OFFERED[0]!.name, 'i') });
    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');

    await user.click(first);
    expect(first, 'a choice cannot be taken back before committing').toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('committing stage 4', () => {
  it('🔴 sends the chosen effect id', async () => {
    const user = userEvent.setup();
    await atStageFour(user);

    await user.click(screen.getByRole('button', { name: new RegExp(OFFERED[0]!.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /commit|place|buy/i }));

    const sent = sentBodies().find((b) => 'utility' in b);
    expect(sent, 'the commit carried no utility effect').toBeDefined();
    expect(sent!['utility']).toBe(OFFERED[0]!.id);
  });

  it('🔴 refuses to commit with nothing chosen, and sends nothing', async () => {
    const user = userEvent.setup();
    await atStageFour(user);
    const before = requested().length;

    await user.click(screen.getByRole('button', { name: /commit|place|buy/i }));

    expect(await screen.findByText(/choose the utility effect/i)).toBeTruthy();
    expect(requested(), 'a refused commit still hit the network').toHaveLength(before);
  });
});
