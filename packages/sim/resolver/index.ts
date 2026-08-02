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

export {
  reDerive,
  replay,
  replayEvents,
  resolveAction,
  resolveDefenderTurn,
  /**
   * **The primitive, exported for feature 007's turn loop.**
   *
   * `replay` and `resolveAction` both take a log and re-derive from the
   * beginning, which is right for their callers and quadratic for a loop that
   * folds several turns into one packet: resolving five turns at turn 80 would
   * replay 80 turns five times. `resolveOne` takes a *state* and a draw index,
   * so a caller stepping the battle forward pays for each turn once.
   *
   * It resolves exactly one intent and touches only HP. **Accumulators,
   * cooldowns, statuses and `heroTurn` are the caller's**, which is why this is
   * a primitive rather than a turn.
   */
  resolveOne,
  /**
   * **Turn start's own draw** (021 US3). The turn loop owns when a turn begins and
   * this module owns every draw, so the one thing that is both is exported rather
   * than reimplemented on the far side of the boundary.
   */
  rollTurnStart,
} from './resolve.js';
export type { ActionIntent, DefenderChooser, ResolvedPacket, Resolution } from './resolve.js';
