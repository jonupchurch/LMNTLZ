/**
 * **The rail leads only to screens that exist** (017 T046 · FR-015).
 *
 * This is the navigation version of the defect this project has shipped most
 * often. A rail entry for an unbuilt screen is a promise the app cannot keep,
 * and it fails in the worst way: the player clicks, nothing happens or
 * something empty appears, and there is no error to report.
 *
 * So the assertions run in both directions:
 *
 * - every entry the rail draws resolves to a registered `Screen`; and
 * - every screen the app can be in lights exactly one entry.
 *
 * Plus the one that is easy to forget: the unbuilt destinations are **absent**,
 * not present-and-disabled. A disabled control invites the player to work out
 * why it is disabled, which is a question this interface cannot answer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { activeRailId, railEntries, screenFor } from '../../src/App.js';
import { Header, Rail } from '../../src/components/index.js';

/** Flatten groups — THE COURT's children are destinations, the group is not. */
const leaves = (): { id: string; label: string }[] =>
  railEntries().flatMap((e) => (e.children ? [...e.children] : [e]));

const ACCOUNT = 'acct-1';

describe('every rail entry leads somewhere real', () => {
  it('draws entries at all', () => {
    expect(leaves(), 'the rail is empty — the assertions below would be vacuous').not.toHaveLength(
      0,
    );
  });

  it.each(leaves().map((l) => l.id))('%s resolves to a registered screen', (id) => {
    const target = screenFor(id, ACCOUNT);
    expect(target, `rail id "${id}" resolves to nothing`).toBeTruthy();
    /**
     * `screenFor` falls back to `squads`, so a *typo* would resolve silently.
     * The real guard is that the round trip has to close: the screen it
     * returns must light the entry that was clicked.
     */
    expect(activeRailId(target.kind), `"${id}" navigates somewhere that does not light it`).toBe(
      id,
    );
  });

  it('lights exactly one entry per screen', () => {
    for (const { id } of leaves()) {
      render(<Rail entries={railEntries()} activeId={id} />);
      const current = document.querySelectorAll('[aria-current="page"]');
      expect(current, `screen "${id}" lights ${current.length} entries, not 1`).toHaveLength(1);
      document.body.innerHTML = '';
    }
  });
});

/**
 * FR-015's negative half. These are the destinations the design draws and the
 * app has not built; each names the feature that will bring it.
 */
describe('unbuilt destinations are absent, not disabled', () => {
  const UNBUILT = [
    /* `Codex` graduated off this list in T065, which is the list working as
       intended: an entry appears the commit its screen does, not before. */
    ['Rune Forge', '018'],
    ['Store', '018'],
    ['Dispatches', '016'],
    ['Chat', '014'],
    /* Drawn inside THE COURT by the export, but it is a section of the
       profile rather than a destination — see App.tsx. */
    ['Battle Record', 'a section of the profile, not a screen'],
  ] as const;

  it.each(UNBUILT)('%s is not in the rail (%s)', (label) => {
    render(<Rail entries={railEntries()} activeId="squads" />);
    expect(
      screen.queryByRole('button', { name: new RegExp(label, 'i') }),
      `"${label}" appears in the rail before its screen exists`,
    ).toBeNull();
  });

  /**
   * The stronger claim: nothing anywhere in the rail is disabled. It catches
   * an unbuilt entry added in the disabled style this rule forbids, whatever
   * it is called.
   */
  it('renders no disabled entry at all', () => {
    render(<Rail entries={railEntries()} activeId="squads" />);
    for (const button of document.querySelectorAll('button')) {
      expect(button, `"${button.textContent}" is disabled — absent is the rule`).not.toBeDisabled();
    }
  });
});

/**
 * The profile is reached from the header, and THE COURT lights up while you
 * are on it. Both halves are asserted because they are the two independent
 * reasons Profile is not a rail entry — the export's header design (T020) and
 * the active-state colour (R6).
 */
describe('the profile hangs off the username, not the rail', () => {
  it('is not a rail entry', () => {
    render(<Rail entries={railEntries()} activeId="squads" />);
    expect(
      screen.queryByRole('button', { name: /^profile$/i }),
      'Profile took a rail slot — the export puts it on the username',
    ).toBeNull();
  });

  /**
   * **One click, and `e2e/profile.spec.ts` says so in as many words.** Putting
   * Profile inside a collapsed THE COURT group made it two, which is what this
   * guards against coming back.
   */
  it('is one click from the header', () => {
    const seen: string[] = [];
    render(<Header username="reyna" onProfile={() => seen.push('profile')} />);
    screen.getByRole('button', { name: 'reyna' }).click();
    expect(seen, 'the username is not a route to the profile').toEqual(['profile']);
  });

  it('lights THE COURT while the profile is open', () => {
    render(<Rail entries={railEntries()} activeId={activeRailId('profile')} />);
    const current = screen.getByRole('button', { current: 'page' });
    expect(current).toHaveTextContent(/the court/i);
  });

  it('lights THE COURT for the guild too', () => {
    expect(activeRailId('guild')).toBe('court');
    expect(activeRailId('profile')).toBe('court');
  });
});
