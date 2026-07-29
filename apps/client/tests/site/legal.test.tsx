/**
 * The five static pages a payment provider requires before it will verify a
 * seller, and the footer that makes them findable.
 *
 * ### What this suite is actually protecting against
 *
 * Three failures, none of which a component test would ever see:
 *
 * 1. **A page nobody links to.** A reviewer starts at the root and follows
 *    links; an unreferenced `/refunds.html` does not exist as far as they are
 *    concerned. Exactly the gap feature 006 found the hard way, when every squad
 *    component was complete and unreachable.
 * 2. **A blank shipping as finished copy.** Three facts about the business are
 *    not knowable from this repository. They are marked, and the marks are
 *    enumerated below — so a *new* one cannot appear without this failing, and
 *    filling one in means deleting it from the list rather than forgetting it.
 * 3. **A price on the marketing page that the storefront does not charge.** The
 *    catalogue lives in prose here because feature 011 has not been built yet;
 *    when it is, this test should read its catalogue instead of the literals
 *    below and the duplication goes away.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteFooter } from '../../src/components/SiteFooter.js';

const PUBLIC = join(import.meta.dirname, '../../public');

/** Every page, and the label each is linked by. */
const PAGES = [
  ['pricing.html', 'Passes'],
  ['terms.html', 'Terms'],
  ['privacy.html', 'Privacy'],
  ['refunds.html', 'Refunds'],
  ['contact.html', 'Contact'],
] as const;

/**
 * **The complete set of unfilled blanks — empty, as of 2026-07-29.**
 *
 * All three were filled that day: `TRADING_NAME` → Gravytraining,
 * `SUPPORT_EMAIL` → a monitored address, `JURISDICTION` → Ohio (which changed
 * more than a name: the pages were drafted UK/EU-leaning and needed a US pass —
 * governing law, venue, and the "we do not sell your personal information"
 * statement US state law expects).
 *
 * **The list stays.** Its value was never the three entries; it is that a
 * *new* `[[TOKEN]]` in any page fails this test rather than shipping as
 * finished copy. Add an entry when a page grows a blank, delete it when the
 * blank is filled — the assertion fails in both directions.
 */
const OPEN_BLANKS: string[] = [];

const page = (name: string) => readFileSync(join(PUBLIC, name), 'utf8');
const css = () => readFileSync(join(PUBLIC, 'legal.css'), 'utf8');

/**
 * The page with its whitespace collapsed, for assertions about **prose**.
 *
 * A sentence in the source is wrapped wherever the formatter chose, so
 * `toContain('$160 in a year')` fails on a line break nobody meant to be
 * significant. Asserting the wrapped form instead pins the formatting, which is
 * worse: the test then fails on a reflow and passes when the sentence changes
 * meaning. Collapse first and the assertion is about the sentence.
 */
const prose = (name: string) => page(name).replace(/\s+/g, ' ');

describe.each(PAGES)('%s', (file) => {
  const html = page(file);

  it('names itself in a title', () => {
    expect(html).toMatch(/<title>[^<]*LMNTLZ[^<]*<\/title>/);
  });

  it('is readable on whatever the reader has', () => {
    // The app sets a 1280px floor because a six-hero 2/3/1 formation does not
    // become a phone layout. **Prose does**, and a reviewer may well open the
    // refund policy on a phone — so these pages are fluid on purpose.
    expect(html).toContain('width=device-width');
  });

  it('carries the stylesheet', () => {
    expect(html).toContain('href="/legal.css"');
  });

  it('links to all five pages, so any one of them reaches the rest', () => {
    for (const [target] of PAGES) expect(html).toContain(`href="/${target}"`);
  });

  it('says who is selling and who takes the money', () => {
    // Paddle requires the merchant-of-record disclosure to be present, and a
    // player owes nothing to a name they have never seen on their statement.
    expect(html).toContain('Paddle');
  });
});

describe('the unfilled blanks are enumerated rather than discovered', () => {
  const found = new Set<string>();
  for (const [file] of PAGES) {
    for (const match of page(file).matchAll(/\[\[([A-Z_]+)\]\]/g)) found.add(match[1]!);
  }

  it('contains exactly the blanks that are known to be open', () => {
    // A new `[[SOMETHING]]` appearing in a page fails here rather than shipping
    // as copy. So does an entry left in this list after its pages were filled.
    expect([...found].sort()).toEqual(OPEN_BLANKS);
  });

  it('names the operator on every page', () => {
    /**
     * **The blanks test alone stopped meaning anything once it was empty.** It
     * only ever looked for `[[TOKEN]]`, so deleting the operator's name outright
     * — a stray edit, a bad merge — would pass it silently. Paddle will not
     * verify a site that does not say who is selling, so this is asserted
     * positively rather than inferred from the absence of a marker.
     */
    for (const [file] of PAGES) expect(prose(file), file).toContain('Gravytraining');
  });

  it('states a governing law and a way to reach a person', () => {
    expect(prose('terms.html')).toContain('State of Ohio');
    expect(page('contact.html')).toMatch(/href="mailto:[^"]+@[^"]+"/);
  });

  it('marks every blank visibly rather than inline in the prose', () => {
    // `.tbd` renders on a red field. An unfilled blank must be impossible to
    // read as finished text, both for us and for whoever reviews the site.
    for (const [file] of PAGES) {
      const html = page(file);
      for (const match of html.matchAll(/\[\[[A-Z_]+\]\]/g)) {
        const before = html.slice(Math.max(0, match.index - 60), match.index);
        expect(before, `unmarked placeholder in ${file}`).toContain('class="tbd"');
      }
    }
  });
});

describe('the price list matches the catalogue', () => {
  /** Feature 011 FR-001 — seven durations, every price a multiple of $5. */
  const CATALOGUE = [
    ['$5', '3 days'],
    ['$10', '7 days'],
    ['$15', '12 days'],
    ['$20', '4 weeks — 28 days'],
    ['$50', '3 months — 91 days'],
    ['$90', '6 months — 182 days'],
    ['$160', '1 year — 364 days'],
  ] as const;

  const html = page('pricing.html');

  it.each(CATALOGUE)('offers %s for %s', (price, duration) => {
    expect(html).toContain(`>${price}</td>`);
    expect(html).toContain(`>${duration}</td>`);
  });

  it('sells nothing the catalogue does not list', () => {
    const prices = [...html.matchAll(/>\$(\d+)<\/td>/g)].map((m) => Number(m[1]));
    expect(prices.sort((a, b) => a - b)).toEqual([5, 10, 15, 20, 50, 90, 160]);
  });

  it('states the three promises the design is built around', () => {
    // Each is a load-bearing product decision, not marketing copy: no
    // auto-renewal is why there is no cancellation flow, additive stacking is
    // why there is no renewal reminder, and the absence of a shard SKU is what
    // makes the ceiling auditable at all.
    const text = prose('pricing.html');
    expect(text).toContain('Nothing auto-renews');
    expect(text).toContain('Passes add, they never replace');
    expect(text).toContain('Shards cannot be bought');
  });

  it('publishes the ceiling, which is the whole promise', () => {
    expect(prose('pricing.html')).toContain('the most anyone can spend to gain an advantage is $160 in a year');
  });
});

describe('the pages are reachable from the running app', () => {
  it('renders a link to every policy page', () => {
    // The gap 006 found: a component can be complete, tested and unreachable.
    render(<SiteFooter />);
    for (const [file, label] of PAGES) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/${file}`);
    }
  });
});

describe('the stylesheet holds the same rules the app does', () => {
  // Comments stripped before scanning — this file explains *why* nobody should
  // write `outline: none`, and a scan that reads prose would flag the
  // explanation, making the only fix deleting the reason. Same trap as
  // `tests/squads/bootstrap.test.tsx` and `apps/api/tests/auth/convention.test.ts`.
  const stripped = css().replace(/\/\*[\s\S]*?\*\//g, '');

  it('never removes the focus ring', () => {
    expect(stripped).toMatch(/:focus-visible/);
    expect(stripped).not.toMatch(/outline:\s*none/);
  });

  it('does not inherit the app viewport floor', () => {
    // Deliberate: `src/styles/base.css` sets `min-width: 1280px` and that
    // reasoning is about squad layouts, not about paragraphs. Asserted so the
    // deviation stays a decision rather than becoming an oversight.
    expect(stripped).not.toMatch(/min-width:\s*1280px/);
  });

  it('keeps wide tables inside their own scroller', () => {
    // The page body must never scroll sideways; the table does.
    expect(stripped).toMatch(/\.scroller\s*\{[^}]*overflow-x:\s*auto/);
  });
});
