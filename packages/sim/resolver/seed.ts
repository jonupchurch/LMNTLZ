/**
 * The seed. **Server only, and structurally unable to leave.**
 *
 * Constitution XII in one type. A careless `res.json(state)` cannot leak this,
 * because `toJSON()` throws rather than returning something — enforcement by
 * construction rather than by everybody remembering.
 */

import { randomBytes } from 'node:crypto';

declare const SEED: unique symbol;

export class SeedLeakError extends Error {
  constructor() {
    super(
      'A seed was about to be serialised. The seed never leaves the server ' +
        '(Constitution XII) — if you need to store it, call persistSeed from the ' +
        'repository function that writes the battle row.',
    );
    this.name = 'SeedLeakError';
  }
}

export interface Seed {
  readonly [SEED]: never;
  toJSON(): never;
  toString(): '[seed]';
}

/**
 * The 64-bit value, held **outside the object**.
 *
 * A private field would still be reachable through a debugger, a structured
 * clone, or anything that walks own properties. A `WeakMap` keyed on the seed
 * means the value is not part of the object at all: `Object.keys`,
 * `JSON.stringify`, `structuredClone` and a spread all see nothing.
 */
const VALUES = new WeakMap<object, bigint>();

const MASK64 = (1n << 64n) - 1n;

function makeSeed(value: bigint): Seed {
  const seed = {};

  /**
   * Non-enumerable, all three.
   *
   * `JSON.stringify` finds `toJSON` regardless of enumerability, so the throw
   * still fires — but `{...seed}` and `Object.keys(seed)` now yield genuinely
   * nothing. A spread into a response body is the accident this guards: it would
   * not have leaked the *value*, but it would have leaked that the field was
   * there to ask about.
   */
  Object.defineProperties(seed, {
    toJSON: {
      value: (): never => {
        throw new SeedLeakError();
      },
      enumerable: false,
    },
    toString: {
      value: (): '[seed]' => '[seed]',
      enumerable: false,
    },
    // So `console.log` and Node's inspector cannot print it either — a log line
    // is a leak too, and logs outlive the request that wrote them.
    [Symbol.for('nodejs.util.inspect.custom')]: {
      value: (): string => '[seed]',
      enumerable: false,
    },
  });

  VALUES.set(seed, value & MASK64);
  return Object.freeze(seed) as unknown as Seed;
}

/** Internal. Not exported from the package root. */
export function seedValue(seed: Seed): bigint {
  const value = VALUES.get(seed as unknown as object);
  if (value === undefined) {
    throw new Error('not a Seed — it was not created by createSeed or restoreSeed');
  }
  return value;
}

/**
 * **Takes no parameters, and the signature is the enforcement** (FR-007).
 *
 * There is nothing a client-supplied value could be passed as, so seed shopping
 * has no surface to attack: a player who abandons a battle and restarts gets a
 * fresh draw from the CSPRNG with no relationship to anything they controlled.
 */
export function createSeed(): Seed {
  const bytes = randomBytes(8);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return makeSeed(value);
}

/**
 * For persistence **only** (FR-008).
 *
 * Called from the single repository function that writes the battle row. Not
 * exported from `resolver/index.ts` — reaching it requires importing this module
 * by path, which is a deliberate act rather than an autocomplete.
 */
export function persistSeed(seed: Seed): Uint8Array {
  const value = seedValue(seed);
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) bytes[i] = Number((value >> BigInt((7 - i) * 8)) & 0xffn);
  return bytes;
}

export function restoreSeed(bytes: Uint8Array): Seed {
  if (bytes.length !== 8) {
    throw new Error(`a seed is 8 bytes, got ${bytes.length}`);
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return makeSeed(value);
}
