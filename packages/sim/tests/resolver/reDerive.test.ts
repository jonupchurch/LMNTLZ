import { describe, expect, it } from 'vitest';
import { reDerive, replayEvents, resolveAction } from '../../resolver/resolve.js';
import { toReplayLog } from '../../resolver/replay.js';
import type { BattleAction } from '../../resolver/replay.js';
import { action, battle, bytes, BATTLE_ID, fixedSeed } from './fixtures.js';

const PROVENANCE = {
  battleId: BATTLE_ID,
  engineVersion: 'e0.1.0',
  contentVersion: 'c-test',
};

const threeActions = (): BattleAction[] => {
  const seed = fixedSeed();
  const initial = battle();
  let log: BattleAction[] = [];

  for (let n = 1; n <= 3; n++) {
    const { appendedAction } = resolveAction(
      seed,
      initial,
      log,
      { sequence: n, actorInstanceId: 'a0', powerId: action(1).powerId, targetInstanceId: 'd0' },
      BATTLE_ID,
    );
    log = [...log, appendedAction];
  }

  return log;
};

/**
 * T034 — **a version mismatch is returned, never thrown, and never papered over.**
 *
 * An in-flight battle under a changed engine cannot be continued honestly:
 * quietly continuing it produces a battle that is neither the old engine's nor
 * the new one's. Throwing would be equally wrong — it turns a knowable answer
 * into an exception the caller has to guess at. The resolver's job is to give
 * the answer; feature 007 decides what happens next.
 */
describe('reDerive', () => {
  const seed = fixedSeed();
  const initial = battle();
  const log = threeActions();

  it('re-derives cleanly when both versions match', () => {
    const result = reDerive(seed, initial, PROVENANCE, log, {
      engineVersion: PROVENANCE.engineVersion,
      contentVersion: PROVENANCE.contentVersion,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(bytes(result.state)).toBe(bytes(replayEvents(seed, initial, log).state));
    }
  });

  it('returns engine-version rather than throwing, and returns no state', () => {
    const result = reDerive(seed, initial, PROVENANCE, log, {
      engineVersion: 'e0.2.0',
      contentVersion: PROVENANCE.contentVersion,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'engine-version',
      was: 'e0.1.0',
      now: 'e0.2.0',
    });
    expect(result).not.toHaveProperty('state');
  });

  /**
   * Checked **separately** from the engine version (Constitution XVI).
   *
   * They fail for different reasons — the rules changed versus the numbers
   * changed — and a caller may well treat them differently. Collapsing them
   * into one "version mismatch" would throw away the only information that
   * distinguishes a balance patch from an engine deploy.
   */
  it('returns content-version separately, with its own reason', () => {
    const result = reDerive(seed, initial, PROVENANCE, log, {
      engineVersion: PROVENANCE.engineVersion,
      contentVersion: 'c-different',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'content-version',
      was: 'c-test',
      now: 'c-different',
    });
  });

  it('reports the engine mismatch first when both differ', () => {
    // Deterministic precedence, so two investigators reading the same failure
    // get the same story. The engine is the more fundamental change.
    const result = reDerive(seed, initial, PROVENANCE, log, {
      engineVersion: 'e0.2.0',
      contentVersion: 'c-different',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('engine-version');
  });

  it('never throws, whatever the versions are', () => {
    for (const engineVersion of ['', 'e0.1.0', 'nonsense']) {
      for (const contentVersion of ['', 'c-test', 'nonsense']) {
        expect(() =>
          reDerive(seed, initial, PROVENANCE, log, { engineVersion, contentVersion }),
        ).not.toThrow();
      }
    }
  });
});

/**
 * T035 — the replay artifact.
 */
describe('the replay log', () => {
  const seed = fixedSeed();
  const initial = battle();
  const log = threeActions();
  const { events } = replayEvents(seed, initial, log);
  const artifact = toReplayLog(seed, PROVENANCE, events, null);

  it('carries no seed and no draw indices', () => {
    const serialised = bytes(artifact);

    expect(serialised).not.toContain('drawIndexBefore');
    expect(serialised).not.toContain('drawsConsumed');
    expect(serialised).not.toContain('seed');
  });

  it('carries one event per action, in order', () => {
    expect(artifact.events).toHaveLength(log.length);
  });

  it('is a record of what happened, not a recipe for recomputing it', () => {
    // Constitution XVI. Replays are played back from these packets and never
    // re-simulated, which is what makes a balance patch structurally unable to
    // change a past battle's outcome.
    for (const event of artifact.events) {
      expect(event).toHaveProperty('hit');
      expect(event).toHaveProperty('damage');
      expect(event).not.toHaveProperty('drawIndexBefore');
      expect(event).not.toHaveProperty('probability');
    }
  });

  it('survives an engineVersion change unaltered', () => {
    // The artifact records the version it was made under. Changing the current
    // engine does not rewrite history — that is the whole point.
    const before = bytes(artifact);
    const other = toReplayLog(seed, { ...PROVENANCE, engineVersion: 'e9.9.9' }, events, null);

    expect(bytes(artifact)).toBe(before);
    expect(other.engineVersion).toBe('e9.9.9');
    expect(bytes(other.events)).toBe(bytes(artifact.events));
  });

  it('stamps both versions, kept separate', () => {
    expect(artifact.engineVersion).toBe('e0.1.0');
    expect(artifact.contentVersion).toBe('c-test');
    expect(artifact.engineVersion).not.toBe(artifact.contentVersion);
  });

  it('is frozen, so a consumer cannot edit history in place', () => {
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.events)).toBe(true);
  });
});
