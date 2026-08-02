import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentVersion } from '../src/version.js';

const WORKBOOK = fileURLToPath(
  new URL('../../../resources/characters/hero-stats.xlsx', import.meta.url),
);
const GENERATED = fileURLToPath(new URL('../src/heroes.generated.ts', import.meta.url));
/** The two authored overlays. Neither has a workbook column; both decide content. */
const OVERLAY = fileURLToPath(new URL('../../../tools/power-targeting.json', import.meta.url));
const RIDERS = fileURLToPath(new URL('../../../tools/power-riders.json', import.meta.url));

/**
 * A text file's bytes with line endings normalized — what the build hashes.
 *
 * The workbook is deliberately *not* put through this: it is binary, autocrlf
 * never touches it, and stripping `\r` from a zip would hash something that is
 * not the workbook.
 */
const normalized = (path: string): Buffer =>
  Buffer.from(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

/**
 * T033 — the stamp tracks the authored SOURCE, not the emitted output (FR-020).
 *
 * The distinction is the whole test. Hashing the output would move the stamp
 * whenever the emitter's formatting changed — a cosmetic edit to a template
 * string would look like a content change on every battle record written after
 * it — and hold it still if the emitter ever dropped a field, which is when you
 * most need it to move.
 */
describe('contentVersion', () => {
  it('is "c" plus twelve hex characters', () => {
    expect(contentVersion()).toMatch(/^c[0-9a-f]{12}$/);
  });

  /**
   * 🔴 **All three authored files, and it hashed only the workbook until
   * 2026-08-02.**
   *
   * `power-targeting.json` decides `targets`, `friendly` and `reactive`;
   * `power-riders.json` decides what a power applies. Neither has a workbook
   * column — that is the whole reason the files exist — so both are authored
   * source by the same definition the doc comment above gives.
   *
   * Marking one power reactive changed 27 champions' generated powers and left
   * the stamp byte-identical. `reDerive` compares exactly that string, so a
   * battle stored before the edit would have re-derived against an engine where
   * its Slash champions suddenly counter, reported `ok`, and returned a different
   * past — the one thing Constitution XVI forbids, reachable by editing a file
   * the stamp could not see.
   */
  it('🔴 is sha256 of every authored source, not the workbook alone', () => {
    const expected = `c${createHash('sha256')
      .update(readFileSync(WORKBOOK))
      .update(normalized(OVERLAY))
      .update(normalized(RIDERS))
      .digest('hex')
      .slice(0, 12)}`;

    expect(contentVersion()).toBe(expected);
  });

  /**
   * 🔴 **The stamp must not depend on which machine checked the repo out.**
   *
   * `core.autocrlf=true` gives the JSON overlays CRLF on Windows and LF on Linux,
   * so a digest over their raw bytes produces two different content versions for
   * one identical repository — a stamp that tracks the checkout rather than the
   * content. It did exactly that for about an hour on 2026-08-02: a `git stash`
   * round trip moved `CONTENT_VERSION` without a character changing.
   *
   * Asserted on the bytes rather than by rebuilding, because the failure is in
   * the *reading* and a rebuild on one platform can only ever show one of the two
   * answers.
   */
  it('🔴 is identical whether the overlays are CRLF or LF on disk', () => {
    const lf = readFileSync(OVERLAY, 'utf8').replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');

    expect(crlf, 'the fixture has to actually differ, or this proves nothing').not.toBe(lf);

    const digest = (text: string): string =>
      createHash('sha256')
        .update(Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8'))
        .digest('hex');

    expect(digest(crlf)).toBe(digest(lf));
  });

  /**
   * 🔴 **And the overlays genuinely move it**, which the equality above cannot
   * show on its own — a build that ignored both files would still match a test
   * that also ignored them if the anchors were ever reordered wrong.
   *
   * Hashed here rather than rebuilt: the claim is that each file's bytes reach
   * the digest, and a differing byte in any one of them must produce a differing
   * stamp.
   */
  it('🔴 changes when an overlay changes, not only when the workbook does', () => {
    const stampOf = (overlay: Buffer, riders: Buffer): string =>
      createHash('sha256')
        .update(readFileSync(WORKBOOK))
        .update(overlay)
        .update(riders)
        .digest('hex')
        .slice(0, 12);

    const overlay = normalized(OVERLAY);
    const riders = normalized(RIDERS);
    const nudged = Buffer.concat([overlay, Buffer.from(' ')]);

    expect(stampOf(nudged, riders), 'the overlay is not in the digest').not.toBe(
      stampOf(overlay, riders),
    );
    expect(
      stampOf(overlay, Buffer.concat([riders, Buffer.from(' ')])),
      'the rider file is not in the digest',
    ).not.toBe(stampOf(overlay, riders));
  });

  it('is NOT a hash of the emitted roster', () => {
    const ofOutput = `c${createHash('sha256')
      .update(readFileSync(GENERATED))
      .digest('hex')
      .slice(0, 12)}`;

    expect(contentVersion()).not.toBe(ofOutput);
  });

  it('carries the "c" prefix that distinguishes it from an engine version', () => {
    // Constitution XVI: the battle record cannot be backfilled, so a swapped
    // engineVersion/contentVersion pair is unfixable after the fact. The prefix
    // makes the swap visible on sight rather than six months later.
    expect(contentVersion().startsWith('c')).toBe(true);
  });

  it('is stable across calls', () => {
    expect(contentVersion()).toBe(contentVersion());
  });
});
