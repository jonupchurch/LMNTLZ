import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * The three families, **self-hosted** (017 T009 · FR-001, FR-002).
 *
 * ### These were declared and never loaded, from feature 006 until now
 *
 * `styles/base.css` has defined `--font-display`, `--font-sans` and `--font-mono`
 * since the Tailwind setup landed, and nothing ever fetched a font file. Every
 * screen this game has ever shipped rendered in `system-ui`. **Nothing errored,
 * nothing logged and no test failed** — the fallback chain is clean, so the defect
 * was invisible in exactly the way an uncalled seam is.
 *
 * ### Why `@fontsource` and not a `<link>` to Google
 *
 * The Steam build loads this bundle **from disk and may have no network at all**, so
 * a webfont fetched from a third party would silently fail there and reflow the
 * whole interface. Constitution XIX wants the vendor gone as well. These packages
 * ship the `woff2` files, so Vite fingerprints them into `assets/` and — with
 * `base: './'` already set in `vite.config.ts` — emits **relative** URLs, which is
 * precisely what a disk-loaded build needs.
 *
 * ### Nine faces, not three families
 *
 * Only the weights the design actually uses, and the **`latin-` subset** rather than
 * the default (which also pulls latin-extended). Importing `@fontsource/barlow` bare
 * would fetch nine weights × two subsets for the four we need.
 *
 * `font-display: swap` is **already set by these packages** — verified in
 * `latin-500.css` — so there is nothing to override here. The fallback stack in
 * `base.css` is deliberate, and a flash of fallback beats a flash of nothing on a
 * screen a player is mid-decision on.
 */
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';

import './styles/base.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
