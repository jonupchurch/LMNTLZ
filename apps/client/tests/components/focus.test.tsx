/**
 * **Focus is always visible, and no component removes it** (017 T017).
 *
 * This is a mouse-and-keyboard game with no touch input, so the focus ring is
 * not an accessibility afterthought — it is the only thing telling a keyboard
 * player where they are.
 *
 * Two halves, because they fail differently:
 *
 * 1. **Source**: no component sets `outline: none` or `outline-none`. The one
 *    global definition lives in `base.css` and a component may not opt out.
 * 2. **Behaviour**: every interactive component actually renders a focusable
 *    element that takes focus. A ring styled on something nothing can focus is
 *    the same defect wearing a nicer coat.
 *
 * jsdom applies no stylesheet, so this cannot assert the ring's *appearance* —
 * that belongs in Playwright. What it can prove is that the element is
 * reachable and that nothing in our source opts out, which is where the
 * regression actually happens.
 */

import { getAllHeroes } from '@lmntlz/content';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COMPONENTS_DIR, readStripped, sourceFiles } from './support/scan.js';
import { Button, PowerSlot, TextField, Toggle } from '../../src/components/index.js';

const OPT_OUT = /outline:\s*none|outline-none/;

describe('no component opts out of the focus ring', () => {
  const files = sourceFiles(COMPONENTS_DIR);

  it('finds component files to scan', () => {
    expect(files).not.toHaveLength(0);
  });

  it.each(files)('%s never removes the outline', (file) => {
    expect(readStripped(file)).not.toMatch(OPT_OUT);
  });
});

describe('interactive components are focusable', () => {
  const hero = getAllHeroes()[0]!;

  it('Button takes focus', () => {
    render(<Button>COMMIT</Button>);
    const button = screen.getByRole('button', { name: 'COMMIT' });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('a disabled Button does not take focus', () => {
    render(
      <Button state="disabled">COMMIT</Button>,
    );
    const button = screen.getByRole('button', { name: 'COMMIT' });
    button.focus();
    expect(document.activeElement).not.toBe(button);
  });

  /**
   * Pending is inert but is **not** disabled-looking. It still must not be
   * re-clickable, or a slow server produces two purchases.
   */
  it('a pending Button is inert and marked busy', () => {
    render(<Button state="pending">COMMIT</Button>);
    const button = screen.getByRole('button', { name: 'COMMIT' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('TextField takes focus and is labelled', () => {
    render(<TextField label="Court name" />);
    const input = screen.getByLabelText('Court name');
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('Toggle is a switch and takes focus', () => {
    render(<Toggle label="Show resisted hits" checked={false} onChange={() => undefined} />);
    const toggle = screen.getByRole('switch');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('a ready PowerSlot takes focus; a gated one does not', () => {
    const { unmount } = render(<PowerSlot power={hero.powers[0]} onSelect={() => undefined} />);
    const ready = screen.getByRole('button');
    ready.focus();
    expect(document.activeElement).toBe(ready);
    unmount();

    render(<PowerSlot power={hero.powers[5]} gated />);
    const gated = screen.getByRole('button');
    gated.focus();
    expect(document.activeElement).not.toBe(gated);
  });
});
