/**
 * `@lmntlz/sim/resolver` — consumes randomness. **Server only.**
 *
 * Never imported by `apps/client`, at any depth. Feature 002's `purity.test.ts`
 * walks the client's import graph and fails the build if it is.
 *
 * **Constitution XII — the seed never leaves the server.** `Seed` has no JSON
 * representation and no revealing `toString`, so a careless `res.json(...)`
 * cannot leak it. That is enforcement by construction, not by remembering.
 */

export { SeedLeakError, createSeed } from './seed.js';
export type { Seed } from './seed.js';

// NOTE: `persistSeed` and `restoreSeed` are deliberately NOT re-exported here
// (FR-005, FR-008). They exist for the one repository function that writes the
// battle row, and reaching them means importing `./seed.js` by path — a
// deliberate act rather than an autocomplete.

export { draw, drawBelow, drawInt, drawUnit } from './rng.js';

export { nextDrawIndex, orderedLog, toReplayLog } from './replay.js';
export type {
  BattleAction,
  DrawKind,
  Provenance,
  ReDeriveResult,
  ReplayLog,
} from './replay.js';

export { reDerive, replay, replayEvents, resolveAction, resolveDefenderTurn } from './resolve.js';
export type { ActionIntent, DefenderChooser, ResolvedPacket } from './resolve.js';
