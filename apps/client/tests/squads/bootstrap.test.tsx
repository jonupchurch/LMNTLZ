/**
 * The client bootstrap holds together (006 T001–T004).
 *
 * Three things worth asserting the day the app is created, because each is
 * silent when broken and expensive to discover later.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from '../../src/App.js';

const CLIENT = join(import.meta.dirname, '../..');

describe('the client reads the real roster', () => {
  it('renders 27 champions and 9 forces from @lmntlz/content', () => {
    // **Not a copy.** The one thing that must never happen is the client
    // shipping its own hero list — the roster would then be wrong in exactly
    // one place, and the disagreement would surface as a battle that resolves
    // differently on each side.
    render(<App />);

    expect(screen.getByText(/27 champions · 9 forces/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LMNTLZ' })).toBeInTheDocument();
  });

  it('stamps the content version it was built against', () => {
    render(<App />);
    // `c` + 12 hex. A battle recorded without this cannot be replayed against
    // the roster that produced it (Constitution XVI).
    expect(screen.getByText(/^c[0-9a-f]{12}$/)).toBeInTheDocument();
  });
});

describe('the desktop floor is stated in CSS, not assumed', () => {
  // **Comments stripped before scanning.** The file explains *why* nobody should
  // write `outline: none`, and a scan that reads prose flags the explanation —
  // which would make the only fix deleting the reason. Same trap as
  // `apps/api/tests/auth/convention.test.ts`.
  const css = readFileSync(join(CLIENT, 'src/styles/base.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('sets a 1280px minimum width rather than reflowing', () => {
    // A squad is six heroes in a fixed 2/3/1 formation and the defense screen
    // shows two squads side by side. Below the floor that is a different
    // interface, not a smaller one — so it scrolls.
    expect(css).toMatch(/min-width:\s*1280px/);
  });

  it('never removes the focus ring', () => {
    // The only thing telling a keyboard player where they are. `outline: none`
    // anywhere in this file is a regression, and it is the single most common
    // thing a component library drops in.
    expect(css).toMatch(/:focus-visible/);
    expect(css).not.toMatch(/outline:\s*none/);
  });
});
