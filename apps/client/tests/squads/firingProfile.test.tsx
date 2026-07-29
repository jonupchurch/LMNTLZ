/**
 * The firing profile is computed locally (T045).
 *
 * **Step 2 is the assertion, not step 1.** That the numbers are right matters
 * less than *where they came from*: `firingProfile` lives in
 * `@lmntlz/sim/rules` precisely so the squad builder can run it on every drag of
 * a ranking widget. **If a request appears here, it moved back to `sim/ai`** —
 * and the fix would be an endpoint and a network round trip per pointer move, to
 * compute something the client can derive from a package it already imports.
 *
 * That regression was caught on paper during feature 006's planning. This is the
 * thing that catches it in code.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getAllHeroes } from '@lmntlz/content';
import { BATTLE_TURNS, SWEEP_TURNS, firingProfile, type PowerRanking } from '@lmntlz/sim/rules';
import { FiringProfile } from '../../src/features/squads/FiringProfile.js';

const HERO = getAllHeroes()[0]!;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Any call at all is a failure — not a specific URL, because the point is
  // that nothing leaves the process.
  fetchSpy = vi.fn(() => Promise.reject(new Error('the firing profile made a request')));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nothing is requested while a ranking changes', () => {
  it('renders a profile with zero network calls', () => {
    render(<FiringProfile hero={HERO} ranking={[5, 4, 3, 2, 1, 0] as PowerRanking} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stays at zero across many ranking changes, as a drag would produce', () => {
    const rankings: PowerRanking[] = [
      [5, 4, 3, 2, 1, 0],
      [4, 5, 3, 2, 1, 0],
      [4, 3, 5, 2, 1, 0],
      [4, 3, 2, 5, 1, 0],
      [4, 3, 2, 1, 5, 0],
      [1, 2, 3, 4, 5, 0],
    ] as PowerRanking[];

    const { rerender } = render(<FiringProfile hero={HERO} ranking={rankings[0]!} />);
    for (const ranking of rankings.slice(1)) {
      rerender(<FiringProfile hero={HERO} ranking={ranking} />);
    }

    // One request per drag frame would be the shape of the regression.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the horizon is 9 turns, not 60', () => {
  it('uses BATTLE_TURNS and says so on screen', () => {
    expect(BATTLE_TURNS).toBe(9);
    expect(SWEEP_TURNS).toBe(60);

    render(<FiringProfile hero={HERO} ranking={[5, 4, 3, 2, 1, 0] as PowerRanking} />);
    expect(screen.getByText(/Over 9 turns/)).toBeInTheDocument();
  });

  it('renders the same counts the rules package produces at 9 turns', () => {
    // **A 60-turn horizon tells a player their tier-0 fires 5% of the time; at
    // battle length it usually never fires at all.** Asserting equality against
    // the 9-turn profile is what pins the horizon — a component that passed 60
    // would render different numbers and this would fail.
    const ranking = [5, 4, 3, 2, 1, 0] as PowerRanking;
    const expected = firingProfile(HERO, ranking, BATTLE_TURNS);
    const atSweep = firingProfile(HERO, ranking, SWEEP_TURNS);

    const { container } = render(<FiringProfile hero={HERO} ranking={ranking} />);

    // The whole list in order — several powers share a count, so per-value
    // lookups cannot distinguish them.
    const structural = new Set(atSweep.filter((e) => e.fires === 0).map((e) => e.powerId));
    const rendered = [...container.querySelectorAll('li span:last-child')].map(
      (el) => el.textContent,
    );
    expect(rendered).toEqual(
      expected.map((e) =>
        structural.has(e.powerId) ? 'never' : e.fires === 0 ? 'rarely' : `${e.fires}×`,
      ),
    );

    // And the two horizons genuinely disagree, so the assertion above is not
    // vacuously true for any horizon a component might have passed.
    expect(atSweep.map((e) => e.fires)).not.toEqual(expected.map((e) => e.fires));
  });
});

describe('a ranking that switches powers off says so', () => {
  it('reports both ultimates dead under 1·2·3·4·5·0', () => {
    // The tier-0 auto-attack has cooldown 0 and no gate, so anything ranked
    // BELOW it never fires. This ordering puts the two highest tiers there.
    const ranking = [1, 2, 3, 4, 5, 0] as PowerRanking;
    const profile = firingProfile(HERO, ranking, BATTLE_TURNS);
    const dead = profile.filter((e) => e.fires === 0);

    expect(dead.length).toBeGreaterThanOrEqual(2);

    render(<FiringProfile hero={HERO} ranking={ranking} />);
    expect(screen.getByRole('status')).toHaveTextContent(/never fire/);
  });

  it('does NOT cry "never" for a power that is merely slow', () => {
    /**
     * **The measurement that shapes this component.** `5·4·3·2·1·0` is one of
     * the twelve orderings feature 004 measured as safe, and at the 9-turn
     * display horizon it leaves a zero on 21 of 27 champions — while leaving
     * none at 60. Those powers are slow, not switched off.
     *
     * A red "never fires" on almost every recommended squad is noise, and the
     * first thing a player learns is to ignore it.
     */
    const healthy = [5, 4, 3, 2, 1, 0] as PowerRanking;
    const zeroAt9 = firingProfile(HERO, healthy, BATTLE_TURNS).filter((e) => e.fires === 0);
    const zeroAt60 = firingProfile(HERO, healthy, SWEEP_TURNS).filter((e) => e.fires === 0);

    expect(zeroAt60).toHaveLength(0);

    render(<FiringProfile hero={HERO} ranking={healthy} />);

    // No alarm, whatever the 9-turn counts say.
    expect(screen.queryByRole('status')).toBeNull();
    if (zeroAt9.length > 0) {
      expect(screen.getByText(/unlikely to come up/)).toBeInTheDocument();
      expect(screen.queryByText(/never fire/)).toBeNull();
    }
  });
});
