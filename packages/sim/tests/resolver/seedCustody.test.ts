import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SeedLeakError, createSeed, persistSeed, restoreSeed } from '../../resolver/seed.js';
import { replay, replayEvents, resolveAction, resolveDefenderTurn } from '../../resolver/resolve.js';
import { toReplayLog } from '../../resolver/replay.js';
import {
  action,
  autoPower,
  battle,
  bytes,
  BATTLE_ID,
  fixedSeed,
  INERT_DEFENDER,
} from './fixtures.js';

/**
 * T019/T020 — **Constitution XII, by construction.**
 *
 * The claim is not "we are careful not to send the seed". It is that a careless
 * `res.json(state)` *cannot* send it, because the type has no serialised form.
 * Care is a thing people run out of on a Friday; a throwing `toJSON` is not.
 */
describe('a seed cannot be serialised', () => {
  const seed = createSeed();

  it('throws SeedLeakError from JSON.stringify', () => {
    expect(() => JSON.stringify(seed)).toThrow(SeedLeakError);
  });

  it('throws even when nested inside an innocent-looking payload', () => {
    // The realistic accident: somebody attaches it "just for debugging".
    expect(() => JSON.stringify({ battleId: BATTLE_ID, debug: { seed } })).toThrow(SeedLeakError);
    expect(() => JSON.stringify([1, 2, seed])).toThrow(SeedLeakError);
  });

  it('reveals nothing through toString', () => {
    expect(String(seed)).toBe('[seed]');
    expect(`${String(seed)}`).toBe('[seed]');
  });

  it('reveals nothing through Node’s inspector either', () => {
    // console.log goes through inspect, and a log line is a leak too.
    expect(inspect(seed)).toBe('[seed]');
  });

  it('exposes no enumerable value — the bytes are not on the object at all', () => {
    expect(Object.keys(seed)).toEqual([]);
    expect(Object.values(seed)).toEqual([]);
    expect(JSON.stringify({ ...seed })).toBe('{}');
    expect(Object.getOwnPropertyNames(seed).filter((k) => k !== 'toJSON' && k !== 'toString')).toEqual([]);
  });

  it('survives a persist/restore round trip exactly', () => {
    const restored = restoreSeed(persistSeed(seed));
    expect(persistSeed(restored)).toEqual(persistSeed(seed));
  });

  it('rejects a wrong-length restore rather than padding it', () => {
    expect(() => restoreSeed(new Uint8Array(4))).toThrow(/8 bytes/);
  });
});

/**
 * The stronger claim: **nothing the resolver returns contains seed material.**
 *
 * Asserted by searching the serialised output for the seed's own bytes, in
 * several encodings — so this catches a leak that arrived as a number, a string,
 * or a hex blob, not just one typed as `Seed`.
 */
describe('no returned value carries seed material', () => {
  const seed = fixedSeed();
  const initial = battle();
  const log = [action(1), action(2), action(3)];

  const seedBytes = persistSeed(seed);
  const encodings = [
    Buffer.from(seedBytes).toString('hex'),
    Buffer.from(seedBytes).toString('base64'),
    [...seedBytes].join(','),
    BigInt(`0x${Buffer.from(seedBytes).toString('hex')}`).toString(10),
  ];

  const containsSeed = (value: unknown): string | null => {
    const serialised = bytes(value);
    for (const encoding of encodings) {
      if (encoding.length >= 8 && serialised.includes(encoding)) return encoding;
    }
    return null;
  };

  it('is clean for replay', () => {
    expect(containsSeed(replay(seed, initial, log))).toBeNull();
  });

  it('is clean for replayEvents', () => {
    expect(containsSeed(replayEvents(seed, initial, log))).toBeNull();
  });

  it('is clean for resolveAction, including the appended action', () => {
    const result = resolveAction(
      seed,
      initial,
      log,
      { sequence: 4, actorInstanceId: 'a0', powerId: action(1).powerId, targetInstanceId: 'd0' },
      BATTLE_ID,
    );
    expect(containsSeed(result)).toBeNull();
  });

  /**
   * The defender's power is **derived from the defender**, not written out.
   *
   * It was the literal `'Open Line'` — Kaellis's tier 0, correct only for as long
   * as the fixture's default defender happened to be Kaellis. Changing that
   * default threw `hero "h22" has no power "Open Line"` from a test about seed
   * custody, which is a failure that says nothing about what it was testing.
   */
  it('is clean for resolveDefenderTurn', () => {
    const result = resolveDefenderTurn(
      seed,
      initial,
      log,
      () => ({
        sequence: 4,
        actorInstanceId: 'd0',
        powerId: autoPower(INERT_DEFENDER),
        targetInstanceId: 'a0',
      }),
      BATTLE_ID,
    );
    expect(containsSeed(result)).toBeNull();
  });

  it('is clean for the replay artifact, which also carries no draw indices', () => {
    const { events, state } = replayEvents(seed, initial, log);
    const artifact = toReplayLog(
      seed,
      { battleId: BATTLE_ID, engineVersion: 'e0.1.0', contentVersion: 'c-test' },
      events,
      null,
    );

    expect(containsSeed(artifact)).toBeNull();
    expect(bytes(artifact)).not.toContain('drawIndexBefore');
    expect(bytes(artifact)).not.toContain('drawsConsumed');
    expect(state).toBeDefined();
  });
});

/**
 * T020 — **the structural scan, so this fails the day somebody adds a debug field.**
 *
 * The tests above check the values a specific call produces. This checks the
 * *shape of the module*: no exported function may return something typed as a
 * `Seed`, and the persistence pair must stay off the package root.
 */
describe('the module surface', () => {
  const indexSource = readFileSync(
    fileURLToPath(new URL('../../resolver/index.ts', import.meta.url)),
    'utf8',
  );

  it('does not re-export persistSeed or restoreSeed from the package root', () => {
    // FR-005, FR-008. Reaching them means importing ./seed.js by path — a
    // deliberate act rather than an autocomplete.
    const code = indexSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/export\s*\{[^}]*persistSeed/);
    expect(code).not.toMatch(/export\s*\{[^}]*restoreSeed/);
  });

  it('declares no return type transitively containing Seed', () => {
    const resolverDir = fileURLToPath(new URL('../../resolver/', import.meta.url));

    for (const file of ['resolve.ts', 'replay.ts']) {
      const source = readFileSync(`${resolverDir}${file}`, 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

      // A return annotation mentioning Seed, or an interface field of that type.
      expect(code, `${file} returns a Seed`).not.toMatch(/\)\s*:\s*[^;{]*\bSeed\b/);
      expect(code, `${file} has a Seed-typed field`).not.toMatch(/readonly\s+\w+\s*:\s*Seed\b/);
    }
  });

  it('keeps createSeed’s parameter list empty — the signature is the enforcement', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../resolver/seed.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toMatch(/export function createSeed\(\)\s*:\s*Seed/);
    expect(createSeed.length).toBe(0);
  });
});
