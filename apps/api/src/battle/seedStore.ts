/**
 * The seed's only crossing between a `Seed` and the `battles.seed` column.
 *
 * **Two functions, one file, and that is the point.** Constitution XII says the
 * seed never leaves the server; the `Seed` type enforces it by throwing on
 * serialisation, which works precisely because nothing else can get at the
 * bytes. `@lmntlz/sim/resolver/persistence` is the only export that can, this is
 * the only importer of it, and `grep -r "resolver/persistence" apps/` is
 * therefore an exhaustive audit of the boundary.
 *
 * **Hex, not base64.** The column is `text` either way; hex is fixed-width at 16
 * characters, so a truncated or double-encoded value is visible by eye in a
 * `psql` session rather than being a plausible-looking string.
 */

import { persistSeed, restoreSeed } from '@lmntlz/sim/resolver/persistence';
import type { Seed } from '@lmntlz/sim/resolver';

/** 8 bytes → 16 hex characters. */
export function encodeSeed(seed: Seed): string {
  return [...persistSeed(seed)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CorruptSeedError extends Error {
  constructor(battleId: string) {
    super(
      `battle ${battleId} has an unreadable seed. It cannot be resolved or ` +
        'replayed, and no amount of retrying will change that.',
    );
    this.name = 'CorruptSeedError';
  }
}

export function decodeSeed(battleId: string, hex: string): Seed {
  if (!/^[0-9a-f]{16}$/.test(hex)) throw new CorruptSeedError(battleId);

  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return restoreSeed(bytes);
}
