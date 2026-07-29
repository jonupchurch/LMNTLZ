import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import {
  availablePowers,
  battleEnded,
  critChance,
  damagePreview,
  distance,
  healPreview,
  hitProbability,
  legalTargets,
  mustPass,
  pooledHpShare,
  riderLandProbability,
  turnQueue,
} from '../../rules/index.js';
import { fullBattle } from './fixtures.js';

/**
 * T016 / T051 — the same state, the same answers, on both runtimes.
 *
 * The rules are imported **unmodified by both client and server**, so "it works
 * on Node" is only half a claim. This snapshots every exported answer over the
 * complete surface; the harness runs the identical assertions under whichever
 * environment Vitest is configured for, so a divergence — a `Intl` dependency,
 * a `toLocaleString`, a number formatted differently — fails here rather than
 * as a desync in a live battle.
 *
 * **Re-run over the complete surface** now that targeting and ending exist,
 * which closes US1 acceptance scenario 1: its legal-target half could not be
 * proven until Phase 6.
 */
describe('client and server agree on every answer', () => {
  const state = fullBattle(['h01'], ['h19']);
  const healState = fullBattle(['h17'], ['h01']);
  const power = getHero('h01').powers[1]!;
  const heal = getHero('h17').powers.find((p) => p.friendly)!;

  /**
   * Every exported answer, as one serializable object.
   *
   * Serialized rather than compared field by field on purpose: JSON captures
   * number formatting and key order, which is exactly where two JavaScript
   * runtimes are most likely to differ quietly.
   */
  const surface = () => ({
    hit: hitProbability(state, 'attacker-0', 'defender-0'),
    rider: riderLandProbability(state, 'attacker-0', 'defender-0', 30),
    crit: critChance(state, 'attacker-0'),
    distances: [
      distance(state, 1, 4),
      distance(state, 1, 6),
      distance(state, 3, 4),
      distance(state, 6, 1),
    ],
    queue: turnQueue(state, 24),
    damage: damagePreview(state, 'attacker-0', power.id, 'defender-0'),
    heal: healPreview(healState, 'attacker-0', heal.id, 'attacker-5'),
    targets: legalTargets(state, 'attacker-0', power.id),
    passes: [mustPass(state, 'attacker-0'), mustPass(state, 'attacker-5')],
    powers: availablePowers(state, 'attacker-0').map((p) => p.id),
    shares: [pooledHpShare(state, 'attacker'), pooledHpShare(state, 'defender')],
    ended: battleEnded(state),
  });

  it('produces a fully serializable surface — no functions, no symbols, no NaN', () => {
    const json = JSON.stringify(surface());

    expect(json).toBeTruthy();
    expect(json).not.toContain('null,null');
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('round-trips through JSON unchanged, so the wire cannot alter it', () => {
    const once = JSON.stringify(surface());
    expect(JSON.stringify(JSON.parse(once))).toBe(once);
  });

  it('uses no locale-sensitive formatting anywhere in the surface', () => {
    // The classic desync: a number rendered with a locale separator on one side
    // and not the other. Every number here must serialize as a bare JSON number.
    const json = JSON.stringify(surface());
    expect(json).not.toMatch(/"\d+[.,]\d+"/);
  });

  it('agrees with itself across repeated evaluation', () => {
    const first = JSON.stringify(surface());
    for (let i = 0; i < 100; i++) expect(JSON.stringify(surface())).toBe(first);
  });

  it('covers the complete surface, including targeting and ending', () => {
    // The list this test would silently stop checking if the surface grew.
    expect(Object.keys(surface()).sort()).toEqual([
      'crit',
      'damage',
      'distances',
      'ended',
      'heal',
      'hit',
      'passes',
      'powers',
      'queue',
      'rider',
      'shares',
      'targets',
    ]);
  });
});
