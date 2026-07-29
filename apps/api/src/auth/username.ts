/**
 * Usernames: the display form, the uniqueness key, and why they are two things.
 *
 * ### The key is lossy on purpose and is never shown to anybody
 *
 * `username` is stored **exactly as the player typed it**, NFC-normalised and
 * nothing more. `usernameKey` is a skeleton used only to answer "is this name
 * taken?", and the two are never reconstructed from one another. Rendering the
 * key back would show a player a name they did not choose.
 *
 * That matters when you read one. `admin` keys to **`adrnin`**, because the
 * confusables table maps `m` and `rn` to each other — `rn` genuinely does look
 * like `m` in most typefaces. It looks like a bug and is not: the mapping is
 * *consistent*, which is the only property a collision key needs, and nobody
 * ever sees it.
 *
 * ### Three steps, and the third is the security control
 *
 * ```
 * 1  NFKD normalise, strip combining marks   "Ｒéyna" → "Reyna"
 * 2  case-fold                                "Reyna" → "reyna"
 * 3  confusable skeleton (Unicode TR39)       "rеynа" → "reyna"   ← Cyrillic е, а
 * ```
 *
 * Steps 1 and 2 are hygiene: a case-insensitive collision is a support ticket.
 * **Step 3 is a security control**, because a homoglyph collision is an
 * impersonation vector — and this game has guild masters, an officer role and
 * public profiles. *"The guild master is asking you to hand over the emblem"* is
 * a live attack the moment somebody can register a Cyrillic lookalike of the
 * guild master's name.
 *
 * A plain lowercase comparison passes every other case in the test table and
 * fails exactly the two that matter.
 */

import { rectifyConfusion } from 'unicode-confusables';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/**
 * Unicode letters, digits and `_`. **Not a space and not a hyphen.**
 *
 * > **A contradiction in the spec, resolved here.** T035 asks for
 * > `"Reyna Two-Rivers"` to survive a round trip, and research.md Q3 fixes the
 * > character set as "Unicode letters, digits, and `_`" — which forbids both the
 * > space and the hyphen in that very example. The character set is the
 * > *decision*; the name was an illustration borrowed from the roster. The
 * > decision wins, and the round-trip property is unaffected: it is about the
 * > display form surviving unfolded, which `Reyna_TwoRivers` demonstrates
 * > equally well.
 */
const ALLOWED = /^[\p{L}\p{N}_]+$/u;

export type UsernameRejection =
  | 'too-short'
  | 'too-long'
  | 'charset'
  | 'leading-underscore'
  | 'trailing-underscore'
  | 'doubled-underscore'
  | 'reserved';

/**
 * The uniqueness key. Lossy, internal, never rendered.
 *
 * Order is load-bearing: NFKD before case-folding, because a combining mark can
 * survive a `toLowerCase` and change the skeleton; and the confusable pass last,
 * because it expects the plain letters the first two steps produce. The
 * confusables table does not itself do NFKD, so `Ｒéyna` reaches it as `reyna`
 * only because step 1 ran first.
 */
export function usernameKey(display: string): string {
  const folded = display
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining marks left by the decomposition
    .toLowerCase();

  return rectifyConfusion(folded);
}

/** Stored display form: exactly as typed, NFC. Nothing else is changed. */
export function displayForm(input: string): string {
  return input.normalize('NFC');
}

/**
 * Reserved names, **run through `usernameKey` at module load — or they reserve
 * nothing.**
 *
 * That is the whole trick. Reserving the literal string `admin` while comparing
 * folded keys means `Admin`, `ADMIN` and the Cyrillic `аdmin` all sail past the
 * list and land in the unique index, where they do not collide with anything
 * because no account named `admin` exists. The list has to live in the same
 * space as the comparison.
 */
const RESERVED_SOURCES = [
  'admin',
  'moderator',
  'mod',
  'system',
  'lmntlz',
  'support',
  'staff',
  'envoy',
  'official',
] as const;

const RESERVED = new Set(RESERVED_SOURCES.map(usernameKey));

/**
 * **The 12 House names and the 27 hero names are deliberately NOT reserved.**
 *
 * They are flavor, players will want them, and the impersonation risk is nil —
 * nobody is socially engineered by a player called Bramwen. Reserving them would
 * cost goodwill on day one to prevent an attack that does not exist.
 */
export function isReserved(key: string): boolean {
  return RESERVED.has(key);
}

export function validateUsername(display: string): UsernameRejection | null {
  const value = displayForm(display);
  const length = [...value].length; // code points, so an emoji is one character

  if (length < USERNAME_MIN) return 'too-short';
  if (length > USERNAME_MAX) return 'too-long';
  if (!ALLOWED.test(value)) return 'charset';
  if (value.startsWith('_')) return 'leading-underscore';
  if (value.endsWith('_')) return 'trailing-underscore';
  if (value.includes('__')) return 'doubled-underscore';
  if (isReserved(usernameKey(value))) return 'reserved';

  return null;
}

/**
 * 3 changes per 30 days, **regardless of shards** (T041).
 *
 * Not an anti-spend measure — a player who wants to pay for a fourth is still
 * refused. A name that changes hourly defeats every human-scale mechanism that
 * depends on recognising an opponent: the Battle Record, remembering who you
 * keep losing to, and moderation reports naming somebody who no longer exists
 * under that name.
 */
export const RENAMES_PER_WINDOW = 3;
export const RENAME_WINDOW_DAYS = 30;

/**
 * What a voluntary rename costs, in shards (feature 010's ledger).
 *
 * **The first change is free** — a new account is created with a generated
 * placeholder, so charging for the first real name would be charging somebody
 * to undo something we did to them. A **moderation-forced** rename is also free
 * (feature 015): the player did not choose it.
 */
export const RENAME_COST_SHARDS = 325;

/** Why a collision was refused — surfaced so the player knows what to change. */
export type CollisionRule = 'exact' | 'case' | 'confusable';

/**
 * Which rule made two names collide.
 *
 * The distinction is the whole value of the `409`. *"Taken"* tells a player
 * nothing; *"that reads the same as an existing name"* tells them their Cyrillic
 * `е` is doing something they did not intend — which they cannot possibly see by
 * looking at it.
 */
export function collisionRule(attempted: string, existing: string): CollisionRule {
  if (attempted === existing) return 'exact';
  if (attempted.toLowerCase() === existing.toLowerCase()) return 'case';
  return 'confusable';
}

/**
 * A username for an account that has just been created and has not chosen one.
 *
 * **Generated from the ASCII alphabet only**, so it cannot itself be confusable
 * with anything and needs no collision retry beyond the unique index. The player
 * gets one free rename, so this is a placeholder rather than a name.
 *
 * `Envoy` is reserved and this deliberately does not use it or any other word —
 * a generated name that reads like a real one invites somebody to keep it.
 */
export function generatedUsername(random: () => string): string {
  return `Player_${random().slice(0, 8)}`;
}
