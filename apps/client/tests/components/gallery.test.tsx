/**
 * **The gallery renders every component in every state** (017 T015, T032).
 *
 * ### This test exists because of a defect this project has shipped five times
 *
 * A component library nothing renders is indistinguishable from a working one
 * until a screen needs it. So the gallery is not asserted in isolation — it is
 * reached **through `App`**, the real root, at `#gallery`. If someone removes
 * the registration in `App.tsx`, the first `describe` below goes red. That is
 * the whole point of routing it rather than importing it.
 *
 * ### And it fails when a state the export draws has no case
 *
 * The state lists here are transcribed from the Design System export, not from
 * the components. That direction matters: reading them off the components would
 * make the test agree with whatever was built, which is not a test. Written
 * this way, deleting `pending` from `Button` fails here.
 */

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App.js';
import { GalleryScreen } from '../../src/features/gallery/GalleryScreen.js';

/** § 03 of the export. **Pending, not success** — see `Button.tsx`. */
const BUTTON_STATES = ['rest', 'hover', 'pressed', 'focus', 'disabled', 'loading', 'pending'];
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'icon'];
/** § 07 — power slot states. */
const POWER_SLOT_STATES = ['ready', 'recharging', 'disabled', 'awaiting', 'empty'];
/** The nine forces. */
const FORCES = [
  'earth',
  'air',
  'fire',
  'water',
  'light',
  'dark',
  'slash',
  'pierce',
  'crush',
];

describe('the gallery is registered in the real app', () => {
  beforeEach(() => {
    window.location.hash = '#gallery';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  /**
   * **Remove the `#gallery` branch from `App.tsx` and this fails.** T032 asks
   * for exactly that check, because the component existing and the app
   * rendering it are two different facts and only the second one matters.
   */
  it('renders through App at #gallery, not just when imported directly', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Buttons/i })).toBeInTheDocument();
  });

  it('does not render the gallery at any other route', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.queryByRole('heading', { name: /Buttons/i })).toBeNull();
  });
});

describe('every state the export draws has a case', () => {
  beforeEach(() => {
    render(<GalleryScreen />);
  });

  it.each(BUTTON_VARIANTS)('button variant %s renders all seven states', (variant) => {
    const rendered = document.querySelectorAll(`button[data-variant="${variant}"]`);
    const states = [...rendered].map((el) => el.getAttribute('data-state'));
    for (const state of BUTTON_STATES) {
      expect(states, `button variant "${variant}" has no "${state}" case`).toContain(state);
    }
  });

  it.each(POWER_SLOT_STATES)('power slot state %s is rendered', (state) => {
    expect(
      document.querySelector(`[data-state="${state}"]`),
      `no power slot renders the "${state}" state`,
    ).not.toBeNull();
  });

  it.each(FORCES)('force %s has a badge', (force) => {
    expect(
      document.querySelector(`[data-force="${force}"]`),
      `the nine forces are incomplete — "${force}" is missing`,
    ).not.toBeNull();
  });

  /** Five, not the four the export draws. Canon wins; see RelationshipStrip. */
  it('the relationship strip shows five tiers', () => {
    const strip = screen.getAllByTestId('relationship-strip')[0]!;
    expect(within(strip).getAllByRole('listitem')).toHaveLength(5);
    for (const rung of ['bane', 'fault', 'neutral', 'secondary', 'primary']) {
      expect(strip.querySelector(`[data-rung="${rung}"]`), `missing rung ${rung}`).not.toBeNull();
    }
  });

  it('the ladder is ×1.50 ×1.25 ×1.00 ×0.80 ×0.50 — never ×1.2', () => {
    const strip = screen.getAllByTestId('relationship-strip')[0]!;
    const text = strip.textContent ?? '';
    for (const value of ['×1.50', '×1.25', '×1.00', '×0.80', '×0.50']) {
      expect(text, `the five-tier ladder is missing ${value}`).toContain(value);
    }
    expect(text, 'the export prints ×1.2 and it is wrong').not.toContain('×1.2 ');
  });

  it.each(['compact', 'standard', 'full'])('hero card scale %s is rendered', (scale) => {
    expect(document.querySelector(`[data-scale="${scale}"]`)).not.toBeNull();
  });

  it.each(['connected', 'reconnecting', 'offline'])('connection state %s is rendered', (status) => {
    expect(document.querySelector(`[data-status="${status}"]`)).not.toBeNull();
  });

  it.each(['draining', 'recess'])('maintenance state %s is rendered', (state) => {
    expect(document.querySelector(`[data-state="${state}"]`)).not.toBeNull();
  });

  it.each(['rest', 'error', 'disabled'])('text field state %s is rendered', (state) => {
    expect(document.querySelector(`[data-state="${state}"]`)).not.toBeNull();
  });
});
