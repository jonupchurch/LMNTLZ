import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { replay, replayEvents, resolveAction } from '../../resolver/resolve.js';
import { action, battle, bytes, BATTLE_ID, fixedSeed } from './fixtures.js';

/**
 * T009/T010 — **the constitutional property.**
 *
 * In-progress battle state is never stored, so every request re-derives the
 * battle from `(seed, log)`. If that is not exactly reproducible, a battle
 * changes underneath the player between one action and the next — the same
 * request, replayed, produces a different past.
 *
 * This was written against a stub before any resolution logic existed. It is
 * cheap now and impossible to retrofit honestly: a determinism test written
 * afterwards gets written around whatever nondeterminism is already there.
 */
describe('1,000 replays of one log', () => {
  const seed = fixedSeed();
  const initial = battle();
  const log = [action(1), action(2), action(3), action(4), action(5)];

  it('is byte-identical, not merely deep-equal', () => {
    const first = bytes(replay(seed, initial, log));

    for (let i = 0; i < 1_000; i++) {
      expect(bytes(replay(seed, initial, log)), `replay ${i}`).toBe(first);
    }
  });

  it('produces byte-identical packets too, not just a final state', () => {
    const first = bytes(replayEvents(seed, initial, log).events);

    for (let i = 0; i < 1_000; i++) {
      expect(bytes(replayEvents(seed, initial, log).events)).toBe(first);
    }
  });

  /**
   * **Out-of-order arrival must change nothing** (T010).
   *
   * Requests race, retries land late, and a proxy can reorder two in flight.
   * `sequence` is the truth; arrival order is noise. A resolver that trusted
   * array order would produce a different battle depending on the network.
   */
  it('is unchanged when the same actions arrive in a different order', () => {
    const canonical = bytes(replay(seed, initial, log));

    const shuffles = [
      [log[4]!, log[0]!, log[3]!, log[1]!, log[2]!],
      [log[2]!, log[1]!, log[0]!, log[4]!, log[3]!],
      [...log].reverse(),
    ];

    for (const shuffled of shuffles) {
      expect(bytes(replay(seed, initial, shuffled))).toBe(canonical);
    }
  });

  it('gives the same answer from two independently built identical states', () => {
    // Distinct object identities, same content. A cache keyed on identity would
    // pass every assertion above and fail this one.
    const a = battle();
    const b = battle();

    expect(a).not.toBe(b);
    expect(bytes(replay(seed, a, log))).toBe(bytes(replay(seed, b, log)));
  });

  it('does not mutate the state or the log it is given', () => {
    const stateBefore = bytes(initial);
    const logBefore = bytes(log);

    replay(seed, initial, log);
    replayEvents(seed, initial, log);
    resolveAction(seed, initial, log, {
      sequence: 6,
      actorInstanceId: 'a0',
      powerId: log[0]!.powerId,
      targetInstanceId: 'd0',
    }, BATTLE_ID);

    expect(bytes(initial)).toBe(stateBefore);
    expect(bytes(log)).toBe(logBefore);
  });

  /**
   * **The fresh-process case** (T010).
   *
   * Everything above runs inside one module registry with everything already
   * warm. This spawns a new process and compares its answer to ours, which is
   * what catches module-load order, a lazily-built cache and any top-level
   * side effect that happens to run before the first call in this file.
   */
  it('agrees with a freshly spawned process', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const script = `
      import { replay } from '${new URL('../../resolver/resolve.ts', import.meta.url).href}';
      import { action, battle, bytes, fixedSeed } from '${new URL('./fixtures.ts', import.meta.url).href}';
      const log = [action(1), action(2), action(3), action(4), action(5)];
      process.stdout.write(bytes(replay(fixedSeed(), battle(), log)));
    `;

    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    expect(output).toBe(bytes(replay(seed, initial, log)));
  });
});

/**
 * The draw cursor is a stable function of history.
 */
describe('the draw cursor', () => {
  const seed = fixedSeed();
  const initial = battle();

  it('advances monotonically and never overlaps', () => {
    let log = [] as ReturnType<typeof action>[];

    for (let n = 1; n <= 12; n++) {
      const { appendedAction } = resolveAction(
        seed,
        initial,
        log,
        { sequence: n, actorInstanceId: 'a0', powerId: action(1).powerId, targetInstanceId: 'd0' },
        BATTLE_ID,
      );

      const previous = log[log.length - 1];
      if (previous) {
        expect(appendedAction.drawIndexBefore).toBe(
          previous.drawIndexBefore + previous.drawsConsumed,
        );
      }

      log = [...log, appendedAction];
    }
  });

  it('uses one global counter per battle, not one per turn', () => {
    // Per-turn scoping would leave two actions in the same turn with identical
    // cursors — a divergence with no signal attached to it.
    let log = [] as ReturnType<typeof action>[];

    for (let n = 1; n <= 6; n++) {
      const { appendedAction } = resolveAction(
        seed,
        initial,
        log,
        { sequence: n, actorInstanceId: 'a0', powerId: action(1).powerId, targetInstanceId: 'd0' },
        BATTLE_ID,
      );
      log = [...log, appendedAction];
    }

    const cursors = log.map((a) => a.drawIndexBefore);
    expect(new Set(cursors).size).toBe(cursors.length);
  });
});
