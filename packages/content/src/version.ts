/**
 * The content stamp (FR-016, T035).
 *
 * `"c" + sha256(bytes of resources/characters/hero-stats.xlsx)[0:12]`.
 *
 * **The `c` prefix is load-bearing.** `engineVersion` and `contentVersion` are
 * both opaque short strings written side by side on every battle record, and
 * Constitution XVI says the record can never be backfilled — so a swapped pair
 * is unfixable after the fact. A prefix makes the swap visible on sight instead
 * of six months later.
 */

import { CONTENT_VERSION } from './version.generated.js';

export function contentVersion(): string {
  return CONTENT_VERSION;
}
