/**
 * A replay plays back what happened, and a balance patch cannot reach it
 * (008 T017, T023, SC-003, SC-004).
 *
 * ### TL;DR
 *
 * The design says a patch can never change a past battle's outcome. This proves it
 * the only way that means anything: **change the rules, then read the replay
 * again.** If it comes back identical, immutability is real rather than intended.
 *
 * ### Why the "no simulation runs" half is asserted structurally
 *
 * SC-004 asks that no simulation runs during playback. A timing assertion would be
 * flaky and a spy on the resolver would only cover the call it knew to watch. What
 * makes the claim true is that **the read path cannot reach a simulator at all** —
 * `read.ts` imports no resolver, no seed store and no `packet.ts`, so there is
 * nothing to call. That is checked here as a source assertion, which keeps holding
 * as the file grows.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { getReplay } from '../../src/replays/read.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from '../battle/live.js';

let a: Arena;
let started: StartedBattle;

beforeAll(async () => {
  a = await arena('playback');
  started = await start(a);
  const fought = await fightToTheEnd(a, started);
  expect(fought.conclusion).not.toBeNull();
}, 300_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('playback is verbatim', () => {
  it('serves the log to a participant', async () => {
    const result = await getReplay({
      battleId: started.battleId,
      requesterId: a.attacker.accountId,
    });

    expect(result.ok, `getReplay refused: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;

    expect(result.log.battleId).toBe(started.battleId);
    expect(result.log.events.length).toBeGreaterThan(0);
    expect(result.log.conclusion).toBeTruthy();
  });

  it('is byte-identical after the engine and content versions change under it', async () => {
    /**
     * ### The real test of immutability
     *
     * A patch is simulated the way a patch actually presents itself to this
     * module: the battle was fought under one `engine_version` and one
     * `content_version`, and now the record says something else. Feature 007's
     * `currentState` refuses to *re-derive* a battle whose stamps have moved — but
     * a replay is not re-derived, so nothing here should care.
     *
     * **That is the point.** If playback consulted the rules at all, a version
     * change would either break it or silently produce different events. Getting
     * the same bytes back is what proves the log is the authority.
     */
    const before = await getReplay({
      battleId: started.battleId,
      requesterId: a.attacker.accountId,
    });
    expect(before.ok).toBe(true);

    await db()
      .update(battleRecords)
      .set({ engineVersion: 'patched-engine-v99', contentVersion: 'patched-content-v99' })
      .where(eq(battleRecords.battleId, started.battleId));

    const after = await getReplay({
      battleId: started.battleId,
      requesterId: a.attacker.accountId,
    });

    expect(after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    /**
     * The **stored log** is what must be unchanged. Its own `engineVersion` field
     * came from the blob written at conclusion, so it still reports the engine the
     * battle was actually fought under — which is the honest answer and the one an
     * investigation needs.
     */
    expect(JSON.stringify(after.log)).toBe(JSON.stringify(before.log));
    expect(after.log.engineVersion).not.toBe('patched-engine-v99');
  });
});

describe('there is no re-simulation path (T023, SC-004)', () => {
  const source = readFileSync(join(import.meta.dirname, '../../src/replays/read.ts'), 'utf8');
  /**
   * Comments stripped first, for the reason `noStoredState.test.ts` learned the
   * hard way: this file's own doc block explains at length why it must not import
   * a resolver, so a naive scan fails on the sentence promising the property.
   */
  const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');

  it('imports nothing that could resolve a turn', () => {
    for (const forbidden of [
      '@lmntlz/sim/resolver',
      './packet.js',
      '../battle/packet.js',
      'seedStore',
      'resolveToNextChoice',
      'openingPacket',
      'buildInitialState',
    ]) {
      expect(code.includes(forbidden), `read.ts references ${forbidden}`).toBe(false);
    }
  });

  it('never reads the seed column', () => {
    /**
     * The seed is retained for investigation, not reconstruction. A read path that
     * loaded it would be one line away from the fallback somebody reaches for when
     * a replay has expired — and that fallback runs *today's* rules over
     * yesterday's inputs, which is exactly how a patch changes a past result.
     */
    expect(code.includes('seed')).toBe(false);
  });

  it('and the scan did not eat the file', () => {
    expect(code).toContain('getReplay');
    expect(code).toContain('listBattles');
  });
});
