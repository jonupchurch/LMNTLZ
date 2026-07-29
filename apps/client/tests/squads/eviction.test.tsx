/**
 * The eviction confirm (T029–T031).
 *
 * **The plural case is tested first and hardest**, because it is the default:
 * 18 seats drawn from 15 champions means a hero commonly sits in all three
 * attack squads. Copy written for one squad and scaled up reads wrong exactly
 * when it fires most often.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvictionWarning } from '../../src/features/squads/EvictionWarning.js';
import type { EvictionPreview } from '../../src/features/squads/types.js';

const THREE: EvictionPreview = {
  heroId: 'h13',
  evicts: [
    { slot: 0, name: 'Vanguard', wasComplete: true, wouldBe: 5 },
    { slot: 1, name: 'Second Wind', wasComplete: true, wouldBe: 5 },
    { slot: 2, name: 'Long Reach', wasComplete: true, wouldBe: 5 },
  ],
  poolAfter: { heroes: 14, squads: 3, seatsNeeded: 18 },
  streakAtRisk: 14,
};

const render3 = (preview: EvictionPreview = THREE, onConfirm = () => {}, onCancel = () => {}) =>
  render(
    <EvictionWarning
      heroName="Bramwen"
      zoneLabel="Zone I"
      preview={preview}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

describe('the plural case, which is the default', () => {
  it('leads with the count, before any squad name', () => {
    render3();
    // A player scanning past a wall of names still reads the number.
    expect(screen.getByText(/3 of your attack squads/)).toBeInTheDocument();
  });

  it('names every squad and never says "and N others"', () => {
    render3();
    for (const name of ['Vanguard', 'Second Wind', 'Long Reach']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Truncation is how a player discovers the third squad mid-battle.
    expect(screen.queryByText(/other/i)).toBeNull();
    expect(screen.queryByText(/and \d+ more/i)).toBeNull();
  });

  it('states the remaining pool, which is why this keeps happening', () => {
    render3();
    expect(screen.getByText(/14 champions left for 3 squads of 6/)).toBeInTheDocument();
  });

  it('states the streak cost BEFORE the commit (FR-014)', () => {
    render3();
    expect(screen.getByText(/hold streak of 14 days resets/)).toBeInTheDocument();
  });

  it('shows what each squad was, so "was ready" is visible', () => {
    render3();
    expect(screen.getAllByText(/← was ready/)).toHaveLength(3);
    expect(screen.getAllByText(/5 of 6/)).toHaveLength(3);
  });
});

describe('singular and zero are the branches', () => {
  it('reads naturally for exactly one squad', () => {
    render3({ ...THREE, evicts: [THREE.evicts[0]!] });
    expect(screen.getByText(/1 of your attack squads/)).toBeInTheDocument();
    // "all three become incomplete" must not survive into the singular copy.
    expect(screen.queryByText(/all three/)).toBeNull();
    expect(screen.queryByText(/all both/)).toBeNull();
  });

  it('still states the pool when nothing is evicted', () => {
    // The client skips the confirm entirely in this case, but if it renders it
    // must not claim squads break.
    render3({ ...THREE, evicts: [], streakAtRisk: 0 });
    expect(screen.queryByText(/attack squads/)).toBeNull();
    expect(screen.getByText(/14 champions left for 3 squads of 6/)).toBeInTheDocument();
  });

  it('says nothing about a streak there is none of', () => {
    render3({ ...THREE, streakAtRisk: 0 });
    expect(screen.queryByText(/hold streak/)).toBeNull();
  });
});

describe('it is a confirm, not a notice', () => {
  it('is an alertdialog with both a cancel and a commit', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render3(THREE, onConfirm, onCancel);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Move Bramwen/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('offers no "repair" or "auto-fill" action', () => {
    // **No auto-repair.** Substituting another champion into the gap replaces
    // the player's plan with a guess, and hides that they are over-committed.
    render3();
    for (const word of [/repair/i, /auto/i, /fill/i, /replace with/i]) {
      expect(screen.queryByRole('button', { name: word })).toBeNull();
    }
  });
});
