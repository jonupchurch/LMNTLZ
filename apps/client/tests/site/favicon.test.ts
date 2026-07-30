/**
 * The favicon is referenced, once, by a path both channels can follow.
 *
 * ### Why this is a source test rather than an end-to-end one
 *
 * `e2e/legal.spec.ts` checks that every page carries a `<link rel="icon">` and that the
 * file behind it resolves. What it **cannot** check is the shape of the path in
 * `index.html`, because Playwright drives `pnpm dev` and **Vite's dev server rewrites
 * `./favicon.svg` to `/favicon.svg`**. The relative form only exists in the built
 * output, so the guarantee has to be asserted against the source that produces it.
 *
 * That distinction is the whole point of the file. `vite.config.ts` sets `base: './'`
 * because the Steam build is loaded from disk, where a root-absolute path resolves
 * against the filesystem root rather than the bundle. A leading slash would work
 * perfectly in the browser channel and silently show no icon in the other one — the same
 * asymmetry `analytics.ts` guards on the protocol for, and the same reason it is worth a
 * test nobody would otherwise write.
 *
 * The five policy pages are copied out of `public/` verbatim, so their href is observable
 * in both places and is checked in both.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const ICON = './favicon.svg';

/** `index.html` is Vite's entry; the rest are copied verbatim from `public/`. */
const PAGES = [
  '../../index.html',
  '../../public/contact.html',
  '../../public/pricing.html',
  '../../public/privacy.html',
  '../../public/refunds.html',
  '../../public/terms.html',
] as const;

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('every page references the favicon', () => {
  for (const page of PAGES) {
    const name = page.split('/').pop()!;

    it(`${name} links it relatively, not from the filesystem root`, async () => {
      const html = await read(page);

      const links = [...html.matchAll(/<link[^>]*rel="icon"[^>]*>/g)].map((m) => m[0]);

      expect(links, `${name} has no <link rel="icon">`).toHaveLength(1);
      expect(links[0], `${name} does not point at ${ICON}`).toContain(`href="${ICON}"`);
      expect(links[0], `${name} declares no SVG type`).toContain('image/svg+xml');

      // The failure that would only show up on Steam.
      expect(links[0], `${name} uses a root-absolute icon path`).not.toMatch(/href="\//);
    });

    it(`${name} puts it inside the head`, async () => {
      // Outside `</head>` a browser still often honours it, which is exactly why a
      // misplaced link would never be reported as broken.
      const html = await read(page);

      const headEnd = html.indexOf('</head>');
      const icon = html.search(/<link[^>]*rel="icon"/);

      expect(headEnd, `${name} has no </head>`).toBeGreaterThan(-1);
      expect(icon, `${name} places the icon after </head>`).toBeLessThan(headEnd);
    });
  }
});

describe('the file itself', () => {
  it('is an SVG that draws something', async () => {
    const svg = await read('../../public/favicon.svg');

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    // A `<defs>`-only file is valid SVG and renders an empty tab icon.
    expect(svg, 'nothing is drawn').toMatch(/<(path|rect|circle|polygon)\b/);
  });

  it('is self-contained, so the Steam build needs no network for it', async () => {
    /**
     * The same rule the self-hosted fonts follow, and `index.html` records the reasoning:
     * the Steam build *"runs from disk and may have no network at all."* An `<image>`
     * href or an external stylesheet inside the icon would be a blank tab there.
     */
    const svg = await read('../../public/favicon.svg');

    /**
     * **Banning `http://` outright was wrong, and it failed on correct code.** The
     * `xmlns="http://www.w3.org/2000/svg"` declaration is required by the format and
     * fetches nothing — it is an identifier, not a URL. What matters is a *reference*
     * that would be dereferenced, so those are what is banned.
     */
    expect(svg, 'the required SVG namespace was removed').toContain(
      'xmlns="http://www.w3.org/2000/svg"',
    );

    expect(svg, 'an attribute dereferences the network').not.toMatch(
      /(?:xlink:)?href\s*=\s*"https?:/,
    );
    expect(svg, 'a CSS url() dereferences the network').not.toMatch(/url\(\s*['"]?https?:/);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('@import');
  });

  it('is small enough to be inlined by anything that wants to', async () => {
    // Not a hard requirement — a sanity bound. A favicon that grew to 50kB would mean
    // somebody pasted a raster into it.
    const svg = await read('../../public/favicon.svg');
    expect(svg.length).toBeLessThan(4_000);
  });
});
