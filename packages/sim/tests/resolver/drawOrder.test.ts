import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { damagePreview } from '../../rules/index.js';
import { replayEvents, resolveAction } from '../../resolver/resolve.js';
import type { BattleAction } from '../../resolver/replay.js';
import { action, battle, bytes, BATTLE_ID, fixedSeed } from './fixtures.js';

const AUTO = getHero('h01').powers.find((p) => p.tier === 0)!.id;

const play = (seedN: bigint, turns: number): BattleAction[] => {
  const seed = fixedSeed(seedN);
  const initial = battle();
  let log: BattleAction[] = [];

  for (let n = 1; n <= turns; n++) {
    const { appendedAction } = resolveAction(
      seed,
      initial,
      log,
      { sequence: n, actorInstanceId: 'a0', powerId: AUTO, targetInstanceId: 'd0' },
      BATTLE_ID,
    );
    log = [...log, appendedAction];
  }

  return log;
};

/**
 * T012 — the draw sequence is a stable function of history.
 */
describe('re-deriving a concluded battle from its recorded cursors', () => {
  it('matches every packet, action by action', () => {
    const seed = fixedSeed();
    const initial = battle();
    const log = play(0x0123456789abcdefn, 20);

    const { events } = replayEvents(seed, initial, log);
    expect(events).toHaveLength(log.length);

    // Re-resolving the whole log from its own recorded cursors must reproduce
    // the identical packet stream. If a cursor were wrong by one, this diverges
    // from the first affected action onward.
    const again = replayEvents(seed, initial, log);
    expect(bytes(again.events)).toBe(bytes(events));
  });

  it('reproduces every prefix consistently', () => {
    const seed = fixedSeed();
    const initial = battle();
    const log = play(0x0123456789abcdefn, 15);
    const full = replayEvents(seed, initial, log).events;

    for (let n = 1; n <= log.length; n++) {
      const prefix = replayEvents(seed, initial, log.slice(0, n)).events;
      // A prefix of the log must give a prefix of the packets. Anything else
      // means an action's outcome depends on actions that came after it.
      expect(bytes(prefix)).toBe(bytes(full.slice(0, n)));
    }
  });
});

/**
 * T027 — **one draw decides a hit, and consumption is genuinely lazy.**
 *
 * A missed attack consumes **1** index; a landed one consumes **2** (hit, then
 * crit). That difference is what proves the resolver skips the crit draw rather
 * than taking it and discarding it — "lazy" is not an order, and an
 * eager-with-discards implementation would consume 2 either way and look
 * identical from outside.
 */
describe('draw consumption', () => {
  it('spends 1 index on a miss and 2 on a hit', () => {
    const seed = fixedSeed();
    const initial = battle();
    const log = play(0x0123456789abcdefn, 60);
    const { events } = replayEvents(seed, initial, log);

    /**
     * **The board empties before 60 auto-attacks land.** Since a health bar
     * became `Toughness × 8` the target is gone partway through, and an action
     * with no legal target runs no contest at all — it consumes 0 draws, which
     * is neither a hit nor a miss and is not a sample of anything.
     *
     * Those are excluded, and then asserted to be a **suffix**: a no-contest
     * action in the *middle* would mean targeting had broken rather than the
     * battle having ended, and quietly skipping it is exactly how that bug
     * would survive a green suite.
     */
    const firstIdle = log.findIndex((a) => a.drawsConsumed === 0n);
    const contested = firstIdle === -1 ? events.length : firstIdle;

    expect(contested).toBeGreaterThan(0);
    for (let i = contested; i < events.length; i++) {
      expect(log[i]!.drawsConsumed, `action ${i} should be past the board emptying`).toBe(0n);
    }

    let misses = 0;
    let hits = 0;

    for (const [i, event] of events.slice(0, contested).entries()) {
      const consumed = log[i]!.drawsConsumed;
      if (event.hit) {
        expect(consumed, `action ${i} landed`).toBe(2n);
        hits++;
      } else {
        expect(consumed, `action ${i} missed`).toBe(1n);
        misses++;
      }
    }

    // The sample has to contain both, or the assertion above proves nothing.
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  it('never overlaps two actions’ draw ranges', () => {
    const log = play(0xfeedfacecafebeefn, 40);

    for (let i = 1; i < log.length; i++) {
      const previous = log[i - 1]!;
      expect(log[i]!.drawIndexBefore).toBe(previous.drawIndexBefore + previous.drawsConsumed);
    }
  });

  it('observes about the hit rate the rules predicted', () => {
    const seed = fixedSeed();
    const initial = battle();
    const expected = damagePreview(initial, 'a0', AUTO, 'd0').hitProbability;

    const log = play(0x0123456789abcdefn, 400);
    const { events } = replayEvents(seed, initial, log);

    // Only actions that actually ran a contest. Once the reachable defenders
    // fall, the attacker has no legal target and passes — see the test below.
    const contested = events.filter((_, i) => log[i]!.drawsConsumed > 0n);

    expect(contested.length).toBeGreaterThan(20);
    expect(contested.filter((e) => e.hit).length / contested.length).toBeCloseTo(expected, 1);
  });

  /**
   * **A pass and a miss are the same packet, and that is worth knowing.**
   *
   * A hero with no legal target passes (FR-011). It produces `hit: false`,
   * exactly like a swing that missed, because `ResolvedPacket` in
   * `contracts/resolver.d.ts` has one boolean and no third state.
   *
   * The two are distinguishable — a pass consumes **0** draws and a miss
   * consumes **1** — but only by reading the action alongside the packet. A
   * replay viewer reading packets alone would render "missed" for a hero that
   * never swung. Flagged rather than fixed: adding a field to `ResolvedPacket`
   * is a contract change, and feature 008 is the consumer that would care.
   */
  it('reports a pass as an uncontested miss, distinguishable only by draw count', () => {
    const seed = fixedSeed();
    const initial = battle();
    const log = play(0x0123456789abcdefn, 400);
    const { events } = replayEvents(seed, initial, log);

    const passes = events.filter((_, i) => log[i]!.drawsConsumed === 0n);
    expect(passes.length).toBeGreaterThan(0);

    for (const pass of passes) {
      expect(pass.hit).toBe(false);
      expect(pass.damage).toBe(0);
    }
  });
});

/**
 * T038 — **the adversarial iteration-order test.**
 *
 * Shuffle what the resolver is handed and confirm the answer does not move. If
 * it does, an implicit iteration order is load-bearing somewhere — a `Map`
 * preserving insertion order, an object with integer-like keys, a `Set`. Those
 * are replay hazards that do not look like one, and they diverge across engines
 * rather than failing locally.
 */
describe('no implicit iteration order is load-bearing', () => {
  it('is unchanged when the log arrives shuffled', () => {
    const seed = fixedSeed();
    const initial = battle();
    const log = play(0x0123456789abcdefn, 12);
    const canonical = bytes(replayEvents(seed, initial, log));

    // A deterministic set of shuffles, so a failure is reproducible.
    for (let rotation = 1; rotation < log.length; rotation++) {
      const rotated = [...log.slice(rotation), ...log.slice(0, rotation)];
      expect(bytes(replayEvents(seed, initial, rotated)), `rotation ${rotation}`).toBe(
        canonical,
      );
    }

    expect(bytes(replayEvents(seed, initial, [...log].reverse()))).toBe(canonical);
  });

  it('is unchanged when the hero array is reordered', () => {
    const seed = fixedSeed();
    const log = [action(1), action(2), action(3)];

    const normal = battle();
    const reordered = { ...normal, heroes: [...normal.heroes].reverse() };

    // The heroes are the same heroes in the same seats. Only the array order
    // differs, and nothing may depend on it.
    expect(bytes(replayEvents(seed, reordered, log).events)).toBe(
      bytes(replayEvents(seed, normal, log).events),
    );
  });
});
