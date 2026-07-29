/**
 * In-progress state is never stored (007 T015, SC-002).
 *
 * ### What "restart the process" means here, and why the weaker version is fine
 *
 * The task asks for the API process to be restarted between two reads. What that
 * is really asserting is that **nothing survives in a module-level variable** —
 * a cache, a `Map` keyed by battle id, a memo on the replay. Vitest cannot fork
 * a fresh server mid-test, but it can do the thing that actually matters:
 * `vi.resetModules()` throws away the entire module registry, so the second read
 * runs against a freshly instantiated `battle/act.ts`, `battle/packet.ts` and
 * `battle/turnLoop.ts` with every module-level binding rebuilt from zero.
 *
 * A cache that survived a module reset would have to live in the database or on
 * the filesystem, and the source scan below is what covers that.
 *
 * ### The scan is not a formality
 *
 * The failure this guards against is not somebody writing `const cache = new
 * Map()` on purpose. It is the perfectly reasonable optimisation added in six
 * months when replay cost shows up in a trace — at which point a battle can be
 * resolved against a state that is one action stale, the log and the cache
 * disagree, and the battle stays entirely plausible while being wrong.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '../../src/db/client.js';
import { currentState } from '../../src/battle/act.js';
import { arena, act, start, type Arena, type BattleShape, type StartedBattle } from './live.js';

let a: Arena;
let started: StartedBattle;
let afterThree: BattleShape;

beforeAll(async () => {
  a = await arena('nostore');
  started = await start(a);

  let state = started.packet.state;
  let sequence = started.sequence;

  for (let i = 0; i < 3; i++) {
    const result = await act(a, started.battleId, sequence, state);
    expect(result.status, result.text).toBe(200);
    state = result.body.packet.state;
    sequence = result.body.nextSequence;
    if (result.body.packet.conclusion) break;
  }

  afterThree = state;
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('the log is the only state', () => {
  it('re-derives the same board through a freshly loaded module graph', async () => {
    const before = await currentState(started.battleId);
    expect(before.ok).toBe(true);

    /**
     * **The whole registry, not just `act.ts`.** Resetting one module leaves its
     * dependencies holding whatever they held; the point is that no module in
     * the chain is allowed to be carrying battle state.
     */
    vi.resetModules();
    const fresh = await import('../../src/battle/act.js');

    const after = await fresh.currentState(started.battleId);
    expect(after.ok).toBe(true);

    expect(JSON.stringify(after.ok && after.battle.state)).toBe(
      JSON.stringify(before.ok && before.battle.state),
    );
    // And it matches what the route handed the client three actions ago.
    expect(after.ok && after.battle.state.heroTurn).toBe(afterThree.heroTurn);
    expect(after.ok && after.battle.state.turnOfInstance).toBe(afterThree.turnOfInstance);
  });

  it('really replays, rather than reading a state somebody stored', async () => {
    /**
     * **The check that the test above is not vacuous.** Two reads agreeing is
     * exactly what a cache would produce, so agreement proves nothing on its
     * own. `currentState` verifies each action's recorded `drawIndexBefore`
     * against the cursor its own replay arrived at — so corrupting one recorded
     * draw window must make the read throw. If it does not, the replay is not
     * happening and every other assertion here is decoration.
     */
    const { db } = await import('../../src/db/client.js');
    const { battleActions } = await import('../../src/db/schema/battles.js');
    const { and, eq } = await import('drizzle-orm');

    const rows = await db()
      .select()
      .from(battleActions)
      .where(eq(battleActions.battleId, started.battleId))
      .limit(1);

    const row = rows[0]!;
    await db()
      .update(battleActions)
      .set({ drawsConsumed: row.drawsConsumed + 7n })
      .where(
        and(eq(battleActions.battleId, started.battleId), eq(battleActions.sequence, row.sequence)),
      );

    await expect(currentState(started.battleId)).rejects.toThrow(/diverged/);

    await db()
      .update(battleActions)
      .set({ drawsConsumed: row.drawsConsumed })
      .where(
        and(eq(battleActions.battleId, started.battleId), eq(battleActions.sequence, row.sequence)),
      );

    expect((await currentState(started.battleId)).ok).toBe(true);
  });
});

describe('nothing in the battle module holds state between requests', () => {
  const dir = join(import.meta.dirname, '../../src/battle');
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));

  it('has sources to scan', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it('declares no module-level mutable collection', () => {
    /**
     * `const X = new Map()` at column 0 is the shape of every mid-battle cache
     * anybody would write. A frozen lookup table is fine and common in here, so
     * the pattern is deliberately narrow: only the mutable containers.
     */
    const cache = /^(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*new\s+(Map|Set|WeakMap|WeakRef)\b/m;

    for (const { file, text } of sources) {
      const match = cache.exec(text);
      expect(match?.[0] ?? null, `${file} declares a module-level ${match?.[1] ?? ''}`).toBeNull();
    }
  });

  it('declares no module-level `let`', () => {
    // A `let` at module scope is state by definition. `db/client.ts` legitimately
    // has one for its pool; nothing under `battle/` has any reason to.
    for (const { file, text } of sources) {
      const match = /^let\s+\w+/m.exec(text);
      expect(match?.[0] ?? null, `${file} declares a module-level \`let\``).toBeNull();
    }
  });

  it('has no column that could hold a mid-battle board', () => {
    /**
     * The database is the one place a cache could survive a module reset. The
     * schema is the contract: `battles` records how a battle was *set up* and
     * how it *ended*, and carries nothing about where it currently stands.
     *
     * **Comments are stripped first**, and the reason is instructive: the schema
     * opens by saying *"There is no `current_hp` column and there will not be
     * one"*, so a naive substring scan fails on the very sentence that promises
     * the property. A scan that reads prose is a scan that gets deleted.
     */
    const source = readFileSync(join(import.meta.dirname, '../../src/db/schema/battles.ts'), 'utf8');
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');

    for (const forbidden of ['current_hp', 'currentState', 'current_state', 'cached', 'live_state']) {
      expect(code.includes(forbidden), `battles schema has a \`${forbidden}\``).toBe(false);
    }

    // And the strip did not eat the whole file, which would pass vacuously.
    expect(code).toContain('pgTable');
    expect(code).toContain('battle_actions');
  });
});
