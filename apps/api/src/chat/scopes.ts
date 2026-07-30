/**
 * The six scopes, their audiences and their retention (014 T009, T047).
 *
 * ### There is no league-scoped chat, and that is a decision (T010, FR-004)
 *
 * Promotion is one-way and permanent. A league room would therefore **eject a
 * player from their own conversations as a consequence of gearing up** — turning
 * the currency the whole game is built on into a social cost, and giving the best
 * players a reason to stop climbing. It is not missing; it is refused.
 *
 * ### Global and Guild Ads carry a `lang` slot that resolves to one room
 *
 * FR-002 splits both by language. **Deferred 2026-07-30**: there is no language
 * data anywhere in the game — `profiles/publicProfile.ts` says so outright, and
 * satisfying FR-002 would mean a column, a route and a settings control bought
 * for a benefit that is invisible until Global is busy enough to need splitting.
 * At that point the room needs a **cap** too, which is a separate open question.
 *
 * The slot is in the key from the first row ever written, so turning the split on
 * later is a data migration and a changed default rather than a rename of every
 * channel, every token and every stored message. `ALL_LANGUAGES` is the one
 * constant to replace.
 */

/** The single room every Global and Guild Ads subscriber lands in, for now. */
export const ALL_LANGUAGES = 'all';

export const SCOPE_KINDS = ['global', 'guild', 'direct', 'admin', 'ads', 'beginner'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * How long a scope's history is kept, in days.
 *
 * **Direct is the longest, and it is the longest for a reason**: it is the
 * evidence channel. Harassment, scams and grooming happen where nobody else can
 * see, and a report filed a fortnight later is worthless if the messages are
 * gone. Admin is permanent because it is our own record of our own decisions.
 */
export const RETENTION_DAYS: Readonly<Record<ScopeKind, number | null>> = Object.freeze({
  global: 7,
  ads: 7,
  beginner: 7,
  guild: 30,
  direct: 90,
  admin: null,
});

export const scopeKindOf = (scope: string): ScopeKind | null => {
  const head = scope.split(':')[0];
  return SCOPE_KINDS.find((k) => k === head) ?? null;
};

export const globalScope = (lang: string = ALL_LANGUAGES): string => `global:${lang}`;
export const adsScope = (lang: string = ALL_LANGUAGES): string => `ads:${lang}`;
export const guildScope = (guildId: string): string => `guild:${guildId}`;
export const beginnerScope = (): string => 'beginner';
export const adminScope = (): string => 'admin';

/**
 * A direct scope, **canonical in the pair rather than in who spoke first**.
 *
 * Sorted, so both participants compute the same key from their own point of view.
 * Without that, A→B and B→A are two rooms holding half a conversation each, and
 * the evidence channel loses exactly the half that was reported.
 */
export function directScope(a: string, b: string): string {
  const [first, second] = a <= b ? [a, b] : [b, a];
  return `direct:${first}:${second}`;
}

/** Every scope a Global/Ads reader is in today — exactly one room each. */
export const globalRooms = (): readonly string[] => [globalScope(), adsScope()];
