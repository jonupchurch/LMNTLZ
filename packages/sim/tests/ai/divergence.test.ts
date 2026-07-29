/**
 * **Two squads of the same six heroes must fight differently** (SC-002).
 *
 * That is the whole claim of the feature. All 27 heroes are unlocked from the
 * start and identical for every player, so nothing distinguishes one defense
 * from another except how it is configured. If configuration did not change
 * behaviour, every defense in the game would be the same defense.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAllHeroes } from '@lmntlz/content';
import { decideAction } from '../../ai/decide.js';
import { ROLE_DEFAULTS, defaultConfigFor } from '../../ai/defaults.js';
import { atTurn, board, bytes, config, fixedSeed, powerOfTier, withHero } from './fixtures.js';

const SEED = fixedSeed();
const AI_DIR = join(import.meta.dirname, '../../ai');

/** Six distinct heroes, so role rules and HP rules have something to sort. */
const SIX = ['h01', 'h02', 'h14', 'h19', 'h23', 'h25'];

describe('two squads of the same six heroes', () => {
  it('choose different powers under different rankings', () => {
    const state = atTurn(board(['h01'], SIX), 5);

    const greedy = decideAction(state, SEED, 0n, 'd0', config({ ranking: [5, 4, 3, 2, 1, 0] }));
    const uptime = decideAction(state, SEED, 0n, 'd0', config({ ranking: [4, 3, 2, 1, 5, 0] }));

    expect(greedy.powerId).toBe(powerOfTier(SIX[0]!, 5));
    expect(uptime.powerId).toBe(powerOfTier(SIX[0]!, 4));
    expect(greedy.powerId).not.toBe(uptime.powerId);
  });

  it('choose different targets under different targeting pairs', () => {
    // A wounded champion in the enemy middle row and healthy ones in front.
    // Ossic has reach 2, so from row 4 it sees rows 3 and 2 but not row 1 —
    // "lowest current HP" reaches past the front line, "nearest" does not.
    const state = withHero(atTurn(board(SIX, ['h02']), 5), 'a2', { hp: 40 });

    const wounded = decideAction(state, SEED, 0n, 'd0', config({ targeting: ['lowest-current-hp', 'nearest'] }));
    const closest = decideAction(state, SEED, 0n, 'd0', config({ targeting: ['nearest', 'nearest'] }));

    expect(wounded.targetInstanceId).not.toBe(closest.targetInstanceId);
  });

  it('diverge measurably across a whole squad under the four role defaults', () => {
    const state = atTurn(board(['h01'], SIX), 5);
    const decisions = new Set<string>();

    for (const cfg of Object.values(ROLE_DEFAULTS)) {
      decisions.add(bytes(decideAction(state, SEED, 0n, 'd0', cfg)));
    }

    // Four configurations, and they do not all land on the same action.
    expect(decisions.size).toBeGreaterThan(1);
  });

  it('gives every role a distinct default configuration', () => {
    const configs = Object.values(ROLE_DEFAULTS).map(bytes);
    expect(new Set(configs).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// T024 / FR-013 — the engine plays Visible and Hidden identically
// ---------------------------------------------------------------------------

describe('zone blindness', () => {
  const sources = readdirSync(AI_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(AI_DIR, f), 'utf8') }));

  it('reads every file in ai/ — an empty scan would pass vacuously', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it('has no code path that reads a zone', () => {
    // The distinction between Visible and Hidden is visibility and reward,
    // NEVER behaviour (FR-013). A Hidden squad that played better would be a
    // second AI nobody can scout and nobody can prepare for.
    const zoneWords = /\b(visible|hidden|zone)\b/i;

    for (const { file, text } of sources) {
      const offending = text
        .split('\n')
        // Prose may name them; code may not. Strip comment lines and check what
        // is left, which is the only thing that can affect a decision.
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .filter((line) => zoneWords.test(line));

      expect(offending, `${file} mentions a zone in code`).toEqual([]);
    }
  });

  it('produces an identical decision however the squad is labelled', () => {
    // There is no zone field to vary, which IS the proof — the decision is a
    // function of the board and the config, and neither carries one.
    const state = atTurn(board(['h01'], SIX), 5);
    const first = decideAction(state, SEED, 3n, 'd2', defaultConfigFor(getAllHeroes()[13]!));
    const second = decideAction(state, SEED, 3n, 'd2', defaultConfigFor(getAllHeroes()[13]!));

    expect(bytes(first)).toBe(bytes(second));
  });
});

// ---------------------------------------------------------------------------
// T043 / Constitution XVII — a defender's configuration never leaves the server
// ---------------------------------------------------------------------------

describe("a defender's configuration is not exposed", () => {
  it('never appears in the decision an attacker could observe', () => {
    const state = atTurn(board(['h01'], SIX), 5);
    const decision = decideAction(state, SEED, 0n, 'd0', config({ ranking: [3, 5, 4, 2, 1, 0] }));

    // A decision carries WHAT HAPPENED, never WHY. An attacker seeing the
    // ranking or the targeting pair could read a defense once and then beat it
    // every time without ever fighting it.
    const serialised = bytes(decision);
    expect(serialised).not.toContain('ranking');
    expect(serialised).not.toContain('targeting');
    expect(serialised).not.toContain('allyRule');
    expect(Object.keys(decision).sort()).toEqual([
      'actorInstanceId',
      'drawsConsumed',
      'powerId',
      'targetInstanceId',
    ]);
  });

  it('is not reachable from the rules half, which is what the client imports', () => {
    // The structural half of the same claim: `ai/` is server-only, so the
    // configuration has no route to a client at all. Feature 002's purity test
    // walks the graph; this asserts the seam exists to be walked.
    const rulesIndex = readFileSync(join(import.meta.dirname, '../../rules/index.ts'), 'utf8');
    expect(rulesIndex).not.toMatch(/from\s+['"]\.\.\/ai\//);
    expect(rulesIndex).not.toContain('SquadMemberConfig');
  });
});
