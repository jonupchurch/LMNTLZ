/**
 * The pre-send blocklist (014 T015, FR-011, Constitution XVIII).
 *
 * ### A slur list, **not a profanity filter**, and the distinction is the design
 *
 * A general profanity filter is wrong twice over. It **over-blocks** — players
 * swear at each other cheerfully and mean nothing by it, and a game that refuses
 * "damn" reads as contempt for the people playing it. And it **under-blocks** the
 * only thing worth stopping, because anyone determined to post a slur defeats a
 * naive matcher in one attempt while the ordinary player who typed "ass" in
 * "assassin" gets refused.
 *
 * So this list is short, it is aimed at the terms that are a category of harm
 * rather than a register of speech, and **everything else goes through and is
 * reviewed afterwards** by the classifier (feature 015). Two tiers, and only this
 * one gates.
 *
 * ### Why it runs before the charge
 *
 * A blocked message must cost nothing. Refunding is a second mechanism and a
 * second thing to get wrong, and a player who watched shards leave for a message
 * nobody received will not be reassured by a credit arriving later.
 *
 * ### Normalisation, and its limits, stated honestly
 *
 * Leetspeak and inserted punctuation are folded, because those are the two-second
 * evasions. **This will not stop a determined poster** and is not trying to —
 * that is what review is for. What it must do is make the obvious case
 * impossible, so a room is never one keystroke from something indefensible.
 */

/**
 * Folded for matching: lower-cased, common letter-for-symbol swaps undone, and
 * every non-letter dropped so `s.l.u.r` and `s-l-u-r` collapse together.
 */
export function fold(body: string): string {
  return body
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '');
}

/**
 * The terms that never reach a room.
 *
 * **Deliberately short.** Every addition is a decision to refuse a player mid
 * sentence, and the bar for that is a term whose *only* use is to attack somebody
 * for what they are. Anything arguable belongs to the classifier and a human, not
 * to a regex that cannot see context.
 *
 * Held folded, so the comparison is one operation and the list cannot drift out
 * of sync with `fold` — a list stored unfolded silently stops matching the day
 * somebody adds a normalisation rule.
 */
const BLOCKED_FOLDED: readonly string[] = Object.freeze(
  [
    // Racial and ethnic slurs.
    'nigger',
    'nigga',
    'chink',
    'gook',
    'spic',
    'kike',
    'wetback',
    'coon',
    // Sexuality and gender slurs.
    'faggot',
    'fag',
    'tranny',
    // Disability slurs.
    'retard',
  ].map(fold),
);

export interface BlocklistVerdict {
  readonly blocked: boolean;
  /** Which term matched. **Never returned to the sender**; for the audit log. */
  readonly term: string | null;
}

/**
 * Does this body contain a blocked term?
 *
 * **Substring matching on the folded text, deliberately.** Word boundaries do not
 * survive folding — every non-letter is gone, so there is nothing left to anchor
 * to — and a boundary-anchored match would miss the padded evasions this exists
 * for. The cost is a false positive on an innocent word that contains a slur, and
 * the list is curated with that cost in mind: nothing here is a common substring
 * of an ordinary English word.
 */
export function checkBlocklist(body: string): BlocklistVerdict {
  const folded = fold(body);
  const hit = BLOCKED_FOLDED.find((term) => term.length > 0 && folded.includes(term));
  return { blocked: hit !== undefined, term: hit ?? null };
}

/** FR-010. Long enough for a real thought, short enough that a wall is not one. */
export const MAX_BODY_LENGTH = 500;

export const isTooLong = (body: string): boolean => body.length > MAX_BODY_LENGTH;

/** An empty or whitespace-only message is not a message. */
export const isEmpty = (body: string): boolean => body.trim().length === 0;
