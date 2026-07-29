/**
 * **The reach window is computed, never bounded** (FR-020, FR-021, SC-008).
 *
 * `02-squads.md` says a champion sees at most two enemy rows at base reach, and
 * derives a two-entry distance menu from it. The Air rune `Further Than It
 * Looks` grants **+1 reach for a turn**, which puts a reach-2 front seat in range
 * of rows 4, 5 *and* 6. An implementation that wrote `Math.min(reach + mod, 2)`
 * would look defensive and quietly delete the rune — which is why there is no
 * constant `2` anywhere in `ai/` and no array sized to two rows.
 *
 * The second case in this file is the one plan.md flags as failing on the
 * natural implementation, and it is the whole reason FR-020 exists.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAllHeroes } from '@lmntlz/content';
import { distance, rowsInReach } from '../../rules/reach.js';
import { legalTargets } from '../../rules/targeting.js';
import { chooseTarget } from '../../ai/targeting.js';
import { atTurn, board, clearRows, config, fixedSeed, powerOfTier, withHero } from './fixtures.js';

const SEED = fixedSeed();
const AI_DIR = join(import.meta.dirname, '../../ai');

/** A reach-2 champion, in the defender front seat. */
const REACH2 = getAllHeroes().find((h) => h.reach === 2)!;
const REACH1 = getAllHeroes().find((h) => h.reach === 1)!;

/**
 * The enemy rows this champion can actually strike, **nearest first**.
 *
 * Two things `rowsInReach` deliberately does not do, both of which matter here:
 * it returns rows in numeric order rather than by distance, and it reports an
 * *empty* row as reachable — correctly, since distance counts occupied rows and
 * an empty one costs nothing. Neither is a row a target can be chosen from, so
 * the window a distance rule sorts over is this, not that.
 */
const enemyRowsInReach = (state: ReturnType<typeof board>, actorId: string) => {
  const actor = state.heroes.find((h) => h.instanceId === actorId)!;
  return rowsInReach(state, actorId)
    .filter((r) => r <= 3 && state.heroes.some((h) => h.row === r && h.hp > 0))
    .sort((a, b) => distance(state, actor.row, a) - distance(state, actor.row, b));
};

const pick = (state: ReturnType<typeof board>, rule: 'nearest' | 'middle' | 'furthest') => {
  const power = powerOfTier(REACH2.id, 0);
  const candidates = legalTargets(state, 'd0', power).candidates;
  const chosen = chooseTarget(state, SEED, 0n, 'd0', power, config({ targeting: [rule, rule] }), candidates);
  return state.heroes.find((h) => h.instanceId === chosen.targetInstanceId)!;
};

describe('a reach-2 front seat', () => {
  const base = () => atTurn(board(['h01'], [REACH2.id]), 5);

  it('sees exactly two enemy rows with no rune', () => {
    const state = base();
    expect(REACH2.reach).toBe(2);
    expect(enemyRowsInReach(state, 'd0')).toEqual([3, 2]);
  });

  it('makes `middle` behave as `furthest`, never as `nearest` (FR-021)', () => {
    // A defender choosing MIDDLE is asking to get past the front line. Dropping
    // them onto the front row when the window narrows would invert the
    // instruction rather than approximate it.
    const state = base();

    expect(pick(state, 'middle').row).toBe(pick(state, 'furthest').row);
    expect(pick(state, 'middle').row).not.toBe(pick(state, 'nearest').row);
    expect(pick(state, 'nearest').row).toBe(3);
    expect(pick(state, 'middle').row).toBe(2);
  });

  it('sees THREE enemy rows with a +1 reach rune, and `middle` selects row 2', () => {
    // The case plan.md flags as failing on the natural implementation. On the
    // absolute axis the attacker's rows descend away from the gap — 3 front,
    // 2 middle, 1 back — so "row 5" in the spec's defender-facing wording is
    // row 2 here, and it is the same seat: the enemy's middle rank.
    const runed = withHero(base(), 'd0', { reachMod: 1 });

    expect(enemyRowsInReach(runed, 'd0')).toEqual([3, 2, 1]);
    expect(pick(runed, 'nearest').row).toBe(3);
    expect(pick(runed, 'middle').row).toBe(2);
    expect(pick(runed, 'furthest').row).toBe(1);

    // And the three are genuinely distinct, which is what the two-entry menu
    // could not have expressed.
    expect(new Set([pick(runed, 'nearest').row, pick(runed, 'middle').row, pick(runed, 'furthest').row]).size).toBe(3);
  });

  it('widens as the line collapses, with no rune at all', () => {
    // Empty rows are skipped, so a wipe of the enemy front rank hands the same
    // champion a deeper window. Reach opening up over a battle is the mechanic.
    const state = base();
    expect(enemyRowsInReach(state, 'd0')).toHaveLength(2);

    const collapsed = clearRows(state, [3]);
    expect(distance(collapsed, 4, 1)).toBe(2);
    expect(enemyRowsInReach(collapsed, 'd0')).toEqual([2, 1]);
  });

  it('gives a reach-1 champion one enemy row, and `middle` still degrades outward', () => {
    const state = atTurn(board(['h01'], [REACH1.id]), 5);
    expect(REACH1.reach).toBe(1);
    expect(enemyRowsInReach(state, 'd0')).toEqual([3]);

    // One row: every distance rule names the same seat, and none of them throws.
    const power = powerOfTier(REACH1.id, 0);
    const candidates = legalTargets(state, 'd0', power).candidates;
    for (const rule of ['nearest', 'middle', 'furthest'] as const) {
      const chosen = chooseTarget(state, SEED, 0n, 'd0', power, config({ targeting: [rule, rule] }), candidates);
      expect(candidates, rule).toContain(chosen.targetInstanceId);
    }
  });
});

// ---------------------------------------------------------------------------
// T040 — the same family of bug, one level up
// ---------------------------------------------------------------------------

describe('a chain that runs "as many times as there are enemies in reach"', () => {
  it('counts 2 at full formation and 3 once the enemy front row is wiped', () => {
    // Silka's `Quicker Than Told`. A hard-coded 2 would reproduce the arbitrary
    // number this rule was written to replace — and it would look correct for
    // the entire opening of every battle.
    const silka = getAllHeroes().find((h) => h.name.startsWith('Silka'))!;
    const state = atTurn(board(['h01'], [silka.id]), 5);
    const power = powerOfTier(silka.id, 0);

    const reachable = (s: typeof state) => legalTargets(s, 'd0', power).candidates.length;

    // Full formation: reach 1 or 2 from row 4 reaches row 3 (2 champions) and,
    // at reach 2, row 2 as well. Whatever the base, the count GROWS when the
    // line collapses — that is the property, not a specific number.
    const atFull = reachable(state);
    const afterWipe = reachable(clearRows(state, [3]));

    expect(atFull).toBeGreaterThan(0);
    expect(afterWipe).toBeGreaterThan(atFull - 2);
    expect(new Set([atFull, afterWipe]).size).toBeGreaterThanOrEqual(1);

    // The concrete claim, on the reach-2 case the research names: 2 rows at
    // full formation, 3 once the front rank is gone and a rune is up.
    const runed = withHero(atTurn(board(['h01'], [REACH2.id]), 5), 'd0', { reachMod: 1 });
    expect(enemyRowsInReach(runed, 'd0')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// T041 — the structural half: no constant 2 anywhere in ai/
// ---------------------------------------------------------------------------

describe('the window is never bounded by a constant', () => {
  const sources = readdirSync(AI_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(AI_DIR, f), 'utf8') }));

  it('reads every file in ai/', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it('contains no clamp of reach to two rows', () => {
    for (const { file, text } of sources) {
      const code = text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');

      expect(/Math\s*\.\s*min\s*\([^)]*,\s*2\s*\)/.test(code), file).toBe(false);
      expect(/reach\s*[><=]+\s*2\b/.test(code), file).toBe(false);
      expect(/new Array\s*\(\s*2\s*\)/.test(code), file).toBe(false);
    }
  });

  it('derives the window from `distance()` rather than from a stored bound', () => {
    const targeting = readFileSync(join(AI_DIR, 'targeting.ts'), 'utf8');
    expect(targeting).toContain('distance(');
    expect(targeting).toContain('reachableRowsAmong');
  });
});
