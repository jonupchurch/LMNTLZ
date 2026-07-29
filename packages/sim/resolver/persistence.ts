/**
 * The seed's **only** route to and from storage.
 *
 * `resolver/index.ts` deliberately does not re-export these, so a seed cannot be
 * persisted by autocomplete. Reaching them means importing
 * `@lmntlz/sim/resolver/persistence` by name — a line that shows up in a review
 * and that a grep for the subpath finds exhaustively.
 *
 * **Two functions and nothing else.** `seed.ts` also exports `seedValue`, which
 * hands back the raw `bigint` and is what the RNG uses internally; exposing this
 * module as a whole subpath would have exported that too, and a caller with the
 * value has defeated every guarantee the `Seed` type provides.
 */

export { persistSeed, restoreSeed } from './seed.js';
